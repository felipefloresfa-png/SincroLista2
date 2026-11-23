import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPantryCatalog,
  buildRestockSuggestions,
  buildChecklistPantryAlerts,
  findPantryConsumptionHint,
  getPantryZoneForCategory,
  parseNumericQuantity,
} from '../src/lib/pantryCatalog.js';

const DAY_MS = 24 * 60 * 60 * 1000;

test('getPantryZoneForCategory maps food and household areas cleanly', () => {
  assert.equal(getPantryZoneForCategory('Lácteos y Huevos'), 'fridge');
  assert.equal(getPantryZoneForCategory('Frutas y Verduras'), 'fridge');
  assert.equal(getPantryZoneForCategory('Despensa'), 'cupboard');
  assert.equal(getPantryZoneForCategory('Limpieza del Hogar'), 'cleaning');
  assert.equal(getPantryZoneForCategory('Higiene y Cuidado Personal'), 'cleaning');
});

test('parseNumericQuantity extracts unit counts safely without misreading grams/ml', () => {
  assert.equal(parseNumericQuantity('2'), 2);
  assert.equal(parseNumericQuantity('x3'), 3);
  assert.equal(parseNumericQuantity('500 gr'), 1);
  assert.equal(parseNumericQuantity('250ml'), 1);
  assert.equal(parseNumericQuantity('invalid'), 1);
});

test('buildPantryCatalog estimates duration from repurchase cadence and scales by purchased quantity', () => {
  const now = new Date('2026-11-23T12:00:00Z').getTime();

  // Compró 2 leches hace 18 días y 2 leches hace 4 días -> intervalo 14d para 2 uds (7d por unidad).
  // Hace 4 días compró 4 leches -> debería durar ~28 días -> quedan ~24 días (ok).
  // Compró 1 atún hace 15 días y 1 atún hace 8 días -> intervalo 7d para 1 ud.
  // Hace 8 días compró 1 atún -> vencido hace 1 día (depleted).
  const history = [
    {
      timestamp: now - 18 * DAY_MS,
      items: [{ name: 'Leche', quantity: '2' }],
    },
    {
      timestamp: now - 15 * DAY_MS,
      items: [{ name: 'atun', quantity: '1' }],
    },
    {
      timestamp: now - 8 * DAY_MS,
      items: [{ name: 'Atún', quantity: '1' }],
    },
    {
      timestamp: now - 4 * DAY_MS,
      items: [{ name: 'Leche', quantity: '4' }],
    },
  ];

  const catalog = buildPantryCatalog({ history, activeItems: [], now });

  const milk = catalog.find((e) => e.name === 'Leche');
  assert.ok(milk);
  assert.equal(milk.cadenceSource, 'observed');
  assert.equal(milk.estimatedDurationDays, 28);
  assert.equal(milk.daysRemaining, 24);
  assert.equal(milk.stockStatus, 'ok');
  assert.equal(milk.needsRestock, false);

  const tuna = catalog.find((e) => e.name === 'Atún');
  assert.ok(tuna);
  assert.equal(tuna.cadenceSource, 'observed');
  assert.equal(tuna.estimatedDurationDays, 7);
  assert.equal(tuna.daysRemaining, -1);
  assert.equal(tuna.stockStatus, 'depleted');
  assert.equal(tuna.needsRestock, true);
});

