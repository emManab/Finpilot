import { createClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || "https://kawessdbwbgcoikmmdfh.supabase.co";
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || "sb_publishable_1Ph4bjSOpCZTaLPTjkE-Jg_xnZe75XX";

export const supabase = createClient(url, publishableKey);
