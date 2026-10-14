import { ChangeDetectionStrategy, Component, Directive, Injector, Provider, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, filter, map, of, switchMap } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { CustomerContext } from '../../self-service-reservation/data/customer-context';
import { CLIENT_NOTICES, RESERVATION_CARD_ACTIONS, RESERVATION_CARD_EXTRAS, contribute } from '../../shared/portal-slots';
import { MyProposalsSource, PROPOSAL_AREA, ReschedulingEpisodeView } from '../data/rescheduling-ports';
import { PROPOSAL_COPY, startLine } from '../rescheduling-copy';

/** Read only (plan D-04): what mis-reservas.html and 17 show of a proposal waiting for the customer; no writer is injected here. */
@Directive()
abstract class PendingProposal {
  protected readonly t = PROPOSAL_COPY;
  protected readonly line = startLine;
  private readonly navigation = inject(PortalNavigation, { optional: true });
  protected readonly waiting = inject(MyProposalsSource).mine().pipe(map((all) => all.filter((e) => e.answer === null && e.proposal !== null)),
    catchError(() => of<readonly ReschedulingEpisodeView[]>([])));
  protected respond(reservationId: string): void { this.navigation?.open(PROPOSAL_AREA, { reservation: reservationId }); }
}

/** One card of Mis reservas (input reservationId): its pending proposal, or null. */
@Directive()
abstract class CardProposal extends PendingProposal {
  readonly reservationId = input('');
  protected readonly proposal = toSignal(toObservable(this.reservationId).pipe(filter(Boolean),
    switchMap((id) => this.waiting.pipe(map((all) => all.find((e) => e.reservationId === id) ?? null)))), { initialValue: null });
}

@Component({ selector: 'crp-rescheduling-card-line', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (proposal()?.proposal; as p) { <small>{{ t.proposedLine(line(p.startsAt)) }}</small> }` })
export class ProposedDepartureLineComponent extends CardProposal {}

@Component({ selector: 'crp-rescheduling-card-mark', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (proposal()) { <strong class="crp-status crp-is-pending">{{ t.mark }}</strong> }` })
export class ReschedulingMarkComponent extends CardProposal {}

@Component({ selector: 'crp-rescheduling-card-action', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (proposal(); as e) { <div class="crp-rescheduling-card-actions"><button type="button" class="crp-primary" (click)="respond(e.reservationId)">{{ t.respond }}</button></div> }` })
export class RespondProposalActionComponent extends CardProposal {}

/** "Notificaciones" of 17: one notice per proposal waiting for the customer, with the link to 24A. */
@Component({ selector: 'crp-rescheduling-notices', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@for (e of notices(); track e.reservationId) {
    <p><strong>{{ t.reservation }} {{ e.reservationId }}:</strong> {{ t.notice }}</p>&ngsp;
    <button type="button" class="crp-panel-link" (click)="respond(e.reservationId)">{{ t.noticeLink }}</button>
  }` })
export class ReschedulingNoticesComponent extends PendingProposal {
  protected readonly notices = toSignal(this.waiting, { initialValue: [] as readonly ReschedulingEpisodeView[] });
}

const withPort = (injector: Injector) => injector.get(MyProposalsSource, null) !== null;

/** Plan D-01: the line before HU-COM-014's economic lines and the mark after them, as mis-reservas.html orders them; nothing without the port. */
export const RESCHEDULING_CONTRIBUTIONS: Provider[] = [
  contribute(RESERVATION_CARD_EXTRAS, { component: ProposedDepartureLineComponent, order: 5, isAvailable: withPort }),
  contribute(RESERVATION_CARD_EXTRAS, { component: ReschedulingMarkComponent, order: 20, isAvailable: withPort }),
  contribute(RESERVATION_CARD_ACTIONS, { component: RespondProposalActionComponent, order: 0, isAvailable: withPort }),
  contribute(CLIENT_NOTICES, { component: ReschedulingNoticesComponent, order: 10,
    isAvailable: (injector) => withPort(injector) && injector.get(CustomerContext).isFinalCustomer }),
];