test('buildChecklistPantryAlerts surfaces depleted/low items not yet on list and findPantryConsumptionHint returns item status', () => {
  const now = new Date('2026-11-23T12:00:00Z').getTime();
  const history = [
    { timestamp: now - 20 * DAY_MS, items: [{ name: 'Café', quantity: '1' }, { name: 'Arroz', quantity: '1' }] },
    { timestamp: now - 10 * DAY_MS, items: [{ name: 'Café', quantity: '1' }] },
    { timestamp: now - 2 * DAY_MS, items: [{ name: 'Arroz', quantity: '1' }] },
  ];
  const activeItems = [{ id: '1', name: 'Arroz', quantity: '1', checked: false }];

  const catalog = buildPantryCatalog({ history, activeItems, now });
  const alerts = buildChecklistPantryAlerts({ catalogItems: catalog, max: 5 });

  // Café intervalo 10d, última compra hace 10d -> daysRemaining = 0 -> depleted -> alerta en checklist
  assert.ok(alerts.some((a) => a.name === 'Café' && a.stockStatus === 'depleted'));
  // Arroz ya está en la lista -> no aparece en alertas por agregar
  assert.equal(alerts.some((a) => a.name === 'Arroz'), false);

  const riceHint = findPantryConsumptionHint('arroz', catalog);
  assert.ok(riceHint);
  assert.equal(riceHint.daysSinceLastPurchase, 2);
  assert.equal(riceHint.estimatedDurationDays, 18);
  assert.equal(riceHint.stockStatus, 'ok');
});

test('buildRestockSuggestions combines AI hints with cadence-based alerts', () => {
  const now = new Date('2026-11-23T12:00:00Z').getTime();
  const catalogItems = buildPantryCatalog({
    history: [
      { timestamp: now - 16 * DAY_MS, items: [{ name: 'Aceite de oliva', quantity: '1' }] },
      { timestamp: now - 8 * DAY_MS, items: [{ name: 'Aceite de oliva', quantity: '1' }] },
    ],
    activeItems: [],
    now,
  });

  const restock = buildRestockSuggestions({
    catalogItems,
    aiSuggestions: [{ name: 'Yogurt', reason: 'Sueles comprar cada 7 días' }],
    activeItems: [],
    max: 3,
  });

  assert.equal(restock[0].name, 'Yogurt');
  assert.equal(restock[0].source, 'ai');
  const olive = restock.find((r) => r.name === 'Aceite de oliva');
  assert.ok(olive);
  assert.equal(olive.source, 'history');
  assert.match(olive.reason, /Suele durar 8 días/);
});

test('groups flavor and protein variants into one Yogurt family with shared cadence and variant selection', () => {
  const now = new Date('2026-11-23T12:00:00Z').getTime();
  const history = [
    { timestamp: now - 45 * DAY_MS, items: [{ name: 'Yogurt piña', quantity: '2' }] },
    { timestamp: now - 35 * DAY_MS, items: [{ name: 'Yogurt frutilla', quantity: '2' }] },
    { timestamp: now - 25 * DAY_MS, items: [{ name: 'Yogurt griego', quantity: '2' }] },
    { timestamp: now - 15 * DAY_MS, items: [{ name: 'Yogurt protein', quantity: '2' }] },
    { timestamp: now - 5 * DAY_MS, items: [{ name: 'Yogurt de proteína', quantity: '2' }] },
  ];

  const catalog = buildPantryCatalog({ history, activeItems: [], now });
  const yogurtEntries = catalog.filter((entry) => entry.key === 'yogurt');

  assert.equal(yogurtEntries.length, 1);
  const yogurt = yogurtEntries[0];
  assert.equal(yogurt.name, 'Yogurt');
  assert.equal(yogurt.cadenceSource, 'observed');
  assert.equal(yogurt.estimatedDurationDays, 10);
  assert.equal(yogurt.daysRemaining, 5);
  assert.equal(yogurt.stockStatus, 'ok');
  assert.equal(yogurt.preferredVariant, 'Yogurt proteína');
  // "Yogurt protein" y "Yogurt de proteína" deben quedar unificados en una sola variante "Yogurt proteína"
  assert.equal(yogurt.variants.filter((v) => v === 'Yogurt proteína').length, 1);
  assert.deepEqual(new Set(yogurt.variants), new Set([
    'Yogurt proteína',
    'Yogurt griego',
    'Yogurt frutilla',
    'Yogurt piña',
  ]));

  // Tener un sabor específico en el checklist marca la familia completa como en lista
  const withActiveVariant = buildPantryCatalog({
    history,
    activeItems: [{ id: 'y1', name: 'Yogurt proteína', quantity: '2', checked: false }],
    now,
  });
  const matchedYogurt = withActiveVariant.find((entry) => entry.key === 'yogurt');
  assert.ok(matchedYogurt?.inListItem);
  assert.equal(matchedYogurt.inListItem.name, 'Yogurt proteína');

  // El hint en checklist funciona aunque el usuario agregue otro sabor de la misma familia
  const hint = findPantryConsumptionHint('Yogurt piña', withActiveVariant);
  assert.ok(hint);
  assert.equal(hint.daysSinceLastPurchase, 5);
  assert.equal(hint.estimatedDurationDays, 10);
});

