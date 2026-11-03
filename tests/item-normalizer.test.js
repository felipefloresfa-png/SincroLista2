import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeItemKey,
  areItemsEquivalent,
  getCanonicalItem,
  deduplicateItemList
} from '../src/lib/itemNormalizer.js';

test('normalizeItemKey strips accents, symbols and collapses whitespace', () => {
  assert.equal(normalizeItemKey('  Atún  '), 'atun');
  assert.equal(normalizeItemKey('Jabón Líquido!'), 'jabon liquido');
  assert.equal(normalizeItemKey('Café con Leche'), 'cafe con leche');
  assert.equal(normalizeItemKey('Pan de Molde...'), 'pan de molde');
});

test('areItemsEquivalent correctly identifies spelling/accent variants', () => {
  assert.equal(areItemsEquivalent('Atun', 'Atún'), true);
  assert.equal(areItemsEquivalent('atun', 'ATÚN'), true);
  assert.equal(areItemsEquivalent('Jabon', 'Jabón'), true);
  assert.equal(areItemsEquivalent('Azucar', 'Azúcar'), true);
  assert.equal(areItemsEquivalent('Oregano', 'Orégano'), true);
  assert.equal(areItemsEquivalent('Platano', 'Plátano'), true);
  assert.equal(areItemsEquivalent('Plátano', 'Plátanos'), true);
  assert.equal(areItemsEquivalent('Huevo', 'Huevos'), true);
  assert.equal(areItemsEquivalent('Manzana', 'Manzanas'), true);
  assert.equal(areItemsEquivalent('Tomate', 'Tomates'), true);
  assert.equal(areItemsEquivalent('Leche', 'Huevos'), false);
  assert.equal(areItemsEquivalent('Arroz', 'Fideos'), false);
});

test('getCanonicalItem restores proper Spanish accents and categories', () => {
  const atun = getCanonicalItem('atun');
  assert.equal(atun.name, 'Atún');
  assert.equal(atun.category, 'Carnes y Pescados');

  const jabon = getCanonicalItem('jabon');
  assert.equal(jabon.name, 'Jabón');
  assert.equal(jabon.category, 'Higiene y Cuidado Personal');

  const azucar = getCanonicalItem('azucar');
  assert.equal(azucar.name, 'Azúcar');
  assert.equal(azucar.category, 'Despensa');

  const oregano = getCanonicalItem('oregano');
  assert.equal(oregano.name, 'Orégano');

  const platano = getCanonicalItem('platano');
  assert.equal(platano.name, 'Plátanos');

  // Unknown item should be capitalized cleanly
  const custom = getCanonicalItem('galletas de avena caseras');
  assert.equal(custom.name, 'Galletas de avena caseras');
});

test('deduplicateItemList merges spelling variants into canonical item', () => {
  const rawList = [
    { name: 'Atun', quantity: '1', category: 'Carnes y Pescados' },
    { name: 'Aceite', quantity: '1', category: 'Despensa' },
    { name: 'Atún', quantity: '2', category: 'Carnes y Pescados' },
    { name: 'Jabon', quantity: '1', category: 'Higiene y Cuidado Personal' }
  ];

  const deduped = deduplicateItemList(rawList);
  assert.equal(deduped.length, 3);
  
  const atunItem = deduped.find(i => areItemsEquivalent(i.name, 'Atun'));
  assert.ok(atunItem);
  assert.equal(atunItem.name, 'Atún');
  assert.equal(atunItem.quantity, '3'); // 1 + 2
});
