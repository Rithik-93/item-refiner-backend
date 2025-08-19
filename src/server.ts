import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import AIService from "./aiService";
import { getItems, setupZohoAuth } from "./zoho";
import { getPromptText } from "./prompt";
import * as XLSX from 'xlsx';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store for processing status
const processingStatus = new Map<string, {
  status: 'processing' | 'completed' | 'error';
  progress?: string;
  error?: string;
  filename?: string;
}>();

function extractJson(text: string): string | null {
    const jsonRegex = /```(json)?\s*([\s-S]*?)\s*```/;
    const match = text.match(jsonRegex);
    if (match && match[2]) {
        return match[2].trim();
    }
    return text.trim();
}

function exportToExcel(duplicateData: any, items: any[], orgId: string) {
    const workbook = XLSX.utils.book_new();
    
    // Create a lookup map for item rates and units
    const itemDetailsMap = new Map<string, { rate: string; unit: string }>();
    items.forEach(item => {
        if (item.item_name) {
            itemDetailsMap.set(item.item_name, {
                rate: item.rate || '0',
                unit: item.unit || ''
            });
        }
    });

    const summaryData = [
        ['Duplicate Detection Summary'],
        [''],
        ['Organization ID', orgId],
        ['Total Items Analyzed', items.length],
        ['Duplicate Groups Found', duplicateData.duplicates.length],
        ['Total Duplicate Items', duplicateData.duplicates.reduce((sum: number, group: any) => sum + group.items.length, 0)],
        [''],
        ['Generated on', new Date().toLocaleString()]
    ];
    
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
    
    const duplicateRows = [
        ['Group ID', 'Item Name', 'Rate', 'Unit', 'Confidence Score', 'Reason']
    ];
    
    duplicateData.duplicates.forEach((group: any, groupIndex: number) => {
        group.items.forEach((item: any) => {
            const details = itemDetailsMap.get(item.item_name) || { rate: '0', unit: '' };
            duplicateRows.push([
                `Group ${groupIndex + 1}`,
                item.item_name || '',
                details.rate,
                details.unit,
                group.confidence_score || '',
                group.reason || ''
            ]);
        });
        if (groupIndex < duplicateData.duplicates.length - 1) {
            duplicateRows.push(['', '', '', '', '', '']);
        }
    });
    
    const duplicatesSheet = XLSX.utils.aoa_to_sheet(duplicateRows);
    XLSX.utils.book_append_sheet(workbook, duplicatesSheet, 'Duplicates');
    
    const itemRows = [
        ['Item Name', 'Rate', 'Unit']
    ];
    
    items.forEach(item => {
        itemRows.push([
            item.item_name || '',
            item.rate || '0',
            item.unit || ''
        ]);
    });
    
    const itemsSheet = XLSX.utils.aoa_to_sheet(itemRows);
    XLSX.utils.book_append_sheet(workbook, itemsSheet, 'All Items');
    
    // Save the Excel file
    const filename = `duplicate_results_${orgId}_${new Date().toISOString().split('T')[0]}_${Date.now()}.xlsx`;
    const filepath = path.join('public', filename);
    
    // Ensure public directory exists
    if (!fs.existsSync('public')) {
        fs.mkdirSync('public');
    }
    
    XLSX.writeFile(workbook, filepath);
    
    return filename;
}

async function processInBatches(items: any[], batchSize: number, aiService: AIService, orgId: string, requestId: string) {
    const allDuplicates: any[] = [];
    const totalItems = items.length;
    let processedItems = 0;

    for (let i = 0; i < totalItems; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        processingStatus.set(requestId, {
            status: 'processing',
            progress: `Analyzing batch ${i / batchSize + 1} of ${Math.ceil(totalItems / batchSize)} (${batch.length} items)...`
        });

        const result = await aiService.analyzeItems(getPromptText(batch));

        if (result?.candidates?.[0]?.content?.parts?.[0]?.text) {
            const rawText = result.candidates[0].content.parts[0].text;
            const jsonText = extractJson(rawText);

            if (jsonText) {
                try {
                    const batchData = JSON.parse(jsonText);
                    if (batchData.duplicates && Array.isArray(batchData.duplicates)) {
                        allDuplicates.push(...batchData.duplicates);
                    }
                } catch (jsonError) {
                    console.error(`JSON parsing error for batch ${i / batchSize + 1}:`, jsonError);
                    // Optionally, save the error response for this batch
                }
            }
        }
        processedItems += batch.length;
    }

    return { duplicates: allDuplicates };
}

