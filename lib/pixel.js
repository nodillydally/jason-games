/* lib/pixel.js — sprites as text.
 *
 * A sprite is an array of equal-length strings, one character per pixel, and a
 * palette mapping those characters to colours. `.` is transparent. That keeps
 * the art in source control as something you can read, diff and edit in place
 * rather than a binary blob nobody can review, and it holds to the repo's
 * no-build-step rule: no sprite sheets, no packer, no image pipeline.
 *
 *   Pixel.toSvg(rows, palette)  ->  '<rect .../>...'
 *
 * Horizontal runs of the same colour collapse into one <rect>, which takes a
 * 16x22 figure from ~350 nodes to ~90. Colours can be CSS custom properties,
 * so a shirt painted 'var(--p1)' takes each game's own accent without the
 * sprite knowing anything about the game.
 */

window.Pixel = (function () {
  'use strict';

  const EMPTY = '.';

  function toSvg(rows, palette) {
    let out = '';
    for (let y = 0; y < rows.length; y += 1) {
      const row = rows[y];
      let x = 0;
      while (x < row.length) {
        const ch = row[x];
        if (ch === EMPTY) { x += 1; continue; }
        let run = 1;
        while (x + run < row.length && row[x + run] === ch) run += 1;
        const fill = palette[ch];
        // An unmapped character is a hole rather than a crash: a half-drawn
        // sprite should still render the half that's finished.
        if (fill) out += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${fill}"/>`;
        x += run;
      }
    }
    return out;
  }

  // Stamps a small sprite onto a bigger one at (ox, oy). Used for gear: a hat
  // is drawn once in its own little grid and dropped onto whichever frame is
  // showing, at that frame's head anchor.
  function stamp(base, overlay, ox, oy) {
    const rows = base.slice();
    for (let y = 0; y < overlay.length; y += 1) {
      const ty = y + oy;
      if (ty < 0 || ty >= rows.length) continue;
      const line = rows[ty].split('');
      for (let x = 0; x < overlay[y].length; x += 1) {
        const ch = overlay[y][x];
        const tx = x + ox;
        if (ch === EMPTY || tx < 0 || tx >= line.length) continue;
        line[tx] = ch;
      }
      rows[ty] = line.join('');
    }
    return rows;
  }

  return { toSvg, stamp, EMPTY };
})();
