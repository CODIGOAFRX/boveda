// El grabado. Todo se dibuja con tinta sobre papel: trazos, tramas y letra de imprenta.
import { project } from './projection';
import { fromUnit, sunDarkness, type Body, type Catalog, type Points, type Scene } from '../sky/scene';

export interface Ink {
  paper: string;
  ink: string;
  accent: string;
  /** Opacidad máxima del lavado nocturno sobre el disco. */
  night: number;
}

export type Target =
  | { kind: 'star'; index: number }
  | { kind: 'body'; id: string }
  | { kind: 'con'; index: number };

export interface Hit { x: number; y: number; r: number; target: Target }

export interface PlateOptions {
  size: number;
  scene: Scene;
  catalog: Catalog;
  points: Points;
  ink: Ink;
  selected: Target | null;
  /** 0 → 1 mientras la lámina se entinta al cargar. */
  progress: number;
  /** Rellenar el fondo (exportación) o dejarlo transparente (pantalla). */
  background: boolean;
  /** Escala de letra y trazo; la exportación la sube. */
  scale: number;
  /**
   * Capas para carteles animados: 'frame' es solo el aro graduado y 'sky' solo el cielo,
   * dibujado hasta `reach` radios del horizonte para poder girarlo sin que aparezcan huecos.
   */
  layers?: 'all' | 'frame' | 'sky';
  reach?: number;
}

const FELL = '"IM Fell English", "EB Garamond", Georgia, serif';
const FELL_SC = '"IM Fell English SC", "IM Fell English", Georgia, serif';

const patterns = new Map<string, CanvasPattern>();
function hatch(ctx: CanvasRenderingContext2D, color: string, angle: number, gap: number, width: number) {
  const key = `${color}|${angle}|${gap}|${width}`;
  let p = patterns.get(key);
  if (!p) {
    const s = Math.round(gap * 8);
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d')!;
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = 'square';
    for (let k = -s; k <= 2 * s; k += gap) {
      g.beginPath();
      if (angle > 0) { g.moveTo(k, 0); g.lineTo(k + s, s); } else { g.moveTo(k + s, 0); g.lineTo(k, s); }
      g.stroke();
    }
    p = ctx.createPattern(c, 'repeat')!;
    patterns.set(key, p);
  }
  return p;
}

