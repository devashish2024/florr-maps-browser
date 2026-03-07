const FLORR_ORIGIN = "https://florr.io";
const FLORR_PROXY_PREFIX =
  "https://proxy.ashish.top?url=";

export const withFlorProxy = (url, skipCache) => {
  if (!url.startsWith(FLORR_ORIGIN)) return url;
  const proxied = `${FLORR_PROXY_PREFIX}${encodeURIComponent(url)}`;
  if (skipCache) return `${proxied}&t=${Date.now()}`;
  return proxied;
};

export const fetchText = async (url, skipCache) => {
  const response = await fetch(withFlorProxy(url, skipCache));
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
};

export const fetchTextWithMeta = async (url, skipCache) => {
  const response = await fetch(withFlorProxy(url, skipCache));
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  const lastFetched = response.headers.get("x-last-fetched");
  return { text, lastFetched };
};
