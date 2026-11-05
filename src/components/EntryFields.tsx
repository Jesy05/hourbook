import { ArrowDown, ArrowUp, ListPlus, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { useId, useState } from 'react';
import { newId } from '../lib/defaults';
import type { MessageKey } from '../lib/i18n';
import { useStore } from '../lib/store';
import type { CustomField, CustomFieldType, CustomValue, Profile } from '../lib/types';
import { FieldValueInput } from './Combobox';
import { FieldValueList } from './FieldValueList';
import { useToast } from './Toast';
import { Button, Card, Field, IconButton, Select, TextInput, Toggle } from './ui';

/** Input for one custom field value. */
export function CustomFieldInput({
  field,
  value,
  onChange,
  id,
  compact = false,
  label,
}: {
  field: CustomField;
  value: CustomValue | undefined;
  onChange: (value: CustomValue | undefined) => void;
  id?: string;
  compact?: boolean;
  label?: string;
}) {
  const { t } = useStore();
  const cls = compact
    ? 'w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm text-ink hover:border-line focus:border-sky focus:bg-surface focus:outline-none focus:ring-2 focus:ring-sky/40'
    : 'w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/40';
  if (field.type === 'checkbox') {
    return (
      <input
        id={id}
        aria-label={label}
        type="checkbox"
        checked={value === true}
        onChange={(e) => onChange(e.target.checked ? true : undefined)}
        className="h-5 w-5 accent-tomato"
      />
    );
  }
  if (field.type === 'select') {
    return (
      <select id={id} aria-label={label} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || undefined)} className={cls}>
        <option value="">{t('fields.none')}</option>
        {field.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === 'number') {
    return (
      <input
        id={id}
        aria-label={label}
        type="number"
        step="any"
        inputMode="decimal"
        value={typeof value === 'number' ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        className={cls}
      />
    );
  }
  return <input id={id} aria-label={label} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || undefined)} className={cls} />;
}

export interface ExtraFieldValues {
  requestedBy?: string;
  project?: string;
  custom?: Record<string, CustomValue>;
}

/** The optional fields this profile has turned on, for the timer and entry forms. */
export function EntryExtraFields({
  profile,
  values,
  onChange,
  invertLabels = false,
}: {
  profile: Profile;
  values: ExtraFieldValues;
  onChange: (values: ExtraFieldValues) => void;
  /** Light labels for use on the red running-timer card. */
  invertLabels?: boolean;
}) {
  const { t } = useStore();
  const customFields = profile.customFields.filter((f) => f.enabled && f.name.trim());
  if (!profile.fields.requestedBy && !profile.fields.project && customFields.length === 0) return null;

  const setCustom = (fieldId: string, value: CustomValue | undefined) => {
    const custom = { ...(values.custom ?? {}) };
    if (value === undefined) delete custom[fieldId];
    else custom[fieldId] = value;
    onChange({ ...values, custom });
  };

  return (
    <div className={`grid gap-3 sm:grid-cols-2 ${invertLabels ? '[&_label]:text-white' : ''}`}>
      {profile.fields.requestedBy && (
        <Field label={t('fields.requestedBy')}>
          {(p) => <FieldValueInput field="requestedBy" id={p.id} value={values.requestedBy ?? ''} onChange={(requestedBy) => onChange({ ...values, requestedBy })} />}
        </Field>
      )}
      {profile.fields.project && (
        <Field label={t('fields.project')}>
          {(p) => <FieldValueInput field="project" id={p.id} value={values.project ?? ''} onChange={(project) => onChange({ ...values, project })} />}
        </Field>
      )}
      {customFields.map((field) =>
        field.type === 'checkbox' ? (
          <CheckboxField key={field.id} field={field} value={values.custom?.[field.id]} onChange={(v) => setCustom(field.id, v)} />
        ) : (
          <Field key={field.id} label={field.name}>
            {(p) => <CustomFieldInput id={p.id} field={field} value={values.custom?.[field.id]} onChange={(v) => setCustom(field.id, v)} />}
          </Field>
        ),
      )}
    </div>
  );
}

function CheckboxField({ field, value, onChange }: { field: CustomField; value: CustomValue | undefined; onChange: (v: CustomValue | undefined) => void }) {
  const id = useId();
  return (
    <div className="flex items-center gap-2 self-end py-2.5">
      <CustomFieldInput id={id} field={field} value={value} onChange={onChange} />
      <label htmlFor={id} className="text-sm font-medium">
        {field.name}
      </label>
    </div>
  );
}

