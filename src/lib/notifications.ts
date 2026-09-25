import { app } from '../firebase';

export type NotificationPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

export interface FCMTokenResult {
  permission: NotificationPermissionStatus;
  token?: string;
  error?: string;
  inAppOnly?: boolean;
}

// Singleton AudioContext para evitar bloqueos del navegador en reproducciones consecutivas
let sharedAudioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
      sharedAudioContext = new AudioContextClass();
    }
    if (sharedAudioContext.state === 'suspended') {
      sharedAudioContext.resume().catch(() => {});
    }
    return sharedAudioContext;
  } catch (err) {
    console.debug('[Audio] Fallo inicializando AudioContext:', err);
    return null;
  }
}

// Verifica si las notificaciones están soportadas en el entorno
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

// Obtiene el estado actual del permiso
export function getNotificationPermission(): NotificationPermissionStatus {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as NotificationPermissionStatus;
}

// Reproduce un sonido agradable y nítido mediante Web Audio API
export async function playChimeSound(type: 'add' | 'check' | 'general' = 'general') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const gainNode = ctx.createGain();
    gainNode.connect(ctx.destination);

    if (type === 'check') {
      // Tono de completado alegre: acorde ascendente dulce (C5 -> E5 -> G5 -> C6)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'triangle';
      osc2.type = 'sine';

      osc1.connect(gainNode);
      osc2.connect(gainNode);

      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.1); // E5
      osc1.frequency.exponentialRampToValueAtTime(1046.50, now + 0.22); // C6

      osc2.frequency.setValueAtTime(783.99, now + 0.05); // G5
      osc2.frequency.exponentialRampToValueAtTime(1318.51, now + 0.25); // E6

      gainNode.gain.setValueAtTime(0.01, now);
      gainNode.gain.linearRampToValueAtTime(0.2, now + 0.04);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc1.start(now);
      osc2.start(now + 0.05);
      osc1.stop(now + 0.45);
      osc2.stop(now + 0.45);
    } else if (type === 'add') {
      // Tono de nuevo producto agregado: dos tonos brillantes y suaves (E5 -> A5)
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.connect(gainNode);

      osc.frequency.setValueAtTime(659.25, now); // E5
      osc.frequency.setValueAtTime(880.00, now + 0.1); // A5

      gainNode.gain.setValueAtTime(0.01, now);
      gainNode.gain.linearRampToValueAtTime(0.18, now + 0.03);
      gainNode.gain.setValueAtTime(0.18, now + 0.1);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.start(now);
      osc.stop(now + 0.35);
    } else {
      // Tono general
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.connect(gainNode);

      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880.00, now + 0.15); // A5

      gainNode.gain.setValueAtTime(0.01, now);
      gainNode.gain.linearRampToValueAtTime(0.15, now + 0.04);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.start(now);
      osc.stop(now + 0.35);
    }
  } catch (err) {
    console.debug('[Audio] Error al reproducir chime:', err);
  }
}

// Muestra una notificación nativa del sistema
export async function showLocalNotification(
  title: string,
  options?: {
    body?: string;
    icon?: string;
    badge?: string;
    tag?: string;
    soundType?: 'add' | 'check' | 'general';
  }
) {
  const { soundType = 'general', ...notifOptions } = options || {};
  
  // Siempre reproducimos el sonido
  await playChimeSound(soundType);

  if (!isNotificationSupported()) {
    return;
  }

  if (Notification.permission !== 'granted') {
    return;
  }

  try {
    // Para Android Chrome y PWA, intentar ServiceWorker primero
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration && registration.showNotification) {
          await registration.showNotification(title, {
            icon: '/icon-192.png',
            badge: '/badge-72.png',
            ...notifOptions,
          });
          return;
        }
      } catch (swErr) {
        console.debug('SW showNotification omitido:', swErr);
      }
    }

    // Para Desktop browsers (Chrome, Firefox, Safari)
    if (typeof Notification === 'function') {
      try {
        new Notification(title, {
          icon: '/icon-192.png',
          ...notifOptions,
        });
      } catch (directNotifErr) {
        console.debug('Constructor directo de Notification omitido:', directNotifErr);
      }
    }
  } catch (err) {
    console.warn('Error mostrando notificación del sistema:', err);
  }
}

