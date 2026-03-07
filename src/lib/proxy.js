const FLORR_ORIGIN = "https://florr.io";
const FLORR_PROXY_PREFIX =
  "https://proxy.ashish.top?url=";

export const withFlorProxy = (url) => {
  if (!url.startsWith(FLORR_ORIGIN)) return url;
  return `${FLORR_PROXY_PREFIX}${encodeURIComponent(url)}`;
};

export const fetchText = async (url) => {
  const response = await fetch(withFlorProxy(url));
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
};
