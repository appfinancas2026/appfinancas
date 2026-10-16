import { createClient } from '@supabase/supabase-js';

// Cliente com service role — uso exclusivo de rotas server-side.
// NUNCA importar em código client (app/*/page.js, componentes 'use client').
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
}

// Cliente anon — equivalente ao que o browser usa, mas instanciado no servidor
// para rotas que precisam de auth.signInWithPassword.
export function supabaseAnon() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } },
  );
}
