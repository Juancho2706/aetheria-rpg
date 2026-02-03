'use server'

import { GoogleGenAI, Content, Part } from "@google/genai";
import { Message, Character, DmStateUpdate } from "@/types";

const API_KEY = process.env.GEMINI_API_KEY!;
// Text model: Gemini 2.5 Flash Lite (Stable, fast)
const TEXT_MODEL_NAME = 'gemini-2.5-flash-lite';


// ... (rest of imports)

/*
export async function generateImageAction(prompt: string): Promise<string | null> {
    const ai = getAI();
    try {
        console.log(`Generating image with model: ${IMAGE_MODEL_NAME} for prompt: ${prompt.substring(0, 50)}...`);
        // Sanitize prompt to help pass safety filters
        const safePrompt = prompt
            .replace(/rage/gi, "intensity")
            .replace(/kill/gi, "defeat")
            .replace(/blood/gi, "red")
            .replace(/violent/gi, "powerful");

        const response = await ai.models.generateContent({
            model: IMAGE_MODEL_NAME,
            // Prepend "Generate an image of" to hint image mode
            contents: [{ role: 'user', parts: [{ text: `Generate an image of ${safePrompt}` }] }],
            config: {
                safetySettings: [
                    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                ],
            }
        });

        const candidates = response.candidates;
        // console.log("Image Gen Response Candidates:", JSON.stringify(candidates, null, 2));

        if (candidates && candidates[0]?.content?.parts) {
            for (const part of candidates[0].content.parts) {
                if (part.inlineData) {
                    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                }
            }
        }

        console.warn("Image Gen: No inlineData found in response. Full Response:", JSON.stringify(response, null, 2));

        // Fallback: Check if it returned text instead
        const textPart = candidates?.[0]?.content?.parts?.find(p => p.text);
        if (textPart && textPart.text) {
            return `ERROR: Model returned text instead of image: "${textPart.text.substring(0, 100)}..."`;
        }

        return `ERROR: No image data received.`;
    } catch (error: any) {
        console.error("Image Gen Error:", error);
        return `ERROR: ${error.message}`;
    }
}
*/

const DM_SYSTEM_INSTRUCTION = `
You are the Dungeon Master (DM) for a Dungeons & Dragons 5th Edition game. 
Your goal is to provide an immersive, text-based RPG experience.

IMPORTANT: YOU MUST RESPOND ONLY IN SPANISH.

RULES:
1. Act as the narrator and referee. Describe the environment, NPCs, and outcomes of actions.
2. Be descriptive but concise. Avoid wall-of-text.
3. Adhere to D&D 5e rules for combat and skill checks. 
4. If a player attempts something risky, ask them to roll a specific check.
5. Manage the health, status, and **inventory** of the party based on the narrative.
6. **Multiplayer Turn Resolution**: You will receive a list of actions from multiple characters. Resolve them simultaneously or in logical initiative order, then describe the collective outcome.

CRITICAL OUTPUT FORMAT:
Your response must be natural text for the story in SPANISH.
However, at the very end of your response, you MUST include a JSON block wrapped in \`\`\`json\`\`\` to update the game interface state.
The JSON block should match this schema:
{
  "hpUpdates": { "CharacterName": number }, // The NEW total HP value, not the change.
  "inventoryUpdates": { "CharacterName": ["item1", "item2"] }, // The NEW, complete list of items for the character.
  "location": "Current location name (in Spanish)",
  "inCombat": boolean,
  "suggestedActions": ["Action 1", "Action 2", "Action 3"] // 3 short options for quick play in Spanish
}
`;

function getAI() {
    if (!API_KEY) {
        throw new Error("GEMINI_API_KEY is not set in environment variables.");
    }
    return new GoogleGenAI({ apiKey: API_KEY });
}

function parseResponse(rawText: string): Message {
    const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
    const match = rawText.match(jsonRegex);

    let text = rawText;
    let dmState: DmStateUpdate | undefined;

    if (match) {
        try {
            dmState = JSON.parse(match[1]);
            text = rawText.replace(match[0], '').trim();
        } catch (e) {
            console.warn("Failed to parse DM state JSON", e);
        }
    }

    return {
        id: Date.now().toString(),
        sender: 'dm',
        text: text,
        timestamp: Date.now(),
        metadata: { dmState }
    };
}

function mapHistoryToContent(messages: Message[]): Content[] {
    return messages
        .filter(m => m.sender === 'dm' || m.sender === 'player')
        .map(m => ({
            role: m.sender === 'dm' ? 'model' : 'user',
            parts: [{ text: m.text }] as Part[]
        }));
}

export async function initializeCampaignAction(party: Character[]): Promise<Message> {
    const ai = getAI();

    const partyDescription = party.map(c =>
        `${c.name} (Nivel ${c.level} ${c.classType}) - PV: ${c.hp}/${c.maxHp}. Est: FUE${c.stats.STR} DES${c.stats.DEX} INT${c.stats.INT}. Bio: ${c.bio}. Inventario: ${c.inventory.join(', ')}`
    ).join('\n');

    const prompt = `
    Comienza una nueva aventura para este grupo:
    ${partyDescription}
    
    Crea un escenario interesante (por ejemplo, una reunión en una taberna, despertar en una mazmorra, una convocatoria del rey).
    Establece la escena y pregúntales qué quieren hacer.
    Recuerda responder en ESPAÑOL.
    `;

    try {
        const response = await ai.models.generateContent({
            model: TEXT_MODEL_NAME,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                systemInstruction: { parts: [{ text: DM_SYSTEM_INSTRUCTION }] },
                temperature: 0.9,
            }
        });

        const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("No response from AI");

        return parseResponse(text);

    } catch (error: any) {
        console.error("Gemini Init Error:", error);
        return {
            id: Date.now().toString(),
            sender: 'system',
            text: `El Dungeon Master tiene problemas para conectar con el plano astral (Error API): ${error.message}`,
            timestamp: Date.now()
        };
    }
}

export async function resolveTurnAction(
    actions: { characterName: string; action: string; roll?: string }[],
    history: Message[]
): Promise<Message> {
    const ai = getAI();

    const actionDescriptions = actions.map(a =>
        `- ${a.characterName}: ${a.action} ${a.roll ? `(Resultado Dado: ${a.roll})` : ''}`
    ).join('\n');

    const prompt = `
    Los jugadores han tomado sus decisiones para este turno:
    ${actionDescriptions}
    
    Resuelve estas acciones basándote en el contexto actual y describe qué sucede a continuación.
    Recuerda responder en ESPAÑOL.
    `;

    const chatHistory = mapHistoryToContent(history);

    try {
        const contents = [
            ...chatHistory,
            { role: 'user', parts: [{ text: prompt }] } as Content
        ];

        const response = await ai.models.generateContent({
            model: TEXT_MODEL_NAME,
            contents: contents,
            config: {
                systemInstruction: { parts: [{ text: DM_SYSTEM_INSTRUCTION }] },
                temperature: 0.9,
            }
        });

        const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("No response from AI");

        return parseResponse(text);
    } catch (error: any) {
        console.error("Gemini Turn Error:", error);
        return {
            id: Date.now().toString(),
            sender: 'system',
            text: "El Dungeon Master está en silencio (Error API).",
            timestamp: Date.now()
        };
    }
}


