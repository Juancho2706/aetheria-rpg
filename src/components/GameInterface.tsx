'use client'

import React, { useState, useEffect, useRef } from 'react';
import { Character, Message, DmStateUpdate } from '../types';
import { initializeCampaignAction, resolveTurnAction, generateNarratorAudioAction } from '../app/actions';
import { saveGame, checkAllPlayersReady } from '../lib/gameUtils';
import { supabase } from '../lib/supabase';
import DiceRoller from './DiceRoller';
import CharacterSheet from './CharacterSheet';
import { Send, MapPin, Skull, Shield, Heart, CheckCircle, Clock, HelpCircle, Volume2, Loader2, StopCircle, Settings } from 'lucide-react';

interface Props {
    party: Character[];
    userEmail: string;
    lobbyId: string;
    initialMessages?: Message[];
    onLeaveLobby: () => void;
}

// Simple Markdown to JSX converter for bold and italic
const renderMarkdown = (text: string) => {
    // Split by bold first
    const boldParts = text.split(/\*\*(.*?)\*\*/g);

    return boldParts.map((part, index) => {
        // Even indices are normal text (or containing italics), odd are bold
        if (index % 2 === 1) {
            return <strong key={`bold-${index}`}>{part}</strong>;
        } else {
            // Process italics within non-bold parts
            const italicParts = part.split(/\*(.*?)\*/g);
            return (
                <span key={`text-${index}`}>
                    {italicParts.map((subPart, subIndex) => {
                        if (subIndex % 2 === 1) {
                            return <em key={`em-${index}-${subIndex}`}>{subPart}</em>;
                        }
                        return subPart;
                    })}
                </span>
            );
        }
    });
};

