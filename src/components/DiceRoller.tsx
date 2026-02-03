'use client'

import React, { useState } from 'react';
import { rollDice } from '../lib/gameUtils';
import { HelpCircle } from 'lucide-react';

interface Props {
    onRoll: (result: string, total: number) => void;
}

const DiceRoller: React.FC<Props> = ({ onRoll }) => {
    const [lastRoll, setLastRoll] = useState<{ total: number, details: string } | null>(null);
    const [isRolling, setIsRolling] = useState(false);

    const handleRoll = (dice: string) => {
        setIsRolling(true);
        setLastRoll(null);

        // Simulate animation time
        setTimeout(() => {
            const result = rollDice(dice);
            setLastRoll(result);
            setIsRolling(false);
            onRoll(result.details, result.total);
        }, 600);
    };

    return (
        <div className="bg-dnd-panel border border-gray-700/50 rounded-lg p-3 h-full flex flex-col justify-center">
            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest text-center mb-2 flex items-center justify-center gap-1">
                <HelpCircle size={10} /> Bandeja
            </div>

            {/* Last Roll Display - Floating or Top */}
            {lastRoll && (
                <div className="mb-2 text-center bg-slate-900 rounded p-1 border border-dnd-gold/30 animate-pulse">
                    <span className="text-dnd-gold font-fantasy text-sm font-bold block">{lastRoll.total}</span>
                    <span className="text-[9px] text-gray-500">{lastRoll.details}</span>
                </div>
            )}

            <div className="grid grid-cols-2 gap-1 flex-1 overflow-y-auto scrollbar-hide content-center">
                {['1d4', '1d6', '1d8', '1d10', '1d12', '1d20', '2d6', 'Check'].map((d) => (
                    <button
                        key={d}
                        onClick={() => handleRoll(d === 'Check' ? '1d20' : d)}
                        disabled={isRolling}
                        className={`
              relative overflow-hidden group
              rounded bg-slate-800 hover:bg-red-900/40 border border-gray-600 hover:border-red-500
              text-[9px] font-bold text-gray-300 transition flex items-center justify-center h-8
              ${isRolling ? 'opacity-50 cursor-not-allowed' : ''}
            `}
                    >
                        <span className="relative z-10">{d}</span>
                    </button>
                ))}
            </div>

            {isRolling && (
                <div className="mt-2 text-center text-xs text-dnd-gold animate-bounce">
                    Rolling the bones...
                </div>
            )}
        </div>
    );
};

export default DiceRoller;
