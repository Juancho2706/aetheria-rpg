import { Character } from "@/types";
import { supabase } from "./supabase";

export const rollDice = (dice: string): { total: number, details: string } => {
    // Format: "1d20", "2d6+3", "1d8-1"
    const regex = /(\d+)d(\d+)([+-]\d+)?/;
    const match = dice.match(regex);

    if (!match) {
        // Fallback simple roll
        const val = Math.floor(Math.random() * 20) + 1;
        return { total: val, details: `d20 (${val})` };
    }

    const count = parseInt(match[1], 10);
    const sides = parseInt(match[2], 10);
    const modifier = match[3] ? parseInt(match[3], 10) : 0;

    let total = 0;
    let rolls = [];

    for (let i = 0; i < count; i++) {
        const roll = Math.floor(Math.random() * sides) + 1;
        rolls.push(roll);
        total += roll;
    }

    total += modifier;

    const detailStr = `[${rolls.join('+')}]${modifier !== 0 ? (modifier > 0 ? `+${modifier}` : modifier) : ''}`;

    return { total, details: `${dice} -> ${detailStr}` };
};

export const checkAllPlayersReady = (party: Character[]): boolean => {
    if (party.length === 0) return false;
    return party.every(p => p.isReady);
};

// --- SUPABASE FUNCTIONS ---

export const saveGame = async (lobbyId: string, party: Character[], messages: any[]) => {
    const gameState = {
        party,
        messages: messages.slice(-100), // Keep history limited
        timestamp: Date.now()
    };

    const { error } = await supabase
        .from('lobbies')
        .upsert({
            id: lobbyId,
            game_state: gameState,
            updated_at: new Date().toISOString()
        });

    if (error) {
        console.error("Error saving game to Supabase:", error);
    }
};

export const loadGame = async (lobbyId: string) => {
    const { data, error } = await supabase
        .from('lobbies')
        .select('game_state')
        .eq('id', lobbyId)
        .single();

    if (error) {
        // If error is code PGRST116, it means no rows returned (new lobby), which is fine.
        if (error.code !== 'PGRST116') {
            console.error("Error loading game:", error);
        }
        return null;
    }

    return data?.game_state || null;
};
