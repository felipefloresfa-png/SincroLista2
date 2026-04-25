import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export interface ItemInfo {
  category: string;
  suggestedUnit: string;
  isPerishable: boolean;
  priorityLevel: "low" | "medium" | "high";
}

export async function analyzeItem(itemName: string): Promise<ItemInfo> {
  const keyStatus = process.env.GEMINI_API_KEY ? "Presente" : "AUSENTE";
  console.log(`[IA] Analizando: ${itemName} (Key: ${keyStatus})`);
  
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Falta la GEMINI_API_KEY en las variables de entorno.");
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: `Analiza este producto de supermercado: "${itemName}".
      Categorízalo en una de estas categorías estándar: 
      Frutas y Verduras, Carnes y Pescados, Lácteos y Huevos, Despensa, Panadería, Congelados, Bebidas, Alcohol, Higiene y Cuidado Personal, Limpieza del Hogar, Mascotas, Bebés, Otros.
      
      Devuelve info en JSON:
      - category: Nombre de la categoría exacta de la lista anterior.
      - suggestedUnit: Unidad común (uds, kg, l, pack)
      - isPerishable: true si es perecedero
      - priorityLevel: "low", "medium" o "high" basado en si es un básico esencial.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING },
            suggestedUnit: { type: Type.STRING },
            isPerishable: { type: Type.BOOLEAN },
            priorityLevel: { type: Type.STRING, enum: ["low", "medium", "high"] }
          },
          required: ["category", "suggestedUnit", "isPerishable", "priorityLevel"]
        }
      }
    });

    return JSON.parse(response.text || '{}') as ItemInfo;
  } catch (error) {
    console.error("Error analyzing item:", error);
    return {
      category: "Otros",
      suggestedUnit: "uds",
      isPerishable: false,
      priorityLevel: "medium"
    };
  }
}

export async function getSmartRecommendations(history: string[]) {
  console.log(`[IA] Generando recomendaciones (History size: ${history.length})`);
  
  if (!process.env.GEMINI_API_KEY) {
    console.warn("IA: GEMINI_API_KEY no detectada. Usando recomendaciones por defecto.");
    return ["Leche", "Huevos", "Pan", "Fruta", "Papel Higiénico", "Arroz", "Aceite", "Azúcar", "Sal", "Café", "Té", "Pasta"];
  }

  try {
    const isHistoryEmpty = history.length === 0;
    const prompt = isHistoryEmpty 
      ? "Sugiere 12 productos básicos de supermercado (despensa, frescos, higiene) que suelen faltar en cualquier hogar. Devuelve un array JSON de strings con solo los nombres de los productos."
      : `Basado en este historial de compras: ${history.join(", ")}, 
      sugiere 12 productos que podrían faltar pronto o que suelen comprarse junto a estos. 
      Evita repetir productos del historial si ya están ahí.
      Devuelve un array JSON de strings con solo los nombres de los productos.`;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });
    return JSON.parse(response.text || '[]') as string[];
  } catch (error) {
    // Fallback constants if AI fails or key is missing
    return ["Leche", "Huevos", "Pan", "Fruta", "Papel Higiénico", "Arroz", "Aceite", "Azúcar", "Sal", "Café", "Té", "Pasta"];
  }
}

export interface ParsedVoiceItem {
  name: string;
  quantity?: number;
  unit?: string;
}

export async function parseVoiceInput(text: string): Promise<ParsedVoiceItem[]> {
  console.log(`[IA] Procesando dictado: "${text}"`);
  
  if (!process.env.GEMINI_API_KEY) {
    // Simple split by commas as fallback
    return text.split(/[,,y\n]+/).map(item => ({ name: item.trim() })).filter(i => i.name.length > 0);
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: `Convierte este dictado de voz de lista de compras en un array JSON de objetos: "${text}".
      Cada objeto debe tener:
      - name: nombre del producto (en singular, capitalizado)
      - quantity: número de unidades (opcional, null si no se especifica)
      - unit: unidad de medida (opcional, null si no se especifica)
      
      Ejemplo input: "necesito comprar tres litros de leche dos kilos de arroz y una lechuga"
      Ejemplo output: [{"name": "Leche", "quantity": 3, "unit": "l"}, {"name": "Arroz", "quantity": 2, "unit": "kg"}, {"name": "Lechuga", "quantity": 1, "unit": "uds"}]`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              quantity: { type: Type.NUMBER, nullable: true },
              unit: { type: Type.STRING, nullable: true }
            },
            required: ["name"]
          }
        }
      }
    });

    return JSON.parse(response.text || '[]') as ParsedVoiceItem[];
  } catch (error) {
    console.error("Error parsing voice input:", error);
    return text.split(/[,,y\n]+/).map(item => ({ name: item.trim() })).filter(i => i.name.length > 0);
  }
}
