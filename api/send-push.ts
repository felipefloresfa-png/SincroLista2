import webpush from 'web-push';
import { consumeRateLimit, isAllowedPushEndpoint } from '../src/lib/security.js';

const FIREBASE_API_BASE = 'https://firestore.googleapis.com/v1';

function getFirebaseConfig() {
  return {
    apiKey: process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY,
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'sincrolist',
  };
}

async function getAuthenticatedUser(req: any) {
  const authorization = req.headers.authorization || '';
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const { apiKey } = getFirebaseConfig();
  if (!idToken || !apiKey) return null;
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!response.ok) return null;
    const result = await response.json() as { users?: Array<{ localId?: string }> };
    const uid = result.users?.[0]?.localId;
    return uid ? { uid, idToken } : null;
  } catch {
    return null;
  }
}

function decodeFirestoreValue(value: any): any {
  if (!value || typeof value !== 'object') return undefined;
  if (typeof value.stringValue === 'string') return value.stringValue;
  if (value.mapValue?.fields) {
    return Object.fromEntries(Object.entries(value.mapValue.fields).map(([key, entry]) => [key, decodeFirestoreValue(entry)]));
  }
  return undefined;
}

function firestoreUrl(path: string) {
  const { projectId } = getFirebaseConfig();
  return `${FIREBASE_API_BASE}/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${path}`;
}

async function getFamilyId(uid: string, idToken: string) {
  const response = await fetch(firestoreUrl(`users/${encodeURIComponent(uid)}`), {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!response.ok) return null;
  const document = await response.json() as { fields?: Record<string, any> };
  const familyId = document.fields?.familyId?.stringValue;
  return typeof familyId === 'string' && familyId.length <= 50 ? familyId : null;
}

async function getPartnerSubscriptions(familyId: string, uid: string, idToken: string) {
  const response = await fetch(firestoreUrl('') + ':runQuery', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'push_subscriptions' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'familyId' },
            op: 'EQUAL',
            value: { stringValue: familyId },
          },
        },
        limit: 100,
      },
    }),
  });
  if (!response.ok) throw new Error('No se pudieron consultar las suscripciones del hogar.');
  const rows = await response.json() as Array<{ document?: { fields?: Record<string, any> } }>;
  const subscriptions = new Map<string, { endpoint: string; keys: { p256dh: string; auth: string } }>();
  for (const row of rows) {
    const fields = row.document?.fields;
    if (!fields) continue;
    const ownerId = fields.userId?.stringValue;
    const endpoint = fields.endpoint?.stringValue;
    const keys = decodeFirestoreValue(fields.keys);
    if (ownerId === uid || typeof endpoint !== 'string' || !isAllowedPushEndpoint(endpoint)) continue;
    if (typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') continue;
    subscriptions.set(endpoint, { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } });
    if (subscriptions.size >= 20) break;
  }
  return [...subscriptions.values()];
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const user = await getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Se requiere una sesión válida.' });

  const rateLimit = consumeRateLimit(`push:${user.uid}`, 20, 5 * 60 * 1000);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(Math.ceil(rateLimit.retryAfterMs / 1000)));
    return res.status(429).json({ error: 'Demasiadas notificaciones. Intenta de nuevo más tarde.' });
  }

  const keys = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    subject: process.env.VAPID_SUBJECT || 'mailto:soporte@sincrolista.app',
  };
  if (!keys.publicKey || !keys.privateKey) return res.status(503).json({ error: 'Web Push no está configurado.' });

  const notification = req.body?.notification;
  const type = ['add', 'check', 'delete', 'clear'].includes(notification?.data?.type) ? notification.data.type : 'update';
  const payload = JSON.stringify({
    title: typeof notification?.title === 'string' ? notification.title.slice(0, 100) : 'SincroLista 🛒',
    body: typeof notification?.body === 'string' ? notification.body.slice(0, 200) : 'Actualización en tu lista compartida',
    tag: typeof notification?.tag === 'string' ? notification.tag.slice(0, 100) : `sincrolista-${Date.now()}`,
    data: {
      url: '/',
      type,
      itemName: typeof notification?.data?.itemName === 'string' ? notification.data.itemName.slice(0, 100) : '',
    },
  });

  try {
    const familyId = await getFamilyId(user.uid, user.idToken);
    if (!familyId) return res.status(403).json({ error: 'El usuario no tiene un hogar válido.' });
    const subscriptions = await getPartnerSubscriptions(familyId, user.uid, user.idToken);
    if (subscriptions.length === 0) return res.status(200).json({ success: true, sent: 0 });

    webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
    const results = await Promise.allSettled(subscriptions.map(subscription =>
      webpush.sendNotification(subscription, payload, { TTL: 86400, urgency: 'high' })
    ));
    const sent = results.filter(result => result.status === 'fulfilled').length;
    return res.status(200).json({ success: true, sent, total: subscriptions.length });
  } catch {
    return res.status(502).json({ error: 'No se pudieron procesar las notificaciones.' });
  }
}
