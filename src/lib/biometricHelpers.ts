// ============ PWA + BIOMETRIC HELPERS ============

const BIOMETRIC_KEY = "biometric_credentials";
const BIOMETRIC_ENABLED_KEY = "biometric_enabled";

/** Detecta se o app está rodando como PWA instalada (standalone) */
export function isPWA(): boolean {
  if ((navigator as any).standalone === true) return true;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
  return false;
}

export function isBiometricAvailable(): boolean {
  try {
    if (!isPWA()) return false;
    return !!(window.PublicKeyCredential || (navigator as any).credentials);
  } catch {
    return false;
  }
}

export function getBiometricLabel(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "Face ID / Touch ID";
  if (/android/.test(ua)) return "Biometria";
  return "Desbloqueio biométrico";
}

export function isBiometricEnabled(): boolean {
  try {
    return localStorage.getItem(BIOMETRIC_ENABLED_KEY) === "true";
  } catch { return false; }
}

export function setBiometricEnabled(value: boolean) {
  try {
    if (value) {
      localStorage.setItem(BIOMETRIC_ENABLED_KEY, "true");
    } else {
      localStorage.removeItem(BIOMETRIC_ENABLED_KEY);
      localStorage.removeItem(BIOMETRIC_KEY);
    }
  } catch {}
}

export function hasSavedBiometric(): boolean {
  try {
    if (!isPWA()) return false;
    return !!(localStorage.getItem(BIOMETRIC_KEY) && localStorage.getItem(BIOMETRIC_ENABLED_KEY) === "true");
  } catch { return false; }
}

export function saveBiometricCredentials(email: string, password: string) {
  try {
    const encoded = btoa(JSON.stringify({ e: email, p: password }));
    localStorage.setItem(BIOMETRIC_KEY, encoded);
    localStorage.setItem(BIOMETRIC_ENABLED_KEY, "true");
  } catch {}
}

export function loadBiometricCredentials(): { email: string; password: string } | null {
  try {
    const raw = localStorage.getItem(BIOMETRIC_KEY);
    if (!raw) return null;
    const { e, p } = JSON.parse(atob(raw));
    return { email: e, password: p };
  } catch { return null; }
}

export function clearBiometricCredentials() {
  try {
    localStorage.removeItem(BIOMETRIC_KEY);
    localStorage.removeItem(BIOMETRIC_ENABLED_KEY);
  } catch {}
}

export async function requestBiometricAuth(): Promise<boolean> {
  try {
    if (window.PublicKeyCredential) {
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (available) {
        const challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);
        const credential = await navigator.credentials.create({
          publicKey: {
            challenge,
            rp: { name: "Escala de Ministros", id: window.location.hostname },
            user: {
              id: new Uint8Array(16),
              name: "ministro",
              displayName: "Ministro",
            },
            pubKeyCredParams: [{ alg: -7, type: "public-key" }],
            authenticatorSelection: {
              authenticatorAttachment: "platform",
              userVerification: "required",
            },
            timeout: 60000,
          },
        });
        return !!credential;
      }
    }
    return true;
  } catch { return false; }
}
