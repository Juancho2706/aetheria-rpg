'use server'

import { GoogleGenAI, Content, Part } from "@google/genai";
import { Message, Character, DmStateUpdate } from "@/types";

const API_KEY = process.env.GEMINI_API_KEY!;
// Text model: Gemini 2.5 Flash Lite (Stable, fast)
const TEXT_MODEL_NAME = 'gemini-2.5-flash-lite';


// Helper: Convert Raw PCM to WAV Buffer (Mono, 24kHz)
function pcmToWav(pcmData: Buffer, sampleRate: number = 24000): Buffer {
    const header = Buffer.alloc(44);
    const dataLength = pcmData.length;
    const fileSize = dataLength + 36;

    // RIFF chunk descriptor
    header.write('RIFF', 0);
    header.writeUInt32LE(fileSize, 4);
    header.write('WAVE', 8);

    // fmt subchunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    header.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
    header.writeUInt16LE(1, 22); // NumChannels (1 = Mono)
    header.writeUInt32LE(sampleRate, 24); // SampleRate
    header.writeUInt32LE(sampleRate * 2, 28); // ByteRate (SampleRate * 1 * 16/8)
    header.writeUInt16LE(2, 32); // BlockAlign
    header.writeUInt16LE(16, 34); // BitsPerSample

    // data subchunk
    header.write('data', 36);
    header.writeUInt32LE(dataLength, 40);

    return Buffer.concat([header, pcmData]);
}

const DM_SYSTEM_INSTRUCTION = `
You are the Dungeon Master (DM) for a Dungeons & Dragons 5th Edition game. 
Your goal is to provide an immersive, text-based RPG experience.

IMPORTANT: YOU MUST RESPOND ONLY IN SPANISH (LATIN AMERICAN / NEUTRAL). 
DO NOT USE "VOSOTROS", "OS", "HABÉIS". USE "USTEDES", "SU", "HAN".

RULES:
1. Act as the narrator and referee. Describe the environment, NPCs, and outcomes of actions.
2. **BREVITY IS KING**: Keep responses SHORT and PUNCHY. Max 3 short paragraphs. No "walls of text".
3. **PERSPECTIVE & DIALOGUE**:
    -   **NARRATION**: Use **THIRD PERSON** ("Plolo camina", "Grom ataca"). Do NOT use "Tu/Usted" to refer to specific players to avoid confusion.
    -   **PC DIALOGUE**: **NEVER** invent spoken dialogue for Player Characters. Only narrate the *actions* and *consequences* based on what they declared.
    -   **NPCs**: You CAN generate dialogue for NPCs. Format: **Nombre: "..."**.
    -   **Narrator**: Do NOT use a prefix for descriptions. Just write the text.
4. **STOP AT ROLLS**: If a player action requires a check (e.g., attacking, deceiving, climbing), DESCRIBE the setup, ASK for the roll, and **STOP**. Do NOT narrate the result yet.
5. Adhere to D&D 5e rules.
6. Manage health, status, and inventory.
7. **Inventory**: 
   - IF player GETS items: use 'itemsAdded'.
   - IF player LOSES/USES items: use 'itemsRemoved'.
8. **Equipment**: IF player equips/unequips, use 'equipmentUpdates' (Slot -> Item Name).

CRITICAL OUTPUT FORMAT:
Your response must be natural text for the story in SPANISH.
At the very end, include a JSON block wrapped in \`\`\`json\`\`\` matching this schema:
{
  "hpUpdates": { "CharacterName": number }, 
  "itemsAdded": { "CharacterName": ["New Item Name"] },
  "itemsRemoved": { "CharacterName": ["Used Item Name"] },
  "equipmentUpdates": { "CharacterName": { "mainHand": "Sword" } },
  "location": "Current location name (in Spanish)",
  "inCombat": boolean,
  "suggestedActions": ["Action 1", "Action 2", "Action 3", "Action 4", "Action 5", "Action 6"],
  // NOTE: Provide EXACTLY 6 brief, creative, distinct suggested actions for the player.
  // Actions should cover different approaches: Aggressive, Diplomatic, Stealthy, Magical, Exploratory, etc.
  "requiredRoll": { "characterName": "Name", "reason": "Reason", "rollType": "Stat or Skill" } // OPTIONAL: Only if you are waiting for a roll
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
        `${c.name} (Nivel ${c.level} ${c.classType}) - PV: ${c.hp}/${c.maxHp}. Est: FUE${c.stats.STR} DES${c.stats.DEX} INT${c.stats.INT}. Bio: ${c.bio}. Inventario: ${c.inventory.map(i => i.name).join(', ')}`
    ).join('\n');

    const prompt = `
    Comienza una nueva aventura para este grupo:
    ${partyDescription}
    
    Crea un escenario de inicio MUY CREATIVO y ÚNICO para la campaña. 
    EVITA CLICHÉS como "despertar en una celda", "reunión en una taberna" o "convocatoria del rey", a menos que tengan un giro totalmente inesperado.
    
    Ideas de Escenarios (Usa una de estas o inventa una MEJOR):
    - En medio de una caída libre desde una aeronave.
    - Interrumpiendo sin querer un ritual de nigromancia en una biblioteca.
    - En el estómago de una bestia gigante que duerme.
    - En un banquete elegante donde todos los invitados son ilusiones.
    - Despertando en un campo de batalla minutos después de que terminó.
    
    Establece la escena con detalles sensoriales y pregúntales qué quieren hacer.
    
    SI EL ESCENARIO LO REQUIERE (ej. han sido capturados o naufragaron), actualiza su inventario (quitando/añadiendo items) usando 'inventoryUpdates' en el JSON.
    
    IMPORTANTE: Proporciona 3 sugerencias de acción iniciales ("suggestedActions") acordes a la situación dramática.
    
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
            text: `El Dungeon Master tiene problemas para conectar con el plano astral(Error API): ${error.message} `,
            timestamp: Date.now()
        };
    }
}

