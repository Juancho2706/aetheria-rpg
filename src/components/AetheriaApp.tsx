'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { GameState, Character } from '@/types';
import { loadGame, saveGame } from '@/lib/gameUtils';
import { supabase } from '@/lib/supabase';
import CharacterCreator from '@/components/CharacterCreator';
import GameInterface from '@/components/GameInterface';
import { Sword, Users, Share2, ClipboardCheck, Loader2, LogOut, Info, AlertTriangle } from 'lucide-react';

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

    // 1. Check for Lobby ID in URL or Session Storage (post-login restore)
    useEffect(() => {
        // Next.js: Check usage of searchParams
        const urlLobbyId = searchParams.get('lobbyId');
        const storedLobbyId = sessionStorage.getItem('pendingLobbyId');

        if (urlLobbyId) {
            setGameState(prev => ({ ...prev, lobbyId: urlLobbyId }));
            setInputLobbyId(urlLobbyId);
        } else if (storedLobbyId) {
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
            .subscribe();

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

    const handleLogout = async () => {
        await supabase.auth.signOut();
        window.location.reload();
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

    const addCharacter = (char: Character) => {
        const newParty = [...(gameState.party || []), char];
        setGameState(prev => ({ ...prev, party: newParty }));
        setIsCreatingChar(false);

        if (gameState.lobbyId) {
            saveGame(gameState.lobbyId!, newParty, gameState.messages || []);
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

    // 1. NOT LOGGED IN
    if (!gameState.isLoggedIn) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[url('https://picsum.photos/1920/1080?grayscale&blur=2')] bg-cover bg-center text-white relative">
                <div className="absolute inset-0 bg-slate-900/80"></div>
                <div className="relative z-10 text-center p-8 max-w-lg w-full">
                    <h1 className="text-6xl font-fantasy text-dnd-gold mb-2 drop-shadow-lg">Aetheria</h1>
                    <p className="text-gray-300 text-lg mb-8 font-light">The AI Dungeon Master Experience</p>

                    <div className="bg-slate-800/90 p-8 rounded-lg border border-gray-700 shadow-2xl backdrop-blur-md">
                        <h3 className="text-xl font-bold mb-6">Login to Play</h3>

                        <button
                            onClick={handleGoogleLogin}
                            disabled={isLoading}
                            className="w-full bg-white text-gray-800 font-bold py-3 rounded transition hover:bg-gray-100 flex items-center justify-center gap-3 mb-4 shadow-lg disabled:opacity-50"
                        >
                            {isLoading ? <Loader2 className="animate-spin text-gray-600" /> : (
                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                </svg>
                            )}
                            {isLoading ? 'Connecting...' : 'Sign in with Google'}
                        </button>

                        <p className="text-xs text-gray-500 mt-4">
                            By logging in, you agree to venture into the unknown.
                        </p>

                        {/* Config Helper for Cloud Environments */}
                        <div className="mt-6 p-3 bg-black/60 rounded border border-gray-700 text-left space-y-3">
                            <div>
                                <div className="flex items-center gap-2 text-dnd-gold text-xs font-bold mb-1">
                                    <Info size={12} /> Google Cloud Configuration
                                </div>
                                <p className="text-[10px] text-gray-400 mb-1">
                                    Add this URL to <strong>Authorized JavaScript origins</strong> in Google Cloud Console & <strong>Site URL</strong> in Supabase:
                                </p>
                                <code className="block bg-slate-900 p-2 rounded text-[10px] text-green-400 font-mono break-all select-all cursor-text">
                                    {typeof window !== 'undefined' ? window.location.origin : '...'}
                                </code>
                            </div>

                            <div className="border-t border-gray-700 pt-2">
                                <div className="flex items-center gap-2 text-yellow-500 text-xs font-bold mb-1">
                                    <AlertTriangle size={12} /> Getting Error 403?
                                </div>
                                <p className="text-[10px] text-gray-400">
                                    If you see a <strong>Google 403 (Robot)</strong> error, your app is in "Testing" mode.
                                    Go to <strong>OAuth Consent Screen {'>'} Test Users</strong> in Google Cloud Console and add your email address.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // 2. LOGGED IN BUT NO LOBBY SELECTED
    if (gameState.isLoggedIn && !gameState.lobbyId) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-dnd-dark text-white p-4">
                <div className="w-full max-w-md bg-slate-800 border border-dnd-gold rounded-lg p-8 shadow-2xl relative">
                    <button onClick={handleLogout} className="absolute top-4 right-4 text-gray-500 hover:text-white" title="Logout">
                        <LogOut size={20} />
                    </button>

                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-slate-700 rounded-full mx-auto mb-4 flex items-center justify-center text-2xl font-bold text-dnd-gold">
                            {gameState.userEmail?.[0].toUpperCase()}
                        </div>
                        <h2 className="text-xl font-bold text-dnd-gold">Welcome, Traveler</h2>
                        <p className="text-sm text-gray-400">{gameState.userEmail}</p>
                    </div>

                    <form onSubmit={handleJoinLobby} className="space-y-4">
                        <div>
                            <label className="block text-xs text-gray-500 uppercase font-bold mb-2">Join or Create Lobby</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Enter Lobby ID (e.g. dragon-keep)"
                                    value={inputLobbyId}
                                    onChange={(e) => setInputLobbyId(e.target.value)}
                                    className="flex-1 bg-slate-900 border border-gray-700 rounded px-4 py-2 text-white focus:border-dnd-gold outline-none"
                                />
                            </div>
                            <p className="text-[10px] text-gray-500 mt-1">Tip: Enter a new name to create a new lobby.</p>
                        </div>
                        <button
                            type="submit"
                            disabled={!inputLobbyId}
                            className="w-full bg-dnd-gold text-dnd-dark font-bold py-2 rounded hover:bg-yellow-500 transition disabled:opacity-50"
                        >
                            Enter World
                        </button>
                    </form>

                    <div className="mt-6 pt-6 border-t border-gray-700 text-center">
                        <button
                            onClick={() => {
                                const randomId = Math.random().toString(36).substring(7);
                                setInputLobbyId(randomId);
                            }}
                            className="text-xs text-dnd-gold hover:underline"
                        >
                            Generate Random ID
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // 3. LOBBY / CHARACTER SELECT
    if ((gameState.party && gameState.party.length === 0) || (gameState.party && gameState.messages?.length === 0 && !isCreatingChar && gameState.party.length < 4)) {
        const myCharacter = gameState.party?.find(c => c.ownerEmail === gameState.userEmail);

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
                                    <img src={char.avatarUrl} alt={char.name} className="w-24 h-24 rounded-full mb-4 object-cover border-2 border-dnd-gold shadow-md" />
                                ) : (
                                    <div className="w-24 h-24 bg-slate-700 rounded-full mb-4 flex items-center justify-center text-3xl font-fantasy text-gray-400 border-2 border-gray-600">
                                        {char.name[0]}
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
                            <button
                                onClick={() => setGameState(prev => ({ ...prev, messages: [] }))} // Logic to start game if messages empty or continue
                                // Actually if messages exist, we just render game interface. 
                                // But the condition for this block is "party empty OR messages empty ...".
                                // If party > 0 and messages empty, we show button to start.
                                className="bg-gradient-to-r from-dnd-gold to-yellow-600 text-dnd-dark text-xl font-fantasy px-16 py-4 rounded-lg shadow-lg hover:shadow-yellow-500/20 hover:scale-105 transition duration-300 border border-yellow-400"
                            >
                                Venture Forth
                            </button>
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
            />
            {/* Persistent Logout for testing/stuck states, styled minimally in corner */}
            <button
                onClick={handleLogout}
                className="fixed top-2 right-2 z-50 p-2 text-gray-600 hover:text-red-500 bg-slate-900/50 rounded-full text-xs"
                title="Sign Out"
            >
                <LogOut size={14} />
            </button>
        </div>
    );
};

export default AetheriaApp;
