import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { newProfile } from '../defaults';
import { generateInvoiceDraft } from '../drafts';
import { buildInvoicePdf } from '../pdf/invoice';
import type { Entry, InvoiceDraft, OvertimeDraft, RedeemedEntry } from '../types';
import { normalizeDraft } from '../migrate';
import { buildInvoiceWorkbook, invoiceFileName } from './invoice';
import { buildOvertimeWorkbook, overtimeFileName } from './overtime';

const h = (hours: number, minutes = 0, seconds = 0) => hours * 3600 + minutes * 60 + seconds;

async function roundTrip(wb: ExcelJS.Workbook): Promise<ExcelJS.Workbook> {
  const buffer = await wb.xlsx.writeBuffer();
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(buffer as ArrayBuffer);
  return back;
}

const otDraft: OvertimeDraft = {
  id: 'd1',
  profileId: 'p1',
  type: 'overtime',
  periodStart: '2026-08-01',
  periodEnd: '2026-09-13',
  createdAt: 0,
  updatedAt: 0,
  edited: false,
  standardHours: 40,
  hoursPerDay: 8,
  openingBalance: 170.09,
  weeks: [
    { id: 'w1', weekStart: '2026-08-03', workedSeconds: h(45, 42) },
    { id: 'w2', weekStart: '2026-08-10', workedSeconds: h(43, 57) },
    { id: 'w3', weekStart: '2026-08-17', workedSeconds: h(34, 0) },
  ],
  months: [
    {
      id: 'm1',
      month: '2026-08',
      rows: [
        { id: 'r1', weekStart: '2026-08-03', seconds: h(45, 42) },
        { id: 'r2', weekStart: '2026-08-10', seconds: h(43, 57) },
      ],
    },
    { id: 'm2', month: '2026-09', rows: [{ id: 'r3', weekStart: '2026-08-31', seconds: h(34, 48) }] },
  ],
};

const redeemed: RedeemedEntry[] = [
  { id: 'x1', profileId: 'p1', date: '2026-08-11', hours: 1, note: '' },
  { id: 'x2', profileId: 'p1', date: '2026-08-19', endDate: '2026-08-21', hours: 86, note: 'Vacation' },
];

describe('overtime workbook', () => {
  it('writes real formulas with cached results', async () => {
    const wb = await roundTrip(buildOvertimeWorkbook('Jaimie Gonzalez', otDraft, redeemed));
    const ws = wb.getWorksheet('OT Tracker')!;
    expect(ws.getCell('A3').value).toBe('Week date');
    expect(ws.getCell('C4').formula).toBe('MAX(0,B4-$G$4/24)');
    expect(ws.getCell('D4').formula).toBe('C4*24');
    expect(ws.getCell('D4').result).toBeCloseTo(5.7, 5);
    expect(ws.getCell('D6').result).toBe(0);

    expect(ws.getCell('F7').value).toBe('OVER TIME');
    expect(ws.getCell('G7').formula).toBe('SUM(D4:D6)+G6');
    // 5.70 + 3.95 + 0 + 170.09 opening
    expect(ws.getCell('G7').result).toBe(179.74);
    expect(ws.getCell('G8').result).toBe(87);
    expect(ws.getCell('G9').formula).toBe('G7-G8');
    expect(ws.getCell('G9').result).toBe(92.74);
    expect(ws.getCell('G10').formula).toBe('IF(G5>0,G9/G5,0)');
    expect(ws.getCell('G10').result).toBe(11.59);
  });

  it('formats durations, dates and the redeemed range', async () => {
    const wb = await roundTrip(buildOvertimeWorkbook('Jaimie Gonzalez', otDraft, redeemed));
    const ws = wb.getWorksheet('OT Tracker')!;
    expect(ws.getCell('A4').numFmt).toBe('d-mmm');
    expect(ws.getCell('B4').numFmt).toBe('[h]:mm');
    expect(ws.getCell('I5').value).toBe('19-21 Aug');
    expect(ws.getCell('M3').value).toBe('AUG');
    expect(ws.getCell('M4').numFmt).toBe('[h]:mm:ss');
    expect(ws.getCell('M6').formula).toBe('SUM(M4:M5)');
    expect(ws.getCell('N3').value).toBe('SEP');
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 3 });
  });

  it('names the file after the person and year', () => {
    expect(overtimeFileName('Jaimie González', otDraft)).toBe('Jaimie_Gonzalez_OT_Tracker_2026.xlsx');
  });
});

