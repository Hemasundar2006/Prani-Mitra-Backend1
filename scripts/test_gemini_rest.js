const fetch = require('node-fetch');
require('dotenv').config();

const API_KEY = process.env.GEMINI_API_KEY || 'YOUR_API_KEY';
const MODEL_NAME = 'gemini-1.5-flash'; // Or gemini-pro

const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;

const payload = {
    contents: [
        {
            parts: [
                {
                    text: "Explain how to care for a sick cow in rural India."
                }
            ]
        }
    ]
};

console.log('🚀 Testing Gemini REST API...');
console.log(`URL: ${url.replace(API_KEY, 'HIDDEN_KEY')}`);
console.log('Method: POST');

async function testGemini() {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
        }

        const data = await response.json();
        console.log('✅ Success! Response:');
        console.log(JSON.stringify(data, null, 2));

        if (data.candidates && data.candidates[0].content) {
            console.log('\n📝 Generated Text:');
            console.log(data.candidates[0].content.parts[0].text);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testGemini();
