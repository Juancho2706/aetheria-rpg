export const DEFAULT_WEAPONS: Record<string, any> = {
    Sword: {
        id: 'start-sword',
        name: 'Espada de Hierro',
        type: 'Weapon',
        rarity: 'Common',
        icon: '⚔️',
        description: 'Una espada confiable para un aventurero novato.',
        stats: { ATK: 2 }
    },
    Staff: {
        id: 'start-staff',
        name: 'Bastón de Roble',
        type: 'Weapon',
        rarity: 'Common',
        icon: '🪄',
        description: 'Canaliza energía mágica básica.',
        stats: { INT: 1 }
    },
    Dagger: {
        id: 'start-dagger',
        name: 'Daga Oxidada',
        type: 'Weapon',
        rarity: 'Common',
        icon: '🗡️',
        description: 'Pequeña pero letal en las manos correctas.',
        stats: { DEX: 1 }
    },
    Mace: {
        id: 'start-mace',
        name: 'Maza de Clérigo',
        type: 'Weapon',
        rarity: 'Common',
        icon: '🔨',
        description: 'Ideal para aplastar esqueletos.',
        stats: { STR: 1, WIS: 1 }
    }
};

export const DEFAULT_ARMOR: Record<string, any> = {
    Leather: {
        id: 'start-leather',
        name: 'Armadura de Cuero',
        type: 'Armor',
        rarity: 'Common',
        icon: '🧥',
        description: 'Ofrece protección sin sacrificar movilidad.',
        stats: { DEF: 1 }
    },
    Robe: {
        id: 'start-robe',
        name: 'Túnica de Aprendiz',
        type: 'Armor',
        rarity: 'Common',
        icon: '👘',
        description: 'Tela simple, pero cómoda para lanzar hechizos.',
        stats: { MP: 5 }
    },
    Chainmail: {
        id: 'start-chain',
        name: 'Cota de Malla',
        type: 'Armor',
        rarity: 'Common',
        icon: '⛓️',
        description: 'Eslabones de hierro entrelazados.',
        stats: { DEF: 3 }
    }
};

export const CLASS_STARTER_GEAR: Record<string, any> = {
    Fighter: {
        mainHand: DEFAULT_WEAPONS.Sword,
        chest: DEFAULT_ARMOR.Chainmail,
        inventory: [{ id: 'pot-health', name: 'Poción de Vida', type: 'Consumable', rarity: 'Common', icon: '🍷', description: 'Restaura salud.' }]
    },
    Wizard: {
        mainHand: DEFAULT_WEAPONS.Staff,
        chest: DEFAULT_ARMOR.Robe,
        inventory: [{ id: 'pot-mana', name: 'Poción de Maná', type: 'Consumable', rarity: 'Common', icon: '🧪', description: 'Restaura maná.' }]
    },
    Rogue: {
        mainHand: DEFAULT_WEAPONS.Dagger,
        chest: DEFAULT_ARMOR.Leather,
        inventory: [{ id: 'lockpick', name: 'Ganzúa', type: 'Tool', rarity: 'Common', icon: '🗝️', description: 'Para abrir puertas cerradas.' }]
    },
    Cleric: {
        mainHand: DEFAULT_WEAPONS.Mace,
        chest: DEFAULT_ARMOR.Chainmail,
        inventory: [{ id: 'pot-health', name: 'Poción de Vida', type: 'Consumable', rarity: 'Common', icon: '🍷', description: 'Restaura salud.' }]
    },
    Paladin: {
        mainHand: DEFAULT_WEAPONS.Sword,
        chest: DEFAULT_ARMOR.Chainmail,
        inventory: [{ id: 'holy-symbol', name: 'Símbolo Sagrado', type: 'Misc', rarity: 'Common', icon: '✝️', description: 'Foco divino.' }]
    },
    Ranger: {
        mainHand: DEFAULT_WEAPONS.Dagger, // Or Bow if I defined it? Dagger for now.
        chest: DEFAULT_ARMOR.Leather,
        inventory: [{ id: 'rations', name: 'Raciones', type: 'Consumable', rarity: 'Common', icon: '🍖', description: 'Comida de viaje.' }]
    }
};
