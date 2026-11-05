import { ArrowDown, ArrowUp, LayoutTemplate, Save, Star, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { newId } from '../lib/defaults';
import type { MessageKey } from '../lib/i18n';
import { BUILT_IN_TOKENS, DATE_FORMATS, formatInvoiceDate } from '../lib/invoice/template';
import { useStore } from '../lib/store';
import type { ColumnKey, CustomField, GroupKey, InvoiceSections, InvoiceTemplate, Profile } from '../lib/types';
import { useToast } from './Toast';
import { Button, Card, Field, IconButton, Select, TextInput } from './ui';

const BASE_COLUMNS: ColumnKey[] = ['description', 'date', 'hours', 'rate', 'amount', 'category', 'project', 'requestedBy'];
const GROUP_FIELDS: Exclude<GroupKey, 'entry'>[] = ['date', 'requestedBy', 'project', 'category'];
const SECTIONS: (keyof InvoiceSections)[] = ['from', 'billTo', 'terms', 'payment', 'notes', 'timesheet'];

export function columnLabel(key: ColumnKey | GroupKey, t: (key: MessageKey) => string, customFields: CustomField[]): string {
  if (key.startsWith('custom:')) return customFields.find((f) => `custom:${f.id}` === key)?.name || '?';
  const labels: Record<string, MessageKey> = {
    description: 'common.description',
    date: 'common.date',
    hours: 'common.hours',
    rate: 'invoice.rate',
    amount: 'invoice.amount',
    category: 'common.category',
    project: 'fields.project',
    requestedBy: 'fields.requestedBy',
    entry: 'layout.perEntry',
  };
  return t(labels[key]);
}

function sameTemplate(a: InvoiceTemplate, b: InvoiceTemplate): boolean {
  return JSON.stringify({ ...a, name: '' }) === JSON.stringify({ ...b, name: '' });
}

/**
 * Layout of the invoice being edited, with saved templates per profile.
 * Changes apply to this draft; saving them updates or creates a template.
 */
export function InvoiceLayout({
  template,
  profile,
  previewLine,
  onChange,
}: {
  template: InvoiceTemplate;
  profile: Profile;
  /** First line description as it will appear, for the live preview. */
  previewLine: string;
  onChange: (template: InvoiceTemplate) => void;
}) {
  const { t, saveProfile } = useStore();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [newName, setNewName] = useState('');
  const customFields = profile.customFields.filter((f) => f.enabled && f.name.trim());
  const saved = profile.invoice.templates;
  const savedMatch = saved.find((s) => s.id === template.id);
  const isDefault = profile.invoice.defaultTemplateId === template.id;
  const set = (patch: Partial<InvoiceTemplate>) => onChange({ ...template, ...patch });
  const saveTemplates = (templates: InvoiceTemplate[], defaultTemplateId = profile.invoice.defaultTemplateId) =>
    saveProfile({ ...profile, invoice: { ...profile.invoice, templates, defaultTemplateId } });

  // Grouping: "one line per entry" or any mix of fields.
  const perEntry = template.groupBy.includes('entry') || template.groupBy.length === 0;
  const groupOptions: Exclude<GroupKey, 'entry'>[] = [...GROUP_FIELDS, ...customFields.map((f) => `custom:${f.id}` as const)];
  const toggleGroup = (key: Exclude<GroupKey, 'entry'>, on: boolean) => {
    const current = perEntry ? [] : template.groupBy;
    const next = on ? [...current, key] : current.filter((k) => k !== key);
    // Keep the on-screen order so the result is predictable.
    set({ groupBy: next.length ? groupOptions.filter((k) => next.includes(k)) : ['entry'] });
  };

  // Columns: chosen ones in their order, then the rest.
  const allColumns: ColumnKey[] = [...BASE_COLUMNS, ...customFields.map((f) => `custom:${f.id}` as const)];
  const ordered = [...template.columns.filter((c) => allColumns.includes(c)), ...allColumns.filter((c) => !template.columns.includes(c))];
  const moveColumn = (key: ColumnKey, delta: number) => {
    const cols = template.columns.filter((c) => allColumns.includes(c));
    const i = cols.indexOf(key);
    if (i < 0 || i + delta < 0 || i + delta >= cols.length) return;
    [cols[i], cols[i + delta]] = [cols[i + delta], cols[i]];
    set({ columns: cols });
  };

  const tokens = [...BUILT_IN_TOKENS, ...customFields.map((f) => f.name.trim())];
  const insertToken = (token: string) => {
    const el = inputRef.current;
    const text = template.descriptionTemplate;
    const at = el?.selectionStart ?? text.length;
    const next = `${text.slice(0, at)}{${token}}${text.slice(el?.selectionEnd ?? at)}`;
    set({ descriptionTemplate: next });
    requestAnimationFrame(() => {
      el?.focus();
      const pos = at + token.length + 2;
      el?.setSelectionRange(pos, pos);
    });
  };

  return (
    <Card title={t('layout.title')} icon={<LayoutTemplate size={20} />}>
      <p className="mb-4 text-sm text-muted">{t('layout.hint')}</p>

      <div className="mb-5 flex flex-wrap items-end gap-2">
        <Field label={t('layout.template')} className="min-w-56 flex-1">
          {(p) => (
            <Select
              {...p}
              value={savedMatch ? template.id : ''}
              onChange={(e) => {
                const chosen = saved.find((s) => s.id === e.target.value);
                if (chosen) onChange(structuredClone(chosen));
              }}
            >
              {!savedMatch && <option value="">{t('layout.unsaved')}</option>}
              {saved.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.id === profile.invoice.defaultTemplateId ? ` (${t('layout.default')})` : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {savedMatch && !sameTemplate(savedMatch, template) && (
          <Button
            size="sm"
            onClick={() => {
              saveTemplates(saved.map((s) => (s.id === template.id ? { ...template, name: s.name } : s)));
              toast(t('layout.updated', { name: savedMatch.name }));
            }}
          >
            <Save size={16} aria-hidden="true" />
            {t('layout.update')}
          </Button>
        )}
        {savedMatch && !isDefault && (
          <Button size="sm" onClick={() => saveTemplates(saved, template.id)}>
            <Star size={16} aria-hidden="true" />
            {t('layout.makeDefault')}
          </Button>
        )}
        {savedMatch && (
          <IconButton
            label={t('layout.delete', { name: savedMatch.name })}
            onClick={() => {
              const rest = saved.filter((s) => s.id !== template.id);
              saveTemplates(rest, isDefault ? (rest[0]?.id ?? null) : profile.invoice.defaultTemplateId);
              toast(t('layout.deleted', { name: savedMatch.name }));
            }}
          >
            <Trash2 size={16} aria-hidden="true" />
          </IconButton>
        )}
      </div>
      <form
        className="mb-6 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const name = newName.trim();
          if (!name) return;
          const created = { ...template, id: newId(), name };
          saveTemplates([...saved, created]);
          onChange(created);
          setNewName('');
          toast(t('layout.created', { name }));
        }}
      >
        <Field label={t('layout.saveAsName')} className="min-w-56 flex-1">
          {(p) => <TextInput {...p} value={newName} placeholder={t('layout.saveAsPlaceholder')} onChange={(e) => setNewName(e.target.value)} />}
        </Field>
        <Button type="submit" size="md" disabled={!newName.trim()}>
          <Save size={16} aria-hidden="true" />
          {t('layout.saveAs')}
        </Button>
      </form>

      <div className="grid gap-6 lg:grid-cols-2">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t('layout.grouping')}</legend>
          <p className="mb-2 text-xs text-muted">{t('layout.groupingHint')}</p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-tomato" checked={perEntry} onChange={() => set({ groupBy: ['entry'] })} />
              {t('layout.perEntry')}
            </label>
            {groupOptions.map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-tomato"
                  checked={!perEntry && template.groupBy.includes(key)}
                  onChange={(e) => toggleGroup(key, e.target.checked)}
                />
                {t('layout.by')} {columnLabel(key, t, customFields).toLowerCase()}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-3">
          <Field label={t('layout.description')} hint={t('layout.descriptionHint')}>
            {(p) => (
              <input
                {...p}
                ref={inputRef}
                value={template.descriptionTemplate}
                onChange={(e) => set({ descriptionTemplate: e.target.value })}
                className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 font-mono text-sm text-ink focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/40"
              />
            )}
          </Field>
          <div className="flex flex-wrap gap-1.5" aria-label={t('layout.tokens')} role="group">
            {tokens.map((token) => (
              <button
                key={token}
                type="button"
                onClick={() => insertToken(token)}
                className="rounded-lg border border-line bg-canvas px-2 py-1 font-mono text-xs hover:bg-peach-soft"
              >
                {`{${token}}`}
              </button>
            ))}
          </div>
          <div className="rounded-xl border border-sky/60 bg-sky-soft px-3 py-2 text-sm" aria-live="polite">
            <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-muted">{t('layout.preview')}</span>
            {previewLine || <span className="italic text-muted">{t('layout.previewEmpty')}</span>}
          </div>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t('layout.columns')}</legend>
          <p className="mb-2 text-xs text-muted">{t('layout.columnsHint')}</p>
          <ul className="flex flex-col gap-1">
            {ordered.map((key) => {
              const on = template.columns.includes(key);
              const label = columnLabel(key, t, customFields);
              return (
                <li key={key} className="flex items-center gap-2 rounded-lg px-1 hover:bg-canvas">
                  <label className="flex flex-1 items-center gap-2 py-1 text-sm">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-tomato"
                      checked={on}
                      onChange={(e) => set({ columns: e.target.checked ? [...template.columns, key] : template.columns.filter((c) => c !== key) })}
                    />
                    {label}
                  </label>
                  {on && (
                    <>
                      <IconButton label={t('layout.moveLeft', { name: label })} className="h-8 w-8" onClick={() => moveColumn(key, -1)}>
                        <ArrowUp size={14} aria-hidden="true" />
                      </IconButton>
                      <IconButton label={t('layout.moveRight', { name: label })} className="h-8 w-8" onClick={() => moveColumn(key, 1)}>
                        <ArrowDown size={14} aria-hidden="true" />
                      </IconButton>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>

        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('layout.dateFormat')}>
              {(p) => (
                <Select {...p} value={template.dateFormat} onChange={(e) => set({ dateFormat: e.target.value as InvoiceTemplate['dateFormat'] })}>
                  {DATE_FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {f} ({formatInvoiceDate('2026-10-29', f)})
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('layout.period')}>
              {(p) => (
                <Select {...p} value={template.periodMode} onChange={(e) => set({ periodMode: e.target.value as InvoiceTemplate['periodMode'] })}>
                  <option value="worked">{t('layout.periodWorked')}</option>
                  <option value="calendar">{t('layout.periodCalendar')}</option>
                </Select>
              )}
            </Field>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">{t('layout.sections')}</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {SECTIONS.map((key) => (
                <label key={key} className="flex items-center gap-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-tomato"
                    checked={template.sections[key]}
                    onChange={(e) => set({ sections: { ...template.sections, [key]: e.target.checked } })}
                  />
                  {t(`layout.section.${key}` as MessageKey)}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </div>
    </Card>
  );
}
