import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isReceiptNonProductLine,
  normalizeReceiptItems,
  annotateItemsAgainstOriginal,
  sanitizeReceiptBarcode,
  isAmbiguousReceiptName,
  applyBarcodeLookups,
} from '../src/lib/receiptParser.js';

test('isReceiptNonProductLine detects Chilean receipt discount and payment lines', () => {
  assert.equal(isReceiptNonProductLine('Descuento Rexona', 0), true);
  assert.equal(isReceiptNonProductLine('Descuento Néctar', -500), true);
  assert.equal(isReceiptNonProductLine('DCTO CLUB LIDER', -1200), true);
  assert.equal(isReceiptNonProductLine('RF Precio Antes Ahora', 790), true);
  assert.equal(isReceiptNonProductLine('RF Lleve N x $', 840), true);
  assert.equal(isReceiptNonProductLine('TOTAL AFECTO', 64054), true);
  assert.equal(isReceiptNonProductLine('SUBTOTAL', 45000), true);
  assert.equal(isReceiptNonProductLine('VUELTO', 2000), true);
  assert.equal(isReceiptNonProductLine('Redondeo Ley', -4), true);

  assert.equal(isReceiptNonProductLine('Desodorante Rexona 150ml', 3790), false);
  assert.equal(isReceiptNonProductLine('Pan Hallulla', 598), false);
});

test('normalizeReceiptItems removes Lider RF discount lines, subtracts known discount amounts, and normalizes fractional weights', () => {
  const raw = [
    { nombre: 'Desodorante Rexona 150ml', cantidad: 1, precio: 3790 },
    { nombre: 'RF Precio Antes Ahora', cantidad: 1, precio: -790 },
    { nombre: 'Pan Hallulla', cantidad: 0.286, precio: 598 },
    { nombre: 'Néctar Manzana 190cc', cantidad: 6, precio: 4140 },
    { nombre: 'RF Lleve N x $', cantidad: 1, precio: -840 },
    { nombre: 'Mini Donuts Blancas', cantidad: 3, precio: 1260 },
    { nombre: 'RF Lleve N x $', cantidad: 1, precio: -260 },
    { nombre: 'TOTAL AFECTO', cantidad: 1, precio: 64054 },
    { nombre: 'TOTAL', cantidad: 1, precio: 76224 },
  ];

  const cleaned = normalizeReceiptItems(raw);
  assert.equal(cleaned.length, 4);

  const rexona = cleaned.find((i) => i.name.includes('Rexona'));
  assert.ok(rexona);
  assert.equal(rexona.price, 3000);

  const hallulla = cleaned.find((i) => i.name.includes('Hallulla'));
  assert.ok(hallulla);
  assert.equal(hallulla.quantity, '1');
  assert.equal(hallulla.price, 598);

  const nectar = cleaned.find((i) => i.name.includes('Néctar'));
  assert.ok(nectar);
  assert.equal(nectar.quantity, '6');
  assert.equal(nectar.price, 3300);

  const donuts = cleaned.find((i) => i.name.includes('Donuts'));
  assert.ok(donuts);
  assert.equal(donuts.quantity, '3');
  assert.equal(donuts.price, 1000);

  assert.equal(cleaned.some((i) => /descuento|rf\s|total/i.test(i.name)), false);
});

test('annotateItemsAgainstOriginal flags unexpected items not present in original checklist purchase', () => {
  const receiptItems = [
    { name: 'Pan Hallulla', category: 'Panadería', quantity: '1', price: 2091, scanned: true },
    { name: 'Helado Magnum Vainilla', category: 'Congelados', quantity: '1', price: 1000, scanned: true },
    { name: 'Sal', category: 'Despensa', quantity: '1', price: 500, scanned: true },
  ];
  const originalItems = [{ name: 'Hallulla', quantity: '1' }, { name: 'Salame', quantity: '1' }];

  const annotated = annotateItemsAgainstOriginal(receiptItems, originalItems);
  assert.equal(annotated[0].inOriginalList, true);
  assert.equal(annotated[1].inOriginalList, false);
  // "Sal" no debe hacer falso positivo parcial contra "Salame"
  assert.equal(annotated[2].inOriginalList, false);
});

test('sanitizeReceiptBarcode, isAmbiguousReceiptName and applyBarcodeLookups resolve ambiguous EAN codes', () => {
  assert.equal(sanitizeReceiptBarcode('7801965000974'), '7801965000974');
  // Códigos pesables internos de supermercado (prefijo 2 de 13 dígitos) se omiten
  assert.equal(sanitizeReceiptBarcode('2038800000003'), undefined);
  assert.equal(isAmbiguousReceiptName('SAL TRADICIO'), true);
  assert.equal(isAmbiguousReceiptName('Salame'), false);

  const normalized = normalizeReceiptItems([
    { nombre: 'SAL TRADICIO', cantidad: 1, precio: 4590, codigo: '7801965000974', ambiguo: true },
    { nombre: 'HALLULLA C', cantidad: 0.286, precio: 598, codigo: '2038800000003' },
  ]);

  assert.equal(normalized[0].barcode, '7801965000974');
  assert.equal(normalized[0].ambiguous, true);
  assert.equal(normalized[1].barcode, undefined);

  const resolved = applyBarcodeLookups(normalized, {
    '7801965000974': {
      resolvedName: 'Salchicha Tradicional',
      source: 'Búsqueda web',
      sourceUrl: 'https://www.lider.cl',
    },
  });

  assert.equal(resolved[0].name, 'Salchicha Tradicional');
  assert.equal(resolved[0].ambiguous, false);
  assert.equal(resolved[0].barcodeSource, 'Búsqueda web');
});