export async function resolveTurnAction(
    actions: { characterName: string; action: string; roll?: string }[],
    history: Message[],
    previousSummary: string = "" // NEW: Receive context summary
): Promise<Message> {
    const ai = getAI();

    const actionDescriptions = actions.map(a =>
        `- ${a.characterName}: ${a.action} ${a.roll ? `(Resultado Dado: ${a.roll})` : ''} `
    ).join('\n');

    const prompt = `
    Los jugadores han tomado sus decisiones para este turno:
    ${actionDescriptions}
    
    Resuelve estas acciones basándote en el contexto actual y describe qué sucede a continuación.
    Recuerda responder en ESPAÑOL.
    `;

    // OPTIMIZATION (Memory Window): 
    // If we have a summary, we only need the last few messages (~10) to maintain continuity.
    // If no summary, we keep more history (~20) but still truncate to save tokens.
    const recentHistory = previousSummary ? history.slice(-10) : history.slice(-20);
    const chatHistory = mapHistoryToContent(recentHistory);

    try {
        const contents: Content[] = [
            // Inject Summary as "System Context" (disguised as User message at start)
            ...(previousSummary ? [{ role: 'user', parts: [{ text: `[MEMORIA DE LARGO PLAZO - RESUMEN ANTERIOR]:\n${previousSummary}\n\n[HISTORIAL RECIENTE]:` }] } as Content] : []),
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



export async function generateCharacterDetailsAction(classType: string, name: string): Promise<{ bio: string, personality: string }> {
    const ai = getAI();
    const prompt = `
    Genera un trasfondo(bio) y una personalidad para un personaje de rol D & D 5e.
        Nombre: ${name || 'Sin nombre'}
    Clase: ${classType}
    
    Responde EXCLUSIVAMENTE con un objeto JSON en este formato:
    {
        "bio": "Un párrafo breve y evocador sobre su pasado (max 40 palabras).",
            "personality": "Una frase corta que describa su personalidad (ej: 'Valiente pero arrogante, protege a los débiles')."
    }
    `;

    try {
        const response = await ai.models.generateContent({
            model: TEXT_MODEL_NAME,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: { responseMimeType: 'application/json' }
        });

        const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("No generated text");
        return JSON.parse(text);
    } catch (e: any) {
        console.error("Gemini Gen Details Error:", e);
        return {
            bio: "Un misterioso aventurero con un pasado olvidado.",
            personality: "Estoico y reservado."
        };
    }
}

// -- SERVER-SIDE AUDIO UTILS --
function pcmToWavBuffer(base64Pcm: string): Buffer {
    // Decode base64
    const audioData = Buffer.from(base64Pcm, 'base64');

    // Header Params (Gemini: 24kHz, 16-bit, Mono)
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = audioData.length;
    const chunkSize = 36 + dataSize;

    const buffer = Buffer.alloc(44 + dataSize);

    // RIFF Chunk
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(chunkSize, 4);
    buffer.write('WAVE', 8);

    // fmt Chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    buffer.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);

    // data Chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    // Audio Data
    audioData.copy(buffer, 44);

    return buffer;
}


// Modified Action to support Persistence & Voice Maps
export async function generateNarratorAudioAction(text: string, voiceMap?: Record<string, string>, messageId?: string): Promise<string> {

    // 1. Check if audio already exists in Storage (if messageId provided)
    if (messageId) {
        try {
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
            // Prefer Service Role for Storage ops if available, else Anon, else Default Publishable
            const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

            if (supabaseUrl && supabaseKey) {
                const { createClient } = require('@supabase/supabase-js');
                const sb = createClient(supabaseUrl, supabaseKey);

                const fileName = `${messageId}.wav`;

                // Check existence (HEAD via list)
                const { data: existingFiles } = await sb.storage.from('narrations').list('', {
                    search: fileName
                });

                if (existingFiles && existingFiles.length > 0) {
                    // Get Public URL
                    const { data: { publicUrl } } = sb.storage.from('narrations').getPublicUrl(fileName);
                    return publicUrl;
                }
            }
        } catch (e) {
            console.warn("Storage check failed, generating fresh audio...", e);
        }
    }

    console.log(`🎙️ Generating Audio for: "${text.substring(0, 50)}..."`);
    const ai = getAI();
    const AUDIO_MODEL_NAME = 'gemini-2.5-flash-preview-tts';

    // Voice Setup
    let playerVoiceId = 'Puck';
    if (voiceMap && Object.values(voiceMap).length > 0) {
        playerVoiceId = Object.values(voiceMap)[0];
    }
    const npcVoices = ['Fenrir', 'Charon', 'Kore', 'Aoede'].filter(v => v !== playerVoiceId);

    // 1. Parse Script into Line Items
    const lines = text.split('\n');
    const parsedLines: { speaker: string, text: string, voiceId: string }[] = [];

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;

        // Regex: Name (Emotion): "Content"
        const dialogMatch = trimmed.match(/^([A-Za-zÀ-ÿ]+)(?:\s*\((.*?)\))?:\s*["“](.*?)["”]/);

        if (dialogMatch) {
            const name = dialogMatch[1];
            // const emotion = dialogMatch[2]; // Can use for future style prompting
            const content = dialogMatch[3];

            // Determine Voice
            let voiceId = 'Aoede'; // Default Narrator (Valid Voice)
            let speakerRole = 'Narrator';

            if (['Tu', 'Player', 'Yo', 'Me'].includes(name)) {
                voiceId = playerVoiceId;
                speakerRole = 'Player';
            } else {
                // Determine NPC Voice deterministically based on name
                const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                voiceId = npcVoices[hash % npcVoices.length];
                speakerRole = 'NPC';
            }

            parsedLines.push({ speaker: speakerRole, text: content, voiceId });

        } else {
            // Narration
            const cleanText = trimmed.replace(/^Narrator:\s*/i, '');
            parsedLines.push({ speaker: 'Narrator', text: cleanText, voiceId: 'Aoede' });
        }
    });

    if (parsedLines.length === 0) {
        parsedLines.push({ speaker: 'Narrator', text: text, voiceId: 'Aoede' });
    }

    // 2. Group into Chunks (to minimize API calls)
    const chunks: { voiceId: string, text: string }[] = [];
    let currentChunk = parsedLines[0];

    for (let i = 1; i < parsedLines.length; i++) {
        const line = parsedLines[i];
        if (line.voiceId === currentChunk.voiceId) {
            currentChunk.text += ` ${line.text} `;
        } else {
            chunks.push({ voiceId: currentChunk.voiceId, text: currentChunk.text });
            currentChunk = line;
        }
    }
    chunks.push({ voiceId: currentChunk.voiceId, text: currentChunk.text });

    console.log(`🧩 Stitching ${chunks.length} Audio Chunks...`);

    // 3. Generate Audio for Each Chunk (PARALLEL OPTIMIZATION)
    console.log(`⚡ Generating ${chunks.length} chunks in parallel...`);

    const chunkPromises = chunks.map(async (chunk, index) => {
        try {
            const response = await ai.models.generateContent({
                model: AUDIO_MODEL_NAME,
                contents: [{
                    role: 'user',
                    parts: [{ text: chunk.text }]
                }],
                config: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: chunk.voiceId } }
                    },
                }
            });

            const audioPart = response.candidates?.[0]?.content?.parts?.[0];
            if (audioPart && audioPart.inlineData && audioPart.inlineData.data) {
                const chunkBuffer = Buffer.from(audioPart.inlineData.data, 'base64');
                return { index, buffer: chunkBuffer };
            }
            return { index, buffer: null };
        } catch (e) {
            console.error(`⚠️ Failed to generate chunk ${index} for voice ${chunk.voiceId}`, e);
            return { index, buffer: null }; // Return null to skip silently (or insert silence?)
        }
    });

    const results = await Promise.all(chunkPromises);

    // Sort by index to maintain narrative order and filter failures
    const pcmBuffers = results
        .sort((a, b) => a.index - b.index)
        .map(r => r.buffer)
        .filter((b) => b !== null) as Buffer[];

    if (pcmBuffers.length === 0) {
        throw new Error("Failed to generate any audio chunks.");
    }

    // 4. Concatenate and Convert to WAV
    const totalPcm = Buffer.concat(pcmBuffers as Uint8Array[]);
    const wavBuffer = pcmToWav(totalPcm); // Use local helper

    // 5. Upload or Return
    const finalBase64 = wavBuffer.toString('base64');

    if (messageId) {
        try {
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

            if (supabaseUrl && supabaseKey) {
                const { createClient } = require('@supabase/supabase-js');
                const sb = createClient(supabaseUrl, supabaseKey);

                const fileName = `${messageId}.wav`;

                const { error: uploadError } = await sb.storage
                    .from('narrations')
                    .upload(fileName, wavBuffer, {
                        contentType: 'audio/wav',
                        upsert: true
                    });

                if (!uploadError) {
                    const { data: { publicUrl } } = sb.storage.from('narrations').getPublicUrl(fileName);
                    return publicUrl;
                } else {
                    console.error("Upload failed", uploadError);
                }
            }
        } catch (uploadEx) {
            console.error("Storage upload exception:", uploadEx);
        }
    }

    return finalBase64;
}

