'use client'

import React, { useState } from 'react';
import { Character, ClassType, Stats, StatName, CLASS_DESCRIPTIONS, CLASS_NAMES, CLASS_PRESETS } from '../types';
import { CLASS_STARTER_GEAR } from '../lib/gameData';
import { Minus, Plus, RefreshCw, Dices, Upload, Shield, Heart, HelpCircle, Sparkles, Loader2, Volume2 } from 'lucide-react';
import { generateCharacterDetailsAction } from '../app/actions';


interface Props {
    ownerEmail: string;
    onComplete: (char: Character) => void;
    onCancel: () => void;
}

const POINT_BUY_TOTAL = 27;
const MIN_SCORE = 8;
const MAX_SCORE = 15;

const SCORE_COSTS: Record<number, number> = {
    8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9
};

const RECOMMENDED_STATS: Record<ClassType, StatName[]> = {
    Fighter: ['STR', 'CON'],
    Wizard: ['INT', 'CON'],
    Rogue: ['DEX', 'CHA'],
    Cleric: ['WIS', 'CON'],
    Paladin: ['STR', 'CHA'],
    Ranger: ['DEX', 'WIS']
};

const VOICE_OPTIONS = {
    male: [
        { id: 'Puck', name: 'Puck (Travieso)' },
        { id: 'Charon', name: 'Charon (Profundo)' },
        { id: 'Fenrir', name: 'Fenrir (Intenso)' }
    ],
    female: [
        { id: 'Aoede', name: 'Aoede (Elegante)' },
        { id: 'Kore', name: 'Kore (Calma)' }
    ]
};


