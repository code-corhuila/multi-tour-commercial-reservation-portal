import { Injector, Provider } from '@angular/core';
import { RESERVATION_FORM_SECTIONS, contribute } from '../../shared/portal-slots';
import { CustomersSource } from '../data/customers-source';
import { CompanionsSectionComponent } from './companions-section.component';
import { TitularSectionComponent } from './titular-section.component';

const withCustomers = (injector: Injector) => injector.get(CustomersSource, null) !== null;

/** HU-COM-005 amendment 2026-10-14 (A.2 row 1): sections 01 and 03 of 10B. The form of HU-COM-007 hosts them (orders 10 and 30, around 02 at 20). */
export const RESERVATION_FORM_CONTRIBUTIONS: Provider[] = [
  contribute(RESERVATION_FORM_SECTIONS, { component: TitularSectionComponent, order: 10, isAvailable: withCustomers }),
  contribute(RESERVATION_FORM_SECTIONS, { component: CompanionsSectionComponent, order: 30, isAvailable: withCustomers }),
];
