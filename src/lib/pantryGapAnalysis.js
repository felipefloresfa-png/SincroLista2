import {
  areItemsEquivalent,
  getCanonicalItem,
  getStemmedKey,
  normalizeItemKey,
} from './itemNormalizer.js';
import {
  buildSuggestionsIndex,
  DEFAULT_ESSENTIALS,
  getHabitualQuantity,
} from './quickSuggestions.js';

const PANTRY_SYNONYM_GROUPS = [
  ['pasta', 'fideos', 'tallarines', 'espaguetis', 'spaghetti', 'macarrones'],
  ['papel higienico', 'confort', 'papel bano', 'papel de bano'],
  ['toalla nova', 'toalla de papel', 'servilletas de cocina'],
  ['pan', 'pan de molde', 'marraqueta', 'hallulla', 'pan integral'],
  ['bebida', 'gaseosa', 'refresco', 'coca cola', 'soda'],
  ['fruta', 'manzanas', 'platanos', 'naranjas', 'peras', 'mandarinas'],
  ['verduras', 'tomates', 'cebolla', 'lechuga', 'zanahoria', 'pimenton', 'papas'],
  ['carne', 'carne molida', 'vacuno', 'bistec', 'asado'],
];

const SYNONYM_LOOKUP = new Map();
PANTRY_SYNONYM_GROUPS.forEach((group, groupIndex) => {
  group.forEach((term) => {
    SYNONYM_LOOKUP.set(normalizeItemKey(term), groupIndex);
    SYNONYM_LOOKUP.set(getStemmedKey(term), groupIndex);
  });
});

function tokenizeStemmed(str) {
  const norm = normalizeItemKey(str);
  if (!norm) return [];
  return norm
    .split(/\s+/)
    .filter((w) => w.length > 1 && !['de', 'del', 'la', 'el', 'los', 'las', 'en', 'con', 'sin', 'al'].includes(w))
    .map((w) => getStemmedKey(w));
}

/**
 * Determina si un producto detectado en la foto de despensa cubre un producto habitual o de la lista.
 * Evita falsos positivos usando comparación por palabras/raíces y grupos de sinónimos.
 */
export function arePantryItemsMatching(detectedName, targetName) {
  if (!detectedName || !targetName) return false;
  if (areItemsEquivalent(detectedName, targetName)) return true;

  const normA = normalizeItemKey(detectedName);
  const normB = normalizeItemKey(targetName);
  const stemA = getStemmedKey(detectedName);
  const stemB = getStemmedKey(targetName);

  const groupA = SYNONYM_LOOKUP.get(normA) ?? SYNONYM_LOOKUP.get(stemA);
  const groupB = SYNONYM_LOOKUP.get(normB) ?? SYNONYM_LOOKUP.get(stemB);
  if (groupA !== undefined && groupA === groupB) {
    return true;
  }

  const tokensA = tokenizeStemmed(detectedName);
  const tokensB = tokenizeStemmed(targetName);
  if (tokensA.length === 0 || tokensB.length === 0) return false;

  // Si un nombre es más específico (ej: "Aceite de oliva" vs "Aceite" o "Atún lomitos" vs "Atún")
  // comprobamos que todas las palabras clave del más corto aparezcan en el más largo.
  const [shorter, longer] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  if (shorter.length === 1 && longer[0] === shorter[0]) {
    return true;
  }
  if (shorter.length >= 2 && shorter.every((t) => longer.includes(t))) {
    return true;
  }

  return false;
}

/**
 * Unifica los productos detectados en una o múltiples fotos de despensa,
 * corrigiendo ortografía y priorizando el estado "low" si alguna foto muestra que queda poco.
 */
export function normalizeDetectedPantryItems(rawItems = []) {
  if (!Array.isArray(rawItems)) return [];
  const merged = [];

  for (const raw of rawItems) {
    if (!raw || typeof raw.name !== 'string') continue;
    const trimmed = raw.name.trim();
    if (!trimmed) continue;

    const canonical = getCanonicalItem(trimmed);
    const displayName = canonical.name || (trimmed.charAt(0).toUpperCase() + trimmed.slice(1));
    const category = raw.category && raw.category !== 'Otros'
      ? raw.category
      : (canonical.category || 'Despensa');
    const stockStatus = raw.stockStatus === 'low' ? 'low' : 'ok';
    const estimatedQuantity = typeof raw.estimatedQuantity === 'string' && raw.estimatedQuantity.trim()
      ? raw.estimatedQuantity.trim()
      : '';
    const notes = typeof raw.notes === 'string' ? raw.notes.trim() : '';

    const existing = merged.find((item) => areItemsEquivalent(item.name, displayName));
    if (existing) {
      if (stockStatus === 'low') existing.stockStatus = 'low';
      if (displayName.length > existing.name.length && displayName.includes(' ')) {
        // Conservar detalle si una toma fue más específica, salvo que sean solo tildes
      }
      if (!existing.estimatedQuantity && estimatedQuantity) {
        existing.estimatedQuantity = estimatedQuantity;
      }
      if (!existing.notes && notes) {
        existing.notes = notes;
      }
    } else {
      merged.push({
        id: `detected-${merged.length}-${normalizeItemKey(displayName) || 'item'}`,
        name: displayName,
        category,
        stockStatus,
        estimatedQuantity,
        notes,
      });
    }
  }

  // Mostrar primero los que quedan poco para que destaquen en la revisión
  merged.sort((a, b) => {
    if (a.stockStatus !== b.stockStatus) return a.stockStatus === 'low' ? -1 : 1;
    return a.name.localeCompare(b.name, 'es');
  });

  return merged;
}

