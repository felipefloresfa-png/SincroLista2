import { app } from '../firebase';

export type NotificationPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

export interface FCMTokenResult {
  permission: NotificationPermissionStatus;
  token?: string;
  error?: string;
}

// Verifica si las notificaciones están soportadas en el entorno
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
}

// Obtiene el estado actual del permiso
export function getNotificationPermission(): NotificationPermissionStatus {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }
  return Notification.permission as NotificationPermissionStatus;
}

// Reproduce un sonido agradable y sutil mediante la Web Audio API (sin dependencias de archivos externos)
export function playChimeSound(type: 'add' | 'check' | 'general' = 'general') {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    gainNode.connect(ctx.destination);
    osc1.connect(gainNode);
    osc2.connect(gainNode);

    if (type === 'check') {
      // Tono de completado alegre (acorde ascendente rápido)
      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.12); // E5
      osc2.frequency.setValueAtTime(783.99, now + 0.08); // G5
      osc2.frequency.exponentialRampToValueAtTime(1046.50, now + 0.25); // C6

      gainNode.gain.setValueAtTime(0.15, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.start(now);
      osc2.start(now + 0.08);
      osc1.stop(now + 0.35);
      osc2.stop(now + 0.35);
    } else if (type === 'add') {
      // Tono de nuevo producto (suave bip de confirmación)
      osc1.frequency.setValueAtTime(440, now); // A4
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5

      gainNode.gain.setValueAtTime(0.12, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc1.start(now);
      osc1.stop(now + 0.25);
    } else {
      // Tono general
      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.18); // A5

      gainNode.gain.setValueAtTime(0.1, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc1.start(now);
      osc1.stop(now + 0.28);
    }
  } catch (err) {
    console.debug('Audio cue prevented or unsupported:', err);
  }
}

// Muestra una notificación del sistema
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
  playChimeSound(soundType);

  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return;
  }

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration && registration.showNotification) {
        await registration.showNotification(title, {
          icon: '/icon-192.png',
          badge: '/badge-72.png',
          ...notifOptions,
        });
        return;
      }
    }

    new Notification(title, {
      icon: '/icon-192.png',
      ...notifOptions,
    });
  } catch (err) {
    console.warn('Error mostrando notificación del sistema:', err);
  }
}

// Inicializa Firebase Cloud Messaging y solicita token
export async function requestFCMToken(vapidKey?: string): Promise<FCMTokenResult> {
  if (!isNotificationSupported()) {
    return {
      permission: 'unsupported',
      error: 'Tu navegador o dispositivo no soporta notificaciones Web Push.',
    };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        permission: permission as NotificationPermissionStatus,
        error: 'El permiso de notificaciones no fue concedido.',
      };
    }

    // Registrar el Service Worker de FCM si está soportado
    let swRegistration: ServiceWorkerRegistration | undefined;
    try {
      swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/',
      });
      await navigator.serviceWorker.ready;
    } catch (swErr) {
      console.warn('Aviso: Service Worker no se pudo registrar en este contexto (posible iframe):', swErr);
    }

    // Importación dinámica de Firebase Messaging para compatibilidad
    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
    const supported = await isSupported();

    if (!supported) {
      return {
        permission: 'granted',
        error: 'Firebase Cloud Messaging no está soportado en este entorno de navegador.',
      };
    }

    const messaging = getMessaging(app);
    let token: string | undefined;

    try {
      token = await getToken(messaging, {
        serviceWorkerRegistration: swRegistration,
        vapidKey: vapidKey || undefined,
      });
    } catch (tokenErr: unknown) {
      const msg = tokenErr instanceof Error ? tokenErr.message : String(tokenErr);
      console.warn('Aviso al obtener token FCM directo:', msg);
      // Retornamos permission granted para que las notificaciones del navegador y de Firestore sigan funcionando
      return {
        permission: 'granted',
        error: msg.includes('vapidKey')
          ? 'Notificaciones habilitadas. (Configuración VAPID de FCM pendiente en producción).'
          : msg,
      };
    }

    return {
      permission: 'granted',
      token,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
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
