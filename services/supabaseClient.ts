
import { createClient } from '@supabase/supabase-js';

// Helper to safely get environment variables
const getSafeEnv = (key: string): string | undefined => {
  try {
    if (typeof window !== 'undefined' && (window as any).process?.env) {
      return (window as any).process.env[key];
    }
    if (typeof process !== 'undefined' && process.env) {
      return process.env[key];
    }
  } catch (e) {
    // Silence errors during env access
  }
  return undefined;
};

export const getSupabaseConfig = () => {
  const envUrl = getSafeEnv('SUPABASE_URL');
  const envKey = getSafeEnv('SUPABASE_ANON_KEY');
  
  const localUrl = typeof localStorage !== 'undefined' ? localStorage.getItem('SUPABASE_URL') : null;
  const localKey = typeof localStorage !== 'undefined' ? localStorage.getItem('SUPABASE_ANON_KEY') : null;

  const isValidUrl = (url: string | null | undefined) => 
    url && typeof url === 'string' && url.startsWith('https://') && url.includes('.supabase.co');

  const url = isValidUrl(localUrl) ? localUrl : (isValidUrl(envUrl) ? envUrl : null);
  const key = localKey ? localKey : (envKey && envKey !== 'your-anon-key-here' ? envKey : null);

  return { url, key };
};

const placeholderUrl = 'https://placeholder-project.supabase.co';
const placeholderKey = 'placeholder-key';

const currentConfig = getSupabaseConfig();

// We export the client but ensure it's initialized safely
export let supabase = createClient(
  currentConfig.url || placeholderUrl,
  currentConfig.key || placeholderKey
);

export const isSupabaseConfigured = () => {
  const cfg = getSupabaseConfig();
  return !!(cfg.url && cfg.key && cfg.url.includes('.supabase.co'));
};

export const updateSupabaseConfig = (url: string, key: string) => {
  if (!url.startsWith('https://')) {
    throw new Error("URL must start with https://");
  }
  
  const trimmedUrl = url.trim();
  const trimmedKey = key.trim();
  
  localStorage.setItem('SUPABASE_URL', trimmedUrl);
  localStorage.setItem('SUPABASE_ANON_KEY', trimmedKey);
  
  supabase = createClient(trimmedUrl, trimmedKey);
};

export const clearSupabaseConfig = () => {
  localStorage.removeItem('SUPABASE_URL');
  localStorage.removeItem('SUPABASE_ANON_KEY');
  supabase = createClient(placeholderUrl, placeholderKey);
};