/**
 * Cruza los productos detectados en las fotos de despensa contra:
 * 1) Productos que se ven casi vacíos ("low") en la foto
 * 2) Historial real de compras y actividades del hogar
 * 3) Básicos de despensa (si falta historial)
 * 4) Lista de compras activa (para evitar sugerir lo que ya está anotado)
 */
export function buildPantryGapReport({
  detectedItems = [],
  history = [],
  activities = [],
  activeItems = [],
  essentials = DEFAULT_ESSENTIALS,
  maxMissingItems = 18,
} = {}) {
  const normalizedDetected = normalizeDetectedPantryItems(detectedItems);

  const pendingActiveItems = Array.isArray(activeItems)
    ? activeItems.filter((item) => item && !item.checked && item.name)
    : [];

  const isPendingInActiveList = (name) =>
    pendingActiveItems.some((active) => arePantryItemsMatching(active.name, name));

  const missingItems = [];
  const skippedAlreadyInList = [];

  const addMissingCandidate = (candidate) => {
    if (!candidate?.name) return;
    if (isPendingInActiveList(candidate.name)) {
      if (!skippedAlreadyInList.some((n) => areItemsEquivalent(n, candidate.name))) {
        skippedAlreadyInList.push(candidate.name);
      }
      return;
    }
    if (missingItems.some((m) => arePantryItemsMatching(m.name, candidate.name))) {
      return;
    }
    missingItems.push(candidate);
  };

  // 1. Productos detectados en la foto con nivel bajo ("low" = por acabarse)
  for (const det of normalizedDetected) {
    if (det.stockStatus === 'low') {
      addMissingCandidate({
        id: `missing-low-${missingItems.length}`,
        name: det.name,
        quantity: '1',
        category: det.category || 'Despensa',
        reason: det.notes ? `Queda poco (${det.notes})` : 'Queda poco en la foto',
        source: 'low_stock',
        frequency: 0,
        selected: true,
      });
    }
  }

  // 2. Construir índice de habituales del hogar (prioriza historial real sobre básicos)
  const index = buildSuggestionsIndex({ history, activities, essentials });
  const hasHouseholdHistory = Array.from(index.values()).some((entry) => entry.isFromHistory);

  const missingStaples = [];
  for (const entry of index.values()) {
    const canonical = getCanonicalItem(entry.displayName);
    const displayName = canonical.name || entry.displayName;

    // Verificar si ya fue visto en alguna foto (con stock suficiente o bajo)
    const seenInPhoto = normalizedDetected.some((det) =>
      arePantryItemsMatching(det.name, displayName)
    );
    if (seenInPhoto) continue;

    // Si hay historial real del hogar, no rellenar con básicos que la casa nunca ha comprado
    // salvo los top esenciales más universales sin marcar por defecto
    const habitualQuantity = getHabitualQuantity(entry.quantities);
    const priorityScore = (entry.isFromHistory ? 100 : 0) + Math.min(entry.frequency * 10, 80);

    missingStaples.push({
      displayName,
      category: entry.category || canonical.category || 'Despensa',
      habitualQuantity,
      isFromHistory: entry.isFromHistory,
      frequency: entry.frequency,
      priorityScore,
    });
  }

  missingStaples.sort((a, b) => b.priorityScore - a.priorityScore);

  for (const staple of missingStaples) {
    if (missingItems.length >= maxMissingItems) break;

    const reason = staple.isFromHistory
      ? staple.frequency > 1
        ? `Habitual (comprado ${staple.frequency} veces)`
        : 'En tus compras recientes'
      : 'Básico de despensa';

    // Seleccionar por defecto los que pertenecen al historial real del hogar,
    // o los primeros 8 básicos si el hogar aún no tiene historial de compras.
    const defaultSelected = staple.isFromHistory
      ? staple.frequency >= 1
      : !hasHouseholdHistory && missingItems.length < 8;

    addMissingCandidate({
      id: `missing-staple-${missingItems.length}`,
      name: staple.displayName,
      quantity: staple.habitualQuantity || '1',
      category: staple.category,
      reason,
      source: staple.isFromHistory ? 'history' : 'essential',
      frequency: staple.frequency,
      selected: defaultSelected,
    });
  }

  return {
    detectedItems: normalizedDetected,
    missingItems,
    skippedAlreadyInList,
    hasHouseholdHistory,
  };
}
