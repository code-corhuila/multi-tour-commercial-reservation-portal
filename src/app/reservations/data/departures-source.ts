import { Observable } from 'rxjs';
import { Departure } from '../model/reservation';
/** What the self-service screens read through this port instead of the model of 007- (amendment 2026-10-13, plan H-D2). */
export { openDepartures } from '../model/reservation';
export type { Departure } from '../model/reservation';
/** Stands in for HU-OPS-001 (gap G-OPS): when operations publishes departures, only the adapter changes. */
export abstract class DeparturesSource {
  abstract list(): Observable<readonly Departure[]>;
}
