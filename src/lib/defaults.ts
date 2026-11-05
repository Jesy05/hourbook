import { browserTimeZone } from './tz';
import type {
  BusinessDetails,
  Client,
  EntryFieldSettings,
  InvoiceSections,
  InvoiceSettings,
  InvoiceTemplate,
  PaymentTerms,
  Profile,
} from './types';

export const DEFAULT_CATEGORIES = [
  'Calendar',
  'Travel booking',
  'Reservations',
  'Email & coordination',
  'Meetings',
  'Other',
];

export const DEFAULT_FILE_NAME_TEMPLATE = '{name}_Invoice_{yyyy}-{mm}';

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function defaultSections(): InvoiceSections {
  return { from: true, billTo: true, terms: true, payment: true, notes: true, timesheet: true };
}

/** Starter layouts every invoice profile gets; both can be edited or deleted. */
export function defaultTemplates(): InvoiceTemplate[] {
  return [
    {
      id: 'tpl-category',
      name: 'Por categoría',
      groupBy: ['category'],
      descriptionTemplate: '{category}',
      columns: ['description', 'hours', 'rate', 'amount'],
      dateFormat: 'MM/DD/YY',
      periodMode: 'worked',
      sections: defaultSections(),
    },
    {
      id: 'tpl-daily',
      name: 'Mensual - por día',
      groupBy: ['date', 'requestedBy', 'project'],
      descriptionTemplate: '{date} | {requestedBy} - {project} | {hours} hours',
      columns: ['description', 'hours', 'rate', 'amount'],
      dateFormat: 'MM/DD/YY',
      periodMode: 'worked',
      sections: defaultSections(),
    },
  ];
}

export function emptyBusiness(name = ''): BusinessDetails {
  return { name, address: '', email: '', phone: '', taxId: '' };
}

export function emptyClient(company = ''): Client {
  return { id: newId(), company, contact: '', address: '', email: '', cc: '' };
}

export function defaultTerms(): PaymentTerms {
  return { preset: 'receipt', customText: '', customDays: null };
}

export function defaultFields(): EntryFieldSettings {
  return { category: true, requestedBy: false, project: false };
}

export function defaultInvoiceSettings(name = ''): InvoiceSettings {
  const client: Client = { ...emptyClient('Outside Meets Inside, LLC'), email: 'ap@omiwellbeauty.com' };
  return {
    rate: 0,
    currency: 'USD',
    currencySymbol: '',
    prefix: 'INV-',
    nextNumber: 1,
    padding: 4,
    billTo: client.company,
    apEmail: client.email,
    ccEmail: '',
    paymentDetails: '',
    business: emptyBusiness(name),
    clients: [client],
    defaultClientId: client.id,
    rateOverrides: [],
    terms: defaultTerms(),
    notes: '',
    footer: 'Thank you for your business.',
    adjustments: [],
    fileNameTemplate: DEFAULT_FILE_NAME_TEMPLATE,
    rounding: 'none',
    templates: defaultTemplates(),
    defaultTemplateId: 'tpl-category',
  };
}

export function newProfile(): Profile {
  return {
    id: newId(),
    name: '',
    contact: '',
    timeZone: browserTimeZone(),
    invoiceMode: false,
    overtimeMode: false,
    invoice: defaultInvoiceSettings(),
    overtime: {
      standardHours: 40,
      weekStartsOn: 1,
      hoursPerDay: 8,
      openingBalance: 0,
    },
    categories: [...DEFAULT_CATEGORIES],
    fields: defaultFields(),
    requesters: [],
    projects: [],
    customFields: [],
    createdAt: Date.now(),
  };
}
