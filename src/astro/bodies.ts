// Sol, Luna y planetas. Precisión de décimas de grado o mejor entre 1800 y 2050:
// sobra para dibujar una lámina y para decir a qué hora sale cada astro.
import {
  type Equatorial, centuries, cos, eclipticToEquatorial, norm360, obliquity, precess, sin, atan2, asin, RAD,
} from './core';

/** Años entre los que valen los elementos orbitales de Standish: fuera de ellos, Bóveda no calcula. */
export const VALID_YEARS = [1800, 2050] as const;

export interface SunPosition extends Equatorial { lon: number; distance: number }

/** Posición aparente del Sol. Meeus cap. 25, método de baja precisión (±0,01°). */
export function sunPosition(jd: number): SunPosition {
  const T = centuries(jd);
  const L0 = 280.46646 + 36_000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35_999.05029 * T - 0.0001537 * T * T;
  const e = 0.016708634 - 0.000042037 * T;
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M) +
    (0.019993 - 0.000101 * T) * sin(2 * M) +
    0.000289 * sin(3 * M);
  const omega = 125.04 - 1934.136 * T;
  const lon = norm360(L0 + C - 0.00569 - 0.00478 * sin(omega));
  const distance = (1.000001018 * (1 - e * e)) / (1 + e * cos(M + C));
  const eps = obliquity(T) + 0.00256 * cos(omega);
  return { ...eclipticToEquatorial(lon, 0, eps), lon, distance };
}

// Términos principales de la teoría lunar ELP-2000/82 recogidos por Meeus (tabla 47.A y 47.B):
// [D, M, M', F, coeficiente]. Longitud y latitud en millonésimas de grado; distancia en metros.
const LON: number[][] = [
  [0, 0, 1, 0, 6288774], [2, 0, -1, 0, 1274027], [2, 0, 0, 0, 658314], [0, 0, 2, 0, 213618],
  [0, 1, 0, 0, -185116], [0, 0, 0, 2, -114332], [2, 0, -2, 0, 58793], [2, -1, -1, 0, 57066],
  [2, 0, 1, 0, 53322], [2, -1, 0, 0, 45758], [0, 1, -1, 0, -40923], [1, 0, 0, 0, -34720],
  [0, 1, 1, 0, -30383], [2, 0, 0, -2, 15327], [0, 0, 1, 2, -12528], [0, 0, 1, -2, 10980],
  [4, 0, -1, 0, 10675], [0, 0, 3, 0, 10034], [4, 0, -2, 0, 8548], [2, 1, -1, 0, -7888],
  [2, 1, 0, 0, -6766], [1, 0, -1, 0, -5163], [1, 1, 0, 0, 4987], [2, -1, 1, 0, 4036],
  [2, 0, 2, 0, 3994], [4, 0, 0, 0, 3861], [2, 0, -3, 0, 3665], [0, 1, -2, 0, -2689],
];
const DIST: number[][] = [
  [0, 0, 1, 0, -20905355], [2, 0, -1, 0, -3699111], [2, 0, 0, 0, -2955968], [0, 0, 2, 0, -569925],
  [0, 1, 0, 0, 48888], [2, 0, -2, 0, 246158], [2, -1, -1, 0, -152138], [2, 0, 1, 0, -170733],
  [2, -1, 0, 0, -204586], [0, 1, -1, 0, -129620], [1, 0, 0, 0, 108743], [0, 1, 1, 0, 104755],
];
const LAT: number[][] = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463], [2, -1, 0, 1, 2211],
];

export interface MoonPosition extends Equatorial { lon: number; lat: number; distance: number }

