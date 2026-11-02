// Lugares, husos horarios y la manera de decir en castellano dónde está algo.

export interface Place { id: string; name: string; lat: number; lon: number; tz: string }

export const PLACES: Place[] = [
  { id: 'granada', name: 'Granada', lat: 37.1773, lon: -3.5986, tz: 'Europe/Madrid' },
  { id: 'calar-alto', name: 'Observatorio de Calar Alto', lat: 37.2236, lon: -2.5463, tz: 'Europe/Madrid' },
  { id: 'madrid', name: 'Madrid', lat: 40.4168, lon: -3.7038, tz: 'Europe/Madrid' },
  { id: 'barcelona', name: 'Barcelona', lat: 41.3874, lon: 2.1686, tz: 'Europe/Madrid' },
  { id: 'sevilla', name: 'Sevilla', lat: 37.3891, lon: -5.9845, tz: 'Europe/Madrid' },
  { id: 'valencia', name: 'Valencia', lat: 39.4699, lon: -0.3763, tz: 'Europe/Madrid' },
  { id: 'bilbao', name: 'Bilbao', lat: 43.263, lon: -2.935, tz: 'Europe/Madrid' },
  { id: 'coruna', name: 'A Coruña', lat: 43.3623, lon: -8.4115, tz: 'Europe/Madrid' },
  { id: 'roque', name: 'Roque de los Muchachos, La Palma', lat: 28.7606, lon: -17.8816, tz: 'Atlantic/Canary' },
  { id: 'mexico', name: 'Ciudad de México', lat: 19.4326, lon: -99.1332, tz: 'America/Mexico_City' },
  { id: 'bogota', name: 'Bogotá', lat: 4.711, lon: -74.0721, tz: 'America/Bogota' },
  { id: 'buenos-aires', name: 'Buenos Aires', lat: -34.6037, lon: -58.3816, tz: 'America/Argentina/Buenos_Aires' },
  { id: 'atacama', name: 'Desierto de Atacama', lat: -23.0193, lon: -67.7532, tz: 'America/Santiago' },
];

export const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const partsCache = new Map<string, Intl.DateTimeFormat>();
function parts(ms: number, tz: string) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    partsCache.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** Minutos que el huso va por delante de UTC en ese instante (incluye horario de verano). */
export function zoneOffset(ms: number, tz: string): number {
  const p = parts(ms, tz);
  return (Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000) / 60_000;
}

/** Hora de reloj en un huso → instante UTC. */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off = zoneOffset(guess - zoneOffset(guess, tz) * 60_000, tz);
  return guess - off * 60_000;
}

const pad = (n: number) => String(n).padStart(2, '0');
export function inputValues(ms: number, tz: string) {
  const p = parts(ms, tz);
  return { date: `${p.y}-${pad(p.mo)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` };
}

export const clock = (ms: number, tz: string) =>
  new Intl.DateTimeFormat('es-ES', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(ms);
export const longDate = (ms: number, tz: string) =>
  new Intl.DateTimeFormat('es-ES', { timeZone: tz, day: 'numeric', month: 'long', year: 'numeric' }).format(ms);
export const weekday = (ms: number, tz: string) =>
  new Intl.DateTimeFormat('es-ES', { timeZone: tz, weekday: 'long' }).format(ms);

const DIRS = ['al norte', 'al nordeste', 'al este', 'al sudeste', 'al sur', 'al sudoeste', 'al oeste', 'al noroeste'];
export const direction = (az: number) => DIRS[Math.round(az / 45) % 8];

export function height(alt: number): string {
  if (alt < 0) return 'bajo el horizonte';
  if (alt < 12) return 'rozando el horizonte';
  if (alt < 35) return 'bajo';
  if (alt < 60) return 'a media altura';
  if (alt < 80) return 'alto';
  return 'casi en el cénit';
}

export const num = (x: number, digits = 1) =>
  x.toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace('-', '−');

export function sexagesimal(deg: number, hours = false): string {
  const v = hours ? (((deg % 360) + 360) % 360) / 15 : Math.abs(deg);
  const a = Math.floor(v);
  const b = Math.floor((v - a) * 60);
  const c = ((v - a) * 60 - b) * 60;
  const sign = !hours && deg < 0 ? '−' : !hours ? '+' : '';
  return hours
    ? `${a}h ${pad(b)}m ${pad(Math.floor(c))}s`
    : `${sign}${a}° ${pad(b)}′ ${pad(Math.floor(c))}″`;
}

export const coords = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(2).replace('.', ',')}° ${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(2).replace('.', ',')}° ${lon >= 0 ? 'E' : 'O'}`;

/** Temperatura de una estrella a partir del índice de color B−V (Ballesteros, 2012). */
export const temperature = (bv: number) => 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));

export function starColor(bv: number): string {
  if (bv < -0.1) return 'blanco azulado';
  if (bv < 0.3) return 'blanco';
  if (bv < 0.6) return 'blanco amarillento';
  if (bv < 0.9) return 'amarillo';
  if (bv < 1.3) return 'anaranjado';
  return 'rojizo';
}
