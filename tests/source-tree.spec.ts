import { describe, expect, it } from 'vitest';
import { listSourceFiles } from './source-files';

// The Angular portal tree of Annex H with `catalog` as the feature (plan.md D-04).
// Adding or removing a file of src/ is a decision, so it must change this list in the same commit.
const SPECIFIED_TREE = [
  'src/app/discounts/model/discount-rule.ts',
  'src/app/discounts/model/percentage.ts',
  'src/app/discounts/data/discount-rules-writer.ts',
  'src/app/discounts/components/discount-rule-form.component.ts',
  'src/app/discounts/data/discount-rules-source.ts',
  'src/app/discounts/discounts.routes.ts',
  'src/app/discounts/pages/discounts-page.component.ts',
  'src/app/app.component.ts',
  'src/app/app.config.ts',
  'src/app/demo/demo-sources.ts',
  'src/app/http/api-paths.ts',
  'src/app/http/catalog-api-sources.ts',
  'src/app/http/establishments-api-sources.ts',
  'src/app/portal-shell.component.ts',
  'src/app/catalog/catalog-copy.ts',
  'src/app/catalog/catalog.routes.ts',
  'src/app/catalog/components/catalog-item-form.component.ts',
  'src/app/catalog/data/catalog-api.service.ts',
  'src/app/catalog/model/catalog-item.ts',
  'src/app/catalog/model/money.ts',
  'src/app/catalog/pages/catalog-page.component.ts',
  'src/app/establishments/data/associated-establishments-source.ts',
  'src/app/establishments/data/associated-establishments-writer.ts',
  'src/app/establishments/components/establishment-form.component.ts',
  'src/app/establishments/establishments-copy.ts',
  'src/app/establishments/establishments.routes.ts',
  'src/app/establishments/model/associated-establishment.ts',
  'src/app/establishments/model/image-policy.ts',
  'src/app/establishments/pages/establishments-page.component.ts',
  'src/app/shell-contract.ts',
  'src/app/sources.demo.ts',
  'src/app/sources.ts',
  'src/bootstrap.ts',
  'src/index.html',
  'src/main.ts',
  'src/mount-entry.ts',
  'src/styles/portal.css',
  'src/app/current-discounts/model/current-discounts.ts',
  'src/app/current-discounts/data/current-discounts-source.ts',
  'src/app/current-discounts/data/additional-discount-writer.ts',
  'src/app/current-discounts/components/current-discounts-value.component.ts',
  'src/app/current-discounts/components/additional-discount-form.component.ts',
  'src/app/current-discounts/pages/current-discounts-page.component.ts',
  'src/app/demo/current-discounts-demo.ts',
];

describe('portalTreeMatchesTheSpecifiedTree', () => {
  it('has exactly the files of the specified tree under src/, no more and no less', () => {
    expect(listSourceFiles()).toEqual([...SPECIFIED_TREE].sort());
  });
});