/** Text of a custom value for lists, tables and exports. */
export function customValueText(value: CustomValue | undefined, yes: string, no: string): string {
  if (value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? yes : no;
  return String(value);
}

const TYPES: CustomFieldType[] = ['text', 'select', 'number', 'checkbox'];

/** Settings card: turn fields on or off, manage saved values and custom fields. Saves as you go. */
export function EntryFieldsSettings() {
  const { t, profile, saveProfile } = useStore();
  const toast = useToast();
  const [optionDrafts, setOptionDrafts] = useState<Record<string, string>>({});
  if (!profile) return null;

  const save = (patch: Partial<Profile>, quiet = false) => {
    saveProfile({ ...profile, ...patch });
    if (!quiet) toast(t('entryFields.saved'));
  };
  const setField = (id: string, patch: Partial<CustomField>, quiet = true) =>
    save({ customFields: profile.customFields.map((f) => (f.id === id ? { ...f, ...patch } : f)) }, quiet);
  const move = (index: number, delta: number) => {
    const list = [...profile.customFields];
    const [item] = list.splice(index, 1);
    list.splice(index + delta, 0, item);
    save({ customFields: list }, true);
  };

  return (
    <Card title={t('entryFields.title')} icon={<SlidersHorizontal size={20} />}>
      <p className="mb-4 text-sm text-muted">{t('entryFields.hint')}</p>
      <div className="grid gap-3 md:grid-cols-3">
        <Toggle
          checked={profile.fields.category}
          onChange={(v) => save({ fields: { ...profile.fields, category: v } })}
          label={t('common.category')}
          hint={t('entryFields.categoryHint')}
        />
        <Toggle
          checked={profile.fields.requestedBy}
          onChange={(v) => save({ fields: { ...profile.fields, requestedBy: v } })}
          label={t('fields.requestedBy')}
          hint={t('entryFields.requestedByHint')}
        />
        <Toggle
          checked={profile.fields.project}
          onChange={(v) => save({ fields: { ...profile.fields, project: v } })}
          label={t('fields.project')}
          hint={t('entryFields.projectHint')}
        />
      </div>

      {profile.fields.requestedBy && <FieldValueList field="requestedBy" title={t('entryFields.savedRequesters')} />}
      {profile.fields.project && <FieldValueList field="project" title={t('entryFields.savedProjects')} />}

      <div className="mt-6 border-t border-line pt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{t('entryFields.custom')}</h3>
          <Button
            size="sm"
            onClick={() =>
              save({ customFields: [...profile.customFields, { id: newId(), name: '', type: 'text', options: [], enabled: true }] }, true)
            }
          >
            <Plus size={16} aria-hidden="true" />
            {t('entryFields.addCustom')}
          </Button>
        </div>
        {profile.customFields.length === 0 ? (
          <p className="text-sm text-muted">{t('entryFields.noCustom')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {profile.customFields.map((field, index) => (
              <li key={field.id} className="rounded-xl border border-line p-3">
                <div className="grid items-end gap-3 sm:grid-cols-[1fr_10rem_auto]">
                  <Field label={t('entryFields.fieldName')}>
                    {(p) => <TextInput {...p} value={field.name} onChange={(e) => setField(field.id, { name: e.target.value })} />}
                  </Field>
                  <Field label={t('entryFields.fieldType')}>
                    {(p) => (
                      <Select {...p} value={field.type} onChange={(e) => setField(field.id, { type: e.target.value as CustomFieldType })}>
                        {TYPES.map((type) => (
                          <option key={type} value={type}>
                            {t(`entryFields.type.${type}` as MessageKey)}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <div className="flex items-center gap-1 pb-1">
                    <label className="mr-2 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={field.enabled}
                        onChange={(e) => setField(field.id, { enabled: e.target.checked })}
                        className="h-5 w-5 accent-tomato"
                      />
                      {t('entryFields.enabled')}
                    </label>
                    <IconButton label={t('entryFields.moveUp')} disabled={index === 0} className="disabled:opacity-30" onClick={() => move(index, -1)}>
                      <ArrowUp size={16} aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      label={t('entryFields.moveDown')}
                      disabled={index === profile.customFields.length - 1}
                      className="disabled:opacity-30"
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown size={16} aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      label={t('entryFields.remove', { name: field.name || '-' })}
                      onClick={() => save({ customFields: profile.customFields.filter((f) => f.id !== field.id) })}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </IconButton>
                  </div>
                </div>
                {field.type === 'select' && (
                  <div className="mt-3">
                    <p className="mb-1.5 text-sm font-medium">{t('entryFields.options')}</p>
                    <ul className="mb-2 flex flex-wrap gap-2">
                      {field.options.map((option) => (
                        <li key={option} className="flex items-center gap-1 rounded-full border border-peach bg-peach-soft py-1 pl-3 pr-1 text-sm">
                          {option}
                          <IconButton
                            label={t('profile.removeCategory', { name: option })}
                            className="h-7 w-7"
                            onClick={() => setField(field.id, { options: field.options.filter((o) => o !== option) })}
                          >
                            <X size={14} aria-hidden="true" />
                          </IconButton>
                        </li>
                      ))}
                    </ul>
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const value = (optionDrafts[field.id] ?? '').trim();
                        if (value && !field.options.includes(value)) setField(field.id, { options: [...field.options, value] });
                        setOptionDrafts({ ...optionDrafts, [field.id]: '' });
                      }}
                    >
                      <TextInput
                        aria-label={t('entryFields.newOption')}
                        placeholder={t('entryFields.newOption')}
                        value={optionDrafts[field.id] ?? ''}
                        onChange={(e) => setOptionDrafts({ ...optionDrafts, [field.id]: e.target.value })}
                      />
                      <Button type="submit" size="sm">
                        <ListPlus size={16} aria-hidden="true" />
                        {t('common.add')}
                      </Button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
