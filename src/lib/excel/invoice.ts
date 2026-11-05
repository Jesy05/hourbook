import ExcelJS from 'exceljs';
import { timeToSeconds } from '../calc';
import { buildInvoiceDocument, type InvoiceDocument } from '../invoice/document';
import { invoiceFileName } from '../invoice/filename';
import { fitInBox, readImage } from '../invoice/image';
import { excelCurrencyFormat } from '../invoice/money';
import { EXCEL_DATE_FORMATS } from '../invoice/template';
import { normalizePalette } from '../palettes';
import type { CustomField, InvoiceDraft } from '../types';
import {
  ARGB,
  bodyCell,
  columnLetter,
  excelColors,
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
  type ExcelColors,
} from './styles';

/*
 * Invoice workbook: an "Invoice" sheet laid out by the draft's template, plus an
 * optional "Timesheet" sheet. Amounts, subtotal, taxes, discounts and the total
 * are real formulas with cached results, so the file previews correctly and
 * still recalculates when edited in Excel.
 */

export { invoiceFileName };

export interface InvoiceExportOptions {
  customFields: CustomField[];
}

const WIDTHS: Record<string, number> = { description: 46, date: 12, hours: 10, rate: 12, amount: 15, category: 18, project: 22, requestedBy: 20 };

function writeBlock(ws: ExcelJS.Worksheet, row: number, from: number, to: number, title: string, lines: string[], c: ExcelColors): number {
  if (to > from) ws.mergeCells(row, from, row, to);
  headerCell(c, ws.getCell(row, from), title);
  lines.forEach((text, i) => {
    const r = row + 1 + i;
    if (to > from) ws.mergeCells(r, from, r, to);
    const cell = ws.getCell(r, from);
    cell.value = text;
    cell.font = font({ bold: i === 0 });
  });
  return row + 1 + lines.length;
}

function writeTextSection(ws: ExcelJS.Worksheet, row: number, lastCol: number, title: string, text: string, c: ExcelColors): number {
  ws.mergeCells(row, 1, row, lastCol);
  headerCell(c, ws.getCell(row, 1), title);
  let r = row + 1;
  for (const line of text.split('\n')) {
    ws.mergeCells(r, 1, r, lastCol);
    const cell = ws.getCell(r, 1);
    cell.value = line;
    cell.font = font();
    cell.alignment = { wrapText: true, vertical: 'top' };
    r++;
  }
  return r + 1;
}

export function buildInvoiceWorkbook(draft: InvoiceDraft, options: InvoiceExportOptions): ExcelJS.Workbook {
  const doc = buildInvoiceDocument(draft, options.customFields);
  const c = excelColors(normalizePalette(draft.palette));
  const money = excelCurrencyFormat(doc.currency, doc.currencySymbol);
  const dateFmt = EXCEL_DATE_FORMATS[doc.dateFormat];
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hourbook';
  wb.created = new Date();

  writeInvoiceSheet(wb, doc, c, money, dateFmt);
  if (doc.timesheet) writeTimesheetSheet(wb, doc, c, dateFmt);
  return wb;
}

