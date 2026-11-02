import './styles.css';
import { localSidereal, julianDay, precess, centuries, refraction, toHorizontal, cos } from './astro/core';
import { moonPosition, planetPosition, sunPosition, type PlanetId } from './astro/bodies';
import { riseTransitSet, HORIZON } from './astro/events';
import { computeScene, flatten, twilight, type Catalog, type Scene, type Body } from './sky/scene';
import { drawPlate, sameTarget, type Hit, type Ink, type Target } from './render/plate';
import { project } from './render/projection';
import {
  PLACES, type Place, localZone, zonedToUtc, inputValues, clock, longDate, weekday, direction, height,
  num, sexagesimal, coords, temperature, starColor,
} from './ui/format';
import { drawTimeline, TIMELINE_SPAN } from './ui/timeline';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const plate = $<HTMLCanvasElement>('plate');
const timeline = $<HTMLCanvasElement>('timeline');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MIN_MS = Date.UTC(1800, 0, 1);
const MAX_MS = Date.UTC(2050, 11, 31, 23, 59);

// ——— Estado, siempre reflejado en la URL para que cada cielo se pueda compartir ———
interface State { ms: number; place: Place; selected: Target | null; playing: boolean }
const state: State = { ms: Date.now(), place: PLACES[0], selected: null, playing: false };

function readUrl() {
  const q = new URLSearchParams(location.search);
  const id = q.get('lugar');
  const lat = Number(q.get('lat'));
  const lon = Number(q.get('lon'));
  if (id && PLACES.some((p) => p.id === id)) state.place = PLACES.find((p) => p.id === id)!;
  else if (q.has('lat') && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    state.place = { id: 'aqui', name: q.get('nombre') || 'Tu ubicación', lat, lon, tz: q.get('tz') || localZone() };
  }
  const t = Date.parse(q.get('t') || '');
  if (!Number.isNaN(t)) state.ms = clampMs(t);
  const ver = q.get('ver');
  if (ver) state.selected = parseTarget(ver);
}

function writeUrl() {
  const q = new URLSearchParams();
  const p = state.place;
  if (p.id === 'aqui') {
    q.set('lat', p.lat.toFixed(3));
    q.set('lon', p.lon.toFixed(3));
    q.set('tz', p.tz);
  } else q.set('lugar', p.id);
  q.set('t', new Date(Math.round(state.ms / 60_000) * 60_000).toISOString().slice(0, 16) + 'Z');
  if (state.selected) q.set('ver', targetKey(state.selected));
  history.replaceState(null, '', `${location.pathname}?${q}`);
}

const clampMs = (ms: number) => Math.min(MAX_MS, Math.max(MIN_MS, ms));
const targetKey = (t: Target) =>
  t.kind === 'body' ? t.id : t.kind === 'star' ? `hip${catalog.stars[t.index][4]}` : catalog.constellations[t.index].id;
function parseTarget(key: string): Target | null {
  if (key.startsWith('hip')) {
    const i = catalog?.stars.findIndex((s) => s[4] === Number(key.slice(3)));
    return i >= 0 ? { kind: 'star', index: i } : null;
  }
  const c = catalog?.constellations.findIndex((x) => x.id === key) ?? -1;
  if (c >= 0) return { kind: 'con', index: c };
  return ['sol', 'luna', 'mercurio', 'venus', 'marte', 'jupiter', 'saturno', 'urano', 'neptuno'].includes(key)
    ? { kind: 'body', id: key } : null;
}

// ——— Carga ———
let catalog: Catalog;
let points: ReturnType<typeof flatten>;
let scene: Scene;
let hits: Hit[] = [];
let progress = reduceMotion ? 1 : 0;

async function boot() {
  const [data] = await Promise.all([
    fetch(`${import.meta.env.BASE_URL}data/sky.json`).then((r) => r.json() as Promise<Catalog>),
    document.fonts.load('16px "IM Fell English"'),
    document.fonts.load('italic 16px "IM Fell English"'),
    document.fonts.load('16px "IM Fell English SC"'),
  ]);
  catalog = data;
  points = flatten(catalog);
  const pending = new URLSearchParams(location.search).get('ver');
  readUrl();
  if (pending) state.selected = parseTarget(pending);
  fillPlaces();
  syncInputs();
  bindTheme();
  bindControls();
  bindPlate();
  bindTimeline();
  new ResizeObserver(() => { sizeCanvases(); render(); }).observe(plate.parentElement!);
  sizeCanvases();
  update();
  if (!reduceMotion) {
    const t0 = performance.now();
    const ink = (now: number) => {
      progress = Math.min(1, (now - t0) / 1600);
      render();
      if (progress < 1) requestAnimationFrame(ink);
    };
    requestAnimationFrame(ink);
  }
}

