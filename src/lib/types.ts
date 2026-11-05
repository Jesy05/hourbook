import type { ExcelPalette } from './palettes';

export type Language = 'es' | 'en';

/** 0 = Sunday ... 6 = Saturday, same convention as date-fns. */
export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/* ---------- entry fields ---------- */

export type CustomFieldType = 'text' | 'select' | 'number' | 'checkbox';
export type CustomValue = string | number | boolean;

export interface CustomField {
  id: string;
  name: string;
  type: CustomFieldType;
  /** Choices for a single-select field. */
  options: string[];
  enabled: boolean;
}

/** Which optional entry fields this profile uses. */
export interface EntryFieldSettings {
  category: boolean;
  requestedBy: boolean;
  project: boolean;
}

/* ---------- invoices ---------- */

export interface BusinessDetails {
  name: string;
  address: string;
  email: string;
  phone: string;
  taxId: string;
  /** Logo as a data URL (PNG or JPEG), size limited. */
  logo?: string;
}

export interface Client {
  id: string;
  company: string;
  contact: string;
  address: string;
  email: string;
  cc: string;
}

export type RateOverrideKind = 'category' | 'project' | 'client';

export interface RateOverride {
  id: string;
  kind: RateOverrideKind;
  /** Category name, project name or client id. */
  key: string;
  rate: number;
}

export type TermsPreset = 'receipt' | 'net7' | 'net14' | 'net15' | 'net30' | 'custom';

export interface PaymentTerms {
  preset: TermsPreset;
  /** Text shown for custom terms. */
  customText: string;
  /** Days until due for custom terms; empty means no due date. */
  customDays: number | null;
}

export interface Adjustment {
  id: string;
  label: string;
  kind: 'tax' | 'discount';
  mode: 'percent' | 'fixed';
  value: number;
}

export interface ExtraLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export type RoundingRule = 'none' | 'quarter' | 'tenth' | 'up15';

/** 'entry' is one line per entry; field keys group lines; custom fields use `custom:<id>`. */
export type GroupKey = 'entry' | 'date' | 'category' | 'project' | 'requestedBy' | `custom:${string}`;
export type ColumnKey = 'description' | 'date' | 'hours' | 'rate' | 'amount' | 'category' | 'project' | 'requestedBy' | `custom:${string}`;
export type DateFormat = 'MM/DD/YY' | 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MMM D, YYYY';
export type ServicePeriodMode = 'worked' | 'calendar';

export interface InvoiceSections {
  from: boolean;
  billTo: boolean;
  terms: boolean;
  payment: boolean;
  notes: boolean;
  timesheet: boolean;
}

export interface InvoiceTemplate {
  id: string;
  name: string;
  groupBy: GroupKey[];
  descriptionTemplate: string;
  columns: ColumnKey[];
  dateFormat: DateFormat;
  periodMode: ServicePeriodMode;
  sections: InvoiceSections;
}

export interface InvoiceSettings {
  /** Default hourly rate. */
  rate: number;
  /** ISO currency code, e.g. USD. */
  currency: string;
  /** Optional symbol that replaces the standard one, e.g. "US$". */
  currencySymbol: string;
  prefix: string;
  nextNumber: number;
  /** Digits of the invoice number, e.g. 4 gives INV-0001. */
  padding: number;
  /** Legacy single bill-to text, kept for old data; clients replace it. */
  billTo: string;
  apEmail: string;
  ccEmail: string;
  /** Payment instructions shown on the invoice. */
  paymentDetails: string;
  business: BusinessDetails;
  clients: Client[];
  defaultClientId: string | null;
  rateOverrides: RateOverride[];
  terms: PaymentTerms;
  notes: string;
  footer: string;
  /** Tax or discount lines added to every new invoice. */
  adjustments: Adjustment[];
  fileNameTemplate: string;
  rounding: RoundingRule;
  templates: InvoiceTemplate[];
  defaultTemplateId: string | null;
}

export interface OvertimeSettings {
  standardHours: number;
  weekStartsOn: WeekDay;
  hoursPerDay: number;
  openingBalance: number;
}

export interface Profile {
  id: string;
  name: string;
  /** Free text written in the "From" block of the invoice (email, phone, address). */
  contact: string;
  timeZone: string;
  invoiceMode: boolean;
  overtimeMode: boolean;
  invoice: InvoiceSettings;
  overtime: OvertimeSettings;
  categories: string[];
  fields: EntryFieldSettings;
  /** Saved values for the "Requested by" and "Project" pickers. */
  requesters: string[];
  projects: string[];
  /** Favorites shown first in the pickers, in this order. */
  pinnedRequesters: string[];
  pinnedProjects: string[];
  customFields: CustomField[];
  /** Last Excel palette used, offered for the next report. */
  excelPalette?: ExcelPalette;
  /** The one saved custom palette, kept even while a preset is in use. */
  customPalette?: ExcelPalette;
  createdAt: number;
}

