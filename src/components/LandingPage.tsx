'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Zap, BookOpen, Shield, Crown } from 'lucide-react';

interface Props {
    onLogin: () => void;
    onEnter?: () => void;
    onLogout?: () => void;
    isLoading: boolean;
    origin: string;
    isLoggedIn?: boolean;
    userEmail?: string | null;
}

const LandingPage: React.FC<Props> = ({ onLogin, onEnter, onLogout, isLoading, origin, isLoggedIn, userEmail }) => {
    return (
        <div className="relative min-h-screen overflow-hidden bg-dnd-dark text-white font-sans">
            {/* Background Image with Overlay */}
            <div
                className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-40 scale-105 animate-pan-slow"
                style={{ backgroundImage: "url('/background.png')" }}
            ></div>
            <div className="absolute inset-0 z-0 bg-gradient-to-t from-dnd-dark via-dnd-dark/80 to-transparent"></div>

            {/* Header / Nav */}
            {isLoggedIn && (
                <div className="absolute top-0 right-0 z-50 p-6 flex items-center gap-4">
                    <div className="text-right hidden md:block">
                        <p className="text-[10px] uppercase font-bold text-gray-400">Logged in as</p>
                        <p className="text-dnd-gold text-sm font-fantasy">{userEmail}</p>
                    </div>
                    <button
                        onClick={onLogout}
                        className="px-4 py-2 bg-slate-900/50 hover:bg-red-900/50 border border-gray-700 hover:border-red-500 rounded text-xs transition uppercase font-bold"
                    >
                        Logout
                    </button>
                </div>
            )}

            {/* Main Content */}
            <main className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-20 text-center">

                {/* Hero Section */}
                <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                    className="max-w-4xl mx-auto mb-16"
                >
                    <motion.h1
                        className="text-6xl md:text-8xl font-fantasy text-transparent bg-clip-text bg-gradient-to-b from-dnd-gold to-yellow-700 drop-shadow-[0_2px_10px_rgba(212,175,55,0.5)] mb-6"
                        animate={{
                            textShadow: ["0 0 10px rgba(212,175,55,0.2)", "0 0 20px rgba(212,175,55,0.6)", "0 0 10px rgba(212,175,55,0.2)"]
                        }}
                        transition={{ duration: 3, repeat: Infinity }}
                    >
                        AETHERIA
                    </motion.h1>
                    <p className="text-xl md:text-2xl text-gray-300 font-light tracking-wide max-w-2xl mx-auto leading-relaxed">
                        Where your imagination meets the infinite. The first <span className="text-dnd-gold font-bold">AI-Powered</span> Dungeon Master experience.
                    </p>
                </motion.div>

                {/* Action Button */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5, duration: 0.5 }}
                >
                    <button
                        onClick={isLoggedIn ? onEnter : onLogin}
                        disabled={isLoading}
                        className="group relative px-10 py-4 bg-transparent border-2 border-dnd-gold text-dnd-gold font-fantasy text-xl uppercase tracking-widest overflow-hidden transition-all hover:text-dnd-dark hover:border-dnd-gold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <span className="absolute inset-0 w-full h-full bg-dnd-gold transform -translate-x-full group-hover:translate-x-0 transition-transform duration-300 ease-out"></span>
                        <span className="relative flex items-center gap-3">
                            {isLoading ? <Loader2 className="animate-spin" /> : <Crown size={24} />}
                            {isLoading ? 'Summoning Gate...' : (isLoggedIn ? 'Continue Adventure' : 'Enter the Realm')}
                        </span>
                    </button>
                    {!isLoggedIn && <p className="text-xs text-gray-500 mt-4 opacity-70">Requires Google Authentication</p>}
                </motion.div>

                {/* Feature Grid */}
                <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1, duration: 0.8 }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24 max-w-6xl w-full px-4"
                >
                    <FeatureCard
                        icon={<Zap className="text-yellow-400" size={32} />}
                        title="Gemini 2.5 DM"
                        description="Experience a narrator that remembers your backstory, invents epic plots, and manages the rules seamlessly."
                    />
                    <FeatureCard
                        icon={<BookOpen className="text-blue-400" size={32} />}
                        title="Infinite Stories"
                        description="No two adventures are alike. From deep dungeons to floating cities, the world generates as you explore."
                    />
                    <FeatureCard
                        icon={<Shield className="text-red-400" size={32} />}
                        title="D&D 5e Rules"
                        description="Built-in mechanics for ability checks, combat, and inventory management. Roll the dice and let fate decide."
                    />
                </motion.div>

                {/* Footer Config Info */}
                <div className="absolute bottom-4 left-4 text-left opacity-30 hover:opacity-100 transition-opacity">
                    <div className="text-[10px] text-gray-500">
                        <p>Origin: {origin}</p>
                        <p>Build: Next.js 15 / Gemini 2.5</p>
                    </div>
                </div>
            </main>
        </div>
    );
};

const FeatureCard: React.FC<{ icon: React.ReactNode, title: string, description: string }> = ({ icon, title, description }) => (
    <div className="bg-slate-900/50 backdrop-blur-sm border border-gray-800 p-8 rounded-xl hover:border-dnd-gold/50 transition-colors duration-300 group text-left">
        <div className="mb-4 p-3 bg-slate-800 w-fit rounded-lg group-hover:scale-110 transition-transform duration-300">{icon}</div>
        <h3 className="text-xl font-bold text-dnd-gold mb-2 font-fantasy">{title}</h3>
        <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
    </div>
);

export default LandingPage;
