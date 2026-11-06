// «Ahora, sobre el horizonte»: cómo está el cielo y lo que merece la pena mirar, del más brillante al menos.
import { sameTarget, twilight, type Sky, type Target } from '../sky/scene';
import { clock, direction, height, longDate, num, type Place } from './format';

export interface Visible { target: Target; name: string; alt: number; az: number; mag: number; note?: string }

/** La Luna y los planetas sobre el horizonte y las seis estrellas con nombre más brillantes. */
export function visibleNow({ catalog, scene }: Sky): Visible[] {
  const out: Visible[] = [];
  const m = scene.moon;
  if (m.alt > 0) out.push({ target: { kind: 'body', id: 'luna' }, name: 'La Luna', alt: m.alt, az: m.az, mag: -12, note: `${m.phase.name.toLowerCase()}, ${Math.round(m.phase.illuminated * 100)} %` });
  for (const p of scene.planets) if (p.alt > 0 && p.mag < 6) out.push({ target: { kind: 'body', id: p.id }, name: p.name, alt: p.alt, az: p.az, mag: p.mag });
  let n = 0;
  for (let i = 0; i < catalog.stars.length && n < 6; i++) {
    const name = catalog.names[catalog.stars[i][4]]?.[0];
    if (!name || scene.alt[i] < 8) continue;
    out.push({ target: { kind: 'star', index: i }, name, alt: scene.alt[i], az: scene.az[i], mag: catalog.stars[i][2] });
    n++;
  }
  return out.sort((a, b) => a.mag - b.mag);
}

interface Targets { estado: HTMLElement; lista: HTMLElement; descripcion: HTMLElement }

export function renderMirar(
  els: Targets, sky: Sky, place: Place, selected: Target | null, select: (t: Target) => void,
) {
  const { sun, ms } = sky.scene;
  const t = twilight(sun.alt);
  els.estado.textContent = t === 'de día'
    ? `Es de día en ${place.name}: el Sol está ${num(sun.alt, 0)}° sobre el horizonte. Las estrellas siguen ahí, detrás de la luz.`
    : `${t[0].toUpperCase()}${t.slice(1)} en ${place.name}. ${sun.alt > -18 ? `El Sol está ${num(-sun.alt, 0)}° bajo el horizonte.` : 'Buen momento para mirar.'}`;
  const visible = visibleNow(sky);
  els.lista.replaceChildren(...visible.map((v) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<span class="nombre"></span><span class="donde"></span><span class="mag"></span>`;
    b.querySelector('.nombre')!.textContent = v.name;
    b.querySelector('.donde')!.textContent = `${direction(v.az)}, ${height(v.alt)}${v.note ? ` · ${v.note}` : ''}`;
    b.querySelector('.mag')!.textContent = `mag ${num(v.mag, 1)}`;
    b.setAttribute('aria-current', String(sameTarget(v.target, selected)));
    b.addEventListener('click', () => select(v.target));
    li.append(b);
    return li;
  }));
  els.descripcion.textContent =
    `Lámina del cielo sobre ${place.name} el ${longDate(ms, place.tz)} a las ${clock(ms, place.tz)}. ` +
    (visible.length ? `Sobre el horizonte: ${visible.map((v) => `${v.name} ${direction(v.az)}`).join('; ')}.` : '');
}
