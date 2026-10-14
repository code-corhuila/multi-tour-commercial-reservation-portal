import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ReadFailure } from './read-failure';

/** The message of a failed read: what the service said, or the copy of the page, and the trace when there is one. */
@Component({
  selector: 'crp-read-error', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ message() }}@if (traceId(); as trace) { <small class="crp-trace" data-trace> ({{ trace }})</small> }`,
})
export class ReadErrorComponent {
  /** The error state of the page; it may carry `userMessage` and `traceId`. */
  readonly state = input<unknown>();
  readonly fallback = input.required<string>();
  protected readonly message = computed(() => (this.state() as ReadFailure | null | undefined)?.userMessage || this.fallback());
  protected readonly traceId = computed(() => (this.state() as ReadFailure | null | undefined)?.traceId);
}
