const requestBuckets = new Map();

export function isAllowedPushEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 4096) return false;
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) return false;
  const hostname = url.hostname.toLowerCase();
  return hostname === 'fcm.googleapis.com'
    || hostname === 'updates.push.services.mozilla.com'
    || hostname.endsWith('.push.services.mozilla.com')
    || hostname === 'web.push.apple.com'
    || hostname.endsWith('.push.apple.com')
    || hostname.endsWith('.notify.windows.com');
}

export function consumeRateLimit(key, limit, windowMs, now = Date.now()) {
  if (!key || !Number.isInteger(limit) || limit < 1 || !Number.isFinite(windowMs) || windowMs < 1) {
    return { allowed: false, retryAfterMs: windowMs };
  }
  let bucket = requestBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= windowMs) {
    bucket = { startedAt: now, count: 0 };
    requestBuckets.set(key, bucket);
  }
  if (bucket.count >= limit) {
    return { allowed: false, retryAfterMs: Math.max(1, windowMs - (now - bucket.startedAt)) };
  }
  bucket.count += 1;
  if (requestBuckets.size > 5000) {
    for (const [bucketKey, value] of requestBuckets) {
      if (now - value.startedAt >= windowMs) requestBuckets.delete(bucketKey);
    }
  }
  return { allowed: true, retryAfterMs: 0 };
}