// Written in the v1 shape and upgraded, like data saved before schema v2.
const invoiceDraft = normalizeDraft({
  id: 'i1',
  profileId: 'p2',
  type: 'invoice',
  periodStart: '2026-10-01',
  periodEnd: '2026-10-31',
  createdAt: 0,
  updatedAt: 0,
  edited: false,
  invoiceNumber: 'INV-0007',
  issueDate: '2026-10-31',
  fromName: 'Jesy Gonzalez',
  fromContact: 'jesy@example.com\nManagua, Nicaragua',
  billTo: 'Outside Meets Inside, LLC',
  currency: 'USD',
  paymentDetails: 'Bank transfer',
  lines: [
    { id: 'l1', description: 'Travel booking', hours: 12.5, rate: 20 },
    { id: 'l2', description: 'Calendar', hours: 3.33, rate: 20 },
  ],
  timesheet: [
    { id: 't1', date: '2026-10-01', start: '09:00:00', end: '11:30:00', hours: 2.5, category: 'Travel booking', description: 'Flights' },
    { id: 't2', date: '2026-10-02', start: '', end: '', hours: 1, category: 'Calendar', description: '' },
  ],
} as unknown as InvoiceDraft, []) as InvoiceDraft;

describe('invoice workbook', () => {
  const entries: Entry[] = [
    { id: 'e1', profileId: 'p1', date: '2026-10-29', start: '07:00:28', end: '11:11:19', seconds: 15051, description: 'Event setup', category: 'Other', requestedBy: 'Naima', project: 'NYC Glamsquad event', createdAt: 0 },
    { id: 'e2', profileId: 'p1', date: '2026-10-30', start: '09:00:00', end: '11:00:00', seconds: 7200, description: 'Budget', category: 'Other', requestedBy: 'Jaimie', project: 'Budget', createdAt: 0 },
  ];
  const base = { ...newProfile(), id: 'p1', name: 'Jesy Nicole González Jarquín', invoiceMode: true };
  const profile = {
    ...base,
    invoice: { ...base.invoice, rate: 20, defaultTemplateId: 'tpl-daily', terms: { preset: 'net14' as const, customText: '', customDays: null } },
  };
  const generated = generateInvoiceDraft(profile, entries, '2026-10-01', '2026-10-31', '2026-10-31');
  const draft: InvoiceDraft = {
    ...generated,
    extraLines: [{ id: 'x', description: 'Parking', quantity: 2, unitPrice: 25 }],
    adjustments: [
      { id: 'd', label: 'Discount', kind: 'discount', mode: 'percent', value: 10 },
      { id: 't', label: 'Tax', kind: 'tax', mode: 'percent', value: 5 },
    ],
  };
  const cells = (ws: ExcelJS.Worksheet) => {
    const out: { address: string; value: unknown; formula?: string; result?: unknown }[] = [];
    ws.eachRow((row) => row.eachCell((cell) => out.push({ address: cell.address, value: cell.value, formula: cell.formula, result: cell.result })));
    return out;
  };

  it('writes the lines with the template description and real formulas', async () => {
    const wb = await roundTrip(buildInvoiceWorkbook(draft, { customFields: [] }));
    const inv = wb.getWorksheet('Invoice')!;
    const all = cells(inv);
    expect(inv.getCell('A1').value).toBe('INVOICE');
    expect(all.some((c) => c.value === '10/29/26 | Naima - NYC Glamsquad event | 4.18 hours')).toBe(true);
    expect(all.some((c) => c.value === '10/30/26 | Jaimie - Budget | 2.00 hours')).toBe(true);
    const amounts = all.filter((c) => /^ROUND\(B\d+\*C\d+,2\)$/.test(c.formula ?? ''));
    expect(amounts.map((c) => c.result)).toEqual([83.6, 40, 50]); // two time lines, then the extra item (2 x 25)
    expect(all.find((c) => c.formula?.startsWith('-ROUND('))?.result).toBe(-17.36); // 10% off 173.60
    expect(all.find((c) => c.formula?.startsWith('ROUND(('))?.result).toBe(7.81); // 5% of 156.24
    const total = all.find((c) => typeof c.value === 'string' && c.value.startsWith('TOTAL AMOUNT DUE'));
    expect(total?.value).toBe('TOTAL AMOUNT DUE (USD)');
    expect(all.some((c) => c.formula && c.result === 164.05)).toBe(true);
  });

  it('shows terms, due date, service period and currency', async () => {
    const wb = await roundTrip(buildInvoiceWorkbook(draft, { customFields: [] }));
    const inv = wb.getWorksheet('Invoice')!;
    const byLabel = (label: string) => {
      const found = cells(inv).find((c) => c.value === label);
      return found ? inv.getCell(found.address).row : null;
    };
    expect(inv.getCell(`B${byLabel('Terms')}`).value).toBe('Net 14');
    expect(inv.getCell(`B${byLabel('Due date')}`).value).toEqual(new Date(Date.UTC(2026, 10, 14)));
    expect(inv.getCell(`B${byLabel('Due date')}`).numFmt).toBe('mm/dd/yy');
    expect(inv.getCell(`B${byLabel('Service period')}`).value).toBe('10/29/26 - 10/30/26'); // dates worked
    expect(inv.getCell(`B${byLabel('Currency')}`).value).toBe('USD');
    expect(inv.views[0]).toMatchObject({ state: 'frozen', ySplit: 2 });
    expect(inv.pageSetup).toMatchObject({ fitToPage: true, fitToWidth: 1 });
    expect(inv.pageSetup.printArea).toMatch(/^A1:D\d+$/);
    const moneyCell = cells(inv).find((c) => c.formula?.startsWith('ROUND(B'))!;
    expect(inv.getCell(moneyCell.address).numFmt).toContain('"$"');
  });

  it('uses a due date set by hand, and keeps it when regenerating', async () => {
    const manual = { ...draft, dueDateOverride: '2026-12-15' };
    const wb = await roundTrip(buildInvoiceWorkbook(manual, { customFields: [] }));
    const inv = wb.getWorksheet('Invoice')!;
    const row = inv.getCell(cells(inv).find((c) => c.value === 'Due date')!.address).row;
    expect(inv.getCell(`B${row}`).value).toEqual(new Date(Date.UTC(2026, 11, 15)));
    expect(generateInvoiceDraft(profile, entries, '2026-10-01', '2026-10-31', '2026-10-31', manual).dueDateOverride).toBe('2026-12-15');
    expect(normalizeDraft({ ...manual, dueDateOverride: 'not a date' }, [profile])).not.toHaveProperty('dueDateOverride', 'not a date');
  });

  it('adds the timesheet sheet with every field', async () => {
    const wb = await roundTrip(buildInvoiceWorkbook(draft, { customFields: [] }));
    const ts = wb.getWorksheet('Timesheet')!;
    expect(ts.getRow(3).values).toEqual([undefined, 'Date', 'Start', 'End', 'Hours', 'Requested by', 'Project', 'Category', 'Description']);
    expect(ts.getCell('D4').value).toBe(4.18);
    expect(ts.getCell('E4').value).toBe('Naima');
    expect(ts.getCell('D6').formula).toBe('SUM(D4:D5)');
    expect(ts.getCell('D6').result).toBe(6.18);
  });

  it('leaves out hidden sections', async () => {
    const hidden = { ...draft, template: { ...draft.template, sections: { ...draft.template.sections, timesheet: false, from: false } } };
    const wb = await roundTrip(buildInvoiceWorkbook(hidden, { customFields: [] }));
    expect(wb.getWorksheet('Timesheet')).toBeUndefined();
    expect(cells(wb.getWorksheet('Invoice')!).some((c) => c.value === 'FROM')).toBe(false);
  });

  it('still exports a draft saved before schema v2', async () => {
    const wb = await roundTrip(buildInvoiceWorkbook(invoiceDraft, { customFields: [] }));
    const all = cells(wb.getWorksheet('Invoice')!);
    expect(all.some((c) => c.formula && c.result === 316.6)).toBe(true);
  });

  it('names the file from the profile template, without unsafe characters', () => {
    expect(invoiceFileName(draft, '{name}_Invoice_{yyyy}-{mm}')).toBe('Jesy_Nicole_Gonzalez_Jarquin_Invoice_2026-10.xlsx');
  });

  it('exports the same invoice as a Letter-size PDF', async () => {
    const bytes = await buildInvoicePdf(draft, []);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(2); // invoice + timesheet
    expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(pdf.getTitle()).toBe('Invoice INV-0001');
  });
});

