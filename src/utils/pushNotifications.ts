export interface PushSettings {
  enabled: boolean;
  expiryAlerts: boolean;
  expiryDaysThreshold: number; // default 2 (J-2, J-1, J-0, expired)
  choreReminders: boolean;
  vaccineReminders: boolean;
}

export interface InAppPushToast {
  id: string;
  title: string;
  body: string;
  category: 'expiry' | 'chore' | 'vaccine' | 'appliance';
  timestamp: string;
}

const PUSH_SETTINGS_KEY = 'doudous_v3_push_settings';
const SENT_PUSH_LOG_KEY = 'doudous_v3_sent_push_log';

export function getPushSettings(): PushSettings {
  try {
    const raw = localStorage.getItem(PUSH_SETTINGS_KEY);
    if (raw) {
      return {
        enabled: true,
        expiryAlerts: true,
        expiryDaysThreshold: 2,
        choreReminders: true,
        vaccineReminders: true,
        ...JSON.parse(raw),
      };
    }
  } catch {
    // ignore
  }
  return {
    enabled: true,
    expiryAlerts: true,
    expiryDaysThreshold: 2,
    choreReminders: true,
    vaccineReminders: true,
  };
}

export function savePushSettings(settings: PushSettings): void {
  try {
    localStorage.setItem(PUSH_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return Notification.permission;
  }
}

export function hasAlreadySentPushToday(uniqueKey: string): boolean {
  try {
    const today = new Date().toISOString().split('T')[0];
    const raw = localStorage.getItem(SENT_PUSH_LOG_KEY);
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    return map[uniqueKey] === today;
  } catch {
    return false;
  }
}

export function markPushSentToday(uniqueKey: string): void {
  try {
    const today = new Date().toISOString().split('T')[0];
    const raw = localStorage.getItem(SENT_PUSH_LOG_KEY);
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    // Keep only today's keys to avoid unbounded growth
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(map)) {
      if (v === today) cleaned[k] = v;
    }
    cleaned[uniqueKey] = today;
    localStorage.setItem(SENT_PUSH_LOG_KEY, JSON.stringify(cleaned));
  } catch {
    // ignore
  }
}

/**
 * Sends both a native Web/PWA Push Notification (via ServiceWorker or Notification API)
 * AND dispatches an in-app push banner event so the user always sees it even in restricted webviews.
 */
export async function sendPushNotification(
  title: string,
  body: string,
  category: InAppPushToast['category'] = 'chore',
  dedupeKey?: string
): Promise<void> {
  const settings = getPushSettings();
  if (!settings.enabled) return;

  if (category === 'expiry' && !settings.expiryAlerts) return;
  if (category === 'chore' && !settings.choreReminders) return;
  if (category === 'vaccine' && !settings.vaccineReminders) return;

  if (dedupeKey) {
    if (hasAlreadySentPushToday(dedupeKey)) {
      return;
    }
    markPushSentToday(dedupeKey);
  }

  // 1. Dispatch in-app push toast event
  if (typeof window !== 'undefined') {
    const toast: InAppPushToast = {
      id: `push-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      body,
      category,
      timestamp: new Date().toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
    window.dispatchEvent(new CustomEvent('doudous-push-toast', { detail: toast }));
  }

  // 2. Native OS / Browser Push Notification via Service Worker or Notification constructor
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg && 'showNotification' in reg) {
            await reg.showNotification(title, {
              body,
              icon: '/pwa-192x192.svg',
              badge: '/pwa-192x192.svg',
              tag: dedupeKey || `doudous-${Date.now()}`,
            });
            return;
          }
        }
        new Notification(title, {
          body,
          icon: '/pwa-192x192.svg',
          tag: dedupeKey || `doudous-${Date.now()}`,
        });
      } catch {
        // Fallback already handled by in-app push banner
      }
    }
  }
}
