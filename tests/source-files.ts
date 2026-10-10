import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import * as ts from 'typescript';

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

/** Source text with every comment removed, so that a comment explaining a rule is not a breach. */
export function withoutComments(source: string): string {
  const scanner = ts.createScanner(ts.ScriptTarget.ES2022, false, ts.LanguageVariant.Standard, source);
  let code = '';
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token !== ts.SyntaxKind.SingleLineCommentTrivia && token !== ts.SyntaxKind.MultiLineCommentTrivia) {
      code += scanner.getTokenText();
    }
  }
  return code;
}
