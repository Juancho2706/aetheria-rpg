'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { GameState, Character } from '@/types';
import { loadGame, saveGame } from '@/lib/gameUtils';
import { supabase } from '@/lib/supabase';
import LobbyMenu from '@/components/LobbyMenu';
import { initializeCampaignAction } from '@/app/actions';

import LandingPage from '@/components/LandingPage';
import CharacterCreator from '@/components/CharacterCreator';
import GameInterface from '@/components/GameInterface';
import { Sword, Users, Share2, ClipboardCheck, Loader2, LogOut, Info, AlertTriangle, Home } from 'lucide-react';


const AetheriaApp: React.FC = () => {
    const searchParams = useSearchParams();
    const [gameState, setGameState] = useState<Partial<GameState>>({
        isLoggedIn: false,
        userEmail: null,
        lobbyId: null,
        party: [],
        messages: []
    });
    const [isCreatingChar, setIsCreatingChar] = useState(false);
    const [showCopyConfirm, setShowCopyConfirm] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [inputLobbyId, setInputLobbyId] = useState('');
    const [hasEntered, setHasEntered] = useState(false);
    const [origin, setOrigin] = useState('...');
    const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

    useEffect(() => {
        setOrigin(window.location.origin);
    }, []);

    // 1. Check for Lobby ID in URL or Session Storage (post-login restore)
    useEffect(() => {
        // Next.js: Check usage of searchParams
        const urlLobbyId = searchParams.get('lobbyId');
        const storedLobbyId = sessionStorage.getItem('pendingLobbyId');

        if (urlLobbyId && urlLobbyId !== 'null') {
            setGameState(prev => ({ ...prev, lobbyId: urlLobbyId }));
            setInputLobbyId(urlLobbyId);
        } else if (storedLobbyId && storedLobbyId !== 'null') {
            // Restore lobby ID after OAuth redirect
            setGameState(prev => ({ ...prev, lobbyId: storedLobbyId }));
            setInputLobbyId(storedLobbyId);
            sessionStorage.removeItem('pendingLobbyId');

            // Optional: Clean up URL if desired, though harmless
        }
    }, [searchParams]);

    // 2. Auth Subscription (Handles Google Login State)
    useEffect(() => {
        // Check active session immediately
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user?.email) {
                handleUserAuthenticated(session.user.email);
            }
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user?.email) {
                handleUserAuthenticated(session.user.email);
            } else {
                setGameState(prev => ({ ...prev, isLoggedIn: false, userEmail: null }));
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    // 3. Real-time Lobby Sync (Only when logged in and lobby selected)
    useEffect(() => {
        if (!gameState.lobbyId || !gameState.isLoggedIn) return;

        const fetchGame = async () => {
            const loadedData = await loadGame(gameState.lobbyId!);
            if (loadedData) {
                setGameState(prev => ({
                    ...prev,
                    party: loadedData.party || [],
                    messages: loadedData.messages || []
                }));
            }
        };
        fetchGame();

        const channel = supabase
            .channel(`lobby:${gameState.lobbyId}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'lobbies', filter: `id=eq.${gameState.lobbyId}` },
                (payload) => {
                    const newState = payload.new.game_state;
                    if (newState) {
                        setGameState(prev => ({
                            ...prev,
                            party: newState.party || [],
                            messages: newState.messages || []
                        }));
                    }
                }
            )
            .on('presence', { event: 'sync' }, () => {
                const presenceState = channel.presenceState();
                const users = new Set<string>();
                Object.values(presenceState).forEach((presences: any) => {
                    presences.forEach((p: any) => {
                        if (p.userEmail) users.add(p.userEmail);
                    });
                });
                setOnlineUsers(users);
                console.log("Online Users:", Array.from(users));
            })
            .subscribe(async (status) => {
                console.log(`Lobby Subscription Status: ${status}`);
                if (status === 'CHANNEL_ERROR') {
                    console.error("Failed to connect to lobby channel.");
                }
                if (status === 'SUBSCRIBED') {
                    await channel.track({ userEmail: gameState.userEmail, onlineAt: new Date().toISOString() });
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [gameState.lobbyId, gameState.isLoggedIn]);


    const handleUserAuthenticated = (email: string) => {
        setGameState(prev => ({
            ...prev,
            isLoggedIn: true,
            userEmail: email
        }));
    };

    const handleGoogleLogin = async () => {
        try {
            setIsLoading(true);

            // Save current lobby ID to restore after redirect
            if (gameState.lobbyId) {
                sessionStorage.setItem('pendingLobbyId', gameState.lobbyId);
            } else if (inputLobbyId) {
                sessionStorage.setItem('pendingLobbyId', inputLobbyId);
            }

            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    // Redirect to origin (e.g. localhost:3000) to avoid mismatch errors.
                    // We handle restoring the specific lobby via sessionStorage above.
                    redirectTo: window.location.origin,
                },
            });
            if (error) throw error;
        } catch (error: any) {
            console.error("Login error:", error);
            alert(`Login Failed: ${error.message || 'Unknown error'}. Check your Supabase URL/Keys and Google Console configuration.`);
            setIsLoading(false);
        }
    };

    const handleEnterRealm = () => {
        setHasEntered(true);
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        window.location.reload();
    };

    const handleCreateLobby = async () => {
        setIsLoading(true);
        // Generate random lobby ID
        const randomWords = ['dragon', 'keep', 'myst', 'shadow', 'gold', 'blade', 'storm', 'iron'];
        const randomId = `${randomWords[Math.floor(Math.random() * randomWords.length)]}-${randomWords[Math.floor(Math.random() * randomWords.length)]}-${Math.floor(Math.random() * 1000)}`;

        // Simply setting the state will trigger the useEffect, but let's be explicit
        setInputLobbyId(randomId);
        setGameState(prev => ({ ...prev, lobbyId: randomId }));

        // Update URL
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('lobbyId', randomId);
        window.history.pushState({}, '', newUrl);

        try {
            // Initialize Lobby in DB immediately with empty arrays
            await saveGame(randomId, [], []);
        } catch (e) {
            console.error("Failed to init lobby", e);
        }

        setIsLoading(false);
    };

    const handleLeaveLobby = () => {
        setGameState(prev => ({ ...prev, lobbyId: null, party: [], messages: [] }));
        setInputLobbyId('');
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('lobbyId');
        window.history.pushState({}, '', newUrl);
    };

    const handleStartAdventure = async () => {
        if (!gameState.lobbyId || !gameState.party) return;
        setIsLoading(true);

        try {
            // 1. Call AI to generate intro
            const intro = await initializeCampaignAction(gameState.party);
            if ('error' in intro && intro.error) throw new Error((intro as any).error);

            // 2. Save intro to Supabase -> THIS triggers everyone to switch view
            const initialMessages: any[] = [{
                id: crypto.randomUUID(),
                sender: 'dm',
                text: intro.text,
                timestamp: Date.now()
            }];

            await saveGame(gameState.lobbyId, gameState.party, initialMessages);

            // Local update strictly for immediate feedback, though realtime will catch it too
            setGameState(prev => ({ ...prev, messages: initialMessages }));

        } catch (error: any) {
            console.error("Failed to start adventure:", error);
            alert("Fate refuses to start: " + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleJoinLobby = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputLobbyId) return;

        setIsLoading(true);
        // Just force the state update, the useEffect will handle the loading
        setGameState(prev => ({ ...prev, lobbyId: inputLobbyId }));
        // Update URL without reloading - using Next.js router preferably or window history
        // window.history.pushState({}, '', newUrl) is fine for maintaining 'single page' feel without server route change
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('lobbyId', inputLobbyId);
        window.history.pushState({}, '', newUrl);
        setIsLoading(false);
    };

    const addCharacter = async (char: Character) => {
        setIsCreatingChar(false); // Close modal first for better UX
        const newParty = [...(gameState.party || []), char];

        // Optimistic update
        setGameState(prev => ({ ...prev, party: newParty }));

        if (gameState.lobbyId) {
            try {
                // Ensure we save the FULL game state, not just party
                // We keep existing messages
                await saveGame(gameState.lobbyId, newParty, gameState.messages || []);
                // No need to set state again if optimistic update worked, 
                // but real-time subscription will confirm it shortly.
            } catch (err) {
                console.error("Failed to sync character:", err);
                alert("Failed to save character to lobby. Please try again.");
                // Rollback if needed, but for now let's hope it works
                setGameState(prev => ({
                    ...prev,
                    party: prev.party?.filter(c => c.id !== char.id)
                }));
            }
        }
    };

    const handleShareLobby = () => {
        if (gameState.lobbyId) {
            // In Next.js component, window might not exist on server render, but this is 'use client' and called on click.
            const lobbyLink = `${window.location.origin}${window.location.pathname}?lobbyId=${gameState.lobbyId}`;
            navigator.clipboard.writeText(lobbyLink)
                .then(() => {
                    setShowCopyConfirm(true);
                    setTimeout(() => setShowCopyConfirm(false), 2000);
                })
                .catch(err => console.error("Failed to copy lobby link:", err));
        }
    };

    // --- RENDER STATES ---

    // 1. LANDING PAGE (Only if not logged in)
    if (!gameState.isLoggedIn) {
        return (
            <LandingPage
                onLogin={handleGoogleLogin}
                onEnter={handleEnterRealm}
                onLogout={handleLogout}
                isLoading={isLoading}
                origin={origin}
                isLoggedIn={!!gameState.isLoggedIn}
                userEmail={gameState.userEmail || null}
            />
        );
    }

    // 2. LOGGED IN BUT NO LOBBY SELECTED
    const validLobbyId = gameState.lobbyId && gameState.lobbyId !== 'null' && gameState.lobbyId !== '';

    if (gameState.isLoggedIn && !validLobbyId) {
        return (
            <LobbyMenu
                userEmail={gameState.userEmail || null}
                onCreate={handleCreateLobby}
                onJoin={(id) => {
                    setInputLobbyId(id);
                    setGameState(prev => ({ ...prev, lobbyId: id }));
                    const newUrl = new URL(window.location.href);
                    newUrl.searchParams.set('lobbyId', id);
                    window.history.pushState({}, '', newUrl);
                }}
                onLogout={handleLogout}
                isLoading={isLoading}
            />
        );
    }

    // 3. LOBBY / CHARACTER SELECT
    // Show if game hasn't started OR if I haven't created a character yet (Late Join support)
    const myCharacter = gameState.party?.find(c => c.ownerEmail === gameState.userEmail);
    const gameStarted = gameState.messages && gameState.messages.length > 0;

    if (!gameStarted || !myCharacter) {
        return (
            <div className="min-h-screen bg-dnd-dark text-white p-8 font-body">
                <header className="flex flex-col md:flex-row justify-between items-center mb-12 border-b border-gray-800 pb-4 gap-4">
                    <div>
                        <h1 className="text-3xl font-fantasy text-dnd-gold">Gather Your Party</h1>
                        <p className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                            Lobby ID: <span className="text-white font-mono bg-slate-800 px-2 py-1 rounded">{gameState.lobbyId}</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-right hidden md:block">
                            <p className="text-xs text-gray-400 uppercase font-bold">Logged in as</p>
                            <p className="text-sm text-dnd-gold">{gameState.userEmail}</p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleLeaveLobby}
                                className="bg-slate-800 hover:bg-slate-700 border border-gray-700 text-gray-400 hover:text-white p-2 rounded transition flex items-center justify-center"
                                title="Back to Menu"
                            >
                                <Home size={18} />
                            </button>
                            <button
                                onClick={handleShareLobby}
                                className="bg-blue-900/50 hover:bg-blue-800 border border-blue-800 text-white p-2 rounded transition flex items-center justify-center gap-1 text-sm"
                                title="Share Lobby Link"
                            >
                                <Share2 size={18} />
                            </button>
                            <button
                                onClick={handleLogout}
                                className="bg-slate-800 hover:bg-red-900/50 border border-gray-700 hover:border-red-900 text-gray-400 hover:text-red-200 p-2 rounded transition"
                                title="Logout"
                            >
                                <LogOut size={18} />
                            </button>
                        </div>
                        {showCopyConfirm && (
                            <div className="fixed top-20 right-8 bg-green-600 text-white text-xs px-3 py-2 rounded shadow-lg flex items-center gap-1 z-50 animate-bounce">
                                <ClipboardCheck size={12} /> Link Copied!
                            </div>
                        )}
                    </div>
                </header>

                <div className="max-w-6xl mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                        {/* Existing Characters */}
                        {gameState.party?.map((char) => (
                            <div key={char.id} className={`bg-slate-800 border ${char.ownerEmail === gameState.userEmail ? 'border-dnd-gold shadow-lg shadow-yellow-900/20' : 'border-gray-700'} rounded-lg p-6 relative group flex flex-col items-center transition hover:bg-slate-750`}>
                                {char.avatarUrl ? (
                                    <div className="relative">
                                        <img src={char.avatarUrl} alt={char.name} className="w-24 h-24 rounded-full mb-4 object-cover border-2 border-dnd-gold shadow-md" />
                                        {onlineUsers.has(char.ownerEmail) && (
                                            <div className="absolute bottom-4 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-800 shadow-lg animate-pulse" title="Online in Lobby"></div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <div className="w-24 h-24 bg-slate-700 rounded-full mb-4 flex items-center justify-center text-3xl font-fantasy text-gray-400 border-2 border-gray-600">
                                            {char.name[0]}
                                        </div>
                                        {onlineUsers.has(char.ownerEmail) && (
                                            <div className="absolute bottom-4 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-800 shadow-lg animate-pulse" title="Online in Lobby"></div>
                                        )}
                                    </div>
                                )}

                                <h3 className="text-xl font-bold text-center mb-1 text-white">{char.name}</h3>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-dnd-gold border border-dnd-gold/30">{char.classType}</span>
                                    <span className="text-xs text-gray-400">Lvl {char.level}</span>
                                </div>

                                <p className="text-xs text-gray-500 mb-4 truncate w-full text-center bg-slate-900/50 p-1 rounded">{char.ownerEmail}</p>

                                <div className="w-full grid grid-cols-3 gap-2 text-xs text-center text-gray-400 font-mono">
                                    <div className="bg-slate-900 p-1 rounded border border-gray-700">STR <span className="text-white">{char.stats.STR}</span></div>
                                    <div className="bg-slate-900 p-1 rounded border border-gray-700">DEX <span className="text-white">{char.stats.DEX}</span></div>
                                    <div className="bg-slate-900 p-1 rounded border border-gray-700">INT <span className="text-white">{char.stats.INT}</span></div>
                                </div>
                            </div>
                        ))}

                        {/* Add New Slot */}
                        {(gameState.party?.length || 0) < 4 && !myCharacter && (
                            <button
                                onClick={() => setIsCreatingChar(true)}
                                className="bg-slate-900/30 border-2 border-dashed border-gray-700 rounded-lg p-6 flex flex-col items-center justify-center text-gray-500 hover:text-dnd-gold hover:border-dnd-gold hover:bg-slate-800/50 transition h-80 group"
                            >
                                <div className="w-20 h-20 rounded-full border-2 border-gray-600 group-hover:border-dnd-gold flex items-center justify-center mb-4 transition">
                                    <Users size={32} />
                                </div>
                                <span className="font-bold text-lg">Create Hero</span>
                                <span className="text-sm opacity-60 mt-1">Join the party</span>
                            </button>
                        )}

                        {/* Waiting slot */}
                        {(gameState.party?.length || 0) < 4 && myCharacter && (
                            <div className="bg-slate-900/20 border-2 border-dashed border-gray-800 rounded-lg p-6 flex flex-col items-center justify-center text-gray-600 h-80">
                                <Loader2 className="animate-spin mb-4" size={32} />
                                <span className="text-center">Waiting for others...</span>
                                <span className="text-xs mt-2">{(gameState.party?.length || 0)}/4 Heroes</span>
                            </div>
                        )}
                    </div>

                    <div className="text-center">
                        {(gameState.party?.length || 0) > 0 ? (
                            (() => {
                                const isHost = gameState.party?.[0]?.ownerEmail === gameState.userEmail;
                                return isHost ? (
                                    <button
                                        onClick={handleStartAdventure}
                                        disabled={isLoading}
                                        className="bg-gradient-to-r from-dnd-gold to-yellow-600 text-dnd-dark text-xl font-fantasy px-16 py-4 rounded-lg shadow-lg hover:shadow-yellow-500/20 hover:scale-105 transition duration-300 border border-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mx-auto"
                                    >
                                        {isLoading ? <Loader2 className="animate-spin" /> : 'Venture Forth'}
                                    </button>
                                ) : (
                                    <div className="flex flex-col items-center gap-2 bg-slate-900/50 p-6 rounded-lg border border-gray-800">
                                        <Loader2 className="animate-spin text-dnd-gold mb-2" />
                                        <div className="text-dnd-gold font-fantasy text-xl animate-pulse">Waiting for Party Leader...</div>
                                        <p className="text-xs text-gray-500">Only the first hero ({gameState.party?.[0]?.name}) can start the adventure.</p>
                                    </div>
                                );
                            })()
                        ) : (
                            <p className="text-gray-500 italic">The world awaits your heroes...</p>
                        )}
                    </div>
                </div>

                {isCreatingChar && (
                    <CharacterCreator
                        ownerEmail={gameState.userEmail!}
                        onComplete={addCharacter}
                        onCancel={() => setIsCreatingChar(false)}
                    />
                )}
            </div>
        );
    }

    // 4. MAIN GAME INTERFACE
    return (
        <div className="relative h-screen">
            <GameInterface
                party={gameState.party!}
                userEmail={gameState.userEmail!}
                lobbyId={gameState.lobbyId!}
                initialMessages={gameState.messages}
                onLeaveLobby={handleLeaveLobby}
            />
        </div>
    );
};

export default AetheriaApp;
