import { areItemsEquivalent, getCanonicalItem, normalizeItemKey } from './itemNormalizer.js';

const NON_PRODUCT_PATTERNS = [
  /^(?:descuento|dcto|dscto|dto|desc\.?|rebaja|ahorro|bonif(?:icacion)?|cupon|promo(?:cion)?)\b/i,
  /\b(?:descuento|dcto|dscto)\b/i,
  /^rf\s+(?:precio|lleve)\b/i,
  /\b(?:precio\s+antes\s+ahora|lleve\s+(?:\d+|n)\s*x)\b/i,
  /^(?:sub\s*-?\s*total|total(?:\s+a\s+pagar|\s+boleta|\s+compra|\s+afecto|\s+exento|\s+iva|\s+numero)?|neto|iva|impuesto|propina|vuelto|cambio|efectivo|redondeo|ajuste\s+ley|tarjeta|tar\.?\s+credito|debito|credito|redcompra|transbank|pago)\b/i,
  /^(?:boleta\s+electronica|bol\.?\s*electronica|rut(?:\s+cliente)?\b|caja\b|cajero\b|folio\b|n[°º]?\s*boleta|mi\s+club|acumulacion\s+mi\s+club|codigo:)/i,
];

const STOP_MATCH_WORDS = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'con', 'sin', 'para', 'por',
  'descuento', 'dcto', 'dscto', 'dto', 'promo', 'promocion', 'rebaja', 'ahorro',
  'rf', 'precio', 'antes', 'ahora', 'lleve',
]);

/**
 * Determina si una línea extraída de boleta corresponde a un descuento, total, impuesto o medio de pago
 * en lugar de un producto real comprado.
 */
export function isReceiptNonProductLine(name, price = 0) {
  const numPrice = Number(price);
  if (Number.isFinite(numPrice) && numPrice < 0) return true;
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (!trimmed) return true;

  const plain = trimmed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return NON_PRODUCT_PATTERNS.some((re) => re.test(plain));
}

function isDiscountLineName(name) {
  if (!name || typeof name !== 'string') return false;
  const plain = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    /^(?:descuento|dcto|dscto|dto|desc\.?|rebaja|ahorro|bonif(?:icacion)?|cupon|promo(?:cion)?)\b/.test(plain) ||
    /\b(?:descuento|dcto|dscto)\b/.test(plain) ||
    /^rf\s+(?:precio|lleve)\b/.test(plain) ||
    /\b(?:precio\s+antes\s+ahora|lleve\s+(?:\d+|n)\s*x)\b/.test(plain)
  );
}

function extractSignificantTokens(text) {
  const norm = normalizeItemKey(text);
  if (!norm) return [];
  return norm.split(' ').filter((w) => w.length >= 3 && !STOP_MATCH_WORDS.has(w));
}

const AMBIGUOUS_RECEIPT_RE =
  /\b(?:tradicio|mag\b|pf\b|ta\b|i\s+o\b|ap\s+f|m3\b|carb\b|donts|manz\d|salch|sal\b|pech\b|cerv\b|cho\b|tren\b|deli\b|hs\b|deo\b|nec\b)/i;

/**
 * Normaliza un código EAN/UPC leído en boleta; descarta códigos pesables internos (prefijo 2 de 13 dígitos).
 */
export function sanitizeReceiptBarcode(raw) {
  if (!raw) return undefined;
  const digits = String(raw).replace(/\D/g, '');
  if (!/^\d{8,14}$/.test(digits)) return undefined;
  if (/^2\d{12}$/.test(digits)) return undefined;
  return digits;
}

/**
 * Heurística simple para detectar nombres truncados o abreviaciones crípticas de supermercado.
 */
export function isAmbiguousReceiptName(name) {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (AMBIGUOUS_RECEIPT_RE.test(trimmed)) return true;
  const words = trimmed.split(/\s+/).filter(Boolean);
  // Palabras muy cortas tipo "I O", "TA", "PF" o siglas de 2 caracteres en mayúscula
  return words.some((w) => w.length <= 2 && !/^\d+$/.test(w) && !/^(de|la|el|y|x\d+|ml|kg|lt|cc|xl)$/i.test(w));
}

/**
 * Limpia y reconcilia una lista cruda de ítems de boleta:
 * - Elimina líneas de descuento (incluyendo "RF Precio Antes Ahora" y "RF Lleve N x $"), subtotales, impuestos y medios de pago.
 * - Si un descuento trae monto, lo descuenta del producto correspondiente (por palabra clave o ítem previo).
 * - Normaliza cantidades fraccionarias por peso (< 1 kg, ej. 0.286) a 1 unidad con precio de línea.
 * - Conserva el código EAN/UPC y marca si requiere búsqueda por código por abreviatura ambigua.
 */
