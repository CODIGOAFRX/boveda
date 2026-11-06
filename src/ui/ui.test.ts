import { describe, expect, it } from 'vitest';
import { BODY_IDS, computeScene, flatten, type Catalog, type Sky, type Target } from '../sky/scene';
import { PLACES, ownPlace } from './format';
import { readQuery, writeQuery } from './url';
import { ficha } from './ficha';
import { pasos } from './pasos';

// Un catálogo mínimo con la forma del de verdad (que se genera con `npm run data` y no está en el repositorio).
const catalog: Catalog = {
  stars: [[101.287, -16.716, -1.44, 0.01, 32349], [88.793, 7.407, 0.45, 1.5, 27989]],
  names: { 32349: ['Sirio', 'α', 'CMa'], 27989: ['Betelgeuse', 'α', 'Ori'] },
  constellations: [
    { id: 'CMa', es: 'Perro Mayor', la: 'Canis Major', gen: 'Canis Majoris', rank: 1, at: [103, -22], lines: [] },
    { id: 'Ori', es: 'Orión', la: 'Orion', gen: 'Orionis', rank: 1, at: [84, 5], lines: [] },
  ],
  milkyWay: [],
};
const granada = PLACES[0];
const sky = (): Sky => {
  const points = flatten(catalog);
  return { catalog, points, scene: computeScene(points, Date.UTC(2026, 10, 6, 21), granada.lat, granada.lon) };
};
const everything: Target[] = [
  ...BODY_IDS.map((id): Target => ({ kind: 'body', id })),
  ...catalog.stars.map((_, index): Target => ({ kind: 'star', index })),
  ...catalog.constellations.map((_, index): Target => ({ kind: 'con', index })),
];

describe('enlace compartido', () => {
  it('devuelve el mismo lugar, minuto y estrella', () => {
    const shared = { place: PLACES[2], ms: Date.UTC(1990, 4, 1, 3, 0), selected: { kind: 'star', index: 1 } as Target };
    expect(readQuery(writeQuery(shared, catalog), catalog)).toEqual(shared);
  });

  it('una ubicación propia viaja con sus coordenadas y su huso', () => {
    const place = ownPlace(60, 10.5, 'Europe/Oslo');
    expect(readQuery(writeQuery({ place, ms: Date.UTC(2030, 0, 1), selected: null }, catalog), catalog).place).toEqual(place);
  });

  it('se puede compartir cualquier cosa que se pueda elegir', () => {
    for (const selected of everything) {
      expect(readQuery(writeQuery({ place: granada, ms: 0, selected }, catalog), catalog).selected).toEqual(selected);
    }
  });

  it('lo que no se entiende se queda fuera', () => {
    expect(readQuery('?lat=95&lon=0&t=ayer&ver=pluton', catalog)).toEqual({ selected: null });
  });
});

describe('ficha y pasos', () => {
  it('todo lo que se puede elegir tiene ficha con sus horas', () => {
    for (const t of everything) {
      const f = ficha(t, sky(), granada);
      expect(f.nombre).toBeTruthy();
      expect(f.rows.some(([k]) => k === 'Sale' || k === 'Visibilidad')).toBe(true);
    }
  });

  it('la ficha de una estrella lleva a su constelación', () => {
    expect(ficha({ kind: 'star', index: 0 }, sky(), granada).constellation).toEqual({ index: 0, name: 'Perro Mayor' });
  });

  it('los pasos usan lo elegido, salvo una constelación, que no es un punto: entonces, Sirio', () => {
    expect(pasos(null, sky(), granada, 300).name).toBe('Sirio');
    expect(pasos({ kind: 'con', index: 1 }, sky(), granada, 300).name).toBe('Sirio');
    expect(pasos({ kind: 'body', id: 'marte' }, sky(), granada, 300).name).toBe('Marte');
    expect(pasos({ kind: 'star', index: 1 }, sky(), granada, 300).name).toBe('Betelgeuse');
  });
});
