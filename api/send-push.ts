import webpush from 'web-push';

async function hasValidFirebaseSession(req: any) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (!token || !apiKey) return false;
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    });
    if (!response.ok) return false;
    const result = await response.json() as { users?: unknown[] };
    return Array.isArray(result.users) && result.users.length > 0;
  } catch {
    return false;
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  if (!(await hasValidFirebaseSession(req))) {
    return res.status(401).json({ error: 'Se requiere una sesión válida.' });
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:soporte@sincrolista.app';
  if (!publicKey || !privateKey) return res.status(503).json({ error: 'Web Push no está configurado.' });

  const { subscriptions, notification } = req.body || {};
  if (!Array.isArray(subscriptions) || subscriptions.length > 20) {
    return res.status(400).json({ error: 'La lista de suscripciones no es válida.' });
  }
  if (subscriptions.length === 0) return res.status(200).json({ success: true, sent: 0, expiredEndpoints: [] });

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    const payload = JSON.stringify({
      title: typeof notification?.title === 'string' ? notification.title.slice(0, 100) : 'SincroLista 🛒',
      body: typeof notification?.body === 'string' ? notification.body.slice(0, 500) : 'Actualización en tu lista compartida',
      tag: typeof notification?.tag === 'string' ? notification.tag.slice(0, 100) : `sincrolista-${Date.now()}`,
      data: notification?.data && typeof notification.data === 'object' ? notification.data : { url: '/' },
    });

    const expiredEndpoints: string[] = [];
    let sent = 0;
    await Promise.allSettled(subscriptions.map(async (sub: any) => {
      if (typeof sub?.endpoint !== 'string' || !sub.endpoint.startsWith('https://') ||
          typeof sub?.keys?.p256dh !== 'string' || typeof sub?.keys?.auth !== 'string') return;
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
        }, payload, { TTL: 86400, urgency: 'high' });
        sent++;
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) expiredEndpoints.push(sub.endpoint);
      }
    }));
    return res.status(200).json({ success: true, sent, total: subscriptions.length, expiredEndpoints });
  } catch {
    return res.status(500).json({ error: 'Error interno al procesar la notificación.' });
  }
}
