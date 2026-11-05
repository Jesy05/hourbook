import { defaultFields, defaultInvoiceSettings, defaultSections, defaultTemplates, defaultTerms, emptyBusiness } from './defaults';
import type {
  Adjustment,
  BusinessDetails,
  Client,
  CustomField,
  Draft,
  ExtraLine,
  InvoiceDraft,
  InvoiceSettings,
  InvoiceTemplate,
  PaymentTerms,
  Profile,
} from './types';

/*
 * Brings stored data up to the current schema. Every function only fills in
 * what is missing, so running it again on current data changes nothing.
 * Schema v1 -> v2: entry fields (requester, project, custom), detailed invoice
 * settings, clients, templates and richer invoice drafts.
 */

type Loose = Record<string, unknown>;

function obj(value: unknown): Loose {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Loose) : {};
}
function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}
function list<T>(value: unknown, fn: (item: Loose) => T | null): T[] {
  return Array.isArray(value) ? value.map((v) => fn(obj(v))).filter((v): v is T => v !== null) : [];
}

function normalizeBusiness(value: unknown, fallback: BusinessDetails): BusinessDetails {
  const b = obj(value);
  const out: BusinessDetails = {
    name: str(b.name, fallback.name),
    address: str(b.address, fallback.address),
    email: str(b.email, fallback.email),
    phone: str(b.phone, fallback.phone),
    taxId: str(b.taxId, fallback.taxId),
  };
  const logo = str(b.logo) || fallback.logo;
  if (logo) out.logo = logo;
  return out;
}

function normalizeClient(c: Loose): Client | null {
  if (typeof c.id !== 'string') return null;
  return {
    id: c.id,
    company: str(c.company),
    contact: str(c.contact),
    address: str(c.address),
    email: str(c.email),
    cc: str(c.cc),
  };
}

function normalizeTerms(value: unknown, fallback: PaymentTerms): PaymentTerms {
  const t = obj(value);
  const presets = ['receipt', 'net7', 'net14', 'net15', 'net30', 'custom'];
  return {
    preset: presets.includes(str(t.preset)) ? (t.preset as PaymentTerms['preset']) : fallback.preset,
    customText: str(t.customText, fallback.customText),
    customDays: typeof t.customDays === 'number' ? t.customDays : fallback.customDays,
  };
}

function normalizeAdjustment(a: Loose): Adjustment | null {
  if (typeof a.id !== 'string') return null;
  return {
    id: a.id,
    label: str(a.label),
    kind: a.kind === 'discount' ? 'discount' : 'tax',
    mode: a.mode === 'fixed' ? 'fixed' : 'percent',
    value: num(a.value, 0),
  };
}

function normalizeExtraLine(l: Loose): ExtraLine | null {
  if (typeof l.id !== 'string') return null;
  return { id: l.id, description: str(l.description), quantity: num(l.quantity, 1), unitPrice: num(l.unitPrice, 0) };
}

