import { Suspense } from 'react';
import AetheriaApp from '@/components/AetheriaApp';

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black text-dnd-gold flex items-center justify-center">Loading Realm...</div>}>
      <AetheriaApp />
    </Suspense>
  );
}
