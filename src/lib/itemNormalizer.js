/**
 * Utilidades para normalización ortográfica, desduplicación inteligente
 * y nombres canónicos de productos de supermercado en español.
 */

// Diccionario canónico con acentuación y ortografía oficial en español (Chile / Latam)
export const CANONICAL_ITEMS_MAP = {
  // Pescados y Mariscos
  'atun': { canonical: 'Atún', category: 'Carnes y Pescados', priorityLevel: 'high' },
  'atunes': { canonical: 'Atún', category: 'Carnes y Pescados', priorityLevel: 'high' },
  'salmon': { canonical: 'Salmón', category: 'Carnes y Pescados', priorityLevel: 'high' },
  'pescado': { canonical: 'Pescado', category: 'Carnes y Pescados', priorityLevel: 'high' },
  'merluza': { canonical: 'Merluza', category: 'Carnes y Pescados', priorityLevel: 'medium' },
  'reineta': { canonical: 'Reineta', category: 'Carnes y Pescados', priorityLevel: 'medium' },
  'camarones': { canonical: 'Camarones', category: 'Carnes y Pescados', priorityLevel: 'medium' },
  'camaron': { canonical: 'Camarones', category: 'Carnes y Pescados', priorityLevel: 'medium' },
  'choritos': { canonical: 'Choritos', category: 'Carnes y Pescados', priorityLevel: 'medium' },
  'almejas': { canonical: 'Almejas', category: 'Carnes y Pescados', priorityLevel: 'medium' },

  // Carnes y Aves
  'pollo': { canonical: 'Pollo', category: 'Carnes y Pescados', priorityLevel: 'high' },
  'pechuga de pollo': { canonical: 'Pechuga de pollo', category: 'Carnes y Pescados', priorityLevel: 'high' },
  'carne': { canonical: 'Carne', category: 'Carnes y Pescados', priorityLevel: 'high' },
  'carne picada': { canonical: 'Carne molida', category: 'Carnes y Pescados', priorityLevel: 'high' },
  'carne molida': { canonical: 'Carne molida', category: 'Carnes y Pescados', priorityLevel: 'high' },
  'lomo liso': { canonical: 'Lomo liso', category: 'Carnes y Pescados', priorityLevel: 'medium' },
  'lomo vetado': { canonical: 'Lomo vetado', category: 'Carnes y Pescados', priorityLevel: 'medium' },
  'cerdo': { canonical: 'Cerdo', category: 'Carnes y Pescados', priorityLevel: 'medium' },
  'chuleta': { canonical: 'Chuletas de cerdo', category: 'Carnes y Pescados', priorityLevel: 'medium' },
  'chuletas': { canonical: 'Chuletas de cerdo', category: 'Carnes y Pescados', priorityLevel: 'medium' },
  'pavo': { canonical: 'Pavo', category: 'Carnes y Pescados', priorityLevel: 'medium' },
  'jamon': { canonical: 'Jamón', category: 'Carnes y Pescados', priorityLevel: 'medium' },
  'jamonada': { canonical: 'Jamonada', category: 'Carnes y Pescados', priorityLevel: 'low' },
  'salchichas': { canonical: 'Vienesas', category: 'Carnes y Pescados', priorityLevel: 'medium' },
  'vienesas': { canonical: 'Vienesas', category: 'Carnes y Pescados', priorityLevel: 'medium' },
  'hamburguesas': { canonical: 'Hamburguesas', category: 'Carnes y Pescados', priorityLevel: 'medium' },
  'hamburguesa': { canonical: 'Hamburguesas', category: 'Carnes y Pescados', priorityLevel: 'medium' },

  // Lácteos y Huevos
  'leche': { canonical: 'Leche', category: 'Lácteos y Huevos', priorityLevel: 'high' },
  'leche blanca': { canonical: 'Leche blanca', category: 'Lácteos y Huevos', priorityLevel: 'high' },
  'leche descremada': { canonical: 'Leche descremada', category: 'Lácteos y Huevos', priorityLevel: 'high' },
  'leche entera': { canonical: 'Leche entera', category: 'Lácteos y Huevos', priorityLevel: 'high' },
  'huevos': { canonical: 'Huevos', category: 'Lácteos y Huevos', priorityLevel: 'high' },
  'huevo': { canonical: 'Huevos', category: 'Lácteos y Huevos', priorityLevel: 'high' },
  'queso': { canonical: 'Queso', category: 'Lácteos y Huevos', priorityLevel: 'high' },
  'queso laminado': { canonical: 'Queso laminado', category: 'Lácteos y Huevos', priorityLevel: 'high' },
  'quesillo': { canonical: 'Quesillo', category: 'Lácteos y Huevos', priorityLevel: 'medium' },
  'yogur': { canonical: 'Yogurt', category: 'Lácteos y Huevos', priorityLevel: 'medium' },
  'yogurt': { canonical: 'Yogurt', category: 'Lácteos y Huevos', priorityLevel: 'medium' },
  'yogurt protein': { canonical: 'Yogurt protein', category: 'Lácteos y Huevos', priorityLevel: 'medium' },
  'mantequilla': { canonical: 'Mantequilla', category: 'Lácteos y Huevos', priorityLevel: 'medium' },
  'margarina': { canonical: 'Margarina', category: 'Lácteos y Huevos', priorityLevel: 'medium' },
  'crema': { canonical: 'Crema de leche', category: 'Lácteos y Huevos', priorityLevel: 'medium' },
  'crema de leche': { canonical: 'Crema de leche', category: 'Lácteos y Huevos', priorityLevel: 'medium' },

  // Despensa Básica
  'azucar': { canonical: 'Azúcar', category: 'Despensa', priorityLevel: 'medium' },
  'arroz': { canonical: 'Arroz', category: 'Despensa', priorityLevel: 'high' },
  'fideos': { canonical: 'Fideos', category: 'Despensa', priorityLevel: 'high' },
  'pasta': { canonical: 'Pasta', category: 'Despensa', priorityLevel: 'high' },
  'tallarines': { canonical: 'Tallarines', category: 'Despensa', priorityLevel: 'high' },
  'aceite': { canonical: 'Aceite', category: 'Despensa', priorityLevel: 'high' },
  'aceite vegetal': { canonical: 'Aceite vegetal', category: 'Despensa', priorityLevel: 'high' },
  'aceite oliva': { canonical: 'Aceite de oliva', category: 'Despensa', priorityLevel: 'medium' },
  'aceite de oliva': { canonical: 'Aceite de oliva', category: 'Despensa', priorityLevel: 'medium' },
  'sal': { canonical: 'Sal', category: 'Despensa', priorityLevel: 'medium' },
  'sal fina': { canonical: 'Sal fina', category: 'Despensa', priorityLevel: 'medium' },
  'cafe': { canonical: 'Café', category: 'Despensa', priorityLevel: 'high' },
  'cafe instantaneo': { canonical: 'Café instantáneo', category: 'Despensa', priorityLevel: 'high' },
  'te': { canonical: 'Té', category: 'Despensa', priorityLevel: 'medium' },
  'te negro': { canonical: 'Té negro', category: 'Despensa', priorityLevel: 'medium' },
  'te verde': { canonical: 'Té verde', category: 'Despensa', priorityLevel: 'medium' },
  'oregano': { canonical: 'Orégano', category: 'Despensa', priorityLevel: 'medium' },
  'salsa tomate': { canonical: 'Salsa de tomate', category: 'Despensa', priorityLevel: 'medium' },
  'salsa de tomate': { canonical: 'Salsa de tomate', category: 'Despensa', priorityLevel: 'medium' },
  'salsa soya': { canonical: 'Salsa de soya', category: 'Despensa', priorityLevel: 'medium' },
  'salsa de soya': { canonical: 'Salsa de soya', category: 'Despensa', priorityLevel: 'medium' },
  'mantequilla de mani': { canonical: 'Mantequilla de maní', category: 'Despensa', priorityLevel: 'medium' },
  'mani': { canonical: 'Maní', category: 'Despensa', priorityLevel: 'medium' },
  'mayonesa': { canonical: 'Mayonesa', category: 'Despensa', priorityLevel: 'low' },
  'ketchup': { canonical: 'Kétchup', category: 'Despensa', priorityLevel: 'low' },
  'mostaza': { canonical: 'Mostaza', category: 'Despensa', priorityLevel: 'low' },
  'harina': { canonical: 'Harina', category: 'Despensa', priorityLevel: 'medium' },
  'levadura': { canonical: 'Levadura', category: 'Despensa', priorityLevel: 'medium' },
  'avena': { canonical: 'Avena', category: 'Despensa', priorityLevel: 'medium' },
  'lentejas': { canonical: 'Lentejas', category: 'Despensa', priorityLevel: 'medium' },
  'porotos': { canonical: 'Porotos', category: 'Despensa', priorityLevel: 'medium' },
  'garbanzos': { canonical: 'Garbanzos', category: 'Despensa', priorityLevel: 'medium' },
  'barra proteina': { canonical: 'Barra de proteína', category: 'Despensa', priorityLevel: 'low' },
  'barra de proteina': { canonical: 'Barra de proteína', category: 'Despensa', priorityLevel: 'low' },

  // Panadería
  'pan': { canonical: 'Pan', category: 'Panadería', priorityLevel: 'high' },
  'pan de molde': { canonical: 'Pan de molde', category: 'Panadería', priorityLevel: 'high' },
  'pan de molde blanco': { canonical: 'Pan de molde blanco', category: 'Panadería', priorityLevel: 'high' },
  'pan de molde integral': { canonical: 'Pan de molde integral', category: 'Panadería', priorityLevel: 'high' },
  'marraqueta': { canonical: 'Marraqueta', category: 'Panadería', priorityLevel: 'high' },
  'hallulla': { canonical: 'Hallulla', category: 'Panadería', priorityLevel: 'high' },
  'galletas': { canonical: 'Galletas', category: 'Panadería', priorityLevel: 'medium' },
  'galleta': { canonical: 'Galletas', category: 'Panadería', priorityLevel: 'medium' },
  'galletas donats blancas': { canonical: 'Galletas Donuts blancas', category: 'Panadería', priorityLevel: 'low' },
  'donuts': { canonical: 'Donuts', category: 'Panadería', priorityLevel: 'low' },

  // Frutas y Verduras
  'tomate': { canonical: 'Tomate', category: 'Frutas y Verduras', priorityLevel: 'high' },
  'tomates': { canonical: 'Tomate', category: 'Frutas y Verduras', priorityLevel: 'high' },
  'cebolla': { canonical: 'Cebolla', category: 'Frutas y Verduras', priorityLevel: 'high' },
  'cebollas': { canonical: 'Cebolla', category: 'Frutas y Verduras', priorityLevel: 'high' },
  'papas': { canonical: 'Papas', category: 'Frutas y Verduras', priorityLevel: 'high' },
  'papa': { canonical: 'Papas', category: 'Frutas y Verduras', priorityLevel: 'high' },
  'palta': { canonical: 'Palta', category: 'Frutas y Verduras', priorityLevel: 'high' },
  'paltas': { canonical: 'Palta', category: 'Frutas y Verduras', priorityLevel: 'high' },
  'platano': { canonical: 'Plátanos', category: 'Frutas y Verduras', priorityLevel: 'medium' },
  'platanos': { canonical: 'Plátanos', category: 'Frutas y Verduras', priorityLevel: 'medium' },
  'limon': { canonical: 'Limón', category: 'Frutas y Verduras', priorityLevel: 'medium' },
  'limones': { canonical: 'Limones', category: 'Frutas y Verduras', priorityLevel: 'medium' },
  'manzana': { canonical: 'Manzana', category: 'Frutas y Verduras', priorityLevel: 'medium' },
  'manzanas': { canonical: 'Manzanas', category: 'Frutas y Verduras', priorityLevel: 'medium' },
  'naranja': { canonical: 'Naranja', category: 'Frutas y Verduras', priorityLevel: 'medium' },
  'naranjas': { canonical: 'Naranjas', category: 'Frutas y Verduras', priorityLevel: 'medium' },
  'lechuga': { canonical: 'Lechuga', category: 'Frutas y Verduras', priorityLevel: 'medium' },
  'zanahoria': { canonical: 'Zanahorias', category: 'Frutas y Verduras', priorityLevel: 'medium' },
  'zanahorias': { canonical: 'Zanahorias', category: 'Frutas y Verduras', priorityLevel: 'medium' },
  'pimenton': { canonical: 'Pimentón', category: 'Frutas y Verduras', priorityLevel: 'medium' },
  'pimiento': { canonical: 'Pimentón', category: 'Frutas y Verduras', priorityLevel: 'medium' },
  'choclo': { canonical: 'Choclo', category: 'Frutas y Verduras', priorityLevel: 'medium' },
  'champinon': { canonical: 'Champiñones', category: 'Frutas y Verduras', priorityLevel: 'medium' },
  'champinones': { canonical: 'Champiñones', category: 'Frutas y Verduras', priorityLevel: 'medium' },
  'brocoli': { canonical: 'Brócoli', category: 'Frutas y Verduras', priorityLevel: 'medium' },
  'sandia': { canonical: 'Sandía', category: 'Frutas y Verduras', priorityLevel: 'medium' },
  'melon': { canonical: 'Melón', category: 'Frutas y Verduras', priorityLevel: 'medium' },
  'frutillas': { canonical: 'Frutillas', category: 'Frutas y Verduras', priorityLevel: 'medium' },

  // Bebidas
  'jugo manzana': { canonical: 'Jugo de manzana', category: 'Bebidas', priorityLevel: 'medium' },
  'jugo de manzana': { canonical: 'Jugo de manzana', category: 'Bebidas', priorityLevel: 'medium' },
  'jugo naranja': { canonical: 'Jugo de naranja', category: 'Bebidas', priorityLevel: 'medium' },
  'jugo': { canonical: 'Jugo', category: 'Bebidas', priorityLevel: 'medium' },
  'agua': { canonical: 'Agua mineral', category: 'Bebidas', priorityLevel: 'high' },
  'agua mineral': { canonical: 'Agua mineral', category: 'Bebidas', priorityLevel: 'high' },
  'bebida': { canonical: 'Bebida', category: 'Bebidas', priorityLevel: 'medium' },
  'coca cola': { canonical: 'Coca-Cola', category: 'Bebidas', priorityLevel: 'medium' },

  // Higiene y Cuidado Personal
  'jabon': { canonical: 'Jabón', category: 'Higiene y Cuidado Personal', priorityLevel: 'high' },
  'jabon liquido': { canonical: 'Jabón líquido', category: 'Higiene y Cuidado Personal', priorityLevel: 'high' },
  'papel higienico': { canonical: 'Papel higiénico', category: 'Higiene y Cuidado Personal', priorityLevel: 'high' },
  'shampoo': { canonical: 'Shampoo', category: 'Higiene y Cuidado Personal', priorityLevel: 'medium' },
  'acondicionador': { canonical: 'Acondicionador', category: 'Higiene y Cuidado Personal', priorityLevel: 'medium' },
  'pasta de dientes': { canonical: 'Pasta de dientes', category: 'Higiene y Cuidado Personal', priorityLevel: 'high' },
  'pasta dental': { canonical: 'Pasta de dientes', category: 'Higiene y Cuidado Personal', priorityLevel: 'high' },
  'cepillo de dientes': { canonical: 'Cepillo de dientes', category: 'Higiene y Cuidado Personal', priorityLevel: 'medium' },
  'desodorante': { canonical: 'Desodorante', category: 'Higiene y Cuidado Personal', priorityLevel: 'high' },

  // Limpieza del Hogar
  'detergente': { canonical: 'Detergente', category: 'Limpieza del Hogar', priorityLevel: 'high' },
  'lavaloza': { canonical: 'Lavaloza', category: 'Limpieza del Hogar', priorityLevel: 'high' },
  'cloro': { canonical: 'Cloro', category: 'Limpieza del Hogar', priorityLevel: 'medium' },
  'toalla nova': { canonical: 'Toalla nova', category: 'Limpieza del Hogar', priorityLevel: 'high' },
  'papel absorbente': { canonical: 'Toalla nova', category: 'Limpieza del Hogar', priorityLevel: 'high' },
  'trapero': { canonical: 'Trapero', category: 'Limpieza del Hogar', priorityLevel: 'low' },
  'trapero humedo': { canonical: 'Trapero húmedo', category: 'Limpieza del Hogar', priorityLevel: 'low' },
  'papel alusa': { canonical: 'Papel alusa', category: 'Limpieza del Hogar', priorityLevel: 'medium' },
  'alusa foil': { canonical: 'Papel alusa foil', category: 'Limpieza del Hogar', priorityLevel: 'medium' },
  'alusa plas': { canonical: 'Alusa plast', category: 'Limpieza del Hogar', priorityLevel: 'medium' },
  'bolsas de basura': { canonical: 'Bolsas de basura', category: 'Limpieza del Hogar', priorityLevel: 'medium' },
  'esponja': { canonical: 'Esponja de cocina', category: 'Limpieza del Hogar', priorityLevel: 'medium' }
};

