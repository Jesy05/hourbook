import { browserTimeZone } from './tz';
import type { Profile } from './types';

export const DEFAULT_CATEGORIES = [
  'Calendar',
  'Travel booking',
  'Reservations',
  'Email & coordination',
  'Meetings',
  'Other',
];

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function newProfile(): Profile {
  return {
    id: newId(),
    name: '',
    contact: '',
    timeZone: browserTimeZone(),
    invoiceMode: false,
    overtimeMode: false,
    invoice: {
      rate: 0,
      currency: 'USD',
      prefix: 'INV-',
      nextNumber: 1,
      billTo: 'Outside Meets Inside, LLC',
      apEmail: 'ap@omiwellbeauty.com',
      ccEmail: '',
      paymentDetails: '',
    },
    overtime: {
      standardHours: 40,
      weekStartsOn: 1,
      hoursPerDay: 8,
      openingBalance: 0,
    },
    categories: [...DEFAULT_CATEGORIES],
    createdAt: Date.now(),
  };
}
