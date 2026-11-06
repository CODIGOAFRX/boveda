// Del catálogo J2000 a una escena: altura y acimut de cada punto para un lugar y un instante.
import {
  type Equatorial, DEG, RAD, centuries, julianDay, localSidereal, precess, toHorizontal, sin, cos,
  eclipticToEquatorial, obliquity,
} from '../astro/core';
import {
  moonParallax, moonPhase, moonPosition, planetPosition, sunPosition, PLANETS, type MoonPhase, type PlanetId,
} from '../astro/bodies';
import type { AltitudeAt } from '../astro/events';

export type StarRow = [ra: number, dec: number, mag: number, bv: number, hip: number];
export interface Constellation {
  id: string; es: string; la: string; gen: string; rank: number;
  at: [number, number]; lines: [number, number][][];
}
export interface Catalog {
  stars: StarRow[];
  names: Record<string, [name: string, bayer: string, con: string]>;
  constellations: Constellation[];
  milkyWay: [number, number][][][];
}

/** Todos los puntos del catálogo en arrays planos, para recalcularlos sin crear objetos. */
export interface Points {
  ra: Float64Array; dec: Float64Array;
  nStars: number;
  lines: number[][][]; // por constelación, polilíneas de índices
  labels: number[]; // índice del punto de la etiqueta de cada constelación
  milkyWay: number[][][]; // por nivel de brillo, anillos de índices
}

export function flatten(cat: Catalog): Points {
  const ra: number[] = [];
  const dec: number[] = [];
  const push = (r: number, d: number) => (ra.push(r), dec.push(d), ra.length - 1);
  for (const s of cat.stars) push(s[0], s[1]);
  const lines = cat.constellations.map((c) => c.lines.map((l) => l.map(([r, d]) => push(r, d))));
  const labels = cat.constellations.map((c) => push(c.at[0], c.at[1]));
  const milkyWay = cat.milkyWay.map((lvl) => lvl.map((ring) => ring.map(([r, d]) => push(r, d))));
  return { ra: Float64Array.from(ra), dec: Float64Array.from(dec), nStars: cat.stars.length, lines, labels, milkyWay };
}

/** Coordenadas de la fecha. La precesión cambia despacio: se recalcula solo si cambia la época. */
interface Epoch { key: number; ra: Float64Array; sinDec: Float64Array; cosDec: Float64Array }
let epoch: Epoch | null = null;

function epochFor(p: Points, T: number): Epoch {
  const key = Math.round(T * 400); // cada ~3 meses
  if (epoch && epoch.key === key && epoch.ra.length === p.ra.length) return epoch;
  const n = p.ra.length;
  const ra = new Float64Array(n);
  const sinDec = new Float64Array(n);
  const cosDec = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const q = precess({ ra: p.ra[i], dec: p.dec[i] }, T);
    ra[i] = q.ra;
    sinDec[i] = Math.sin(q.dec * DEG);
    cosDec[i] = Math.cos(q.dec * DEG);
  }
  return (epoch = { key, ra, sinDec, cosDec });
}

export interface Body extends Equatorial {
  kind: 'sun' | 'moon' | 'planet';
  id: string;
  name: string;
  alt: number;
  az: number;
  mag: number;
  distance: number; // UA, salvo la Luna en km
}

export interface Scene {
  ms: number; jd: number; lst: number; lat: number; lon: number;
  T: number;
  alt: Float32Array; az: Float32Array;
  sun: Body; moon: Body & { phase: MoonPhase; limb: Horizontal3 }; planets: Body[];
  ecliptic: [number, number][]; equator: [number, number][];
}
type Horizontal3 = [number, number, number];

const unit = (alt: number, az: number): Horizontal3 => [cos(alt) * cos(az), cos(alt) * sin(az), sin(alt)];

