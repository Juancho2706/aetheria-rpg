export type StatName = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';

export interface Stats {
    STR: number;
    DEX: number;
    CON: number;
    INT: number;
    WIS: number;
    CHA: number;
}

export type ClassType = 'Fighter' | 'Wizard' | 'Rogue' | 'Cleric' | 'Paladin' | 'Ranger';

export interface Character {
    id: string;
    name: string;
    ownerEmail: string; // Links character to a specific player
    classType: ClassType;
    level: number;
    hp: number;
    maxHp: number;
    stats: Stats;
    bio: string;
    avatarUrl?: string;
    inventory: string[];
    isReady: boolean; // Multiplayer: has the player submitted an action?
    pendingAction?: string; // Multiplayer: the action waiting to be resolved
}

export interface Message {
    id: string;
    sender: 'dm' | 'player' | 'system';
    text: string;
    timestamp: number;
    metadata?: {
        diceRoll?: {
            formula: string;
            result: number;
            detail: string;
        };
        dmState?: DmStateUpdate;
    };
}

// State updates parsed from AI response
export interface DmStateUpdate {
    hpUpdates?: Record<string, number>;
    inventoryUpdates?: Record<string, string[]>;
    location?: string;
    suggestedActions?: string[];
    isCombat?: boolean;
}

export interface GameState {
    isLoggedIn: boolean;
    userEmail: string | null;
    lobbyId: string | null; // Shared room ID
    party: Character[];
    messages: Message[];
    currentLocation: string;
    inCombat: boolean;
}

export const INITIAL_STATS: Stats = {
    STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10
};

export const CLASS_DESCRIPTIONS: Record<ClassType, string> = {
    Fighter: "A master of martial combat, skilled with a variety of weapons and armor.",
    Wizard: "A scholarly magic-user capable of manipulating the structures of reality.",
    Rogue: "A scoundrel who uses stealth and trickery to overcome obstacles and enemies.",
    Cleric: "A priestly champion who wields divine magic in service of a higher power.",
    Paladin: "A holy warrior bound to a sacred oath.",
    Ranger: "A warrior who combats threats on the edges of civilization."
};
