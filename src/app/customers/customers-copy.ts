import { HighRiskField, PersonField } from './model/customer-group';

export const CUSTOMERS_COPY = {
  entry: 'People', title: 'Lead customer and companions',
  banner: 'Demo data in memory: invented people, no e-mail link to an account and no audit of consultations.',
  loading: 'Loading people…', failed: 'The people could not be loaded.', retry: 'Retry',
  empty: 'No group yet: register its lead customer.', denied: 'Your role cannot open this area.',
  lead: 'Lead customer', companion: 'Companion', highRisk: 'High-risk activity', restricted: 'Restricted',
  newGroup: 'New group', registerLead: 'Register lead customer', addCompanion: 'Add companion',
  saving: 'Saving…', refused: 'The registration was refused.',
  activity: 'Activity', chooseActivity: 'Choose an activity', terms: 'I accept the terms', yes: 'Given',
} as const;

export const PERSON_LABELS: Record<Exclude<PersonField, 'serviceId' | 'acceptedTerms'>, string> = {
  fullName: 'Full name', document: 'Document', contact: 'Contact', birthDate: 'Birth date',
  informedConsent: 'Informed consent', bloodType: 'Blood type', emergencyContact: 'Emergency contact', physicalRestrictions: 'Physical restrictions',
};

export const SENSITIVE_LABELS: readonly [HighRiskField, string][] = (['bloodType', 'physicalRestrictions', 'emergencyContact', 'informedConsent'] as const)
  .map((field) => [field, PERSON_LABELS[field]]);