/**
 * Normaliza un texto removiendo acentos, signos de puntuación extra, espacios repetidos y minúsculas.
 */
export function normalizeItemKey(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remover tildes
    .replace(/[^a-z0-9\s]/g, ' ') // Separadores y signos de puntuación
    .replace(/\s+/g, ' ') // Espacios múltiples a uno
    .trim();
}

/**
 * Obtiene la raíz básica eliminando plurales comunes en español ('es', 's')
 * para comparar "huevo" con "huevos", "manzanas" con "manzana", etc.
 */
export function getStemmedKey(str) {
  const norm = normalizeItemKey(str);
  if (!norm) return '';

  const words = norm.split(' ');
  const stemmedWords = words.map(w => {
    if (w.length <= 3) return w;
    // Casos especiales que terminan en s pero son singulares o invariables
    if (['arroz', 'atun', 'fideos', 'alusa', 'almejas', 'choritos'].includes(w)) return w;
    if (w.endsWith('ces')) {
      return w.slice(0, -3) + 'z'; // nueces -> nuez
    }
    if (w.endsWith('es') && w.length > 4 && !['aceite', 'leche', 'carne'].includes(w)) {
      return w.slice(0, -2);
    }
    if (w.endsWith('s') && !w.endsWith('ss')) {
      return w.slice(0, -1);
    }
    return w;
  });

  return stemmedWords.join(' ');
}

