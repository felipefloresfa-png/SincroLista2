import { GoogleGenAI } from "@google/genai";

async function hasValidFirebaseSession(req: any) {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (!token || !apiKey) return false;
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido." });
  }
  if (!(await hasValidFirebaseSession(req))) {
    return res.status(401).json({ error: "Se requiere una sesión válida." });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "La IA no está configurada en el servidor." });

  const { model, contents, config } = req.body || {};
  if (!["gemini-3-flash-preview", "gemini-1.5-flash"].includes(model) || !contents) {
    return res.status(400).json({ error: "La solicitud de IA no es válida." });
  }
  try {
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({ model, contents, config });
    return res.status(200).json({ text: result.text || "" });
  } catch {
    return res.status(502).json({ error: "El servicio de IA no pudo completar la solicitud." });
  }
}
