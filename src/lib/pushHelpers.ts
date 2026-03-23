// ============ PUSH NOTIFICATION HELPERS ============
// Para funcionar com push real, é necessário:
// 1. Criar projeto no Firebase Console
// 2. Colocar VITE_FIREBASE_VAPID_KEY no .env.local
// 3. Criar Edge Functions no Supabase para disparar
//
// Por enquanto, funciona com Notification API local (PWA aberta)
// e fica pronto para conectar ao Firebase quando configurado.

import { isPWA } from "./biometricHelpers";
import { supabase } from "./supabaseClient";

const PUSH_TOKEN_KEY = "push_token";
const PUSH_PERMISSION_ASKED = "push_permission_asked";

/** Verifica se push notifications são suportadas (só em PWA) */
export function isPushSupported(): boolean {
  if (!isPWA()) return false;
  return "Notification" in window && "serviceWorker" in navigator;
}

/** Verifica se já tem permissão */
export function getPushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

/** Verifica se já perguntamos ao usuário */
export function wasPushAsked(): boolean {
  try {
    return localStorage.getItem(PUSH_PERMISSION_ASKED) === "true";
  } catch { return false; }
}

/** Solicita permissão de notificação */
export async function requestPushPermission(): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    localStorage.setItem(PUSH_PERMISSION_ASKED, "true");
    const permission = await Notification.requestPermission();

    if (permission === "granted") {
      // Registrar token no banco para push futuro via Firebase
      await registerPushToken();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Registra o push token do dispositivo no banco */
async function registerPushToken() {
  try {
    const registration = await navigator.serviceWorker.ready;

    // Tentar Web Push (funciona sem Firebase para notificações locais)
    // Quando Firebase for configurado, usar messaging.getToken() aqui
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        import.meta.env.VITE_FIREBASE_VAPID_KEY || "placeholder"
      ),
    }).catch(() => null);

    if (subscription) {
      const token = JSON.stringify(subscription);
      localStorage.setItem(PUSH_TOKEN_KEY, token);

      // Salvar no banco vinculado ao usuário
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("push_tokens").upsert({
          user_id: user.id,
          token,
          platform: getPlatform(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" }).catch(() => {});
      }
    }
  } catch {}
}

/** Envia notificação local (quando o app está aberto como PWA) */
export function sendLocalNotification(title: string, body: string, tag?: string) {
  if (!isPushSupported()) return;
  if (Notification.permission !== "granted") return;

  try {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, {
        body,
        icon: "/icons/icon-192x192.png",
        badge: "/icons/icon-96x96.png",
        tag: tag || "default",
        vibrate: [200, 100, 200],
        data: { url: "/" },
      });
    });
  } catch {}
}

function getPlatform(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "desktop";
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
