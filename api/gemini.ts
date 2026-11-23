import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import { consumeRateLimit } from "../src/lib/security.js";

function getFirebaseApiKey() {
  const envKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (envKey) return envKey;
  try {
    const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as { apiKey?: string };
    return parsed.apiKey || "";
  } catch {
    return "";
  }
}

async function getFirebaseUser(req: any) {
  const authorization = req.headers.authorization || "";
  const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const apiKey = getFirebaseApiKey();
  if (!idToken || !apiKey) return null;
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!response.ok) return null;
    const result = await response.json() as { users?: Array<{ localId?: string }> };
    const uid = result.users?.[0]?.localId;
    return uid ? { uid } : null;
  } catch {
    return null;
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido." });
  }
  const bodySize = Buffer.byteLength(JSON.stringify(req.body ?? {}), "utf8");
  if (bodySize > 4 * 1024 * 1024) {
    return res.status(413).json({ error: "La solicitud supera el tamaño permitido." });
  }
  const user = await getFirebaseUser(req);
  if (!user) {
    return res.status(401).json({ error: "Se requiere una sesión válida." });
  }
  const minuteLimit = consumeRateLimit(`gemini-minute:${user.uid}`, 10, 60 * 1000);
  const hourlyLimit = consumeRateLimit(`gemini-hour:${user.uid}`, 100, 60 * 60 * 1000);
  const rateLimit = !minuteLimit.allowed ? minuteLimit : hourlyLimit;
  if (!rateLimit.allowed) {
    res.setHeader("Retry-After", String(Math.ceil(rateLimit.retryAfterMs / 1000)));
    return res.status(429).json({ error: "Alcanzaste el límite temporal de solicitudes de IA." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "La IA no está configurada en el servidor." });

  const { model, contents, config } = req.body || {};
  const allowedModels = ["gemini-4-hydrogen", "gemini-3-flash-preview", "gemini-3.5-flash"];
  if (!allowedModels.includes(model) || !contents) {
    return res.status(400).json({ error: "La solicitud de IA no es válida." });
  }
  try {
    const ai = new GoogleGenAI({
      apiKey,
      apiVersion: "v1beta",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
    const result = await ai.models.generateContent({ model, contents, config });
    return res.status(200).json({ text: result.text || "" });
  } catch (err: any) {
    const status = Number(err?.status || err?.code) || 500;
    const rawMsg = typeof err?.message === "string" ? err.message : "";
    console.error("[Gemini API]", status, rawMsg);
    if (status === 429) {
      return res.status(429).json({ error: "Límite temporal de IA alcanzado (429). Intenta en unos segundos." });
    }
    if (status === 401 || status === 403) {
      return res.status(500).json({ error: "La clave de IA del servidor no tiene permisos o no es válida." });
    }
    const cleanReason = rawMsg.replace(/AIza[0-9A-Za-z_-]+/g, "[redacted]").slice(0, 140);
    return res.status(500).json({
      error: cleanReason
        ? `El servicio de IA devolvió un error (${status}): ${cleanReason}`
        : "El servicio de IA no pudo completar la solicitud.",
    });
  }
}