// Ensure Voice Samples Exist - Runs on Character Creator mount
export async function ensureVoiceSamplesAction(): Promise<Record<string, string>> {
    console.log("🔊 ensureVoiceSamplesAction STARTED");
    const voices = [
        { id: 'Puck', text: '¡Vaya! ¿Qué tenemos aquí? ¡Parece que la aventura nos llama!' },
        { id: 'Charon', text: 'El destino es inevitable. Prepárate para lo que viene.' },
        { id: 'Fenrir', text: 'Mantén tu guardia alta. El peligro acecha en cada sombra.' },
        { id: 'Aoede', text: 'Las estrellas cantan canciones de gloria para aquellos valientes de corazón.' },
        { id: 'Kore', text: 'Respira profundo. La naturaleza nos guiará a través de la tormenta.' }
    ];

    const sampleUrls: Record<string, string> = {};
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error(`Missing Supabase Credentials.URL: ${!!supabaseUrl}, Key: ${!!supabaseKey} `);
    }

    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(supabaseUrl, supabaseKey);

    const ai = getAI();
    const AUDIO_MODEL_NAME = 'gemini-2.5-flash-preview-tts';

    for (const v of voices) {
        const fileName = `voice_samples_v2/${v.id}.wav`;

        // 1. Check if exists
        const { data: existing, error: listError } = await sb.storage.from('narrations').list('voice_samples_v2', { search: `${v.id}.wav` });

        if (listError) {
            console.error(`❌ List Error for ${v.id}: `, listError);
            if (listError.message && listError.message.includes("Bucket not found")) {
                throw new Error("Bucket 'narrations' not found. Please create it in Supabase.");
            }
        }

        if (existing && existing.length > 0) {
            const { data: { publicUrl } } = sb.storage.from('narrations').getPublicUrl(fileName);
            sampleUrls[v.id] = publicUrl;
            continue;
        }

        // 2. Generate if missing
        try {
            const response = await ai.models.generateContent({
                model: AUDIO_MODEL_NAME,
                contents: [{
                    role: 'user',
                    parts: [{ text: v.text }]
                }],
                config: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: v.id } }
                    },
                }
            });

            const audioPart = response.candidates?.[0]?.content?.parts?.[0];
            if (audioPart && audioPart.inlineData && audioPart.inlineData.data) {
                // Modified to user Buffer.from + pcmToWav helper
                const rawBuffer = Buffer.from(audioPart.inlineData.data, 'base64');
                const wavBuffer = pcmToWav(rawBuffer);

                const { error: uploadError } = await sb.storage.from('narrations').upload(fileName, wavBuffer, {
                    contentType: 'audio/wav',
                    upsert: true
                });

                if (uploadError) {
                    console.error(`❌ Upload Failed for ${v.id}: `, uploadError);
                    if (uploadError.statusCode === '403' || (uploadError.message && uploadError.message.includes("row-level security"))) {
                        throw new Error(`Upload Forbidden(RLS).Ensure 'narrations' bucket is Public & has Policies.Info: ${uploadError.message} `);
                    }
                }

                const { data: { publicUrl } } = sb.storage.from('narrations').getPublicUrl(fileName);
                sampleUrls[v.id] = publicUrl;
            }
        } catch (e) {
            console.error(`❌ Failed to generate sample for ${v.id}`, e);
            throw e;
        }
    }

    console.log("🔊 DONE. URLs:", sampleUrls);
    return sampleUrls;
}

