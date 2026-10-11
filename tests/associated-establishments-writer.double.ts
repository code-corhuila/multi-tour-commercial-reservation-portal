import { Observable, Subject } from 'rxjs';
import { AssociatedEstablishmentsWriter, RegisterEstablishmentCommand } from '../src/app/establishments/data/associated-establishments-writer';
import { AssociatedEstablishment } from '../src/app/establishments/model/associated-establishment';

export class ControllableEstablishmentsWriter extends AssociatedEstablishmentsWriter {
  readonly registrations: Array<{
    command: RegisterEstablishmentCommand; key: string;
    reply: (item: AssociatedEstablishment) => void; fail: (error: unknown) => void;
  }> = [];
  readonly transitions: Array<{
    kind: 'inactivate' | 'reactivate'; id: string; argumentCount: number;
    reply: (item: AssociatedEstablishment) => void; fail: (error: unknown) => void;
  }> = [];
  private request() {
    const answers = new Subject<AssociatedEstablishment>();
    return { answers, reply: (item: AssociatedEstablishment) => { answers.next(item); answers.complete(); },
      fail: (error: unknown) => answers.error(error) };
  }
  override register(command: RegisterEstablishmentCommand, key: string): Observable<AssociatedEstablishment> {
    const { answers, ...callbacks } = this.request();
    this.registrations.push({ command, key, ...callbacks });
    return answers;
  }
  override inactivate(id: string, ...args: unknown[]): Observable<AssociatedEstablishment> {
    return this.transition('inactivate', id, args.length + 1);
  }
  override reactivate(id: string, ...args: unknown[]): Observable<AssociatedEstablishment> {
    return this.transition('reactivate', id, args.length + 1);
  }
  private transition(kind: 'inactivate' | 'reactivate', id: string, argumentCount: number) {
    const { answers, ...callbacks } = this.request();
    this.transitions.push({ kind, id, argumentCount, ...callbacks });
    return answers;
  }
}