const CharacterCreator: React.FC<Props> = ({ ownerEmail, onComplete, onCancel }) => {
    const [name, setName] = useState('');
    const [classType, setClassType] = useState<ClassType>('Fighter');
    // Initialize with Fighter preset
    const [stats, setStats] = useState<Stats>(CLASS_PRESETS['Fighter']);
    const [bio, setBio] = useState('');
    const [personality, setPersonality] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
    const [voiceId, setVoiceId] = useState('Puck'); // Default
    const [isGenerating, setIsGenerating] = useState(false);
    const [voiceSamples, setVoiceSamples] = useState<Record<string, string>>({});
    const [previewPlaying, setPreviewPlaying] = useState<string | null>(null);

    // Load samples on mount
    React.useEffect(() => {
        const loadSamples = async () => {
            console.log("🎤 CharacterCreator mounted. Requesting voice samples...");
            await new Promise(r => setTimeout(r, 1000));

            try {
                const samples = await import('../app/actions').then(mod => mod.ensureVoiceSamplesAction());
                console.log("🎤 Voice Samples Result:", samples);
                setVoiceSamples(samples);
            } catch (e) {
                console.error("Failed to load voice samples", e);
            }
        };
        loadSamples();
    }, []);

    const handlePlayPreview = async (vId: string) => {
        if (previewPlaying) return;
        setPreviewPlaying(vId);

        try {
            const url = voiceSamples[vId];
            if (url) {
                console.log(`▶️ Playing voice preview for ${vId}:`, url);
                const audio = new Audio(url);
                audio.onended = () => setPreviewPlaying(null);
                audio.onerror = () => setPreviewPlaying(null);
                await audio.play();
            } else {
                // Fallback if not ready yet
                const u = new SpeechSynthesisUtterance(`Soy ${vId}.`);
                u.onend = () => setPreviewPlaying(null);
                window.speechSynthesis.speak(u);
            }
        } catch (e) {
            console.error(e);
            setPreviewPlaying(null);
        }
    };


    const calculateModifier = (val: number) => Math.floor((val - 10) / 2);

    const calculateCost = (currentStats: Stats) => {
        return Object.values(currentStats).reduce((acc, val) => acc + (SCORE_COSTS[val] || 0), 0);
    };

    const usedPoints = calculateCost(stats);
    const remainingPoints = POINT_BUY_TOTAL - usedPoints;

    const handleStatChange = (stat: StatName, delta: number) => {
        const currentVal = stats[stat];
        const newVal = currentVal + delta;

        if (newVal < MIN_SCORE || newVal > MAX_SCORE) return;

        const currentCost = SCORE_COSTS[currentVal];
        const newCost = SCORE_COSTS[newVal];
        const costDiff = newCost - currentCost;

        if (delta > 0 && remainingPoints < costDiff) return;

        setStats(prev => ({ ...prev, [stat]: newVal }));
    };

    const resetStats = () => {
        setStats({ STR: 8, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 });
    };

    const handleRandomizeStats = () => {
        // Reset first
        let currentStats = { STR: 8, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 };
        let remaining = POINT_BUY_TOTAL;

        // Try to spend points randomly
        let safety = 0;
        while (remaining > 0 && safety < 100) {
            safety++;
            const keys = (Object.keys(currentStats) as StatName[]);
            const randomStat = keys[Math.floor(Math.random() * keys.length)];
            const currentVal = currentStats[randomStat];

            if (currentVal >= MAX_SCORE) continue; // Skip if maxed

            const cost = SCORE_COSTS[currentVal + 1] - SCORE_COSTS[currentVal];

            if (remaining >= cost) {
                currentStats[randomStat]++;
                remaining -= cost;
            }
        }
        setStats(currentStats);
    };


    const handleGenerateAI = async () => {
        setIsGenerating(true);
        const details = await generateCharacterDetailsAction(classType, name);
        setBio(details.bio);
        setPersonality(details.personality);
        setIsGenerating(false);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Limit to 1MB
        if (file.size > 1024 * 1024) {
            alert("Image is too large. Please choose an image under 1MB.");
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            setAvatarUrl(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const hitDie = classType === 'Wizard' ? 6 : classType === 'Fighter' ? 10 : 8;
        const conMod = calculateModifier(stats.CON);
        const maxHp = Math.max(1, hitDie + conMod); // Ensure at least 1 HP

        const starterKit = CLASS_STARTER_GEAR[classType] || {};

        const newChar: Character = {
            id: Date.now().toString(),
            name: name || 'Unknown Hero',
            ownerEmail,
            classType,
            level: 1,
            hp: maxHp,
            maxHp,
            stats,
            bio,
            personality,
            avatarUrl,
            voiceId,
            inventory: starterKit.inventory || [],
            equipment: {
                head: undefined,
                chest: starterKit.chest || undefined,
                mainHand: starterKit.mainHand || undefined,
                offHand: starterKit.offHand || undefined,
                legs: undefined,
                feet: undefined,
                amulet: undefined,
                ring1: undefined,
                ring2: undefined
            },
            isReady: false // Initial state
        };
        onComplete(newChar);
    };

    const handleClassChange = (newClass: ClassType) => {
        setClassType(newClass);
        setStats(CLASS_PRESETS[newClass]);
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-dnd-panel border-2 border-dnd-gold rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col relative">

                {/* Help Tooltip - Moved to Top Right of Modal */}
                <div className="absolute top-4 right-6 group z-50">
                    <HelpCircle size={24} className="text-gray-500 hover:text-dnd-gold cursor-help" />
                    <div className="absolute right-0 top-8 w-72 bg-slate-950 border border-dnd-gold/30 p-4 rounded shadow-xl text-xs text-gray-300 hidden group-hover:block pointer-events-none">
                        <strong className="text-dnd-gold block mb-2 text-sm border-b border-gray-800 pb-1">Reglas de Creación</strong>
                        <ul className="list-disc list-inside space-y-1">
                            <li><strong>Clase y Rol:</strong> Define tus habilidades y tu equipo.</li>
                            <li><strong>Atributos (Point Buy):</strong> Tienes 27 puntos. Empiezas con una distribución base sugerida para tu clase, pero puedes modificarla.
                                <ul className="pl-4 text-gray-400 mt-1">
                                    <li>8-13: 1 punto</li>
                                    <li>13-15: 2 puntos</li>
                                </ul>
                            </li>
                            <li><strong>Personalidad:</strong> Usa la IA para generar una identidad única o escríbela tú mismo.</li>
                            <li className="pt-2 border-t border-gray-800 mt-2"><strong>Estadísticas Derivadas:</strong>
                                <ul className="pl-4 text-gray-400 mt-1">
                                    <li><span className="text-red-400">♥ HP (Vida):</span> Resistencia al daño. [Clase + Con]</li>
                                    <li><span className="text-blue-400">🛡️ AC (Defensa):</span> Dificultad para ser golpeado. [10 + Dex]</li>
                                </ul>
                            </li>
                        </ul>
                    </div>
                </div>

                <div className="p-6 flex-1 overflow-y-auto">
                    <h2 className="text-3xl font-fantasy text-dnd-gold mb-6 text-center border-b border-gray-700 pb-4">Crear Héroe</h2>

                    <form onSubmit={handleSubmit} className="space-y-8">
                        <div className="flex flex-col md:flex-row gap-6">
                            {/* Avatar Upload */}
                            <div className="flex flex-col items-center gap-4">
                                <div className="relative w-32 h-32 bg-gray-900 rounded-lg border-2 border-gray-700 flex items-center justify-center overflow-hidden">
                                    {avatarUrl ? (
                                        <img src={avatarUrl} alt="Character Avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        <Upload className="text-gray-600" size={32} />
                                    )}
                                </div>

                                <label className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded cursor-pointer transition text-sm border border-gray-600">
                                    <Upload size={16} />
                                    <span>Subir Retrato</span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleFileUpload}
                                    />
                                </label>
                                <p className="text-[10px] text-gray-500">Max 1MB</p>
                            </div>

                            {/* Basic Info */}
                            <div className="flex-1 grid grid-cols-1 gap-6">
                                <div>
                                    <label className="block text-gray-400 mb-2 font-bold uppercase text-xs tracking-wider">Nombre</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full bg-slate-800 border border-gray-600 rounded p-3 text-white focus:border-dnd-gold outline-none transition"
                                        placeholder="e.g. Valeros"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-gray-400 mb-2 font-bold uppercase text-xs tracking-wider">Clase</label>
                                    <select
                                        value={classType}
                                        onChange={(e) => handleClassChange(e.target.value as ClassType)}
                                        className="w-full bg-slate-800 border border-gray-600 rounded p-3 text-white focus:border-dnd-gold outline-none"
                                    >
                                        {(Object.keys(CLASS_NAMES) as ClassType[]).map(c => (
                                            <option key={c} value={c}>{CLASS_NAMES[c]}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-800/50 p-4 rounded text-sm text-gray-300 italic border-l-2 border-dnd-gold">
                            {CLASS_DESCRIPTIONS[classType]}
                        </div>

                        {/* Point Buy Stats */}
                        <div className="bg-slate-900/50 p-6 rounded-lg border border-gray-700 relative">

                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <label className="text-dnd-gold font-fantasy text-xl">Atributos</label>
                                    <p className="text-xs text-gray-400">Puntos Restantes (Min 8, Max 15)</p>
                                </div>

                                <div className="flex flex-col items-end">
                                    <div className="text-sm font-bold text-gray-300 mb-1">Puntos Disponibles</div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-32 h-3 bg-gray-700 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full transition-all duration-300 ${remainingPoints === 0 ? 'bg-green-500' : 'bg-dnd-gold'}`}
                                                style={{ width: `${(remainingPoints / POINT_BUY_TOTAL) * 100}%` }}
                                            ></div>
                                        </div>
                                        <span className={`text-xl font-bold ${remainingPoints < 0 ? 'text-red-500' : 'text-white'}`}>
                                            {remainingPoints} <span className="text-gray-500 text-sm">/ {POINT_BUY_TOTAL}</span>
                                        </span>
                                        <button
                                            type="button"
                                            onClick={handleRandomizeStats}
                                            className="ml-2 p-1 text-dnd-gold hover:text-yellow-400 transition animate-pulse hover:animate-none"
                                            title="Roll Random Stats"
                                        >
                                            <Dices size={20} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={resetStats}
                                            className="p-1 text-gray-500 hover:text-white transition"
                                            title="Reset Stats"
                                        >
                                            <RefreshCw size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                {(Object.keys(stats) as StatName[]).map(stat => {
                                    const val = stats[stat];
                                    const mod = calculateModifier(val);
                                    const nextCost = val < MAX_SCORE ? (SCORE_COSTS[val + 1] - SCORE_COSTS[val]) : 99;
                                    const canIncrease = val < MAX_SCORE && remainingPoints >= nextCost;
                                    const canDecrease = val > MIN_SCORE;

                                    const isRecommended = RECOMMENDED_STATS[classType].includes(stat);

                                    return (
                                        <div key={stat} className={`flex flex-col items-center bg-slate-800 p-3 rounded border relative group transition ${isRecommended ? 'border-dnd-gold/60 shadow-[0_0_10px_rgba(212,175,55,0.1)]' : 'border-gray-700 hover:border-gray-500'}`}>
                                            {isRecommended && <div className="absolute -top-2 text-[9px] bg-dnd-gold text-dnd-dark px-1.5 rounded font-bold uppercase">Clave</div>}
                                            <div className={`font-bold mb-2 ${isRecommended ? 'text-dnd-gold' : 'text-gray-400'}`}>{stat}</div>

                                            <div className="flex items-center gap-2 mb-2 w-full justify-between px-1">
                                                <button
                                                    type="button"
                                                    onClick={() => handleStatChange(stat, -1)}
                                                    disabled={!canDecrease}
                                                    className={`p-1 rounded hover:bg-slate-700 transition ${!canDecrease ? 'opacity-30 cursor-not-allowed' : 'text-dnd-gold'}`}
                                                >
                                                    <Minus size={16} />
                                                </button>
                                                <span className="text-2xl font-bold text-white w-8 text-center">{val}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleStatChange(stat, 1)}
                                                    disabled={!canIncrease}
                                                    className={`p-1 rounded hover:bg-slate-700 transition ${!canIncrease ? 'opacity-30 cursor-not-allowed' : 'text-dnd-gold'}`}
                                                >
                                                    <Plus size={16} />
                                                </button>
                                            </div>

                                            <div className="w-full border-t border-gray-700 pt-2 text-center">
                                                <span className={`text-sm font-bold font-mono ${mod > 0 ? 'text-green-400' : mod < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                                                    {mod >= 0 ? '+' : ''}{mod}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>


                        {/* Voice Selection */}
                        <div className="bg-slate-900/50 p-6 rounded-lg border border-gray-700">
                            <h3 className="text-xl font-fantasy text-dnd-gold mb-4">Voz del Personaje</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Voces Masculinas</h4>
                                    <div className="grid grid-cols-2 gap-2">
                                        {VOICE_OPTIONS.male.map((v) => (
                                            <button
                                                key={v.id}
                                                type="button"
                                                onClick={() => setVoiceId(v.id)}
                                                className={`
                                                    p-3 rounded border text-left flex justify-between items-center group
                                                    ${voiceId === v.id ? 'bg-dnd-gold/20 border-dnd-gold text-white' : 'bg-slate-800 border-gray-600 text-gray-400 hover:border-gray-400'}
                                                `}
                                            >
                                                <span className="font-semibold text-sm">{v.name}</span>
                                                <div
                                                    onClick={(e) => { e.stopPropagation(); handlePlayPreview(v.id); }}
                                                    className="p-1.5 rounded-full hover:bg-white/10 text-dnd-gold"
                                                    title="Escuchar prueba"
                                                >
                                                    {previewPlaying === v.id ? <Loader2 size={14} className="animate-spin" /> : <Volume2 size={14} />}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Voces Femeninas</h4>
                                    <div className="grid grid-cols-2 gap-2">
                                        {VOICE_OPTIONS.female.map((v) => (
                                            <button
                                                key={v.id}
                                                type="button"
                                                onClick={() => setVoiceId(v.id)}
                                                className={`
                                                    p-3 rounded border text-left flex justify-between items-center group
                                                    ${voiceId === v.id ? 'bg-dnd-gold/20 border-dnd-gold text-white' : 'bg-slate-800 border-gray-600 text-gray-400 hover:border-gray-400'}
                                                `}
                                            >
                                                <span className="font-semibold text-sm">{v.name}</span>
                                                <div
                                                    onClick={(e) => { e.stopPropagation(); handlePlayPreview(v.id); }}
                                                    className="p-1.5 rounded-full hover:bg-white/10 text-dnd-gold"
                                                    title="Escuchar prueba"
                                                >
                                                    {previewPlaying === v.id ? <Loader2 size={14} className="animate-spin" /> : <Volume2 size={14} />}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Bio & Personality */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="relative">
                                <label className="block text-gray-400 mb-2 font-bold uppercase text-xs tracking-wider flex justify-between">
                                    Personalidad
                                    <button
                                        type="button"
                                        onClick={handleGenerateAI}
                                        disabled={isGenerating}
                                        className="text-dnd-gold flex items-center gap-1 hover:text-yellow-400 transition"
                                        title="Generar con IA"
                                    >
                                        <Sparkles size={12} /> {isGenerating ? 'Pensando...' : 'Aleatorio'}
                                    </button>
                                </label>
                                <textarea
                                    value={personality}
                                    onChange={(e) => setPersonality(e.target.value)}
                                    className="w-full bg-slate-800 border border-gray-600 rounded p-3 text-white h-24 focus:border-dnd-gold outline-none resize-none text-sm"
                                    placeholder="¿Cómo se comporta tu personaje? (Ej: Valiente, astuto, honorable...)"
                                />
                            </div>
                            <div>
                                <label className="block text-gray-400 mb-2 font-bold uppercase text-xs tracking-wider">Historia (Backstory)</label>
                                <textarea
                                    value={bio}
                                    onChange={(e) => setBio(e.target.value)}
                                    className="w-full bg-slate-800 border border-gray-600 rounded p-3 text-white h-24 focus:border-dnd-gold outline-none resize-none text-sm"
                                    placeholder="Breve historia de su pasado..."
                                />
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex justify-between items-center pt-4 border-t border-gray-700">
                            <div className="flex gap-4 text-xs text-gray-500">
                                <span className="flex items-center gap-1"><Heart size={14} className="text-red-900" /> HP: {Math.max(1, (classType === 'Wizard' ? 6 : classType === 'Fighter' ? 10 : 8) + calculateModifier(stats.CON))}</span>
                                <span className="flex items-center gap-1"><Shield size={14} className="text-blue-900" /> AC: {10 + calculateModifier(stats.DEX)}</span>
                            </div>
                            <div className="flex gap-4">
                                <button
                                    type="button"
                                    onClick={onCancel}
                                    className="px-6 py-2 text-gray-400 hover:text-white transition"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="px-8 py-2 bg-dnd-gold text-dnd-dark font-bold rounded hover:bg-yellow-500 transition shadow-lg shadow-yellow-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    disabled={remainingPoints < 0}
                                >
                                    {isGenerating ? <Loader2 className="animate-spin" size={16} /> : null}
                                    Invocar Héroe
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default CharacterCreator;
