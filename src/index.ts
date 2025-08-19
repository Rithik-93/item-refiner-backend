import AIService from "./aiService";
import { getItems } from "./zoho";
import { getPromptText } from "./prompt";
import fs from 'fs';
import * as XLSX from 'xlsx';

function exportToExcel(duplicateData: any, items: any[]) {
    const workbook = XLSX.utils.book_new();
    
    // Create summary sheet
    const summaryData = [
        ['Duplicate Detection Summary'],
        [''],
        ['Total Items Analyzed', items.length],
        ['Duplicate Groups Found', duplicateData.duplicates.length],
        ['Total Duplicate Items', duplicateData.duplicates.reduce((sum: number, group: any) => sum + group.items.length, 0)],
        [''],
        ['Generated on', new Date().toLocaleString()]
    ];
    
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
    
    // Create detailed duplicates sheet
    const duplicateRows = [
        ['Group ID', 'Item Name', 'Rate', 'Unit', 'Confidence Score', 'Reason']
    ];
    
    duplicateData.duplicates.forEach((group: any, groupIndex: number) => {
        group.items.forEach((item: any) => {
            duplicateRows.push([
                `Group ${groupIndex + 1}`,
                item.item_name || '',
                item.rate !== undefined ? item.rate : '',
                item.unit || '',
                group.confidence_score || '',
                group.reason || ''
            ]);
        });
        // Add empty row between groups for readability
        if (groupIndex < duplicateData.duplicates.length - 1) {
            duplicateRows.push(['', '', '', '', '', '']);
        }
    });
    
    const duplicatesSheet = XLSX.utils.aoa_to_sheet(duplicateRows);
    XLSX.utils.book_append_sheet(workbook, duplicatesSheet, 'Duplicates');
    
    // Create all items sheet for reference
    const itemRows = [
        ['Item Name', 'Rate', 'Unit']
    ];

    console.log(items[2], "------------------------------------");
    
    items.forEach(item => {
        itemRows.push([
            item.item_name || '',
            item.rate !== undefined ? item.rate : '',
            item.unit || ''
        ]);
    });
    
    const itemsSheet = XLSX.utils.aoa_to_sheet(itemRows);
    XLSX.utils.book_append_sheet(workbook, itemsSheet, 'All Items');
    
    // Save the Excel file
    const filename = `duplicate_results_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, filename);
    
    return filename;
}

async function detectDuplicates() {
    try {
        const items = await getItems();
        
        if (!items || items.length === 0) {
            console.error('No items retrieved from Zoho. Please check your API credentials.');
            return;
        }
        
        fs.writeFileSync('items.json', JSON.stringify(items, null, 2));
        const aiService = new AIService();
        const result = await aiService.analyzeItems(getPromptText(items));
        
        if (result?.candidates?.[0]?.content?.parts?.[0]?.text) {
            const duplicateData = JSON.parse(result.candidates[0].content.parts[0].text);
            console.log('\n=== DUPLICATE DETECTION RESULTS ===');
            console.log(`Found ${duplicateData.duplicates.length} duplicate groups in ${items.length} items`);
            
            // Export to Excel
            const filename = exportToExcel(duplicateData, items);
            console.log(`\nResults exported to Excel: ${filename}`);
            
            // Also keep a backup JSON for debugging if needed
            fs.writeFileSync('duplicate_results_backup.json', JSON.stringify(duplicateData, null, 2));
            
        } else {
            console.log('No duplicate data found in response');
        }
    } catch (error) {
        console.error('Application error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

detectDuplicates();