export function normalizeTemplate(value: unknown, fallback: InvoiceTemplate = defaultTemplates()[0]): InvoiceTemplate {
  const t = obj(value);
  const formats = ['MM/DD/YY', 'MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'MMM D, YYYY'];
  const groupBy = strList(t.groupBy) as InvoiceTemplate['groupBy'];
  const columns = strList(t.columns) as InvoiceTemplate['columns'];
  return {
    id: str(t.id, fallback.id),
    name: str(t.name, fallback.name),
    groupBy: groupBy.length ? groupBy : fallback.groupBy,
    descriptionTemplate: str(t.descriptionTemplate, fallback.descriptionTemplate),
    columns: columns.length ? columns : fallback.columns,
    dateFormat: formats.includes(str(t.dateFormat)) ? (t.dateFormat as InvoiceTemplate['dateFormat']) : fallback.dateFormat,
    periodMode: t.periodMode === 'calendar' ? 'calendar' : t.periodMode === 'worked' ? 'worked' : fallback.periodMode,
    sections: { ...defaultSections(), ...fallback.sections, ...(obj(t.sections) as Partial<InvoiceTemplate['sections']>) },
  };
}

function normalizeCustomField(f: Loose): CustomField | null {
  if (typeof f.id !== 'string') return null;
  const types = ['text', 'select', 'number', 'checkbox'];
  return {
    id: f.id,
    name: str(f.name),
    type: types.includes(str(f.type)) ? (f.type as CustomField['type']) : 'text',
    options: strList(f.options),
    enabled: f.enabled !== false,
  };
}

export function normalizeInvoiceSettings(value: unknown, profileName: string, legacyContact: string): InvoiceSettings {
  const i = obj(value);
  const base = defaultInvoiceSettings(profileName);
  const billTo = str(i.billTo, base.billTo);
  const apEmail = str(i.apEmail, base.apEmail);
  const ccEmail = str(i.ccEmail, base.ccEmail);

  // v1 had one bill-to text: it becomes the first saved client.
  let clients = list(i.clients, normalizeClient);
  let defaultClientId = typeof i.defaultClientId === 'string' ? i.defaultClientId : null;
  if (!Array.isArray(i.clients)) {
    clients = billTo.trim()
      ? [{ ...base.clients[0], company: billTo.split('\n')[0].trim(), address: billTo.split('\n').slice(1).join('\n').trim(), email: apEmail, cc: ccEmail }]
      : [];
    defaultClientId = clients[0]?.id ?? null;
  }

  const templates = Array.isArray(i.templates)
    ? list(i.templates, (t) => normalizeTemplate(t))
    : defaultTemplates();

  return {
    rate: num(i.rate, base.rate),
    currency: str(i.currency, base.currency) || 'USD',
    currencySymbol: str(i.currencySymbol, base.currencySymbol),
    prefix: str(i.prefix, base.prefix),
    nextNumber: Math.max(1, Math.floor(num(i.nextNumber, base.nextNumber))),
    padding: Math.min(8, Math.max(1, Math.floor(num(i.padding, base.padding)))),
    billTo,
    apEmail,
    ccEmail,
    paymentDetails: str(i.paymentDetails, base.paymentDetails),
    // v1 kept the "From" contact as free text on the profile: it becomes the address.
    business: normalizeBusiness(i.business, { ...emptyBusiness(profileName), address: legacyContact }),
    clients,
    defaultClientId: clients.some((c) => c.id === defaultClientId) ? defaultClientId : (clients[0]?.id ?? null),
    rateOverrides: list(i.rateOverrides, (r) =>
      typeof r.id === 'string' && ['category', 'project', 'client'].includes(str(r.kind))
        ? { id: r.id, kind: r.kind as 'category' | 'project' | 'client', key: str(r.key), rate: num(r.rate, 0) }
        : null,
    ),
    terms: normalizeTerms(i.terms, defaultTerms()),
    notes: str(i.notes, base.notes),
    footer: str(i.footer, base.footer),
    adjustments: list(i.adjustments, normalizeAdjustment),
    fileNameTemplate: str(i.fileNameTemplate, base.fileNameTemplate) || base.fileNameTemplate,
    rounding: ['none', 'quarter', 'tenth', 'up15'].includes(str(i.rounding)) ? (i.rounding as InvoiceSettings['rounding']) : 'none',
    templates,
    defaultTemplateId:
      typeof i.defaultTemplateId === 'string' && templates.some((t) => t.id === i.defaultTemplateId)
        ? i.defaultTemplateId
        : (templates[0]?.id ?? null),
  };
}

export function normalizeProfile(value: Profile): Profile {
  const p = value as unknown as Loose;
  const name = str(p.name);
  return {
    ...value,
    contact: str(p.contact),
    invoice: normalizeInvoiceSettings(p.invoice, name, str(p.contact)),
    categories: strList(p.categories).length ? strList(p.categories) : ['Other'],
    fields: { ...defaultFields(), ...(obj(p.fields) as Partial<Profile['fields']>) },
    requesters: strList(p.requesters),
    projects: strList(p.projects),
    customFields: list(p.customFields, normalizeCustomField),
  };
}

function normalizeInvoiceDraft(value: InvoiceDraft, profile: Profile | undefined): InvoiceDraft {
  const d = value as unknown as Loose;
  const isV1 = !('template' in d);
  // v1 drafts keep their look: calendar period, no terms block, lines left as they were.
  const v1Template: InvoiceTemplate = { ...defaultTemplates()[0], periodMode: 'calendar', sections: { ...defaultSections(), terms: false } };
  const legacyClient: Client = {
    id: 'legacy-client',
    company: str(d.billTo).split('\n')[0]?.trim() ?? '',
    contact: '',
    address: str(d.billTo).split('\n').slice(1).join('\n').trim(),
    email: profile?.invoice.apEmail ?? '',
    cc: profile?.invoice.ccEmail ?? '',
  };
  const client = normalizeClient(obj(d.client)) ?? legacyClient;
  return {
    ...value,
    currency: str(d.currency, 'USD') || 'USD',
    currencySymbol: str(d.currencySymbol),
    business: normalizeBusiness(d.business, { ...emptyBusiness(str(d.fromName)), address: str(d.fromContact) }),
    clientId: typeof d.clientId === 'string' ? d.clientId : null,
    client,
    terms: normalizeTerms(d.terms, defaultTerms()),
    notes: str(d.notes),
    footer: str(d.footer, 'Thank you for your business.'),
    adjustments: list(d.adjustments, normalizeAdjustment),
    extraLines: list(d.extraLines, normalizeExtraLine),
    rounding: ['none', 'quarter', 'tenth', 'up15'].includes(str(d.rounding)) ? (d.rounding as InvoiceDraft['rounding']) : 'none',
    template: isV1 ? v1Template : normalizeTemplate(d.template),
    linesManual: isV1 ? d.linesManual !== false : d.linesManual === true,
  };
}

export function normalizeDraft(draft: Draft, profiles: Profile[]): Draft {
  if (draft.type !== 'invoice') return draft;
  return normalizeInvoiceDraft(draft, profiles.find((p) => p.id === draft.profileId));
}
