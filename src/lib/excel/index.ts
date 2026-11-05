import type ExcelJS from 'exceljs';
import { downloadBlob } from '../download';
import type { CustomField, InvoiceDraft, OvertimeDraft, RedeemedEntry } from '../types';
import { buildInvoiceWorkbook, invoiceFileName } from './invoice';
import { buildOvertimeWorkbook, overtimeFileName } from './overtime';

export { buildInvoiceWorkbook, buildOvertimeWorkbook, invoiceFileName, overtimeFileName };

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function save(wb: ExcelJS.Workbook, fileName: string): Promise<string> {
  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: XLSX_TYPE }), fileName);
  return fileName;
}

export function downloadInvoice(draft: InvoiceDraft, customFields: CustomField[], fileNameTemplate: string): Promise<string> {
  return save(buildInvoiceWorkbook(draft, { customFields }), invoiceFileName(draft, fileNameTemplate, 'xlsx'));
}

export function downloadOvertime(name: string, draft: OvertimeDraft, redeemed: RedeemedEntry[]): Promise<string> {
  return save(buildOvertimeWorkbook(name, draft, redeemed), overtimeFileName(name, draft));
}
