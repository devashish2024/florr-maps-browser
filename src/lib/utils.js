export const clamp2 = (max, val) => {
  return Math.min(max, Math.max(0, val));
};

export const darkened = (base, v) => {
  const x = parseInt(base, 16);
  const f = 1 - v;
  const r = (x >>> 16) & 255;
  const g = (x >>> 8) & 255;
  const b = x & 255;
  const outR = (r * f) | 0;
  const outG = (g * f) | 0;
  const outB = (b * f) | 0;
  const blend = (outR << 16) | (outG << 8) | outB;
  return `#${blend.toString(16).padStart(6, "0")}`;
};
