import { Observable, of } from 'rxjs';
import { ProofFileSource } from '../payments/data/proof-file-source';

/** A one-page PDF with the words "Comprobante de demostración", written here so the demo has no file to store; every demo proof shows it. */
const DEMO_PDF = '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
  + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 120]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n'
  + '4 0 obj<</Length 57>>stream\nBT /F1 14 Tf 20 60 Td (Comprobante de demostracion) Tj ET\nendstream\nendobj\n'
  + '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R/Size 6>>\n%%EOF';

/** DEMO: the delivered portal opens a small invented PDF held in memory (all names, amounts and files are invented). */
export class DemoProofFileSource extends ProofFileSource {
  override read(_paymentId: string): Observable<Blob> { return of(new Blob([DEMO_PDF], { type: 'application/pdf' })); }
}
