import { ChangeDetectionStrategy, Component, Directive, Injector, Provider, computed, inject, input } from '@angular/core';
import { PortalNavigation } from '../../portal-navigation';
import { Reservation } from '../../reservations/data/reservations-source';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { PAYMENT_MANAGEMENT_ACTIONS, TRANSFER_PAYMENT_LINES, contribute } from '../../shared/portal-slots';
import { ProofReviewWriter, proofToDecide } from '../data/proof-review-ports';
import { PAYMENTS_TEXT } from '../payments-copy';
import { PROOF_REVIEW_TEXT } from '../proof-review-copy';

/** What every "Validar soporte" link shares: the proof to decide of its reservation and the decision page it opens (plan D-06). */
@Directive()
abstract class ProofLink {
  readonly reservation = input.required<Reservation>();
  protected readonly t = PROOF_REVIEW_TEXT;
  protected readonly canDecide = inject(PortalCapabilities).canDecideProof();
  protected readonly proof = computed(() => proofToDecide(this.reservation()));
  private readonly navigation = inject(PortalNavigation, { optional: true });
  protected open(): void { this.navigation?.open('payments-validate', { reservation: this.reservation().id, payment: this.proof()?.id ?? '' }); }
}
/** 13 sub-screen (admin-gestion-pago.html): Validar and Rechazar soporte lead to the decision page (reason and amount, RN-RES-006A); the review history. */
@Component({ selector: 'app-proof-management-actions', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (proof() && canDecide) { <div class="crp-form-actions"><button type="button" class="crp-operator-outline" (click)="open()">{{ t.reject }}</button>
      <button type="button" class="crp-operator-primary" (click)="open()">{{ t.validate }}</button></div> }
    @if (history()) { <p class="crp-access-note">{{ history() }}</p> }` })
export class ProofManagementActionsComponent extends ProofLink {
  /** "Historial: En validación → Rechazado: imagen ilegible → En validación." of the mockup, from the proof lines. */
  protected readonly history = computed(() => {
    const steps = (this.reservation().payments ?? []).filter((p) => p.proofName).flatMap((p) => [PAYMENTS_TEXT.proofStatus['EN_VALIDACION'],
      ...(p.review ? [PAYMENTS_TEXT.proofStatus[p.review.decision] + (p.review.decision === 'RECHAZADO' ? `: ${p.review.reason}` : '')] : [])]);
    return steps.length ? `${this.t.history} ${steps.join(' → ')}.` : '';
  });
}
/** 24 (pago-transferencia.html): the review limit (RN-RES-006C, AC-PV.11). */
@Component({ selector: 'app-review-limit-line', changeDetection: ChangeDetectionStrategy.OnPush, template: `<p>{{ text }}</p>` })
export class ReviewLimitLineComponent { protected readonly text = PROOF_REVIEW_TEXT.reviewLimit; }
const withProofReview = (injector: Injector) => injector.get(ProofReviewWriter, null) !== null;
/** HU-COM-010 contributions (mount-entry.ts): drawn only when the build supplies the review port. */
export const PROOF_REVIEW_CONTRIBUTIONS: readonly Provider[] = [
  contribute(PAYMENT_MANAGEMENT_ACTIONS, { component: ProofManagementActionsComponent, order: 0, isAvailable: withProofReview }),
  contribute(TRANSFER_PAYMENT_LINES, { component: ReviewLimitLineComponent, order: 0, isAvailable: withProofReview }),
];