// Inicializa Firebase Cloud Messaging y solicita token
export async function requestFCMToken(vapidKey?: string): Promise<FCMTokenResult> {
  // Aseguramos contexto de audio listo
  getAudioContext();

  const isIframe = typeof window !== 'undefined' && window.self !== window.top;

  if (!isNotificationSupported()) {
    return {
      permission: 'unsupported',
      error: 'Tu navegador o dispositivo actual no soporta la API de notificaciones nativas.',
      inAppOnly: true,
    };
  }

  let permission: NotificationPermissionStatus = getNotificationPermission();

  try {
    // Si estamos en un iframe, la llamada directa a Notification.requestPermission() puede arrojar
    // DOMException: The Notification permission may only be requested from a top-level browsing context.
    if (isIframe) {
      try {
        const res = await Notification.requestPermission();
        permission = res as NotificationPermissionStatus;
      } catch (iframeErr) {
        console.warn('Iframe bloquea Notification.requestPermission(); activando notificaciones in-app y sonido:', iframeErr);
        // Marcamos como granted in-app para que la app responda con sonido y avisos visuales en vivo
        return {
          permission: 'granted',
          inAppOnly: true,
          error: undefined,
        };
      }
    } else {
      const res = await Notification.requestPermission();
      permission = res as NotificationPermissionStatus;
    }

    if (permission !== 'granted') {
      return {
        permission,
        error: permission === 'denied'
          ? 'Las notificaciones están bloqueadas en los ajustes de tu navegador.'
          : 'No se completó la autorización de notificaciones.',
      };
    }

    // Registrar Service Worker para FCM con timeout defensivo
    let swRegistration: ServiceWorkerRegistration | undefined;
    if ('serviceWorker' in navigator) {
      try {
        swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
          scope: '/',
        });
        // Esperamos a que esté listo con timeout de 1.5s para no bloquear la UI si tarda en activarse
        await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      } catch (swErr) {
        console.warn('Aviso: Service Worker de FCM no se pudo registrar:', swErr);
      }
    }

    // Intentamos obtener el token de FCM si es compatible
    let token: string | undefined;
    try {
      const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
      const supported = await isSupported();

      if (supported) {
        const messaging = getMessaging(app);
        token = await Promise.race([
          getToken(messaging, {
            serviceWorkerRegistration: swRegistration,
            vapidKey: vapidKey || undefined,
          }),
          new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 2500)),
        ]);
      }
    } catch (tokenErr: unknown) {
      const msg = tokenErr instanceof Error ? tokenErr.message : String(tokenErr);
      console.warn('Aviso al obtener token FCM directo:', msg);
    }

    return {
      permission: 'granted',
      token,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn('Error en requestFCMToken:', errorMsg);
    return {
      permission: getNotificationPermission(),
      error: errorMsg,
    };
  }
}

// Configura el listener de mensajes en primer plano (Foreground FCM)
export async function listenToForegroundMessages(
  onMessageReceived: (payload: { title?: string; body?: string; data?: Record<string, string> }) => void
): Promise<(() => void) | null> {
  if (!isNotificationSupported()) return null;

  try {
    const { getMessaging, onMessage, isSupported } = await import('firebase/messaging');
    const supported = await isSupported();
    if (!supported) return null;

    const messaging = getMessaging(app);
    return onMessage(messaging, (payload) => {
      console.log('Mensaje FCM recibido en primer plano:', payload);
      const title = payload.notification?.title || payload.data?.title || 'SincroLista 🛒';
      const body = payload.notification?.body || payload.data?.body || 'Actualización en tiempo real';

      onMessageReceived({
        title,
        body,
        data: payload.data,
      });

      // Mostrar notificación nativa si la ventana no está visible
      if (document.hidden) {
        showLocalNotification(title, { body });
      }
    });
  } catch (e) {
    console.debug('FCM Foreground listener no disponible:', e);
    return null;
  }
}
