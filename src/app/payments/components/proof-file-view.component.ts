import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { ReadErrorComponent } from '../../shared/read-error.component';
import { ReadFailure, readFailure } from '../../shared/read-failure';
import { ProofFileSource } from '../data/proof-file-source';
import { PAYMENTS_TEXT } from '../payments-copy';
import { PROOF_REVIEW_TEXT } from '../proof-review-copy';

type FileState =
  | { readonly kind: 'loading' } | { readonly kind: 'missing' } | ({ readonly kind: 'error' } & ReadFailure)
  | { readonly kind: 'ready'; readonly url: string; readonly safe: SafeResourceUrl; readonly image: boolean; readonly extension: string };
/** The name the service builds for the download (receipt-<paymentId>.<extension>); the extension comes from the type it judged. */
const EXTENSION: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

/**
 * The "Comprobante de pago" of admin-validar-soporte.html: the file name, an image preview, or the button "Ver comprobante" that opens a document.
 * The file is read through ProofFileSource (the container client) and shown from an object URL that is revoked when it is replaced or the screen goes away.
 */
@Component({
  imports: [ReadErrorComponent], selector: 'crp-proof-file', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = state();
    @if (name() && s.kind !== 'missing') { <p>{{ t.file(name()) }}</p> }
    @switch (s.kind) {
      @case ('loading') { <p role="status" data-file-state="loading">{{ common.loading }}</p> }
      @case ('missing') { <p data-file-state="missing">{{ t.file(null) }}</p> }
      @case ('error') { <div role="alert" data-file-state="error"><crp-read-error [state]="s" [fallback]="common.failed" />&ngsp;<button type="button" class="crp-operator-outline" (click)="load()">{{ common.retry }}</button></div> }
      @case ('ready') {
        <div class="crp-proof-file" data-file-state="ready">@if (!name()) { <p>{{ t.file('receipt-' + paymentId() + '.' + s.extension) }}</p> }
          @if (s.image) { <img [src]="s.url" [alt]="t.previewAlt"> }
          @else { <button type="button" class="crp-operator-outline" (click)="opened.set(!opened())">{{ t.view }}</button>
            @if (opened()) { <iframe [src]="s.safe" [title]="t.documentTitle"></iframe> } }
        </div>
      }
    }
  `,
})
export class ProofFileViewComponent {
  readonly paymentId = input.required<string>();
  /** The name the service gave the transfer, if it did; empty when it only serves the file. */
  readonly name = input('');
  protected readonly t = PROOF_REVIEW_TEXT; protected readonly common = PAYMENTS_TEXT;
  protected readonly state = signal<FileState>({ kind: 'loading' }); protected readonly opened = signal(false);
  private readonly files = inject(ProofFileSource); private readonly sanitizer = inject(DomSanitizer);
  private subscription: Subscription | undefined; private url: string | null = null;

  constructor() {
    effect(() => { this.paymentId(); untracked(() => this.load()); });
    inject(DestroyRef).onDestroy(() => { this.subscription?.unsubscribe(); this.release(); });
  }

  protected load(): void {
    this.subscription?.unsubscribe(); this.release(); this.opened.set(false); this.state.set({ kind: 'loading' });
    this.subscription = this.files.read(this.paymentId()).subscribe({
      next: (blob) => {
        try {
          // The object URL lives only in this browser's memory; the bytes were judged by the service, the view only shows them.
          this.url = URL.createObjectURL(blob);
          this.state.set({ kind: 'ready', url: this.url, safe: this.sanitizer.bypassSecurityTrustResourceUrl(this.url), image: blob.type.startsWith('image/'), extension: EXTENSION[blob.type] ?? 'pdf' });
        } catch { this.state.set({ kind: 'error' }); }
      },
      error: (e: { status?: number }) => this.state.set(e?.status === 404 ? { kind: 'missing' } : { kind: 'error', ...readFailure(e) }),
    });
  }
  private release(): void { if (this.url) { URL.revokeObjectURL(this.url); this.url = null; } }
}
