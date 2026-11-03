import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeText,
  formatItemName,
  getHabitualQuantity,
  buildSuggestionsIndex,
  getQuickSuggestions,
  DEFAULT_ESSENTIALS
} from '../src/lib/quickSuggestions.js';

test('normalizeText handles accents, whitespace, and case', () => {
  assert.equal(normalizeText('  Café con Leche  '), 'cafe con leche');
  assert.equal(normalizeText('PLÁTANOS'), 'platanos');
  assert.equal(normalizeText('Jabón Líquido'), 'jabon liquido');
  assert.equal(normalizeText(null), '');
});

test('formatItemName capitalizes the first letter properly', () => {
  assert.equal(formatItemName('leche descremada'), 'Leche descremada');
  assert.equal(formatItemName('huevos'), 'Huevos');
  assert.equal(formatItemName(''), '');
});

test('getHabitualQuantity returns the mode quantity', () => {
  const counts = { '1': 2, '2': 5, '3': 1 };
  assert.equal(getHabitualQuantity(counts), '2');

  const single = { '6': 1 };
  assert.equal(getHabitualQuantity(single), '6');

  assert.equal(getHabitualQuantity({}), '1');
  assert.equal(getHabitualQuantity(null), '1');
});

test('buildSuggestionsIndex prioritizes household history over essentials', () => {
  const history = [
    {
      timestamp: Date.now() - 3600000,
      items: [
        { name: 'Palta Hass', quantity: '2', category: 'Frutas y Verduras' },
        { name: 'Leche Descremada', quantity: '3', category: 'Lácteos' }
      ]
    },
    {
      timestamp: Date.now() - 7200000,
      items: [
        { name: 'Palta Hass', quantity: '2', category: 'Frutas y Verduras' }
      ]
    }
  ];

  const index = buildSuggestionsIndex({ history, activities: [] });
  
  // Palta Hass should have frequency 2 and habitual quantity '2'
  const palta = index.get('palta hass');
  assert.ok(palta);
  assert.equal(palta.frequency, 2);
  assert.equal(palta.isFromHistory, true);
  assert.equal(palta.quantities['2'], 2);

  // Default essentials should also be available in the index as fallback
  assert.ok(index.has('leche'));
  assert.ok(index.has('huevos'));
});

test('getQuickSuggestions with empty query returns top suggestions not already on the list', () => {
  const history = [
    {
      timestamp: Date.now() - 1000,
      items: [
        { name: 'Queso Mantecoso', quantity: '1', category: 'Lácteos' },
        { name: 'Café Grano', quantity: '2', category: 'Despensa' }
      ]
    }
  ];

  const index = buildSuggestionsIndex({ history, activities: [] });

  // If Queso Mantecoso is already unchecked in the active list
  const activeItems = [
    { name: 'Queso Mantecoso', checked: false }
  ];

  const suggestions = getQuickSuggestions({
    query: '',
    index,
    activeItems,
    limit: 5
  });

  // 'Queso Mantecoso' should not be suggested to add since it's already in the active list
  assert.equal(suggestions.some(s => s.name === 'Queso Mantecoso'), false);
  // 'Café Grano' should be in top suggestions
  assert.equal(suggestions.some(s => s.name === 'Café Grano'), true);
  const cafe = suggestions.find(s => s.name === 'Café Grano');
  assert.equal(cafe.habitualQuantity, '2');
});

test('getQuickSuggestions with query filters real-time and flags items already in list', () => {
  const index = buildSuggestionsIndex({
    history: [
      {
        timestamp: Date.now(),
        items: [
          { name: 'Manzanas Rojas', quantity: '4', category: 'Frutas' },
          { name: 'Mantequilla', quantity: '1', category: 'Lácteos' }
        ]
      }
    ],
    activities: []
  });

  const activeItems = [
    { name: 'Manzanas Rojas', checked: false }
  ];

  // Searching for "man"
  const suggestions = getQuickSuggestions({
    query: 'man',
    index,
    activeItems,
    limit: 5
  });

  assert.ok(suggestions.length > 0);
  const manzanas = suggestions.find(s => s.name === 'Manzanas Rojas');
  assert.ok(manzanas);
  assert.equal(manzanas.alreadyInList, true);
  assert.equal(manzanas.habitualQuantity, '4');

  const mantequilla = suggestions.find(s => s.name === 'Mantequilla');
  assert.ok(mantequilla);
  assert.equal(mantequilla.alreadyInList, false);
});

test('falls back gracefully to DEFAULT_ESSENTIALS when household history is empty', () => {
  const index = buildSuggestionsIndex({ history: [], activities: [] });
  const suggestions = getQuickSuggestions({
    query: '',
    index,
    activeItems: [],
    limit: 6
  });

  assert.equal(suggestions.length, 6);
  assert.ok(suggestions.some(s => s.name === 'Leche'));
  assert.ok(suggestions.some(s => s.name === 'Huevos'));
});
