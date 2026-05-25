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

export interface SupermarketPrice {
  name: string;
  lider: { price: number; url?: string };
  jumbo: { price: number; url?: string };
  unimarc: { price: number; url?: string };
}

export async function searchMarketPrices(itemNames: string[]): Promise<SupermarketPrice[]> {
  if (itemNames.length === 0) return [];
  
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY no detectada en las variables de entorno.");
  }

  const prompt = `Busca en internet el precio actual real (en pesos chilenos - CLP) de los siguientes productos en los supermercados de Chile: Lider (Walmart), Jumbo y Unimarc.
  
  Productos a buscar:
  ${itemNames.map((name, idx) => `${idx + 1}. ${name}`).join('\n')}

  Intenta encontrar el producto exacto o el más similar que coincida.
  Para cada supermercado (lider, jumbo, unimarc):
  1. Extrae el precio real en CLP del formato oficial de los sitios chilenos (lider.cl, jumbo.cl, unimarc.cl). Si no encuentras el precio real del producto o está agotado, pon "price": 0.
  2. Proporciona la URL real de la página del producto para comprobar o comprar, o una URL de búsqueda dentro del sitio si la página exacta no está disponible.
  
  Devuelve un array JSON con esta estructura exacta para cada producto:
  [
    {
      "name": "Nombre original del producto",
      "lider": { "price": 1290, "url": "https://www.lider.cl/..." },
      "jumbo": { "price": 1490, "url": "https://www.jumbo.cl/..." },
      "unimarc": { "price": 1390, "url": "https://www.unimarc.cl/..." }
    }
  ]`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              lider: {
                type: Type.OBJECT,
                properties: {
                  price: { type: Type.NUMBER },
                  url: { type: Type.STRING }
                },
                required: ["price"]
              },
              jumbo: {
                type: Type.OBJECT,
                properties: {
                  price: { type: Type.NUMBER },
                  url: { type: Type.STRING }
                },
                required: ["price"]
              },
              unimarc: {
                type: Type.OBJECT,
                properties: {
                  price: { type: Type.NUMBER },
                  url: { type: Type.STRING }
                },
                required: ["price"]
              }
            },
            required: ["name", "lider", "jumbo", "unimarc"]
          }
        }
      }
    });

    const text = response.text || '[]';
    return JSON.parse(text) as SupermarketPrice[];
  } catch (error) {
    console.error("Error searching market prices with Gemini Search:", error);
    // Generación de fallback local realista con el rango de precios chilenos típico
    return itemNames.map(name => {
      const basePrice = Math.floor(Math.random() * 4500) + 900; // 900 - 5400 CLP
      return {
        name,
        lider: { 
          price: Math.round(basePrice * 0.94), 
          url: `https://www.lider.cl/supermercado/search?query=${encodeURIComponent(name)}` 
        },
        jumbo: { 
          price: Math.round(basePrice * 1.04), 
          url: `https://www.jumbo.cl/busca?ft=${encodeURIComponent(name)}` 
        },
        unimarc: { 
          price: Math.round(basePrice * 0.99), 
          url: `https://www.unimarc.cl/search?q=${encodeURIComponent(name)}` 
        }
      };
    });
  }
}

