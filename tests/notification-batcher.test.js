import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NotificationBatcher,
  buildNotificationDigest,
  NOTIFICATION_QUIET_WINDOW_MS,
  NOTIFICATION_PROGRESS_INTERVAL_MS,
} from '../src/lib/notificationBatcher.js';

function makeClock(start = 1_000_000) {
  let now = start;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => now,
    setTimer(fn, delay) {
      const id = nextId++;
      timers.set(id, { fn, at: now + delay });
      return id;
    },
    clearTimer(id) { timers.delete(id); },
    async advance(ms) {
      now += ms;
      let due;
      while ((due = [...timers.entries()].find(([, timer]) => timer.at <= now))) {
        timers.delete(due[0]);
        due[1].fn();
        await Promise.resolve();
        await Promise.resolve();
      }
    },
  };
}

function makeBatcher(clock, send, storage = null) {
  return new NotificationBatcher({
    storageKey: 'test',
    send,
    storage,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
}

test('agrupa varios cambios tras una ventana de calma y muestra nombres breves', async () => {
  const clock = makeClock();
  const sent = [];
  const batcher = makeBatcher(clock, async (digest) => { sent.push(digest); return true; });
  batcher.enqueue({ id: 'a', type: 'add', itemName: 'Leche', userName: 'Felipe' });
  batcher.enqueue({ id: 'b', type: 'check', itemName: 'Pan', userName: 'Felipe' });
  assert.equal(sent.length, 0);
  await clock.advance(NOTIFICATION_QUIET_WINDOW_MS);
  assert.equal(sent.length, 1);
  assert.match(sent[0].body, /2 productos/);
  assert.match(sent[0].body, /Leche, Pan/);
  batcher.dispose();
});

test('envía avances como máximo cada cinco minutos cuando hay actividad continua', async () => {
  const clock = makeClock();
  const sent = [];
  const batcher = makeBatcher(clock, async (digest) => { sent.push(digest); return true; });
  for (let i = 0; i < 10; i++) {
    batcher.enqueue({ id: String(i), type: 'check', itemName: `Producto ${i}` });
    await clock.advance(30_000);
  }
  assert.equal(sent.length, 1);
  assert.ok(sent[0].body.includes('10 productos'));
  assert.equal(clock.now() - 1_000_000, NOTIFICATION_PROGRESS_INTERVAL_MS);
  batcher.dispose();
});

test('la compra finalizada envía de inmediato el resumen pendiente', async () => {
  const clock = makeClock();
  const sent = [];
  const batcher = makeBatcher(clock, async (digest) => { sent.push(digest); return true; });
  batcher.enqueue({ id: 'a', type: 'add', itemName: 'Leche', userName: 'Felipe' });
  batcher.enqueue({ id: 'done', type: 'clear', itemName: '', userName: 'Felipe' });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].data.type, 'clear');
  assert.match(sent[0].body, /finalizó la compra/);
  batcher.dispose();
});

test('el rechazo del envío conserva la cola y espera antes de reintentar', async () => {
  const clock = makeClock();
  let attempts = 0;
  const batcher = makeBatcher(clock, async () => ++attempts > 1);
  batcher.enqueue({ id: 'a', type: 'add', itemName: 'Leche' });
  await clock.advance(NOTIFICATION_QUIET_WINDOW_MS);
  assert.equal(attempts, 1);
  await clock.advance(59_999);
  assert.equal(attempts, 1);
  await clock.advance(1);
  assert.equal(attempts, 2);
  batcher.dispose();
});

test('ignora eventos duplicados y construye un título y mensaje descriptivos', () => {
  const digest = buildNotificationDigest([{ id: 'a', type: 'delete', itemName: 'Lavadora', userName: 'Felipe' }]);
  assert.equal(digest.title, '🛒 Lista actualizada');
  assert.match(digest.body, /eliminó de la lista: Lavadora/);

  const clock = makeClock();
  const batcher = makeBatcher(clock, async () => true);
  assert.equal(batcher.enqueue({ id: 'same', type: 'add', itemName: 'Arroz' }), true);
  assert.equal(batcher.enqueue({ id: 'same', type: 'add', itemName: 'Arroz' }), false);
  batcher.dispose();
  assert.ok(NOTIFICATION_PROGRESS_INTERVAL_MS > NOTIFICATION_QUIET_WINDOW_MS);
});
