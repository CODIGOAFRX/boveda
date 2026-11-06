// «Grabar lámina»: un PNG de imprenta de 2400 × 3200 px, con cartela, listo para un A4.
import { drawPlate, type Ink } from '../render/plate';
import type { Sky } from '../sky/scene';
import { clock, coords, inputValues, longDate, weekday, type Place } from './format';

const FONTS = ['96px "IM Fell English SC"', 'italic 46px "IM Fell English"', '36px "EB Garamond"', 'italic 30px "EB Garamond"'];

export async function engrave({ catalog, points, scene }: Sky, place: Place, ink: Ink): Promise<Blob | null> {
  // Si una letra no ha llegado aún, el canvas la cambia por otra sin avisar.
  await Promise.all(FONTS.map((f) => document.fonts.load(f)));
  const W = 2400;
  const Hh = 3200;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = Hh;
  const ctx = c.getContext('2d')!;
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
  ctx.font = FONTS[0];
  ctx.fillText('BÓVEDA', W / 2 + 12, 330);
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
  ctx.font = FONTS[1];
  ctx.fillText(`El cielo sobre ${place.name}`, W / 2, 420);

  const size = 2080;
  const off = document.createElement('canvas');
  off.width = off.height = size;
  drawPlate(off.getContext('2d')!, { size, scene, catalog, points, ink, selected: null, progress: 1, background: true, scale: 2.6 });
  ctx.drawImage(off, (W - size) / 2, 520);

  const { ms } = scene;
  ctx.font = 'italic 54px "IM Fell English"';
  const day = weekday(ms, place.tz);
  ctx.fillText(`${day[0].toUpperCase()}${day.slice(1)}, ${longDate(ms, place.tz)} · ${clock(ms, place.tz)}`, W / 2, 2760);
  ctx.font = FONTS[2];
  ctx.fillText(`${coords(place.lat, place.lon)} · ${scene.moon.phase.name}, ${Math.round(scene.moon.phase.illuminated * 100)} % iluminada`, W / 2, 2840);
  ctx.font = FONTS[3];
  ctx.fillText('Calculada y grabada en pedrogomez.dev/proyecto/boveda', W / 2, 2960);

  return new Promise((done) => c.toBlob(done, 'image/png'));
}

export function engravingName(place: Place, ms: number) {
  const { date, time } = inputValues(ms, place.tz);
  return `boveda-${place.id}-${date}-${time.replace(':', '')}.png`;
}
