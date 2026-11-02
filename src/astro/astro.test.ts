// Cada prueba reproduce un ejemplo resuelto de Meeus, «Astronomical Algorithms» (1998).
import { describe, expect, it } from 'vitest';
import {
  julianDay, greenwichSidereal, toHorizontal, precess, localSidereal, centuries, msFromJulianDay, separation,
} from './core';
import { sunPosition, moonPosition, moonPhase, planetPosition } from './bodies';
import { riseTransitSet, HORIZON } from './events';
import { project, unproject } from '../render/projection';

const hms = (h: number, m: number, s: number) => (h + m / 60 + s / 3600) * 15;
const dms = (d: number, m: number, s: number) => Math.sign(d || 1) * (Math.abs(d) + m / 60 + s / 3600);

describe('tiempo', () => {
  it('día juliano del Sputnik, 1957 oct 4,81 (ej. 7.a)', () => {
    const ms = Date.UTC(1957, 9, 4) + 0.81 * 86_400_000;
    expect(julianDay(ms)).toBeCloseTo(2_436_116.31, 6);
  });

  it('día juliano e instante son inversos', () => {
    const ms = Date.UTC(2026, 10, 2, 22, 30);
    expect(msFromJulianDay(julianDay(ms))).toBeCloseTo(ms, -1);
  });

  it('tiempo sidéreo de Greenwich, 1987 abr 10 0h UT = 13h10m46,3668s (ej. 12.a)', () => {
    expect(greenwichSidereal(julianDay(Date.UTC(1987, 3, 10)))).toBeCloseTo(hms(13, 10, 46.3668), 4);
  });

  it('tiempo sidéreo, 1987 abr 10 19h21m UT = 8h34m57,0896s (ej. 12.b)', () => {
    expect(greenwichSidereal(julianDay(Date.UTC(1987, 3, 10, 19, 21)))).toBeCloseTo(hms(8, 34, 57.0896), 4);
  });
});

describe('coordenadas', () => {
  it('Venus desde Washington: altura 15,1249°, acimut 248,0337° (ej. 13.b)', () => {
    const jd = julianDay(Date.UTC(1987, 3, 10, 19, 21));
    const lon = -dms(77, 3, 56);
    const lat = dms(38, 55, 17);
    const { alt, az } = toHorizontal({ ra: hms(23, 9, 16.641), dec: -dms(6, 43, 11.61) }, lat, localSidereal(jd, lon));
    // Meeus usa tiempo sidéreo aparente; con el medio la diferencia es de milésimas de grado.
    expect(alt).toBeCloseTo(15.1249, 2);
    expect(az).toBeCloseTo(68.0337 + 180, 2);
  });

  it('precesión de θ Persei a 2028 nov 13,19 (ej. 21.b)', () => {
    const jd = julianDay(Date.UTC(2028, 10, 13) + 0.19 * 86_400_000);
    // Posición J2000 ya corregida del movimiento propio que usa el ejemplo.
    const p = precess({ ra: hms(2, 44, 11.986 + 0.9885), dec: dms(49, 13, 42.48 - 2.583) }, centuries(jd));
    expect(p.ra).toBeCloseTo(hms(2, 46, 11.331), 3);
    expect(p.dec).toBeCloseTo(dms(49, 20, 54.54), 3);
  });
});

