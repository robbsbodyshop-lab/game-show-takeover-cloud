/** Typed loaders: each JSON file is parsed (and validated) once, on first use. */
import feudJson from './family_feud.json';
import wheelJson from './wheel_of_fortune.json';
import { feudFileSchema, toProblems, validateContentFiles, wheelFileSchema } from './schema.ts';
import type { ContentValidation } from './schema.ts';
import type { FeudFile, WheelFile } from './types.ts';

export class ContentError extends Error {
  constructor(file: string, details: string) {
    super(`Invalid content in ${file}: ${details}`);
    this.name = 'ContentError';
  }
}

let feud: FeudFile | undefined;
let wheel: WheelFile | undefined;

const summarize = (problems: { id: string; message: string }[]): string =>
  problems
    .slice(0, 5)
    .map((p) => `${p.id}: ${p.message}`)
    .join('; ');

export const getFeudContent = (): FeudFile => {
  if (!feud) {
    const result = feudFileSchema.safeParse(feudJson);
    if (!result.success) {
      throw new ContentError(
        'family_feud.json',
        summarize(toProblems('family_feud.json', feudJson, result.error)),
      );
    }
    feud = result.data;
  }
  return feud;
};

export const getWheelContent = (): WheelFile => {
  if (!wheel) {
    const result = wheelFileSchema.safeParse(wheelJson);
    if (!result.success) {
      throw new ContentError(
        'wheel_of_fortune.json',
        summarize(toProblems('wheel_of_fortune.json', wheelJson, result.error)),
      );
    }
    wheel = result.data;
  }
  return wheel;
};

/** Validate the bundled files; names the file, id and problem for anything wrong. */
export const validateContent = (): ContentValidation =>
  validateContentFiles({ feud: feudJson, wheel: wheelJson });
