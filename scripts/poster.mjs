// Genera las dos capas de la lámina que anuncia Bóveda en el portfolio: el aro graduado (fijo) y el
// cielo extendido más allá del horizonte (gira con el scroll alrededor de la Polar).
// Uso: npx vite --port 5174 & node scripts/poster.mjs <carpeta-de-salida>
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] || 'poster';
const NIGHT = Date.UTC(2027, 0, 15, 21, 0); // 15 ene 2027, 22:00 en Granada: media Luna, Júpiter, Saturno y Orión
const [LAT, LON] = [37.1773, -3.5986];
const SIZE = 1200;
const SCALE = 1.5;
const REACH = 2;
// Cianotipia, con el papel del color de fondo del apartado en el portfolio.
const INK = { paper: '#17345a', ink: '#e8eef4', accent: '#f1c27a', night: 0.1 };

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.goto('http://localhost:5174/');
await page.waitForFunction(() => document.fonts.status === 'loaded');

const result = await page.evaluate(async ({ NIGHT, LAT, LON, SIZE, SCALE, REACH, INK }) => {
  const sc = await import('/src/sky/scene.ts');
  const { drawPlate } = await import('/src/render/plate.ts');
  await document.fonts.load('16px "IM Fell English SC"');
  await document.fonts.load('italic 16px "IM Fell English"');
  const catalog = await fetch('/data/sky.json').then((r) => r.json());
  const points = sc.flatten(catalog);
  const scene = sc.computeScene(points, NIGHT, LAT, LON);
  const base = { scene, catalog, points, ink: INK, selected: null, progress: 1, background: false, scale: SCALE, size: SIZE };

  const frame = document.createElement('canvas');
  frame.width = frame.height = SIZE;
  drawPlate(frame.getContext('2d'), { ...base, layers: 'frame' });

  const R = SIZE / 2 - SIZE * 0.075 - 6 * SCALE;
  const S2 = Math.ceil(2 * R * REACH + 16);
  const sky = document.createElement('canvas');
  sky.width = sky.height = S2;
  const ctx = sky.getContext('2d');
  ctx.translate((S2 - SIZE) / 2, (S2 - SIZE) / 2);
  drawPlate(ctx, { ...base, layers: 'sky', reach: REACH });

  // Dónde cae el polo celeste dentro de la imagen del cielo, para el transform-origin del giro.
  const poleUp = R * Math.tan(((90 - LAT) * Math.PI) / 360);
  return {
    frame: frame.toDataURL('image/webp', 0.9),
    sky: sky.toDataURL('image/webp', 0.86),
    geometry: { size: SIZE, sky: S2, radius: R, poleOriginY: (S2 / 2 - poleUp) / S2 },
  };
}, { NIGHT, LAT, LON, SIZE, SCALE, REACH, INK });

for (const name of ['frame', 'sky']) {
  const buf = Buffer.from(result[name].split(',')[1], 'base64');
  writeFileSync(join(out, `boveda-${name === 'frame' ? 'aro' : 'cielo'}.webp`), buf);
  console.log(`${name}: ${(buf.length / 1024).toFixed(0)} KB`);
}
console.log(JSON.stringify(result.geometry));
await browser.close();
