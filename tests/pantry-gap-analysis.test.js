import test from 'node:test';
import assert from 'node:assert/strict';
import {
  arePantryItemsMatching,
  normalizeDetectedPantryItems,
  buildPantryGapReport,
} from '../src/lib/pantryGapAnalysis.js';

test('arePantryItemsMatching matches variants and synonyms without false positives', () => {
  assert.equal(arePantryItemsMatching('Atun', 'Atún'), true);
  assert.equal(arePantryItemsMatching('Aceite de oliva', 'Aceite'), true);
  assert.equal(arePantryItemsMatching('Tallarines', 'Pasta'), true);
  assert.equal(arePantryItemsMatching('Pan de molde', 'Pan'), true);

  // Evitar falsos positivos por subcadena
  assert.equal(arePantryItemsMatching('Aceite', 'Aceitunas'), false);
  assert.equal(arePantryItemsMatching('Pan', 'Panela'), false);
});

test('normalizeDetectedPantryItems merges multi-photo duplicates and keeps low stock priority', () => {
  const result = normalizeDetectedPantryItems([
    { name: 'atun', category: 'Otros', stockStatus: 'ok', estimatedQuantity: '2 latas' },
    { name: 'Atún', category: 'Despensa', stockStatus: 'low', estimatedQuantity: '1 lata' },
    { name: 'azucar', category: 'Otros', stockStatus: 'ok', estimatedQuantity: '1 bolsa' },
  ]);

  assert.equal(result.length, 2);
  const atun = result.find((i) => i.name === 'Atún');
  assert.ok(atun);
  assert.equal(atun.stockStatus, 'low');

  const azucar = result.find((i) => i.name === 'Azúcar');
  assert.ok(azucar);
  assert.equal(azucar.category, 'Despensa');
});

test('buildPantryGapReport suggests low stock and unseen household staples while skipping active list items', () => {
  const report = buildPantryGapReport({
    detectedItems: [
      { name: 'Arroz', category: 'Despensa', stockStatus: 'ok', estimatedQuantity: '1 bolsa' },
      { name: 'Aceite de oliva', category: 'Despensa', stockStatus: 'low', estimatedQuantity: 'queda poco', notes: 'botella casi vacía' },
    ],
    history: [
      {
        timestamp: Date.now() - 86400000,
        items: [
          { name: 'Arroz', quantity: '2' },
          { name: 'Leche', quantity: '3' },
          { name: 'Huevos', quantity: '1' },
          { name: 'Café', quantity: '1' },
        ],
      },
      {
        timestamp: Date.now() - 5 * 86400000,
        items: [
          { name: 'Leche', quantity: '3' },
          { name: 'Huevos', quantity: '1' },
        ],
      },
    ],
    activeItems: [
      { id: '1', name: 'Café', checked: false },
    ],
  });

  // Arroz está OK en foto -> no debe sugerirse como faltante
  assert.equal(report.missingItems.some((m) => m.name === 'Arroz'), false);

  // Café ya está pendiente en la lista activa -> debe ir en skippedAlreadyInList
  assert.equal(report.missingItems.some((m) => m.name === 'Café'), false);
  assert.ok(report.skippedAlreadyInList.some((n) => n === 'Café'));

  // Aceite de oliva queda poco -> debe aparecer como low_stock seleccionado
  const lowOil = report.missingItems.find((m) => m.name === 'Aceite de oliva');
  assert.ok(lowOil);
  assert.equal(lowOil.source, 'low_stock');
  assert.equal(lowOil.selected, true);

  // Leche y Huevos no se vieron en foto -> deben sugerirse con cantidad habitual
  const leche = report.missingItems.find((m) => m.name === 'Leche');
  assert.ok(leche);
  assert.equal(leche.quantity, '3');
  assert.equal(leche.source, 'history');
  assert.equal(leche.selected, true);

  assert.equal(report.hasHouseholdHistory, true);
});

test('buildPantryGapReport falls back to defaults when household has no history', () => {
  const report = buildPantryGapReport({
    detectedItems: [{ name: 'Leche', stockStatus: 'ok' }],
    history: [],
    activities: [],
    activeItems: [],
  });

  assert.equal(report.hasHouseholdHistory, false);
  assert.equal(report.missingItems.some((m) => m.name === 'Leche'), false);
  assert.ok(report.missingItems.length > 0);
  assert.ok(report.missingItems.some((m) => m.selected));
});
