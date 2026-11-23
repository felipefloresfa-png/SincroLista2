import { getCanonicalItem, normalizeItemKey, areItemsEquivalent } from './itemNormalizer.js';

export const PANTRY_ZONES = [
  { id: 'all', label: 'Todas las zonas' },
  { id: 'fridge', label: 'Refrigerador y frescos' },
  { id: 'cupboard', label: 'Alacena y desayunos' },
  { id: 'cleaning', label: 'Higiene y limpieza' },
];

export const DEFAULT_PANTRY_STAPLES = [
  { name: 'Leche', category: 'Lácteos y Huevos' },
  { name: 'Yogurt', category: 'Lácteos y Huevos' },
  { name: 'Huevos', category: 'Lácteos y Huevos' },
  { name: 'Queso', category: 'Lácteos y Huevos' },
  { name: 'Carne', category: 'Carnes y Pescados' },
  { name: 'Pollo', category: 'Carnes y Pescados' },
  { name: 'Fruta', category: 'Frutas y Verduras' },
  { name: 'Pan', category: 'Panadería' },
  { name: 'Agua', category: 'Bebidas' },
  { name: 'Café', category: 'Despensa' },
  { name: 'Arroz', category: 'Despensa' },
  { name: 'Pasta', category: 'Despensa' },
  { name: 'Aceite', category: 'Despensa' },
  { name: 'Azúcar', category: 'Despensa' },
  { name: 'Atún', category: 'Carnes y Pescados' },
  { name: 'Detergente', category: 'Limpieza del Hogar' },
  { name: 'Papel higiénico', category: 'Higiene y Cuidado Personal' },
  { name: 'Lavaloza', category: 'Limpieza del Hogar' },
];

