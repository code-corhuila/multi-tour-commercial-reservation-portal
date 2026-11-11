import { Observable } from 'rxjs';
import { AdditionalDiscount, AdditionalDiscountCommand } from '../model/current-discounts';

/** PROPUESTO (G-API): one Idempotency-Key per intention, reused on retry (norm 5.3.8). */
export abstract class AdditionalDiscountWriter {
  abstract register(command: AdditionalDiscountCommand, idempotencyKey: string): Observable<AdditionalDiscount>;
}
