import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { buildInvoiceDocument, type InvoiceDocument } from '../invoice/document';
import { fitInBox, readImage } from '../invoice/image';
import { normalizePalette, textOn } from '../palettes';
import type { CustomField, InvoiceDraft } from '../types';

/*
 * Invoice PDF at US Letter size, drawn from the same InvoiceDocument as the
 * Excel export so both always show the same data, colors and sections.
 */

const LETTER: [number, number] = [612, 792];
const MARGIN = 40;
const LINE = 1.3;

function hex(color: string): RGB {
  const n = parseInt(color.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const INK = hex('#2B2B2B');
const MUTED = hex('#5C5C5C');
const LINE_COLOR = hex('#D9D9D9');
const WHITE = hex('#FFFFFF');

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

/** Characters the standard PDF fonts cannot draw are replaced, so export never fails. */
function makeSanitizer(fonts: Fonts) {
  const ok = new Map<string, boolean>();
  const supported = (ch: string) => {
    if (!ok.has(ch)) {
      try {
        fonts.regular.encodeText(ch);
        fonts.bold.encodeText(ch);
        ok.set(ch, true);
      } catch {
        ok.set(ch, false);
      }
    }
    return ok.get(ch)!;
  };
  return (text: string) =>
    [...text.replace(/\t/g, ' ')]
      .map((ch) => (supported(ch) ? ch : supported(ch.normalize('NFD')[0] ?? '') ? ch.normalize('NFD')[0] : '?'))
      .join('');
}

class Writer {
  page: PDFPage;
  y: number;
  constructor(
    private pdf: PDFDocument,
    public fonts: Fonts,
    public clean: (text: string) => string,
    private size: [number, number] = LETTER,
  ) {
    this.page = pdf.addPage(size);
    this.y = size[1] - MARGIN;
  }
  get width() {
    return this.size[0] - MARGIN * 2;
  }
  newPage(size: [number, number] = this.size) {
    this.size = size;
    this.page = this.pdf.addPage(size);
    this.y = size[1] - MARGIN;
  }
  ensure(height: number) {
    if (this.y - height < MARGIN) this.newPage();
  }
  wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const out: string[] = [];
    for (const paragraph of this.clean(text).split('\n')) {
      let line = '';
      for (const word of paragraph.split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) line = next;
        else {
          out.push(line);
          line = word;
        }
      }
      out.push(line);
    }
    return out;
  }
  text(text: string, x: number, y: number, size: number, opts: { bold?: boolean; color?: RGB; align?: 'left' | 'right'; width?: number } = {}) {
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    const clean = this.clean(text);
    const dx = opts.align === 'right' && opts.width ? opts.width - font.widthOfTextAtSize(clean, size) : 0;
    this.page.drawText(clean, { x: x + dx, y, size, font, color: opts.color ?? INK });
  }
  rect(x: number, y: number, width: number, height: number, color: RGB, border = false) {
    this.page.drawRectangle({ x, y, width, height, color, borderColor: border ? LINE_COLOR : undefined, borderWidth: border ? 0.5 : 0 });
  }
  /** A band across the page with text, e.g. the title. */
  band(text: string, fill: string, size: number, height: number) {
    this.ensure(height);
    this.rect(MARGIN, this.y - height, this.width, height, hex(fill));
    this.text(text, MARGIN + 10, this.y - height / 2 - size / 3, size, { bold: true, color: hex(textOn(fill)) });
    this.y -= height;
  }
  paragraph(text: string, size: number, opts: { color?: RGB; bold?: boolean } = {}) {
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    for (const line of this.wrap(text, font, size, this.width)) {
      this.ensure(size * LINE);
      this.y -= size * LINE;
      this.text(line, MARGIN, this.y, size, opts);
    }
  }
}

interface TableColumn {
  label: string;
  width: number;
  align: 'left' | 'right';
}

function drawTable(
  w: Writer,
  columns: TableColumn[],
  rows: string[][],
  palette: ReturnType<typeof normalizePalette>,
  totalRow: string[] | null,
  size = 9,
) {
  const pad = 4;
  const drawRow = (cells: string[], fill: string | null, bold: boolean) => {
    const font = bold ? w.fonts.bold : w.fonts.regular;
    const wrapped = cells.map((cell, i) => w.wrap(cell, font, size, columns[i].width - pad * 2));
    const height = Math.max(...wrapped.map((l) => l.length)) * size * LINE + pad * 2;
    w.ensure(height);
    let x = MARGIN;
    const color = fill ? hex(textOn(fill)) : INK;
    columns.forEach((col, i) => {
      w.rect(x, w.y - height, col.width, height, fill ? hex(fill) : WHITE, true);
      wrapped[i].forEach((line, li) => {
        w.text(line, x + pad, w.y - pad - (li + 1) * size * LINE + 2, size, { bold, color, align: col.align, width: col.width - pad * 2 });
      });
      x += col.width;
    });
    w.y -= height;
  };
  drawRow(columns.map((c) => c.label), palette.header, true);
  rows.forEach((cells, i) => drawRow(cells, i % 2 === 1 ? palette.stripe : null, false));
  if (totalRow) drawRow(totalRow, palette.total, true);
}

