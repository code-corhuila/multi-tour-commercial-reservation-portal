import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, inject, signal } from '@angular/core';
import { CatalogItemsSource } from '../../catalog/data/catalog-api.service';
import { PortalNavigation } from '../../portal-navigation';
import { focusFirstError } from '../../shared/focus';
import { departureLine } from '../../shared/format';
import { IdempotencyKeys, IntentionKey } from '../../shared/idempotency-keys';
import { PageState } from '../../shared/page-state';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { ReadErrorComponent } from '../../shared/read-error.component';
import { readFailure } from '../../shared/read-failure';
import { PaymentParametersSource, PaymentParametersView, PaymentParametersWriter, SaveParametersCommand } from '../data/payment-parameters-ports';
import { PARAMETER_FIELDS, ParameterKey, ParameterPatch, firstProblem } from '../model/payment-parameters';
import { PAYMENT_PARAMETERS_COPY } from '../payment-parameters-copy';

type Feedback = { readonly text: string; readonly ok: boolean };

/**
 * admin-parametros-pago.html (HU-COM-009 amendment v1.9, section A.3, AC-PY.17): the Administrator's grid of payment parameters, one row per active tour.
 * The values come from and go to the ports (pillar 2); only the cells the person touched travel, under one Idempotency-Key kept while the same change is retried.
 */
@Component({
  selector: 'app-payment-parameters-page', changeDetection: ChangeDetectionStrategy.OnPush, imports: [ReadErrorComponent],
  template: `
    <header class="crp-page-header"><div class="crp-page-header-main"><h1 class="crp-page-header-title crp-h1">{{ t.title }}</h1></div>
      @if (navigation?.has('catalog')) { <button type="button" class="crp-operator-outline crp-page-header-action" (click)="navigation?.open('catalog')">{{ t.back }}</button> }</header>
    @if (!allowed) {
      <p role="alert" data-state="denied">{{ t.forbidden }}</p>
    } @else {
      <p class="crp-operator-access-note">{{ t.note }}</p>
      @let s = state();
      @switch (s.kind) {
        @case ('loading') { <p role="status" data-state="loading">{{ t.loading }}</p> }
        @case ('error') { <div role="alert" data-state="error"><crp-read-error [state]="s" [fallback]="t.readFailed" />&ngsp;<button type="button" class="crp-operator-outline" (click)="s.retry()">{{ t.retry }}</button></div> }
        @default {
          @let view = current();
          <form data-payment-params-form novalidate (submit)="submit($event)">
            <section class="crp-operator-panel" data-state="data"><p class="crp-operator-eyebrow">{{ t.panelEyebrow }}</p><h2>{{ t.panelTitle }}</h2>
              <div class="crp-table-wrap"><table class="crp-operator-table"><thead><tr><th scope="col">{{ t.serviceColumn }}</th>@for (f of fields; track f.key) { <th scope="col">{{ t.fields[f.key].short }}</th> }</tr></thead>
                <tbody>@for (row of view.rows; track row.service; let i = $index) {
                  <tr><th scope="row">{{ row.service }}</th>@for (f of fields; track f.key) { @let ck = cellKey(i, f.key);
                    <td><input class="crp-payment-parameters-cell" type="number" inputmode="numeric" [name]="f.key" [id]="cellId(ck)" [min]="f.min" [max]="f.max" [value]="shown(ck, row, f.key)"
                      [placeholder]="t.value(row.applied[f.key])" [attr.aria-label]="t.cellLabel(t.fields[f.key].label, row.service)" [attr.aria-invalid]="errors()[ck] ? 'true' : null"
                      [attr.aria-describedby]="errors()[ck] ? cellId(ck) + '-error' : null" (input)="edit(ck, $event)" />
                      @if (errors()[ck]) { <small class="crp-payment-parameters-error" [id]="cellId(ck) + '-error'">{{ errors()[ck] }}</small> }</td> }</tr>
                }</tbody></table></div>
              <p class="crp-operator-copy">{{ t.explanation }}</p>
              <label class="crp-payment-parameters-reason" for="crp-payment-parameters-reason">{{ t.reasonLabel }}
                <input id="crp-payment-parameters-reason" name="reason" type="text" [value]="reason()" [placeholder]="t.reasonPlaceholder" [attr.aria-invalid]="reasonError() ? 'true' : null"
                  [attr.aria-describedby]="reasonError() ? 'crp-payment-parameters-reason-error' : null" (input)="reason.set(text($event))" /></label>
              @if (reasonError(); as message) { <small class="crp-payment-parameters-error" id="crp-payment-parameters-reason-error">{{ message }}</small> }
              <p class="crp-operator-copy" data-payment-params-meta>{{ view.lastChange ? t.metaLast(date(view.lastChange.at), view.lastChange.actor) : t.metaNone }}</p>
              <p class="crp-operator-form-feedback" [class.crp-is-valid]="feedback()?.ok" data-payment-params-feedback aria-live="polite" [hidden]="!feedback()">{{ feedback()?.text }}</p>
              <div class="crp-operator-form-actions"><button type="button" class="crp-operator-outline" (click)="reset()">{{ t.reset }}</button>
                <button type="submit" class="crp-operator-primary" [disabled]="busy()">{{ t.save }}</button></div>
            </section>
          </form>
          <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ t.auditEyebrow }}</p><h2>{{ t.auditTitle }}</h2>
            <div class="crp-table-wrap"><table class="crp-operator-table"><thead><tr>@for (h of t.auditColumns; track h) { <th scope="col">{{ h }}</th> }</tr></thead>
              <tbody data-payment-params-history>@for (line of view.audit; track $index) { <tr><td>{{ date(line.at) }}</td><td>{{ line.actor }}</td><td>{{ line.record }}</td><td>{{ line.reason }}</td></tr> }
                @empty { <tr><td [attr.colspan]="t.auditColumns.length">{{ t.auditEmpty }}</td></tr> }</tbody></table></div></section>
        }
      }
    }
  `,
})
export class PaymentParametersPageComponent {
  protected readonly t = PAYMENT_PARAMETERS_COPY;
  protected readonly fields = PARAMETER_FIELDS;
  protected readonly date = departureLine;
  protected readonly navigation = inject(PortalNavigation, { optional: true });
  protected readonly allowed = inject(PortalCapabilities).canManagePaymentParameters();
  protected readonly state = signal<PageState<PaymentParametersView>>({ kind: 'loading' });
  /** The text of the cells the person touched, by cell; an empty text clears the value back to the inherited one. */
  protected readonly edits = signal<Readonly<Record<string, string>>>({});
  protected readonly errors = signal<Readonly<Record<string, string>>>({});
  protected readonly reason = signal('');
  protected readonly reasonError = signal<string | null>(null);
  protected readonly feedback = signal<Feedback | null>(null);
  protected readonly busy = signal(false);
  private readonly catalog = inject(CatalogItemsSource);
  private readonly source = inject(PaymentParametersSource);
  private readonly writer = inject(PaymentParametersWriter);
  private readonly intention = new IntentionKey(inject(IdempotencyKeys));
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private reads = 0;

