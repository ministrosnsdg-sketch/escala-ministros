import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Determina o storage baseado na preferência do usuário
function getStorageType(): Storage {
  try {
    const rememberMe = localStorage.getItem("rememberMe");
    // Se rememberMe for 'false', usa sessionStorage (sessão expira ao fechar navegador)
    if (rememberMe === "false") {
      return sessionStorage;
    }
  } catch {}
  // Por padrão usa localStorage (persistente)
  return localStorage;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storage: getStorageType(),
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Função para recriar o client com novo storage quando o usuário muda a preferência
export function setRememberMe(value: boolean) {
  try {
    localStorage.setItem("rememberMe", value ? "true" : "false");
  } catch {}
}

export function getRememberMe(): boolean {
  try {
    return localStorage.getItem("rememberMe") !== "false";
  } catch {
    return true;
  }
}
