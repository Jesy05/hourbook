import ExcelJS from 'exceljs';
import { format, parseISO } from 'date-fns';
import { SECONDS_PER_DAY, SECONDS_PER_HOUR, sumSeconds, weeklyOvertimeSeconds } from '../calc';
import { overtimeDraftSummary } from '../drafts';
import { formatRedeemedDate, safeFileName } from '../format';
import type { OvertimeDraft, RedeemedEntry } from '../types';
import {
  ARGB,
  BORDER,
  bodyCell,
  columnLetter,
  excelDate,
  excelDuration,
  FMT,
  font,
  formula,
  headerCell,
  headerRow,
  solid,
  titleBand,
  totalCell,
} from './styles';

/*
 * Overtime tracker laid out like the original spreadsheet:
 *   A-D  weekly table (Week date, Worked, Register, OT Hours)
 *   F-G  TOTAL HOURS summary with its parameters
 *   I-K  redeemed log
 *   M+   one column per month with hours worked per week
 */

const WEEK_COL = 1;
const SUM_COL = 6;
const RED_COL = 9;
const MONTH_COL = 13;
const HEADER_ROW = 3;
const FIRST_ROW = 4;

export function overtimeFileName(name: string, draft: OvertimeDraft): string {
  const a = draft.periodStart.slice(0, 4);
  const b = draft.periodEnd.slice(0, 4);
  return `${safeFileName(name)}_OT_Tracker_${a === b ? a : `${a}-${b}`}.xlsx`;
}