/**
 * Determina si dos nombres de productos se refieren al mismo producto,
 * ignorando diferencias de ortografía, tildes, mayúsculas o plurales.
 * Ej: "Atun" y "Atún" -> true
 *     "Jabon" y "Jabón" -> true
 *     "Huevos" y "Huevo" -> true
 */
export function areItemsEquivalent(nameA, nameB) {
  if (!nameA || !nameB) return false;
  const keyA = normalizeItemKey(nameA);
  const keyB = normalizeItemKey(nameB);
  if (!keyA || !keyB) return false;

  if (keyA === keyB) return true;

  // Comparación por raíz singular/plural
  const stemA = getStemmedKey(keyA);
  const stemB = getStemmedKey(keyB);
  if (stemA === stemB) return true;

  // Verificar si ambos apuntan al mismo canónico
  const canonA = CANONICAL_ITEMS_MAP[keyA]?.canonical || CANONICAL_ITEMS_MAP[stemA]?.canonical;
  const canonB = CANONICAL_ITEMS_MAP[keyB]?.canonical || CANONICAL_ITEMS_MAP[stemB]?.canonical;
  if (canonA && canonB && canonA.toLowerCase() === canonB.toLowerCase()) {
    return true;
  }

  return false;
}

/**
 * Obtiene el nombre canónico ortográficamente correcto y su categoría si está disponible.
 * Si no está en el catálogo, capitaliza prolijamente respetando palabras.
 */
