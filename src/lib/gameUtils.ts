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
    // We try to pull existing state to not overwrite 'createdBy' if it exists,
    // OR we pass it in. For simplicity, we assume the first save or updates preserve the structure.
    // Ideally, we'd merge, but upsert replaces.
    // Solution: Fetch current state first? No, that's slow.
    // Better: We should just store 'createdBy' in the gameState if passed, or rely on it being in 'party' logic?
    // Actually, 'createdBy' should be set once.
    // Let's modify the props to accept 'createdBy' if available.
    // But changing signature breaks calls.
    // Let's stick to the current signature but add a check or rely on the caller to pass it in 'messages' metadata? No.
    // Let's UPDATE the signature to be clearer: saveGame(lobbyId, party, messages, createdBy?)

    // HOWEVER, for now, we will just save what we have.
    // To implement "Resume", we need to know who is in the party.
    // The 'party' array has 'ownerEmail'. We can query that!

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
        throw new Error(error.message);
    }
};

export const loadGame = async (lobbyId: string) => {
    const { data, error } = await supabase
        .from('lobbies')
        .select('game_state')
        .eq('id', lobbyId)
        .single();

    if (error) {
        if (error.code !== 'PGRST116') {
            console.error("Error loading game:", error);
        }
        return null;
    }

    return data?.game_state || null;
};

export const getUserLobbies = async (userEmail: string) => {
    // We want lobbies where the user is in the party.
    // Since 'party' is a JSON array in 'game_state', we can use the -> operator.
    // .contains('game_state->party', JSON.stringify([{ ownerEmail: userEmail }])) 
    // This is tricky with JSON arrays.
    // Alternate: Fetch all and filter? Bad for scale, good for prototype.
    // Better: Supabase supports Postgres JSONB containment.
    // 'game_state->party' is an array. We want to check if any element has ownerEmail == userEmail.

    // Try simple filter first:
    const { data, error } = await supabase
        .from('lobbies')
        .select('id, game_state, updated_at')
        .order('updated_at', { ascending: false });

    if (error) {
        console.error("Error fetching user lobbies:", error);
        return [];
    }

    // Client-side filter for prototype safety (Supabase JSONB syntax can be finicky)
    return data.filter((lobby: any) => {
        const party = lobby.game_state?.party;
        if (Array.isArray(party)) {
            return party.some((c: Character) => c.ownerEmail === userEmail);
        }
        // Also check if they created it (if we store that, which we will try do next step)
        return false;
    });
};

export const deleteGame = async (lobbyId: string) => {
    const { error } = await supabase
        .from('lobbies')
        .delete()
        .eq('id', lobbyId);

    if (error) {
        console.error("Error deleting game:", error);
        throw new Error(error.message);
    }
};
