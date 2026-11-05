import { DEFAULT_FILE_NAME_TEMPLATE } from '../defaults';

/* File names for exported invoices, from a template such as {name}_Invoice_{yyyy}-{mm}. */

export const FILE_NAME_TOKENS = ['name', 'number', 'client', 'yyyy', 'mm', 'dd', 'start', 'end'] as const;

export interface FileNameContext {
  name: string;
  number: string;
  client: string;
  /** Period start and end, YYYY-MM-DD. */
  start: string;
  end: string;
}

/** Removes accents and anything that is not safe in a file name; spaces become underscores. */
export function safeFilePart(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w.-]/g, '')
    .replace(/_+/g, '_');
}

export function renderFileName(template: string, ctx: FileNameContext, extension: string): string {
  const values: Record<string, string> = {
    name: ctx.name,
    number: ctx.number,
    client: ctx.client,
    yyyy: ctx.start.slice(0, 4),
    mm: ctx.start.slice(5, 7),
    dd: ctx.start.slice(8, 10),
    start: ctx.start,
    end: ctx.end,
  };
  const filled = (template.trim() || DEFAULT_FILE_NAME_TEMPLATE).replace(/\{(\w+)\}/g, (match, token: string) =>
    token in values ? safeFilePart(values[token]) : match,
  );
  const base = safeFilePart(filled).replace(/^[._-]+|[._-]+$/g, '') || 'Invoice';
  return `${base}.${extension}`;
}
