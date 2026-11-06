// El estado que se comparte por enlace: lugar, instante y lo elegido. Quien abre el enlace ve el mismo cielo.
import { BODY_IDS, type Catalog, type Target } from '../sky/scene';
import { OWN_PLACE, PLACES, ownPlace, type Place } from './format';

export interface Shared { place: Place; ms: number; selected: Target | null }

/** Lee de la URL lo que traiga; lo que falte o no se entienda se queda fuera. */
export function readQuery(search: string, catalog: Catalog): Partial<Shared> {
  const q = new URLSearchParams(search);
  const out: Partial<Shared> = {};
  const known = PLACES.find((p) => p.id === q.get('lugar'));
  const lat = Number(q.get('lat'));
  const lon = Number(q.get('lon'));
  if (known) out.place = known;
  else if (q.has('lat') && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    out.place = ownPlace(lat, lon, q.get('tz') || undefined, q.get('nombre') || undefined);
  }
  const t = Date.parse(q.get('t') || '');
  if (!Number.isNaN(t)) out.ms = t;
  const ver = q.get('ver');
  if (ver) out.selected = parseTarget(ver, catalog);
  return out;
}

export function writeQuery({ place, ms, selected }: Shared, catalog: Catalog): string {
  const q = new URLSearchParams();
  if (place.id === OWN_PLACE) {
    q.set('lat', place.lat.toFixed(3));
    q.set('lon', place.lon.toFixed(3));
    q.set('tz', place.tz);
  } else q.set('lugar', place.id);
  q.set('t', new Date(Math.round(ms / 60_000) * 60_000).toISOString().slice(0, 16) + 'Z');
  if (selected) q.set('ver', targetKey(selected, catalog));
  return q.toString();
}

// Las estrellas van por su número de Hipparcos y las constelaciones por su abreviatura, que no cambian
// aunque cambie el orden del catálogo.
const targetKey = (t: Target, catalog: Catalog) =>
  t.kind === 'body' ? t.id : t.kind === 'star' ? `hip${catalog.stars[t.index][4]}` : catalog.constellations[t.index].id;

function parseTarget(key: string, catalog: Catalog): Target | null {
  if (key.startsWith('hip')) {
    const i = catalog.stars.findIndex((s) => s[4] === Number(key.slice(3)));
    return i >= 0 ? { kind: 'star', index: i } : null;
  }
  const c = catalog.constellations.findIndex((x) => x.id === key);
  if (c >= 0) return { kind: 'con', index: c };
  return BODY_IDS.includes(key) ? { kind: 'body', id: key } : null;
}