export interface Entry {
  id: string;
  profileId: string;
  /** Local calendar date in the profile time zone, YYYY-MM-DD. */
  date: string;
  /** Local wall-clock time HH:mm:ss, absent for duration-only entries. */
  start?: string;
  end?: string;
  /** Worked time in seconds. */
  seconds: number;
  description: string;
  category: string;
  /** Person or department the work was for. */
  requestedBy?: string;
  project?: string;
  /** Custom field values keyed by field id. */
  custom?: Record<string, CustomValue>;
  createdAt: number;
}

export interface RedeemedEntry {
  id: string;
  profileId: string;
  /** YYYY-MM-DD */
  date: string;
  /** Optional last day for a range such as 4-12 Jun. */
  endDate?: string;
  hours: number;
  note: string;
}

export interface TimerSegment {
  start: number;
  end: number;
}

export interface TimerState {
  /** Epoch ms of the running segment, null when paused. */
  runningSince: number | null;
  segments: TimerSegment[];
  description: string;
  category: string;
  requestedBy?: string;
  project?: string;
  custom?: Record<string, CustomValue>;
}

export interface InvoiceLine {
  id: string;
  description: string;
  /** Billed hours at full precision (after the rounding rule). */
  hours: number;
  rate: number;
  /** Values of the grouped entries, used by the optional columns. */
  date?: string;
  category?: string;
  project?: string;
  requestedBy?: string;
  custom?: Record<string, string>;
}

export interface TimesheetRow {
  id: string;
  /** The tracker entry this row came from; edits to the row are saved to it. */
  entryId?: string;
  date: string;
  start: string;
  end: string;
  hours: number;
  /** True when the hours were typed by hand instead of coming from start and end. */
  hoursEdited?: boolean;
  category: string;
  description: string;
  requestedBy?: string;
  project?: string;
  custom?: Record<string, CustomValue>;
}

export interface InvoiceDraft {
  id: string;
  profileId: string;
  type: 'invoice';
  periodStart: string;
  periodEnd: string;
  createdAt: number;
  updatedAt: number;
  edited: boolean;
  /** Colors used in the exported workbook. */
  palette?: ExcelPalette;
  invoiceNumber: string;
  issueDate: string;
  /** Legacy "From" fields, still filled for older readers. */
  fromName: string;
  fromContact: string;
  /** Legacy bill-to text; `client` is used from schema v2. */
  billTo: string;
  currency: string;
  currencySymbol: string;
  paymentDetails: string;
  business: BusinessDetails;
  clientId: string | null;
  client: Client;
  terms: PaymentTerms;
  /** Due date set by hand (YYYY-MM-DD); wins over the one from the terms. */
  dueDateOverride?: string;
  notes: string;
  footer: string;
  adjustments: Adjustment[];
  extraLines: ExtraLine[];
  rounding: RoundingRule;
  template: InvoiceTemplate;
  /** True once line items were edited by hand; until then they follow the timesheet. */
  linesManual?: boolean;
  lines: InvoiceLine[];
  timesheet: TimesheetRow[];
}

export interface OvertimeWeekRow {
  id: string;
  weekStart: string;
  /** Hours worked that week, in seconds. */
  workedSeconds: number;
}

export interface MonthBlockRow {
  id: string;
  weekStart: string;
  seconds: number;
}

export interface MonthBlock {
  id: string;
  /** YYYY-MM */
  month: string;
  rows: MonthBlockRow[];
}

export interface OvertimeDraft {
  id: string;
  profileId: string;
  type: 'overtime';
  periodStart: string;
  periodEnd: string;
  createdAt: number;
  updatedAt: number;
  edited: boolean;
  palette?: ExcelPalette;
  standardHours: number;
  hoursPerDay: number;
  openingBalance: number;
  weeks: OvertimeWeekRow[];
  months: MonthBlock[];
}

export type Draft = InvoiceDraft | OvertimeDraft;

export interface AppData {
  version: number;
  language: Language;
  activeProfileId: string | null;
  profiles: Profile[];
  entries: Entry[];
  redeemed: RedeemedEntry[];
  drafts: Draft[];
  timers: Record<string, TimerState>;
}
