import { readFileSync } from 'node:fs';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { listSourceFiles } from './source-files';

// Norm 5.4.1 / Annex H: the HTTP client and the session live only in the container.
// A portal that builds its own sends requests with no interceptor: unauthenticated and in silence.
const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
  ['provideHttpClient', /\bprovideHttpClient\b/],
  ['HttpClientModule', /\bHttpClientModule\b/],
  ['new HttpClient', /\bnew\s+HttpClient\b/],
  ['fetch(', /\bfetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['axios', /\baxios\b/],
];

/** Source text with every comment removed, so that a comment explaining the rule is not a breach. */
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

/** The forbidden constructs found in one piece of source text. */
export function findViolations(source: string): string[] {
  const code = withoutComments(source);
  return FORBIDDEN.filter(([, pattern]) => pattern.test(code)).map(([name]) => name);
}

describe('portalDeclaresNoHttpClientOfItsOwn', () => {
  it('finds no HTTP client, session or direct request anywhere in src/', () => {
    const offenders = listSourceFiles()
      .filter((file) => file.endsWith('.ts'))
      .map((file) => ({ file, found: findViolations(readFileSync(file, 'utf8')) }))
      .filter(({ found }) => found.length > 0);
    expect(offenders).toEqual([]);
  });

  it('detects each forbidden construct, so the check above cannot pass by blindness', () => {
    const samples: Record<string, string> = {
      provideHttpClient: 'providers: [provideHttpClient()]',
      HttpClientModule: 'imports: [HttpClientModule]',
      'new HttpClient': 'const client = new HttpClient(handler);',
      'fetch(': "await fetch('/x');",
      XMLHttpRequest: 'const request = new XMLHttpRequest();',
      axios: "import axios from 'axios';",
    };
    for (const [name, sample] of Object.entries(samples)) {
      expect(findViolations(sample)).toContain(name);
    }
  });

  it('ignores the same words inside comments', () => {
    const commented = '// no provideHttpClient() here\n/* never fetch( directly */\nexport const a = 1;';
    expect(findViolations(commented)).toEqual([]);
  });
});