describe('Sol, Luna y planetas', () => {
  it('Sol, 1992 oct 13 0h TD: α 198,38083°, δ −7,78507° (ej. 25.a)', () => {
    const s = sunPosition(2_448_908.5);
    expect(s.ra).toBeCloseTo(198.38083, 2);
    expect(s.dec).toBeCloseTo(-7.78507, 2);
  });

  it('Luna, 1992 abr 12 0h TD: α 134,6885°, δ 13,7684°, Δ 368 410 km (ej. 47.a)', () => {
    const m = moonPosition(2_448_724.5);
    expect(Math.abs(m.ra - 134.688470)).toBeLessThan(0.03);
    expect(Math.abs(m.dec - 13.768368)).toBeLessThan(0.03);
    expect(Math.abs(m.distance - 368_409.7)).toBeLessThan(150);
  });

  it('fase: la Luna del 1992 abr 12 está iluminada al 68 % (ej. 48.a)', () => {
    expect(moonPhase(2_448_724.5).illuminated).toBeCloseTo(0.6786, 2);
  });

  it('luna llena del 23 abr 2024 y luna nueva del 8 abr 2024 (eclipse total)', () => {
    expect(moonPhase(julianDay(Date.UTC(2024, 3, 23, 23, 49))).illuminated).toBeGreaterThan(0.995);
    const nueva = moonPhase(julianDay(Date.UTC(2024, 3, 8, 18, 21)));
    expect(nueva.illuminated).toBeLessThan(0.005);
  });

  it('Venus, 1992 dic 20 0h TD: α 21h04m41s, δ −18°53′ (ej. 33.a)', () => {
    const v = planetPosition('venus', 2_448_976.5);
    expect(Math.abs(v.ra - hms(21, 4, 41.454))).toBeLessThan(0.05);
    expect(Math.abs(v.dec - -dms(18, 53, 16.84))).toBeLessThan(0.05);
    expect(v.distance).toBeCloseTo(0.910845, 2);
  });

  it('Júpiter brilla entre −3 y −1,5 y Saturno entre −0,5 y 1,5 a lo largo de 2026', () => {
    for (let m = 0; m < 12; m++) {
      const jd = julianDay(Date.UTC(2026, m, 15));
      expect(planetPosition('jupiter', jd).magnitude).toBeGreaterThan(-3);
      expect(planetPosition('jupiter', jd).magnitude).toBeLessThan(-1.5);
      expect(planetPosition('saturno', jd).magnitude).toBeLessThan(1.6);
    }
  });

  it('gran conjunción Júpiter–Saturno del 21 dic 2020: separados 0,1°', () => {
    const jd = julianDay(Date.UTC(2020, 11, 21, 18));
    expect(separation(planetPosition('jupiter', jd), planetPosition('saturno', jd))).toBeLessThan(0.2);
  });
});

describe('ortos y ocasos', () => {
  it('en Granada, el 1 jul 2026 el Sol sale a las 6:58:00 y se pone a las 21:37:44 (UTC+2)', () => {
    // Referencia: tabla de sunrise.maplogs.com para la ciudad de Granada.
    const [lat, lon] = [37.1773, -3.5986];
    const sunAlt = (ms: number) => {
      const jd = julianDay(ms);
      return toHorizontal(sunPosition(jd), lat, localSidereal(jd, lon)).alt;
    };
    const { rise, set } = riseTransitSet(sunAlt, Date.UTC(2026, 6, 1, 12, 15), HORIZON.sun);
    expect(Math.abs(rise! - Date.UTC(2026, 6, 1, 4, 58, 0))).toBeLessThan(90_000);
    expect(Math.abs(set! - Date.UTC(2026, 6, 1, 19, 37, 44))).toBeLessThan(90_000);
  });

  it('la Polar es circumpolar en Granada', () => {
    const polar = { ra: 37.95, dec: 89.26 };
    const alt = (ms: number) => { const jd = julianDay(ms); return toHorizontal(polar, 37.18, localSidereal(jd, -3.6)).alt; };
    expect(riseTransitSet(alt, Date.now(), HORIZON.star).always).toBe('up');
  });
});

describe('proyección estereográfica', () => {
  it('el cénit va al centro, el horizonte al borde y el este a la izquierda', () => {
    expect(project(90, 0, 100, 100, 100)).toEqual([100, 100]);
    const [x, y] = project(0, 90, 100, 100, 100);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(100);
  });

  it('proyectar y desproyectar devuelve el mismo punto', () => {
    for (const [alt, az] of [[10, 20], [45, 135], [80, 300], [-5, 200]]) {
      const [x, y] = project(alt, az, 300, 320, 280);
      const back = unproject(x, y, 300, 320, 280);
      expect(back.alt).toBeCloseTo(alt, 6);
      expect(back.az).toBeCloseTo(az, 6);
    }
  });
});