describe('palettes', () => {
  it('uses the Hourbook colors by default', async () => {
    const wb = await roundTrip(buildOvertimeWorkbook('Jaimie Gonzalez', otDraft, redeemed));
    const ws = wb.getWorksheet('OT Tracker')!;
    expect((ws.getCell('A1').fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FFC93638');
    expect((ws.getCell('A3').fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FFFA855A');
  });

  it('applies the chosen palette with readable text on every role', async () => {
    const draft = { ...otDraft, palette: { title: '#1F4E79', header: '#9DC3E6', stripe: '#EEF5FB', total: '#FFD966' } };
    const wb = await roundTrip(buildOvertimeWorkbook('Jaimie Gonzalez', draft, redeemed));
    const ws = wb.getWorksheet('OT Tracker')!;
    const fill = (a: string) => (ws.getCell(a).fill as ExcelJS.FillPattern).fgColor?.argb;
    expect(fill('A1')).toBe('FF1F4E79'); // title band
    expect(ws.getCell('A1').font.color?.argb).toBe('FFFFFFFF'); // white on dark blue
    expect(fill('A3')).toBe('FF9DC3E6'); // header
    expect(ws.getCell('A3').font.color?.argb).toBe('FF2B2B2B'); // dark on light blue
    expect(fill('A5')).toBe('FFEEF5FB'); // second body row is striped
    expect(fill('A4')).toBe('FFFFFFFF'); // first body row stays white
    expect(fill('G9')).toBe('FFFFD966'); // BALANCE total
  });
});
