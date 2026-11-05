import { Calculator, CheckSquare, Copy, FileText, Info, Link2, ListOrdered, Mail, PackagePlus, Plus, RefreshCw, Sheet, Trash2, TriangleAlert } from 'lucide-react';
import { useRef, useState } from 'react';
import { newId } from '../lib/defaults';
import { entryToRow, invoiceDraftTotals, linesForDraft, patchRow, rowToEntry } from '../lib/drafts';
import { formatDay, formatNumber, formatPeriodEnglish } from '../lib/format';
import { hoursMismatch, round2, roundingNote } from '../lib/invoice/hours';
import { extraAmount, lineAmount, servicePeriod } from '../lib/invoice/lines';
import { formatCurrency } from '../lib/invoice/money';
import { draftDueDate, dueDate, TERMS_PRESETS, termsLabel } from '../lib/invoice/terms';
import { formatInvoiceDate } from '../lib/invoice/template';
import { missingTemplateFields, templateListFields, type ListField, type MissingField } from '../lib/fieldValues';
import type { MessageKey } from '../lib/i18n';
import { useStore } from '../lib/store';
import type { Entry, ExtraLine, InvoiceDraft, InvoiceLine, Profile, TimesheetRow } from '../lib/types';
import { NumberCell } from './cells';
import { FieldValueInput } from './Combobox';
import { CustomFieldInput } from './EntryFields';
import { InvoiceLayout } from './InvoiceLayout';
import { AdjustmentList, ROUNDING_RULES } from './InvoiceSettings';
import { useToast } from './Toast';
import { Button, Card, CellInput, ConfirmDialog, Field, IconButton, Select, TextArea, TextInput } from './ui';

/** Email text built from the invoice: number, service period, total with currency and due date. */
export function invoiceEmail(draft: InvoiceDraft) {
  const totals = invoiceDraftTotals(draft);
  const period = servicePeriod(draft.timesheet, draft.periodStart, draft.periodEnd, draft.template.periodMode);
  const periodText = formatPeriodEnglish(period.start, period.end);
  const total = `${formatCurrency(totals.total, draft.currency, draft.currencySymbol)} ${draft.currency}`;
  const due = draftDueDate(draft);
  const name = draft.business.name || draft.fromName;
  const firstName = name.split(' ')[0] ?? name;
  const dueText = due ? `, due ${formatInvoiceDate(due, 'MMM D, YYYY')}` : '';
  return {
    to: draft.client.email,
    cc: draft.client.cc,
    subject: `Invoice ${draft.invoiceNumber} - ${periodText} - ${name}`,
    body:
      `Hello,\n\nPlease find attached invoice ${draft.invoiceNumber} for services from ${periodText}: ` +
      `${round2(totals.hours).toFixed(2)} hours, total ${total}${dueText}.\n\nThank you,\n${firstName}`,
  };
}

const th = 'px-2 py-2 text-left text-sm font-semibold';

