// La regla de las horas: 24 h alrededor del instante elegido, sombreadas según la altura del Sol.
import { julianDay, localSidereal, toHorizontal } from '../astro/core';
import { sunPosition } from '../astro/bodies';
import type { Ink } from '../render/plate';
import { zoneOffset, type Place } from './format';

export const TIMELINE_SPAN = 24 * 3_600_000;

export function drawTimeline(canvas: HTMLCanvasElement, ms: number, place: Place, ink: Ink) {
  const dpr = canvas.width / (canvas.getBoundingClientRect().width || 1);
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width / dpr;
  const H = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const from = ms - TIMELINE_SPAN / 2;
  const x = (t: number) => ((t - from) / TIMELINE_SPAN) * W;
  const top = 14;
  const bottom = 38;

  // Sombra de la noche: más tinta cuanto más bajo está el Sol.
  const step = 3;
  for (let px = 0; px < W; px += step) {
    const t = from + (px / W) * TIMELINE_SPAN;
    const jd = julianDay(t);
    const alt = toHorizontal(sunPosition(jd), place.lat, localSidereal(jd, place.lon)).alt;
    const dark = Math.max(0, Math.min(1, (0.8 - alt) / 18.8));
    if (dark <= 0) continue;
    ctx.globalAlpha = dark * 0.55;
    ctx.fillStyle = ink.ink;
    ctx.fillRect(px, top, step + 0.5, bottom - top);
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = ink.ink;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, top + 0.5, W - 1, bottom - top);

  // Horas de reloj del lugar, con su horario de verano.
  const off = zoneOffset(ms, place.tz) * 60_000;
  const firstHour = Math.ceil((from + off) / 3_600_000) * 3_600_000 - off;
  ctx.fillStyle = ink.ink;
  ctx.font = '12px "EB Garamond", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.beginPath();
  for (let t = firstHour; t < from + TIMELINE_SPAN; t += 3_600_000) {
    const hour = new Date(t + off).getUTCHours();
    const px = Math.round(x(t)) + 0.5;
    const len = hour % 6 === 0 ? 8 : 4;
    ctx.moveTo(px, bottom);
    ctx.lineTo(px, bottom - len);
    ctx.moveTo(px, top);
    ctx.lineTo(px, top + len);
    if (hour % 3 === 0 && W > 360) ctx.fillText(String(hour), px, bottom + 4);
    else if (hour % 6 === 0) ctx.fillText(String(hour), px, bottom + 4);
  }
  ctx.stroke();

  // La aguja fija marca el instante de la lámina.
  const cx = Math.round(W / 2) + 0.5;
  ctx.strokeStyle = ink.accent;
  ctx.fillStyle = ink.accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, 6);
  ctx.lineTo(cx, bottom + 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 5, 2);
  ctx.lineTo(cx + 5, 2);
  ctx.lineTo(cx, 9);
  ctx.closePath();
  ctx.fill();
}
