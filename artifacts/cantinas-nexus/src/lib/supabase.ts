/**
 * Nexus-ERP-CRM — cliente Supabase
 * Instância única usada por toda a aplicação.
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY precisam estar definidas (arquivo .env local ou secrets do GitHub Actions).',
  );
}

export const supabase = createClient(url, anonKey);