/** Posición geocéntrica de la Luna. Meeus cap. 47 truncado (±0,02°). */
export function moonPosition(jd: number): MoonPosition {
  const T = centuries(jd);
  const Lp = 218.3164477 + 481_267.88123421 * T - 0.0015786 * T * T;
  const D = 297.8501921 + 445_267.1114034 * T - 0.0018819 * T * T;
  const M = 357.5291092 + 35_999.0502909 * T - 0.0001536 * T * T;
  const Mp = 134.9633964 + 477_198.8675055 * T + 0.0087414 * T * T;
  const F = 93.272095 + 483_202.0175233 * T - 0.0036539 * T * T;
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const A1 = 119.75 + 131.849 * T;
  const A2 = 53.09 + 479_264.29 * T;
  const A3 = 313.45 + 481_266.484 * T;

  const term = ([d, m, mp, f, c]: number[], fn: (x: number) => number) =>
    c * E ** Math.abs(m) * fn(d * D + m * M + mp * Mp + f * F);

  let sl = LON.reduce((s, t) => s + term(t, sin), 0);
  let sb = LAT.reduce((s, t) => s + term(t, sin), 0);
  const sr = DIST.reduce((s, t) => s + term(t, cos), 0);
  sl += 3958 * sin(A1) + 1962 * sin(Lp - F) + 318 * sin(A2);
  sb += -2235 * sin(Lp) + 382 * sin(A3) + 175 * sin(A1 - F) + 175 * sin(A1 + F) + 127 * sin(Lp - Mp) - 115 * sin(Lp + Mp);

  const lon = norm360(Lp + sl / 1e6);
  const lat = sb / 1e6;
  const distance = 385_000.56 + sr / 1000;
  const omega = 125.04452 - 1934.136261 * T;
  const nutLon = -0.004778 * sin(omega); // nutación en longitud, término dominante
  const eps = obliquity(T) + 0.00256 * cos(omega);
  return { ...eclipticToEquatorial(lon + nutLon, lat, eps), lon, lat, distance };
}

/** Paralaje: desde la superficie vemos la Luna hasta un grado más baja que desde el centro de la Tierra. */
export const moonParallax = (alt: number, distanceKm: number) => Math.asin(6378.14 / distanceKm) * RAD * cos(alt);

export interface MoonPhase {
  /** Fracción iluminada, de 0 a 1. */
  illuminated: number;
  waxing: boolean;
  /** Edad aproximada en días desde la luna nueva. */
  age: number;
  name: string;
}

/** Fase a partir de la elongación Sol–Luna. Meeus cap. 48. */
export function moonPhase(jd: number): MoonPhase {
  const s = sunPosition(jd);
  const m = moonPosition(jd);
  const psi = Math.acos(cos(m.lat) * cos(m.lon - s.lon)) * RAD;
  const R = s.distance * 149_597_870.7;
  const i = atan2(R * sin(psi), m.distance - R * cos(psi));
  const illuminated = (1 + cos(i)) / 2;
  const elong = norm360(m.lon - s.lon);
  const waxing = elong < 180;
  const age = (elong / 360) * 29.530589;
  return { illuminated, waxing, age, name: phaseName(illuminated, waxing) };
}

function phaseName(k: number, waxing: boolean): string {
  if (k < 0.03) return 'Luna nueva';
  if (k > 0.97) return 'Luna llena';
  if (Math.abs(k - 0.5) < 0.06) return waxing ? 'Cuarto creciente' : 'Cuarto menguante';
  if (k < 0.5) return waxing ? 'Luna creciente' : 'Luna menguante';
  return waxing ? 'Gibosa creciente' : 'Gibosa menguante';
}

// Elementos keplerianos aproximados del JPL (E. M. Standish), válidos de 1800 a 2050:
// a [UA], e, i, L, ϖ, Ω [grados] y sus tasas por siglo juliano.
type Elements = [number, number, number, number, number, number];
const ORBITS: Record<string, { el: Elements; rate: Elements }> = {
  mercurio: { el: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], rate: [3.7e-7, 1.906e-5, -0.00594749, 149_472.67411175, 0.16047689, -0.12534081] },
  venus: { el: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], rate: [3.9e-6, -4.107e-5, -0.0007889, 58_517.81538729, 0.00268329, -0.27769418] },
  tierra: { el: [1.00000261, 0.01671123, -1.531e-5, 100.46457166, 102.93768193, 0], rate: [5.62e-6, -4.392e-5, -0.01294668, 35_999.37244981, 0.32327364, 0] },
  marte: { el: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], rate: [1.847e-5, 7.882e-5, -0.00813131, 19_140.30268499, 0.44441088, -0.29257343] },
  jupiter: { el: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106] },
  saturno: { el: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], rate: [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794] },
  urano: { el: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503], rate: [-0.00196176, -4.397e-5, -0.00242939, 428.48202785, 0.40805281, 0.04240589] },
  neptuno: { el: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], rate: [0.00026291, 5.105e-5, 0.00035372, 218.45945325, -0.32241464, -0.00508664] },
};

