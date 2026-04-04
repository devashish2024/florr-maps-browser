import { PI2 } from "./consts.js";

const valid = (p) => p !== "none";

export const svgToCanvasNormal = (svg, width, height) => {
  const temp = document.createElement("div");
  temp.innerHTML = svg;

  const s = temp.firstElementChild;
  if (!(s instanceof SVGElement)) return null;

  const view = s.getAttribute("viewBox")
    ?.split(" ")
    .map((x) => Number(x)) ?? [
      0, 0,
      Number(s.getAttribute("width")),
      Number(s.getAttribute("height")),
    ];

  const [, , w, h] = view;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.save();
  ctx.scale(width / w, height / h);

  const write = (t) => {
    const opacity = t.getAttribute("stroke-opacity") ?? t.getAttribute("fill-opacity") ?? t.getAttribute("opacity") ?? "none";
    const fill = t.getAttribute("fill") ?? "#000000";
    const stroke = t.getAttribute("stroke") ?? "none";
    const lineWidth = t.getAttribute("stroke-width") ?? "none";
    const lineCap = t.getAttribute("stroke-linecap") ?? "none";
    const lineJoin = t.getAttribute("stroke-linejoin") ?? "none";
    const miterLimit = t.getAttribute("stroke-miterlimit") ?? "none";

    ctx.save();
    ctx.fillStyle = fill;
    if (valid(opacity)) ctx.globalAlpha = Number(opacity);
    if (valid(stroke)) ctx.strokeStyle = stroke;
    if (valid(lineWidth)) ctx.lineWidth = Number(lineWidth);
    if (valid(lineCap)) ctx.lineCap = lineCap;
    if (valid(lineJoin)) ctx.lineJoin = lineJoin;
    if (valid(miterLimit)) ctx.miterLimit = Number(miterLimit);

    switch (t.tagName) {
      case "rect": {
        const x = parseInt(t.getAttribute("x") ?? "0");
        const y = parseInt(t.getAttribute("y") ?? "0");
        const rw = parseInt(t.getAttribute("width") ?? "0");
        const rh = parseInt(t.getAttribute("height") ?? "0");
        if (valid(fill)) ctx.fillRect(x, y, rw, rh);
        if (valid(stroke)) ctx.stroke();
        break;
      }
      case "path": {
        const d = t.getAttribute("d");
        if (!d) break;
        const p2d = new Path2D(d);
        if (valid(fill)) ctx.fill(p2d);
        if (valid(stroke)) ctx.stroke(p2d);
        break;
      }
      case "polyline": {
        const points = t.getAttribute("points")
          ?.split(" ")
          ?.map((x) => x.split(",").map((v) => Number(v)));
        if (!points) break;
        let first = true;
        ctx.beginPath();
        for (const [px, py] of points) {
          if (first) { ctx.moveTo(px, py); first = false; continue; }
          ctx.lineTo(px, py);
        }
        if (valid(fill)) ctx.fill();
        if (valid(stroke)) ctx.stroke();
        break;
      }
      case "polygon": {
        const points = t.getAttribute("points")
          ?.split(" ")
          ?.map((x) => x.split(",").map((v) => Number(v)));
        if (!points) break;
        let first = true;
        ctx.beginPath();
        for (const [px, py] of points) {
          if (first) { ctx.moveTo(px, py); first = false; continue; }
          ctx.lineTo(px, py);
        }
        ctx.closePath();
        if (valid(fill)) ctx.fill();
        if (valid(stroke)) ctx.stroke();
        break;
      }
      case "circle": {
        const cx = parseInt(t.getAttribute("cx") ?? "0");
        const cy = parseInt(t.getAttribute("cy") ?? "0");
        const r = parseInt(t.getAttribute("r") ?? "0");
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, PI2);
        if (valid(fill)) ctx.fill();
        if (valid(stroke)) ctx.stroke();
        break;
      }
      case "ellipse": {
        const cx = parseInt(t.getAttribute("cx") ?? "0");
        const cy = parseInt(t.getAttribute("cy") ?? "0");
        const rx = parseInt(t.getAttribute("rx") ?? "0");
        const ry = parseInt(t.getAttribute("ry") ?? "0");
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, PI2);
        if (valid(fill)) ctx.fill();
        if (valid(stroke)) ctx.stroke();
        break;
      }
      default:
        break;
    }
    ctx.restore();
  };

  const clipPaths = new Map();
  for (const clip of s.getElementsByTagName("clipPath")) {
    for (const p of clip.children) {
      const path = p.getAttribute("d");
      if (!path) continue;
      clipPaths.set(`url(#${clip.id})`, new Path2D(path));
    }
  }

  const loop = (elem) => {
    for (const t of elem.children) {
      write(t);
      if (t.tagName === "g") {
        ctx.save();
        const cp = clipPaths.get(t.getAttribute("clip-path") ?? "");
        if (cp) ctx.clip(cp);
        loop(t);
        ctx.restore();
      }
    }
  };

  loop(s);
  ctx.restore();
  return canvas;
};

export const svgToCanvas = async (svg, width, height, mob = false) => {

  if (!mob) return svgToCanvasNormal(svg, width, height);

  // For mob sprites, use Image-based rendering via svgToCanvasImage
  return svgToCanvasImage(svg, width, height);
};

export const svgToCanvasImage = async (svg, width, height) => {
  try {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.decoding = "async";
      const loaded = new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });
      image.src = url;
      await loaded;

      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(image, 0, 0, width, height);
      return canvas;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
};
