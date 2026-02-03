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
    personality: string;
    inventory: Item[];
    equipment: Equipment;
    isReady: boolean; // Multiplayer: has the player submitted an action?
    pendingAction?: string; // Multiplayer: the action waiting to be resolved
    voiceId: string; // The selected voice for TTS (Puck, Aoede, etc.)
}

export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
export type ItemType = 'Weapon' | 'Armor' | 'Potion' | 'Scroll' | 'Misc';

export interface Item {
    id: string;
    name: string;
    type: ItemType;
    rarity: Rarity;
    description: string;
    stats?: Partial<Stats>; // Helper stats like +1 STR
    icon?: string; // Emoji?
}

export interface Equipment {
    head?: Item;
    chest?: Item;
    mainHand?: Item;
    offHand?: Item;
    legs?: Item;
    feet?: Item;
    amulet?: Item;
    ring1?: Item;
    ring2?: Item;
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
        audioUrl?: string; // Persistent audio URL
        audioGenerating?: boolean; // Syncs "Loading..." state across clients
    };
}

// State updates parsed from AI response
export interface DmStateUpdate {
    hpUpdates?: Record<string, number>;
    inventoryUpdates?: Record<string, string[]>;
    location?: string;
    suggestedActions?: string[];
    isCombat?: boolean;
    requiredRoll?: {
        characterName: string;
        reason: string;
        rollType: string; // e.g., "Dexterity Save", "Perception Check"
    };
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
    Fighter: "Un maestro del combate marcial, hábil con una variedad de armas y armaduras.",
    Wizard: "Un usuario de magia académico capaz de manipular las estructuras de la realidad.",
    Rogue: "Un canalla que usa el sigilo y la astucia para superar obstáculos y enemigos.",
    Cleric: "Un campeón sacerdotal que empuña magia divina al servicio de un poder superior.",
    Paladin: "Un guerrero santo atado a un juramento sagrado.",
    Ranger: "Un guerrero que combate amenazas en los límites de la civilización."
};

export const CLASS_NAMES: Record<ClassType, string> = {
    Fighter: "Guerrero",
    Wizard: "Mago",
    Rogue: "Pícaro",
    Cleric: "Clérigo",
    Paladin: "Paladín",
    Ranger: "Explorador"
};

export const CLASS_PRESETS: Record<ClassType, Stats> = {
    Fighter: { STR: 15, DEX: 13, CON: 14, INT: 8, WIS: 12, CHA: 10 },
    Wizard: { STR: 8, DEX: 13, CON: 14, INT: 15, WIS: 12, CHA: 10 },
    Rogue: { STR: 8, DEX: 15, CON: 12, INT: 13, WIS: 10, CHA: 14 },
    Cleric: { STR: 14, DEX: 10, CON: 13, INT: 10, WIS: 15, CHA: 10 }, // Modified to keep sum=27 approx or strict standard array
    Paladin: { STR: 15, DEX: 10, CON: 13, INT: 8, WIS: 10, CHA: 14 },
    Ranger: { STR: 12, DEX: 15, CON: 13, INT: 10, WIS: 14, CHA: 8 }
};
