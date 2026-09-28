import express from 'express';
import webpush from 'web-push';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Claves VAPID estándar para Web Push Notification
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BNtQ9_C5jJzCv8Pw05eElPm1EJ_4XHI9m5P_p9H_r66S7mrB66kX43lOGWB089vBx1Yt4PKK4TvPULjSKlgZYv0';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '8cxXT0747n4Xz704jI27CqUxZoO_-YeCbc1loWQtF_4';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:soporte@sincrolista.app';

try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log('[Server] VAPID configurado correctamente para Web Push en segundo plano.');
} catch (vapidErr) {
  console.error('[Server] Error configurando VAPID:', vapidErr);
}

// Endpoint para entregar la clave pública VAPID al cliente
app.get('/api/vapid-public-key', (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Endpoint para enviar notificaciones Push a los dispositivos de la pareja (incluso con la app/pantalla cerrada)
app.post('/api/send-push', async (req, res) => {
  try {
    const { subscriptions, notification } = req.body;
    if (!subscriptions || !Array.isArray(subscriptions) || subscriptions.length === 0) {
      return res.status(200).json({ success: true, sent: 0, message: 'No hay suscripciones push activas para enviar.' });
    }

    const payload = JSON.stringify({
      title: notification?.title || 'SincroLista 🛒',
      body: notification?.body || 'Actualización en tu lista compartida',
      tag: notification?.tag || `sincrolista-${Date.now()}`,
      data: notification?.data || { url: '/' }
    });

    const expiredEndpoints: string[] = [];
    let sentCount = 0;

    const pushPromises = subscriptions.map(async (sub: any) => {
      if (!sub || !sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
        return;
      }
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.keys.p256dh,
              auth: sub.keys.auth
            }
          },
          payload,
          {
            TTL: 86400, // 24 horas para que llegue en cuanto el dispositivo recupere conexión
            urgency: 'high'
          }
        );
        sentCount++;
      } catch (err: any) {
        // Códigos 404 o 410 indican suscripción expirada o revocada por el navegador
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          expiredEndpoints.push(sub.endpoint);
        } else {
          console.warn('[Server] Error enviando push a dispositivo:', err?.message || err);
        }
      }
    });

    await Promise.allSettled(pushPromises);

    res.json({
      success: true,
      sent: sentCount,
      total: subscriptions.length,
      expiredEndpoints
    });
  } catch (err: any) {
    console.error('[Server] Error en /api/send-push:', err);
    res.status(500).json({ error: err?.message || 'Error interno al procesar push' });
  }
});

// Inicialización del servidor
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] SincroLista corriendo en puerto ${PORT} (${isProd ? 'producción' : 'desarrollo'})`);
  });
}

startServer();
