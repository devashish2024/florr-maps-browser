const FLORR_ORIGIN = "https://florr.io";
const FLORR_PROXY_PREFIX =
  "https://proxy.ashish.top?url=";

const TEXT_CACHE_NAME = "florr-map-browser-text-cache-v1";
const TEXT_CACHE_META_PREFIX = "florr-map-browser:text-meta:";

const canUsePersistentCache = () => {
  return typeof caches !== "undefined" && typeof localStorage !== "undefined";
};

const cacheRequestForKey = (cacheKey) => {
  return new Request(`https://florr-map-browser-cache.local/${encodeURIComponent(cacheKey)}`);
};

const readTextCacheMeta = (cacheKey) => {
  try {
    const raw = localStorage.getItem(`${TEXT_CACHE_META_PREFIX}${cacheKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.cachedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeTextCacheMeta = (cacheKey, meta) => {
  try {
    localStorage.setItem(`${TEXT_CACHE_META_PREFIX}${cacheKey}`, JSON.stringify(meta));
  } catch {
    // Ignore storage quota/availability failures.
  }
};

const readCachedText = async (cacheKey, ttlMs) => {
  if (!canUsePersistentCache() || !ttlMs || ttlMs <= 0) return null;

  const meta = readTextCacheMeta(cacheKey);
  if (!meta) return null;
  if (Date.now() - meta.cachedAt > ttlMs) return null;

  try {
    const cache = await caches.open(TEXT_CACHE_NAME);
    const response = await cache.match(cacheRequestForKey(cacheKey));
    if (!response) return null;
    const text = await response.text();
    return { text, lastFetched: meta.lastFetched || null };
  } catch {
    return null;
  }
};

const writeCachedText = async (cacheKey, text, lastFetched) => {
  if (!canUsePersistentCache()) return;

  try {
    const cache = await caches.open(TEXT_CACHE_NAME);
    await cache.put(
      cacheRequestForKey(cacheKey),
      new Response(text, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
    writeTextCacheMeta(cacheKey, {
      cachedAt: Date.now(),
      lastFetched: lastFetched || new Date().toISOString(),
    });
  } catch {
    // Ignore cache write failures and keep runtime behavior.
  }
};

export const withFlorProxy = (url, skipCache) => {
  if (!url.startsWith(FLORR_ORIGIN)) return url;
  const proxied = `${FLORR_PROXY_PREFIX}${encodeURIComponent(url)}`;
  if (skipCache) return `${proxied}&t=${Date.now()}`;
  return proxied;
};

export const fetchText = async (url, skipCache, options = {}) => {
  const { ttlMs = 0, cacheKey = url } = options;
  if (!skipCache) {
    const cached = await readCachedText(cacheKey, ttlMs);
    if (cached) return cached.text;
  }

  const response = await fetch(withFlorProxy(url, skipCache));
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  if (ttlMs > 0) {
    const lastFetched = response.headers.get("x-last-fetched");
    await writeCachedText(cacheKey, text, lastFetched);
  }
  return text;
};

export const fetchTextWithMeta = async (url, skipCache, options = {}) => {
  const { ttlMs = 0, cacheKey = url } = options;
  if (!skipCache) {
    const cached = await readCachedText(cacheKey, ttlMs);
    if (cached) return cached;
  }

  const response = await fetch(withFlorProxy(url, skipCache));
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  const lastFetched = response.headers.get("x-last-fetched");

  if (ttlMs > 0) {
    await writeCachedText(cacheKey, text, lastFetched);
  }

  return { text, lastFetched };
};
