import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { InvoiceDraft, OvertimeDraft, RedeemedEntry } from '../types';
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

const invoiceDraft: InvoiceDraft = {
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
};

describe('invoice workbook', () => {
  it('has an invoice and a timesheet sheet with formulas', async () => {
    const wb = await roundTrip(buildInvoiceWorkbook(invoiceDraft));
    const inv = wb.getWorksheet('Invoice')!;
    expect(inv.getCell('A1').value).toBe('INVOICE');
    const formulas: string[] = [];
    inv.eachRow((row) =>
      row.eachCell((cell) => {
        if (cell.formula) formulas.push(`${cell.address}=${cell.formula}=${cell.result}`);
      }),
    );
    expect(formulas.some((f) => /ROUND\(B\d+\*C\d+,2\)=250$/.test(f))).toBe(true);
    expect(formulas.some((f) => /SUM\(D\d+:D\d+\)=316\.6$/.test(f))).toBe(true);
    expect(formulas.some((f) => /SUM\(B\d+:B\d+\)=15\.83$/.test(f))).toBe(true);

    const ts = wb.getWorksheet('Timesheet')!;
    expect(ts.getRow(3).values).toEqual([undefined, 'Date', 'Start', 'End', 'Hours', 'Category', 'Description']);
    expect(ts.getCell('D6').formula).toBe('SUM(D4:D5)');
    expect(ts.getCell('D6').result).toBe(3.5);
  });

  it('names the file after the person and month', () => {
    expect(invoiceFileName(invoiceDraft)).toBe('Jesy_Gonzalez_Invoice_2026-10.xlsx');
  });
});
