export const NOTIFICATION_QUIET_WINDOW_MS = 60_000;
export const NOTIFICATION_PROGRESS_INTERVAL_MS = 5 * 60_000;
const MAX_PENDING_AGE_MS = 12 * 60 * 60_000;
const MAX_REMEMBERED_EVENT_IDS = 1_000;

function safeStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function normalizeEvent(event, now) {
  if (!event || typeof event.id !== 'string' || !event.id) return null;
  const type = ['add', 'check', 'delete', 'clear'].includes(event.type) ? event.type : 'update';
  return {
    id: event.id,
    type,
    itemName: typeof event.itemName === 'string' ? event.itemName.slice(0, 100) : '',
    userName: typeof event.userName === 'string' ? event.userName.slice(0, 100) : 'Tu pareja',
    createdAt: Number.isFinite(event.createdAt) ? event.createdAt : now,
  };
}

function listNames(events) {
  const names = [...new Set(events.map(event => event.itemName).filter(Boolean))];
  const visibleNames = names.slice(0, 3);
  const remainder = names.length - visibleNames.length;
  if (remainder > 0) visibleNames.push(`y ${remainder} más`);
  return visibleNames.join(', ');
}

export function buildNotificationDigest(events) {
  const normalized = events.map(event => normalizeEvent(event, Date.now())).filter(Boolean);
  if (normalized.length === 0) return null;

  const completed = normalized.some(event => event.type === 'clear');
  const changes = normalized.filter(event => event.type !== 'clear');
  const actor = normalized.at(-1)?.userName || 'Tu pareja';
  const names = listNames(changes);
  const count = changes.length;
  const counts = changes.reduce((result, event) => {
    result[event.type] = (result[event.type] || 0) + 1;
    return result;
  }, {});

  let body;
  if (completed) {
    body = count > 0
      ? `${actor} finalizó la compra después de actualizar ${count} producto${count === 1 ? '' : 's'}${names ? `: ${names}` : ''}.`
      : `${actor} finalizó la compra.`;
  } else if (count === 1) {
    const event = changes[0];
    const action = event.type === 'add' ? 'agregó a la lista' :
      event.type === 'check' ? 'marcó como comprado' :
      event.type === 'delete' ? 'eliminó de la lista' : 'actualizó';
    body = `${actor} ${action}${event.itemName ? `: ${event.itemName}` : ' un producto'}.`;
  } else {
    const onlyChecks = counts.check === count;
    const onlyAdds = counts.add === count;
    const onlyDeletes = counts.delete === count;
    const action = onlyChecks ? 'marcó como comprados' :
      onlyAdds ? 'agregó a la lista' :
      onlyDeletes ? 'eliminó de la lista' : 'actualizó';
    body = `${actor} ${action} ${count} productos${names ? `: ${names}` : ''}.`;
  }

  const ids = normalized.map(event => event.id);
  const batchId = `${ids[0]}-${ids[ids.length - 1]}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 72);
  return {
    title: completed ? '🎉 Compra finalizada' : '🛒 Lista actualizada',
    body: body.slice(0, 200),
    tag: `sincrolista-${completed ? 'complete' : 'batch'}-${batchId || Date.now()}`,
    data: {
      url: '/',
      type: completed ? 'clear' : (count === 1 ? changes[0].type : 'update'),
      itemName: '',
      eventIds: ids,
    },
  };
}

export class NotificationBatcher {
  constructor({
    storageKey,
    send,
    storage = safeStorage(),
    quietWindowMs = NOTIFICATION_QUIET_WINDOW_MS,
    progressIntervalMs = NOTIFICATION_PROGRESS_INTERVAL_MS,
    now = Date.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  }) {
    this.storageKey = storageKey;
    this.send = send;
    this.storage = storage;
    this.quietWindowMs = quietWindowMs;
    this.progressIntervalMs = progressIntervalMs;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.timer = null;
    this.flushing = null;
    this.flushRequested = null;
    this.state = this.readState();
    this.schedule();
  }

  readState() {
    try {
      const saved = JSON.parse(this.storage?.getItem(this.storageKey) || '{}');
      const now = this.now();
      const events = Array.isArray(saved.events)
        ? saved.events.map(event => normalizeEvent(event, now)).filter(Boolean)
          .filter(event => now - event.createdAt <= MAX_PENDING_AGE_MS)
        : [];
      return {
        events,
        sentIds: Array.isArray(saved.sentIds) ? saved.sentIds.filter(id => typeof id === 'string').slice(-MAX_REMEMBERED_EVENT_IDS) : [],
        lastSentAt: Number.isFinite(saved.lastSentAt) ? saved.lastSentAt : 0,
      };
    } catch {
      return { events: [], sentIds: [], lastSentAt: 0 };
    }
  }

  persist() {
    try {
      if (this.state.events.length === 0 && this.state.sentIds.length === 0) {
        this.storage?.removeItem(this.storageKey);
      } else {
        this.storage?.setItem(this.storageKey, JSON.stringify(this.state));
      }
    } catch {
      // La cola en memoria continúa funcionando si el almacenamiento del navegador no está disponible.
    }
  }

  enqueue(input) {
    const event = normalizeEvent(input, this.now());
    if (!event) return false;
    if (this.state.sentIds.includes(event.id) || this.state.events.some(item => item.id === event.id)) return false;

    this.state.events.push(event);
    this.persist();
    if (event.type === 'clear') {
      void this.flush('completed');
    } else {
      this.schedule();
    }
    return true;
  }

  schedule() {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    if (this.state.events.length === 0) return;

    const now = this.now();
    const firstAt = this.state.events[0].createdAt;
    const lastAt = this.state.events[this.state.events.length - 1].createdAt;
    const progressBase = this.state.lastSentAt > 0 ? this.state.lastSentAt : firstAt;
    const progressAt = progressBase + this.progressIntervalMs;
    const quietAt = lastAt + this.quietWindowMs;
    const dueAt = Math.min(progressAt, quietAt);

    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.flush(progressAt <= quietAt ? 'progress' : 'quiet');
    }, Math.max(0, dueAt - now));
  }

  async flush(reason = 'quiet') {
    if (this.flushing) {
      this.flushRequested = reason;
      return this.flushing;
    }
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    if (this.state.events.length === 0) return false;

    const batch = this.state.events;
    this.state.events = [];
    this.persist();
    this.flushing = (async () => {
      let succeeded = false;
      try {
        const digest = buildNotificationDigest(batch);
        succeeded = Boolean(digest && await this.send(digest, { reason, eventIds: batch.map(event => event.id) }));
      } catch {
        succeeded = false;
      }

      if (succeeded) {
        this.state.sentIds = [...this.state.sentIds, ...batch.map(event => event.id)].slice(-MAX_REMEMBERED_EVENT_IDS);
        this.state.lastSentAt = this.now();
      } else {
        this.state.events = [...batch, ...this.state.events]
          .sort((a, b) => a.createdAt - b.createdAt)
          .slice(-500);
      }
      this.persist();
      this.flushing = null;
      this.schedule();

      const requested = this.flushRequested;
      this.flushRequested = null;
      if (requested && this.state.events.length > 0) return this.flush(requested);
      return succeeded;
    })();
    return this.flushing;
  }

  dispose() {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    this.persist();
  }
}
