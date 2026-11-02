import { describe, expect, it } from 'vitest';
import { zonedToUtc, zoneOffset, direction, sexagesimal, temperature } from './format';

describe('husos horarios', () => {
  it('Madrid en invierno va una hora por delante y en verano dos', () => {
    expect(zoneOffset(Date.UTC(2026, 0, 15), 'Europe/Madrid')).toBe(60);
    expect(zoneOffset(Date.UTC(2026, 6, 15), 'Europe/Madrid')).toBe(120);
  });

  it('las 22:00 del 2 nov 2026 en Granada son las 21:00 UTC', () => {
    expect(zonedToUtc(2026, 11, 2, 22, 0, 'Europe/Madrid')).toBe(Date.UTC(2026, 10, 2, 21, 0));
  });

  it('respeta el cambio de hora y el hemisferio sur', () => {
    expect(zonedToUtc(2026, 3, 29, 12, 0, 'Europe/Madrid')).toBe(Date.UTC(2026, 2, 29, 10, 0));
    expect(zonedToUtc(2026, 1, 10, 21, 0, 'America/Argentina/Buenos_Aires')).toBe(Date.UTC(2026, 0, 11, 0, 0));
  });
});

describe('cómo se dice', () => {
  it('rumbos', () => {
    expect(direction(0)).toBe('al norte');
    expect(direction(140)).toBe('al sudeste');
    expect(direction(350)).toBe('al norte');
  });

  it('sexagesimal', () => {
    expect(sexagesimal(101.287, true)).toBe('6h 45m 08s');
    expect(sexagesimal(-16.716)).toBe('−16° 42′ 57″');
  });

  it('el Sol (B−V 0,65) ronda los 5.800 K', () => {
    expect(Math.abs(temperature(0.65) - 5800)).toBeLessThan(150);
  });
});
