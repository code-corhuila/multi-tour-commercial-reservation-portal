import { describe, expect, it } from 'vitest';
import { listSourceFiles } from './source-files';

// The Angular portal tree of Annex H with `catalog` as the feature (plan.md D-04).
// Adding or removing a file of src/ is a decision, so it must change this list in the same commit.
const SPECIFIED_TREE = [
  'src/app/app.component.ts',
  'src/app/app.config.ts',
  'src/app/catalog/catalog.routes.ts',
  'src/app/catalog/components/catalog-item-form.component.ts',
  'src/app/catalog/data/catalog-api.service.ts',
  'src/app/catalog/model/catalog-item.ts',
  'src/app/catalog/model/money.ts',
  'src/app/catalog/pages/catalog-page.component.ts',
  'src/app/shell-contract.ts',
  'src/bootstrap.ts',
  'src/index.html',
  'src/main.ts',
];

describe('portalTreeMatchesTheSpecifiedTree', () => {
  it('has exactly the files of the specified tree under src/, no more and no less', () => {
    expect(listSourceFiles()).toEqual([...SPECIFIED_TREE].sort());
  });
});
