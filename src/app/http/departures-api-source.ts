import { Observable, forkJoin, map, of, switchMap } from 'rxjs';
import { CatalogItem } from '../catalog/model/catalog-item';
import { DepartureCapacity } from '../reservations/data/departure-capacity';
import { DeparturesSource } from '../reservations/data/departures-source';
import { Departure } from '../reservations/model/reservation';
import { PortalApiClient } from '../shell-contract';
import { catalogPath, departuresPath, listAll } from './api-paths';

/** ReservationDeparture of the contract (PROPOSED): `availableSeats` is the effective capacity minus the seats held. */
interface DepartureDto { readonly departureId: string; readonly startsAt: string; readonly availableSeats: number; readonly full: boolean }

/**
 * The open departures of every active tour over the route of the departures of a tour (HU-COM-007 plan D-03). The service returns only
 * scheduled departures not yet started, so every one is Programada; a full one stays and is not open. TODO(G-B): the contract carries
 * neither the transport fare of the tour (it comes with the quote) nor the conditions (DP-06), so both stay empty.
 */
export class DeparturesApiSource extends DeparturesSource {
  constructor(private readonly client: PortalApiClient) { super(); }

  override list(): Observable<readonly Departure[]> {
    return listAll<CatalogItem>(this.client, catalogPath()).pipe(
      map((items) => items.filter((item) => item.serviceType === 'TOUR' && item.catalogStatus === 'ACTIVE')),
      switchMap((tours) => (tours.length ? forkJoin(tours.map((tour) => this.departuresOf(tour))) : of([] as Departure[][]))),
      map((perTour) => perTour.flat()),
    );
  }

  private departuresOf(tour: CatalogItem): Observable<Departure[]> {
    return listAll<DepartureDto>(this.client, departuresPath(tour.serviceId)).pipe(map((found) => found.map((d): Departure => ({
      id: d.departureId, tourName: tour.commercialName, date: d.startsAt, state: 'PROGRAMADA', openForReservations: !d.full,
      effectiveCapacity: d.availableSeats, transportPerPersonCents: 0, conditions: '',
    }))));
  }
}

/** RN-RES-007 over the seats the service reports as left: a read-only comparison that holds no seat; the service decides at creation. */
export class DepartureApiCapacity extends DepartureCapacity {
  override hasSeats(departure: Departure): boolean { return departure.effectiveCapacity > 0; }
  override fits(departure: Departure, people: number): boolean { return people <= departure.effectiveCapacity; }
  override refusal(departure: Departure): string {
    return `No hay cupo suficiente en esta salida: quedan ${departure.effectiveCapacity} cupos. No se registró la reserva.`;
  }
}
