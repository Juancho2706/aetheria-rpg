'use client'

import React, { useState, useEffect, useRef } from 'react';
import { Character, Message, DmStateUpdate } from '../types';
import { initializeCampaignAction, resolveTurnAction } from '../app/actions';
import { saveGame, checkAllPlayersReady } from '../lib/gameUtils';
import { supabase } from '../lib/supabase';
import DiceRoller from './DiceRoller';
import { Send, MapPin, Skull, Shield, Heart, ScrollText, CheckCircle, Clock } from 'lucide-react';

interface Props {
    party: Character[];
    userEmail: string;
    lobbyId: string;
    initialMessages?: Message[];
    onLeaveLobby: () => void;
}

// Simple Markdown to JSX converter for bold and italic
const renderMarkdown = (text: string) => {
    let renderedText: React.ReactNode[] = [];
    let currentText = text;

    const processMatch = (regex: RegExp, tag: string, contentProcessor: (s: string) => React.ReactNode) => {
        let match;
        let lastIndex = 0;
        const parts: React.ReactNode[] = [];

        while ((match = regex.exec(currentText)) !== null) {
            if (match.index > lastIndex) {
                parts.push(currentText.substring(lastIndex, match.index));
            }
            parts.push(React.createElement(tag, { key: `${tag}-${match.index}` }, contentProcessor(match[1])));
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < currentText.length) {
            parts.push(currentText.substring(lastIndex));
        }
        return parts;
    };

    // First bold, then italic
    let tempRendered = processMatch(/\*\*(.*?)\*\*/g, 'strong', (content) => content);
    currentText = tempRendered.map(node => typeof node === 'string' ? node : null).join('');
    renderedText = tempRendered.map((node, i) => typeof node === 'string' ? processMatch(/\*(.*?)\*/g, 'em', (content) => content).filter(n => typeof n === 'string' ? n.includes(node as string) : true).map(n => n) : node);

    renderedText = renderedText.flat();
    renderedText = renderedText.map(node => typeof node === 'string' ? processMatch(/\*(.*?)\*/g, 'em', (content) => content) : node).flat();

    const finalOutput: React.ReactNode[] = [];
    let currentString = '';

    for (const part of renderedText) {
        if (typeof part === 'string') {
            currentString += part;
        } else {
            if (currentString) {
                finalOutput.push(currentString);
                currentString = '';
            }
            finalOutput.push(part);
        }
    }
    if (currentString) {
        finalOutput.push(currentString);
    }

    const italicProcessed = finalOutput.map(part => {
        if (typeof part === 'string') {
            return processMatch(/\*(.*?)\*/g, 'em', (content) => content);
        }
        return part;
    }).flat();

    return <>{italicProcessed}</>;
};