// ——— Dibujo ———
let inkCache: Ink | null = null;
function readInk(): Ink {
  if (inkCache) return inkCache;
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();
  return (inkCache = { paper: v('--paper'), ink: v('--ink'), accent: v('--accent'), night: Number(v('--night')) || 0 });
}

function sizeCanvases() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const s = plate.getBoundingClientRect().width;
  plate.width = plate.height = Math.round(s * dpr);
  const w = timeline.getBoundingClientRect().width;
  timeline.width = Math.round(w * dpr);
  timeline.height = Math.round(56 * dpr);
}

function render() {
  if (!scene) return;
  const dpr = plate.width / plate.getBoundingClientRect().width || 1;
  const ctx = plate.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const size = plate.width / dpr;
  if (size < 120) return;
  const k =Math.max(0.72, Math.min(1.15, size / 760));
  hits = drawPlate(ctx, { size, scene, catalog, points, ink: readInk(), selected: state.selected, progress, background: false, scale: k });
  drawTimeline(timeline, state.ms, state.place, readInk());
}

/** Recalcula la escena y todo lo que depende de ella. */
function update() {
  scene = computeScene(points, state.ms, state.place.lat, state.place.lon);
  render();
  scheduleText();
}

// El texto (lista, ficha, pasos, URL) no necesita ir a 60 fps mientras se arrastra.
let textTimer = 0;
function scheduleText() {
  clearTimeout(textTimer);
  textTimer = window.setTimeout(updateText, state.playing || dragging ? 120 : 0);
}
function updateText() {
  const { place, ms } = state;
  $('pie').textContent = `El cielo sobre ${place.name}, ${weekday(ms, place.tz)} ${longDate(ms, place.tz)}, a las ${clock(ms, place.tz)}`;
  timeline.setAttribute('aria-valuetext', `${clock(ms, place.tz)}, ${longDate(ms, place.tz)}`);
  if (!dragging && !state.playing) syncInputs();
  renderList();
  renderFicha();
  renderSteps();
  writeUrl();
}

