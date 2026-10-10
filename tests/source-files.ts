import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Every file under src/, as a forward-slash path relative to the repository root. */
export function listSourceFiles(root: string = process.cwd()): string[] {
  const walk = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)],
    );
  return walk(join(root, 'src'))
    .map((file) => relative(root, file).split(sep).join('/'))
    .sort();
}
