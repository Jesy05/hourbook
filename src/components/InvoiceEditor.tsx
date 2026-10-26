import { Copy, FileText, ListOrdered, Mail, Plus, Sheet, Trash2 } from 'lucide-react';
import { lineAmount } from '../lib/calc';
import { newId } from '../lib/defaults';
import { invoiceDraftTotals } from '../lib/drafts';
import { formatMoney, formatMoneyEnglish, formatMonthEnglish, formatNumber, shortTime } from '../lib/format';
import { useStore } from '../lib/store';
import type { InvoiceDraft, InvoiceLine, TimesheetRow } from '../lib/types';
import { NumberCell } from './cells';
import { useToast } from './Toast';
import { Button, Card, CellInput, Field, IconButton, TextArea, TextInput } from './ui';

export function invoiceEmail(draft: InvoiceDraft) {
  const totals = invoiceDraftTotals(draft);
  const month = formatMonthEnglish(draft.periodStart.slice(0, 7));
  const hours = totals.hours.toFixed(2);
  const amount = formatMoneyEnglish(totals.amount, draft.currency);
  const firstName = draft.fromName.split(' ')[0] ?? draft.fromName;
  return {
    subject: `Invoice ${draft.invoiceNumber} - ${month} - ${draft.fromName}`,
    body: `Hello,\n\nPlease find attached my invoice for ${month}: ${hours} hours, total ${amount}.\n\nThank you,\n${firstName}`,
  };
}

const th = 'px-2 py-2 text-left text-sm font-semibold';