export const PLANETS = [
  { id: 'mercurio', name: 'Mercurio' },
  { id: 'venus', name: 'Venus' },
  { id: 'marte', name: 'Marte' },
  { id: 'jupiter', name: 'Júpiter' },
  { id: 'saturno', name: 'Saturno' },
  { id: 'urano', name: 'Urano' },
  { id: 'neptuno', name: 'Neptuno' },
] as const;
export type PlanetId = (typeof PLANETS)[number]['id'];

/** Posición heliocéntrica eclíptica (J2000) resolviendo la ecuación de Kepler. */
export function heliocentric(id: string, T: number): [number, number, number] {
  const { el, rate } = ORBITS[id];
  const [a, e, i, L, w, N] = el.map((v, k) => v + rate[k] * T);
  const omega = w - N;
  const M = norm360(L - w + 180) - 180;
  let E = M + e * RAD * sin(M);
  for (let k = 0; k < 8; k++) {
    const dE = (M - (E - e * RAD * sin(E))) / (1 - e * cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-9) break;
  }
  const xp = a * (cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * sin(E);
  const [co, so, cN, sN, ci, si] = [cos(omega), sin(omega), cos(N), sin(N), cos(i), sin(i)];
  return [
    (co * cN - so * sN * ci) * xp + (-so * cN - co * sN * ci) * yp,
    (co * sN + so * cN * ci) * xp + (-so * sN + co * cN * ci) * yp,
    so * si * xp + co * si * yp,
  ];
}

export interface PlanetPosition extends Equatorial { distance: number; magnitude: number }

// Magnitud visual: H + 5·log10(r·Δ) + término de fase (Müller, en Meeus cap. 41).
const MAG: Record<string, (i: number) => number> = {
  mercurio: (i) => -0.42 + 0.038 * i - 0.000273 * i * i + 2e-6 * i ** 3,
  venus: (i) => -4.4 + 0.0009 * i + 0.000239 * i * i - 6.5e-7 * i ** 3,
  marte: (i) => -1.52 + 0.016 * i,
  jupiter: (i) => -9.4 + 0.005 * i,
  saturno: () => -8.88,
  urano: () => -7.19,
  neptuno: () => -6.87,
};

export function planetPosition(id: PlanetId, jd: number): PlanetPosition {
  const T = centuries(jd);
  // Corregimos el tiempo de luz con una iteración: vemos el planeta donde estaba.
  const earth = heliocentric('tierra', T);
  let p = heliocentric(id, T);
  let d = Math.hypot(p[0] - earth[0], p[1] - earth[1], p[2] - earth[2]);
  p = heliocentric(id, T - (d * 0.0057755183) / 36_525);
  const g = [p[0] - earth[0], p[1] - earth[1], p[2] - earth[2]];
  d = Math.hypot(g[0], g[1], g[2]);
  const lon = norm360(atan2(g[1], g[0]));
  const lat = asin(g[2] / d);
  const eq = precess(eclipticToEquatorial(lon, lat, 23.4392911), T);
  const r = Math.hypot(p[0], p[1], p[2]);
  const R = Math.hypot(earth[0], earth[1], earth[2]);
  const phase = Math.acos(Math.max(-1, Math.min(1, (r * r + d * d - R * R) / (2 * r * d)))) * RAD;
  return { ...eq, distance: d, magnitude: MAG[id](phase) + 5 * Math.log10(r * d) };
}
