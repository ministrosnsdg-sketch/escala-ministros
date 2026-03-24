// ============ PUSH NOTIFICATION HELPERS ============
// Fluxo real de Web Push (sem Firebase):
//   1. O usuário concede permissão
//   2. O navegador gera uma PushSubscription usando a VAPID_PUBLIC_KEY
//   3. O token (subscription JSON) é salvo na tabela push_tokens do Supabase
//      — cada dispositivo tem sua própria linha (identificado pelo endpoint)
//   4. Quando o admin envia uma notificação, o frontend chama a Edge Function send-push
//   5. A Edge Function dispara o push para cada token via Web Push Protocol
//
// Variável necessária no .env.local:
//   VITE_VAPID_PUBLIC_KEY=<sua chave pública VAPID>
//
// Para gerar as chaves VAPID, rode no terminal:
//   npx web-push generate-vapid-keys
// Guarde a PUBLIC_KEY no .env.local e ambas no painel do Supabase como secrets.

import { supabase } from "./supabaseClient";

// ============================================================
// 🔕 NOTIFICAÇÕES TEMPORARIAMENTE DESATIVADAS
// Para reativar: altere PUSH_DISABLED para false
// ============================================================
const PUSH_DISABLED = true;

const PUSH_PERMISSION_ASKED = "push_permission_asked";

/** Verifica se push notifications são suportadas neste navegador/dispositivo */
export function isPushSupported(): boolean {
  if (PUSH_DISABLED) return false; // 🔕 desativado temporariamente
  // Funciona em Chrome/Edge/Firefox no Android, Chrome/Edge no Desktop
  // iOS Safari 16.4+ com PWA instalada também suporta
  return (
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

/** Verifica a permissão atual */
export function getPushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

/** Verifica se já perguntamos ao usuário neste dispositivo */
export function wasPushAsked(): boolean {
  try {
    return localStorage.getItem(PUSH_PERMISSION_ASKED) === "true";
  } catch {
    return false;
  }
}

/** Solicita permissão de notificação e registra o token do dispositivo */
export async function requestPushPermission(): Promise<boolean> {
  if (PUSH_DISABLED) return false; // 🔕 desativado temporariamente
  if (!isPushSupported()) return false;

  try {
    localStorage.setItem(PUSH_PERMISSION_ASKED, "true");
    const permission = await Notification.requestPermission();

    if (permission === "granted") {
      await registerPushToken();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Registra (ou atualiza) o push token deste dispositivo no Supabase.
 * Cada dispositivo tem sua própria linha — identificado pelo endpoint único da subscription.
 * Isso garante que usuários com múltiplos dispositivos recebam em todos.
 */
export async function registerPushToken(): Promise<boolean> {
  if (PUSH_DISABLED) return false; // 🔕 desativado temporariamente
  try {
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      console.warn("[Push] VITE_VAPID_PUBLIC_KEY não configurada no .env.local");
      return false;
    }

    const registration = await navigator.serviceWorker.ready;

    // Verifica se já existe uma subscription ativa neste browser/dispositivo
    let subscription = await registration.pushManager.getSubscription();

    // Se não existe, cria uma nova
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

    const token = JSON.stringify(subscription);
    const endpoint = subscription.endpoint; // identificador único por dispositivo/browser

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return false;

    // Tenta upsert por endpoint (cada dispositivo = uma linha)
    const { error } = await supabase.from("push_tokens").upsert(
      {
        user_id: user.id,
        token,
        endpoint,
        platform: getPlatform(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );

    if (error) {
      // Fallback para schema antigo sem coluna endpoint
      await supabase.from("push_tokens").upsert(
        {
          user_id: user.id,
          token,
          platform: getPlatform(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    }

    return true;
  } catch (err) {
    console.error("[Push] Erro ao registrar token:", err);
    return false;
  }
}

/**
 * Chama a Edge Function do Supabase para disparar push para todos os dispositivos.
 */
export async function sendPushViaEdgeFunction(
  title: string,
  message: string,
  target: "all" | "admins",
  notificationId: string
): Promise<{ sent: number; total: number; error?: string }> {
  if (PUSH_DISABLED) return { sent: 0, total: 0, error: "Notificações temporariamente desativadas." }; // 🔕
  try {
    const { data, error } = await supabase.functions.invoke("send-push", {
      body: { title, message, target, notificationId },
    });

    if (error) throw error;
    return data as { sent: number; total: number };
  } catch (err: any) {
    console.error("[Push] Erro ao chamar Edge Function:", err);
    return { sent: 0, total: 0, error: err.message || "Erro desconhecido" };
  }
}

/** Envia notificação local (quando o app está aberto em foreground) */
export function sendLocalNotification(title: string, body: string, tag?: string) {
  if (PUSH_DISABLED) return; // 🔕 desativado temporariamente
  if (!isPushSupported()) return;
  if (Notification.permission !== "granted") return;

  try {
    navigator.serviceWorker.ready.then((reg) => {
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

/**
 * Re-registra o token se a permissão já foi concedida.
 * Deve ser chamado no login para manter o token atualizado.
 */
export async function refreshPushTokenIfGranted(): Promise<void> {
  if (PUSH_DISABLED) return; // 🔕 desativado temporariamente
  if (!isPushSupported()) return;
  if (Notification.permission !== "granted") return;
  await registerPushToken();
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
