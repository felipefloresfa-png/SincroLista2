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
      model: "gemini-3-flash-preview",
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
      model: "gemini-3-flash-preview",
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
  
  const fallbackSplit = (t: string) => {
    // Si no hay comas ni "y", intentamos dividir por espacios si hay múltiples palabras capitalizadas o patrones de lista
    // Pero por simplicidad, primero probamos con separadores comunes
    const items = t.split(/[,;\n]|\sy\s|\se\s|\.|\s-\s/).map(item => item.trim()).filter(item => item.length > 1);
    if (items.length === 1 && items[0].includes(' ')) {
      // Si solo hay un item pero tiene espacios, intentamos ver si parece una lista sin separadores
      // Por ahora mantenemos el comportamento conservador pero permitimos división por " " si parece claro
      // En fallback es difícil, así que mejor enviamos a la IA.
    }
    return items.map(name => ({ name: name.charAt(0).toUpperCase() + name.slice(1) }));
  };

  if (!process.env.GEMINI_API_KEY) {
    return fallbackSplit(text);
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Tu tarea es tomar un texto dictado por voz y convertirlo en una LISTA de productos individuales para el supermercado.
      
      TEXTO: "${text}"
      
      REGLAS CRÍTICAS:
      1. DIVIDE el texto en productos individuales. Aunque el usuario no use comas ni "y", debes identificar dónde termina un producto y empieza otro.
         Ejemplo: "carne arroz leche" -> ["Carne", "Arroz", "Leche"]
      2. Extrae CANTIDAD y UNIDAD si se mencionan (ej: "un kilo de harina" -> {name: "Harina", quantity: 1, unit: "kg"}).
      3. Limpia el nombre: quita verbos como "comprar", "traer", "necesito".
      4. Si el usuario dice "varios x", pon quantity null o un número razonable si se deduce.
      5. Formato de salida: Array JSON de objetos.
      
      Estructura de objeto:
      - name: string (Nombre limpio, capitalizado, en singular si aplica)
      - quantity: number | null
      - unit: string | null (l, kg, gr, uds, pack, frasco, bolsa)
      
      Si el texto es "leche por favor y tres panes grandes", el output debe ser:
      [{"name": "Leche", "quantity": 1, "unit": "uds"}, {"name": "Pan grande", "quantity": 3, "unit": "uds"}]`,
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

    const parsed = JSON.parse(response.text || '[]') as ParsedVoiceItem[];
    // Asegurarse de que cada objeto cumpla con la interfaz (a veces la IA puede omitir campos si no son required)
    return parsed.map(item => ({
      name: item.name,
      quantity: item.quantity ?? null,
      unit: item.unit ?? null
    }));
  } catch (error) {
    console.error("Error parsing voice input:", error);
    return fallbackSplit(text);
  }
}
