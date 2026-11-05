import { downloadBlob } from '../download';
import { invoiceFileName } from '../excel/invoice';
import type { CustomField, InvoiceDraft } from '../types';
import { buildInvoicePdf } from './invoice';

export { buildInvoicePdf };

export async function downloadInvoicePdf(draft: InvoiceDraft, customFields: CustomField[], fileNameTemplate: string): Promise<string> {
  const bytes = await buildInvoicePdf(draft, customFields);
  const fileName = invoiceFileName(draft, fileNameTemplate, 'pdf');
  downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), fileName);
  return fileName;
}
