import { app } from '../firebase';

export type NotificationPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

export interface FCMTokenResult {
  permission: NotificationPermissionStatus;
  token?: string;
  error?: string;
  inAppOnly?: boolean;
  nativeSupported?: boolean;
  isIOS?: boolean;
  isStandalone?: boolean;
}

// Detección de dispositivo iOS (iPhone / iPad / iPod)
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

// Detección de si la app está instalada como PWA / pantalla de inicio
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// Detección de entorno iframe (visor de desarrollo, incrustado)
export function isIframeEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

// Verifica si la API nativa de notificaciones del sistema está disponible
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

// Obtiene el estado actual del permiso nativo
export function getNotificationPermission(): NotificationPermissionStatus {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as NotificationPermissionStatus;
}

// Vibración táctil para móviles (Android / navegadores con Vibration API)
export function triggerHapticFeedback(pattern: number[] = [40, 50, 40]) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Silencioso si no está permitido
  }
}

// Singleton AudioContext para evitar bloqueos del navegador en reproducciones consecutivas
let sharedAudioContext: AudioContext | null = null;

// Desbloquear AudioContext automáticamente en el primer toque o interacción del usuario
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch {}
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('click', unlockAudio, { passive: true, once: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true, once: true });
  window.addEventListener('keydown', unlockAudio, { passive: true, once: true });
}

// Auto-registrar Service Worker si está soportado para que showNotification esté disponible de inmediato
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  const registerSW = () => {
    navigator.serviceWorker
      .register('/firebase-messaging-sw.js', { scope: '/' })
      .catch((err) => console.debug('Auto SW register omitido:', err));
  };
  if (document.readyState === 'complete') {
    registerSW();
  } else {
    window.addEventListener('load', registerSW, { once: true });
  }
}

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

// Muestra una notificación nativa del sistema si está disponible,
// siempre acompañada de sonido chime y vibración hápica
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
  
  // Siempre reproducimos el sonido enriquecido
  await playChimeSound(soundType);

  // Respuesta háptica
  triggerHapticFeedback(soundType === 'check' ? [50, 40, 60] : [40, 50]);

  // Si no hay soporte para Notification nativa o no está otorgado, salimos elegantemente
  if (!isNotificationSupported()) {
    return;
  }

  if (Notification.permission !== 'granted') {
    return;
  }

  try {
    // Para Android Chrome, Safari iOS PWA y navegadores modernos, usar ServiceWorker primero
    if ('serviceWorker' in navigator) {
      try {
        let registration = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 1000)),
        ]);
        if (!registration) {
          registration = await navigator.serviceWorker.getRegistration();
        }
        if (registration && typeof registration.showNotification === 'function') {
          const swOptions: NotificationOptions & { vibrate?: number[] } = {
            icon: '/icon-192.png',
            badge: '/badge-72.png',
            vibrate: [200, 100, 200],
            ...notifOptions,
          };
          await registration.showNotification(title, swOptions as NotificationOptions);
          return;
        }
      } catch (swErr) {
        console.debug('SW showNotification omitido:', swErr);
      }
    }

    // Para navegadores de escritorio (Chrome, Firefox, Safari desktop) donde new Notification es compatible
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
    console.warn('Aviso mostrando notificación del sistema:', err);
  }
}

// Activa las notificaciones (nativas y/o en vivo con sonido) de forma resiliente
export async function requestFCMToken(vapidKey?: string): Promise<FCMTokenResult> {
  // Aseguramos contexto de audio listo desde este gesto de usuario
  getAudioContext();
  triggerHapticFeedback([40, 60, 40]);

  const ios = isIOS();
  const standalone = isStandalone();
  const inIframe = isIframeEnvironment();
  const nativeSupported = isNotificationSupported();

  // Si el entorno no soporta la API nativa Notification (ej. pestaña Safari iOS normal o WebView incrustado)
  if (!nativeSupported) {
    return {
      permission: 'granted', // Activamos el modo en vivo y alertas sonoras
      nativeSupported: false,
      inAppOnly: true,
      isIOS: ios,
      isStandalone: standalone,
    };
  }

  let permission: NotificationPermissionStatus = getNotificationPermission();

  try {
    // Si aún no se ha solicitado el permiso nativo
    if (permission === 'default') {
      try {
        const res = await Notification.requestPermission();
        permission = res as NotificationPermissionStatus;
      } catch (reqErr) {
        console.warn('Notification.requestPermission no permitido en este contexto (posible iframe):', reqErr);
        // En iframe o visor embebido, pasamos directamente a modo en pantalla y sonido sin error
        return {
          permission: 'granted',
          nativeSupported: false,
          inAppOnly: true,
          isIOS: ios,
          isStandalone: standalone,
        };
      }
    }

    if (permission === 'denied') {
      return {
        permission: 'denied',
        nativeSupported: true,
        inAppOnly: true,
        error: 'Las notificaciones del sistema están bloqueadas en los ajustes del navegador, pero las alertas sonoras y visuales dentro de la aplicación continuarán funcionando.',
      };
    }

    // Registrar Service Worker para FCM de forma no bloqueante
    let swRegistration: ServiceWorkerRegistration | undefined;
    if ('serviceWorker' in navigator) {
      try {
        swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
          scope: '/',
        });
        await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      } catch (swErr) {
        console.warn('Aviso: Service Worker de FCM omitido:', swErr);
      }
    }

    // Intentar obtener el token de FCM si es compatible
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
      nativeSupported: true,
      inAppOnly: false,
      isIOS: ios,
      isStandalone: standalone,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn('Fallback en requestFCMToken:', errorMsg);
    return {
      permission: 'granted',
      nativeSupported: false,
      inAppOnly: true,
      isIOS: ios,
      isStandalone: standalone,
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

      // Mostrar notificación nativa si la ventana está minimizada / oculta
      if (document.hidden) {
        showLocalNotification(title, { body });
      }
    });
  } catch (e) {
    console.debug('FCM Foreground listener no disponible:', e);
    return null;
  }
}