export function computeScene(p: Points, ms: number, lat: number, lon: number): Scene {
  const jd = julianDay(ms);
  const T = centuries(jd);
  const lst = localSidereal(jd, lon);
  const e = epochFor(p, T);
  const n = p.ra.length;
  const alt = new Float32Array(n);
  const az = new Float32Array(n);
  const sinLat = Math.sin(lat * DEG);
  const cosLat = Math.cos(lat * DEG);
  for (let i = 0; i < n; i++) {
    const H = (lst - e.ra[i]) * DEG;
    const cH = Math.cos(H);
    const sa = sinLat * e.sinDec[i] + cosLat * e.cosDec[i] * cH;
    alt[i] = Math.asin(sa) * RAD;
    const a = Math.atan2(-Math.sin(H) * e.cosDec[i], e.sinDec[i] * cosLat - e.cosDec[i] * sinLat * cH) * RAD;
    az[i] = a < 0 ? a + 360 : a;
  }

  const horiz = (q: Equatorial) => toHorizontal(q, lat, lst);
  const s = sunPosition(jd);
  const sun: Body = { kind: 'sun', id: 'sol', name: 'Sol', ...s, ...horiz(s), mag: -26.7, distance: s.distance };

  const m = moonPosition(jd);
  const mh = horiz(m);
  mh.alt -= moonParallax(mh.alt, m.distance);
  // Hacia dónde mira el limbo iluminado: un paso sobre el círculo máximo que va de la Luna al Sol.
  const mu = unit(mh.alt, mh.az);
  const su = unit(sun.alt, sun.az);
  const dot = mu[0] * su[0] + mu[1] * su[1] + mu[2] * su[2];
  const step: Horizontal3 = [0, 1, 2].map((k) => mu[k] + 0.03 * (su[k] - dot * mu[k])) as Horizontal3;
  const phase = moonPhase(jd);
  const moon = {
    kind: 'moon' as const, id: 'luna', name: 'Luna', ...m, ...mh,
    mag: -12.7 + 2.5 * (1 - phase.illuminated) * 4, distance: m.distance, phase, limb: step,
  };

  const planets: Body[] = PLANETS.map(({ id, name }) => {
    const q = planetPosition(id as PlanetId, jd);
    return { kind: 'planet', id, name, ...q, ...horiz(q), mag: q.magnitude, distance: q.distance };
  });

  const eps = obliquity(T);
  const ecliptic: [number, number][] = [];
  const equator: [number, number][] = [];
  for (let l = 0; l <= 360; l += 3) {
    const h = horiz(eclipticToEquatorial(l, 0, eps));
    ecliptic.push([h.alt, h.az]);
    const q = horiz({ ra: l, dec: 0 });
    equator.push([q.alt, q.az]);
  }

  return { ms, jd, lst, lat, lon, T, alt, az, sun, moon, planets, ecliptic, equator };
}

/** Del vector unitario del limbo a altura y acimut. */
export function fromUnit([x, y, z]: Horizontal3) {
  const r = Math.hypot(x, y, z);
  return { alt: Math.asin(z / r) * RAD, az: ((Math.atan2(y, x) * RAD) + 360) % 360 };
}

/** Coordenadas de la fecha de una estrella del catálogo. */
export function starOfDate(cat: Catalog, i: number, T: number): Equatorial {
  return precess({ ra: cat.stars[i][0], dec: cat.stars[i][1] }, T);
}

/** Lo que se puede elegir en la lámina: una estrella o una constelación del catálogo, o un cuerpo por su id. */
export type Target =
  | { kind: 'star'; index: number }
  | { kind: 'body'; id: string }
  | { kind: 'con'; index: number };

export const sameTarget = (a: Target | null, b: Target | null) =>
  !!a && !!b && a.kind === b.kind &&
  (a.kind === 'body' ? a.id === (b as typeof a).id : a.index === (b as { index: number }).index);

/** El cielo calculado junto con el catálogo del que sale. */
export interface Sky { catalog: Catalog; points: Points; scene: Scene }

/** Los cuerpos del sistema solar, por el id con el que se eligen y se comparten en la URL. */
export const BODY_IDS: readonly string[] = ['sol', 'luna', ...PLANETS.map((p) => p.id)];

export const bodyIn = (scene: Scene, id: string): Body =>
  id === 'sol' ? scene.sun : id === 'luna' ? scene.moon : scene.planets.find((p) => p.id === id)!;

/** Altura de algo elegido a lo largo del tiempo, para buscar cuándo sale, culmina y se pone. */
export function altitudeOf(t: Target, sky: Sky): AltitudeAt {
  const { catalog, scene: { lat, lon, T } } = sky;
  const at = (ms: number, eq: Equatorial) => toHorizontal(eq, lat, localSidereal(julianDay(ms), lon)).alt;
  if (t.kind === 'star') {
    const eq = starOfDate(catalog, t.index, T);
    return (ms) => at(ms, eq);
  }
  if (t.kind === 'con') {
    const [ra, dec] = catalog.constellations[t.index].at;
    const eq = precess({ ra, dec }, T);
    return (ms) => at(ms, eq);
  }
  if (t.id === 'sol') return (ms) => at(ms, sunPosition(julianDay(ms)));
  if (t.id === 'luna') {
    return (ms) => {
      const m = moonPosition(julianDay(ms));
      const a = at(ms, m);
      return a - moonParallax(a, m.distance);
    };
  }
  return (ms) => at(ms, planetPosition(t.id as PlanetId, julianDay(ms)));
}

export const sunDarkness = (sunAlt: number) => Math.max(0, Math.min(1, -sunAlt / 18));

export function twilight(sunAlt: number): string {
  if (sunAlt > -0.83) return 'de día';
  if (sunAlt > -6) return 'crepúsculo civil';
  if (sunAlt > -12) return 'crepúsculo náutico';
  if (sunAlt > -18) return 'crepúsculo astronómico';
  return 'noche cerrada';
}

