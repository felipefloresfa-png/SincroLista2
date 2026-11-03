/**
 * Utilidades para cálculo y filtrado de Atajos Rápidos de productos frecuentes
 * Inspirado en Grocery Genius: menos escritura, 1 solo toque, cantidad habitual.
 */

export const DEFAULT_ESSENTIALS = [
  { name: 'Leche', icon: '🥛', category: 'Lácteos' },
  { name: 'Huevos', icon: '🥚', category: 'Lácteos y Huevos' },
  { name: 'Pan', icon: '🍞', category: 'Panadería' },
  { name: 'Café', icon: '☕', category: 'Despensa' },
  { name: 'Arroz', icon: '🍚', category: 'Despensa' },
  { name: 'Aceite', icon: '🫗', category: 'Despensa' },
  { name: 'Pasta', icon: '🍝', category: 'Despensa' },
  { name: 'Fruta', icon: '🍎', category: 'Frutas y Verduras' },
  { name: 'Verduras', icon: '🥦', category: 'Frutas y Verduras' },
  { name: 'Carne', icon: '🥩', category: 'Carnes' },
  { name: 'Pollo', icon: '🍗', category: 'Carnes' },
  { name: 'Queso', icon: '🧀', category: 'Lácteos' },
  { name: 'Detergente', icon: '🧼', category: 'Limpieza' },
  { name: 'Papel Higiénico', icon: '🧻', category: 'Higiene' },
  { name: 'Galletas', icon: '🍪', category: 'Snacks' },
  { name: 'Snacks', icon: '🥨', category: 'Snacks' }
];

/**
 * Normaliza cadenas removiendo acentos, espacios extremos y pasando a minúsculas
 */