const GameInterface: React.FC<Props> = ({ party, userEmail, lobbyId, initialMessages = [], onLeaveLobby }) => {
    const [messages, setMessages] = useState<Message[]>(initialMessages);
    const [characters, setCharacters] = useState<Character[]>(party);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [location, setLocation] = useState('Desconocido');
    const [suggestedActions, setSuggestedActions] = useState<string[]>([]);
    const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Audio State
    const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
    const [audioCache, setAudioCache] = useState<Map<string, string>>(new Map()); // Message ID -> Base64 Audio/URL
    const [volume, setVolume] = useState(1);
    const [showSettings, setShowSettings] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const handlePlayAudio = async (msgId: string, text: string) => {
        if (playingAudioId === msgId) {
            // Stop logic
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
            setPlayingAudioId(null);
            return;
        }

        // Stop any previous audio
        if (audioRef.current) {
            audioRef.current.pause();
        }

        setPlayingAudioId(msgId); // Local loading/playing state

        try {
            // 1. Check if we already have a URL in the message metadata (Sync from other users)
            const currentMsg = messages.find(m => m.id === msgId);
            let audioSrc = currentMsg?.metadata?.audioUrl || audioCache.get(msgId);

            // 2. If not, generate it (Server will check Storage or Generate New)
            if (!audioSrc) {

                // NEW: Broadcast "Generating..." state so others don't click
                const generatingMessages = messages.map(m =>
                    m.id === msgId
                        ? { ...m, metadata: { ...m.metadata, audioGenerating: true } }
                        : m
                );
                // Optimistic update
                setMessages(generatingMessages);
                // Broadcast
                saveGame(lobbyId, characters, generatingMessages);

                // Build Voice Map
                const voiceMap: Record<string, string> = {};
                characters.forEach(c => {
                    if (c.voiceId) voiceMap[c.name] = c.voiceId;
                });

                // Call Server Action
                const result = await generateNarratorAudioAction(text, voiceMap, msgId);

                if (result.startsWith('http')) {
                    audioSrc = result;

                    // SAVE PERSISTENCE!
                    // Update local message state: Add URL AND Remove Generating flag
                    const updatedMessages = messages.map(m =>
                        m.id === msgId
                            ? { ...m, metadata: { ...m.metadata, audioUrl: audioSrc, audioGenerating: false } }
                            : m
                    );
                    setMessages(updatedMessages);

                    // Trigger Save to Supabase so others get the URL and see it finished
                    saveGame(lobbyId, characters, updatedMessages);

                } else {
                    // It's Base64 WAV (Server generated) - Use Data URI directly
                    audioSrc = `data:audio/wav;base64,${result}`;

                    const updatedMessages = messages.map(m =>
                        m.id === msgId
                            ? { ...m, metadata: { ...m.metadata, audioGenerating: false } } // Clear flag
                            : m
                    );
                    setMessages(updatedMessages);
                    saveGame(lobbyId, characters, updatedMessages);
                }

                // Update Cache
                setAudioCache(prev => new Map(prev).set(msgId, audioSrc!));
            }

            // Play
            const audio = new Audio(audioSrc);
            audio.volume = volume;
            audioRef.current = audio;

            audio.onended = () => setPlayingAudioId(null);
            audio.onerror = (e) => {
                console.error("Audio Load Error:", e);
                setPlayingAudioId(null);
                alert("Error al cargar el audio.");
            };

            await audio.play();

        } catch (error) {
            console.error("Audio playback error:", error);
            setPlayingAudioId(null);

            // Clear generating flag on error
            const updatedMessages = messages.map(m =>
                m.id === msgId
                    ? { ...m, metadata: { ...m.metadata, audioGenerating: false } }
                    : m
            );
            setMessages(updatedMessages);
            saveGame(lobbyId, characters, updatedMessages);

            alert("No se pudo generar el audio del narrador.");
        }
    };

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
            // Reverse loop to find the last DM state (in case user chatted after)
            for (let i = messages.length - 1; i >= 0; i--) {
                const msg = messages[i];
                if (msg.metadata?.dmState) {
                    handleDmUpdate(msg.metadata.dmState);
                    break;
                }
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
    };

    const handleDmUpdate = async (state: DmStateUpdate) => {
        if (state.location && state.location !== location) setLocation(state.location);
        if (state.suggestedActions) setSuggestedActions(state.suggestedActions);

        // Optimistic / Leader-driven update:
        if (characters.length > 0 && characters[0].ownerEmail === userEmail) {
            // I am leader, I should apply updates and save them.
            const newParty = characters.map(char => {
                let newChar = { ...char };
                const hpKey = Object.keys(state.hpUpdates || {}).find(k => char.name.toLowerCase().includes(k.toLowerCase()));
                if (hpKey) newChar.hp = state.hpUpdates![hpKey];

                const invKey = Object.keys(state.inventoryUpdates || {}).find(k => char.name.toLowerCase().includes(k.toLowerCase()));
                if (invKey) {
                    // MOCK IMPLEMENTATION: Convert string[] to Item[]
                    // Since the AI returns strings, we wrap them in basic Item objects
                    newChar.inventory = state.inventoryUpdates![invKey].map((itemName, idx) => ({
                        id: `item-${Date.now()}-${idx}`,
                        name: itemName,
                        type: 'Misc',
                        rarity: 'Common',
                        description: 'Objeto sin identificar',
                        icon: '📦'
                    }));
                }

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

        // Show player action immediately in chat
        const playerMsg: Message = {
            id: Date.now().toString(),
            sender: 'player',
            text: fullAction,
            timestamp: Date.now()
        };

        const updatedMessages = [...messages, playerMsg];
        setMessages(updatedMessages);

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

        // Save to Supabase so others see I am Ready AND see my message
        saveGame(lobbyId, newParty, updatedMessages);
    };

    const resolveTurn = async () => {
        setIsLoading(true);

        // Collect actions
        const actions = characters.map(c => ({
            characterName: c.name,
            action: c.pendingAction || "No hace nada, duda."
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
        handleSend(`Lanzo los dados: ${resultStr}`, resultStr);
    };

    return (
        <div className="flex flex-col md:flex-row h-screen bg-dnd-dark overflow-hidden text-gray-200 font-body">

            {/* Character Sheet Modal */}
            {selectedCharacter && (
                <CharacterSheet
                    character={selectedCharacter}
                    onClose={() => setSelectedCharacter(null)}
                />
            )}

            {/* Sidebar */}
            <div className="w-full md:w-1/4 bg-slate-900 border-r border-gray-800 p-4 overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                        <div className="relative group">
                            <HelpCircle size={18} className="text-gray-500 hover:text-dnd-gold cursor-help" />
                            <div className="absolute left-0 top-6 w-64 bg-slate-950 border border-dnd-gold/30 p-3 rounded shadow-xl text-xs text-gray-300 hidden group-hover:block z-50 pointer-events-none">
                                <strong className="text-dnd-gold block mb-1">Mecánicas de Juego</strong>
                                <p className="mb-2">Aetheria es un RPG narrativo colaborativo. El DM (IA) narra la historia y tú decides qué hacer.</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li><strong>Turnos:</strong> Todos declaran su acción. Cuando todos estén listos, el DM resuelve el turno.</li>
                                    <li><strong>Combate:</strong> Si hay combate, tira iniciativa y ataques usando la bandeja de dados.</li>
                                    <li><strong>Inventario:</strong> Haz click en tu personaje para ver su hoja detallada.</li>
                                </ul>
                            </div>
                        </div>

                        <h2 className="text-xl font-fantasy text-dnd-gold">El Grupo</h2>
                    </div>
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
                        <div
                            key={char.id}
                            onClick={() => setSelectedCharacter(char)}
                            className={`
                                cursor-pointer
                                bg-dnd-panel border ${char.isReady ? 'border-green-600/50' : 'border-gray-700'} 
                                hover:border-dnd-gold/80 hover:shadow-lg hover:shadow-yellow-900/10 hover:-translate-y-0.5
                                rounded-lg p-3 shadow relative overflow-hidden group transition-all duration-300
                            `}
                        >
                            {/* Hover Overlay Hint */}
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
                                <span className="text-xs font-bold text-white bg-black/60 px-2 py-1 rounded border border-white/20">Ver Ficha</span>
                            </div>

                            <div className="flex justify-between items-start mb-2 gap-3 relative z-10 transition group-hover:blur-[1px]">
                                {char.avatarUrl ? (
                                    <img src={char.avatarUrl} alt="Av" className="w-12 h-12 rounded-lg object-cover border border-gray-600 shadow-md" />
                                ) : (
                                    <div className="w-12 h-12 bg-slate-800 rounded-lg border border-gray-700 flex items-center justify-center text-xl shadow-md">👤</div>
                                )}
                                <div className="flex-1">
                                    <h3 className="font-bold text-gray-100 text-sm">{char.name}</h3>
                                    <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">{char.classType} • Niv {char.level}</p>

                                    <div className="flex items-center gap-1">
                                        {char.isReady ? (
                                            <span className="text-[10px] text-green-400 flex items-center gap-1 font-bold uppercase py-0.5 px-1.5 bg-green-950/30 rounded border border-green-900/50"><CheckCircle size={10} /> Listo</span>
                                        ) : (
                                            <span className="text-[10px] text-gray-400 flex items-center gap-1 font-bold uppercase py-0.5 px-1.5 bg-slate-800 rounded border border-gray-700"><Clock size={10} /> Pensando...</span>
                                        )}
                                    </div>
                                </div>
                                {char.hp < char.maxHp * 0.3 && <Skull className="text-red-500 animate-pulse" size={16} />}
                            </div>

                            {/* HP Bar - Slimmer */}
                            <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden mb-2 relative z-10">
                                <div
                                    className={`h-full transition-all duration-500 ${char.hp < char.maxHp * 0.3 ? 'bg-red-600' : 'bg-green-600'}`}
                                    style={{ width: `${Math.max(0, (char.hp / char.maxHp) * 100)}%` }}
                                ></div>
                            </div>

                            <div className="flex justify-between text-xs font-mono mb-1 relative z-10 text-gray-400">
                                <span className="flex items-center gap-1"><Heart size={10} className="text-red-500" /> {char.hp}/{char.maxHp}</span>
                                <span className="flex items-center gap-1"><Shield size={10} className="text-blue-400" /> AC {10 + Math.floor((char.stats.DEX - 10) / 2)}</span>
                            </div>

                            {/* Recent Loot: Show only last 3 items as small icons */}
                            {char.inventory.length > 0 && (
                                <div className="pt-2 border-t border-gray-800 mt-1 relative z-10">
                                    <div className="flex gap-1 overflow-hidden">
                                        {char.inventory.slice(-4).reverse().map((item, idx) => (
                                            <div key={idx} className="w-6 h-6 bg-slate-900 border border-gray-700 rounded flex items-center justify-center text-[10px] text-gray-500" title={item.name}>
                                                {item.icon || '📦'}
                                            </div>
                                        ))}
                                        {char.inventory.length > 4 && (
                                            <div className="w-6 h-6 flex items-center justify-center text-[9px] text-gray-500 font-bold">+{(char.inventory.length - 4)}</div>
                                        )}
                                    </div>
                                </div>
                            )}

                        </div>
                    ))}
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col relative">

                {/* Top Status Bar (Turns & Location) */}
                <div className="h-12 bg-slate-950 border-b border-gray-800 flex items-center justify-between px-6 shadow-md z-10 relative">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className="text-gray-400 hover:text-dnd-gold transition p-1 rounded"
                            title="Configuración"
                        >
                            <Settings size={18} />
                        </button>

                        {/* Settings Dropdown */}
                        {showSettings && (
                            <div className="absolute top-12 left-4 w-64 bg-slate-900 border border-dnd-gold rounded shadow-xl p-4 z-50">
                                <h4 className="text-dnd-gold font-bold mb-3 text-sm uppercase">Configuración de Audio</h4>
                                <div className="flex items-center gap-2">
                                    <Volume2 size={16} className="text-gray-400" />
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.1"
                                        value={volume}
                                        onChange={(e) => {
                                            const newVol = parseFloat(e.target.value);
                                            setVolume(newVol);
                                            if (audioRef.current) audioRef.current.volume = newVol;
                                        }}
                                        className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-dnd-gold"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-2 text-dnd-gold border-l border-gray-800 pl-4">
                            <Clock size={16} />
                            <span className="font-fantasy tracking-wider text-sm">Turno {messages.filter(m => m.sender === 'dm').length || 1}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 text-gray-300">
                        <MapPin size={16} className="text-dnd-gold" />
                        <span className="text-sm font-semibold italic truncate">{location}</span>
                    </div>
                </div>

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
                                {msg.sender === 'dm' && (
                                    <div className="flex items-center justify-between mb-1 border-b border-red-900/30 pb-1">
                                        <span className="text-xs text-dnd-gold font-bold font-fantasy">Dungeon Master</span>
                                        <button
                                            onClick={() => handlePlayAudio(msg.id, msg.text)}
                                            disabled={msg.metadata?.audioGenerating && playingAudioId !== msg.id}
                                            className={`
                                                p-1 rounded-full transition 
                                                ${playingAudioId === msg.id || msg.metadata?.audioGenerating
                                                    ? 'text-red-400 cursor-wait'
                                                    : 'text-gray-500 hover:text-dnd-gold hover:bg-red-900/40'}
                                                ${msg.metadata?.audioGenerating && playingAudioId !== msg.id ? 'opacity-50' : ''}
                                            `}
                                            title={playingAudioId === msg.id ? "Detener" : msg.metadata?.audioGenerating ? "Generando audio..." : "Escuchar Narración"}
                                        >
                                            {playingAudioId === msg.id || msg.metadata?.audioGenerating ? (
                                                <div className="relative">
                                                    {playingAudioId === msg.id && !audioRef.current?.paused ? (
                                                        <StopCircle size={16} /> // Playing -> Stop
                                                    ) : (
                                                        <Loader2 size={16} className="animate-spin" /> // Generating or Loading
                                                    )}
                                                </div>
                                            ) : (
                                                <Volume2 size={14} />
                                            )}
                                        </button>
                                    </div>
                                )}

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
                                        <span className="text-sm text-gray-400">El DM está tejiendo el destino...</span>
                                    </>
                                ) : (
                                    <span className="text-sm text-green-400 animate-pulse">Esperando a otros miembros del grupo...</span>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Bottom Area: Dice (Left) + Input Group (Right) */}
                <div className="p-4 bg-slate-950 border-t border-gray-800 flex gap-4 h-48 md:h-40">

                    {/* LEFT: Dice Roller (Red Zone) */}
                    <div className="w-1/4 min-w-[120px] max-w-[200px]">
                        {canAct ? (
                            <DiceRoller onRoll={handleRoll} />
                        ) : (
                            <div className="h-full border border-ray-700/50 rounded-lg flex items-center justify-center text-gray-500 text-xs text-center p-2 bg-slate-900/50">
                                <span>No puedes lanzar ahora</span>
                            </div>
                        )}
                    </div>

                    {/* RIGHT: Input Group (Green + Grey + Yellow) */}
                    <div className="flex-1 flex flex-col gap-2">

                        {/* TOP: Suggestions (Green Zone) */}
                        <div className="h-8 flex items-center">
                            {suggestedActions.length > 0 && !isLoading && !myCharacter?.isReady ? (
                                <div className="flex gap-2 overflow-x-auto scrollbar-thin w-full items-center">
                                    <span className="text-[10px] text-green-500 font-bold uppercase tracking-wider mr-2 shrink-0">Sugerencias:</span>
                                    {suggestedActions.map((action, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setInput(action)}
                                            className="whitespace-nowrap px-3 py-1 bg-green-900/20 hover:bg-green-900/40 border border-green-800 hover:border-green-500 rounded text-xs text-green-400 transition"
                                        >
                                            {action}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <span className="text-[10px] text-gray-600 italic">Escribe tu acción o espera sugerencias...</span>
                            )}
                        </div>

                        {/* BOTTOM: Input (Grey) + Button (Yellow) */}
                        <div className="flex-1 flex gap-2">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                placeholder={!myCharacter ? "Modo Espectador" : myCharacter.isReady ? "Accion enviada esperanda resolucion..." : "¿Qué quieres hacer?"}
                                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-dnd-gold focus:outline-none placeholder-gray-500 shadow-inner resize-none text-sm"
                                disabled={isLoading || !canAct}
                            />

                            <button
                                onClick={() => handleSend()}
                                disabled={isLoading || !input.trim() || !canAct}
                                className="w-24 bg-dnd-gold hover:bg-yellow-400 text-dnd-dark font-bold rounded-lg shadow-lg flex flex-col items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                                <Send size={20} />
                                <span className="text-xs uppercase tracking-wider font-extrabold">Actuar</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GameInterface;