export function InvoiceEditor({ draft, onChange }: { draft: InvoiceDraft; onChange: (draft: InvoiceDraft) => void }) {
  const { t, language, profile, data, addEntries, updateEntry, deleteEntry } = useStore();
  const toast = useToast();
  const [removing, setRemoving] = useState<{ row: TimesheetRow; entry: Entry } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const timesheetRef = useRef<HTMLDivElement>(null);
  if (!profile) return null;

  const totals = invoiceDraftTotals(draft);
  const email = invoiceEmail(draft);
  const money = (n: number) => formatCurrency(n, draft.currency, draft.currencySymbol);
  const categories = profile.categories;
  const usedByTemplate = templateListFields(draft.template);
  const missing = missingTemplateFields(draft.template, draft.timesheet);
  const showRequester = profile.fields.requestedBy || usedByTemplate.includes('requestedBy') || draft.timesheet.some((r) => r.requestedBy);
  const showProject = profile.fields.project || usedByTemplate.includes('project') || draft.timesheet.some((r) => r.project);
  const showCategory = profile.fields.category;
  const customFields = profile.customFields.filter((f) => f.enabled && f.name.trim());
  const entryFor = (row: TimesheetRow) => (row.entryId ? data.entries.find((e) => e.id === row.entryId) : undefined);
  const hasUnlinked = draft.timesheet.some((row) => !entryFor(row));
  const period = servicePeriod(draft.timesheet, draft.periodStart, draft.periodEnd, draft.template.periodMode);
  const due = draftDueDate(draft);
  const termsDue = dueDate(draft.issueDate, draft.terms);

  const set = <K extends keyof InvoiceDraft>(key: K, value: InvoiceDraft[K]) => onChange({ ...draft, [key]: value });

  /** Saves draft changes and, unless the lines were edited by hand, rebuilds them. */
  const update = (patch: Partial<InvoiceDraft>) => {
    const next = { ...draft, ...patch };
    onChange(next.linesManual ? next : { ...next, lines: linesForDraft(next, profile) });
  };

  // Line items edited by hand stop following the timesheet.
  const setLines = (lines: InvoiceLine[]) => onChange({ ...draft, lines, linesManual: true });
  const setLine = (id: string, patch: Partial<InvoiceLine>) => setLines(draft.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const recalcLines = () => onChange({ ...draft, linesManual: false, lines: linesForDraft({ ...draft, linesManual: false }, profile) });

  const setExtra = (id: string, patch: Partial<ExtraLine>) => set('extraLines', draft.extraLines.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  /** Edits a row and saves the same change to its tracker entry. */
  const setRow = (id: string, patch: Partial<TimesheetRow>) => {
    const timesheet = draft.timesheet.map((r) => (r.id === id ? patchRow(r, patch) : r));
    const row = timesheet.find((r) => r.id === id);
    const entry = row && entryFor(row);
    if (row && entry) updateEntry(rowToEntry(row, entry));
    update({ timesheet });
  };

  /** Bulk fill: one value for several rows, saved to their entries too. */
  const setRows = (ids: Set<string>, patch: Partial<TimesheetRow>) => {
    const timesheet = draft.timesheet.map((r) => (ids.has(r.id) ? patchRow(r, patch) : r));
    for (const row of timesheet) {
      const entry = ids.has(row.id) ? entryFor(row) : undefined;
      if (entry) updateEntry(rowToEntry(row, entry));
    }
    update({ timesheet });
  };

  /** Selects the rows missing a value and takes the user to the bulk fill bar. */
  const fillMissing = (item: MissingField) => {
    setSelected(new Set(item.rowIds));
    timesheetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => document.getElementById(`bulk-${item.field}`)?.focus({ preventScroll: true }), 500);
  };

  const addRow = () => {
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
    update({ timesheet: [...draft.timesheet, entryToRow(entry)] });
  };

  const removeRow = (row: TimesheetRow) => {
    const entry = entryFor(row);
    if (entry) setRemoving({ row, entry });
    else update({ timesheet: draft.timesheet.filter((r) => r.id !== row.id) });
  };

  const chooseClient = (id: string) => {
    const client = profile.invoice.clients.find((c) => c.id === id);
    if (client) update({ clientId: client.id, client: { ...client }, billTo: client.company });
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(t('invoice.copied'));
    } catch {
      toast(t('invoice.copyFailed'), { tone: 'info' });
    }
  };

  const toTime = (value: string) => (value ? (value.length === 5 ? `${value}:00` : value) : '');

  return (
    <div className="flex flex-col gap-6">
      <Card title={t('invoice.details')} icon={<FileText size={20} />}>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t('invoice.number')}>
            {(p) => <TextInput {...p} value={draft.invoiceNumber} onChange={(e) => set('invoiceNumber', e.target.value)} />}
          </Field>
          <Field label={t('invoice.issueDate')}>
            {(p) => <TextInput {...p} type="date" value={draft.issueDate} onChange={(e) => set('issueDate', e.target.value)} />}
          </Field>
          <Field label={t('invoice.billTo')}>
            {(p) => (
              <Select {...p} value={draft.clientId ?? ''} onChange={(e) => chooseClient(e.target.value)}>
                {!draft.clientId && <option value="">{draft.client.company || t('invoiceSettings.unnamedClient')}</option>}
                {profile.invoice.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company || t('invoiceSettings.unnamedClient')}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('invoiceSettings.terms')}>
            {(p) => (
              <Select
                {...p}
                value={draft.terms.preset}
                // Picking terms again means "use the terms": a hand-set due date is dropped.
                onChange={(e) => onChange({ ...draft, terms: { ...draft.terms, preset: e.target.value as InvoiceDraft['terms']['preset'] }, dueDateOverride: undefined })}
              >
                {TERMS_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset === 'custom' ? t('invoiceSettings.customTerms') : termsLabel({ ...draft.terms, preset })}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex flex-col gap-1.5">
            <Field
              label={t('invoice.dueDate')}
              hint={draft.dueDateOverride ? t('invoice.dueManual') : due ? t('invoice.dueFromTerms') : t('invoiceSettings.noDue')}
            >
              {(p) => (
                <TextInput
                  {...p}
                  type="date"
                  value={due ?? ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    set('dueDateOverride', value && value !== termsDue ? value : undefined);
                  }}
                />
              )}
            </Field>
            {draft.dueDateOverride && draft.issueDate && draft.dueDateOverride < draft.issueDate && (
              <p className="flex items-center gap-1 text-xs font-medium text-brand">
                <TriangleAlert size={12} aria-hidden="true" />
                {t('invoice.dueBeforeIssue')}
              </p>
            )}
            {draft.dueDateOverride && (
              <button
                type="button"
                className="self-start rounded-md border border-line bg-surface px-2 py-1 text-xs font-semibold hover:bg-peach-soft"
                onClick={() => set('dueDateOverride', undefined)}
              >
                {termsDue ? t('invoice.dueReset', { date: formatDay(termsDue, language) }) : t('invoice.dueResetNone')}
              </button>
            )}
          </div>
          {draft.terms.preset === 'custom' && (
            <>
              <Field label={t('invoiceSettings.termsText')}>
                {(p) => <TextInput {...p} value={draft.terms.customText} onChange={(e) => set('terms', { ...draft.terms, customText: e.target.value })} />}
              </Field>
              <Field label={`${t('invoiceSettings.termsDays')} (${t('common.optional')})`}>
                {(p) => (
                  <TextInput
                    {...p}
                    type="number"
                    min={0}
                    value={draft.terms.customDays ?? ''}
                    onChange={(e) =>
                      onChange({ ...draft, terms: { ...draft.terms, customDays: e.target.value === '' ? null : Math.max(0, Math.floor(Number(e.target.value))) }, dueDateOverride: undefined })
                    }
                  />
                )}
              </Field>
            </>
          )}
          <Field label={t('invoiceSettings.rounding')} hint={t('invoiceSettings.roundingHint')}>
            {(p) => (
              <Select {...p} value={draft.rounding} onChange={(e) => update({ rounding: e.target.value as InvoiceDraft['rounding'] })}>
                {ROUNDING_RULES.map((rule) => (
                  <option key={rule} value={rule}>
                    {t(`rounding.${rule}` as MessageKey)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex flex-col justify-end gap-1 text-sm">
            <p className="text-xs font-medium text-muted">{t('invoice.servicePeriod')}</p>
            <p className="font-semibold">{formatPeriodEnglish(period.start, period.end)}</p>
            <p className="text-xs text-muted">
              {t('profile.currency')}: {draft.currency}
            </p>
          </div>
        </div>
      </Card>

      <InvoiceLayout
        template={draft.template}
        profile={profile}
        previewLine={draft.lines[0]?.description ?? ''}
        onChange={(template) => update({ template })}
      />

      {missing.length > 0 && (
        <div role="status" className="flex flex-col gap-3 rounded-2xl border border-coral bg-coral-soft p-4 text-sm text-ink">
          <p className="flex items-center gap-2 font-semibold">
            <TriangleAlert size={18} className="shrink-0 text-brand" aria-hidden="true" />
            {t('invoice.missingTitle')}
          </p>
          <ul className="flex flex-col gap-2">
            {missing.map((item) => (
              <li key={item.field} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 break-words">
                  {t('invoice.missingField', {
                    field: t(item.field === 'requestedBy' ? 'fields.requestedBy' : 'fields.project'),
                    count: item.rowIds.length,
                    dates: item.dates.map((d) => formatInvoiceDate(d, draft.template.dateFormat)).join(', '),
                  })}
                </span>
                <Button size="sm" onClick={() => fillMissing(item)}>
                  <CheckSquare size={16} aria-hidden="true" />
                  {t('invoice.missingFill')}
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-muted">{t('invoice.missingHint')}</p>
        </div>
      )}

      <Card
        title={t('invoice.lines')}
        icon={<ListOrdered size={20} />}
        actions={
          <Button size="sm" onClick={() => setLines([...draft.lines, { id: newId(), description: '', hours: 0, rate: profile.invoice.rate }])}>
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
        <div className="relative overflow-x-auto rounded-xl border border-line">
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
                    <NumberCell aria-label={`${t('invoice.lines')} ${i + 1}: ${t('common.hours')}`} value={round2(line.hours)} onChange={(v) => setLine(line.id, { hours: v })} />
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
                <td className="tabular px-3 py-2 text-right">{formatNumber(round2(totals.hours), language)}</td>
                <td />
                <td className="tabular px-3 py-2 text-right">{money(totals.linesSubtotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        {draft.rounding !== 'none' && <p className="mt-2 text-xs text-muted">{roundingNote(draft.rounding)}</p>}
      </Card>

      <Card
        title={t('invoice.extras')}
        icon={<PackagePlus size={20} />}
        actions={
          <Button size="sm" onClick={() => set('extraLines', [...draft.extraLines, { id: newId(), description: '', quantity: 1, unitPrice: 0 }])}>
            <Plus size={16} aria-hidden="true" />
            {t('reports.addRow')}
          </Button>
        }
      >
        <p className="mb-3 text-sm text-muted">{t('invoice.extrasHint')}</p>
        {draft.extraLines.length > 0 && (
          <div className="relative overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-coral text-ink">
                <tr>
                  <th scope="col" className={th}>{t('common.description')}</th>
                  <th scope="col" className={`${th} w-24 text-right`}>{t('invoice.quantity')}</th>
                  <th scope="col" className={`${th} w-28 text-right`}>{t('invoice.unitPrice')}</th>
                  <th scope="col" className={`${th} w-32 text-right`}>{t('invoice.amount')}</th>
                  <th scope="col" className="w-12"><span className="sr-only">{t('common.actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {draft.extraLines.map((line, i) => (
                  <tr key={line.id} className="border-t border-line odd:bg-surface even:bg-peach-soft">
                    <td className="px-1 py-1">
                      <CellInput aria-label={`${t('invoice.extras')} ${i + 1}: ${t('common.description')}`} value={line.description} onChange={(e) => setExtra(line.id, { description: e.target.value })} />
                    </td>
                    <td className="px-1 py-1">
                      <NumberCell aria-label={`${t('invoice.extras')} ${i + 1}: ${t('invoice.quantity')}`} value={line.quantity} onChange={(v) => setExtra(line.id, { quantity: v })} />
                    </td>
                    <td className="px-1 py-1">
                      <NumberCell aria-label={`${t('invoice.extras')} ${i + 1}: ${t('invoice.unitPrice')}`} value={line.unitPrice} onChange={(v) => setExtra(line.id, { unitPrice: v })} />
                    </td>
                    <td className="tabular px-3 py-1 text-right">{money(extraAmount(line))}</td>
                    <td className="px-1 py-1 text-right">
                      <IconButton label={`${t('reports.removeRow')} ${i + 1}`} onClick={() => set('extraLines', draft.extraLines.filter((l) => l.id !== line.id))}>
                        <Trash2 size={16} aria-hidden="true" />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={t('invoice.totals')} icon={<Calculator size={20} />}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div>
            <p className="mb-2 text-sm font-semibold">{t('invoiceSettings.adjustments')}</p>
            <AdjustmentList
              items={draft.adjustments}
              onChange={(adjustments) => set('adjustments', adjustments)}
              onEdit={(id, patch) => set('adjustments', draft.adjustments.map((a) => (a.id === id ? { ...a, ...patch } : a)))}
            />
          </div>
          <dl className="flex flex-col gap-1 text-sm">
            <SummaryRow label={t('invoice.subtotal')} value={money(totals.subtotal)} />
            {totals.adjustments.map((a) => (
              <SummaryRow key={a.id} label={a.label || (a.kind === 'tax' ? t('invoiceSettings.tax') : t('invoiceSettings.discount'))} value={money(a.amount)} />
            ))}
            <div className="mt-2 flex items-center justify-between gap-4 rounded-xl bg-tomato px-4 py-3 text-white">
              <dt className="font-semibold">{t('invoice.totalDue')}</dt>
              <dd className="tabular text-2xl font-bold">
                {money(totals.total)} <span className="text-sm font-semibold">{draft.currency}</span>
              </dd>
            </div>
          </dl>
        </div>
      </Card>

      <Card title={t('invoiceSettings.texts')} icon={<FileText size={20} />}>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t('invoice.payment')}>
            {(p) => <TextArea {...p} rows={3} value={draft.paymentDetails} onChange={(e) => set('paymentDetails', e.target.value)} />}
          </Field>
          <Field label={t('invoiceSettings.notes')}>
            {(p) => <TextArea {...p} rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />}
          </Field>
          <Field label={t('invoiceSettings.footer')}>
            {(p) => <TextArea {...p} rows={3} value={draft.footer} onChange={(e) => set('footer', e.target.value)} />}
          </Field>
        </div>
      </Card>

      <Card title={t('invoice.email')} icon={<Mail size={20} />}>
        <p className="mb-4 text-sm text-muted">{t('invoice.emailHint')}</p>
        <dl className="grid gap-3 text-sm sm:grid-cols-[6rem_1fr_auto] sm:items-center">
          {[
            { label: t('invoice.to'), value: email.to },
            { label: t('invoice.cc'), value: email.cc },
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

      <TimesheetCard
        containerRef={timesheetRef}
        selected={selected}
        setSelected={setSelected}
        setRows={setRows}
        missingIds={new Set(missing.flatMap((m) => m.rowIds.map((id) => `${m.field}:${id}`)))}
        draft={draft}
        profile={profile}
        showRequester={showRequester}
        showProject={showProject}
        showCategory={showCategory}
        customFields={customFields}
        hasUnlinked={hasUnlinked}
        totalHours={totals.timesheetHours}
        setRow={setRow}
        addRow={addRow}
        removeRow={removeRow}
        toTime={toTime}
      />

      <ConfirmDialog
        open={!!removing}
        title={t('invoice.deleteRowTitle')}
        body={t('invoice.deleteRowBody', {
          date: removing ? formatDay(removing.row.date, language) : '',
          hours: removing ? formatNumber(round2(removing.row.hours), language) : '',
        })}
        confirmLabel={t('common.delete')}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) {
            deleteEntry(removing.entry.id);
            update({ timesheet: draft.timesheet.filter((r) => r.id !== removing.row.id) });
          }
          setRemoving(null);
        }}
      />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular font-semibold">{value}</dd>
    </div>
  );
}

function TimesheetCard({
  containerRef,
  selected,
  setSelected,
  setRows,
  missingIds,
  draft,
  profile,
  showRequester,
  showProject,
  showCategory,
  customFields,
  hasUnlinked,
  totalHours,
  setRow,
  addRow,
  removeRow,
  toTime,
}: {
  containerRef: React.Ref<HTMLDivElement>;
  selected: Set<string>;
  setSelected: (ids: Set<string>) => void;
  setRows: (ids: Set<string>, patch: Partial<TimesheetRow>) => void;
  /** "field:rowId" for cells a template needs but that are empty. */
  missingIds: Set<string>;
  draft: InvoiceDraft;
  profile: Profile;
  showRequester: boolean;
  showProject: boolean;
  showCategory: boolean;
  customFields: Profile['customFields'];
  hasUnlinked: boolean;
  totalHours: number;
  setRow: (id: string, patch: Partial<TimesheetRow>) => void;
  addRow: () => void;
  removeRow: (row: TimesheetRow) => void;
  toTime: (value: string) => string;
}) {
  const { t, language } = useStore();
  const categories = profile.categories;
  const allSelected = draft.timesheet.length > 0 && draft.timesheet.every((r) => selected.has(r.id));
  const selectedCount = draft.timesheet.filter((r) => selected.has(r.id)).length;
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
  };
  const missingCell = (field: ListField, id: string) => (missingIds.has(`${field}:${id}`) ? 'bg-coral-soft' : '');
  return (
    <div ref={containerRef} className="scroll-mt-24">
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
      {hasUnlinked && <p className="mb-3 rounded-xl border border-peach bg-peach-soft px-3 py-2 text-sm text-ink">{t('invoice.timesheetUnlinked')}</p>}
      {selectedCount > 0 && (showRequester || showProject) && (
        <BulkFill
          count={selectedCount}
          showRequester={showRequester}
          showProject={showProject}
          onApply={(patch) => setRows(selected, patch)}
          onClear={() => setSelected(new Set())}
        />
      )}
      <div className="relative overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-coral text-ink">
            <tr>
              <th scope="col" className="w-10 px-2 py-2">
                <input
                  type="checkbox"
                  aria-label={t('invoice.selectAll')}
                  checked={allSelected}
                  onChange={(e) => setSelected(e.target.checked ? new Set(draft.timesheet.map((r) => r.id)) : new Set())}
                  className="h-4 w-4 accent-tomato"
                />
              </th>
              <th scope="col" className={`${th} w-40`}>{t('common.date')}</th>
              <th scope="col" className={`${th} w-32`}>{t('common.start')}</th>
              <th scope="col" className={`${th} w-32`}>{t('common.end')}</th>
              <th scope="col" className={`${th} w-28 text-right`}>{t('common.hours')}</th>
              {showRequester && <th scope="col" className={`${th} min-w-48`}>{t('fields.requestedBy')}</th>}
              {showProject && <th scope="col" className={`${th} min-w-48`}>{t('fields.project')}</th>}
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
            {draft.timesheet.map((row, i) => {
              const calculated = hoursMismatch(row);
              return (
                <tr key={row.id} className={`border-t border-line align-top ${selected.has(row.id) ? 'bg-sky-soft' : 'odd:bg-surface even:bg-peach-soft'}`}>
                  <td className="px-2 py-2.5 text-center">
                    <input
                      type="checkbox"
                      aria-label={t('invoice.selectRow', { n: i + 1 })}
                      checked={selected.has(row.id)}
                      onChange={(e) => toggle(row.id, e.target.checked)}
                      className="h-4 w-4 accent-tomato"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <CellInput type="date" aria-label={`${t('common.date')} ${i + 1}`} value={row.date} onChange={(e) => setRow(row.id, { date: e.target.value })} />
                  </td>
                  <td className="px-1 py-1">
                    <CellInput type="time" step={1} aria-label={`${t('common.start')} ${i + 1}`} value={row.start} onChange={(e) => setRow(row.id, { start: toTime(e.target.value) })} />
                  </td>
                  <td className="px-1 py-1">
                    <CellInput type="time" step={1} aria-label={`${t('common.end')} ${i + 1}`} value={row.end} onChange={(e) => setRow(row.id, { end: toTime(e.target.value) })} />
                  </td>
                  <td className="px-1 py-1">
                    <NumberCell
                      aria-label={`${t('common.hours')} ${i + 1}`}
                      aria-describedby={calculated !== null ? `mismatch-${row.id}` : undefined}
                      className={calculated !== null ? '!border-coral' : ''}
                      value={round2(row.hours)}
                      onChange={(v) => setRow(row.id, { hours: v })}
                    />
                    {calculated !== null && (
                      <div id={`mismatch-${row.id}`} className="mt-1 flex flex-col items-end gap-1 px-1 text-xs">
                        <span className="flex items-center gap-1 text-brand">
                          <TriangleAlert size={12} aria-hidden="true" />
                          {t('invoice.mismatch', { calc: formatNumber(round2(calculated), language) })}
                        </span>
                        <button
                          type="button"
                          className="rounded-md border border-line bg-surface px-2 py-0.5 font-semibold hover:bg-peach-soft"
                          onClick={() => setRow(row.id, { hours: calculated, hoursEdited: false })}
                        >
                          {t('invoice.useCalculated')}
                        </button>
                      </div>
                    )}
                  </td>
                  {showRequester && (
                    <td className={`px-1 py-1 ${missingCell('requestedBy', row.id)}`}>
                      <FieldValueInput field="requestedBy" compact label={`${t('fields.requestedBy')} ${i + 1}`} value={row.requestedBy ?? ''} onChange={(v) => setRow(row.id, { requestedBy: v })} />
                    </td>
                  )}
                  {showProject && (
                    <td className={`px-1 py-1 ${missingCell('project', row.id)}`}>
                      <FieldValueInput field="project" compact label={`${t('fields.project')} ${i + 1}`} value={row.project ?? ''} onChange={(v) => setRow(row.id, { project: v })} />
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
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-line bg-sky font-semibold text-ink">
              <td className="px-3 py-2" colSpan={4}>
                {t('common.total')}
              </td>
              <td className="tabular px-3 py-2 text-right">{formatNumber(round2(totalHours), language)}</td>
              <td colSpan={2 + Number(showRequester) + Number(showProject) + Number(showCategory) + customFields.length} />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
    </div>
  );
}

/** Sets Requested by or Project on every selected timesheet row at once. */
function BulkFill({
  count,
  showRequester,
  showProject,
  onApply,
  onClear,
}: {
  count: number;
  showRequester: boolean;
  showProject: boolean;
  onApply: (patch: Partial<TimesheetRow>) => void;
  onClear: () => void;
}) {
  const { t } = useStore();
  const toast = useToast();
  const [values, setValues] = useState<Record<ListField, string>>({ requestedBy: '', project: '' });
  const fields = (['requestedBy', 'project'] as const).filter((f) => (f === 'requestedBy' ? showRequester : showProject));
  const fieldName = (field: ListField) => t(field === 'requestedBy' ? 'fields.requestedBy' : 'fields.project');
  const apply = (field: ListField) => {
    onApply({ [field]: values[field] });
    toast(t('invoice.bulkDone', { count, field: fieldName(field) }));
  };
  return (
    <section aria-label={t('invoice.bulkTitle')} className="mb-3 rounded-xl border border-sky bg-sky-soft p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{t('invoice.bulkSelected', { count })}</p>
        <Button size="sm" onClick={onClear}>
          {t('invoice.bulkClear')}
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {fields.map((field) => (
          <div key={field} className="flex items-end gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <label htmlFor={`bulk-${field}`} className="font-medium">
                {t('invoice.bulkSet', { field: fieldName(field) })}
              </label>
              <FieldValueInput field={field} id={`bulk-${field}`} value={values[field]} onChange={(v) => setValues((prev) => ({ ...prev, [field]: v }))} />
            </div>
            <Button size="sm" variant="primary" onClick={() => apply(field)}>
              {t('invoice.bulkApply')}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
