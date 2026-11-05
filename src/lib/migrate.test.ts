import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, validateData } from './storage';
import type { InvoiceDraft } from './types';

/* A backup in the v1 shape, as saved before schema v2. */
const v1 = {
  version: 1,
  language: 'es',
  activeProfileId: 'p1',
  profiles: [
    {
      id: 'p1',
      name: 'Jesy Nicole González Jarquín',
      contact: 'jesy@example.com\nManagua, Nicaragua',
      timeZone: 'America/Managua',
      invoiceMode: true,
      overtimeMode: false,
      invoice: {
        rate: 20,
        currency: 'USD',
        prefix: 'INV-',
        nextNumber: 3,
        billTo: 'Outside Meets Inside, LLC',
        apEmail: 'ap@omiwellbeauty.com',
        ccEmail: 'cc@example.com',
        paymentDetails: 'Wise (USD)',
      },
      overtime: { standardHours: 40, weekStartsOn: 1, hoursPerDay: 8, openingBalance: 0 },
      categories: ['Calendar', 'Other'],
      customPalette: { title: '#7A1F5C', header: '#FA855A', stripe: '#FFF6E0', total: '#A7E8BD' },
      createdAt: 0,
    },
  ],
  entries: [
    { id: 'e1', profileId: 'p1', date: '2026-10-29', start: '07:00:28', end: '11:11:19', seconds: 15051, description: 'Glamsquad', category: 'Other', createdAt: 0 },
  ],
  redeemed: [],
  drafts: [
    {
      id: 'd1',
      profileId: 'p1',
      type: 'invoice',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      createdAt: 0,
      updatedAt: 0,
      edited: true,
      invoiceNumber: 'INV-0002',
      issueDate: '2026-10-31',
      fromName: 'Jesy Nicole González Jarquín',
      fromContact: 'jesy@example.com',
      billTo: 'Outside Meets Inside, LLC',
      currency: 'USD',
      paymentDetails: 'Wise (USD)',
      lines: [{ id: 'l1', description: 'Other', hours: 4.18, rate: 25 }],
      timesheet: [],
    },
    {
      id: 'd2',
      profileId: 'p1',
      type: 'overtime',
      periodStart: '2026-01-01',
      periodEnd: '2026-10-31',
      createdAt: 0,
      updatedAt: 0,
      edited: false,
      standardHours: 40,
      hoursPerDay: 8,
      openingBalance: 0,
      weeks: [],
      months: [],
    },
  ],
  timers: {},
};

describe('migration from schema v1 to v2', () => {
  const migrated = validateData(structuredClone(v1))!;
  const profile = migrated.profiles[0];

  it('upgrades the version and keeps every entry as it was', () => {
    expect(migrated.version).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(2);
    expect(migrated.entries).toEqual(v1.entries);
  });

  it('turns the old bill-to text into a saved client', () => {
    expect(profile.invoice.clients).toHaveLength(1);
    expect(profile.invoice.clients[0]).toMatchObject({
      company: 'Outside Meets Inside, LLC',
      email: 'ap@omiwellbeauty.com',
      cc: 'cc@example.com',
    });
    expect(profile.invoice.defaultClientId).toBe(profile.invoice.clients[0].id);
  });

  it('keeps the old settings and adds sensible defaults', () => {
    expect(profile.invoice).toMatchObject({ rate: 20, currency: 'USD', prefix: 'INV-', nextNumber: 3, padding: 4, paymentDetails: 'Wise (USD)' });
    expect(profile.invoice.business).toMatchObject({ name: 'Jesy Nicole González Jarquín', address: 'jesy@example.com\nManagua, Nicaragua' });
    expect(profile.invoice.terms.preset).toBe('receipt');
    expect(profile.invoice.rounding).toBe('none');
    expect(profile.invoice.templates.map((t) => t.id)).toEqual(['tpl-category', 'tpl-daily']);
    expect(profile.fields).toEqual({ category: true, requestedBy: false, project: false });
    expect(profile).toMatchObject({ requesters: [], projects: [], customFields: [], categories: ['Calendar', 'Other'] });
    expect(profile.customPalette?.title).toBe('#7A1F5C');
  });

  it('keeps old invoice drafts looking the same', () => {
    const draft = migrated.drafts[0] as InvoiceDraft;
    expect(draft.lines).toEqual(v1.drafts[0].lines);
    expect(draft.linesManual).toBe(true); // hand-made lines are not rebuilt
    expect(draft.template.periodMode).toBe('calendar');
    expect(draft.template.sections.terms).toBe(false);
    expect(draft.client.company).toBe('Outside Meets Inside, LLC');
    expect(draft).toMatchObject({ adjustments: [], extraLines: [], rounding: 'none', currencySymbol: '' });
    expect(migrated.drafts[1]).toEqual(v1.drafts[1]); // overtime drafts are untouched
  });

  it('changes nothing when run again on current data', () => {
    expect(validateData(structuredClone(migrated))).toEqual(migrated);
  });

  it('refuses data from a newer version of the app', () => {
    expect(validateData({ ...structuredClone(v1), version: SCHEMA_VERSION + 1 })).toBeNull();
  });
});