export function normalizeText(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Capitaliza adecuadamente un nombre para mostrarlo en pantalla
 */
export function formatItemName(str) {
  if (!str || typeof str !== 'string') return '';
  const trimmed = str.trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Extrae marca de tiempo numérica en ms de forma segura
 */
export function extractTimestamp(ts) {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Obtiene la cantidad habitual más común de una lista de conteos
 */
export function getHabitualQuantity(quantitiesRecord) {
  if (!quantitiesRecord) return '1';
  let bestQty = '1';
  let maxCount = 0;

  for (const [qty, count] of Object.entries(quantitiesRecord)) {
    if (count > maxCount) {
      maxCount = count;
      bestQty = qty;
    }
  }

  // Sanitizar cantidad: recortar a max 6 caracteres (ej: "2", "3", "1kg")
  const sanitized = String(bestQty).trim().slice(0, 8);
  return sanitized || '1';
}

/**
 * Construye el índice de sugerencias frecuentes a partir de historial, actividades y esenciales
 */
export function buildSuggestionsIndex({
  history = [],
  activities = [],
  essentials = DEFAULT_ESSENTIALS,
} = {}) {
  const index = new Map();

  function touchItem({
    rawName,
    quantity = '1',
    category = '',
    timestamp = 0,
    isFromHistory = false,
    icon = ''
  }) {
    const normalized = normalizeText(rawName);
    if (!normalized || normalized.length < 2) return;

    const timeMs = extractTimestamp(timestamp);
    const formattedQty = String(quantity || '1').trim();

    if (!index.has(normalized)) {
      index.set(normalized, {
        normalized,
        displayName: formatItemName(rawName),
        frequency: 0,
        quantities: {},
        category: category || '',
        lastTimestamp: timeMs,
        isFromHistory,
        icon: icon || ''
      });
    }

    const entry = index.get(normalized);
    if (isFromHistory) {
      entry.isFromHistory = true;
      entry.frequency += 1;
    }

    if (category && (!entry.category || entry.category === 'Otros')) {
      entry.category = category;
    }

    if (icon && !entry.icon) {
      entry.icon = icon;
    }

    if (formattedQty && formattedQty !== '0') {
      entry.quantities[formattedQty] = (entry.quantities[formattedQty] || 0) + 1;
    }

    if (timeMs > entry.lastTimestamp) {
      entry.lastTimestamp = timeMs;
    }
  }

  // 1. Agregar esenciales como base
  if (Array.isArray(essentials)) {
    essentials.forEach(item => {
      touchItem({
        rawName: item.name,
        quantity: '1',
        category: item.category,
        timestamp: 0,
        isFromHistory: false,
        icon: item.icon
      });
    });
  }

  // 2. Procesar historial de compras completadas (mayor peso)
  if (Array.isArray(history)) {
    history.forEach(purchase => {
      const pTime = purchase?.timestamp;
      if (Array.isArray(purchase?.items)) {
        purchase.items.forEach(item => {
          if (item?.name) {
            touchItem({
              rawName: item.name,
              quantity: item.quantity,
              category: item.category,
              timestamp: pTime,
              isFromHistory: true
            });
          }
        });
      }
    });
  }

  // 3. Procesar actividades recientes (productos añadidos o marcados)
  if (Array.isArray(activities)) {
    activities.forEach(activity => {
      if ((activity?.type === 'add' || activity?.type === 'check') && activity?.itemName) {
        touchItem({
          rawName: activity.itemName,
          quantity: '1',
          category: activity.category,
          timestamp: activity.timestamp,
          isFromHistory: true
        });
      }
    });
  }

  return index;
}

/**
 * Filtra y ordena las sugerencias según la búsqueda del usuario y el estado de la lista activa
 */
export function getQuickSuggestions({
  query = '',
  index,
  activeItems = [],
  limit = 8,
  now = Date.now()
} = {}) {
  if (!index || !(index instanceof Map)) {
    return [];
  }

  // Mapa de nombres activos pendientes (no comprados) en la lista actual
  const activeUncheckedNames = new Set();
  const activeCheckedNames = new Set();

  if (Array.isArray(activeItems)) {
    activeItems.forEach(item => {
      if (!item?.name) return;
      const norm = normalizeText(item.name);
      if (item.checked) {
        activeCheckedNames.add(norm);
      } else {
        activeUncheckedNames.add(norm);
      }
    });
  }

  const cleanQuery = normalizeText(query);
  const results = [];

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  for (const entry of index.values()) {
    const isAlreadyInActiveList = activeUncheckedNames.has(entry.normalized);
    const habitualQuantity = getHabitualQuantity(entry.quantities);

    // Cálculo de recency bonus
    let recencyBonus = 0;
    if (entry.lastTimestamp > 0) {
      const ageMs = Math.max(0, now - entry.lastTimestamp);
      if (ageMs <= SEVEN_DAYS_MS) {
        recencyBonus = 15;
      } else if (ageMs <= THIRTY_DAYS_MS) {
        recencyBonus = 8;
      } else {
        recencyBonus = 3;
      }
    }

    if (!cleanQuery) {
      // MODO SIN BÚSQUEDA (Solo foco en el campo):
      // Mostrar los productos habituales que NO están ya pendientes en la lista activa
      if (isAlreadyInActiveList) {
        continue;
      }

      // Puntuación: historial real tiene máxima prioridad sobre catálogo esencial
      const historyWeight = entry.isFromHistory ? 50 : 0;
      const frequencyScore = Math.min(entry.frequency * 6, 60);
      const score = historyWeight + frequencyScore + recencyBonus;

      results.push({
        name: entry.displayName,
        habitualQuantity,
        category: entry.category,
        frequency: entry.frequency,
        lastPurchasedAt: entry.lastTimestamp,
        isFromHistory: entry.isFromHistory,
        alreadyInList: false,
        icon: entry.icon || (entry.isFromHistory ? '✨' : '🛒'),
        score
      });
    } else {
      // MODO CON BÚSQUEDA (El usuario escribe texto):
      // Filtrar por coincidencia en cualquier parte del nombre
      if (!entry.normalized.includes(cleanQuery)) {
        continue;
      }

      let matchScore = 0;
      if (entry.normalized === cleanQuery) {
        matchScore = 120; // Coincidencia exacta
      } else if (entry.normalized.startsWith(cleanQuery)) {
        matchScore = 80; // Prefijo directo
      } else {
        const words = entry.normalized.split(/\s+/);
        if (words.some(w => w.startsWith(cleanQuery))) {
          matchScore = 50; // Prefijo de alguna palabra
        } else {
          matchScore = 25; // Subcadena interior
        }
      }

      const historyScore = entry.isFromHistory ? 20 : 5;
      const frequencyScore = Math.min(entry.frequency * 4, 30);
      // Penalizar levemente si ya está en la lista para que las sugerencias de agregar queden primero
      const listPenalty = isAlreadyInActiveList ? -45 : 0;

      const totalScore = matchScore + historyScore + frequencyScore + recencyBonus + listPenalty;

      results.push({
        name: entry.displayName,
        habitualQuantity,
        category: entry.category,
        frequency: entry.frequency,
        lastPurchasedAt: entry.lastTimestamp,
        isFromHistory: entry.isFromHistory,
        alreadyInList: isAlreadyInActiveList,
        icon: entry.icon || (entry.isFromHistory ? '✨' : '🛒'),
        score: totalScore
      });
    }
  }

  // Ordenar descendente por puntuación
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, limit);
}
