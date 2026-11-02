// Ortos, culminaciones y ocasos buscando cruces de altura por muestreo y bisección.
// Es más lento que las fórmulas cerradas, pero vale igual para estrellas, Sol, Luna y planetas.

export type AltitudeAt = (ms: number) => number;

export interface RiseSet {
  rise: number | null;
  transit: number | null;
  set: number | null;
  /** 'up' si no se pone en el intervalo, 'down' si no llega a salir. */
  always: 'up' | 'down' | null;
}

const STEP = 10 * 60_000;

function bisect(f: AltitudeAt, h0: number, a: number, b: number): number {
  let fa = f(a) - h0;
  for (let k = 0; k < 22; k++) {
    const m = (a + b) / 2;
    const fm = f(m) - h0;
    if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else b = m;
  }
  return (a + b) / 2;
}

/** Busca, en las 24 h que rodean a `center`, el orto, la culminación y el ocaso más próximos. */
export function riseTransitSet(f: AltitudeAt, center: number, h0: number): RiseSet {
  const from = center - 12 * 3_600_000;
  const n = (24 * 3_600_000) / STEP;
  const samples: number[] = [];
  for (let k = 0; k <= n; k++) samples.push(f(from + k * STEP));

  let rise: number | null = null;
  let set: number | null = null;
  let best = -Infinity;
  let transit: number | null = null;
  const closer = (cur: number | null, t: number) => (cur === null || Math.abs(t - center) < Math.abs(cur - center) ? t : cur);

  for (let k = 0; k < n; k++) {
    const a = samples[k] - h0;
    const b = samples[k + 1] - h0;
    const t = from + k * STEP;
    if (a < 0 && b >= 0) rise = closer(rise, bisect(f, h0, t, t + STEP));
    if (a >= 0 && b < 0) set = closer(set, bisect(f, h0, t, t + STEP));
    if (k > 0 && samples[k] >= samples[k - 1] && samples[k] >= samples[k + 1] && samples[k] > best) {
      // Parábola por las tres muestras para afinar el máximo.
      const [y0, y1, y2] = [samples[k - 1], samples[k], samples[k + 1]];
      const den = y0 - 2 * y1 + y2;
      const off = den === 0 ? 0 : (0.5 * (y0 - y2)) / den;
      best = samples[k];
      transit = t + off * STEP;
    }
  }
  const allUp = samples.every((s) => s >= h0);
  const allDown = samples.every((s) => s < h0);
  return { rise, transit, set, always: allUp ? 'up' : allDown ? 'down' : null };
}

/** Altura estándar del horizonte: refracción y, para Sol y Luna, semidiámetro y paralaje. */
export const HORIZON = { star: -0.5667, sun: -0.8333, moon: 0.125 };
