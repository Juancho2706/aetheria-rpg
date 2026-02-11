# Aetheria RPG 🐉

Aetheria RPG is a **multiplayer text-based Role-Playing Game (RPG)** powered by Artificial Intelligence (Google Gemini 2.5). It combines the nostalgia of classic D&D 5e with modern web technologies, offering an automated Dungeon Master (DM) that narrates the story, manages rules, generates audio voiceovers, and synchronizes game state in real-time.

## 🛠 Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Database & Realtime**: [Supabase](https://supabase.com/) (PostgreSQL + Realtime Subscriptions)
- **AI & Logic**: [Google Gemini 2.5](https://deepmind.google/technologies/gemini/) (Text & Audio)
- **Audio Processing**: Node.js `Buffer` & `sharp` for assets.

## 📂 Project Structure

```bash
aetheria-rpg/
├── src/
│   ├── app/                # Next.js App Router (Pages & API)
│   │   ├── actions.ts      # Server Actions (AI Logic, Audio, Game State)
│   │   └── page.tsx        # Main Entry Point
│   ├── components/         # React Components
│   │   ├── AetheriaApp.tsx # Main State Container & Logic
│   │   ├── GameInterface.tsx # Gameplay UI (Chat, Dice, Stats)
│   │   └── ...
│   ├── lib/                # Utilities
│   │   ├── supabase.ts     # Supabase Client
│   │   ├── gameUtils.ts    # Game Helpers (Dice, Sync)
│   │   └── gameData.ts     # Static Game Data
│   └── types/              # TypeScript Interfaces (Character, Item, Message)
├── scripts/                # Offline Scripts
│   └── process_items.ts    # AI Item Generator (Vision -> DB)
├── public/                 # Static Assets
└── ...
```

## ⚙️ Internal Processes

### 1. The Game Loop 🔄
The core loop relies on **Optimistic UI** updates backed by **Supabase Realtime**.

1.  **Lobby Creation**: A user creates a lobby (ID generated). A row is inserted into `campaigns` and `lobbies`.
2.  **Initialization**:
    - `initializeCampaignAction` (Server Action) is called.
    - Gemini AI receives the party roster and generates a creative opening scenario.
    - Initial state (Location, Messages) is pushed to Supabase.
3.  **Player Action**:
    - Players submit text actions or dice rolls via `GameInterface`.
    - These are bundled and sent to `resolveTurnAction`.
4.  **AI Resolution**:
    - Gemini acts as the DM, analyzing the history and new actions.
    - It returns a **JSON Structure** containing:
        - Narrative text (Spanish).
        - State updates (`hpUpdates`, `inventoryUpdates`, `location`).
        - Suggested actions for the next turn.
5.  **Sync**: The Frontend parses the JSON, updates the local state immediately, and Supabase broadcasts the changes to all connected clients.

### 2. Audio & Voice Synthesis 🎙️
The game features an immersive narrator with distinct voices for NPCs and Players.

- **Process**: `generateNarratorAudioAction`
- **Voice Mapping**:
    - **Narrator**: Uses voice 'Aoede'.
    - **Players**: Assigned a specific voice (e.g., 'Puck').
    - **NPCs**: Voice selected deterministically based on name hash (e.g., 'Fenrir', 'Charon').
- **Optimization**:
    - Script is split into chunks by speaker.
    - Audio is generated in **parallel** using Gemini 2.5 TTS.
    - Chunks are stitched into a single WAV file.
    - **Caching**: Files are uploaded to Supabase Storage (`narrations` bucket). Future requests for the same message ID serve the cached file.

### 3. AI Item Generation ⚔️
Items are not manually coded but "discovered" by AI.

- **Script**: `scripts/process_items.ts`
- **Input**: A sprite sheet (`Icons.png`).
- **Process**:
    1.  Slices the image into 32x32 tiles.
    2.  Uploads tile to Storage.
    3.  **Gemini Vision** analyzes the pixel art.
    4.  AI generates JSON stats (Name, Type, Rarity, Stats, Description).
    5.  Inserts valid items into the `items` database table.

## 🗄️ Database Schema (Supabase)

The project relies on these core tables:

- **`lobbies`**: Stores the raw JSON game state (`game_state`) for fast client syncing.
- **`campaigns`**: Metadata (ID, Name, Status, Turn Count).
- **`characters`**: Structured character data (Stats, Class, Level) linked to campaigns.
- **`items`**: Catalog of AI-generated items.
- **`narrations`** (Storage Bucket): Stores generated audio WAV files.

## 🚀 Setup & Installation

### Prerequisites
- Node.js 18+
- Supabase Project (URL & Keys)
- Google Gemini API Key

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Create a `.env.local` file:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Google Gemini
GEMINI_API_KEY=your_gemini_key
```

### 3. Run Development Server
```bash
npm run dev
```
Access at [http://localhost:3000](http://localhost:3000).

## 🎮 How to Play
1.  **Login** with Google.
2.  **Create** a Lobby or **Join** one via ID.
3.  **Create a Character**: Choose a class (Fighter, Wizard, etc.) and let AI generate your backstory.
4.  **Wait** for the party (up to 4 players).
5.  **Host Starts Game**: The AI DM will set the scene.
6.  **Type Actions**: "Ataco al goblin", "Busco trampas", etc.
