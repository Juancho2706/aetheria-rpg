'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sword, Map, ArrowRight, Loader2, Users, Clock, ArrowRightCircle } from 'lucide-react';
import { getUserLobbies } from '@/lib/gameUtils';

interface Props {
    userEmail: string | null;
    onJoin: (lobbyId: string) => void;
    onCreate: () => void;
    onLogout: () => void;
    isLoading: boolean;
}

const LobbyMenu: React.FC<Props> = ({ userEmail, onJoin, onCreate, onLogout, isLoading }) => {
    const [view, setView] = useState<'main' | 'join'>('main');
    const [joinCode, setJoinCode] = useState('');
    const [recentLobbies, setRecentLobbies] = useState<any[]>([]);
    const [isLoadingLobbies, setIsLoadingLobbies] = useState(true);

    useEffect(() => {
        if (userEmail) {
            getUserLobbies(userEmail).then(lobbies => {
                setRecentLobbies(lobbies);
                setIsLoadingLobbies(false);
            });
        }
    }, [userEmail]);

    const handleJoinSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (joinCode.trim()) {
            onJoin(joinCode.trim());
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-dnd-dark text-white p-4 font-sans relative overflow-hidden">
            {/* Decorative Background Elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-900/20 rounded-full blur-[100px] pointer-events-none"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-yellow-900/10 rounded-full blur-[100px] pointer-events-none"></div>

            <div className="max-w-4xl w-full relative z-10">
                {/* Header */}
                <div className="flex justify-between items-start mb-16">
                    <div>
                        <h2 className="text-4xl font-fantasy text-dnd-gold mb-2">Bienvenido, Viajero</h2>
                        <p className="text-gray-400 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500"></span>
                            {userEmail}
                        </p>
                    </div>
                    <button
                        onClick={onLogout}
                        className="text-xs text-gray-500 hover:text-red-400 transition underline"
                    >
                        Cerrar Sesión
                    </button>
                </div>

                {/* Main Choices */}
                {view === 'main' && (
                    <div className="space-y-12">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Create Campaign */}
                            <motion.button
                                whileHover={{ scale: 1.02, borderColor: "rgba(234, 179, 8, 0.8)" }}
                                whileTap={{ scale: 0.98 }}
                                onClick={onCreate}
                                disabled={isLoading}
                                className="bg-slate-800/80 backdrop-blur-md border border-gray-700 p-8 rounded-2xl text-left group transition-all hover:bg-slate-800 hover:shadow-[0_0_30px_rgba(234,179,8,0.1)] flex flex-col justify-between h-64"
                            >
                                <div>
                                    <div className="w-12 h-12 bg-slate-700/50 rounded-xl flex items-center justify-center mb-6 group-hover:bg-dnd-gold/20 group-hover:text-dnd-gold transition-colors">
                                        <Map size={24} />
                                    </div>
                                    <h3 className="text-2xl font-fantasy text-white mb-2 group-hover:text-dnd-gold transition-colors">Crear Campaña</h3>
                                    <p className="text-sm text-gray-400 leading-relaxed">Conviértete en el Anfitrión. Genera un nuevo código de mundo.</p>
                                </div>
                                <div className="flex items-center gap-2 text-dnd-gold font-bold uppercase tracking-wider text-xs opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-[-10px] group-hover:translate-x-0">
                                    {isLoading ? 'Creando...' : 'Iniciar Nuevo Juego'} <ArrowRight size={14} />
                                </div>
                            </motion.button>

                            {/* Join Campaign */}
                            <motion.button
                                whileHover={{ scale: 1.02, borderColor: "rgba(59, 130, 246, 0.8)" }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => setView('join')}
                                disabled={isLoading}
                                className="bg-slate-800/80 backdrop-blur-md border border-gray-700 p-8 rounded-2xl text-left group transition-all hover:bg-slate-800 hover:shadow-[0_0_30px_rgba(59,130,246,0.1)] flex flex-col justify-between h-64"
                            >
                                <div>
                                    <div className="w-12 h-12 bg-slate-700/50 rounded-xl flex items-center justify-center mb-6 group-hover:bg-blue-500/20 group-hover:text-blue-400 transition-colors">
                                        <Users size={24} />
                                    </div>
                                    <h3 className="text-2xl font-fantasy text-white mb-2 group-hover:text-blue-400 transition-colors">Unirse al Grupo</h3>
                                    <p className="text-sm text-gray-400 leading-relaxed">Ingresa un código para unirte a tus amigos.</p>
                                </div>
                                <div className="flex items-center gap-2 text-blue-400 font-bold uppercase tracking-wider text-xs opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-[-10px] group-hover:translate-x-0">
                                    Ingresar Código <ArrowRight size={14} />
                                </div>
                            </motion.button>
                        </div>

                        {/* Recent Lobbies */}
                        {recentLobbies.length > 0 && (
                            <div className="bg-slate-900/50 rounded-2xl p-6 border border-gray-800">
                                <h3 className="text-lg font-bold text-gray-300 mb-4 flex items-center gap-2">
                                    <Clock size={16} /> Reanudar Aventura
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {recentLobbies.map((lobby) => (
                                        <button
                                            key={lobby.id}
                                            onClick={() => onJoin(lobby.id)}
                                            className="flex items-center justify-between p-4 bg-slate-800 border border-gray-700 rounded-lg hover:border-dnd-gold hover:bg-slate-750 transition group text-left"
                                        >
                                            <div>
                                                <div className="font-mono text-dnd-gold font-bold">{lobby.id}</div>
                                                <div className="text-xs text-gray-500 mt-1">
                                                    Último juego: {new Date(lobby.updated_at).toLocaleDateString()}
                                                </div>
                                            </div>
                                            <div className="text-gray-600 group-hover:text-white transition">
                                                <ArrowRightCircle size={20} />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {!isLoadingLobbies && recentLobbies.length === 0 && (
                            <div className="text-center text-gray-600 text-sm">
                                No se encontraron campañas recientes. ¡Inicia una nueva!
                            </div>
                        )}
                    </div>
                )}

                {/* Join Form */}
                {view === 'join' && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="max-w-md mx-auto"
                    >
                        <div className="bg-slate-800/90 border border-gray-700 rounded-2xl p-8 shadow-2xl">
                            <button
                                onClick={() => setView('main')}
                                className="text-gray-500 hover:text-white text-sm mb-6 flex items-center gap-1"
                            >
                                ← Volver
                            </button>

                            <h3 className="text-2xl font-fantasy text-white mb-6">Ingresar Código de Lobby</h3>

                            <form onSubmit={handleJoinSubmit} className="space-y-4">
                                <input
                                    type="text"
                                    value={joinCode}
                                    onChange={(e) => setJoinCode(e.target.value)}
                                    placeholder="ej. dragon-keep-123"
                                    className="w-full bg-slate-900 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-dnd-gold outline-none text-lg text-center tracking-widest font-mono"
                                    autoFocus
                                />
                                <button
                                    type="submit"
                                    disabled={!joinCode.trim() || isLoading}
                                    className="w-full bg-dnd-gold text-dnd-dark font-bold py-3 rounded-lg hover:bg-yellow-500 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {isLoading ? <Loader2 className="animate-spin" /> : 'Unirse a la Aventura'}
                                </button>
                            </form>
                        </div>
                    </motion.div>
                )}
            </div>
        </div>
    );
};

export default LobbyMenu;