/** Splits the page width between columns: fixed widths for short values, the rest for text. */
function columnWidths(kinds: { key: string; kind: string }[], total: number): number[] {
  const fixed: Record<string, number> = { date: 62, hours: 46, rate: 62, amount: 72, category: 80, project: 92, requestedBy: 86 };
  const base = kinds.map((k) => (k.key === 'description' ? 0 : (fixed[k.key] ?? 72)));
  const used = base.reduce((a, b) => a + b, 0);
  const flexible = kinds.filter((k) => k.key === 'description').length;
  const rest = Math.max(120, total - used);
  const widths = base.map((b, i) => (kinds[i].key === 'description' ? rest / Math.max(1, flexible) : b));
  const scale = total / widths.reduce((a, b) => a + b, 0);
  return widths.map((x) => x * scale);
}

export async function buildInvoicePdf(draft: InvoiceDraft, customFields: CustomField[]): Promise<Uint8Array> {
  const doc = buildInvoiceDocument(draft, customFields);
  const palette = normalizePalette(draft.palette);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Invoice ${doc.number}`);
  pdf.setCreator('Hourbook');
  const fonts = { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const w = new Writer(pdf, fonts, makeSanitizer(fonts));

  w.band('INVOICE', palette.title, 20, 36);
  w.band(`${doc.from?.lines[0] ?? ''}  |  Invoice ${doc.number}  |  ${doc.servicePeriod.text}`, palette.title, 9, 18);
  w.y -= 14;

  await drawDetails(w, pdf, doc);
  drawParties(w, doc, palette.header);
  w.y -= 10;

  const widths = columnWidths(doc.columns, w.width);
  const cols = doc.columns.map((c, i) => ({ label: c.label, width: widths[i], align: (c.kind === 'hours' || c.kind === 'money' ? 'right' : 'left') as 'left' | 'right' }));
  const rows = doc.lines.map((line) =>
    doc.columns.map((c) => {
      const v = line.values[c.key];
      if (c.kind === 'money') return doc.money(Number(v) || 0);
      if (c.kind === 'hours') return (Number(v) || 0).toFixed(2);
      if (c.kind === 'date') return v ? doc.date(String(v)) : '';
      return String(v ?? '');
    }),
  );
  const totalRow = doc.columns.map((c, i) =>
    i === 0 ? 'Total hours' : c.key === 'hours' ? doc.lines.reduce((s, l) => s + l.hours, 0).toFixed(2) : c.key === 'amount' ? doc.money(doc.totals.linesSubtotal) : '',
  );
  drawTable(w, cols, rows, palette, totalRow);

  if (doc.extras.length) {
    w.y -= 12;
    const ew = [w.width - 220, 60, 80, 80];
    drawTable(
      w,
      ['Other charges', 'Quantity', 'Unit price', 'Amount'].map((label, i) => ({ label, width: ew[i], align: i === 0 ? 'left' : 'right' })),
      doc.extras.map((e) => [e.description, String(e.quantity), doc.money(e.unitPrice), doc.money(e.amount)]),
      palette,
      ['Other charges total', '', '', doc.money(doc.totals.extrasSubtotal)],
    );
  }

  drawSummary(w, doc, palette.title);
  if (doc.roundingNote) w.paragraph(doc.roundingNote, 8, { color: MUTED });
  for (const [title, text] of [
    ['PAYMENT INSTRUCTIONS', doc.payment],
    ['NOTES', doc.notes],
  ] as const) {
    if (!text) continue;
    w.y -= 10;
    w.ensure(40);
    w.paragraph(title, 9, { bold: true });
    w.paragraph(text, 9);
  }
  if (doc.footer) {
    w.y -= 14;
    w.paragraph(doc.footer, 9, { color: MUTED });
  }

  if (doc.timesheet) drawTimesheet(w, doc, palette);
  return pdf.save();
}

async function drawDetails(w: Writer, pdf: PDFDocument, doc: InvoiceDocument) {
  const rows: [string, string][] = [
    ['Invoice number', doc.number],
    ['Issue date', doc.date(doc.issueDate)],
  ];
  if (doc.terms) rows.push(['Terms', doc.terms]);
  if (doc.dueDate) rows.push(['Due date', doc.date(doc.dueDate)]);
  rows.push(['Service period', doc.servicePeriod.text], ['Currency', doc.currency]);
  const top = w.y;
  for (const [label, value] of rows) {
    w.y -= 14;
    w.text(label, MARGIN, w.y, 9, { bold: true });
    w.text(value, MARGIN + 100, w.y, 9);
  }
  const logo = readImage(doc.from?.logo);
  if (logo) {
    const image = logo.type === 'png' ? await pdf.embedPng(logo.bytes) : await pdf.embedJpg(logo.bytes);
    const size = fitInBox(logo.width, logo.height, 160, 70);
    w.page.drawImage(image, { x: MARGIN + w.width - size.width, y: top - 6 - size.height, ...size });
    w.y = Math.min(w.y, top - 6 - size.height);
  }
  w.y -= 14;
}

function drawParties(w: Writer, doc: InvoiceDocument, headerFill: string) {
  const blocks = [doc.from && { title: 'FROM', lines: doc.from.lines }, doc.billTo && { title: 'BILL TO', lines: doc.billTo.lines }].filter(Boolean) as {
    title: string;
    lines: string[];
  }[];
  if (!blocks.length) return;
  const gap = 16;
  const bw = (w.width - gap * (blocks.length - 1)) / blocks.length;
  const height = 18 + Math.max(...blocks.map((b) => b.lines.length)) * 12 + 6;
  w.ensure(height);
  blocks.forEach((b, i) => {
    const x = MARGIN + i * (bw + gap);
    w.rect(x, w.y - 16, bw, 16, hex(headerFill));
    w.text(b.title, x + 6, w.y - 12, 9, { bold: true, color: hex(textOn(headerFill)) });
    b.lines.forEach((line, li) => {
      const text = w.wrap(line, li === 0 ? w.fonts.bold : w.fonts.regular, 9, bw - 8)[0] ?? '';
      w.text(text, x + 4, w.y - 30 - li * 12, 9, { bold: li === 0 });
    });
  });
  w.y -= height;
}

function drawSummary(w: Writer, doc: InvoiceDocument, titleFill: string) {
  const width = 240;
  const x = MARGIN + w.width - width;
  w.y -= 12;
  const row = (label: string, value: string, bold = false) => {
    w.ensure(16);
    w.y -= 15;
    w.text(label, x, w.y, 9, { bold, color: bold ? INK : MUTED });
    w.text(value, x, w.y, 9, { bold, align: 'right', width });
  };
  row('Subtotal', doc.money(doc.totals.subtotal), true);
  for (const a of doc.totals.adjustments) row(a.label || (a.kind === 'tax' ? 'Tax' : 'Discount'), doc.money(a.amount));
  w.ensure(32);
  w.y -= 30;
  w.rect(MARGIN, w.y, w.width, 26, hex(titleFill));
  const color = hex(textOn(titleFill));
  w.text(`TOTAL AMOUNT DUE (${doc.currency})`, MARGIN + 10, w.y + 9, 12, { bold: true, color });
  w.text(doc.money(doc.totals.total), MARGIN, w.y + 9, 13, { bold: true, color, align: 'right', width: w.width - 10 });
  w.y -= 10;
}

function drawTimesheet(w: Writer, doc: InvoiceDocument, palette: ReturnType<typeof normalizePalette>) {
  const sheet = doc.timesheet!;
  w.newPage([LETTER[1], LETTER[0]]); // landscape
  w.band(`${doc.from?.lines[0] ?? ''}  |  Timesheet  |  ${doc.servicePeriod.text}`, palette.title, 12, 26);
  w.y -= 10;
  const preset = [58, 46, 46, 40, 80, 90, 80];
  const fixed = preset.slice(0, Math.min(7, sheet.columns.length));
  const extra = Math.max(0, sheet.columns.length - 8);
  const customWidth = 64;
  const descWidth = Math.max(110, w.width - fixed.reduce((a, b) => a + b, 0) - extra * customWidth);
  const widths = sheet.columns.map((_, i) => (i < 7 ? preset[i] : i === 7 ? descWidth : customWidth));
  const scale = w.width / widths.reduce((a, b) => a + b, 0);
  const cols = sheet.columns.map((c, i) => ({ label: c.label, width: widths[i] * scale, align: (c.kind === 'hours' ? 'right' : 'left') as 'left' | 'right' }));
  const rows = sheet.rows.map((r) =>
    r.map((v, i) => {
      const kind = sheet.columns[i].kind;
      if (kind === 'date') return v ? doc.date(String(v)) : '';
      if (kind === 'time') return String(v ?? '').slice(0, 8);
      if (kind === 'hours') return (Number(v) || 0).toFixed(2);
      return String(v ?? '');
    }),
  );
  const totalRow = sheet.columns.map((_, i) => (i === 0 ? 'Total' : i === 3 ? sheet.totalHours.toFixed(2) : ''));
  drawTable(w, cols, rows, palette, totalRow, 8);
}
