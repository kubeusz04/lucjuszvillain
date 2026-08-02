/** Wrap a coordinate into [0, size) — torus / infinite board feel */
export function wrapCoord(value: number, size: number): number {
  const r = value % size;
  return r < 0 ? r + size : r;
}

export function wrapPosition(
  x: number,
  z: number,
  size: number,
): { x: number; z: number; wrapped: boolean } {
  const nx = wrapCoord(x, size);
  const nz = wrapCoord(z, size);
  return {
    x: nx,
    z: nz,
    wrapped: nx !== x || nz !== z,
  };
}

/** Shortest signed delta on a wrapping axis */
export function wrapDelta(from: number, to: number, size: number): number {
  let d = to - from;
  if (d > size * 0.5) d -= size;
  if (d < -size * 0.5) d += size;
  return d;
}
