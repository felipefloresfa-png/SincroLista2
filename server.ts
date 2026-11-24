import express from 'express';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';
import webpush from 'web-push';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '20mb' }));

function getVapidKeys() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:soporte@sincrolista.app';
  return publicKey && privateKey ? { publicKey, privateKey, subject } : null;
}

function getFirebaseApiKey() {
  const envKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (envKey) return envKey;
  try {
    const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { apiKey?: string };
    return parsed.apiKey || '';
  } catch {
    return '';
  }
}

async function verifyFirebaseToken(req: express.Request) {
  const authorization = req.header('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const apiKey = getFirebaseApiKey();
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

app.post('/api/gemini', async (req, res) => {
  if (!(await verifyFirebaseToken(req))) {
    return res.status(401).json({ error: 'Se requiere una sesión válida.' });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'La IA no está configurada en el servidor.' });
  const { model, contents, config } = req.body || {};
  const allowedModels = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-3.5-flash'];
  if (!allowedModels.includes(model) || !contents) {
    return res.status(400).json({ error: 'La solicitud de IA no es válida.' });
  }

  const ai = new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Máximo 2 intentos rápidos (principal + respaldo) para no agotar el timeout de red móvil
  const fallbackModel = model === 'gemini-4-hydrogen' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';
  const candidateModels = [model, fallbackModel];

  let lastErr: any = null;
  for (let i = 0; i < candidateModels.length; i++) {
    const activeModel = candidateModels[i];
    try {
      const result = await ai.models.generateContent({ model: activeModel, contents, config });
      return res.json({ text: result.text || '' });
    } catch (err: any) {
      lastErr = err;
      const status = Number(err?.status || err?.code) || 500;
      console.warn(`[Gemini] Intento ${i + 1} (${activeModel}) falló con estado ${status}`);
      const isTransient = status === 503 || status === 429 || status === 500;
      if (!isTransient) break;
      if (i < candidateModels.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }
  }

  const finalStatus = Number(lastErr?.status || lastErr?.code) || 500;
  const rawMsg = typeof lastErr?.message === 'string' ? lastErr.message : '';
  console.error('[Gemini] Error final al procesar solicitud:', finalStatus, rawMsg);

  if (finalStatus === 503) {
    return res.status(503).json({
      error: 'El servicio de IA está con alta demanda en este momento. Toca "Nueva foto" nuevamente en unos segundos.',
    });
  }
  if (finalStatus === 429) {
    return res.status(429).json({ error: 'Límite temporal de IA alcanzado (429). Intenta en unos segundos.' });
  }
  if (finalStatus === 401 || finalStatus === 403) {
    return res.status(500).json({ error: 'La clave de IA del servidor no tiene permisos o no es válida.' });
  }
  return res.status(500).json({
    error: `El servicio de IA no pudo completar la solicitud (${finalStatus}). Intenta nuevamente.`,
  });
});

app.post('/api/lookup-barcodes', async (req, res) => {
  if (!(await verifyFirebaseToken(req))) {
    return res.status(401).json({ error: 'Se requiere una sesión válida.' });
  }

  const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
  const storeName = typeof req.body?.storeName === 'string' ? req.body.storeName.trim().slice(0, 60) : 'Lider Chile';
  const candidates = rawItems
    .map((it: any) => ({
      barcode: String(it?.barcode || '').replace(/\D/g, ''),
      rawText: typeof it?.rawText === 'string' ? it.rawText.trim().slice(0, 80) : '',
    }))
    .filter((it: { barcode: string }) => /^\d{8,14}$/.test(it.barcode) && !/^2\d{12}$/.test(it.barcode))
    .slice(0, 12);

  if (candidates.length === 0) {
    return res.json({ results: {} });
  }

  const results: Record<string, { resolvedName: string; brand?: string; source: string; sourceUrl?: string }> = {};
  const unresolved: Array<{ barcode: string; rawText: string }> = [];

  // 1. Consulta rápida en Open Food Facts
  await Promise.all(
    candidates.map(async ({ barcode, rawText }) => {
      try {
        const resp = await fetch(
          `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,product_name_es,brands,quantity`,
          { signal: AbortSignal.timeout(2500) }
        );
        if (resp.ok) {
          const data = (await resp.json()) as {
            status?: number;
            product?: { product_name_es?: string; product_name?: string; brands?: string; quantity?: string };
          };
          const p = data?.product;
          const rawName = (p?.product_name_es || p?.product_name || '').trim();
          if (data?.status === 1 && rawName) {
            const brand = (p?.brands || '').split(',')[0].trim();
            const fullName = brand && !rawName.toLowerCase().includes(brand.toLowerCase())
              ? `${rawName} ${brand}`.trim()
              : rawName;
            results[barcode] = {
              resolvedName: fullName.slice(0, 80),
              brand: brand || undefined,
              source: 'OpenFoodFacts',
              sourceUrl: `https://world.openfoodfacts.org/product/${barcode}`,
            };
            return;
          }
        }
      } catch {
        // Continuar al fallback de búsqueda web
      }
      unresolved.push({ barcode, rawText });
    })
  );

  // 2. Fallback con Google Search Grounding (Gemini 4 Hydrogen) para códigos chilenos no listados en OpenFoodFacts
  const apiKey = process.env.GEMINI_API_KEY;
  if (unresolved.length > 0 && apiKey) {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        apiVersion: 'v1beta',
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      const listPrompt = unresolved
        .map((u, i) => `${i + 1}. Código: ${u.barcode}${u.rawText ? ` (en boleta ${storeName}: "${u.rawText}")` : ''}`)
        .join('\n');

      const searchResponse = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Busca estos códigos de barras EAN/UPC de productos vendidos en supermercados de Chile (${storeName}) y devuelve su nombre comercial limpio en español.
Códigos:
${listPrompt}

Responde ÚNICAMENTE un arreglo JSON válido sin texto extra ni markdown, con este formato:
[{"barcode":"7801965000974","resolvedName":"Salchicha Tradicional","brand":"opcional","found":true}]
Si no encuentras con certeza el producto para un código, devuelve "found": false y deja resolvedName vacío.`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const rawText = (searchResponse.text || '')
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const jsonMatch = rawText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{
          barcode?: string;
          resolvedName?: string;
          brand?: string;
          found?: boolean;
        }>;
        const firstChunkUri = searchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks?.find(
          (c: any) => c?.web?.uri
        )?.web?.uri;

        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            const code = String(entry?.barcode || '').replace(/\D/g, '');
            const name = typeof entry?.resolvedName === 'string' ? entry.resolvedName.trim() : '';
            if (code && name && entry?.found !== false && !results[code]) {
              results[code] = {
                resolvedName: name.slice(0, 80),
                brand: typeof entry?.brand === 'string' ? entry.brand.trim() || undefined : undefined,
                source: 'Búsqueda web',
                sourceUrl: firstChunkUri || undefined,
              };
            }
          }
        }
      }
    } catch (searchErr: any) {
      console.warn('[BarcodeLookup] Búsqueda web omitida:', searchErr?.message || searchErr);
    }
  }

  return res.json({ results });
});

app.get('/api/vapid-public-key', (_req, res) => {
  const keys = getVapidKeys();
  if (!keys) return res.status(500).json({ error: 'Web Push no está configurado.' });
  return res.json({ publicKey: keys.publicKey });
});

app.post('/api/send-push', async (req, res) => {
  if (!(await verifyFirebaseToken(req))) {
    return res.status(401).json({ error: 'Se requiere una sesión válida.' });
  }
  const keys = getVapidKeys();
  if (!keys) return res.status(500).json({ error: 'Web Push no está configurado.' });

  const { subscriptions, notification } = req.body || {};
  if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
    return res.json({ success: true, sent: 0, expiredEndpoints: [] });
  }
  if (subscriptions.length > 20) {
    return res.status(400).json({ error: 'Demasiadas suscripciones.' });
  }

  try {
    webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
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
    return res.json({ success: true, sent, total: subscriptions.length, expiredEndpoints });
  } catch {
    return res.status(500).json({ error: 'Error interno al procesar la notificación.' });
  }
});

// Garantizar que ninguna petición /api/* caiga en el fallback HTML del SPA ni devuelva errores en HTML
app.use('/api', (err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!err) return next();
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({ error: 'Las fotos superan el tamaño permitido. Prueba con menos fotos o menor resolución.' });
  }
  return res.status(err.status || 400).json({ error: 'Solicitud JSON inválida en el servidor.' });
});

app.all('/api/*', (_req, res) => {
  return res.status(405).json({ error: 'Ruta o método de API no válido.' });
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    process.env.DISABLE_HMR ??= 'true';
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const transformed = await vite.transformRequest('/@vite/client');
        if (!transformed?.code) return next();
        const safeCode = transformed.code.replace(
          'transport.connect(createHMRHandler(handleMessage));',
          '/* HMR disabled: WebSocket connection skipped */'
        );
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        return res.send(safeCode);
      } catch {
        return next();
      }
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.resolve(distPath, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] SincroLista corriendo en puerto ${PORT} (${isProd ? 'producción' : 'desarrollo'})`);
  });
}
startServer();
