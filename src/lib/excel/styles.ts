import type { Borders, Cell, Fill, Font, Worksheet } from 'exceljs';

/* Shared look for every exported workbook: the app palette, Calibri 11, thin gray borders. */

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

/** A merged tomato band with white bold text. */
export function titleBand(ws: Worksheet, row: number, fromCol: number, toCol: number, text: string, size = 14): void {
  ws.mergeCells(row, fromCol, row, toCol);
  const cell = ws.getCell(row, fromCol);
  cell.value = text;
  cell.font = font({ bold: true, size, color: { argb: ARGB.white } });
  cell.fill = solid(ARGB.tomato);
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(row).height = size > 14 ? 34 : 26;
  for (let c = fromCol; c <= toCol; c++) ws.getCell(row, c).fill = solid(ARGB.tomato);
}

export function headerCell(cell: Cell, value: string, align: 'left' | 'right' | 'center' = 'left'): void {
  cell.value = value;
  cell.font = font({ bold: true });
  cell.fill = solid(ARGB.coral);
  cell.border = BORDER;
  cell.alignment = { vertical: 'middle', horizontal: align, wrapText: true };
}

export function headerRow(ws: Worksheet, row: number, startCol: number, labels: string[], rightAligned: number[] = []): void {
  labels.forEach((label, i) => headerCell(ws.getCell(row, startCol + i), label, rightAligned.includes(i) ? 'right' : 'left'));
  ws.getRow(row).height = 20;
}

/** Body cell with the alternating white / light peach stripe. */
export function bodyCell(cell: Cell, stripe: number, numFmt?: string, align?: 'left' | 'right' | 'center'): void {
  cell.font = font();
  cell.fill = solid(stripe % 2 === 0 ? ARGB.white : ARGB.peachSoft);
  cell.border = BORDER;
  if (numFmt) cell.numFmt = numFmt;
  cell.alignment = { vertical: 'top', horizontal: align, wrapText: align === undefined };
}

export function totalCell(cell: Cell, numFmt?: string, align?: 'left' | 'right'): void {
  cell.font = font({ bold: true });
  cell.fill = solid(ARGB.sky);
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