function writeInvoiceSheet(wb: ExcelJS.Workbook, doc: InvoiceDocument, c: ExcelColors, money: string, dateFmt: string): void {
  const ws = wb.addWorksheet('Invoice', {
    properties: { defaultRowHeight: 18 },
    views: [{ state: 'frozen', ySplit: 2, showGridLines: false }],
  });
  // At least four columns so the header blocks and totals have room.
  const lastCol = Math.max(4, doc.columns.length);
  for (let i = 1; i <= lastCol; i++) {
    const key = doc.columns[i - 1]?.key ?? '';
    ws.getColumn(i).width = WIDTHS[key] ?? (key.startsWith('custom:') ? 16 : 14);
  }

  titleBand(c, ws, 1, 1, lastCol, 'INVOICE', 20);
  titleBand(c, ws, 2, 1, lastCol, `${doc.from?.lines[0] ?? ''}  |  Invoice ${doc.number}  |  ${doc.servicePeriod.text}`, 11);

  // Details on the left, logo on the right.
  let r = 4;
  const details: [string, ExcelJS.CellValue, string?][] = [
    ['Invoice number', doc.number],
    ['Issue date', excelDate(doc.issueDate), dateFmt],
  ];
  if (doc.terms) details.push(['Terms', doc.terms]);
  if (doc.dueDate) details.push(['Due date', excelDate(doc.dueDate), dateFmt]);
  details.push(['Service period', doc.servicePeriod.text], ['Currency', doc.currency]);
  const detailEnd = Math.max(2, lastCol - 2);
  for (const [label, value, numFmt] of details) {
    labelCell(ws.getCell(r, 1), label);
    if (detailEnd > 2) ws.mergeCells(r, 2, r, detailEnd);
    const cell = ws.getCell(r, 2);
    cell.value = value;
    cell.font = font();
    cell.alignment = { horizontal: 'left' };
    if (numFmt) cell.numFmt = numFmt;
    r++;
  }
  const logo = readImage(doc.from?.logo);
  if (logo) {
    const id = wb.addImage({ base64: logo.base64, extension: logo.type });
    const size = fitInBox(logo.width, logo.height, 180, 80);
    ws.addImage(id, { tl: { col: lastCol - 2 + 0.1, row: 3.2 }, ext: size });
  }

  // From and Bill to side by side.
  r++;
  const half = Math.ceil(lastCol / 2);
  let blockEnd = r;
  if (doc.from) blockEnd = Math.max(blockEnd, writeBlock(ws, r, 1, doc.billTo ? half : lastCol, 'FROM', doc.from.lines, c));
  if (doc.billTo) blockEnd = Math.max(blockEnd, writeBlock(ws, r, doc.from ? half + 1 : 1, lastCol, 'BILL TO', doc.billTo.lines, c));
  r = blockEnd + 1;

  // Line items, with the columns and order chosen in the template.
  const col = (key: string) => doc.columns.findIndex((x) => x.key === key) + 1;
  const hoursCol = col('hours');
  const rateCol = col('rate');
  const amountCol = col('amount');
  const numeric = doc.columns.map((x, i) => (x.kind === 'hours' || x.kind === 'money' ? i : -1)).filter((i) => i >= 0);
  headerRow(c, ws, r, 1, doc.columns.map((x) => x.label), numeric);
  const headerRowIndex = r;
  r++;
  const firstLine = r;
  doc.lines.forEach((line, i) => {
    doc.columns.forEach((column, ci) => {
      const cell = ws.getCell(r, ci + 1);
      const raw = line.values[column.key];
      if (column.key === 'amount' && hoursCol && rateCol) {
        cell.value = formula(`ROUND(${columnLetter(hoursCol)}${r}*${columnLetter(rateCol)}${r},2)`, line.amount);
      } else if (column.kind === 'date') {
        cell.value = raw ? excelDate(String(raw)) : '';
      } else {
        cell.value = raw;
      }
      const fmt = column.kind === 'money' ? money : column.kind === 'hours' ? FMT.decimal : column.kind === 'date' ? dateFmt : undefined;
      bodyCell(c, cell, i, fmt, column.kind === 'text' ? undefined : column.kind === 'date' ? 'left' : 'right');
    });
    r++;
  });
  const lastLine = r - 1;
  const hasLines = lastLine >= firstLine;
  for (let ci = 1; ci <= doc.columns.length; ci++) totalCell(c, ws.getCell(r, ci));
  ws.getCell(r, 1).value = 'Total hours';
  if (hoursCol) {
    const cell = ws.getCell(r, hoursCol);
    const L = columnLetter(hoursCol);
    cell.value = hasLines ? formula(`SUM(${L}${firstLine}:${L}${lastLine})`, doc.lines.reduce((s, l) => s + l.hours, 0)) : 0;
    totalCell(c, cell, FMT.decimal, 'right');
  }
  let linesTotalRef: string | null = null;
  if (amountCol) {
    const cell = ws.getCell(r, amountCol);
    const L = columnLetter(amountCol);
    cell.value = hasLines ? formula(`SUM(${L}${firstLine}:${L}${lastLine})`, doc.totals.linesSubtotal) : 0;
    totalCell(c, cell, money, 'right');
    linesTotalRef = `${L}${r}`;
  }
  r += 2;

  // Extra items: Description | Quantity | Unit price | Amount.
  let extrasTotalRef: string | null = null;
  if (doc.extras.length) {
    headerRow(c, ws, r, 1, ['Other charges', 'Quantity', 'Unit price', 'Amount'], [1, 2, 3]);
    r++;
    const first = r;
    doc.extras.forEach((extra, i) => {
      const cells = [1, 2, 3, 4].map((x) => ws.getCell(r, x));
      cells[0].value = extra.description;
      bodyCell(c, cells[0], i);
      cells[1].value = extra.quantity;
      bodyCell(c, cells[1], i, '0.##', 'right');
      cells[2].value = extra.unitPrice;
      bodyCell(c, cells[2], i, money, 'right');
      cells[3].value = formula(`ROUND(B${r}*C${r},2)`, extra.amount);
      bodyCell(c, cells[3], i, money, 'right');
      r++;
    });
    for (let x = 1; x <= 4; x++) totalCell(c, ws.getCell(r, x));
    ws.getCell(r, 1).value = 'Other charges total';
    ws.getCell(r, 4).value = formula(`SUM(D${first}:D${r - 1})`, doc.totals.extrasSubtotal);
    totalCell(c, ws.getCell(r, 4), money, 'right');
    extrasTotalRef = `D${r}`;
    r += 2;
  }

  // Summary in the last two columns: subtotal, discounts, taxes, total due.
  const labelCol = lastCol - 1;
  const valueCol = lastCol;
  const V = columnLetter(valueCol);
  const subtotalRow = r;
  const subtotalParts = [linesTotalRef, extrasTotalRef].filter(Boolean);
  labelCell(ws.getCell(r, labelCol), 'Subtotal');
  const subtotal = ws.getCell(r, valueCol);
  subtotal.value = subtotalParts.length ? formula(subtotalParts.join('+'), doc.totals.subtotal) : doc.totals.subtotal;
  subtotal.numFmt = money;
  subtotal.font = font({ bold: true });
  r++;
  const discountRows: number[] = [];
  for (const adj of doc.totals.adjustments) {
    const source = doc.adjustmentsById[adj.id];
    labelCell(ws.getCell(r, labelCol), adj.label || (adj.kind === 'tax' ? 'Tax' : 'Discount'), false);
    const cell = ws.getCell(r, valueCol);
    if (adj.kind === 'discount') {
      cell.value = source?.mode === 'percent' ? formula(`-ROUND(${V}${subtotalRow}*${source.value}/100,2)`, adj.amount) : adj.amount;
      discountRows.push(r);
    } else {
      // Taxes apply to the subtotal after discounts.
      const base = [`${V}${subtotalRow}`, ...discountRows.map((x) => `${V}${x}`)].join('+');
      cell.value = source?.mode === 'percent' ? formula(`ROUND((${base})*${source.value}/100,2)`, adj.amount) : adj.amount;
    }
    cell.numFmt = money;
    cell.font = font();
    r++;
  }
  if (labelCol > 1) ws.mergeCells(r, 1, r, labelCol);
  const dueLabel = ws.getCell(r, 1);
  dueLabel.value = `TOTAL AMOUNT DUE (${doc.currency})`;
  dueLabel.font = font({ bold: true, size: 14, color: { argb: c.titleText } });
  dueLabel.fill = solid(c.titleFill);
  dueLabel.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
  const total = ws.getCell(r, valueCol);
  total.value = formula(`${V}${subtotalRow}${r > subtotalRow + 1 ? `+SUM(${V}${subtotalRow + 1}:${V}${r - 1})` : ''}`, doc.totals.total);
  total.numFmt = money;
  total.font = font({ bold: true, size: 14, color: { argb: c.titleText } });
  total.fill = solid(c.titleFill);
  total.alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getRow(r).height = 28;
  r += 2;

  if (doc.roundingNote) {
    ws.mergeCells(r, 1, r, lastCol);
    const note = ws.getCell(r, 1);
    note.value = doc.roundingNote;
    note.font = font({ italic: true, color: { argb: ARGB.muted } });
    r += 2;
  }
  if (doc.payment) r = writeTextSection(ws, r, lastCol, 'PAYMENT INSTRUCTIONS', doc.payment, c);
  if (doc.notes) r = writeTextSection(ws, r, lastCol, 'NOTES', doc.notes, c);
  if (doc.footer) {
    ws.mergeCells(r, 1, r, lastCol);
    const footer = ws.getCell(r, 1);
    footer.value = doc.footer;
    footer.font = font({ italic: true, color: { argb: ARGB.muted } });
  }

  ws.getRow(headerRowIndex).height = 20;
  ws.pageSetup = {
    orientation: lastCol > 5 ? 'landscape' : 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printArea: `A1:${columnLetter(lastCol)}${r}`,
    horizontalCentered: true,
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  };
}

