'use client'

import React, { useState } from 'react';
import { rollDice } from '../lib/gameUtils';

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
        <div className="bg-dnd-panel border border-gray-700 rounded-lg p-4 mt-4">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-gray-400 text-sm uppercase tracking-wider font-bold">Dice Tray</h3>
                {lastRoll && (
                    <span className="text-dnd-gold font-fantasy text-lg animate-pulse">
                        Result: {lastRoll.total}
                    </span>
                )}
            </div>

            <div className="grid grid-cols-4 gap-2">
                {['1d4', '1d6', '1d8', '1d10', '1d12', '1d20', '2d6', 'Roll Check'].map((d) => (
                    <button
                        key={d}
                        onClick={() => handleRoll(d === 'Roll Check' ? '1d20' : d)}
                        disabled={isRolling}
                        className={`
              relative overflow-hidden group
              p-2 rounded bg-slate-800 hover:bg-slate-700 border border-gray-600 
              text-xs md:text-sm font-bold text-gray-300 transition
              ${isRolling ? 'opacity-50 cursor-not-allowed' : ''}
            `}
                    >
                        <span className="relative z-10">{d}</span>
                        <div className="absolute inset-0 bg-dnd-gold/10 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-200"></div>
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
