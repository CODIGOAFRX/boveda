// Proyección estereográfica desde el cénit, como un planisferio sostenido sobre la cabeza:
// norte arriba, este a la izquierda. Conserva los ángulos, así que las constelaciones no se deforman.
import { DEG, RAD, norm360 } from '../astro/core';

/** Distancia cenital máxima que se proyecta; más allá la estereográfica se dispara al infinito. */
const MAX_Z = 172;

export function project(alt: number, az: number, cx: number, cy: number, R: number): [number, number] {
  const z = Math.min(90 - alt, MAX_Z);
  const rho = R * Math.tan((z * DEG) / 2);
  return [cx - rho * Math.sin(az * DEG), cy - rho * Math.cos(az * DEG)];
}

export function unproject(x: number, y: number, cx: number, cy: number, R: number) {
  const dx = x - cx;
  const dy = y - cy;
  const rho = Math.hypot(dx, dy);
  const z = 2 * Math.atan(rho / R) * RAD;
  return { alt: 90 - z, az: rho === 0 ? 0 : norm360(Math.atan2(-dx, -dy) * RAD) };
}