// Generate Journal Summary
export async function summarizeGameAction(previousSummary: string, recentMessages: Message[]): Promise<string> {
    const ai = getAI();

    // Filter out system/hidden messages, keep only story relevant ones
    const storyText = recentMessages
        .filter(m => m.sender === 'dm' || m.sender === 'player')
        .map(m => `${m.sender.toUpperCase()}: ${m.text}`)
        .join('\n');

    const prompt = `
    Actúa como el Cronista oficial de una saga de fantasía épica.
    
    CONTEXTO ANTERIOR:
    "${previousSummary || "La aventura acaba de comenzar."}"

    NUEVOS EVENTOS (Transcripción):
    ${storyText}

    TU TAREA:
    Genera un nuevo párrafo de "Entrada de Diario" que resuma los NUEVOS EVENTOS y los conecte coherentemente con el CONTEXTO ANTERIOR.
    - Se conciso pero épico.
    - Mantén registro de nombres propios, lugares clave y objetos importantes encontrados.
    - Ignora las tiradas de dados o discusiones de reglas, céntrate en la narrativa.
    - El estilo debe ser literario, como un libro de historia.
    
    Responde SOLAMENTE con el texto del resumen en ESPAÑOL.
    `;

    try {
        const response = await ai.models.generateContent({
            model: TEXT_MODEL_NAME, // Using same model for smarts, or could use Flash for speed
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                temperature: 0.7, // Slightly less creative, more factual
            }
        });

        const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
        return text || "Error generando resumen.";

    } catch (e) {
        console.error("Summary Generation Failed", e);
        return "Hubo un error registrando los eventos recientes en el diario.";
    }
}