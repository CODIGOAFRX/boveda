// Compacta los catálogos de d3-celestial (BSD-3, Olaf Frohn) en un único sky.json.
// Estrellas: Hipparcos hasta magnitud 6. Líneas y nombres en castellano cuando existen.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const SRC = 'node_modules/d3-celestial/data';
const read = (f) => JSON.parse(readFileSync(`${SRC}/${f}`, 'utf8'));
const r = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
// En d3-celestial la AR va de -180 a 180; la normalizamos a 0–360.
const ra = (x) => r(x < 0 ? x + 360 : x, 3);

const stars = read('stars.6.json').features
  .filter((f) => f.properties.mag <= 6)
  .sort((a, b) => a.properties.mag - b.properties.mag)
  .map((f) => [
    ra(f.geometry.coordinates[0]),
    r(f.geometry.coordinates[1], 3),
    r(f.properties.mag),
    r(Number(f.properties.bv) || 0.6),
    f.id,
  ]);

const visibleHip = new Set(stars.map((s) => s[4]));
const names = {};
for (const [hip, n] of Object.entries(read('starnames.json'))) {
  if (!visibleHip.has(Number(hip))) continue;
  const name = n.es || n.name;
  if (!name && !n.bayer) continue;
  names[hip] = [name || '', n.bayer || '', n.c || ''];
}

const lines = new Map(read('constellations.lines.json').features.map((f) => [f.id, f.geometry.coordinates]));
const constellations = read('constellations.json').features.map((f) => ({
  id: f.id,
  es: f.properties.es || f.properties.name,
  la: f.properties.name,
  gen: f.properties.gen,
  rank: Number(f.properties.rank),
  at: [ra(f.geometry.coordinates[0]), r(f.geometry.coordinates[1], 1)],
  lines: (lines.get(f.id) || []).map((l) => l.map(([x, y]) => [ra(x), r(y)])),
}));

// La Vía Láctea viene en cinco niveles de brillo. Simplificamos cada anillo
// descartando vértices a menos de 0,6° del anterior: pasa de 530 KB a ~60 KB.
function simplify(ring, tol = 0.6) {
  const out = [ring[0]];
  for (const p of ring.slice(1)) {
    const q = out[out.length - 1];
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= tol) out.push(p);
  }
  return out.length >= 4 ? out.map(([x, y]) => [ra(x), r(y, 1)]) : null;
}
const milkyWay = read('mw.json').features.map((f) =>
  f.geometry.coordinates.flatMap((poly) => poly.map((ring) => simplify(ring)).filter(Boolean)),
);

mkdirSync('public/data', { recursive: true });
const out = JSON.stringify({ stars, names, constellations, milkyWay });
writeFileSync('public/data/sky.json', out);
console.log(
  `sky.json: ${stars.length} estrellas, ${Object.keys(names).length} nombres, ` +
    `${constellations.length} constelaciones, ${(out.length / 1024).toFixed(0)} KB`,
);
