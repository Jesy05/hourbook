import type { Borders, Cell, Fill, Font, Worksheet } from 'exceljs';
import { normalizePalette, textOn, type ExcelPalette } from '../palettes';

/* Shared look for every exported workbook: the chosen palette, Calibri 11, thin gray borders. */

export const ARGB = {
  tomato: 'FFC93638',
  coral: 'FFFA855A',
  peach: 'FFFFDE96',
  peachSoft: 'FFFFF6E0',
  sky: 'FF62C4DA',
  skySoft: 'FFE4F5F9',
  ink: 'FF2B2B2B',
  muted: 'FF5C5C5C',
  line: 'FFD9D9D9',
  white: 'FFFFFFFF',
};

export const FMT = {
  hm: '[h]:mm',
  hms: '[h]:mm:ss',
  clock: 'h:mm',
  decimal: '0.00',
  date: 'd-mmm',
  longDate: 'mmmm d, yyyy',
};

export function currencyFormat(currency: string): string {
  const symbols: Record<string, string> = { USD: '$', CAD: '$', MXN: '$', EUR: '€', GBP: '£', NIO: 'C$' };
  const symbol = symbols[currency];
  return symbol ? `"${symbol}"#,##0.00` : `#,##0.00 "${currency}"`;
}

export function solid(argb: string): Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

export function font(extra: Partial<Font> = {}): Partial<Font> {
  return { name: 'Calibri', size: 11, color: { argb: ARGB.ink }, ...extra };
}

const thin = { style: 'thin' as const, color: { argb: ARGB.line } };
export const BORDER: Partial<Borders> = { top: thin, left: thin, bottom: thin, right: thin };

/** Excel serial value for a calendar date. exceljs converts Date objects as UTC. */
export function excelDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function excelDuration(seconds: number): number {
  return seconds / 86400;
}

export function columnLetter(index: number): string {
  let n = index;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Fill and text colors (ARGB) for each palette role. */
export interface ExcelColors {
  titleFill: string;
  titleText: string;
  headerFill: string;
  headerText: string;
  stripeFill: string;
  stripeText: string;
  totalFill: string;
  totalText: string;
}

function argb(hex: string): string {
  return `FF${hex.slice(1).toUpperCase()}`;
}

export function excelColors(palette: ExcelPalette): ExcelColors {
  const p = normalizePalette(palette);
  return {
    titleFill: argb(p.title),
    titleText: argb(textOn(p.title)),
    headerFill: argb(p.header),
    headerText: argb(textOn(p.header)),
    stripeFill: argb(p.stripe),
    stripeText: argb(textOn(p.stripe)),
    totalFill: argb(p.total),
    totalText: argb(textOn(p.total)),
  };
}

/** A merged band in the title color. */
export function titleBand(c: ExcelColors, ws: Worksheet, row: number, fromCol: number, toCol: number, text: string, size = 14): void {
  ws.mergeCells(row, fromCol, row, toCol);
  const cell = ws.getCell(row, fromCol);
  cell.value = text;
  cell.font = font({ bold: true, size, color: { argb: c.titleText } });
  cell.fill = solid(c.titleFill);
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(row).height = size > 14 ? 34 : 26;
  for (let col = fromCol; col <= toCol; col++) ws.getCell(row, col).fill = solid(c.titleFill);
}

export function headerCell(c: ExcelColors, cell: Cell, value: string, align: 'left' | 'right' | 'center' = 'left'): void {
  cell.value = value;
  cell.font = font({ bold: true, color: { argb: c.headerText } });
  cell.fill = solid(c.headerFill);
  cell.border = BORDER;
  cell.alignment = { vertical: 'middle', horizontal: align, wrapText: true };
}

export function headerRow(c: ExcelColors, ws: Worksheet, row: number, startCol: number, labels: string[], rightAligned: number[] = []): void {
  labels.forEach((label, i) => headerCell(c, ws.getCell(row, startCol + i), label, rightAligned.includes(i) ? 'right' : 'left'));
  ws.getRow(row).height = 20;
}

/** Body cell; every other row gets the stripe color. */
export function bodyCell(c: ExcelColors, cell: Cell, stripe: number, numFmt?: string, align?: 'left' | 'right' | 'center'): void {
  const striped = stripe % 2 === 1;
  cell.font = font(striped ? { color: { argb: c.stripeText } } : {});
  cell.fill = solid(striped ? c.stripeFill : ARGB.white);
  cell.border = BORDER;
  if (numFmt) cell.numFmt = numFmt;
  cell.alignment = { vertical: 'top', horizontal: align, wrapText: align === undefined };
}

export function totalCell(c: ExcelColors, cell: Cell, numFmt?: string, align?: 'left' | 'right'): void {
  cell.font = font({ bold: true, color: { argb: c.totalText } });
  cell.fill = solid(c.totalFill);
  cell.border = BORDER;
  if (numFmt) cell.numFmt = numFmt;
  if (align) cell.alignment = { horizontal: align, vertical: 'middle' };
}

export function labelCell(cell: Cell, value: string, bold = true): void {
  cell.value = value;
  cell.font = font({ bold, color: { argb: bold ? ARGB.ink : ARGB.muted } });
  cell.alignment = { vertical: 'top' };
}

/** A formula with its cached result, so previews show values before recalculation. */
export function formula(formulaText: string, result: number | string) {
  return { formula: formulaText, result };
}
