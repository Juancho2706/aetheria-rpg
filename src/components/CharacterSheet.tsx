import React from 'react';
import { Character, Equipment, Item } from '../types';
import { X, Shield, Sword, Heart, Zap, ScrollText } from 'lucide-react';

interface Props {
    character: Character;
    onClose: () => void;
}

const CharacterSheet: React.FC<Props> = ({ character, onClose }) => {
    if (!character) return null;

    const renderSlot = (slotName: keyof Equipment, label: string) => {
        const item = character.equipment?.[slotName];

        return (
            <div className="relative group/slot flex flex-col items-center justify-center">
                <div className={`
          w-16 h-16 border-2 rounded-lg flex items-center justify-center relative
          ${item ? `
            ${item.rarity === 'Legendary' ? 'border-orange-500 bg-orange-950/20' : ''}
            ${item.rarity === 'Epic' ? 'border-purple-500 bg-purple-950/20' : ''}
            ${item.rarity === 'Rare' ? 'border-blue-500 bg-blue-950/20' : ''}
            ${item.rarity === 'Uncommon' ? 'border-green-500 bg-green-950/20' : ''}
            ${item.rarity === 'Common' ? 'border-gray-600 bg-slate-900' : ''}
          ` : 'border-gray-800 bg-slate-900/50 border-dashed'}
          transition-colors hover:border-dnd-gold
        `}>
                    {item ? (
                        <span className="text-2xl filter drop-shadow-md">{item.icon}</span>
                    ) : (
                        <span className="text-gray-700 text-xs font-bold uppercase tracking-widest">{label}</span>
                    )}
                </div>

                {/* Tooltip for Equipment */}
                {item && (
                    <div className="absolute z-[100] bottom-full mb-2 w-64 bg-slate-950 border border-gray-600 rounded-lg shadow-2xl p-3 hidden group-hover/slot:block pointer-events-none">
                        <h4 className={`text-base font-bold border-b border-gray-700 pb-1 mb-1
              ${item.rarity === 'Legendary' ? 'text-orange-400' : ''}
              ${item.rarity === 'Epic' ? 'text-purple-400' : ''}
              ${item.rarity === 'Rare' ? 'text-blue-400' : ''}
              ${item.rarity === 'Uncommon' ? 'text-green-400' : ''}
              ${item.rarity === 'Common' ? 'text-white' : ''}
            `}>{item.name}</h4>

                        <p className="text-gray-400 text-xs italic mb-2">{item.type} • {item.rarity}</p>

                        {item.stats && (
                            <div className="space-y-1 mb-2">
                                {Object.entries(item.stats).map(([k, v]) => (
                                    <p key={k} className="text-blue-300 text-xs flex justify-between">
                                        <span>{k}</span>
                                        <span>+{v}</span>
                                    </p>
                                ))}
                            </div>
                        )}
                        <p className="text-gray-500 text-xs">{item.description}</p>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-dnd-gold/50 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl relative flex flex-col md:flex-row">

                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-500 hover:text-white z-10 p-1 bg-black/20 rounded-full"
                >
                    <X size={24} />
                </button>

                {/* Left Panel: Character Art & Stats */}
                <div className="w-full md:w-1/3 bg-slate-950 p-6 flex flex-col border-b md:border-b-0 md:border-r border-gray-800 text-center">
                    <div className="relative w-48 h-48 mx-auto mb-6 rounded-full border-4 border-dnd-gold shadow-[0_0_20px_rgba(212,175,55,0.2)] overflow-hidden">
                        {character.avatarUrl ? (
                            <img src={character.avatarUrl} alt={character.name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full bg-slate-800 flex items-center justify-center text-4xl">👤</div>
                        )}
                    </div>

                    <h2 className="text-3xl font-fantasy text-dnd-gold mb-1">{character.name}</h2>
                    <p className="text-gray-400 text-sm mb-6 uppercase tracking-widest">{character.classType} • Nivel {character.level}</p>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-slate-900 p-3 rounded border border-gray-800">
                            <div className="text-red-500 flex justify-center mb-1"><Heart size={20} /></div>
                            <span className="text-2xl font-bold text-white block">{character.hp}</span>
                            <span className="text-xs text-gray-500 uppercase">Vida Max</span>
                        </div>
                        <div className="bg-slate-900 p-3 rounded border border-gray-800">
                            <div className="text-blue-500 flex justify-center mb-1"><Shield size={20} /></div>
                            <span className="text-2xl font-bold text-white block">10</span>
                            <span className="text-xs text-gray-500 uppercase">Defensa</span>
                        </div>
                    </div>

                    <div className="space-y-4 text-left">
                        <h3 className="text-dnd-gold border-b border-gray-800 pb-1 font-bold text-sm">Atributos</h3>
                        <div className="grid grid-cols-3 gap-2 text-center">
                            {Object.entries(character.stats).map(([stat, val]) => (
                                <div key={stat} className="bg-slate-900 p-2 rounded">
                                    <span className="block text-[10px] text-gray-500 font-bold">{stat}</span>
                                    <span className="block text-lg font-bold text-white">{val}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Panel: Inventory & Equipment */}
                <div className="flex-1 p-6 bg-dnd-panel/90">
                    <h3 className="text-xl font-fantasy text-gray-200 mb-6 flex items-center gap-2">
                        <Sword size={20} className="text-dnd-gold" /> Equipamiento
                    </h3>

                    {/* Doll / Equipment Grid */}
                    <div className="flex justify-center mb-8">
                        <div className="relative w-[300px] h-[400px] bg-[url('/paper-texture.png')] bg-contain bg-no-repeat bg-center md:bg-none">
                            {/* Simplified Grid Layout for Equipment */}
                            <div className="grid grid-cols-3 gap-8 place-items-center">
                                <div className="col-start-2">{renderSlot('head', 'Cabeza')}</div>

                                <div className="col-start-1 row-start-2">{renderSlot('mainHand', 'Mano Der')}</div>
                                <div className="col-start-2 row-start-2">{renderSlot('chest', 'Torso')}</div>
                                <div className="col-start-3 row-start-2">{renderSlot('offHand', 'Mano Izq')}</div>

                                <div className="col-start-1 row-start-3">{renderSlot('ring1', 'Anillo')}</div>
                                <div className="col-start-2 row-start-3">{renderSlot('legs', 'Piernas')}</div>
                                <div className="col-start-3 row-start-3">{renderSlot('ring2', 'Anillo')}</div>

                                <div className="col-start-2 row-start-4">{renderSlot('feet', 'Pies')}</div>
                            </div>
                        </div>
                    </div>

                    {/* Inventory Bag */}
                    <div className="mt-8">
                        <h3 className="text-sm font-bold text-gray-400 mb-3 flex items-center gap-2 uppercase tracking-wider">
                            <ScrollText size={16} /> Mochila
                        </h3>
                        <div className="grid grid-cols-6 md:grid-cols-8 gap-2">
                            {character.inventory.map((item, idx) => (
                                <div key={idx} className="relative group/bag-item">
                                    <div className={`w-10 h-10 bg-slate-900 border border-gray-700 rounded flex items-center justify-center text-lg cursor-help hover:border-dnd-gold transition
                          ${item.rarity === 'Legendary' ? 'border-orange-500' : ''}
                          ${item.rarity === 'Epic' ? 'border-purple-500' : ''}
                          ${item.rarity === 'Rare' ? 'border-blue-500' : ''}
                        `}>
                                        {item.icon || '📦'}
                                    </div>
                                    {/* Inventory Item Tooltip */}
                                    <div className="absolute bottom-full left-0 mb-2 w-48 bg-slate-950 border border-gray-700 p-2 rounded shadow-xl hidden group-hover/bag-item:block z-50 pointer-events-none">
                                        <strong className={`block text-xs border-b border-gray-800 pb-1 mb-1 ${item.rarity === 'Rare' ? 'text-blue-400' : 'text-gray-200'}`}>
                                            {item.name}
                                        </strong>
                                        <p className="text-[10px] text-gray-500">{item.description}</p>
                                    </div>
                                </div>
                            ))}
                            {/* Empty Slots */}
                            {Array.from({ length: Math.max(0, 24 - character.inventory.length) }).map((_, i) => (
                                <div key={`empty-${i}`} className="w-10 h-10 bg-slate-900/30 border border-gray-800/50 rounded"></div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default CharacterSheet;
