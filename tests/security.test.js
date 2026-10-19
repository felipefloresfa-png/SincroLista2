import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeRateLimit, isAllowedPushEndpoint } from '../src/lib/security.js';

test('allows known browser push services over HTTPS only', () => {
  assert.equal(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/token'), true);
  assert.equal(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/token'), true);
  assert.equal(isAllowedPushEndpoint('https://web.push.apple.com/Qtoken'), true);
  assert.equal(isAllowedPushEndpoint('https://example.notify.windows.com/wpush/v1/token'), true);
  assert.equal(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/token'), false);
});

test('rejects arbitrary, local, credentialed, and oversized push destinations', () => {
  assert.equal(isAllowedPushEndpoint('https://127.0.0.1/admin'), false);
  assert.equal(isAllowedPushEndpoint('https://localhost/'), false);
  assert.equal(isAllowedPushEndpoint('https://attacker.example/'), false);
  assert.equal(isAllowedPushEndpoint('https://user:pass@fcm.googleapis.com/token'), false);
  assert.equal(isAllowedPushEndpoint('https://fcm.googleapis.com/token#fragment'), false);
  assert.equal(isAllowedPushEndpoint('x'.repeat(4097)), false);
});

test('throttles one identity and resets its window', () => {
  const key = `unit-test-${Date.now()}-${Math.random()}`;
  assert.equal(consumeRateLimit(key, 2, 1000, 10000).allowed, true);
  assert.equal(consumeRateLimit(key, 2, 1000, 10001).allowed, true);
  const blocked = consumeRateLimit(key, 2, 1000, 10002);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterMs, 998);
  assert.equal(consumeRateLimit(key, 2, 1000, 11000).allowed, true);
});