function writeTimesheetSheet(wb: ExcelJS.Workbook, doc: InvoiceDocument, c: ExcelColors, dateFmt: string): void {
  const sheet = doc.timesheet!;
  const ts = wb.addWorksheet('Timesheet', { properties: { defaultRowHeight: 18 }, views: [{ state: 'frozen', ySplit: 3 }] });
  const widths = [12, 10, 10, 9, 20, 22, 18, 50];
  sheet.columns.forEach((_, i) => (ts.getColumn(i + 1).width = widths[i] ?? 16));
  const lastCol = sheet.columns.length;
  titleBand(c, ts, 1, 1, lastCol, `${doc.from?.lines[0] ?? ''}  |  Timesheet  |  ${doc.servicePeriod.text}`);
  headerRow(c, ts, 3, 1, sheet.columns.map((x) => x.label), [3]);
  let r = 4;
  sheet.rows.forEach((row, i) => {
    row.forEach((value, ci) => {
      const kind = sheet.columns[ci].kind;
      const cell = ts.getCell(r, ci + 1);
      if (kind === 'date') cell.value = value ? excelDate(String(value)) : '';
      else if (kind === 'time') cell.value = value ? excelDuration(timeToSeconds(String(value))) : '';
      else cell.value = value;
      const fmt = kind === 'date' ? dateFmt : kind === 'time' ? 'h:mm:ss' : kind === 'hours' ? FMT.decimal : undefined;
      bodyCell(c, cell, i, fmt, kind === 'text' ? undefined : kind === 'date' ? 'left' : 'right');
    });
    r++;
  });
  for (let ci = 1; ci <= lastCol; ci++) totalCell(c, ts.getCell(r, ci));
  ts.getCell(r, 1).value = 'Total';
  ts.getCell(r, 4).value = sheet.rows.length ? formula(`SUM(D4:D${r - 1})`, sheet.totalHours) : 0;
  totalCell(c, ts.getCell(r, 4), FMT.decimal, 'right');
  if (sheet.rows.length) ts.autoFilter = { from: 'A3', to: `${columnLetter(lastCol)}${r - 1}` };
  ts.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printArea: `A1:${columnLetter(lastCol)}${r}`,
    printTitlesRow: '3:3',
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
  };
}
