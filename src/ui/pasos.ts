// «Cómo se calcula un cielo»: los seis pasos con los números de lo elegido. Una constelación no tiene un
// punto que calcular, así que con ella (o sin nada elegido) se enseña Sirio.
import { toHorizontal } from '../astro/core';
import { project } from '../render/projection';
import { bodyIn, starOfDate, type Sky, type Target } from '../sky/scene';
import { clock, num, sexagesimal, type Place } from './format';

const SIRIO_HIP = 32349;

export interface Pasos { name: string; steps: [titulo: string, formula: string, valor: string][] }

/** `R` es el radio del cielo en la lámina de la pantalla, para dar la posición en píxeles. */
export function pasos(selected: Target | null, sky: Sky, place: Place, R: number): Pasos {
  const { catalog, scene } = sky;
  const t: Exclude<Target, { kind: 'con' }> = selected && selected.kind !== 'con'
    ? selected
    : { kind: 'star', index: catalog.stars.findIndex((s) => s[4] === SIRIO_HIP) };
  let name: string;
  let ofDate: { ra: number; dec: number };
  if (t.kind === 'star') {
    const s = catalog.stars[t.index];
    name = catalog.names[s[4]]?.[0] || `HIP ${s[4]}`;
    ofDate = starOfDate(catalog, t.index, scene.T);
  } else {
    const b = bodyIn(scene, t.id);
    name = b.name;
    ofDate = { ra: b.ra, dec: b.dec };
  }
  const { jd, lst, ms } = scene;
  const H = ((lst - ofDate.ra) % 360 + 540) % 360 - 180;
  const h = toHorizontal(ofDate, place.lat, lst);
  const [x, y] = project(h.alt, h.az, 0, 0, R);
  const star = t.kind === 'star';
  return {
    name,
    steps: [
      ['Del reloj al instante universal', `${clock(ms, place.tz)} en ${place.name} → UTC, con el horario de verano de esa fecha`, new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'],
      ['Día juliano', 'Días desde el mediodía del 1 de enero de 4713 a. C.', `JD ${jd.toFixed(5)}`],
      ['Tiempo sidéreo local', 'Qué parte del cielo cruza el meridiano: θ = 280,46° + 360,9856°·(JD − J2000) + λ', sexagesimal(lst, true)],
      [star ? 'Precesión de J2000 a la fecha' : 'Posición del astro', star ? 'El eje de la Tierra cabecea: ζ, z y θ giran el catálogo de 2000 a hoy' : 'Kepler para los planetas, ELP-2000 para la Luna', `α ${sexagesimal(ofDate.ra, true)} · δ ${sexagesimal(ofDate.dec)}`],
      ['Ángulo horario y horizonte', 'sen h = sen φ sen δ + cos φ cos δ cos H', `H ${num(H, 2)}° → altura ${num(h.alt, 2)}°, acimut ${num(h.az, 2)}°`],
      ['Proyección estereográfica', 'ρ = R · tan((90° − h) / 2): conserva los ángulos de cada figura', h.alt > 0 ? `x ${num(x, 0)} px, y ${num(-y, 0)} px desde el cénit` : 'bajo el horizonte: fuera de la lámina'],
    ],
  };
}

export function renderPasos(list: HTMLElement, objeto: HTMLElement, p: Pasos) {
  objeto.textContent = p.name;
  list.innerHTML = p.steps.map(([a, f]) => `<li><h3>${a}</h3><p class="formula">${f}</p><p class="valor"></p></li>`).join('');
  list.querySelectorAll('.valor').forEach((el, i) => (el.textContent = p.steps[i][2]));
}
