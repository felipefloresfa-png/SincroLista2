export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey || !process.env.VAPID_PRIVATE_KEY) {
    return res.status(503).json({ error: 'Web Push no está configurado.' });
  }
  return res.status(200).json({ publicKey });
}
