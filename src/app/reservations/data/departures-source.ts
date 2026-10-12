import { Observable } from 'rxjs';
import { Departure } from '../model/reservation';
/** Stands in for HU-OPS-001 (gap G-OPS): when operations publishes departures, only the adapter changes. */
export abstract class DeparturesSource {
  abstract list(): Observable<readonly Departure[]>;
}
