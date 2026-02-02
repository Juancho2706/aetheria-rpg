const { GoogleGenAI } = require("@google/genai");
const fs = require('fs');
const path = require('path');

// Load env
try {
    const envPath = path.resolve(__dirname, '../.env.local');
    const envConfig = fs.readFileSync(envPath, 'utf8');
    for (const line of envConfig.split('\n')) {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    }
} catch (e) {
    console.warn("Could not load .env.local", e);
}

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.error("No API KEY found!");
    process.exit(1);
}

async function listModels() {
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    try {
        console.log("Fetching models...");
        // Accessing the models endpoint directly if possible or checking the client capabilities
        // The @google/genai 0.x/1.x might differ. 
        // Based on docs, it might be ai.models.list()

        const response = await ai.models.list();

        // This might return an async iterator or a response object
        console.log("Models found:");
        for await (const model of response) {
            console.log(`- ${model.name} (${model.displayName})`);
            console.log(`  Methods: ${model.supportedGenerationMethods?.join(', ') || 'N/A'}`);
        }
    } catch (error) {
        console.error("Error listing models:", error);
    }
}

listModels();
