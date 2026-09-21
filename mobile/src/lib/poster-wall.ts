/**
 * Dealing posters into the columns behind the sign-in screen.
 *
 * Two things matter and neither is obvious from looking at the result. A
 * column has to be taller than the screen or the loop shows a seam, and the
 * genres have to be interleaved — dealt round-robin rather than sliced — or
 * one column ends up all horror and the wall stops reading as a catalogue.
 *
 * Pure: no React, no images. Unit tested.
 */

export const POSTER_RATIO = 9 / 16;

/**
 * Deal `count` columns of `perColumn`, round-robin from the flat list so
 * consecutive genres land in different columns. Wraps when the list runs out,
 * which is expected: a column is usually taller than sixteen posters.
 */
export function dealColumns<T>(posters: readonly T[], count: number, perColumn: number): T[][] {
  if (posters.length === 0 || count <= 0 || perColumn <= 0) return [];

  const columns: T[][] = Array.from({ length: count }, () => []);
  for (let i = 0; i < count * perColumn; i++) {
    columns[i % count].push(posters[i % posters.length]);
  }
  return columns;
}

/**
 * How many posters one column needs to cover a height and still have somewhere
 * to scroll from. One short and the wrap is visible as a gap.
 */
export function postersPerColumn(containerHeight: number, itemHeight: number): number {
  if (itemHeight <= 0) return 0;
  return Math.max(2, Math.ceil(containerHeight / itemHeight) + 1);
}

/**
 * The box a rotated wall has to fill so its corners never enter the screen.
 *
 * Rotating a rectangle leaves triangles of nothing at each corner; the wall is
 * built oversized instead of the screen being cropped, because the sign-in
 * form sits on top of it and must not move.
 */
export function rotatedCover(
  width: number,
  height: number,
  degrees: number
): { width: number; height: number } {
  const radians = (Math.abs(degrees) * Math.PI) / 180;
  const sin = Math.sin(radians);
  const cos = Math.cos(radians);
  return {
    width: Math.ceil(width * cos + height * sin),
    height: Math.ceil(width * sin + height * cos),
  };
}

/**
 * A column's drift: alternating direction, and a duration that is never the
 * same twice in a row. Equal speeds read as one sliding sheet rather than a
 * wall of separate columns, which is the tell that gives away the trick.
 */
export function columnMotion(index: number): { up: boolean; durationMs: number } {
  // 26s for the first column, a little slower each time. Slow enough to be
  // background; fast enough to be visibly alive while somebody signs in.
  return { up: index % 2 === 0, durationMs: (26 + index * 7) * 1000 };
}