export function drawPlate(ctx: CanvasRenderingContext2D, o: PlateOptions): Hit[] {
  const { size, scene, catalog, points, ink, selected, progress, scale: k } = o;
  // La letra no baja de un cuerpo legible aunque la lámina sea pequeña.
  const f = Math.max(k, 1);
  // En láminas pequeñas (móvil) solo se rotulan las figuras y estrellas principales.
  const compact = size / k < 520;
  const cx = size / 2;
  const cy = size / 2;
  const band = size * 0.075;
  const R = size / 2 - band - 6 * k;
  const P = (alt: number, az: number) => project(alt, az, cx, cy, R);
  const hits: Hit[] = [];
  const ease = (a: number, b: number) => Math.max(0, Math.min(1, (progress - a) / (b - a)));
  const layers = o.layers ?? 'all';
  const reach = o.reach ?? 1;
  // Con el cielo extendido también se dibuja lo que está bajo el horizonte.
  const minAlt = reach > 1 ? -75 : -2;

  ctx.save();
  ctx.clearRect(0, 0, size, size);
  if (o.background) {
    ctx.fillStyle = ink.paper;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (layers !== 'sky') drawFrame(ctx, cx, cy, R, band, ink, k, ease(0, 0.35));
  if (layers === 'frame') {
    ctx.restore();
    return hits;
  }

  // Lavado de la noche: el disco se oscurece a medida que el Sol baja de 0° a −18°.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R * reach, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalAlpha = sunDarkness(scene.sun.alt) * ink.night;
  ctx.fillStyle = ink.ink;
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 1;

  // Vía Láctea: cada nivel de brillo añade una pasada de trama, como en una plancha de cobre.
  const mwAngles = [1, -1, 1, -1, 1];
  const mwGaps = [7, 7, 5, 4, 3.4];
  ctx.globalAlpha = 0.85 * ease(0.15, 0.6);
  points.milkyWay.forEach((rings, lvl) => {
    ctx.beginPath();
    for (const ring of rings) {
      ring.forEach((i, j) => {
        const [x, y] = P(scene.alt[i], scene.az[i]);
        if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
    ctx.fillStyle = hatch(ctx, ink.ink, mwAngles[lvl], mwGaps[lvl] * k, 0.55 * k);
    ctx.fill('evenodd');
  });
  ctx.globalAlpha = 1;

  // Círculos de altura, ecuador y eclíptica.
  ctx.strokeStyle = ink.ink;
  ctx.lineWidth = 0.5 * k;
  ctx.globalAlpha = 0.45 * ease(0.1, 0.4);
  ctx.setLineDash([1 * k, 4 * k]);
  for (const a of [30, 60]) {
    ctx.beginPath();
    ctx.arc(cx, cy, R * Math.tan(((90 - a) * Math.PI) / 360), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(cx - 5 * k, cy); ctx.lineTo(cx + 5 * k, cy);
  ctx.moveTo(cx, cy - 5 * k); ctx.lineTo(cx, cy + 5 * k);
  ctx.stroke();

  ctx.globalAlpha = 0.4 * ease(0.2, 0.5);
  polyline(ctx, scene.equator, P);
  ctx.stroke();
  ctx.globalAlpha = 0.75 * ease(0.2, 0.5);
  ctx.lineWidth = 0.8 * k;
  ctx.setLineDash([6 * k, 3 * k]);
  polyline(ctx, scene.ecliptic, P);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // Figuras: líneas de constelación.
  const selCon = selected?.kind === 'con' ? selected.index : -1;
  const selStarCon = selected?.kind === 'star' ? catalog.names[catalog.stars[selected.index][4]]?.[2] : undefined;
  catalog.constellations.forEach((c, ci) => {
    const on = ci === selCon || c.id === selStarCon;
    ctx.strokeStyle = on ? ink.accent : ink.ink;
    ctx.lineWidth = (on ? 1.4 : 0.7) * k;
    ctx.globalAlpha = (on ? 1 : 0.6) * ease(0.3, 0.7);
    ctx.beginPath();
    for (const line of points.lines[ci]) {
      line.forEach((i, j) => {
        const [x, y] = P(scene.alt[i], scene.az[i]);
        if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
    }
    ctx.stroke();
  });
  ctx.globalAlpha = 1;

  // Estrellas, de la más débil a la más brillante para que las grandes queden encima.
  const shown = Math.floor(points.nStars * ease(0.25, 0.95));
  for (let i = shown - 1; i >= 0; i--) {
    const alt = scene.alt[i];
    if (alt < minAlt) continue;
    const mag = catalog.stars[i][2];
    const [x, y] = P(alt, scene.az[i]);
    const r = Math.max(0.5, (6.3 - mag) * 0.58) * k * (size / (900 * k)) ** 0.5;
    star(ctx, x, y, r, mag, ink);
    const named = catalog.names[catalog.stars[i][4]];
    if (alt > 0 && (mag < 4.2 || named?.[0])) hits.push({ x, y, r: Math.max(r + 4 * k, 9 * k), target: { kind: 'star', index: i } });
  }

  // Planetas, Luna y Sol.
  for (const p of scene.planets) {
    if (p.alt < minAlt) continue;
    const [x, y] = P(p.alt, p.az);
    planet(ctx, x, y, p, ink, k);
    hits.push({ x, y, r: 12 * k, target: { kind: 'body', id: p.id } });
  }
  if (scene.moon.alt > minAlt - 1) {
    const [x, y] = P(scene.moon.alt, scene.moon.az);
    const toward = fromUnit(scene.moon.limb);
    const [lx, ly] = P(toward.alt, toward.az);
    moon(ctx, x, y, 9 * k, scene.moon.phase.illuminated, Math.atan2(ly - y, lx - x), ink, k);
    hits.push({ x, y, r: 14 * k, target: { kind: 'body', id: 'luna' } });
  }
  if (scene.sun.alt > minAlt - 1 && reach === 1) {
    const [x, y] = P(scene.sun.alt, scene.sun.az);
    sun(ctx, x, y, 8 * k, ink, k);
    hits.push({ x, y, r: 16 * k, target: { kind: 'body', id: 'sol' } });
  }

  // Rótulos, evitando que se pisen.
  const taken: [number, number, number, number][] = [];
  const free = (x: number, y: number, w: number, h: number) =>
    !taken.some(([a, b, c, d]) => x < a + c && x + w > a && y < b + d && y + h > b) && (taken.push([x, y, w, h]), true);
  ctx.globalAlpha = ease(0.55, 1);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const label =(text: string, x: number, y: number, font: string, color: string, dx = 0, center = false, spacing = 0) => {
    ctx.font = font;
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${spacing}px`;
    const w = ctx.measureText(text).width;
    const h = parseFloat(font) * 1.1;
    const lx = center ? x - w / 2 : x + dx;
    if (Math.hypot(lx + w / 2 - cx, y - cy) > R * reach - 4 * k || !free(lx, y - h / 2, w, h)) return null;
    // Un filete de papel alrededor de la letra la separa de las tramas y las líneas.
    ctx.strokeStyle = ink.paper;
    ctx.lineWidth = 3 * k;
    ctx.strokeText(text, lx, y);
    ctx.fillStyle = color;
    ctx.fillText(text, lx, y);
    return { lx, w, h };
  };

  // Primero lo que importa: el objeto seleccionado, Luna y planetas, después estrellas y constelaciones.
  for (const p of [scene.moon, ...scene.planets]) {
    if (p.alt < minAlt + 3) continue;
    const [x, y] = P(p.alt, p.az);
    const on = selected?.kind === 'body' && selected.id === p.id;
    label(p.name, x, y, `italic ${12.5 * f}px ${FELL}`, on ? ink.accent : ink.ink, 12 * k);
  }
  for (let i = 0; i < Math.min(shown, 120); i++) {
    const named = catalog.names[catalog.stars[i][4]];
    if (!named?.[0] || scene.alt[i] < minAlt + 4 || catalog.stars[i][2] > (compact ? 1.2 : 1.9)) continue;
    const [x, y] = P(scene.alt[i], scene.az[i]);
    const on = selected?.kind === 'star' && selected.index === i;
    label(named[0], x, y, `italic ${11.5 * f}px ${FELL}`, on ? ink.accent : ink.ink, 7 * k);
  }
  catalog.constellations.forEach((c, ci) => {
    const li = points.labels[ci];
    if (scene.alt[li] < minAlt + 6 || (compact && c.rank > 1)) return;
    const [x, y] = P(scene.alt[li], scene.az[li]);
    const on = ci === selCon || c.id === selStarCon;
    const sz = (c.rank === 1 ? 12 : c.rank === 2 ? 10.5 : 9.5) * f;
    const placed = label(c.es.toUpperCase(), x, y, `${sz}px ${FELL_SC}`, on ? ink.accent : ink.ink, 0, true, 1.6 * k);
    if (placed) hits.push({ x, y, r: Math.max(placed.w / 2, 10 * k), target: { kind: 'con', index: ci } });
  });
  // La eclíptica lleva su nombre donde cruza más alto.
  const top = scene.ecliptic.reduce((b, p) => (p[0] > b[0] ? p : b));
  if (top[0] > 12) {
    const [x, y] = P(top[0], top[1]);
    label('Eclíptica', x, y + 9 * k, `italic ${10.5 * f}px ${FELL}`, ink.ink, 0, true, 0.5 * k);
  }
  ctx.restore();

  // Selección: un anillo de tinta roja, como las anotaciones a mano de un ejemplar usado.
  if (selected && selected.kind !== 'con') {
    const h = hits.find((t) => sameTarget(t.target, selected));
    if (h) {
      ctx.strokeStyle = ink.accent;
      ctx.lineWidth = 1.3 * k;
      ctx.beginPath();
      ctx.arc(h.x, h.y, Math.max(11 * k, h.r * 0.9), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
  return hits;
}

export const sameTarget = (a: Target | null, b: Target | null) =>
  !!a && !!b && a.kind === b.kind &&
  (a.kind === 'body' ? a.id === (b as typeof a).id : a.index === (b as { index: number }).index);

function polyline(ctx: CanvasRenderingContext2D, pts: [number, number][], P: (a: number, z: number) => [number, number]) {
  ctx.beginPath();
  pts.forEach(([alt, az], j) => {
    const [x, y] = P(alt, az);
    if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, mag: number, ink: Ink) {
  // Un anillo de papel corta las líneas que pasan por debajo, como hace el grabador.
  ctx.fillStyle = ink.paper;
  ctx.beginPath();
  ctx.arc(x, y, r + Math.max(0.8, r * 0.35), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ink.ink;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (mag < 1.5) {
    // Las de primera magnitud llevan rayos, como en Bayer y Hevelius.
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = Math.max(0.6, r * 0.22);
    ctx.beginPath();
    for (let a = 0; a < 8; a++) {
      const L = a % 2 === 0 ? r * 2.3 : r * 1.6;
      const t = (a * Math.PI) / 4;
      ctx.moveTo(x + Math.cos(t) * r * 1.15, y + Math.sin(t) * r * 1.15);
      ctx.lineTo(x + Math.cos(t) * L, y + Math.sin(t) * L);
    }
    ctx.stroke();
  }
}

function planet(ctx: CanvasRenderingContext2D, x: number, y: number, p: Body, ink: Ink, k: number) {
  const r = Math.max(2.6, 4.6 - p.mag * 0.55) * k;
  ctx.fillStyle = ink.paper;
  ctx.beginPath();
  ctx.arc(x, y, r + 2.5 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ink.ink;
  ctx.fillStyle = ink.ink;
  ctx.lineWidth = 1 * k;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.38, 0, Math.PI * 2);
  ctx.fill();
  if (p.id === 'saturno') {
    ctx.beginPath();
    ctx.ellipse(x, y, r * 2, r * 0.7, -0.4, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function moon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, k: number, limb: number, ink: Ink, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(limb);
  ctx.fillStyle = ink.paper;
  ctx.beginPath();
  ctx.arc(0, 0, r + 2.5 * s, 0, Math.PI * 2);
  ctx.fill();
  // Parte en sombra: trama cruzada. Parte iluminada: papel.
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = hatch(ctx, ink.ink, 1, 2.2 * s, 0.7 * s);
  ctx.fillRect(-r, -r, 2 * r, 2 * r);
  ctx.fillStyle = hatch(ctx, ink.ink, -1, 2.2 * s, 0.7 * s);
  ctx.fillRect(-r, -r, 2 * r, 2 * r);
  // El terminador es una semielipse: su semieje varía con la fracción iluminada.
  ctx.fillStyle = ink.paper;
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
  ctx.ellipse(0, 0, Math.abs(1 - 2 * k) * r, r, 0, Math.PI / 2, -Math.PI / 2, k < 0.5);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = ink.ink;
  ctx.lineWidth = 1 * s;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function sun(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ink: Ink, k: number) {
  ctx.fillStyle = ink.paper;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ink.ink;
  ctx.lineWidth = 1 * k;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = ink.ink;
  ctx.fill();
  ctx.beginPath();
  for (let a = 0; a < 16; a++) {
    const t = (a * Math.PI) / 8;
    const L = a % 2 ? r * 1.7 : r * 2.2;
    ctx.moveTo(x + Math.cos(t) * r * 1.25, y + Math.sin(t) * r * 1.25);
    ctx.lineTo(x + Math.cos(t) * L, y + Math.sin(t) * L);
  }
  ctx.stroke();
}

const CARDINALS: [number, string][] = [[0, 'Septentrión'], [90, 'Oriente'], [180, 'Mediodía'], [270, 'Occidente']];
const MINOR: [number, string][] = [[45, 'NE'], [135, 'SE'], [225, 'SO'], [315, 'NO']];

function drawFrame(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, band: number, ink: Ink, k: number, t: number) {
  ctx.save();
  ctx.globalAlpha = t;
  ctx.strokeStyle = ink.ink;
  ctx.fillStyle = ink.ink;
  const ring = (r: number, w: number) => {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  };
  ring(R, 1.6 * k);
  ring(R + band * 0.32, 0.6 * k);
  ring(R + band * 0.92, 2.2 * k);
  ring(R + band * 0.92 + 4 * k, 0.6 * k);

  // Graduación del horizonte: un trazo por grado.
  ctx.beginPath();
  for (let a = 0; a < 360; a++) {
    const len = a % 10 === 0 ? 0.32 : a % 5 === 0 ? 0.2 : 0.11;
    const [x0, y0] = project(0, a, cx, cy, R);
    const [x1, y1] = project(0, a, cx, cy, R + band * len);
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  }
  ctx.lineWidth = 0.6 * k;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const along = (az: number, r: number, text: string, font: string, spacing: number) => {
    ctx.save();
    const [x, y] = project(0, az, cx, cy, r);
    ctx.translate(x, y);
    // El rótulo sigue el aro y se lee siempre de pie.
    let rot = Math.atan2(y - cy, x - cx) + Math.PI / 2;
    if (az > 90 && az < 270) rot += Math.PI;
    ctx.rotate(rot);
    ctx.font = font;
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${spacing}px`;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };
  for (let a = 10; a < 360; a += 10) {
    if (a % 90 === 0 || a % 45 === 0) continue;
    along(a, R + band * 0.48, String(a), `${8 * k}px ${FELL}`, 0);
  }
  for (const [a, s] of MINOR) along(a, R + band * 0.62, s, `${9.5 * k}px ${FELL_SC}`, 2 * k);
  for (const [a, s] of CARDINALS) along(a, R + band * 0.62, s.toUpperCase(), `${12.5 * k}px ${FELL_SC}`, 3.2 * k);
  ctx.restore();
}