const CATEGORY_DEFAULT_DAYS = {
  'Panadería': 4,
  'Frutas y Verduras': 6,
  'Carnes y Pescados': 7,
  'Lácteos y Huevos': 7,
  'Congelados': 18,
  'Bebidas': 10,
  'Despensa': 21,
  'Alcohol': 21,
  'Higiene y Cuidado Personal': 25,
  'Limpieza del Hogar': 30,
  'Mascotas': 21,
  'Bebés': 14,
  'Otros': 14,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Agrupa sabores, presentaciones y variantes del mismo producto de despensa
 * bajo una familia común (ej. "Yogurt piña", "Yogurt frutilla" y "Yogurt proteína" -> "Yogurt")
 * sin perder el detalle de variantes para el usuario.
 */
export function resolvePantryFamily(rawName, explicitCategory = null) {
  const canonical = getCanonicalItem(rawName || '');
  const variantName = canonical.name || (typeof rawName === 'string' ? rawName.trim() : '');
  const key = normalizeItemKey(variantName);
  const category =
    canonical.category && canonical.category !== 'Otros'
      ? canonical.category
      : explicitCategory || 'Otros';

  if (!key) {
    return { familyName: '', familyKey: '', variantName: '', category };
  }

  let familyName = variantName;
  let familyCategory = category;

  if (/^yogurt?\b/.test(key)) {
    familyName = 'Yogurt';
    familyCategory = 'Lácteos y Huevos';
  } else if (
    /^leche\b/.test(key) &&
    !/\b(condensada|evaporada|polvo|coco|almendra|almendras|soya|avena)\b/.test(key)
  ) {
    familyName = 'Leche';
    familyCategory = 'Lácteos y Huevos';
  } else if (/^pan de molde\b/.test(key)) {
    familyName = 'Pan de molde';
    familyCategory = 'Panadería';
  } else if (/^(pan|marraqueta|hallulla|coliza|dobladita|dobladitas)\b/.test(key) && !/^pan rallado\b/.test(key)) {
    familyName = 'Pan';
    familyCategory = 'Panadería';
  } else if (
    (/^(agua|cachantun|cachantum|benedictino|bidon\s+de\s+agua)\b/.test(key) || /^agua\s+/.test(key)) &&
    !/\b(oxigenada|destilada|micelar|termal|tonica|florida|colonia|rosas|mar|bateria|ardiente|aguarras)\b/.test(key)
  ) {
    familyName = 'Agua';
    familyCategory = 'Bebidas';
  } else if (/^jugo\b/.test(key) && !/\b(limon)\b/.test(key)) {
    familyName = 'Jugo';
    familyCategory = 'Bebidas';
  } else if (/^te\b/.test(key) && (key === 'te' || /^te (negro|verde|rojo|chai|blanco|hierbas|manzanilla|menta|boldo|frutos|canela)/.test(key))) {
    familyName = 'Té';
    familyCategory = 'Despensa';
  } else if (/^cafe\b/.test(key) && !/\bcon leche\b/.test(key)) {
    familyName = 'Café';
    familyCategory = 'Despensa';
  } else if (/^(galleta|galletas|donuts)\b/.test(key)) {
    familyName = 'Galletas';
    familyCategory = 'Panadería';
  } else if (/^(pasta|fideos|tallarines|espagueti|espirales|corbatas|macarrones|lasana)\b/.test(key)) {
    familyName = 'Pasta';
    familyCategory = 'Despensa';
  } else if (/^atun\b/.test(key)) {
    familyName = 'Atún';
    familyCategory = 'Carnes y Pescados';
  } else if (/^aceite\b/.test(key) && !/\boliva\b/.test(key)) {
    familyName = 'Aceite';
    familyCategory = 'Despensa';
  } else if (
    /^queso\b/.test(key) &&
    !/\b(rallado|crema|cottage|ricota|philadelphia)\b/.test(key)
  ) {
    familyName = 'Queso';
    familyCategory = 'Lácteos y Huevos';
  } else if (/^jabon\b/.test(key) && !/\blavaloza\b/.test(key)) {
    familyName = 'Jabón';
    familyCategory = 'Higiene y Cuidado Personal';
  } else if (/^detergente\b/.test(key)) {
    familyName = 'Detergente';
    familyCategory = 'Limpieza del Hogar';
  } else if (/^barra\s+(?:de\s+)?proteina\b/.test(key) || /^barrita/.test(key)) {
    familyName = 'Barra de proteína';
    familyCategory = 'Despensa';
  }

  return {
    familyName,
    familyKey: normalizeItemKey(familyName),
    variantName,
    category: familyCategory,
  };
}

export function getPantryZoneForCategory(category) {
  switch (category) {
    case 'Lácteos y Huevos':
    case 'Carnes y Pescados':
    case 'Frutas y Verduras':
    case 'Congelados':
      return 'fridge';
    case 'Limpieza del Hogar':
    case 'Higiene y Cuidado Personal':
    case 'Mascotas':
    case 'Bebés':
      return 'cleaning';
    default:
      return 'cupboard';
  }
}

export function getPantryZoneLabel(zoneId) {
  const match = PANTRY_ZONES.find((z) => z.id === zoneId);
  return match ? match.label : 'Alacena y desayunos';
}

export function parseNumericQuantity(rawQty) {
  if (typeof rawQty === 'number') {
    return Number.isFinite(rawQty) && rawQty > 0 ? Math.min(20, rawQty) : 1;
  }
  if (typeof rawQty !== 'string') return 1;
  const trimmed = rawQty.trim().toLowerCase();
  if (!trimmed) return 1;

  if (/^\d+(?:[.,]\d+)?\s*(?:gr?|gramos?|ml|cc)\b/.test(trimmed)) {
    return 1;
  }

  const match = trimmed.match(/^x?\s*(\d+(?:[.,]\d+)?)/);
  if (!match) return 1;
  const parsed = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.min(20, parsed);
}

function parseEntryTimestampMs(timestamp) {
  if (!timestamp) return null;
  try {
    if (typeof timestamp.toMillis === 'function') {
      const ms = timestamp.toMillis();
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof timestamp.toDate === 'function') {
      const ms = timestamp.toDate().getTime();
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof timestamp.seconds === 'number') {
      const ms = timestamp.seconds * 1000;
      return Number.isFinite(ms) ? ms : null;
    }
    const ms = new Date(timestamp).getTime();
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function computeConsumptionProfile(entry, now) {
  const events = entry._purchaseEvents || [];
  if (events.length === 0) {
    return {
      lastQuantity: 1,
      habitualQuantity: 1,
      avgIntervalDays: null,
      estimatedDurationDays: null,
      daysRemaining: null,
      stockPercent: null,
      stockStatus: 'unknown',
      cadenceSource: 'none',
    };
  }

  // Consolidar compras hechas el mismo día calendario en una sola visita (ej. dos sabores de yogurt el mismo día)
  const sortedEvents = [...events].sort((a, b) => a.timestampMs - b.timestampMs);
  const dailyBuckets = [];
  for (const ev of sortedEvents) {
    const prev = dailyBuckets[dailyBuckets.length - 1];
    if (prev && Math.abs(ev.timestampMs - prev.timestampMs) < DAY_MS * 0.6) {
      prev.quantity += ev.quantity;
      prev.timestampMs = Math.max(prev.timestampMs, ev.timestampMs);
    } else {
      dailyBuckets.push({ timestampMs: ev.timestampMs, quantity: ev.quantity });
    }
  }

  const latest = dailyBuckets[dailyBuckets.length - 1];
  const lastQuantity = Math.max(1, Math.round(latest.quantity * 10) / 10);

  const qtyCounts = new Map();
  let qtySum = 0;
  for (const b of dailyBuckets) {
    const rounded = Math.max(1, Math.round(b.quantity));
    qtyCounts.set(rounded, (qtyCounts.get(rounded) || 0) + 1);
    qtySum += b.quantity;
  }
  let habitualQuantity = Math.max(1, Math.round(qtySum / dailyBuckets.length));
  let bestCount = 0;
  for (const [q, count] of qtyCounts.entries()) {
    if (count > bestCount) {
      bestCount = count;
      habitualQuantity = q;
    }
  }

  const baseCategoryDays = CATEGORY_DEFAULT_DAYS[entry.category] || 14;
  const maxValidIntervalDays = Math.max(60, baseCategoryDays * 5);

  const intervals = [];
  for (let i = 1; i < dailyBuckets.length; i++) {
    const diffDays = (dailyBuckets[i].timestampMs - dailyBuckets[i - 1].timestampMs) / DAY_MS;
    if (diffDays >= 1 && diffDays <= maxValidIntervalDays) {
      intervals.push({
        days: diffDays,
        prevQty: Math.max(1, dailyBuckets[i - 1].quantity),
      });
    }
  }

  let avgIntervalDays = null;
  let estimatedDurationDays = null;
  let cadenceSource = 'category';

  if (intervals.length > 0) {
    cadenceSource = 'observed';
    const totalDays = intervals.reduce((acc, it) => acc + it.days, 0);
    avgIntervalDays = Math.max(1, Math.round(totalDays / intervals.length));

    // Usar mediana de días por unidad para que una pausa atípica no infle la duración
    const rates = intervals
      .map((it) => it.days / Math.max(1, it.prevQty))
      .sort((a, b) => a - b);
    const mid = Math.floor(rates.length / 2);
    const medianDaysPerUnit =
      rates.length % 2 === 1 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2;

    estimatedDurationDays = clamp(Math.round(medianDaysPerUnit * lastQuantity), 2, 180);
  } else {
    const qtyMultiplier = lastQuantity > 1 ? Math.min(2.5, 1 + (lastQuantity - 1) * 0.55) : 1;
    estimatedDurationDays = clamp(Math.round(baseCategoryDays * qtyMultiplier), 2, 120);
  }

  const daysSince = Math.max(0, Math.floor((now - latest.timestampMs) / DAY_MS));
  const daysRemaining = estimatedDurationDays - daysSince;
  const stockPercent = clamp(Math.round((daysRemaining / estimatedDurationDays) * 100), 0, 100);

  let stockStatus = 'ok';
  // Compras sin actividad en >90 días y vencidas hace >45 días (o compradas pocas veces) pasan a inactivas
  if (
    (daysSince > 90 && dailyBuckets.length < 3) ||
    (daysSince > 90 && daysRemaining < -45)
  ) {
    stockStatus = 'stale';
  } else if (daysRemaining <= 0) {
    stockStatus = 'depleted';
  } else if (daysRemaining <= 3 || stockPercent <= 25) {
    stockStatus = 'low';
  }

  return {
    lastQuantity,
    habitualQuantity,
    avgIntervalDays,
    estimatedDurationDays,
    daysRemaining,
    stockPercent,
    stockStatus,
    cadenceSource,
  };
}

/**
 * Construye un catálogo unificado de despensa agrupando sabores/variantes por familia base
 * y calculando duración real, stock restante y vínculo directo con el checklist activo.
 */
export function buildPantryCatalog({
  history = [],
  activities = [],
  activeItems = [],
  essentials = DEFAULT_PANTRY_STAPLES,
  now = Date.now(),
} = {}) {
  const map = new Map();

  const ensureFamilyEntry = (rawName, explicitCategory = null, timestampMs = null) => {
    if (!rawName || typeof rawName !== 'string') return null;
    const trimmed = rawName.trim();
    if (!trimmed) return null;

    const resolved = resolvePantryFamily(trimmed, explicitCategory);
    if (!resolved.familyKey) return null;

    let entry = map.get(resolved.familyKey);
    if (!entry) {
      const zone = getPantryZoneForCategory(resolved.category);
      entry = {
        key: resolved.familyKey,
        name: resolved.familyName,
        category: resolved.category,
        zone,
        zoneLabel: getPantryZoneLabel(zone),
        frequency: 0,
        isFromHistory: false,
        isEssential: false,
        lastPurchasedAt: null,
        daysSinceLastPurchase: null,
        lastQuantity: 1,
        habitualQuantity: 1,
        avgIntervalDays: null,
        estimatedDurationDays: null,
        daysRemaining: null,
        stockPercent: null,
        stockStatus: 'unknown',
        cadenceSource: 'none',
        variants: [],
        preferredVariant: resolved.familyName,
        inListItem: null,
        needsRestock: false,
        _purchaseEvents: [],
        _variantStats: new Map(),
      };
      map.set(resolved.familyKey, entry);
    }

    // Registrar variante específica cuando difiere del nombre base de la familia
    if (resolved.variantName && timestampMs !== null) {
      const vKey = normalizeItemKey(resolved.variantName);
      const prev = entry._variantStats.get(vKey) || {
        name: resolved.variantName,
        count: 0,
        lastMs: 0,
      };
      prev.count += 1;
      if (timestampMs > prev.lastMs) {
        prev.lastMs = timestampMs;
        prev.name = resolved.variantName;
      }
      entry._variantStats.set(vKey, prev);
    } else if (resolved.variantName && timestampMs === null && resolved.variantName !== entry.name) {
      const vKey = normalizeItemKey(resolved.variantName);
      if (!entry._variantStats.has(vKey)) {
        entry._variantStats.set(vKey, { name: resolved.variantName, count: 0.5, lastMs: 0 });
      }
    }

    return entry;
  };

  for (const staple of essentials || []) {
    const entry = ensureFamilyEntry(staple.name, staple.category, null);
    if (entry) entry.isEssential = true;
  }

  for (const hEntry of history || []) {
    if (!hEntry || !Array.isArray(hEntry.items)) continue;
    const entryMs = parseEntryTimestampMs(hEntry.timestamp);
    for (const item of hEntry.items) {
      const rawName = typeof item === 'string' ? item : item?.name;
      const entry = ensureFamilyEntry(
        rawName,
        typeof item === 'object' ? item?.category : null,
        entryMs
      );
      if (!entry) continue;
      entry.frequency += 1;
      entry.isFromHistory = true;
      const qty = parseNumericQuantity(typeof item === 'object' ? item?.quantity : 1);
      if (entryMs !== null) {
        entry._purchaseEvents.push({ timestampMs: entryMs, quantity: qty });
        if (entry.lastPurchasedAt === null || entryMs > entry.lastPurchasedAt) {
          entry.lastPurchasedAt = entryMs;
        }
      }
    }
  }

  for (const act of activities || []) {
    if (!act || (act.type !== 'add' && act.type !== 'check')) continue;
    const actMs = parseEntryTimestampMs(act.timestamp);
    const entry = ensureFamilyEntry(act.itemName, act.category, actMs);
    if (!entry) continue;
    entry.frequency += 0.5;
    entry.isFromHistory = true;
  }

  const pendingItems = (activeItems || []).filter((item) => item && !item.checked);

  for (const entry of map.values()) {
    if (entry.lastPurchasedAt !== null) {
      const diffDays = Math.max(0, Math.floor((now - entry.lastPurchasedAt) / DAY_MS));
      entry.daysSinceLastPurchase = diffDays;
    }

    const profile = computeConsumptionProfile(entry, now);
    entry.lastQuantity = profile.lastQuantity;
    entry.habitualQuantity = profile.habitualQuantity;
    entry.avgIntervalDays = profile.avgIntervalDays;
    entry.estimatedDurationDays = profile.estimatedDurationDays;
    entry.daysRemaining = profile.daysRemaining;
    entry.stockPercent = profile.stockPercent;
    entry.stockStatus = profile.stockStatus;
    entry.cadenceSource = profile.cadenceSource;

    const sortedVariants = Array.from(entry._variantStats.values()).sort(
      (a, b) => b.lastMs - a.lastMs || b.count - a.count
    );
    entry.variants = sortedVariants.map((v) => v.name);
    entry.preferredVariant = sortedVariants[0]?.name || entry.name;

    // Emparejar si la lista activa tiene el producto base o cualquiera de sus sabores/variantes
    const matched = pendingItems.find((active) => {
      if (areItemsEquivalent(active.name, entry.name)) return true;
      const activeFam = resolvePantryFamily(active.name);
      return activeFam.familyKey === entry.key;
    });

    if (matched) {
      const parsedQty = parseInt(String(matched.quantity || '1'), 10);
      entry.inListItem = {
        id: matched.id,
        name: matched.name,
        quantity: Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1,
      };
    }

    entry.needsRestock =
      !entry.inListItem &&
      (entry.stockStatus === 'depleted' ||
        entry.stockStatus === 'low' ||
        (entry.cadenceSource === 'none' && entry.isFromHistory && entry.frequency >= 2));

    delete entry._purchaseEvents;
    delete entry._variantStats;
  }

  const urgencyRank = { depleted: 0, low: 1, ok: 2, unknown: 3, stale: 4 };

  return Array.from(map.values()).sort((a, b) => {
    if (a.needsRestock !== b.needsRestock) return a.needsRestock ? -1 : 1;
    const rankDiff = urgencyRank[a.stockStatus] - urgencyRank[b.stockStatus];
    if (rankDiff !== 0) return rankDiff;
    if (a.isFromHistory !== b.isFromHistory) return a.isFromHistory ? -1 : 1;
    if (b.frequency !== a.frequency) return b.frequency - a.frequency;
    if (a.isEssential !== b.isEssential) return a.isEssential ? -1 : 1;
    return a.name.localeCompare(b.name, 'es');
  });
}

/**
 * Formatea una explicación humana corta sobre el ciclo de consumo del producto.
 */
export function formatConsumptionSummary(item) {
  if (!item || item.daysSinceLastPurchase === null) {
    if (item?.isFromHistory && item.frequency >= 1) {
      const count = Math.max(1, Math.round(item.frequency));
      return `Comprado ${count} ${count === 1 ? 'vez' : 'veces'}`;
    }
    return 'Básico del hogar';
  }

  const agoText =
    item.daysSinceLastPurchase === 0
      ? 'hoy'
      : item.daysSinceLastPurchase === 1
        ? 'hace 1 d'
        : `hace ${item.daysSinceLastPurchase} d`;

  const qtyText = item.lastQuantity > 1 ? ` (x${item.lastQuantity})` : '';
  const durText = item.estimatedDurationDays ? ` · Dura aprox. ${item.estimatedDurationDays} d` : '';

  return `Última compra ${agoText}${qtyText}${durText}`;
}

/**
 * Devuelve las alertas prioritarias para mostrar directamente dentro del Checklist.
 */
export function buildChecklistPantryAlerts({ catalogItems = [], max = 5 } = {}) {
  return (catalogItems || [])
    .filter((item) => !item.inListItem && (item.stockStatus === 'depleted' || item.stockStatus === 'low'))
    .sort((a, b) => {
      const remA = a.daysRemaining ?? 999;
      const remB = b.daysRemaining ?? 999;
      if (remA !== remB) return remA - remB;
      return b.frequency - a.frequency;
    })
    .slice(0, max);
}

/**
 * Busca la información de consumo/duración de un producto (o de su familia) para el Checklist.
 */
export function findPantryConsumptionHint(itemName, catalogItems = []) {
  if (!itemName || !Array.isArray(catalogItems) || catalogItems.length === 0) return null;
  const itemFamily = resolvePantryFamily(itemName);
  const matched = catalogItems.find(
    (entry) => areItemsEquivalent(entry.name, itemName) || (itemFamily.familyKey && entry.key === itemFamily.familyKey)
  );
  if (!matched || matched.daysSinceLastPurchase === null) return null;
  return {
    daysSinceLastPurchase: matched.daysSinceLastPurchase,
    estimatedDurationDays: matched.estimatedDurationDays,
    daysRemaining: matched.daysRemaining,
    stockStatus: matched.stockStatus,
    lastQuantity: matched.lastQuantity,
    habitualQuantity: matched.habitualQuantity,
    cadenceSource: matched.cadenceSource,
  };
}

/**
 * Combina sugerencias de IA con reposiciones calculadas desde el modelo de duración real.
 */
export function buildRestockSuggestions({
  catalogItems = [],
  aiSuggestions = [],
  activeItems = [],
  max = 3,
} = {}) {
  const results = [];
  const seenKeys = new Set();
  const pendingItems = (activeItems || []).filter((item) => item && !item.checked);

  const findInList = (name, familyKey) => {
    const matched = pendingItems.find((item) => {
      if (areItemsEquivalent(item.name, name)) return true;
      return familyKey && resolvePantryFamily(item.name).familyKey === familyKey;
    });
    if (!matched) return null;
    const parsedQty = parseInt(String(matched.quantity || '1'), 10);
    return {
      id: matched.id,
      name: matched.name,
      quantity: Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1,
    };
  };

  for (const s of aiSuggestions || []) {
    if (!s?.name) continue;
    const family = resolvePantryFamily(s.name);
    const key = family.familyKey || normalizeItemKey(s.name);
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);

    const catalogMatch = (catalogItems || []).find((c) => c.key === key);
    results.push({
      key,
      name: s.name.trim(),
      reason: s.reason || 'Sugerido por tu ritmo de consumo',
      source: 'ai',
      recommendedQty: catalogMatch?.habitualQuantity || 1,
      inListItem: findInList(s.name, key),
    });
    if (results.length >= max) return results;
  }

  const localCandidates = (catalogItems || [])
    .filter(
      (item) =>
        !seenKeys.has(item.key) &&
        !item.inListItem &&
        item.isFromHistory &&
        item.stockStatus !== 'stale'
    )
    .sort((a, b) => {
      const remA = a.daysRemaining ?? 999;
      const remB = b.daysRemaining ?? 999;
      if (remA !== remB) return remA - remB;
      return b.frequency - a.frequency;
    });

  for (const item of localCandidates) {
    let reason;
    if (item.daysRemaining !== null && item.estimatedDurationDays !== null) {
      if (item.daysRemaining <= 0) {
        const overdue = Math.abs(item.daysRemaining);
        reason =
          overdue === 0
            ? `Suele durar ${item.estimatedDurationDays} días · Toca reponer hoy`
            : `Suele durar ${item.estimatedDurationDays} días · Pasado por ${overdue} ${overdue === 1 ? 'día' : 'días'}`;
      } else {
        reason = `Quedan ${item.daysRemaining} ${item.daysRemaining === 1 ? 'día' : 'días'} · Ciclo de ${item.estimatedDurationDays} d`;
      }
    } else {
      const purchaseCount = Math.max(1, Math.round(item.frequency));
      reason = `Frecuente en tu hogar · ${purchaseCount} ${purchaseCount === 1 ? 'compra' : 'compras'}`;
    }

    seenKeys.add(item.key);
    results.push({
      key: item.key,
      name: item.preferredVariant || item.name,
      reason,
      source: 'history',
      recommendedQty: item.habitualQuantity || 1,
      inListItem: null,
    });
    if (results.length >= max) break;
  }

  return results;
}

/**
 * Unifica en una sola barra deduplicada las reposiciones urgentes de la despensa
 * y las recomendaciones habituales/IA, evitando duplicar productos o mostrar dos bloques.
 */
export function buildUnifiedChecklistSuggestions({
  catalogItems = [],
  aiRecommendations = [],
  activeItems = [],
  max = 8,
} = {}) {
  const results = [];
  const seenKeys = new Set();

  for (const active of activeItems || []) {
    if (!active || active.checked || !active.name) continue;
    const fam = resolvePantryFamily(active.name);
    if (fam.familyKey) seenKeys.add(fam.familyKey);
    const rawKey = normalizeItemKey(active.name);
    if (rawKey) seenKeys.add(rawKey);
  }

  const pantryAlerts = buildChecklistPantryAlerts({ catalogItems, max: 5 });
  for (const alert of pantryAlerts) {
    if (seenKeys.has(alert.key)) continue;
    seenKeys.add(alert.key);

    const targetName = alert.preferredVariant || alert.name;
    let hintText = null;
    if (alert.daysRemaining !== null) {
      if (alert.daysRemaining <= 0) {
        const overdue = Math.abs(alert.daysRemaining);
        if (overdue > 30) {
          hintText = 'por reponer';
        } else if (overdue === 0) {
          hintText = 'toca hoy';
        } else {
          hintText = `pasado ${overdue} d`;
        }
      } else {
        hintText = `quedan ${alert.daysRemaining} d`;
      }
    }

    results.push({
      key: `pantry-${alert.key}`,
      familyKey: alert.key,
      label: targetName,
      targetName,
      quantity: alert.habitualQuantity > 1 ? alert.habitualQuantity : 1,
      hintText,
      source: 'pantry',
    });

    if (results.length >= max) return results;
  }

  for (const rec of aiRecommendations || []) {
    if (!rec || typeof rec !== 'string') continue;
    const trimmed = rec.trim();
    if (!trimmed) continue;
    const fam = resolvePantryFamily(trimmed);
    const key = fam.familyKey || normalizeItemKey(trimmed);
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);

    const display = fam.variantName || trimmed;
    results.push({
      key: `ai-${key}`,
      familyKey: key,
      label: display,
      targetName: display,
      quantity: 1,
      hintText: null,
      source: 'ai',
      rawRec: rec,
    });

    if (results.length >= max) break;
  }

  return results;
}
