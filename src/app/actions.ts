'use server'

import { GoogleGenAI, Content, Part } from "@google/genai";
import { Message, Character, DmStateUpdate } from "@/types";

const API_KEY = process.env.GEMINI_API_KEY!;
// Text model: 2.5 flash lite as requested
const TEXT_MODEL_NAME = 'gemini-2.5-flash-lite';
// Image model: 2.0 flash exp (multimodal generation) as fallback/standard
const IMAGE_MODEL_NAME = 'gemini-2.0-flash-exp';

const DM_SYSTEM_INSTRUCTION = `
You are the Dungeon Master (DM) for a Dungeons & Dragons 5th Edition game. 
Your goal is to provide an immersive, text-based RPG experience.

RULES:
1. Act as the narrator and referee. Describe the environment, NPCs, and outcomes of actions.
2. Be descriptive but concise. Avoid wall-of-text.
3. Adhere to D&D 5e rules for combat and skill checks. 
4. If a player attempts something risky, ask them to roll a specific check.
5. Manage the health, status, and **inventory** of the party based on the narrative.
6. **Multiplayer Turn Resolution**: You will receive a list of actions from multiple characters. Resolve them simultaneously or in logical initiative order, then describe the collective outcome.

CRITICAL OUTPUT FORMAT:
Your response must be natural text for the story. 
However, at the very end of your response, you MUST include a JSON block wrapped in \`\`\`json\`\`\` to update the game interface state.
The JSON block should match this schema:
{
  "hpUpdates": { "CharacterName": number }, // The NEW total HP value, not the change.
  "inventoryUpdates": { "CharacterName": ["item1", "item2"] }, // The NEW, complete list of items for the character.
  "location": "Current location name",
  "inCombat": boolean,
  "suggestedActions": ["Action 1", "Action 2", "Action 3"] // 3 short options for quick play
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
        `${c.name} (Level ${c.level} ${c.classType}) - HP: ${c.hp}/${c.maxHp}. Stats: STR${c.stats.STR} DEX${c.stats.DEX} INT${c.stats.INT}. Bio: ${c.bio}. Inventory: ${c.inventory.join(', ')}`
    ).join('\n');

    const prompt = `
    Start a new adventure for this party:
    ${partyDescription}
    
    Create an interesting scenario (e.g., a tavern meeting, a waking up in a dungeon, a king's summons).
    Set the scene and ask what they want to do.
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
            text: `The Dungeon Master is having trouble connecting to the astral plane (API Error): ${error.message}`,
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
        `- ${a.characterName}: ${a.action} ${a.roll ? `(Rolled: ${a.roll})` : ''}`
    ).join('\n');

    const prompt = `
    The players have made their decisions for this turn:
    ${actionDescriptions}
    
    Resolve these actions based on the current context and describe what happens next.
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
            text: "The Dungeon Master is silent (API Error).",
            timestamp: Date.now()
        };
    }
}

export async function generateImageAction(prompt: string): Promise<string | null> {
    const ai = getAI();
    try {
        const response = await ai.models.generateContent({
            model: IMAGE_MODEL_NAME,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                responseMimeType: 'image/png'
            }
        });

        const candidates = response.candidates;
        if (candidates && candidates[0]?.content?.parts) {
            for (const part of candidates[0].content.parts) {
                if (part.inlineData) {
                    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                }
            }
        }
        return null;
    } catch (error: any) {
        console.error("Image Gen Error:", error);
        return null;
    }
}
