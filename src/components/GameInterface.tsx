'use client'

import React, { useState, useEffect, useRef } from 'react';
import { Character, Message, DmStateUpdate } from '../types';
import { initializeCampaignAction, resolveTurnAction, generateNarratorAudioAction, summarizeGameAction } from '../app/actions';
import { saveGame, checkAllPlayersReady } from '../lib/gameUtils';
import { supabase } from '../lib/supabase';
import DiceRoller from './DiceRoller';
import CharacterSheet from './CharacterSheet';
import { Send, MapPin, Skull, Shield, Heart, CheckCircle, Clock, HelpCircle, Volume2, Loader2, StopCircle, Settings, Book, X, Feather } from 'lucide-react';

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

    // Journal/Memory State
    const [showJournal, setShowJournal] = useState(false);
    const [isSummarizing, setIsSummarizing] = useState(false); // New blocking state
    const [journalEntries, setJournalEntries] = useState<{ id: string, title?: string, summary_text: string, created_at: string }[]>([]);
    const [latestSummary, setLatestSummary] = useState("");
    const lastSummarizedCount = useRef(0);

    // Load Journal on Mount
    useEffect(() => {
        const fetchJournal = async () => {
            const { data } = await supabase.from('journal_entries').select('*').eq('campaign_id', lobbyId).order('created_at', { ascending: false });
            if (data && data.length > 0) {
                setJournalEntries(data);
                setLatestSummary(data[0].summary_text);
                // Assume messages loaded are fresher than summary? 
                // Ideally we'd truncate messages that are already summarized, but for now we keep them overlapping.
            }
        };
        fetchJournal();
    }, [lobbyId]);

    // Check for Auto-Summary every time messages change
    useEffect(() => {
        const textMessages = messages.filter(m => m.sender === 'dm' || m.sender === 'player');
        const count = textMessages.length;

        // Trigger every 8 messages (approx 1-2 turns)
        if (count > 0 && count % 8 === 0 && count > lastSummarizedCount.current) {
            lastSummarizedCount.current = count;
            handleAutoSummarize(textMessages.slice(-8));
        }
    }, [messages]);

    const handleAutoSummarize = async (recentMsgs: Message[]) => {
        if (isSummarizing) return;
        setIsSummarizing(true);
        console.log("📝 Generating Journal Entry...");

        try {
            const newSummary = await summarizeGameAction(latestSummary, recentMsgs);
            if (newSummary) {
                const title = `Capítulo ${journalEntries.length + 1}`;

                // Save to DB with Self-Healing
                const { error } = await supabase.from('journal_entries').insert({
                    campaign_id: lobbyId,
                    title: title,
                    summary_text: newSummary,
                    turn_number: messages.length
                });

                if (error) {
                    console.warn("⚠️ Journal Insert Failed:", error.message);
                    // Self-Healing: If foreign key fails (Campaign missing), create it
                    if (error.code === '23503') {
                        console.log("🛠️ Healing: Creating missing Campaign record...");
                        await supabase.from('campaigns').upsert({
                            id: lobbyId,
                            user_email: userEmail,
                            name: "Campaña Recuperada",
                            status: 'active'
                        });
                        // Retry Insert
                        await supabase.from('journal_entries').insert({
                            campaign_id: lobbyId,
                            title: title,
                            summary_text: newSummary,
                            turn_number: messages.length
                        });
                    }
                }

                // Update Local
                setLatestSummary(newSummary);
                const { data } = await supabase.from('journal_entries').select('*').eq('campaign_id', lobbyId).order('created_at', { ascending: false });
                if (data) setJournalEntries(data);
            }
        } catch (e) {
            console.error("Summary error:", e);
        } finally {
            setIsSummarizing(false);
        }
    };

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

            // Helper to fetch item
            const fetchOrMockItem = async (name: string, fallbackIdx: number): Promise<any> => {
                try {
                    const { data, error } = await supabase.from('items').select('*').ilike('name', name).maybeSingle();
                    if (data && !error) return { ...data, id: `item-${Date.now()}-${fallbackIdx}` };
                } catch (e) { console.error(e); }

                return {
                    id: `item-${Date.now()}-${fallbackIdx}`,
                    name: name,
                    type: 'Misc',
                    rarity: 'Common',
                    description: 'Objeto sin identificar', // Default fallback
                    icon: '📦'
                };
            };

            const newParty = await Promise.all(characters.map(async char => {
                let newChar = { ...char };

                // HP
                const hpKey = Object.keys(state.hpUpdates || {}).find(k => char.name.toLowerCase().includes(k.toLowerCase()));
                if (hpKey) newChar.hp = state.hpUpdates![hpKey];

                // Inventory Delta: ADD Items
                const addedKey = Object.keys(state.itemsAdded || {}).find(k => char.name.toLowerCase().includes(k.toLowerCase()));
                const legacyKey = Object.keys(state.inventoryUpdates || {}).find(k => char.name.toLowerCase().includes(k.toLowerCase()));

                let itemsToAdd: string[] = [];

                if (addedKey) {
                    // Explicit Add (Trust DM intent to add new item)
                    itemsToAdd = state.itemsAdded![addedKey];
                } else if (legacyKey) {
                    // Legacy Sync (DM lists ALL items) -> Calculate Diff (Add only missing)
                    const existingNames = new Set(newChar.inventory.map(i => i.name.toLowerCase()));
                    itemsToAdd = state.inventoryUpdates![legacyKey].filter(n => !existingNames.has(n.toLowerCase()));
                }

                if (itemsToAdd.length > 0) {
                    const newItems = await Promise.all(itemsToAdd.map((n, i) => fetchOrMockItem(n, i + Date.now())));
                    newChar.inventory = [...newChar.inventory, ...newItems];
                }

                // Inventory Delta: REMOVE Items
                const removedKey = Object.keys(state.itemsRemoved || {}).find(k => char.name.toLowerCase().includes(k.toLowerCase()));
                if (removedKey) {
                    const itemsToRemove = state.itemsRemoved![removedKey];
                    // Remove first matching instance for each item name
                    itemsToRemove.forEach(remName => {
                        const idx = newChar.inventory.findIndex(i => i.name.toLowerCase().includes(remName.toLowerCase()));
                        if (idx !== -1) {
                            newChar.inventory.splice(idx, 1);
                        }
                    });
                }

                // Equipment (Equip/Unequip)
                const equipKey = Object.keys(state.equipmentUpdates || {}).find(k => char.name.toLowerCase().includes(k.toLowerCase()));
                if (equipKey) {
                    const updates = state.equipmentUpdates![equipKey];
                    // Iterate updates: { mainHand: "Sword" }
                    for (const [slot, itemName] of Object.entries(updates)) {
                        // Cast key
                        // Ensure slot is valid keyof Equipment?
                        const validSlots = ["head", "chest", "mainHand", "offHand", "legs", "feet", "amulet", "ring1", "ring2"];
                        if (!validSlots.includes(slot)) continue;

                        const slotKey = slot as keyof typeof newChar.equipment;

                        // Handle UNEQUIP
                        if (!itemName || itemName.toLowerCase() === 'null' || itemName === '') {
                            newChar.equipment[slotKey] = undefined;
                            continue;
                        }

                        // Try to find in inventory first (Moving to slot)
                        // We clone inventory to allow mutation (splice)
                        newChar.inventory = [...newChar.inventory];
                        const invItemIndex = newChar.inventory.findIndex(i => i.name.toLowerCase() === itemName.toLowerCase());

                        if (invItemIndex >= 0) {
                            // Move from inv to equip
                            newChar.equipment[slotKey] = newChar.inventory[invItemIndex];
                            newChar.inventory.splice(invItemIndex, 1);
                        } else {
                            // Not in inventory? Spawn it directly (Magic or previous oversight)
                            newChar.equipment[slotKey] = await fetchOrMockItem(itemName, 999);
                        }
                    }
                }

                return newChar;
            }));

            // Only save if changed
            // JSON.stringify comparison might fail on order, but good enough.
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
        const dmMsg = await resolveTurnAction(actions, messages, latestSummary);

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
        <div className="flex flex-col md:flex-row h-screen bg-black text-gray-200 font-body p-2 gap-2 overflow-hidden">

            {/* Character Sheet Modal - Keep same */}
            {selectedCharacter && (
                <CharacterSheet
                    character={selectedCharacter}
                    onClose={() => setSelectedCharacter(null)}
                />
            )}

            {/* LEFT PANEL: Group (Library Style) */}
            <div className="w-full md:w-1/4 shrink-0 md:min-w-[280px] bg-[#121212] rounded-lg overflow-y-auto flex flex-col">
                <div className="p-4 bg-[#121212] shadow-sm z-10 sticky top-0">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 text-gray-300 hover:text-white transition cursor-pointer">
                            <div className="relative group">
                                <HelpCircle size={20} />
                                <div className="absolute left-0 top-6 w-64 bg-[#282828] border border-gray-700 p-3 rounded shadow-xl text-xs text-gray-300 hidden group-hover:block z-50 pointer-events-none">
                                    <strong className="text-white block mb-1">Guía Rápida</strong>
                                    <p>Aetheria es un RPG narrativo. Declara tu acción y espera al DM.</p>
                                </div>
                            </div>
                            <h2 className="font-bold text-base">Tu Grupo</h2>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowJournal(true)}
                                className="text-gray-400 hover:text-white transition p-1"
                                title="Ver Diario"
                            >
                                <Book size={20} />
                            </button>
                            <button
                                onClick={onLeaveLobby}
                                className="text-gray-400 hover:text-white transition p-1"
                                title="Salir"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Filters / Pills (Decorative) */}
                    <div className="flex gap-2">
                        <span className="px-3 py-1 bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded-full text-xs font-bold text-white cursor-pointer transition">Aventureros</span>
                        <span className="px-3 py-1 bg-[#121212] hover:bg-[#2a2a2a] rounded-full text-xs font-bold text-white cursor-pointer transition">NPCs</span>
                    </div>
                </div>

                <div className="flex-1 p-2 space-y-1 overflow-y-auto">
                    {characters.map(char => (
                        <div
                            key={char.id}
                            onClick={() => setSelectedCharacter(char)}
                            className={`
                                cursor-pointer group flex items-center gap-3 p-2 rounded-md transition-colors
                                ${char.isReady ? 'bg-[#181818] hover:bg-[#282828]' : 'hover:bg-[#1a1a1a]'}
                            `}
                        >
                            {char.avatarUrl ? (
                                <img src={char.avatarUrl} alt="Av" className={`w-12 h-12 rounded bg-[#333] object-cover ${char.hp < char.maxHp * 0.3 ? 'border-2 border-red-500' : ''}`} />
                            ) : (
                                <div className="w-12 h-12 rounded bg-[#333] flex items-center justify-center text-xl text-gray-400">
                                    {char.name.charAt(0)}
                                </div>
                            )}

                            <div className="flex-1 min-w-0">
                                <h3 className={`font-bold text-sm truncate ${char.isReady ? 'text-green-500' : 'text-gray-200'}`}>{char.name}</h3>
                                <p className="text-[11px] text-gray-500 truncate capitalize">{char.classType}</p>
                            </div>

                            {char.isReady && (
                                <div className="text-green-500"><Volume2 size={14} className="animate-pulse" /></div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* CENTER PANEL: Dialogue (Main Feed Style) */}
            <div className="flex-1 bg-[#121212] rounded-lg flex flex-col overflow-hidden relative min-w-0">

                {/* Gradient Header Overlay */}
                <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[#2a2a2a] to-[#121212] opacity-50 pointer-events-none z-0"></div>

                {/* Sticky Header */}
                <div className="h-16 flex items-center justify-between px-6 z-10 sticky top-0 bg-[#121212]/30 backdrop-blur-md">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-dnd-gold flex items-center justify-center shadow-lg shadow-yellow-900/20">
                            {isLoading ? <Loader2 size={16} className="text-black animate-spin" /> : <Shield size={16} className="text-black" />}
                        </div>
                        <span className="font-bold text-white text-lg tracking-tight">Campaña Activa</span>
                    </div>

                    <div className="flex items-center gap-4">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest hidden md:block">
                            TURNO {messages.filter(m => m.sender === 'dm').length || 1}
                        </span>
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className="text-gray-400 hover:text-white transition"
                        >
                            <Settings size={20} />
                        </button>
                    </div>

                    {showSettings && (
                        <div className="absolute top-14 right-6 w-64 bg-[#282828] border border-[#333] rounded shadow-xl p-4 z-50">
                            <h4 className="text-white font-bold mb-3 text-xs uppercase">Volumen</h4>
                            <div className="flex items-center gap-3">
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
                                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-green-500"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Chat Feed */}
                <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4 relative z-10" ref={scrollRef}>
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex flex-col gap-1 group ${msg.sender === 'player' ? 'items-end' : 'items-start'}`}>

                            {/* Sender Name specific for Player to mimic 'Author' line */}
                            {msg.sender === 'dm' && (
                                <span className="text-[11px] font-bold text-dnd-gold ml-1 mb-0.5 opacity-80 flex items-center gap-1">
                                    NARRADOR
                                    <button
                                        onClick={() => handlePlayAudio(msg.id, msg.text)}
                                        disabled={msg.metadata?.audioGenerating && playingAudioId !== msg.id}
                                        className={`ml-2 hover:text-white transition ${playingAudioId === msg.id ? 'text-green-500' : 'text-gray-500'}`}
                                    >
                                        {playingAudioId === msg.id ? <StopCircle size={10} /> : <Volume2 size={10} />}
                                    </button>
                                </span>
                            )}

                            <div
                                className={`
                                    max-w-[90%] md:max-w-[85%] rounded-[1rem] px-4 py-3 text-sm leading-relaxed shadow-sm
                                    ${msg.sender === 'player'
                                        ? 'bg-[#2a2a2a] text-white rounded-br-none hover:bg-[#333] transition-colors'
                                        : msg.sender === 'dm'
                                            ? 'bg-transparent text-gray-300 w-full pl-0 font-serif text-base italic leading-7' // DM looks like lyrics/text on page
                                            : 'bg-red-900/10 text-red-200 w-full text-center text-xs py-2 border border-red-900/20 rounded-md'
                                    }
                                `}
                            >
                                <div className="whitespace-pre-wrap">{renderMarkdown(msg.text)}</div>
                            </div>

                            <span className="text-[10px] text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity px-1">
                                {new Date(Number(msg.id)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    ))}

                    {/* Loaders */}
                    {isLoading && (
                        <div className="flex items-center gap-3 p-4 opacity-50">
                            <div className="flex gap-1">
                                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-bounce"></div>
                                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-bounce delay-100"></div>
                                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-bounce delay-200"></div>
                            </div>
                        </div>
                    )}

                    <div ref={scrollRef} className="h-4" />
                </div>

                {/* Input Area (Bottom) - Floating Look */}
                <div className="p-4 bg-gradient-to-t from-[#121212] via-[#121212] to-transparent">
                    {/* Suggestions "Pills" */}
                    <div className="mb-2 h-8 flex items-center gap-2 overflow-x-auto no-scrollbar">
                        {suggestedActions.map((action, idx) => (
                            <button
                                key={idx}
                                onClick={() => setInput(action)}
                                className="whitespace-nowrap px-3 py-1 bg-[#282828] hover:bg-[#333] rounded-full text-xs text-white transition border border-transparent hover:border-gray-600 shrink-0"
                            >
                                {action}
                            </button>
                        ))}
                    </div>

                    <div className="flex gap-3 h-14">
                        {/* Dice Roller (Compact) */}
                        <div className="w-14 h-14 shrink-0 bg-[#282828] rounded-md overflow-hidden hover:ring-1 hover:ring-gray-500 transition">
                            {canAct ? <DiceRoller onRoll={handleRoll} minimal /> : (
                                <div className="w-full h-full flex items-center justify-center text-gray-600"><HelpCircle size={16} /></div>
                            )}
                        </div>

                        {/* Input Field */}
                        <div className="flex-1 bg-[#282828] rounded-full flex items-center px-4 hover:ring-1 hover:ring-gray-500 transition-all focus-within:ring-1 focus-within:ring-white">
                            <input
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                                }}
                                disabled={!canAct}
                                placeholder={isLoading ? "..." : "¿Qué quieres hacer?"}
                                className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-white placeholder-gray-500 outline-none"
                            />
                            <button
                                onClick={() => handleSend()}
                                disabled={!input.trim() || !canAct}
                                className="ml-2 text-gray-400 hover:text-white disabled:opacity-30 transition"
                            >
                                <Send size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* RIGHT PANEL: Scenario (Now Playing Style) */}
            <div className="w-[350px] bg-[#121212] rounded-lg p-4 flex flex-col hidden lg:flex">
                <div className="flex items-center justify-between mb-4 text-gray-400">
                    <span className="font-bold text-sm hover:underline cursor-pointer decoration-white">Escenario Actual</span>
                    <button className="hover:text-white"><X size={16} /></button>
                </div>

                {/* Cover Image */}
                <div className="w-full aspect-square bg-[#282828] rounded-lg mb-4 overflow-hidden relative group shadow-lg">
                    <img
                        src="https://images.unsplash.com/photo-1519074069444-1ba4fff66d16?q=80&w=600&auto=format&fit=crop"
                        alt="Location"
                        className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#121212] to-transparent opacity-60"></div>
                </div>

                {/* Title Info */}
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-white mb-1 hover:underline decoration-2 cursor-pointer">{location}</h2>
                    <p className="text-sm text-gray-400">Contexto Narrativo</p>
                </div>

                {/* Description Body (Lyrics Style) */}
                <div className="flex-1 overflow-y-auto bg-[#181818] rounded-lg p-4 custom-scrollbar">
                    {latestSummary ? (
                        <div className="text-lg font-bold text-white leading-relaxed">
                            {renderMarkdown(latestSummary)}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-600 text-center gap-2">
                            <span className="text-4xl">🎵</span>
                            <p className="text-sm">Esperando historia...</p>
                        </div>
                    )}
                </div>
            </div>

            {/* JOURNAL MODAL (unchanged logic, just z-index check) */}
            {showJournal && (
                <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-[#121212] text-white w-full max-w-2xl h-[80vh] rounded-xl shadow-2xl flex flex-col relative overflow-hidden border border-gray-800">
                        <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-[#181818]">
                            <h2 className="text-xl font-bold flex items-center gap-3">
                                <Book size={20} className="text-green-500" />
                                Diario de Aventuras
                            </h2>
                            <button onClick={() => setShowJournal(false)}><X size={24} className="text-gray-400 hover:text-white" /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-8 space-y-8">
                            {journalEntries.map((entry, idx) => (
                                <div key={entry.id}>
                                    <h3 className="text-xl font-bold mb-2 text-white">{entry.title}</h3>
                                    <div className="text-gray-300 leading-relaxed font-sans text-base">
                                        {renderMarkdown(entry.summary_text)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};


export default GameInterface;