test('marks single old purchases (>90 days) as stale instead of urgent restock', () => {
  const now = new Date('2026-11-23T12:00:00Z').getTime();
  const history = [
    { timestamp: now - 160 * DAY_MS, items: [{ name: 'Chirimoya', quantity: '1' }] },
  ];

  const catalog = buildPantryCatalog({ history, activeItems: [], now });
  const oldItem = catalog.find((entry) => entry.name === 'Chirimoya');
  assert.ok(oldItem);
  assert.equal(oldItem.stockStatus, 'stale');
  assert.equal(oldItem.needsRestock, false);

  const alerts = buildChecklistPantryAlerts({ catalogItems: catalog, max: 5 });
  assert.equal(alerts.some((a) => a.name === 'Chirimoya'), false);
});

test('groups water variants (mineral, cachantum, con/sin gas) into Agua and ignores 113-day outlier gaps', () => {
  const now = new Date('2026-11-23T12:00:00Z').getTime();
  const history = [
    { timestamp: now - 175 * DAY_MS, items: [{ name: 'Agua sin gas', quantity: '1' }] },
    { timestamp: now - 168 * DAY_MS, items: [{ name: 'Agua cachantum', quantity: '1' }] },
    { timestamp: now - 147 * DAY_MS, items: [{ name: 'Agua mineral', quantity: '1' }] },
    { timestamp: now - 34 * DAY_MS, items: [{ name: 'Agua con gas', quantity: '2' }] },
    { timestamp: now - 24 * DAY_MS, items: [{ name: 'Agua mineral', quantity: '2' }] },
  ];

  const catalog = buildPantryCatalog({ history, activeItems: [], now });
  const waterEntries = catalog.filter((entry) => entry.key === 'agua');
  assert.equal(waterEntries.length, 1);

  const water = waterEntries[0];
  assert.equal(water.name, 'Agua');
  assert.ok(water.variants.includes('Agua Cachantún'));
  assert.ok(water.variants.includes('Agua sin gas'));
  assert.ok(water.variants.includes('Agua con gas'));
  assert.ok(water.variants.includes('Agua mineral'));
  // No debe aceptar la brecha atípica de 113 días; usa la mediana/cadencia real (~10 días)
  assert.ok(water.estimatedDurationDays <= 25);
});

test('marks repeated purchases inactive for >90 days and >45 days overdue as stale instead of red overdue', () => {
  const now = new Date('2026-11-23T12:00:00Z').getTime();
  const history = [
    { timestamp: now - 195 * DAY_MS, items: [{ name: 'Bebida energética', quantity: '1' }] },
    { timestamp: now - 185 * DAY_MS, items: [{ name: 'Bebida energética', quantity: '1' }] },
    { timestamp: now - 175 * DAY_MS, items: [{ name: 'Bebida energética', quantity: '1' }] },
  ];

  const catalog = buildPantryCatalog({ history, activeItems: [], now });
  const item = catalog.find((entry) => entry.name === 'Bebida energética');
  assert.ok(item);
  assert.equal(item.stockStatus, 'stale');
  assert.equal(item.needsRestock, false);
});
