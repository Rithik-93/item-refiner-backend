import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

class AIService {
    private apiKey: string;
    private baseUrl: string;
    private timeout: number;

    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY || '';
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent';
        this.timeout = 2000000;
    }

    async analyzeItems(prompt: string) {
        console.log('Analyzing items...');
        fs.writeFileSync('prompt.txt', prompt);

        try {
            
            const requestBody = {
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: 0.1,
                    topK: 1,
                    topP: 1,
                    responseMimeType: "application/json",
                    maxOutputTokens: 200000
                }
            };
    
            const response = await axios.post(
                `${this.baseUrl}?key=${this.apiKey}`,
                requestBody,
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: this.timeout
                }
            );
            
            return response.data;
    
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const errorMsg = error.response?.data?.error?.message || error.message;
                const statusCode = error.response?.status;
                console.error(`AI Service Error (${statusCode}): ${errorMsg}`);
            } else {
                console.error('Error analyzing items:', error instanceof Error ? error.message : String(error));
            }
            throw error;
        }
    }
}

export default AIService;