export function normalizeReceiptItems(rawItems = []) {
  if (!Array.isArray(rawItems)) return [];
  const products = [];

  for (const raw of rawItems) {
    if (!raw) continue;
    const rawName = String(raw.nombre ?? raw.name ?? '').trim();
    const rawPrice = Number(raw.precio ?? raw.price ?? 0);
    const safePrice = Number.isFinite(rawPrice) ? Math.round(rawPrice) : 0;

    if (!rawName && safePrice >= 0) continue;

    if (isReceiptNonProductLine(rawName, safePrice)) {
      // Si es un descuento con monto conocido, restarlo del producto asociado
      const discountAmount = Math.abs(safePrice);
      if (discountAmount > 0 && (isDiscountLineName(rawName) || safePrice < 0) && products.length > 0) {
        const tokens = extractSignificantTokens(rawName);
        let targetIdx = -1;
        if (tokens.length > 0) {
          for (let i = products.length - 1; i >= 0; i--) {
            const pNorm = normalizeItemKey(products[i].name);
            if (tokens.some((tok) => pNorm.includes(tok))) {
              targetIdx = i;
              break;
            }
          }
        }
        if (targetIdx === -1) {
          targetIdx = products.length - 1;
        }
        const target = products[targetIdx];
        if (target) {
          const qty = Math.max(1, Number(target.quantity) || 1);
          if (target.price >= discountAmount) {
            target.price = Math.max(0, target.price - discountAmount);
          } else if (qty > 1 && target.price * qty >= discountAmount) {
            // Si la IA devolvió precio unitario en vez de total de línea (ej: 6x690 con dcto -840)
            target.price = Math.max(0, target.price * qty - discountAmount);
          }
        }
      }
      continue;
    }

    const canonical = getCanonicalItem(rawName);
    const cleanName = canonical.name || rawName;
    const rawQty = Number(raw.cantidad ?? raw.quantity);
    let qtyStr = '1';
    if (Number.isFinite(rawQty) && rawQty > 0) {
      // Compras pesadas por kilo (< 1, ej. 0.3 kg de hallulla) mantienen cantidad '1' para no mostrar "x0.3"
      qtyStr = rawQty < 1 ? '1' : String(Math.round(rawQty));
    }

    const barcode = sanitizeReceiptBarcode(raw.codigo ?? raw.barcode);
    const ambiguous = Boolean(raw.ambiguo ?? raw.ambiguous) || isAmbiguousReceiptName(rawName);

    products.push({
      name: cleanName,
      category: raw.category || canonical.category || 'Otros',
      quantity: qtyStr,
      price: Math.max(0, safePrice),
      scanned: true,
      ...(barcode ? { barcode } : {}),
      ambiguous,
    });
  }

  return products;
}

/**
 * Aplica resultados de búsqueda por código de barras sobre ítems escaneados,
 * conservando categorías coherentes sin sobreescribir productos ya resueltos.
 */
export function applyBarcodeLookups(items = [], lookupResults = {}) {
  if (!Array.isArray(items) || !lookupResults || typeof lookupResults !== 'object') return items;
  return items.map((item) => {
    const code = item?.barcode;
    if (!code || !lookupResults[code]?.resolvedName) return item;
    const entry = lookupResults[code];
    const resolved = String(entry.resolvedName).trim();
    if (!resolved) return item;
    const canonical = getCanonicalItem(resolved);
    const finalName = resolved.length >= (canonical.name || '').length ? resolved : canonical.name;
    return {
      ...item,
      name: finalName,
      category: item.category && item.category !== 'Otros' ? item.category : (canonical.category || 'Otros'),
      ambiguous: false,
      barcodeSource: entry.source || 'Código verificado',
      ...(entry.sourceUrl ? { barcodeSourceUrl: entry.sourceUrl } : {}),
    };
  });
}

/**
 * Marca si cada producto leído existía o no en la compra original del checklist
 * para facilitar la detección visual de falsos positivos durante la revisión.
 */
export function annotateItemsAgainstOriginal(receiptItems = [], originalItems = []) {
  const originalNames = (originalItems || [])
    .map((it) => (typeof it === 'string' ? it : it?.name || ''))
    .filter(Boolean);

  return (receiptItems || []).map((item, idx) => {
    const itemNorm = normalizeItemKey(item.name);
    const itemWords = itemNorm ? itemNorm.split(' ').filter(Boolean) : [];
    const itemTokens = extractSignificantTokens(item.name);

    const matchedOriginal = originalNames.some((origName) => {
      if (areItemsEquivalent(item.name, origName)) return true;
      const origNorm = normalizeItemKey(origName);
      if (!itemNorm || !origNorm) return false;
      const origWords = origNorm.split(' ').filter(Boolean);
      // Coincidencia si todas las palabras del nombre corto aparecen como palabras completas en el otro
      if (origWords.length > 0 && origWords.every((w) => itemWords.includes(w))) return true;
      if (itemWords.length > 0 && itemWords.every((w) => origWords.includes(w))) return true;
      const origTokens = extractSignificantTokens(origName);
      return itemTokens.some((t) => origTokens.includes(t));
    });

    return {
      id: item.id || `receipt-item-${Date.now()}-${idx}`,
      ...item,
      selected: item.selected !== false,
      inOriginalList: originalNames.length > 0 ? matchedOriginal : true,
    };
  });
}