export function buildOvertimeWorkbook(name: string, draft: OvertimeDraft, redeemed: RedeemedEntry[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hourbook';
  wb.created = new Date();
  const ws = wb.addWorksheet('OT Tracker', {
    properties: { defaultRowHeight: 18 },
    views: [{ state: 'frozen', ySplit: HEADER_ROW }],
  });

  const monthCount = Math.max(1, draft.months.length);
  const lastCol = MONTH_COL + monthCount - 1;
  const widths: Record<number, number> = { 1: 12, 2: 11, 3: 11, 4: 10, 5: 3, 6: 24, 7: 12, 8: 3, 9: 13, 10: 16, 11: 26, 12: 3 };
  for (let c = 1; c <= lastCol; c++) ws.getColumn(c).width = widths[c] ?? 13;

  const period = `${format(parseISO(draft.periodStart), 'MMM d, yyyy')} - ${format(parseISO(draft.periodEnd), 'MMM d, yyyy')}`;
  titleBand(ws, 1, 1, lastCol, `${name}  |  Overtime Tracker  |  ${period}`);

  /* ---------- weekly table ---------- */
  headerRow(ws, HEADER_ROW, WEEK_COL, ['Week date', 'Worked', 'Register', 'OT Hours'], [1, 2, 3]);
  const stdRef = `$G$${FIRST_ROW}`;
  let r = FIRST_ROW;
  draft.weeks.forEach((week, i) => {
    const otSec = weeklyOvertimeSeconds(week.workedSeconds, draft.standardHours);
    const date = ws.getCell(r, 1);
    date.value = excelDate(week.weekStart);
    bodyCell(date, i, FMT.date, 'left');
    const worked = ws.getCell(r, 2);
    worked.value = excelDuration(week.workedSeconds);
    bodyCell(worked, i, FMT.hm, 'right');
    const register = ws.getCell(r, 3);
    register.value = formula(`MAX(0,B${r}-${stdRef}/24)`, otSec / SECONDS_PER_DAY);
    bodyCell(register, i, FMT.hm, 'right');
    const ot = ws.getCell(r, 4);
    ot.value = formula(`C${r}*24`, otSec / SECONDS_PER_HOUR);
    bodyCell(ot, i, FMT.decimal, 'right');
    r++;
  });
  const lastWeek = r - 1;
  const hasWeeks = lastWeek >= FIRST_ROW;
  const weekWorked = sumSeconds(draft.weeks.map((w) => ({ seconds: w.workedSeconds })));
  const weekOt = draft.weeks.reduce((s, w) => s + weeklyOvertimeSeconds(w.workedSeconds, draft.standardHours), 0);
  const weekTotals = [1, 2, 3, 4].map((c) => ws.getCell(r, c));
  weekTotals.forEach((c) => totalCell(c));
  weekTotals[0].value = 'Total';
  weekTotals[1].value = hasWeeks ? formula(`SUM(B${FIRST_ROW}:B${lastWeek})`, weekWorked / SECONDS_PER_DAY) : 0;
  totalCell(weekTotals[1], FMT.hm, 'right');
  weekTotals[2].value = hasWeeks ? formula(`SUM(C${FIRST_ROW}:C${lastWeek})`, weekOt / SECONDS_PER_DAY) : 0;
  totalCell(weekTotals[2], FMT.hm, 'right');
  weekTotals[3].value = hasWeeks ? formula(`SUM(D${FIRST_ROW}:D${lastWeek})`, weekOt / SECONDS_PER_HOUR) : 0;
  totalCell(weekTotals[3], FMT.decimal, 'right');
  const weekEnd = r;

  /* ---------- redeemed log ---------- */
  headerRow(ws, HEADER_ROW, RED_COL, ['Date', 'Redeemed Hours', 'Note'], [1]);
  let rr = FIRST_ROW;
  redeemed.forEach((item, i) => {
    const date = ws.getCell(rr, RED_COL);
    const isRange = !!item.endDate && item.endDate !== item.date;
    date.value = isRange ? formatRedeemedDate(item.date, item.endDate) : excelDate(item.date);
    bodyCell(date, i, isRange ? undefined : FMT.date, 'left');
    const hours = ws.getCell(rr, RED_COL + 1);
    hours.value = item.hours;
    bodyCell(hours, i, FMT.decimal, 'right');
    const note = ws.getCell(rr, RED_COL + 2);
    note.value = item.note;
    bodyCell(note, i);
    rr++;
  });
  const lastRedeemed = rr - 1;
  const redeemedTotal = redeemed.reduce((s, x) => s + x.hours, 0);
  const redLabel = ws.getCell(rr, RED_COL);
  redLabel.value = 'Total';
  totalCell(redLabel);
  const redSum = ws.getCell(rr, RED_COL + 1);
  redSum.value = lastRedeemed >= FIRST_ROW ? formula(`SUM(J${FIRST_ROW}:J${lastRedeemed})`, redeemedTotal) : 0;
  totalCell(redSum, FMT.decimal, 'right');
  totalCell(ws.getCell(rr, RED_COL + 2));
  const redeemedEnd = rr;

  /* ---------- TOTAL HOURS summary ---------- */
  const summary = overtimeDraftSummary(draft, redeemed);
  ws.mergeCells(HEADER_ROW, SUM_COL, HEADER_ROW, SUM_COL + 1);
  headerCell(ws.getCell(HEADER_ROW, SUM_COL), 'TOTAL HOURS', 'center');
  const otFormula = hasWeeks ? `SUM(D${FIRST_ROW}:D${lastWeek})+G6` : 'G6';
  const redFormula = lastRedeemed >= FIRST_ROW ? `SUM(J${FIRST_ROW}:J${lastRedeemed})` : '0';
  const rows: { label: string; value: ExcelJS.CellValue; fmt: string; kind: 'param' | 'result' | 'key' }[] = [
    { label: 'Standard hours / week', value: draft.standardHours, fmt: FMT.decimal, kind: 'param' },
    { label: 'Hours per day', value: draft.hoursPerDay, fmt: FMT.decimal, kind: 'param' },
    { label: 'Opening balance', value: draft.openingBalance, fmt: FMT.decimal, kind: 'param' },
    { label: 'OVER TIME', value: formula(otFormula, summary.overtime), fmt: FMT.decimal, kind: 'result' },
    { label: 'REDEEMED', value: formula(redFormula, summary.redeemed), fmt: FMT.decimal, kind: 'result' },
    { label: 'BALANCE', value: formula('G7-G8', summary.balance), fmt: FMT.decimal, kind: 'key' },
    { label: 'DAYS', value: formula('IF(G5>0,G9/G5,0)', summary.days), fmt: FMT.decimal, kind: 'key' },
  ];
  rows.forEach((row, i) => {
    const rowIndex = FIRST_ROW + i;
    const label = ws.getCell(rowIndex, SUM_COL);
    const value = ws.getCell(rowIndex, SUM_COL + 1);
    label.value = row.label;
    value.value = row.value;
    value.numFmt = row.fmt;
    value.alignment = { horizontal: 'right' };
    label.border = BORDER;
    value.border = BORDER;
    if (row.kind === 'param') {
      label.font = font({ color: { argb: ARGB.muted } });
      value.font = font();
      label.fill = solid(ARGB.peachSoft);
      value.fill = solid(ARGB.peachSoft);
    } else if (row.kind === 'result') {
      label.font = font({ bold: true });
      value.font = font({ bold: true });
      label.fill = solid(ARGB.white);
      value.fill = solid(ARGB.white);
    } else {
      totalCell(label);
      totalCell(value, row.fmt, 'right');
    }
  });

  /* ---------- monthly blocks ---------- */
  const maxRows = Math.max(1, ...draft.months.map((m) => m.rows.length));
  const monthTotalRow = FIRST_ROW + maxRows;
  if (draft.months.length === 0) {
    headerCell(ws.getCell(HEADER_ROW, MONTH_COL), 'MONTH', 'right');
  }
  draft.months.forEach((month, mi) => {
    const col = MONTH_COL + mi;
    const letter = columnLetter(col);
    headerCell(ws.getCell(HEADER_ROW, col), format(parseISO(`${month.month}-01`), 'MMM').toUpperCase(), 'right');
    for (let i = 0; i < maxRows; i++) {
      const cell = ws.getCell(FIRST_ROW + i, col);
      const row = month.rows[i];
      cell.value = row ? excelDuration(row.seconds) : null;
      bodyCell(cell, i, FMT.hms, 'right');
      if (row) cell.note = `Week of ${format(parseISO(row.weekStart), 'd-MMM')}`;
    }
    const total = ws.getCell(monthTotalRow, col);
    const monthSeconds = sumSeconds(month.rows);
    total.value = formula(`SUM(${letter}${FIRST_ROW}:${letter}${monthTotalRow - 1})`, monthSeconds / SECONDS_PER_DAY);
    totalCell(total, FMT.hms, 'right');
  });

  const lastRow = Math.max(weekEnd, redeemedEnd, monthTotalRow, FIRST_ROW + rows.length - 1);
  ws.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printArea: `A1:${columnLetter(lastCol)}${lastRow}`,
    printTitlesRow: `${HEADER_ROW}:${HEADER_ROW}`,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
  };
  return wb;
}
