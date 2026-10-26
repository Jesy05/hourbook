import type { ExcelPalette } from './palettes';

export type Language = 'es' | 'en';

/** 0 = Sunday ... 6 = Saturday, same convention as date-fns. */
export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface InvoiceSettings {
  rate: number;
  currency: string;
  prefix: string;
  nextNumber: number;
  billTo: string;
  apEmail: string;
  ccEmail: string;
  paymentDetails: string;
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
  /** Last Excel palette used, offered for the next report. */
  excelPalette?: ExcelPalette;
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
}

export interface InvoiceLine {
  id: string;
  description: string;
  hours: number;
  rate: number;
}

export interface TimesheetRow {
  id: string;
  date: string;
  start: string;
  end: string;
  hours: number;
  category: string;
  description: string;
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
  fromName: string;
  fromContact: string;
  billTo: string;
  currency: string;
  paymentDetails: string;
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
