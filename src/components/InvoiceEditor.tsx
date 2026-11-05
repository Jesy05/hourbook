import { Copy, FileText, Info, Link2, ListOrdered, Mail, Plus, RefreshCw, Sheet, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { lineAmount } from '../lib/calc';
import { newId } from '../lib/defaults';
import { entryToRow, invoiceDraftTotals, linesFromTimesheet, patchRow, rowToEntry } from '../lib/drafts';
import { formatDay, formatMoney, formatMoneyEnglish, formatNumber, formatPeriodEnglish, shortTime } from '../lib/format';
import { useStore } from '../lib/store';
import type { Entry, InvoiceDraft, InvoiceLine, TimesheetRow } from '../lib/types';
import { NumberCell } from './cells';
import { ComboInput, CustomFieldInput } from './EntryFields';
import { useToast } from './Toast';
import { Button, Card, CellInput, ConfirmDialog, Field, IconButton, TextArea, TextInput } from './ui';

export function invoiceEmail(draft: InvoiceDraft) {
  const totals = invoiceDraftTotals(draft);
  const month = formatPeriodEnglish(draft.periodStart, draft.periodEnd);
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
  const { t, language, profile, data, addEntries, updateEntry, deleteEntry } = useStore();
  const toast = useToast();
  const totals = invoiceDraftTotals(draft);
  const email = invoiceEmail(draft);
  const [removing, setRemoving] = useState<{ row: TimesheetRow; entry: Entry } | null>(null);

  const categories = profile?.categories ?? [];
  // A column shows when its field is on, or when rows already have values for it.
  const showRequester = !!profile?.fields.requestedBy || draft.timesheet.some((r) => r.requestedBy);
  const showProject = !!profile?.fields.project || draft.timesheet.some((r) => r.project);
  const showCategory = !!profile?.fields.category;
  const customFields = (profile?.customFields ?? []).filter((f) => f.enabled && f.name.trim());
  const defaultRate = draft.lines[0]?.rate ?? profile?.invoice.rate ?? 0;
  const entryFor = (row: TimesheetRow) => (row.entryId ? data.entries.find((e) => e.id === row.entryId) : undefined);
  const hasUnlinked = draft.timesheet.some((row) => !entryFor(row));

  const set = <K extends keyof InvoiceDraft>(key: K, value: InvoiceDraft[K]) => onChange({ ...draft, [key]: value });

  // Line items edited by hand stop following the timesheet.
  const setLines = (lines: InvoiceLine[]) => onChange({ ...draft, lines, linesManual: true });
  const setLine = (id: string, patch: Partial<InvoiceLine>) => setLines(draft.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const recalcLines = () =>
    onChange({ ...draft, linesManual: false, lines: linesFromTimesheet(draft.timesheet, draft.lines, defaultRate, categories[0] ?? 'Services') });

  /** Saves the timesheet and, unless edited by hand, rebuilds the line items from it. */
  const setTimesheet = (timesheet: TimesheetRow[]) =>
    onChange({
      ...draft,
      timesheet,
      lines: draft.linesManual ? draft.lines : linesFromTimesheet(timesheet, draft.lines, defaultRate, categories[0] ?? 'Services'),
    });

  /** Edits a row and saves the same change to its tracker entry. */
  const setRow = (id: string, patch: Partial<TimesheetRow>) => {
    const timesheet = draft.timesheet.map((r) => (r.id === id ? patchRow(r, patch) : r));
    const row = timesheet.find((r) => r.id === id);
    const entry = row && entryFor(row);
    if (row && entry) updateEntry(rowToEntry(row, entry));
    setTimesheet(timesheet);
  };

  const addRow = () => {
    if (!profile) return;
    const entry: Entry = {
      id: newId(),
      profileId: profile.id,
      date: draft.timesheet.at(-1)?.date ?? draft.periodStart,
      seconds: 0,
      description: '',
      category: categories[0] ?? '',
      createdAt: Date.now(),
    };
    addEntries([entry]);
    setTimesheet([...draft.timesheet, entryToRow(entry)]);
  };

  const removeRow = (row: TimesheetRow) => {
    const entry = entryFor(row);
    if (entry) setRemoving({ row, entry });
    else setTimesheet(draft.timesheet.filter((r) => r.id !== row.id));
  };

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
            onClick={() => setLines([...draft.lines, { id: newId(), description: '', hours: 0, rate: defaultRate }])}
          >
            <Plus size={16} aria-hidden="true" />
            {t('reports.addRow')}
          </Button>
        }
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
          <p className="flex items-center gap-2">
            <Info size={16} className="shrink-0" aria-hidden="true" />
            {draft.linesManual ? t('invoice.linesManual') : t('invoice.linesAuto')}
          </p>
          {draft.linesManual && (
            <Button size="sm" onClick={recalcLines}>
              <RefreshCw size={16} aria-hidden="true" />
              {t('invoice.recalcLines')}
            </Button>
          )}
        </div>
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
                      aria-label={`${t('invoice.lines')} ${i + 1}: ${t('common.description')}`}
                      value={line.description}
                      onChange={(e) => setLine(line.id, { description: e.target.value })}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <NumberCell aria-label={`${t('invoice.lines')} ${i + 1}: ${t('common.hours')}`} value={line.hours} onChange={(v) => setLine(line.id, { hours: v })} />
                  </td>
                  <td className="px-1 py-1">
                    <NumberCell aria-label={`${t('invoice.lines')} ${i + 1}: ${t('invoice.rate')}`} value={line.rate} onChange={(v) => setLine(line.id, { rate: v })} />
                  </td>
                  <td className="tabular px-3 py-1 text-right">{money(lineAmount(line.hours, line.rate))}</td>
                  <td className="px-1 py-1 text-right">
                    <IconButton label={`${t('reports.removeRow')} ${i + 1}`} onClick={() => setLines(draft.lines.filter((l) => l.id !== line.id))}>
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
          <Button size="sm" onClick={addRow}>
            <Plus size={16} aria-hidden="true" />
            {t('reports.addRow')}
          </Button>
        }
      >
        <p className="mb-3 flex items-center gap-2 text-sm text-muted">
          <Link2 size={16} className="shrink-0" aria-hidden="true" />
          {t('invoice.timesheetLinked')}
        </p>
        {hasUnlinked && (
          <p className="mb-3 rounded-xl border border-peach bg-peach-soft px-3 py-2 text-sm text-ink">{t('invoice.timesheetUnlinked')}</p>
        )}
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-coral text-ink">
              <tr>
                <th scope="col" className={`${th} w-40`}>{t('common.date')}</th>
                <th scope="col" className={`${th} w-28`}>{t('common.start')}</th>
                <th scope="col" className={`${th} w-28`}>{t('common.end')}</th>
                <th scope="col" className={`${th} w-24 text-right`}>{t('common.hours')}</th>
                {showRequester && <th scope="col" className={`${th} w-48`}>{t('fields.requestedBy')}</th>}
                {showProject && <th scope="col" className={`${th} w-48`}>{t('fields.project')}</th>}
                {showCategory && <th scope="col" className={`${th} w-44`}>{t('common.category')}</th>}
                <th scope="col" className={`${th} min-w-48`}>{t('common.description')}</th>
                {customFields.map((f) => (
                  <th key={f.id} scope="col" className={`${th} w-36`}>
                    {f.name}
                  </th>
                ))}
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
                  {showRequester && (
                    <td className="px-1 py-1">
                      <ComboInput
                        compact
                        label={`${t('fields.requestedBy')} ${i + 1}`}
                        value={row.requestedBy ?? ''}
                        options={profile?.requesters ?? []}
                        onChange={(v) => setRow(row.id, { requestedBy: v })}
                      />
                    </td>
                  )}
                  {showProject && (
                    <td className="px-1 py-1">
                      <ComboInput
                        compact
                        label={`${t('fields.project')} ${i + 1}`}
                        value={row.project ?? ''}
                        options={profile?.projects ?? []}
                        onChange={(v) => setRow(row.id, { project: v })}
                      />
                    </td>
                  )}
                  {showCategory && (
                  <td className="px-1 py-1">
                    <select
                      aria-label={`${t('common.category')} ${i + 1}`}
                      value={row.category}
                      onChange={(e) => setRow(row.id, { category: e.target.value })}
                      className="w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm text-ink hover:border-line focus:border-sky focus:bg-surface focus:outline-none focus:ring-2 focus:ring-sky/40"
                    >
                      {(categories.includes(row.category) ? categories : [row.category, ...categories]).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  )}
                  <td className="px-1 py-1">
                    <CellInput aria-label={`${t('common.description')} ${i + 1}`} value={row.description} onChange={(e) => setRow(row.id, { description: e.target.value })} />
                  </td>
                  {customFields.map((f) => (
                    <td key={f.id} className="px-1 py-1 text-center">
                      <CustomFieldInput
                        compact
                        label={`${f.name} ${i + 1}`}
                        field={f}
                        value={row.custom?.[f.id]}
                        onChange={(v) => {
                          const custom = { ...(row.custom ?? {}) };
                          if (v === undefined) delete custom[f.id];
                          else custom[f.id] = v;
                          setRow(row.id, { custom });
                        }}
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1 text-right">
                    <IconButton label={`${t('reports.removeRow')} ${i + 1}`} onClick={() => removeRow(row)}>
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
                <td colSpan={2 + Number(showRequester) + Number(showProject) + Number(showCategory) + customFields.length} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <ConfirmDialog
        open={!!removing}
        title={t('invoice.deleteRowTitle')}
        body={t('invoice.deleteRowBody', {
          date: removing ? formatDay(removing.row.date, language) : '',
          hours: removing ? formatNumber(removing.row.hours, language) : '',
        })}
        confirmLabel={t('common.delete')}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) {
            deleteEntry(removing.entry.id);
            setTimesheet(draft.timesheet.filter((r) => r.id !== removing.row.id));
          }
          setRemoving(null);
        }}
      />
    </div>
  );
}
