import ExcelJS from 'exceljs';
import { format, parseISO } from 'date-fns';
import { lineAmount, round2, timeToSeconds } from '../calc';
import { invoiceDraftTotals } from '../drafts';
import { formatMonthEnglish, safeFileName } from '../format';
import type { InvoiceDraft } from '../types';
import {
  ARGB,
  bodyCell,
  currencyFormat,
  excelDate,
  excelDuration,
  FMT,
  font,
  formula,
  headerCell,
  headerRow,
  labelCell,
  solid,
  titleBand,
  totalCell,
} from './styles';

/* Monthly invoice: an "Invoice" sheet plus a "Timesheet" sheet with every entry. */

export function invoiceFileName(draft: InvoiceDraft): string {
  return `${safeFileName(draft.fromName)}_Invoice_${draft.periodStart.slice(0, 7)}.xlsx`;
}

function periodText(draft: InvoiceDraft): string {
  const a = parseISO(draft.periodStart);
  const b = parseISO(draft.periodEnd);
  return `${format(a, 'MMMM d')} - ${format(b, 'MMMM d, yyyy')}`;
}

export function buildInvoiceWorkbook(draft: InvoiceDraft): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hourbook';
  wb.created = new Date();
  const money = currencyFormat(draft.currency);
  const month = formatMonthEnglish(draft.periodStart.slice(0, 7));

  /* ---------- Invoice sheet ---------- */
  const ws = wb.addWorksheet('Invoice', {
    properties: { defaultRowHeight: 18 },
    views: [{ state: 'frozen', ySplit: 2, showGridLines: false }],
  });
  ws.columns = [{ width: 46 }, { width: 13 }, { width: 14 }, { width: 18 }];

  titleBand(ws, 1, 1, 4, 'INVOICE', 20);
  titleBand(ws, 2, 1, 4, `${draft.fromName}  |  Invoice ${draft.invoiceNumber}  |  ${month}`, 11);

  let r = 4;
  const details: [string, ExcelJS.CellValue, string?][] = [
    ['Invoice number', draft.invoiceNumber],
    ['Issue date', excelDate(draft.issueDate), FMT.longDate],
    ['Billing period', periodText(draft)],
  ];
  for (const [label, value, numFmt] of details) {
    labelCell(ws.getCell(r, 1), label);
    ws.mergeCells(r, 2, r, 4);
    const cell = ws.getCell(r, 2);
    cell.value = value;
    cell.font = font();
    cell.alignment = { horizontal: 'left' };
    if (numFmt) cell.numFmt = numFmt;
    r++;
  }

  r++;
  headerCell(ws.getCell(r, 1), 'FROM');
  ws.mergeCells(r, 2, r, 4);
  headerCell(ws.getCell(r, 2), 'BILL TO');
  r++;
  const fromLines = [draft.fromName, ...draft.fromContact.split('\n')].map((l) => l.trim()).filter(Boolean);
  const billLines = draft.billTo.split('\n').map((l) => l.trim()).filter(Boolean);
  const blockRows = Math.max(fromLines.length, billLines.length, 1);
  for (let i = 0; i < blockRows; i++) {
    const a = ws.getCell(r, 1);
    a.value = fromLines[i] ?? '';
    a.font = font({ bold: i === 0 });
    ws.mergeCells(r, 2, r, 4);
    const b = ws.getCell(r, 2);
    b.value = billLines[i] ?? '';
    b.font = font({ bold: i === 0 });
    r++;
  }

  r++;
  const headerRowIndex = r;
  headerRow(ws, r, 1, ['Description', 'Hours', 'Rate', 'Amount'], [1, 2, 3]);
  r++;
  const firstLine = r;
  draft.lines.forEach((line, i) => {
    const desc = ws.getCell(r, 1);
    desc.value = line.description;
    bodyCell(desc, i);
    const hours = ws.getCell(r, 2);
    hours.value = line.hours;
    bodyCell(hours, i, FMT.decimal, 'right');
    const rate = ws.getCell(r, 3);
    rate.value = line.rate;
    bodyCell(rate, i, money, 'right');
    const amount = ws.getCell(r, 4);
    amount.value = formula(`ROUND(B${r}*C${r},2)`, lineAmount(line.hours, line.rate));
    bodyCell(amount, i, money, 'right');
    r++;
  });
  const lastLine = r - 1;
  const totals = invoiceDraftTotals(draft);
  const hasLines = lastLine >= firstLine;

  const totalLabel = ws.getCell(r, 1);
  totalLabel.value = 'Total hours';
  totalCell(totalLabel);
  const totalHours = ws.getCell(r, 2);
  totalHours.value = hasLines ? formula(`SUM(B${firstLine}:B${lastLine})`, totals.hours) : 0;
  totalCell(totalHours, FMT.decimal, 'right');
  totalCell(ws.getCell(r, 3));
  const totalAmount = ws.getCell(r, 4);
  totalAmount.value = hasLines ? formula(`SUM(D${firstLine}:D${lastLine})`, totals.amount) : 0;
  totalCell(totalAmount, money, 'right');
  const totalRow = r;
  r += 2;

  ws.mergeCells(r, 1, r, 3);
  const dueLabel = ws.getCell(r, 1);
  dueLabel.value = 'TOTAL AMOUNT DUE';
  dueLabel.font = font({ bold: true, size: 14, color: { argb: ARGB.white } });
  dueLabel.fill = solid(ARGB.tomato);
  dueLabel.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
  const due = ws.getCell(r, 4);
  due.value = formula(`D${totalRow}`, totals.amount);
  due.numFmt = money;
  due.font = font({ bold: true, size: 14, color: { argb: ARGB.white } });
  due.fill = solid(ARGB.tomato);
  due.alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getRow(r).height = 28;
  r += 2;

  if (draft.paymentDetails.trim()) {
    ws.mergeCells(r, 1, r, 4);
    headerCell(ws.getCell(r, 1), 'PAYMENT DETAILS');
    r++;
    for (const line of draft.paymentDetails.split('\n')) {
      ws.mergeCells(r, 1, r, 4);
      const cell = ws.getCell(r, 1);
      cell.value = line;
      cell.font = font();
      r++;
    }
    r++;
  }

  ws.mergeCells(r, 1, r, 4);
  const thanks = ws.getCell(r, 1);
  thanks.value = 'Thank you for your business.';
  thanks.font = font({ italic: true, color: { argb: ARGB.muted } });

  ws.pageSetup = {
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printArea: `A1:D${r}`,
    horizontalCentered: true,
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  };
  ws.getRow(headerRowIndex).height = 20;

  /* ---------- Timesheet sheet ---------- */
  const ts = wb.addWorksheet('Timesheet', {
    properties: { defaultRowHeight: 18 },
    views: [{ state: 'frozen', ySplit: 3 }],
  });
  ts.columns = [{ width: 12 }, { width: 9 }, { width: 9 }, { width: 10 }, { width: 24 }, { width: 60 }];
  titleBand(ts, 1, 1, 6, `${draft.fromName}  |  Timesheet  |  ${month}`);
  headerRow(ts, 3, 1, ['Date', 'Start', 'End', 'Hours', 'Category', 'Description'], [3]);
  let tr = 4;
  draft.timesheet.forEach((row, i) => {
    const cells = [1, 2, 3, 4, 5, 6].map((c) => ts.getCell(tr, c));
    cells[0].value = row.date ? excelDate(row.date) : '';
    bodyCell(cells[0], i, FMT.date, 'left');
    cells[1].value = row.start ? excelDuration(timeToSeconds(row.start)) : '';
    bodyCell(cells[1], i, FMT.clock, 'right');
    cells[2].value = row.end ? excelDuration(timeToSeconds(row.end)) : '';
    bodyCell(cells[2], i, FMT.clock, 'right');
    cells[3].value = row.hours;
    bodyCell(cells[3], i, FMT.decimal, 'right');
    cells[4].value = row.category;
    bodyCell(cells[4], i);
    cells[5].value = row.description;
    bodyCell(cells[5], i);
    tr++;
  });
  const tsTotal = [1, 2, 3, 4, 5, 6].map((c) => ts.getCell(tr, c));
  tsTotal.forEach((c) => totalCell(c));
  tsTotal[0].value = 'Total';
  tsTotal[3].value =
    draft.timesheet.length > 0 ? formula(`SUM(D4:D${tr - 1})`, round2(totals.timesheetHours)) : 0;
  totalCell(tsTotal[3], FMT.decimal, 'right');
  ts.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printArea: `A1:F${tr}`,
    printTitlesRow: '3:3',
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
  };
  if (draft.timesheet.length) ts.autoFilter = { from: 'A3', to: `F${tr - 1}` };
  return wb;
}