async function processDetection(orgId: string, requestId: string) {
    try {
        processingStatus.set(requestId, { status: 'processing', progress: 'Fetching items from Zoho...' });
        
        const items = await getItems(orgId);
        
        if (!items || items.length === 0) {
            processingStatus.set(requestId, { 
                status: 'error', 
                error: 'No items retrieved from Zoho. Please check your API credentials and organization ID.' 
            });
            return;
        }
        
        const BATCH_SIZE = 1000;
        const aiService = new AIService();

        if (items.length > 2500) {
            processingStatus.set(requestId, { status: 'processing', progress: `Batch processing ${items.length} items...` });
            
            const duplicateData = await processInBatches(items, BATCH_SIZE, aiService, orgId, requestId);

            processingStatus.set(requestId, { status: 'processing', progress: 'Generating final Excel report...' });
            
            const filename = exportToExcel(duplicateData, items, orgId);
            
            const jsonFilename = `duplicate_results_${orgId}_${Date.now()}.json`;
            fs.writeFileSync(path.join('public', jsonFilename), JSON.stringify(duplicateData, null, 2));
            
            processingStatus.set(requestId, { 
                status: 'completed', 
                filename: filename,
                progress: `Found ${duplicateData.duplicates.length} duplicate groups in ${items.length} items`
            });
            return filename;

        } else {
            processingStatus.set(requestId, { status: 'processing', progress: `Analyzing ${items.length} items with AI...` });
            
            const result = await aiService.analyzeItems(getPromptText(items));
            
            if (result?.candidates?.[0]?.content?.parts?.[0]?.text) {
                processingStatus.set(requestId, { status: 'processing', progress: 'Generating Excel report...' });
                
                const rawText = result.candidates[0].content.parts[0].text;
                const jsonText = extractJson(rawText);

                if (!jsonText) {
                    processingStatus.set(requestId, {
                        status: 'error',
                        error: 'Could not extract JSON from AI response'
                    });
                    return;
                }

                try {
                    const duplicateData = JSON.parse(jsonText);
                    const filename = exportToExcel(duplicateData, items, orgId);
                    
                    const jsonFilename = `duplicate_results_${orgId}_${Date.now()}.json`;
                    fs.writeFileSync(path.join('public', jsonFilename), JSON.stringify(duplicateData, null, 2));
                    
                    processingStatus.set(requestId, { 
                        status: 'completed', 
                        filename: filename,
                        progress: `Found ${duplicateData.duplicates.length} duplicate groups in ${items.length} items`
                    });
                    return filename;

                } catch (jsonError) {
                    console.error('JSON parsing error:', jsonError);
                    const errorResponseFilename = `error_response_${Date.now()}.txt`;
                    fs.writeFileSync(path.join('public', errorResponseFilename), rawText);
                    
                    processingStatus.set(requestId, { 
                        status: 'error', 
                        error: 'Failed to parse JSON from AI response' 
                    });
                }
                
            } else {
                processingStatus.set(requestId, { 
                    status: 'error', 
                    error: 'No duplicate data found in AI response' 
                });
            }
        }
    } catch (error) {
        console.error('Processing error:', error instanceof Error ? error.message : String(error));
        processingStatus.set(requestId, { 
            status: 'error', 
            error: error instanceof Error ? error.message : String(error) 
        });
    }
}

app.post('/api/setup-zoho', async (req, res) => {
    try {
        const { clientId, clientSecret, grantToken, organizationId } = req.body;
        
        if (!clientId || !clientSecret || !grantToken || !organizationId) {
            return res.status(400).json({ 
                error: 'All fields are required: clientId, clientSecret, grantToken, organizationId' 
            });
        }
        
        await setupZohoAuth(clientId, clientSecret, grantToken, organizationId);
        
        res.json({ 
            message: 'Zoho authentication setup completed successfully!',
            note: 'Token file zoho_tokens.json has been created. You can now use the duplicate detection API.'
        });
        
    } catch (error) {
        console.error('Setup error:', error instanceof Error ? error.message : String(error));
        res.status(500).json({ 
            error: 'Setup failed', 
            details: error instanceof Error ? error.message : String(error) 
        });
    }
});

app.post('/api/detect-duplicates', async (req, res) => {
    try {
        const { organizationId } = req.body;
        
        if (!organizationId) {
            return res.status(400).json({ error: 'Organization ID is required' });
        }
        
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const filename = await processDetection(organizationId, requestId);
        
        if (filename) {
            res.json({ 
                message: 'Processing completed successfully.',
                filename: filename
            });
        } else {
            const status = processingStatus.get(requestId) || { error: 'An unknown error occurred' };
            res.status(500).json({ error: status.error });
        }
        
    } catch (error) {
        console.error('API error:', error instanceof Error ? error.message : String(error));
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/status/:requestId', (req, res) => {
    const { requestId } = req.params;
    const status = processingStatus.get(requestId);
    
    if (!status) {
        return res.status(404).json({ error: 'Request not found' });
    }
    
    res.json(status);
});

// Download endpoint
app.get('/api/download/:filename', (req, res) => {
    const { filename } = req.params;
    const filepath = path.join(__dirname, '..', 'public', filename);
    
    if (!fs.existsSync(filepath)) {
        return res.status(404).json({ error: 'File not found' });
    }
    
    res.download(filepath, filename, (err) => {
        if (err) {
            console.error('Download error:', err instanceof Error ? err.message : String(err));
            res.status(500).json({ error: 'Download failed' });
        } else {
            // Cleanup: delete the Excel file after download
            fs.unlink(filepath, (unlinkErr) => {
                if (unlinkErr) {
                    console.error('Failed to delete Excel file:', unlinkErr);
                }
            });

            // Cleanup: delete the corresponding JSON file
            const jsonFilename = filename.replace('.xlsx', '.json');
            const jsonFilepath = path.join(__dirname, '..', 'public', jsonFilename);
            if (fs.existsSync(jsonFilepath)) {
                fs.unlink(jsonFilepath, (unlinkErr) => {
                    if (unlinkErr) {
                        console.error('Failed to delete JSON file:', unlinkErr);
                    }
                });
            }
        }
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files from public directory
app.use('/files', express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
    console.log(`🚀 Duplicate Detection Server running on http://localhost:${PORT}`);
    console.log(`📊 API endpoints:`);
    console.log(`   POST /api/setup-zoho - Create/update zoho_tokens.json`);
    console.log(`   POST /api/detect-duplicates - Start duplicate detection`);
    console.log(`   GET  /api/status/:requestId - Check processing status`);
    console.log(`   GET  /api/download/:filename - Download Excel file`);
    console.log(`   GET  /api/health - Health check`);
});

export default app;