const GameInterface: React.FC<Props> = ({ party, userEmail, lobbyId, initialMessages = [], onLeaveLobby }) => {
    const [messages, setMessages] = useState<Message[]>(initialMessages);
    const [characters, setCharacters] = useState<Character[]>(party);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [location, setLocation] = useState('Unknown');
    const [suggestedActions, setSuggestedActions] = useState<string[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);

    const myCharacter = characters.find(c => c.ownerEmail === userEmail);
    const canAct = myCharacter && !myCharacter.isReady && !isLoading;

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Sync Logic: Listen for updates from Supabase Realtime
    useEffect(() => {
        const channel = supabase
            .channel(`game:${lobbyId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'lobbies',
                    filter: `id=eq.${lobbyId}`,
                },
                (payload) => {
                    const newState = payload.new.game_state;
                    if (newState) {
                        // Check if messages changed
                        if (newState.messages && newState.messages.length > messages.length) {
                            setMessages(newState.messages);
                        }
                        // Update party state (HP, Ready status, etc)
                        if (newState.party) {
                            setCharacters(newState.party);
                        }
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [lobbyId, messages.length]);

    useEffect(() => {
        // Sync Location and Suggestions from latest message
        if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            if (lastMessage?.metadata?.dmState) {
                handleDmUpdate(lastMessage.metadata.dmState);
            }
        }
    }, [messages]);

    // Turn Resolution Logic: Check if all ready (Run ONLY by the last person who made it ready)
    useEffect(() => {
        if (characters.length > 0 && checkAllPlayersReady(characters) && !isLoading) {
            // Only ONE client should trigger the AI to save tokens and avoid race conditions.
            // We use the party LEADER (first character) to coordinate.

            if (characters[0].ownerEmail === userEmail) {
                resolveTurn();
            }
        }
    }, [characters, isLoading, userEmail]);

    // Initial DM prompt (Only run by leader if empty)
    useEffect(() => {
        if (messages.length === 0 && characters.length > 0 && characters[0].ownerEmail === userEmail) {
            startCampaign();
        }
    }, [characters]); // Run once when characters loaded

    const startCampaign = async () => {
        setIsLoading(true);
        // Server Action
        const msg = await initializeCampaignAction(characters);
        addMessage(msg);
        setIsLoading(false);
    };

    const addMessage = (msg: Message) => {
        const newMessages = [...messages, msg];
        setMessages(newMessages);
        // Explicit Save
        saveGame(lobbyId, characters, newMessages);

        // UI update handled by useEffect on messages change
    };

    const handleDmUpdate = async (state: DmStateUpdate) => {
        if (state.location && state.location !== location) setLocation(state.location);
        if (state.suggestedActions) setSuggestedActions(state.suggestedActions);

        // We do NOT update characters here and save, because that would double-save.
        // The message containing the state is already saved.
        // However, we need to apply visual updates locally.

        // Only parse if we haven't already applied this state? 
        // Actually, local state should reflect the LATEST DmState.

        // But characters might have changed (HP).
        // Note: The previous logic in App.tsx had a potential loop or double update.
        // Here we trust the latest message's DM state to be the source of truth for HP/Inventory
        // IF the message is new.

        // We will update local character state derived from DM state ONLY if beneficial.
        // But modifying 'characters' state here might conflict with real-time updates from other players acting?
        // NO, because this only happens after a DM Turn Resolution where no one can act.

        // Re-check logic: 
        // 1. DM sends message with HP update.
        // 2. Client receives message.
        // 3. Client updates local 'characters' state with new HP.
        // 4. Leader saves this new 'characters' state to DB to persist HP for everyone.

        // Optimistic / Leader-driven update:
        if (characters.length > 0 && characters[0].ownerEmail === userEmail) {
            // I am leader, I should apply updates and save them.
            const newParty = characters.map(char => {
                let newChar = { ...char };
                const hpKey = Object.keys(state.hpUpdates || {}).find(k => char.name.toLowerCase().includes(k.toLowerCase()));
                if (hpKey) newChar.hp = state.hpUpdates![hpKey];

                const invKey = Object.keys(state.inventoryUpdates || {}).find(k => char.name.toLowerCase().includes(k.toLowerCase()));
                if (invKey) newChar.inventory = state.inventoryUpdates![invKey];

                return newChar;
            });

            // Only save if changed
            const hasChanges = JSON.stringify(newParty) !== JSON.stringify(characters);
            if (hasChanges) {
                saveGame(lobbyId, newParty, messages);
            }
        }
    };

    // Submit Action
    const handleSend = async (actionText: string = input, rollResult?: string) => {
        if (!actionText.trim() || !canAct) return;

        const fullAction = rollResult ? `${actionText} [Dice: ${rollResult}]` : actionText;

        const newParty = characters.map(c => {
            if (c.ownerEmail === userEmail) {
                return { ...c, isReady: true, pendingAction: fullAction };
            }
            return c;
        });

        // Optimistic update
        setCharacters(newParty);
        setInput('');
        setSuggestedActions([]);

        // Save to Supabase so others see I am Ready
        saveGame(lobbyId, newParty, messages);
    };

    const resolveTurn = async () => {
        setIsLoading(true);

        // Collect actions
        const actions = characters.map(c => ({
            characterName: c.name,
            action: c.pendingAction || "Does nothing hesitant."
        }));

        // Server Action
        const dmMsg = await resolveTurnAction(actions, messages);

        // Reset Ready states
        const resetParty = characters.map(c => ({
            ...c,
            isReady: false,
            pendingAction: undefined
        }));

        // Save everything: New message + Reset party states
        const newMessages = [...messages, dmMsg];

        // Update local immediately
        setMessages(newMessages);
        setCharacters(resetParty);

        // Persist
        await saveGame(lobbyId, resetParty, newMessages);

        setIsLoading(false);
    };

    const handleRoll = (resultStr: string, total: number) => {
        handleSend(`I roll the dice: ${resultStr}`, resultStr);
    };

    return (
        <div className="flex flex-col md:flex-row h-screen bg-dnd-dark overflow-hidden text-gray-200 font-body">

            {/* Sidebar */}
            <div className="w-full md:w-1/4 bg-slate-900 border-r border-gray-800 p-4 overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-fantasy text-dnd-gold">The Party</h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onLeaveLobby}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-gray-700 text-gray-400 hover:text-white rounded transition text-xs"
                            title="Leave to Lobby"
                        >
                            ← Lobby
                        </button>
                        <span className={`w-2 h-2 rounded-full ${isLoading ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}></span>
                    </div>
                </div>

                <div className="space-y-4">
                    {characters.map(char => (
                        <div key={char.id} className={`bg-dnd-panel border ${char.isReady ? 'border-green-600' : 'border-gray-700'} rounded-lg p-3 shadow-lg relative overflow-hidden group transition-colors duration-300`}>
                            <div className="flex justify-between items-start mb-2 gap-3">
                                {char.avatarUrl && (
                                    <img src={char.avatarUrl} alt="Av" className="w-10 h-10 rounded-full object-cover border border-gray-500" />
                                )}
                                <div className="flex-1">
                                    <h3 className="font-bold text-white text-sm">{char.name}</h3>
                                    <div className="flex items-center gap-1">
                                        {char.isReady ? (
                                            <span className="text-[10px] text-green-400 flex items-center gap-1 font-bold uppercase"><CheckCircle size={10} /> Ready</span>
                                        ) : (
                                            <span className="text-[10px] text-gray-400 flex items-center gap-1 font-bold uppercase"><Clock size={10} /> Thinking...</span>
                                        )}
                                    </div>
                                </div>
                                {char.hp < char.maxHp * 0.3 && <Skull className="text-red-600 animate-pulse" size={16} />}
                            </div>

                            {/* HP Bar */}
                            <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden mb-2">
                                <div
                                    className={`h-full transition-all duration-500 ${char.hp < char.maxHp * 0.3 ? 'bg-red-600' : 'bg-green-600'}`}
                                    style={{ width: `${Math.max(0, (char.hp / char.maxHp) * 100)}%` }}
                                ></div>
                            </div>
                            <div className="flex justify-between text-xs font-mono mb-2">
                                <span className="flex items-center gap-1"><Heart size={10} className="text-red-500" /> {char.hp}/{char.maxHp}</span>
                                <span className="flex items-center gap-1"><Shield size={10} className="text-blue-400" /> AC {10 + Math.floor((char.stats.DEX - 10) / 2)}</span>
                            </div>

                            {/* Inventory */}
                            {char.inventory.length > 0 && (
                                <div className="pt-2 border-t border-gray-800">
                                    <div className="flex items-center gap-1 text-dnd-gold text-xs font-bold mb-1">
                                        <ScrollText size={12} /> Inventory
                                    </div>
                                    <ul className="text-xs text-gray-400 list-disc list-inside space-y-0.5">
                                        {char.inventory.map((item, idx) => (
                                            <li key={idx}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="mt-8 border-t border-gray-800 pt-4">
                    <div className="flex items-center gap-2 text-dnd-gold mb-2">
                        <MapPin size={16} />
                        <span className="font-fantasy text-sm">Current Location</span>
                    </div>
                    <p className="text-sm text-gray-400 italic">{location}</p>
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col relative">
                <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6" ref={scrollRef}>
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex flex-col ${msg.sender === 'player' ? 'items-end' : 'items-start'}`}>
                            <div
                                className={`
                            max-w-[85%] md:max-w-[75%] rounded-lg p-4 shadow-xl text-base leading-relaxed
                            ${msg.sender === 'player'
                                        ? 'bg-slate-700 text-white rounded-br-none border border-slate-600'
                                        : msg.sender === 'system'
                                            ? 'bg-red-900/30 text-red-200 border border-red-900 w-full text-center text-sm'
                                            : 'bg-slate-800 text-gray-200 rounded-bl-none border border-dnd-gold/30'
                                    }
                        `}
                            >
                                {msg.sender === 'dm' && <span className="block text-xs text-dnd-gold font-bold mb-1 font-fantasy">Dungeon Master</span>}

                                <div className="whitespace-pre-wrap">{renderMarkdown(msg.text)}</div>
                            </div>
                        </div>
                    ))}

                    {/* Thinking / Waiting UI */}
                    {(isLoading || (myCharacter?.isReady && !checkAllPlayersReady(characters))) && (
                        <div className="flex items-center justify-center p-4">
                            <div className="bg-slate-800 p-4 rounded-lg border border-dnd-gold/30 flex items-center gap-3">
                                {isLoading ? (
                                    <>
                                        <div className="w-2 h-2 bg-dnd-gold rounded-full animate-bounce"></div>
                                        <div className="w-2 h-2 bg-dnd-gold rounded-full animate-bounce delay-100"></div>
                                        <div className="w-2 h-2 bg-dnd-gold rounded-full animate-bounce delay-200"></div>
                                        <span className="text-sm text-gray-400">The DM is weaving the fate...</span>
                                    </>
                                ) : (
                                    <span className="text-sm text-green-400 animate-pulse">Waiting for other party members...</span>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <div className="p-4 bg-slate-900 border-t border-gray-800">
                    {suggestedActions.length > 0 && !isLoading && !myCharacter?.isReady && (
                        <div className="flex gap-2 overflow-x-auto pb-3 mb-2 scrollbar-thin">
                            {suggestedActions.map((action, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setInput(action)}
                                    className="whitespace-nowrap px-3 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-full text-xs text-dnd-gold transition"
                                >
                                    {action}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            placeholder={!myCharacter ? "Spectating mode" : myCharacter.isReady ? "Action committed..." : "What do you want to do?"}
                            className="flex-1 bg-slate-800 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-dnd-gold focus:outline-none placeholder-gray-500 shadow-inner disabled:opacity-50"
                            disabled={isLoading || !canAct}
                        />
                        <button
                            onClick={() => handleSend()}
                            disabled={isLoading || !input.trim() || !canAct}
                            className="bg-dnd-gold text-dnd-dark px-6 py-2 rounded-lg font-bold hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
                        >
                            <Send size={18} />
                            <span className="hidden md:inline">{myCharacter?.isReady ? 'Ready' : 'Act'}</span>
                        </button>
                    </div>

                    {canAct && <DiceRoller onRoll={handleRoll} />}
                </div>
            </div>
        </div>
    );
};

export default GameInterface;