export function InvoiceEditor({ draft, onChange }: { draft: InvoiceDraft; onChange: (draft: InvoiceDraft) => void }) {
  const { t, language, profile } = useStore();
  const toast = useToast();
  const totals = invoiceDraftTotals(draft);
  const email = invoiceEmail(draft);

  const set = <K extends keyof InvoiceDraft>(key: K, value: InvoiceDraft[K]) => onChange({ ...draft, [key]: value });
  const setLine = (id: string, patch: Partial<InvoiceLine>) =>
    set('lines', draft.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const setRow = (id: string, patch: Partial<TimesheetRow>) =>
    set('timesheet', draft.timesheet.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const money = (n: number) => formatMoney(n, draft.currency, language);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(t('invoice.copied'));
    } catch {
      toast(t('invoice.copyFailed'), { tone: 'info' });
    }
  };

  const toTime = (value: string) => (value ? `${value}:00` : '');

  return (
    <div className="flex flex-col gap-6">
      <Card title={t('invoice.details')} icon={<FileText size={20} />}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t('invoice.number')}>
            {(p) => <TextInput {...p} value={draft.invoiceNumber} onChange={(e) => set('invoiceNumber', e.target.value)} />}
          </Field>
          <Field label={t('invoice.issueDate')}>
            {(p) => <TextInput {...p} type="date" value={draft.issueDate} onChange={(e) => set('issueDate', e.target.value)} />}
          </Field>
          <Field label={`${t('invoice.from')}: ${t('profile.name')}`}>
            {(p) => <TextInput {...p} value={draft.fromName} onChange={(e) => set('fromName', e.target.value)} />}
          </Field>
          <Field label={t('invoice.billTo')}>
            {(p) => <TextArea {...p} rows={2} className="min-h-0" value={draft.billTo} onChange={(e) => set('billTo', e.target.value)} />}
          </Field>
          <Field label={`${t('invoice.from')}: ${t('profile.contact')}`}>
            {(p) => <TextArea {...p} rows={3} value={draft.fromContact} onChange={(e) => set('fromContact', e.target.value)} />}
          </Field>
          <Field label={t('invoice.payment')} hint={t('profile.paymentDetailsHint')}>
            {(p) => (
              <TextArea {...p} rows={3} value={draft.paymentDetails} onChange={(e) => set('paymentDetails', e.target.value)} />
            )}
          </Field>
        </div>
      </Card>

      <Card
        title={t('invoice.lines')}
        icon={<ListOrdered size={20} />}
        actions={
          <Button
            size="sm"
            onClick={() =>
              set('lines', [...draft.lines, { id: newId(), description: '', hours: 0, rate: profile?.invoice.rate ?? 0 }])
            }
          >
            <Plus size={16} aria-hidden="true" />
            {t('reports.addRow')}
          </Button>
        }
      >
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-coral text-ink">
              <tr>
                <th scope="col" className={th}>{t('common.description')}</th>
                <th scope="col" className={`${th} w-28 text-right`}>{t('common.hours')}</th>
                <th scope="col" className={`${th} w-28 text-right`}>{t('invoice.rate')}</th>
                <th scope="col" className={`${th} w-32 text-right`}>{t('invoice.amount')}</th>
                <th scope="col" className="w-12"><span className="sr-only">{t('common.actions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {draft.lines.map((line, i) => (
                <tr key={line.id} className="border-t border-line odd:bg-surface even:bg-peach-soft">
                  <td className="px-1 py-1">
                    <CellInput
                      aria-label={`${t('common.description')} ${i + 1}`}
                      value={line.description}
                      onChange={(e) => setLine(line.id, { description: e.target.value })}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <NumberCell aria-label={`${t('common.hours')} ${i + 1}`} value={line.hours} onChange={(v) => setLine(line.id, { hours: v })} />
                  </td>
                  <td className="px-1 py-1">
                    <NumberCell aria-label={`${t('invoice.rate')} ${i + 1}`} value={line.rate} onChange={(v) => setLine(line.id, { rate: v })} />
                  </td>
                  <td className="tabular px-3 py-1 text-right">{money(lineAmount(line.hours, line.rate))}</td>
                  <td className="px-1 py-1 text-right">
                    <IconButton label={`${t('reports.removeRow')} ${i + 1}`} onClick={() => set('lines', draft.lines.filter((l) => l.id !== line.id))}>
                      <Trash2 size={16} aria-hidden="true" />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-sky font-semibold text-ink">
                <td className="px-3 py-2">{t('invoice.totalHours')}</td>
                <td className="tabular px-3 py-2 text-right">{formatNumber(totals.hours, language)}</td>
                <td />
                <td className="tabular px-3 py-2 text-right">{money(totals.amount)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-tomato px-4 py-3 text-white">
          <span className="font-semibold">{t('invoice.totalDue')}</span>
          <span className="tabular text-2xl font-bold">{money(totals.amount)}</span>
        </div>
      </Card>

      <Card title={t('invoice.email')} icon={<Mail size={20} />}>
        <p className="mb-4 text-sm text-muted">{t('invoice.emailHint')}</p>
        <dl className="grid gap-3 text-sm sm:grid-cols-[6rem_1fr_auto] sm:items-center">
          {[
            { label: t('invoice.to'), value: profile?.invoice.apEmail ?? '' },
            { label: t('invoice.cc'), value: profile?.invoice.ccEmail ?? '' },
            { label: t('invoice.subject'), value: email.subject },
          ].map((row) => (
            <div key={row.label} className="contents">
              <dt className="font-semibold">{row.label}</dt>
              <dd className="truncate rounded-lg border border-line bg-canvas px-3 py-2">{row.value || '-'}</dd>
              <dd>
                <IconButton label={`${t('invoice.copy')}: ${row.label}`} onClick={() => copy(row.value)} disabled={!row.value}>
                  <Copy size={16} aria-hidden="true" />
                </IconButton>
              </dd>
            </div>
          ))}
          <dt className="self-start pt-2 font-semibold">{t('invoice.body')}</dt>
          <dd>
            <pre className="whitespace-pre-wrap rounded-lg border border-line bg-canvas px-3 py-2 font-sans">{email.body}</pre>
          </dd>
          <dd className="self-start">
            <IconButton label={`${t('invoice.copy')}: ${t('invoice.body')}`} onClick={() => copy(email.body)}>
              <Copy size={16} aria-hidden="true" />
            </IconButton>
          </dd>
        </dl>
      </Card>

      <Card
        title={t('invoice.timesheet')}
        icon={<Sheet size={20} />}
        actions={
          <Button
            size="sm"
            onClick={() =>
              set('timesheet', [
                ...draft.timesheet,
                {
                  id: newId(),
                  date: draft.timesheet.at(-1)?.date ?? draft.periodStart,
                  start: '',
                  end: '',
                  hours: 0,
                  category: profile?.categories[0] ?? '',
                  description: '',
                },
              ])
            }
          >
            <Plus size={16} aria-hidden="true" />
            {t('reports.addRow')}
          </Button>
        }
      >
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-coral text-ink">
              <tr>
                <th scope="col" className={`${th} w-40`}>{t('common.date')}</th>
                <th scope="col" className={`${th} w-28`}>{t('common.start')}</th>
                <th scope="col" className={`${th} w-28`}>{t('common.end')}</th>
                <th scope="col" className={`${th} w-24 text-right`}>{t('common.hours')}</th>
                <th scope="col" className={`${th} w-44`}>{t('common.category')}</th>
                <th scope="col" className={th}>{t('common.description')}</th>
                <th scope="col" className="w-12"><span className="sr-only">{t('common.actions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {draft.timesheet.map((row, i) => (
                <tr key={row.id} className="border-t border-line odd:bg-surface even:bg-peach-soft">
                  <td className="px-1 py-1">
                    <CellInput type="date" aria-label={`${t('common.date')} ${i + 1}`} value={row.date} onChange={(e) => setRow(row.id, { date: e.target.value })} />
                  </td>
                  <td className="px-1 py-1">
                    <CellInput type="time" aria-label={`${t('common.start')} ${i + 1}`} value={shortTime(row.start)} onChange={(e) => setRow(row.id, { start: toTime(e.target.value) })} />
                  </td>
                  <td className="px-1 py-1">
                    <CellInput type="time" aria-label={`${t('common.end')} ${i + 1}`} value={shortTime(row.end)} onChange={(e) => setRow(row.id, { end: toTime(e.target.value) })} />
                  </td>
                  <td className="px-1 py-1">
                    <NumberCell aria-label={`${t('common.hours')} ${i + 1}`} value={Math.round(row.hours * 100) / 100} onChange={(v) => setRow(row.id, { hours: v })} />
                  </td>
                  <td className="px-1 py-1">
                    <CellInput aria-label={`${t('common.category')} ${i + 1}`} value={row.category} onChange={(e) => setRow(row.id, { category: e.target.value })} list="hb-categories" />
                  </td>
                  <td className="px-1 py-1">
                    <CellInput aria-label={`${t('common.description')} ${i + 1}`} value={row.description} onChange={(e) => setRow(row.id, { description: e.target.value })} />
                  </td>
                  <td className="px-1 py-1 text-right">
                    <IconButton label={`${t('reports.removeRow')} ${i + 1}`} onClick={() => set('timesheet', draft.timesheet.filter((r) => r.id !== row.id))}>
                      <Trash2 size={16} aria-hidden="true" />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-sky font-semibold text-ink">
                <td className="px-3 py-2" colSpan={3}>{t('common.total')}</td>
                <td className="tabular px-3 py-2 text-right">{formatNumber(totals.timesheetHours, language)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
          <datalist id="hb-categories">
            {profile?.categories.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
      </Card>
    </div>
  );
}
