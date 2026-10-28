/**
 * Regenerates `public/puzzle/sprites.svg` and `src/games/puzzle/sprites.ts` from the procedural art.
 *   node --experimental-strip-types src/games/puzzle/tools/buildSprites.ts && npx prettier --write src/games/puzzle/sprites.ts
 * A test fails when the checked-in files drift from this output.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildArt } from '../art/index.ts';
import { packSprites, renderSheetSvg, renderSpritesModule } from '../art/sheet.ts';

export const buildSheet = (): { svg: string; module: string; count: number } => {
  const art = buildArt();
  const packed = packSprites(art);
  return { svg: renderSheetSvg(art, packed), module: renderSpritesModule(packed), count: art.length };
};

const main = (): void => {
  const root = join(import.meta.dirname, '..', '..', '..', '..');
  const { svg, module, count } = buildSheet();
  const svgPath = join(root, 'public', 'puzzle', 'sprites.svg');
  mkdirSync(dirname(svgPath), { recursive: true });
  writeFileSync(svgPath, svg);
  writeFileSync(join(root, 'src', 'games', 'puzzle', 'sprites.ts'), module);
  process.stdout.write(`wrote ${count.toString()} sprites to ${svgPath}\n`);
};

if (process.argv[1] !== undefined && import.meta.filename === process.argv[1]) main();