  constructor() { if (this.allowed) this.load(); }

  protected current(): PaymentParametersView { const s = this.state(); return s.kind === 'data' ? s.items[0] : { rows: [], audit: [], lastChange: null }; }
  protected cellKey = (row: number, key: ParameterKey) => `${row}|${key}`;
  protected cellId = (cell: string) => `crp-payment-parameters-${cell.replace('|', '-')}`;
  protected text = (event: Event) => (event.target as HTMLInputElement).value;
  protected edit(cell: string, event: Event): void { this.edits.update((all) => ({ ...all, [cell]: this.text(event) })); }

  /** What the cell holds: what the person typed, else what the row defines itself; the tenant row also shows the applied value when it is a whole number. */
  protected shown(cell: string, row: PaymentParametersView['rows'][number], key: ParameterKey): string {
    const typed = this.edits()[cell], own = row.own[key], applied = row.applied[key];
    if (typed !== undefined) return typed;
    if (own !== undefined) return String(own);
    return row.scope === 'tenant' && applied !== null && Number.isInteger(applied) ? String(applied) : '';
  }

  /** Loads the defaults into the grid without saving: every cell is emptied, so each row inherits the seed once saved with a reason. */
  protected reset(): void {
    const all: Record<string, string> = {};
    this.current().rows.forEach((_, i) => PARAMETER_FIELDS.forEach((f) => { all[this.cellKey(i, f.key)] = ''; }));
    this.edits.set(all); this.errors.set({}); this.feedback.set({ text: this.t.resetDone, ok: true });
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (this.busy()) return;
    const rows = this.current().rows, errors: Record<string, string> = {}, tenant: Record<string, number | null> = {}, services: Record<string, Record<string, number | null>> = {};
    for (const [cell, text] of Object.entries(this.edits())) {
      const [index, key] = cell.split('|'), row = rows[Number(index)], field = PARAMETER_FIELDS.find((f) => f.key === key)!;
      const value = text.trim() === '' ? null : Number(text);
      if (value !== null && firstProblem(row.service, { [field.key]: value })) { errors[cell] = this.t.outOfBounds(row.service, this.t.fields[field.key].label, field.min, field.max); continue; }
      if (row.scope === 'tenant') tenant[key] = value; else (services[row.service] ??= {})[key] = value;
    }
    const reason = this.reason().trim();
    this.errors.set(errors); this.reasonError.set(reason ? null : this.t.reasonRequired);
    if (Object.keys(errors).length || !reason) { afterNextRender(() => focusFirstError(this.host), { injector: this.injector }); return; }
    const command: SaveParametersCommand = { tenant: tenant as ParameterPatch, services: services as Record<string, ParameterPatch>, reason };
    this.busy.set(true); this.feedback.set(null);
    this.writer.save(command, this.intention.keyFor(command)).subscribe({
      next: () => { this.intention.settle(); this.busy.set(false); this.edits.set({}); this.reason.set(''); this.feedback.set({ text: this.t.saved, ok: true }); this.load(); },
      error: (error) => { this.busy.set(false); this.feedback.set({ text: readFailure(error).userMessage ?? this.t.failed, ok: false }); },
    });
  }

  /** The newest read wins. */
  private load(): void {
    const mine = ++this.reads;
    this.catalog.list().subscribe({
      next: (items) => this.source.read(items.filter((i) => i.serviceType === 'TOUR' && i.catalogStatus === 'ACTIVE').map((i) => i.commercialName)).subscribe({
        next: (view) => { if (mine === this.reads) this.state.set({ kind: 'data', items: [view] }); },
        error: (error) => this.fail(mine, error),
      }),
      error: (error) => this.fail(mine, error),
    });
  }

  private fail(mine: number, error: unknown): void {
    if (mine === this.reads) this.state.set({ kind: 'error', ...readFailure(error), retry: () => { this.state.set({ kind: 'loading' }); this.load(); } });
  }
}
