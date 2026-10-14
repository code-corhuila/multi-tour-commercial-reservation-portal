import { Route } from '@angular/router';
import { readFileSync } from 'node:fs';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { CATALOG_ROUTES } from '../src/app/catalog/catalog.routes';
import { listSourceFiles, withoutComments } from './source-files';

// RN-P9 / AC-P1.9: no screen offers a delete action. An absence rots in silence, so it is asserted
// on the three places where one could appear: the route map, the page templates and the data service.
const DELETE_WORDS = /delete|remove|erase|destroy|borrar|eliminar|suprimir/gi;

/** The delete-like words found in a piece of text, comments excluded. */
export function findDeleteOffers(text: string): string[] {
  const code = withoutComments(text).replace(/<!--[\s\S]*?-->/g, '');
  return [...code.matchAll(DELETE_WORDS)].map((match) => match[0].toLowerCase());
}

/** Every string a route map exposes: paths, redirects, titles and the data it carries. */
export function routeMapText(routes: readonly Route[]): string {
  return routes
    .map((route) =>
      [
        route.path,
        route.redirectTo,
        typeof route.title === 'string' ? route.title : '',
        JSON.stringify(route.data ?? {}),
        routeMapText(route.children ?? []),
      ].join(' '),
    )
    .join(' ');
}

/** The inline template of every component in a source file; no component here uses a template file. */
export function templatesOf(source: string): string[] {
  const file = ts.createSourceFile('component.ts', source, ts.ScriptTarget.ES2022, true);
  const templates: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && node.name.getText(file) === 'template' && ts.isStringLiteralLike(node.initializer)) {
      templates.push(node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return templates;
}

const catalogFiles = (folder: string) =>
  listSourceFiles().filter((file) => file.startsWith(`src/app/catalog/${folder}/`) && file.endsWith('.ts'));

describe('noScreenTemplateOrServiceOffersDelete', () => {
  it('finds none in the route map', () => {
    expect(findDeleteOffers(routeMapText(CATALOG_ROUTES))).toEqual([]);
  });

  it('finds none in the templates of the components and pages', () => {
    const offenders = [...catalogFiles('components'), ...catalogFiles('pages')]
      .flatMap((file) => templatesOf(readFileSync(file, 'utf8')).map((template) => ({ file, found: findDeleteOffers(template) })))
      .filter(({ found }) => found.length > 0);
    expect(offenders).toEqual([]);
  });

  it('finds none in the data service', () => {
    const offenders = catalogFiles('data')
      .map((file) => ({ file, found: findDeleteOffers(readFileSync(file, 'utf8')) }))
      .filter(({ found }) => found.length > 0);
    expect(offenders).toEqual([]);
  });

  it('reads at least one data file and one template, so the checks above cannot pass by blindness', () => {
    expect(catalogFiles('data').length).toBeGreaterThan(0);
    expect(templatesOf(readFileSync('src/app/catalog/pages/catalog-page.component.ts', 'utf8')).length).toBeGreaterThan(0);
  });

  it('detects each forbidden word and call', () => {
    const samples = [
      '<button>Delete</button>',
      'removeItem(id) {}',
      'this.erase()',
      'ngOnDestroy() {}',
      'borrarServicio()',
      'eliminar el servicio',
      'suprimir',
      'http.delete(url)',
      "method: 'DELETE'",
    ];
    for (const sample of samples) {
      expect(findDeleteOffers(sample), sample).not.toEqual([]);
    }
    expect(findDeleteOffers(routeMapText([{ path: 'items/:id/delete' }]))).not.toEqual([]);
    expect(findDeleteOffers(routeMapText([{ path: '', data: { action: 'remove' } }]))).not.toEqual([]);
    expect(findDeleteOffers(routeMapText([{ path: 'a', children: [{ path: 'erase' }] }]))).not.toEqual([]);
  });

  it('ignores the same words inside comments', () => {
    const commented = '// there is no delete here\n/* never remove or erase */\n<!-- destroy -->\nexport const a = 1;';
    expect(findDeleteOffers(commented)).toEqual([]);
  });
});