// ——— Qué mirar ———
interface Visible { target: Target; name: string; alt: number; az: number; mag: number; note?: string }
function visibleNow(): Visible[] {
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

function renderList() {
  const { sun } = scene;
  const t = twilight(sun.alt);
  $('estado').textContent = sun.alt > -0.83
    ? `Es de día en ${state.place.name}: el Sol está ${num(sun.alt, 0)}° sobre el horizonte. Las estrellas siguen ahí, detrás de la luz.`
    : `${t[0].toUpperCase()}${t.slice(1)} en ${state.place.name}. ${sun.alt > -18 ? `El Sol está ${num(-sun.alt, 0)}° bajo el horizonte.` : 'Buen momento para mirar.'}`;
  const list = $('lista');
  list.replaceChildren(...visibleNow().map((v) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<span class="nombre"></span><span class="donde"></span><span class="mag"></span>`;
    b.querySelector('.nombre')!.textContent = v.name;
    b.querySelector('.donde')!.textContent = `${direction(v.az)}, ${height(v.alt)}${v.note ? ` · ${v.note}` : ''}`;
    b.querySelector('.mag')!.textContent = `mag ${num(v.mag, 1)}`;
    b.setAttribute('aria-current', String(sameTarget(v.target, state.selected)));
    b.addEventListener('click', () => select(v.target, true));
    li.append(b);
    return li;
  }));
  $('plate-desc').textContent =
    `Lámina del cielo sobre ${state.place.name} el ${longDate(state.ms, state.place.tz)} a las ${clock(state.ms, state.place.tz)}. ` +
    (list.children.length ? `Sobre el horizonte: ${visibleNow().map((v) => `${v.name} ${direction(v.az)}`).join('; ')}.` : '');
}

// ——— Ficha del objeto seleccionado ———
function select(t: Target | null, focusFicha = false) {
  state.selected = sameTarget(t, state.selected) ? null : t;
  render();
  updateText();
  if (focusFicha && state.selected) $('ficha').querySelector<HTMLElement>('h2')?.focus({ preventScroll: false });
}

function altitudeFn(t: Target): (ms: number) => number {
  const { lat, lon } = state.place;
  const at = (ms: number, eq: { ra: number; dec: number }) => toHorizontal(eq, lat, localSidereal(julianDay(ms), lon)).alt;
  if (t.kind === 'star') {
    const eq = precess({ ra: catalog.stars[t.index][0], dec: catalog.stars[t.index][1] }, scene.T);
    return (ms) => at(ms, eq);
  }
  if (t.kind === 'con') {
    const c = catalog.constellations[t.index];
    const eq = precess({ ra: c.at[0], dec: c.at[1] }, scene.T);
    return (ms) => at(ms, eq);
  }
  if (t.id === 'sol') return (ms) => at(ms, sunPosition(julianDay(ms)));
  if (t.id === 'luna') return (ms) => { const m = moonPosition(julianDay(ms)); const a = at(ms, m); return a - Math.asin(6378.14 / m.distance) * 57.2958 * cos(a); };
  return (ms) => at(ms, planetPosition(t.id as PlanetId, julianDay(ms)));
}

function timesFor(t: Target, h0: number) {
  const r = riseTransitSet(altitudeFn(t), state.ms, h0);
  const tz = state.place.tz;
  if (r.always === 'up') return [['Visibilidad', 'no se pone en todo el día']];
  if (r.always === 'down') return [['Visibilidad', 'no llega a salir']];
  return [
    ['Sale', r.rise ? clock(r.rise, tz) : '—'],
    ['Culmina', r.transit ? clock(r.transit, tz) : '—'],
    ['Se pone', r.set ? clock(r.set, tz) : '—'],
  ];
}

function renderFicha() {
  const el = $('ficha');
  const t = state.selected;
  $('ir-ficha').hidden = !t;
  if (!t) { el.hidden = true; return; }
  let tipo = '';
  let nombre = '';
  let sub = '';
  let rows: string[][] = [];
  let relato = '';
  let alt = 0;
  let az = 0;
  let extra = '';

  if (t.kind === 'star') {
    const [ra, dec, mag, bv, hip] = catalog.stars[t.index];
    const [name, bayer, con] = catalog.names[hip] || ['', '', ''];
    const c = catalog.constellations.find((x) => x.id === con);
    alt = scene.alt[t.index];
    az = scene.az[t.index];
    tipo = 'Estrella';
    nombre = name || (bayer && c ? `${bayer} ${c.gen}` : `HIP ${hip}`);
    sub = [bayer && c ? `${bayer} ${c.gen}` : '', c ? `en ${c.es}` : ''].filter((s) => s && s !== nombre).join(', ');
    const T = Math.round(temperature(bv) / 100) * 100;
    rows = [
      ['Magnitud', num(mag, 2)],
      ['Color', `<span class="muestra" style="background:${bvToCss(bv)}"></span>${starColor(bv)}, unos ${T.toLocaleString('es-ES')} K`],
      ['Ascensión recta', sexagesimal(ra, true)],
      ['Declinación', sexagesimal(dec)],
      ...timesFor(t, HORIZON.star),
      ['Catálogo', `Hipparcos ${hip}`],
    ];
    if (c) extra = `<button type="button" class="enlace ver-con" data-con="${catalog.constellations.indexOf(c)}">Ver la constelación de ${c.es}</button>`;
  } else if (t.kind === 'con') {
    const c = catalog.constellations[t.index];
    const li = points.labels[t.index];
    alt = scene.alt[li];
    az = scene.az[li];
    tipo = 'Constelación';
    nombre = c.es;
    sub = `${c.la}, genitivo ${c.gen}`;
    const brightest = catalog.stars.findIndex((s) => catalog.names[s[4]]?.[2] === c.id);
    const bName = brightest >= 0 ? catalog.names[catalog.stars[brightest][4]] : null;
    rows = [
      ...(bName ? [['Más brillante', `${bName[0] || `${bName[1]} ${c.gen}`} (mag ${num(catalog.stars[brightest][2], 1)})`]] : []),
      ...timesFor(t, 0),
    ];
    relato = 'La hora de culminación es la mejor para buscarla: entonces está en lo más alto de su recorrido.';
  } else {
    const b: Body = t.id === 'sol' ? scene.sun : t.id === 'luna' ? scene.moon : scene.planets.find((p) => p.id === t.id)!;
    alt = b.alt;
    az = b.az;
    nombre = b.name;
    if (b.kind === 'sun') {
      tipo = 'Estrella';
      sub = 'La que hace el día';
      rows = [['Distancia', `${num(b.distance, 4)} UA`], ...timesFor(t, HORIZON.sun)];
      relato = 'No la mires nunca directamente, ni con prismáticos ni con telescopio.';
    } else if (b.kind === 'moon') {
      const ph = scene.moon.phase;
      tipo = 'Satélite';
      sub = ph.name;
      rows = [
        ['Iluminada', `${Math.round(ph.illuminated * 100)} %`],
        ['Edad', `${num(ph.age, 1)} días`],
        ['Distancia', `${Math.round(b.distance).toLocaleString('es-ES')} km`],
        ...timesFor(t, HORIZON.moon),
      ];
    } else {
      tipo = 'Planeta';
      sub = b.mag < 6 ? 'Visible a simple vista' : 'Solo con telescopio';
      rows = [
        ['Magnitud', num(b.mag, 1)],
        ['Distancia', `${num(b.distance, 2)} UA, ${Math.round((b.distance * 149.5978707)).toLocaleString('es-ES')} millones de km`],
        ['Luz', `tarda ${luz(b.distance)} en llegar`],
        ...timesFor(t, HORIZON.star),
      ];
    }
  }
  const pos = alt > 0
    ? `Ahora está ${direction(az)}, ${height(alt)}: ${num(alt + refraction(alt), 0)}° de altura, acimut ${num(az, 0)}°.`
    : `Ahora está bajo el horizonte (${num(alt, 0)}°).`;

  el.hidden = false;
  el.innerHTML = `
    <header>
      <div><p class="tipo"></p><h2 id="ficha-nombre" tabindex="-1"></h2><p class="sub"></p></div>
      <button type="button" class="cerrar" aria-label="Cerrar la ficha">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" /></svg>
      </button>
    </header>
    <p class="relato">${pos}${relato ? ` ${relato}` : ''}</p>
    <dl>${rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>
    ${extra}`;
  el.querySelector('.tipo')!.textContent = tipo;
  el.querySelector('h2')!.textContent = nombre;
  el.querySelector('.sub')!.textContent = sub;
  el.querySelector('.cerrar')!.addEventListener('click', () => select(null));
  el.querySelector<HTMLButtonElement>('.ver-con')?.addEventListener('click', (e) =>
    select({ kind: 'con', index: Number((e.currentTarget as HTMLElement).dataset.con) }));
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

// ——— Cómo se calcula: los seis pasos con los números del objeto elegido ———
function renderSteps() {
  const t: Target = state.selected && state.selected.kind !== 'con' ? state.selected : siriusTarget();
  const jd = julianDay(state.ms);
  const lst = localSidereal(jd, state.place.lon);
  let name = 'Sirio';
  let ofDate = { ra: 0, dec: 0 };
  if (t.kind === 'star') {
    const s = catalog.stars[t.index];
    name = catalog.names[s[4]]?.[0] || `HIP ${s[4]}`;
    ofDate = precess({ ra: s[0], dec: s[1] }, centuries(jd));
  } else if (t.kind === 'body') {
    const b = t.id === 'sol' ? scene.sun : t.id === 'luna' ? scene.moon : scene.planets.find((p) => p.id === t.id)!;
    name = b.name;
    ofDate = { ra: b.ra, dec: b.dec };
  }
  const H = ((lst - ofDate.ra) % 360 + 540) % 360 - 180;
  const h = toHorizontal(ofDate, state.place.lat, lst);
  const plateSize = plate.getBoundingClientRect().width;
  const R = plateSize / 2 - plateSize * 0.075 - 6;
  const [x, y] = project(h.alt, h.az, 0, 0, R);
  $('calculo-objeto').textContent = name;
  const tz = state.place.tz;
  const steps: [string, string, string][] = [
    ['Del reloj al instante universal', `${clock(state.ms, tz)} en ${state.place.name} → UTC, con el horario de verano de esa fecha`, new Date(state.ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'],
    ['Día juliano', 'Días desde el mediodía del 1 de enero de 4713 a. C.', `JD ${jd.toFixed(5)}`],
    ['Tiempo sidéreo local', 'Qué parte del cielo cruza el meridiano: θ = 280,46° + 360,9856°·(JD − J2000) + λ', sexagesimal(lst, true)],
    [t.kind === 'star' ? 'Precesión de J2000 a la fecha' : 'Posición del astro', t.kind === 'star' ? 'El eje de la Tierra cabecea: ζ, z y θ giran el catálogo de 2000 a hoy' : 'Kepler para los planetas, ELP-2000 para la Luna', `α ${sexagesimal(ofDate.ra, true)} · δ ${sexagesimal(ofDate.dec)}`],
    ['Ángulo horario y horizonte', 'sen h = sen φ sen δ + cos φ cos δ cos H', `H ${num(H, 2)}° → altura ${num(h.alt, 2)}°, acimut ${num(h.az, 2)}°`],
    ['Proyección estereográfica', 'ρ = R · tan((90° − h) / 2): conserva los ángulos de cada figura', h.alt > 0 ? `x ${num(x, 0)} px, y ${num(-y, 0)} px desde el cénit` : 'bajo el horizonte: fuera de la lámina'],
  ];
  $('pasos').innerHTML = steps.map(([a, f]) => `<li><h3>${a}</h3><p class="formula">${f}</p><p class="valor"></p></li>`).join('');
  $('pasos').querySelectorAll('.valor').forEach((el, i) => (el.textContent = steps[i][2]));
}
let siriusIndex = -1;
const siriusTarget = (): Target => {
  if (siriusIndex < 0) siriusIndex = catalog.stars.findIndex((s) => s[4] === 32349);
  return { kind: 'star', index: siriusIndex };
};

// ——— Controles ———
function fillPlaces() {
  const sel = $<HTMLSelectElement>('lugar');
  const groups: [string, Place[]][] = [
    ['España', PLACES.filter((p) => p.tz === 'Europe/Madrid' || p.tz === 'Atlantic/Canary')],
    ['América', PLACES.filter((p) => p.tz.startsWith('America'))],
  ];
  sel.replaceChildren(...groups.map(([label, list]) => {
    const g = document.createElement('optgroup');
    g.label = label;
    g.append(...list.map((p) => new Option(p.name, p.id)));
    return g;
  }));
  if (state.place.id === 'aqui') sel.prepend(new Option(state.place.name, 'aqui'));
  sel.value = state.place.id;
}

function syncInputs() {
  const { date, time } = inputValues(state.ms, state.place.tz);
  $<HTMLInputElement>('fecha').value = date;
  $<HTMLInputElement>('hora').value = time;
  $('nota-lugar').textContent = `${coords(state.place.lat, state.place.lon)} · hora de ${state.place.tz.split('/').pop()!.replace(/_/g, ' ')}`;
}

function setTime(ms: number) {
  state.ms = clampMs(ms);
  update();
}

function fromInputs() {
  const d = $<HTMLInputElement>('fecha').value;
  const t = $<HTMLInputElement>('hora').value;
  if (!d || !t) return;
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  if (y < 1800 || y > 2050) return toast('Las órbitas que usa Bóveda solo son fiables entre 1800 y 2050.');
  setTime(zonedToUtc(y, mo, da, h, mi, state.place.tz));
}

function bindControls() {
  $('fecha').addEventListener('change', fromInputs);
  $('hora').addEventListener('change', fromInputs);
  $('lugar').addEventListener('change', (e) => {
    const id = (e.target as HTMLSelectElement).value;
    const p = PLACES.find((x) => x.id === id);
    if (p) { state.place = p; syncInputs(); update(); }
  });
  $('ahora').addEventListener('click', () => { setTime(Date.now()); syncInputs(); });
  $('reproducir').addEventListener('click', () => togglePlay());
  $('ubicar').addEventListener('click', locate);
  $('enlace').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      toast('Enlace copiado: quien lo abra verá este mismo cielo.');
    } catch {
      toast('No he podido copiar el enlace; cópialo de la barra de direcciones.');
    }
  });
  $('grabar').addEventListener('click', exportPlate);
  $('cartela').addEventListener('submit', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.key === 'Escape' && state.selected) select(null);
  });
}

function locate() {
  const btn = $<HTMLButtonElement>('ubicar');
  if (!('geolocation' in navigator)) return toast('Este navegador no permite conocer tu ubicación.');
  btn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    ({ coords: c }) => {
      btn.disabled = false;
      state.place = { id: 'aqui', name: 'Tu ubicación', lat: c.latitude, lon: c.longitude, tz: localZone() };
      fillPlaces();
      syncInputs();
      update();
    },
    () => {
      btn.disabled = false;
      toast('Sin permiso de ubicación. Elige un lugar de la lista.');
    },
    { maximumAge: 600_000, timeout: 10_000 },
  );
}

let playFrame = 0;
function togglePlay(force?: boolean) {
  state.playing = force ?? !state.playing;
  $('reproducir').setAttribute('aria-pressed', String(state.playing));
  cancelAnimationFrame(playFrame);
  if (!state.playing) { syncInputs(); scheduleText(); return; }
  let last = performance.now();
  const step = (now: number) => {
    // Una hora del cielo por cada segundo real.
    const dt = Math.min(64, now - last);
    last = now;
    if (state.ms + dt * 3600 >= MAX_MS) return togglePlay(false);
    setTime(state.ms + dt * 3600);
    playFrame = requestAnimationFrame(step);
  };
  playFrame = requestAnimationFrame(step);
}

// ——— Arrastrar el cielo: girar alrededor del polo es mover las horas ———
let dragging = false;
function bindPlate() {
  let start: { angle: number; ms: number; x: number; y: number } | null = null;
  let moved = false;
  const local = (e: PointerEvent) => {
    const r = plate.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const geometry = () => {
    const size = plate.getBoundingClientRect().width;
    const R = size / 2 - size * 0.075 - 6 * Math.max(0.72, Math.min(1.15, size / 760));
    const north = state.place.lat >= 0;
    const [px, py] = project(Math.abs(state.place.lat), north ? 0 : 180, size / 2, size / 2, R);
    return { size, R, px, py, north };
  };
  const hitAt = (x: number, y: number) => {
    let best: Hit | null = null;
    let bd = Infinity;
    for (const h of hits) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < h.r && d < bd) { best = h; bd = d; }
    }
    return best;
  };

  plate.addEventListener('pointerdown', (e) => {
    const [x, y] = local(e);
    const g = geometry();
    if (Math.hypot(x - g.size / 2, y - g.size / 2) > g.R + g.size * 0.075) return;
    plate.setPointerCapture(e.pointerId);
    start = { angle: Math.atan2(y - g.py, x - g.px), ms: state.ms, x, y };
    moved = false;
    if (state.playing) togglePlay(false);
  });
  plate.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    if (!start) {
      plate.classList.toggle('sobre', !!hitAt(x, y));
      return;
    }
    if (!moved && Math.hypot(x - start.x, y - start.y) < 5) return;
    moved = true;
    dragging = true;
    plate.classList.add('arrastrando');
    const g = geometry();
    let d = Math.atan2(y - g.py, x - g.px) - start.angle;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    // Visto desde abajo, el cielo boreal gira en sentido antihorario alrededor de la Polar.
    const sidereal = (g.north ? -d : d) * (12 / Math.PI) * 3_600_000;
    state.ms = clampMs(start.ms + sidereal * 0.9972696);
    start.angle += d;
    start.ms = state.ms;
    update();
  });
  const end = (e: PointerEvent) => {
    if (!start) return;
    const [x, y] = local(e);
    if (!moved) {
      const h = hitAt(x, y);
      select(h ? h.target : null);
    }
    start = null;
    dragging = false;
    plate.classList.remove('arrastrando');
    syncInputs();
    scheduleText();
  };
  plate.addEventListener('pointerup', end);
  plate.addEventListener('pointercancel', end);
  plate.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 3_600_000 : 600_000;
    if (e.key === 'ArrowRight') setTime(state.ms + step);
    else if (e.key === 'ArrowLeft') setTime(state.ms - step);
    else if (e.key === 'ArrowUp') setTime(state.ms + 86_400_000);
    else if (e.key === 'ArrowDown') setTime(state.ms - 86_400_000);
    else return;
    e.preventDefault();
  });
}

function bindTimeline() {
  let start: { x: number; ms: number } | null = null;
  timeline.addEventListener('pointerdown', (e) => {
    timeline.setPointerCapture(e.pointerId);
    start = { x: e.clientX, ms: state.ms };
    if (state.playing) togglePlay(false);
  });
  timeline.addEventListener('pointermove', (e) => {
    if (!start) return;
    dragging = true;
    const w = timeline.getBoundingClientRect().width;
    // Se arrastra la regla, no la aguja: hacia la izquierda avanza el tiempo.
    setTime(start.ms - ((e.clientX - start.x) / w) * TIMELINE_SPAN);
  });
  const end = () => { start = null; dragging = false; syncInputs(); scheduleText(); };
  timeline.addEventListener('pointerup', end);
  timeline.addEventListener('pointercancel', end);
  timeline.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 3_600_000 : 600_000;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setTime(state.ms + step);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setTime(state.ms - step);
    else if (e.key === 'PageUp') setTime(state.ms + 86_400_000);
    else if (e.key === 'PageDown') setTime(state.ms - 86_400_000);
    else return;
    e.preventDefault();
  });
}

function bindTheme() {
  const current = document.documentElement.dataset.theme || 'papel';
  document.querySelectorAll<HTMLInputElement>('input[name="tinta"]').forEach((r) => {
    r.checked = r.value === current;
    r.addEventListener('change', () => {
      document.documentElement.dataset.theme = r.value;
      try { localStorage.setItem('boveda:tinta', r.value); } catch { /* modo privado */ }
      inkCache = null;
      document.querySelector('meta[name="theme-color"]')!.setAttribute('content', readInk().paper);
      render();
    });
  });
}

let toastTimer = 0;
function toast(msg: string) {
  const el = $('aviso');
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('visible'), 3200);
}

// ——— Grabar lámina: un PNG de imprenta, con cartela ———
async function exportPlate() {
  const btn = $<HTMLButtonElement>('grabar');
  btn.disabled = true;
  const W = 2400;
  const Hh = 3200;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = Hh;
  const ctx = c.getContext('2d')!;
  const ink = readInk();
  ctx.fillStyle = ink.paper;
  ctx.fillRect(0, 0, W, Hh);
  // Huella de la plancha: doble filete, como el borde que deja el cobre al prensar.
  ctx.strokeStyle = ink.ink;
  ctx.lineWidth = 5;
  ctx.strokeRect(110, 110, W - 220, Hh - 220);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(130, 130, W - 260, Hh - 260);
  ctx.fillStyle = ink.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '24px';
  ctx.font = '96px "IM Fell English SC"';
  ctx.fillText('BÓVEDA', W / 2 + 12, 330);
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
  ctx.font = 'italic 46px "IM Fell English"';
  ctx.fillText(`El cielo sobre ${state.place.name}`, W / 2, 420);

  const size = 2080;
  const off = document.createElement('canvas');
  off.width = off.height = size;
  drawPlate(off.getContext('2d')!, { size, scene, catalog, points, ink, selected: null, progress: 1, background: true, scale: 2.6 });
  ctx.drawImage(off, (W - size) / 2, 520);

  const { place, ms } = state;
  ctx.font = 'italic 54px "IM Fell English"';
  const day = weekday(ms, place.tz);
  ctx.fillText(`${day[0].toUpperCase()}${day.slice(1)}, ${longDate(ms, place.tz)} · ${clock(ms, place.tz)}`, W / 2, 2760);
  ctx.font = '36px "EB Garamond"';
  ctx.fillStyle = ink.ink;
  ctx.fillText(`${coords(place.lat, place.lon)} · ${scene.moon.phase.name}, ${Math.round(scene.moon.phase.illuminated * 100)} % iluminada`, W / 2, 2840);
  ctx.font = 'italic 30px "EB Garamond"';
  ctx.fillText('Calculada y grabada en pedrogomez.dev/proyecto/boveda', W / 2, 2960);

  c.toBlob((blob) => {
    btn.disabled = false;
    if (!blob) return toast('No se ha podido grabar la lámina.');
    const a = document.createElement('a');
    const { date, time } = inputValues(ms, place.tz);
    a.download = `boveda-${place.id}-${date}-${time.replace(':', '')}.png`;
    a.href = URL.createObjectURL(blob);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('Lámina grabada: 2400 × 3200 px, lista para imprimir en A4.');
  }, 'image/png');
}

boot().catch((err) => {
  console.error(err);
  toast('No se ha podido cargar el catálogo de estrellas. Recarga la página.');
});

