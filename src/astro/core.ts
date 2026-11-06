// Fundamentos: tiempo, sistemas de coordenadas y precesión.
// Fórmulas de Jean Meeus, «Astronomical Algorithms» (2.ª ed., 1998). Ángulos en grados.

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export const norm360 = (x: number) => ((x % 360) + 360) % 360;
export const sin = (d: number) => Math.sin(d * DEG);
export const cos = (d: number) => Math.cos(d * DEG);
export const asin = (x: number) => Math.asin(Math.max(-1, Math.min(1, x))) * RAD;
export const atan2 = (y: number, x: number) => Math.atan2(y, x) * RAD;

export interface Equatorial { ra: number; dec: number }
export interface Horizontal { alt: number; az: number }

/** Día juliano de un instante (UT). Meeus cap. 7. */
export const julianDay = (ms: number) => ms / 86_400_000 + 2_440_587.5;
export const msFromJulianDay = (jd: number) => (jd - 2_440_587.5) * 86_400_000;
/** Siglos julianos desde J2000.0. */
export const centuries = (jd: number) => (jd - 2_451_545) / 36_525;

/** Tiempo sidéreo medio de Greenwich, en grados. Meeus 12.4. */
export function greenwichSidereal(jd: number): number {
  const T = centuries(jd);
  return norm360(280.46061837 + 360.98564736629 * (jd - 2_451_545) + 0.000387933 * T * T - (T * T * T) / 38_710_000);
}

/** Tiempo sidéreo local; la longitud es positiva al este. */
export const localSidereal = (jd: number, lon: number) => norm360(greenwichSidereal(jd) + lon);

/** Oblicuidad media de la eclíptica. Meeus 22.2, truncada. */
export const obliquity = (T: number) => 23.4392911 - 0.0130042 * T - 1.64e-7 * T * T + 5.04e-7 * T * T * T;

export function eclipticToEquatorial(lon: number, lat: number, eps: number): Equatorial {
  const ra = atan2(sin(lon) * cos(eps) - (sin(lat) / cos(lat)) * sin(eps), cos(lon));
  const dec = asin(sin(lat) * cos(eps) + cos(lat) * sin(eps) * sin(lon));
  return { ra: norm360(ra), dec };
}

/** Coeficientes de precesión de J2000.0 a la fecha. Meeus 21.3. */
export function precessionAngles(T: number) {
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) / 3600;
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) / 3600;
  const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) / 3600;
  return { zeta, z, theta };
}

/** Precesión rigurosa de J2000.0 a la fecha. Meeus 21.4. */
export function precess({ ra, dec }: Equatorial, T: number): Equatorial {
  const { zeta, z, theta } = precessionAngles(T);
  const A = cos(dec) * sin(ra + zeta);
  const B = cos(theta) * cos(dec) * cos(ra + zeta) - sin(theta) * sin(dec);
  const C = sin(theta) * cos(dec) * cos(ra + zeta) + cos(theta) * sin(dec);
  return { ra: norm360(atan2(A, B) + z), dec: asin(C) };
}

/**
 * Ecuatoriales → horizontales. El acimut se mide desde el norte hacia el este
 * (Meeus lo mide desde el sur; aquí seguimos la convención de navegación).
 */
export function toHorizontal({ ra, dec }: Equatorial, lat: number, lst: number): Horizontal {
  const H = lst - ra;
  const alt = asin(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(H));
  const az = atan2(-sin(H) * cos(dec), sin(dec) * cos(lat) - cos(dec) * sin(lat) * cos(H));
  return { alt, az: norm360(az) };
}

/** Refracción atmosférica a partir de la altura verdadera (Sæmundsson), en grados. */
export function refraction(alt: number): number {
  if (alt < -1.5) return 0;
  const R = 1.02 / Math.tan((alt + 10.3 / (alt + 5.11)) * DEG); // minutos de arco
  return Math.max(0, R / 60);
}

/** Separación angular entre dos puntos de la esfera. */
export function separation(a: Equatorial, b: Equatorial): number {
  return Math.acos(
    Math.max(-1, Math.min(1, sin(a.dec) * sin(b.dec) + cos(a.dec) * cos(b.dec) * cos(a.ra - b.ra))),
  ) * RAD;
}
