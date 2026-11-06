import './styles.css';
import { VALID_YEARS } from './astro/bodies';
import { computeScene, flatten, sameTarget, type Catalog, type Points, type Scene, type Sky, type Target } from './sky/scene';
import { drawPlate, plateGeometry, type Hit, type Ink } from './render/plate';
import { project } from './render/projection';
import { PLACES, OWN_PLACE, ownPlace, type Place, zonedToUtc, inputValues, clock, longDate, weekday, coords } from './ui/format';
import { drawTimeline, TIMELINE_SPAN } from './ui/timeline';
import { readQuery, writeQuery } from './ui/url';
import { ficha, renderFicha } from './ui/ficha';
import { renderMirar } from './ui/mirar';
import { pasos, renderPasos } from './ui/pasos';
import { engrave, engravingName } from './ui/grabar';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const plate = $<HTMLCanvasElement>('plate');
const timeline = $<HTMLCanvasElement>('timeline');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const [FIRST_YEAR, LAST_YEAR] = VALID_YEARS;
const MIN_MS = Date.UTC(FIRST_YEAR, 0, 1);
const MAX_MS = Date.UTC(LAST_YEAR, 11, 31, 23, 59);
const clampMs = (ms: number) => Math.min(MAX_MS, Math.max(MIN_MS, ms));

// ——— Estado, siempre reflejado en la URL para que cada cielo se pueda compartir ———
interface State { ms: number; place: Place; selected: Target | null; playing: boolean }
const state: State = { ms: Date.now(), place: PLACES[0], selected: null, playing: false };

// ——— Carga ———
let catalog: Catalog;
let points: Points;
let scene: Scene;
let hits: Hit[] = [];
let progress = reduceMotion ? 1 : 0;
const sky = (): Sky => ({ catalog, points, scene });

async function boot() {
  const [data] = await Promise.all([
    fetch(`${import.meta.env.BASE_URL}data/sky.json`).then((r) => r.json() as Promise<Catalog>),
    document.fonts.load('16px "IM Fell English"'),
    document.fonts.load('italic 16px "IM Fell English"'),
    document.fonts.load('16px "IM Fell English SC"'),
  ]);
  catalog = data;
  points = flatten(catalog);
  const shared = readQuery(location.search, catalog);
  if (shared.place) state.place = shared.place;
  if (shared.ms !== undefined) state.ms = clampMs(shared.ms);
  if (shared.selected !== undefined) state.selected = shared.selected;
  const fecha = $<HTMLInputElement>('fecha');
  fecha.min = `${FIRST_YEAR}-01-01`;
  fecha.max = `${LAST_YEAR}-12-31`;
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

/** En pantalla, la letra y el trazo crecen con la lámina, sin quedarse ilegibles ni pasarse. */
const screenScale = (size: number) => Math.max(0.72, Math.min(1.15, size / 760));
function screenGeometry() {
  const size = plate.getBoundingClientRect().width;
  return { size, ...plateGeometry(size, screenScale(size)) };
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
  hits = drawPlate(ctx, { size, scene, catalog, points, ink: readInk(), selected: state.selected, progress, background: false, scale: screenScale(size) });
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
  const { place, ms, selected } = state;
  $('pie').textContent = `El cielo sobre ${place.name}, ${weekday(ms, place.tz)} ${longDate(ms, place.tz)}, a las ${clock(ms, place.tz)}`;
  timeline.setAttribute('aria-valuetext', `${clock(ms, place.tz)}, ${longDate(ms, place.tz)}`);
  if (!dragging && !state.playing) syncInputs();
  renderMirar({ estado: $('estado'), lista: $('lista'), descripcion: $('plate-desc') }, sky(), place, selected, (t) => select(t, true));
  $('ir-ficha').hidden = !selected;
  renderFicha($('ficha'), selected && ficha(selected, sky(), place), select);
  renderPasos($('pasos'), $('calculo-objeto'), pasos(selected, sky(), place, screenGeometry().R));
  history.replaceState(null, '', `${location.pathname}?${writeQuery(state, catalog)}`);
}

function select(t: Target | null, focusFicha = false) {
  state.selected = sameTarget(t, state.selected) ? null : t;
  render();
  updateText();
  if (focusFicha && state.selected) $('ficha').querySelector<HTMLElement>('h2')?.focus({ preventScroll: false });
}

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
  if (state.place.id === OWN_PLACE) sel.prepend(new Option(state.place.name, OWN_PLACE));
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
  if (y < FIRST_YEAR || y > LAST_YEAR) return toast(`Las órbitas que usa Bóveda solo son fiables entre ${FIRST_YEAR} y ${LAST_YEAR}.`);
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
      state.place = ownPlace(c.latitude, c.longitude);
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
    const g = screenGeometry();
    const north = state.place.lat >= 0;
    const [px, py] = project(Math.abs(state.place.lat), north ? 0 : 180, g.cx, g.cy, g.R);
    return { ...g, px, py, north };
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
    if (Math.hypot(x - g.cx, y - g.cy) > g.R + g.band) return;
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

async function exportPlate() {
  const btn = $<HTMLButtonElement>('grabar');
  btn.disabled = true;
  const now = sky();
  const { place } = state;
  const blob = await engrave(now, place, readInk());
  btn.disabled = false;
  if (!blob) return toast('No se ha podido grabar la lámina.');
  const a = document.createElement('a');
  a.download = engravingName(place, now.scene.ms);
  a.href = URL.createObjectURL(blob);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('Lámina grabada: 2400 × 3200 px, lista para imprimir en A4.');
}

boot().catch((err) => {
  console.error(err);
  toast('No se ha podido cargar el catálogo de estrellas. Recarga la página.');
});
