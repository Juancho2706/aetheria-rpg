
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

// Config
const INPUT_FILE = './public/Icons.png';
const TILE_SIZE = 32;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Prefer Service Role for admin writes, fallback to Anon (which might fail RLS)
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_API_KEY) {
    console.error("Missing Environment Variables. Check .env.local");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const MODEL_NAME = 'gemini-2.5-flash'; // Vision capable

async function main() {
    console.log("🚀 Starting Item Processor...");

    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`File not found: ${INPUT_FILE}`);
        return;
    }

    const image = sharp(INPUT_FILE);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
        console.error("Could not read image metadata");
        return;
    }

    console.log(`Image Size: ${metadata.width}x${metadata.height}`);

    const cols = Math.floor(metadata.width / TILE_SIZE);
    const rows = Math.floor(metadata.height / TILE_SIZE);

    console.log(`Grid: ${cols} cols x ${rows} rows (${cols * rows} potential items)`);

    // Create Bucket if not exists (Attempt)
    await supabase.storage.createBucket('icons', { public: true }).catch(() => { });

    let processedCount = 0;

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            // Process in chunks or sequentially to avoid rate limits?
            // Sequential for safety.
            await processTile(image, x, y);
            processedCount++;
        }
    }

    console.log("✅ Done!");
}

async function processTile(baseImage: sharp.Sharp, x: number, y: number) {
    const left = x * TILE_SIZE;
    const top = y * TILE_SIZE;

    // Extract
    const tileBuffer = await baseImage
        .clone()
        .extract({ left, top, width: TILE_SIZE, height: TILE_SIZE })
        .toBuffer();

    // Check emptiness (simple alpha check)
    const stats = await sharp(tileBuffer).stats();
    // If predominantly transparent?
    // stats.channels[3] is alpha. mean 0 = fully transparent.
    // Let's assume if max alpha is 0, it's empty.
    const isTransparent = stats.channels[3].max === 0;

    // Also check standard deviation to avoid solid color blocks? 
    // Just alpha check is good for now.

    if (isTransparent) {
        // console.log(`Skipping empty tile ${x},${y}`);
        return;
    }

    console.log(`🔍 Processing Tile [${x},${y}]...`);

    // 1. Upload Icon
    const fileName = `icon_${x}_${y}.png`;
    const { data: uploadData, error: uploadError } = await supabase.storage
        .from('icons')
        .upload(fileName, tileBuffer, { upsert: true, contentType: 'image/png' });

    if (uploadError) {
        console.error(`Failed to upload ${fileName}`, uploadError.message);
        return;
    }

    const { data: { publicUrl } } = supabase.storage.from('icons').getPublicUrl(fileName);

    // 2. Identify with Gemini
    try {
        const base64Image = tileBuffer.toString('base64');
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: "Analyze this 32x32 pixel art RPG icon. Identify what item it represents. Return ONLY a JSON object: { \"name\": string, \"type\": \"Weapon\"|\"Armor\"|\"Potion\"|\"Scroll\"|\"Misc\", \"rarity\": \"Common\"|\"Uncommon\"|\"Rare\"|\"Epic\"|\"Legendary\", \"description\": string, \"stats\": { \"STR\": number, \"DEX\": number, ...etc (0-5) } }. If it is UI garbage, return null." },
                        { inlineData: { mimeType: 'image/png', data: base64Image } }
                    ]
                }
            ],
            config: {
                responseMimeType: 'application/json'
            }
        });

        const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) return;

        const itemData = JSON.parse(text);
        if (!itemData) {
            console.log(`Skipping recognized garbage at ${x},${y}`);
            return;
        }

        // 3. Insert into DB (Check existence first to emulate UPSERT without unique constraint)
        const { data: existing } = await supabase
            .from('items')
            .select('id')
            .eq('name', itemData.name)
            .maybeSingle();

        if (existing) {
            console.log(`⚠️ Item already exists: ${itemData.name}`);
            return;
        }

        const { error: dbError } = await supabase
            .from('items')
            .insert({
                name: itemData.name,
                type: itemData.type,
                rarity: itemData.rarity,
                description: itemData.description,
                stats: itemData.stats,
                icon_url: publicUrl
            });

        if (dbError) {
            console.error(`DB Insert Failed: ${dbError.message}`);
            // If error is "relation public.items does not exist", we stop.
            if (dbError.message.includes("does not exist")) {
                console.error("CRITICAL: 'items' table missing. Run SQL schema first.");
                process.exit(1);
            }
        } else {
            console.log(`✨ Added: ${itemData.name} (${itemData.type})`);
        }

    } catch (e) {
        console.error("AI/DB Error:", e);
    }
}

main();
