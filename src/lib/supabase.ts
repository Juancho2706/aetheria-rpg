import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn("Supabase credentials missing! Check .env.local");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
