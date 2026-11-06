// La ficha de lo elegido: qué es, dónde está ahora y a qué horas sale, culmina y se pone.
import { refraction } from '../astro/core';
import { HORIZON, riseTransitSet } from '../astro/events';
import { altitudeOf, bodyIn, type Sky, type Target } from '../sky/scene';
import { clock, direction, height, num, sexagesimal, starColor, temperature, type Place } from './format';

export interface Ficha {
  tipo: string;
  nombre: string;
  sub: string;
  /** Dónde está ahora y, si hace falta, una nota. */
  relato: string;
  /** Filas de la tabla: el valor puede llevar HTML (la muestra de color de una estrella). */
  rows: string[][];
  /** La constelación de una estrella, para ir a ella desde la ficha. */
  constellation?: { index: number; name: string };
}

function times(t: Target, sky: Sky, place: Place, h0: number): string[][] {
  const r = riseTransitSet(altitudeOf(t, sky), sky.scene.ms, h0);
  if (r.always === 'up') return [['Visibilidad', 'no se pone en todo el día']];
  if (r.always === 'down') return [['Visibilidad', 'no llega a salir']];
  return [
    ['Sale', r.rise ? clock(r.rise, place.tz) : '—'],
    ['Culmina', r.transit ? clock(r.transit, place.tz) : '—'],
    ['Se pone', r.set ? clock(r.set, place.tz) : '—'],
  ];
}

export function ficha(t: Target, sky: Sky, place: Place): Ficha {
  const { catalog, points, scene } = sky;
  let f: Omit<Ficha, 'relato'> & { note?: string };
  let alt: number;
  let az: number;

  if (t.kind === 'star') {
    const [ra, dec, mag, bv, hip] = catalog.stars[t.index];
    const [name, bayer, con] = catalog.names[hip] || ['', '', ''];
    const c = catalog.constellations.find((x) => x.id === con);
    alt = scene.alt[t.index];
    az = scene.az[t.index];
    const nombre = name || (bayer && c ? `${bayer} ${c.gen}` : `HIP ${hip}`);
    const T = Math.round(temperature(bv) / 100) * 100;
    f = {
      tipo: 'Estrella',
      nombre,
      sub: [bayer && c ? `${bayer} ${c.gen}` : '', c ? `en ${c.es}` : ''].filter((s) => s && s !== nombre).join(', '),
      rows: [
        ['Magnitud', num(mag, 2)],
        ['Color', `<span class="muestra" style="background:${bvToCss(bv)}"></span>${starColor(bv)}, unos ${T.toLocaleString('es-ES')} K`],
        ['Ascensión recta', sexagesimal(ra, true)],
        ['Declinación', sexagesimal(dec)],
        ...times(t, sky, place, HORIZON.star),
        ['Catálogo', `Hipparcos ${hip}`],
      ],
      constellation: c && { index: catalog.constellations.indexOf(c), name: c.es },
    };
  } else if (t.kind === 'con') {
    const c = catalog.constellations[t.index];
    const li = points.labels[t.index];
    alt = scene.alt[li];
    az = scene.az[li];
    const brightest = catalog.stars.findIndex((s) => catalog.names[s[4]]?.[2] === c.id);
    const bName = brightest >= 0 ? catalog.names[catalog.stars[brightest][4]] : null;
    f = {
      tipo: 'Constelación',
      nombre: c.es,
      sub: `${c.la}, genitivo ${c.gen}`,
      rows: [
        ...(bName ? [['Más brillante', `${bName[0] || `${bName[1]} ${c.gen}`} (mag ${num(catalog.stars[brightest][2], 1)})`]] : []),
        ...times(t, sky, place, 0),
      ],
      note: 'La hora de culminación es la mejor para buscarla: entonces está en lo más alto de su recorrido.',
    };
  } else {
    const b = bodyIn(scene, t.id);
    alt = b.alt;
    az = b.az;
    if (b.kind === 'sun') {
      f = {
        tipo: 'Estrella', nombre: b.name, sub: 'La que hace el día',
        rows: [['Distancia', `${num(b.distance, 4)} UA`], ...times(t, sky, place, HORIZON.sun)],
        note: 'No la mires nunca directamente, ni con prismáticos ni con telescopio.',
      };
    } else if (b.kind === 'moon') {
      const ph = scene.moon.phase;
      f = {
        tipo: 'Satélite', nombre: b.name, sub: ph.name,
        rows: [
          ['Iluminada', `${Math.round(ph.illuminated * 100)} %`],
          ['Edad', `${num(ph.age, 1)} días`],
          ['Distancia', `${Math.round(b.distance).toLocaleString('es-ES')} km`],
          ...times(t, sky, place, HORIZON.moon),
        ],
      };
    } else {
      f = {
        tipo: 'Planeta', nombre: b.name, sub: b.mag < 6 ? 'Visible a simple vista' : 'Solo con telescopio',
        rows: [
          ['Magnitud', num(b.mag, 1)],
          ['Distancia', `${num(b.distance, 2)} UA, ${Math.round((b.distance * 149.5978707)).toLocaleString('es-ES')} millones de km`],
          ['Luz', `tarda ${luz(b.distance)} en llegar`],
          ...times(t, sky, place, HORIZON.star),
        ],
      };
    }
  }
  const pos = alt > 0
    ? `Ahora está ${direction(az)}, ${height(alt)}: ${num(alt + refraction(alt), 0)}° de altura, acimut ${num(az, 0)}°.`
    : `Ahora está bajo el horizonte (${num(alt, 0)}°).`;
  const { note, ...rest } = f;
  return { ...rest, relato: note ? `${pos} ${note}` : pos };
}

/** Escribe la ficha en su sección, o la esconde si no hay nada elegido. */
export function renderFicha(el: HTMLElement, f: Ficha | null, select: (t: Target | null) => void) {
  if (!f) { el.hidden = true; return; }
  const extra = f.constellation
    ? `<button type="button" class="enlace ver-con" data-con="${f.constellation.index}">Ver la constelación de ${f.constellation.name}</button>`
    : '';
  el.hidden = false;
  el.innerHTML = `
    <header>
      <div><p class="tipo"></p><h2 id="ficha-nombre" tabindex="-1"></h2><p class="sub"></p></div>
      <button type="button" class="cerrar" aria-label="Cerrar la ficha">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" /></svg>
      </button>
    </header>
    <p class="relato">${f.relato}</p>
    <dl>${f.rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>
    ${extra}`;
  el.querySelector('.tipo')!.textContent = f.tipo;
  el.querySelector('h2')!.textContent = f.nombre;
  el.querySelector('.sub')!.textContent = f.sub;
  el.querySelector('.cerrar')!.addEventListener('click', () => select(null));
  el.querySelector<HTMLButtonElement>('.ver-con')?.addEventListener('click', () =>
    select({ kind: 'con', index: f.constellation!.index }));
}

const luz = (au: number) => {
  const min = (au * 499.004784) / 60;
  return min < 60 ? `${Math.round(min)} minutos` : `${num(min / 60, 1)} horas`;
};

/** Índice B−V a un color aproximado de cuerpo negro, solo para la muestra de la ficha. */
function bvToCss(bv: number): string {
  const t = Math.max(0, Math.min(1, (bv + 0.3) / 2.1));
  const stops = [[155, 176, 255], [202, 215, 255], [255, 244, 234], [255, 210, 161], [255, 160, 96]];
  const x = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgb(${c.join(' ')})`;
}