export function getCanonicalItem(rawName) {
  if (!rawName || typeof rawName !== 'string') {
    return { name: '', category: undefined, priorityLevel: undefined };
  }

  const key = normalizeItemKey(rawName);
  const stem = getStemmedKey(rawName);

  // 1. Coincidencia directa en diccionario
  if (CANONICAL_ITEMS_MAP[key]) {
    const item = CANONICAL_ITEMS_MAP[key];
    return {
      name: item.canonical,
      category: item.category,
      priorityLevel: item.priorityLevel
    };
  }

  // 2. Coincidencia por raíz / plural
  if (CANONICAL_ITEMS_MAP[stem]) {
    const item = CANONICAL_ITEMS_MAP[stem];
    return {
      name: item.canonical,
      category: item.category,
      priorityLevel: item.priorityLevel
    };
  }

  // 3. Fallback: Limpieza y capitalización estándar
  const cleanTrimmed = rawName.trim().replace(/\s+/g, ' ');
  const formatted = cleanTrimmed.charAt(0).toUpperCase() + cleanTrimmed.slice(1);
  return {
    name: formatted,
    category: undefined,
    priorityLevel: undefined
  };
}

/**
 * Desduplica un arreglo de productos históricos o activos
 * unificando aquellos con variantes ortográficas (ej: "Atun" y "Atún").
 */
export function deduplicateItemList(items = []) {
  if (!Array.isArray(items)) return [];
  const map = new Map();

  for (const item of items) {
    if (!item) continue;
    const rawName = typeof item === 'string' ? item : (item.name || '');
    if (!rawName.trim()) continue;

    const canonicalInfo = getCanonicalItem(rawName);
    const key = normalizeItemKey(canonicalInfo.name || rawName);

    if (!map.has(key)) {
      if (typeof item === 'string') {
        map.set(key, canonicalInfo.name || rawName);
      } else {
        map.set(key, {
          ...item,
          name: canonicalInfo.name || item.name,
          category: item.category || canonicalInfo.category,
          quantity: item.quantity || '1'
        });
      }
    } else {
      // Si ya existía, conservar la forma canónica con mejor ortografía (con tildes)
      const existing = map.get(key);
      if (typeof item !== 'string' && typeof existing !== 'string') {
        // Sumar cantidades si son numéricas
        const qtyA = parseInt(existing.quantity, 10) || 1;
        const qtyB = parseInt(item.quantity, 10) || 1;
        existing.quantity = String(qtyA + qtyB);
        if (item.price && !existing.price) existing.price = item.price;
      }
    }
  }

  return Array.from(map.values());
}
