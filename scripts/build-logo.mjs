/**
 * Regenerates every logo asset from the supplied source artwork.
 *
 *   node scripts/build-logo.mjs
 *
 * Source:  docs/design/reference/logo-reference.png
 * Writes:  public/logo.png
 *          public/icon-192.png, icon-512.png, icon-512-maskable.png
 *          src/app/icon.png, src/app/apple-icon.png
 *
 * Run this only when the source artwork changes. The outputs are committed,
 * so a normal build never needs it. Reasoning for each step is in
 * docs/design/LOGO.md.
 *
 * `sharp` is not a declared dependency: it arrives with Next, and this is a
 * manual one-off tool rather than part of the build, so it is used as-found.
 * If it ever disappears, `npm i -D sharp` and run this again.
 */
import sharp from "sharp";

const SRC = "docs/design/reference/logo-reference.png";

/* The source is a 1254x1254 lockup: mark on top, "VaaniTrack" wordmark and a
   "SPEAK · TRACK · LIVE SMARTER" tagline below it. Only the mark is wanted;
   the app already sets the name in type beside it. These bounds came from a
   row-by-row scan of the three content bands, not by eye. */
const CROP = { left: 312, top: 292, width: 631, height: 489 };
const PAD = 10;
const BG = [254, 252, 249];

/* Between forest-ink (~173) and mint-deep (~151). */
const TARGET_HUE = 158;

const base = sharp(SRC).extract({
  left: CROP.left - PAD,
  top: CROP.top - PAD,
  width: CROP.width + PAD * 2,
  height: CROP.height + PAD * 2,
});

const { data, info } = await base.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;
const px = Buffer.from(data);

const bgDist = (i) =>
  Math.max(
    Math.abs(px[i] - BG[0]),
    Math.abs(px[i + 1] - BG[1]),
    Math.abs(px[i + 2] - BG[2]),
  );

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToRgb(h, s, l) {
  h /= 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    Math.round(f(h + 1 / 3) * 255),
    Math.round(f(h) * 255),
    Math.round(f(h - 1 / 3) * 255),
  ];
}

/* 1. Gold -> green. The gold (~176,128,64) has red far above blue; the
   receipt's parchment cream (~240,224,192) does not, so r-b separates them
   without a mask. Each pixel keeps its own lightness and only the hue
   rotates, so the artwork's shading survives instead of flattening. */
for (let i = 0; i < px.length; i += C) {
  const r = px[i], g = px[i + 1], b = px[i + 2];
  if (r - b > 70 && r > 110) {
    const [, s, l] = rgbToHsl(r, g, b);
    // Gold is very saturated; green at the same saturation reads acidic.
    const [nr, ng, nb] = hslToRgb(TARGET_HUE, Math.min(s * 0.78, 0.55), l * 0.94);
    px[i] = nr; px[i + 1] = ng; px[i + 2] = nb;
  }
}

/* 2. Background -> transparent, by flood fill inward from the edges rather
   than by matching the colour globally. The receipt inside the mark is very
   nearly the same cream as the background, and a global match would punch
   holes straight through it. */
const seen = new Uint8Array(W * H);
const stack = [];
for (let x = 0; x < W; x++) stack.push([x, 0], [x, H - 1]);
for (let y = 0; y < H; y++) stack.push([0, y], [W - 1, y]);

const TOL = 26;
while (stack.length) {
  const [x, y] = stack.pop();
  if (x < 0 || y < 0 || x >= W || y >= H) continue;
  const p = y * W + x;
  if (seen[p] || bgDist(p * C) > TOL) continue;
  seen[p] = 1;
  stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
}
for (let p = 0; p < W * H; p++) if (seen[p]) px[p * C + 3] = 0;

/* Feather: a surviving pixel still close to the background is on an
   antialiased edge, so fade it rather than leave a cream fringe, which would
   be plainly visible on the mint icon field. */
for (let p = 0; p < W * H; p++) {
  if (seen[p]) continue;
  const d = bgDist(p * C);
  if (d < 34) px[p * C + 3] = Math.round((d / 34) * 255);
}

const mark = await sharp(px, { raw: { width: W, height: H, channels: 4 } })
  .png()
  .toBuffer()
  .then((buf) => sharp(buf).trim({ threshold: 1 }).toBuffer());

const meta = await sharp(mark).metadata();
console.log(`mark: ${meta.width}x${meta.height} (aspect ${(meta.width / meta.height).toFixed(4)})`);
console.log("If that aspect changed, update ASPECT in src/components/Logo.tsx.");

/* 3. Emit. The transparent mark for in-app use, and square icons on the mint
   field. Icons are full-bleed with no self-drawn border: iOS and Android
   apply their own rounding, and a border would be clipped unevenly. */
await sharp(mark).resize({ height: 512 }).png().toFile("public/logo.png");

const MINT = { r: 207, g: 234, b: 217, alpha: 1 }; // --color-mint-whisper

async function squareIcon(size, padRatio, file) {
  const inner = Math.round(size * (1 - padRatio * 2));
  const scaled = await sharp(mark).resize({ width: inner, height: inner, fit: "inside" }).toBuffer();
  const m = await sharp(scaled).metadata();
  await sharp({ create: { width: size, height: size, channels: 4, background: MINT } })
    .composite([{
      input: scaled,
      left: Math.round((size - m.width) / 2),
      top: Math.round((size - m.height) / 2),
    }])
    .png()
    .toFile(file);
  console.log("wrote", file);
}

await squareIcon(512, 0.14, "public/icon-512.png");
await squareIcon(192, 0.14, "public/icon-192.png");
// ~20% is Android's documented maskable safe zone.
await squareIcon(512, 0.22, "public/icon-512-maskable.png");
await squareIcon(180, 0.14, "src/app/apple-icon.png");
await squareIcon(64, 0.10, "src/app/icon.png");
