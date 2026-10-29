import { describe, expect, it } from 'vitest';
import { DemoCustomersStore } from '../src/app/demo/customers-demo';

const typed = { fullName: 'Titular Ficticio', document: 'DEMO-9001', email: 'camila.ortega@example.test', phone: '300 000 9001', birthDate: '1990-01-01' };

describe('aNormalizedEmailOfAVerifiedAccountLinksTheCustomer', () => {
  it('links a titular typed by hand to the verified customer with the same e-mail', () => {
    const store = new DemoCustomersStore();
    const before = store.all().length;
    expect(store.register(typed)).toBe('demo-cus-1');
    expect(store.all()).toHaveLength(before);
  });
  it('a not verified e-mail does not link', () => {
    const store = new DemoCustomersStore();
    const id = store.register({ ...typed, email: 'laura.gomez@example.test' });
    expect(id).not.toBe('demo-cus-3');
    expect(store.all()).toHaveLength(4);
  });
  it('the e-mail is compared trimmed and without case', () => {
    const store = new DemoCustomersStore();
    expect(store.register({ ...typed, email: '  Camila.ORTEGA@Example.Test ' })).toBe('demo-cus-1');
    expect(store.register({ ...typed, email: ' ANDRES.pinto@example.test' })).toBe('demo-cus-2');
  });
  it('names the linked customer, not the typed name', () => {
    const store = new DemoCustomersStore();
    expect(store.nameOf(store.register(typed))).toBe('Camila Ortega (demo)');
  });
});
