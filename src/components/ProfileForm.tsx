import { BriefcaseBusiness, Clock3, Plus, Receipt, Tags, UserRound, X } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { MessageKey } from '../lib/i18n';
import { useStore } from '../lib/store';
import { timeZoneList } from '../lib/tz';
import type { Profile, WeekDay } from '../lib/types';
import { Button, Card, Field, IconButton, Select, TextArea, TextInput, Toggle } from './ui';

const CURRENCIES = ['USD', 'EUR', 'NIO', 'MXN', 'CAD', 'GBP'];

export function ProfileForm({
  initial,
  submitLabel,
  onSubmit,
  onCategoriesChange,
  extraActions,
}: {
  initial: Profile;
  submitLabel: string;
  onSubmit: (profile: Profile) => void;
  /** When set, category changes are saved right away instead of waiting for the submit button. */
  onCategoriesChange?: (categories: string[]) => void;
  extraActions?: ReactNode;
}) {
  const { t } = useStore();
  const [profile, setProfile] = useState<Profile>(initial);
  const [errors, setErrors] = useState<Partial<Record<'name' | 'modes', string>>>({});
  const [newCategory, setNewCategory] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const zones = useMemo(() => {
    const list = timeZoneList();
    return list.includes(profile.timeZone) ? list : [profile.timeZone, ...list];
  }, [profile.timeZone]);

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => setProfile((p) => ({ ...p, [key]: value }));
  const setInvoice = <K extends keyof Profile['invoice']>(key: K, value: Profile['invoice'][K]) =>
    setProfile((p) => ({ ...p, invoice: { ...p.invoice, [key]: value } }));
  const setOvertime = <K extends keyof Profile['overtime']>(key: K, value: Profile['overtime'][K]) =>
    setProfile((p) => ({ ...p, overtime: { ...p.overtime, [key]: value } }));

  const num = (value: string, fallback = 0) => {
    const n = Number(value.replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  };

  const setCategories = (categories: string[]) => {
    set('categories', categories);
    onCategoriesChange?.(categories);
  };

  const addCategory = () => {
    const name = newCategory.trim();
    if (!name) return;
    if (profile.categories.some((c) => c.toLowerCase() === name.toLowerCase())) {
      setCategoryError(t('profile.categoryExists'));
      return;
    }
    setCategories([...profile.categories, name]);
    setNewCategory('');
    setCategoryError('');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (!profile.name.trim()) next.name = t('profile.nameRequired');
    if (!profile.invoiceMode && !profile.overtimeMode) next.modes = t('profile.modeRequired');
    setErrors(next);
    if (Object.keys(next).length) return;
    onSubmit({
      ...profile,
      name: profile.name.trim(),
      categories: profile.categories.length ? profile.categories : ['Other'],
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <Card title={t('profile.basics')} icon={<UserRound size={20} />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('profile.name')} error={errors.name}>
            {(p) => (
              <TextInput {...p} value={profile.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" required />
            )}
          </Field>
          <Field label={t('profile.timeZone')}>
            {(p) => (
              <Select {...p} value={profile.timeZone} onChange={(e) => set('timeZone', e.target.value)}>
                {zones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </Card>

      <Card title={t('profile.modes')} icon={<Clock3 size={20} />}>
        <p className="mb-3 text-sm text-muted">{t('profile.modesHint')}</p>
        <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label={t('profile.modes')}>
          <Toggle
            checked={profile.invoiceMode}
            onChange={(v) => set('invoiceMode', v)}
            label={t('profile.invoiceMode')}
            hint={t('profile.invoiceModeHint')}
          />
          <Toggle
            checked={profile.overtimeMode}
            onChange={(v) => set('overtimeMode', v)}
            label={t('profile.overtimeMode')}
            hint={t('profile.overtimeModeHint')}
          />
        </div>
        {errors.modes && (
          <p className="mt-2 text-xs font-medium text-brand" role="alert">
            {errors.modes}
          </p>
        )}
      </Card>

      {profile.invoiceMode && (
        <Card title={t('profile.invoiceMode')} icon={<Receipt size={20} />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('profile.rate')}>
              {(p) => (
                <TextInput
                  {...p}
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={profile.invoice.rate || ''}
                  onChange={(e) => setInvoice('rate', num(e.target.value))}
                />
              )}
            </Field>
            <Field label={t('profile.currency')}>
              {(p) => (
                <Select {...p} value={profile.invoice.currency} onChange={(e) => setInvoice('currency', e.target.value)}>
                  {(CURRENCIES.includes(profile.invoice.currency) ? CURRENCIES : [profile.invoice.currency, ...CURRENCIES]).map(
                    (c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ),
                  )}
                </Select>
              )}
            </Field>
            <Field label={t('profile.prefix')}>
              {(p) => <TextInput {...p} value={profile.invoice.prefix} onChange={(e) => setInvoice('prefix', e.target.value)} />}
            </Field>
            <Field label={t('profile.nextNumber')}>
              {(p) => (
                <TextInput
                  {...p}
                  type="number"
                  min={1}
                  step={1}
                  value={profile.invoice.nextNumber}
                  onChange={(e) => setInvoice('nextNumber', Math.max(1, Math.floor(num(e.target.value, 1))))}
                />
              )}
            </Field>
            <Field label={t('profile.contact')} hint={t('profile.contactHint')} className="sm:col-span-2">
              {(p) => <TextArea {...p} value={profile.contact} onChange={(e) => set('contact', e.target.value)} rows={2} />}
            </Field>
            <Field label={t('profile.billTo')} className="sm:col-span-2">
              {(p) => <TextInput {...p} value={profile.invoice.billTo} onChange={(e) => setInvoice('billTo', e.target.value)} />}
            </Field>
            <Field label={t('profile.apEmail')}>
              {(p) => (
                <TextInput {...p} type="email" value={profile.invoice.apEmail} onChange={(e) => setInvoice('apEmail', e.target.value)} />
              )}
            </Field>
            <Field label={`${t('profile.ccEmail')} (${t('common.optional')})`}>
              {(p) => (
                <TextInput {...p} type="email" value={profile.invoice.ccEmail} onChange={(e) => setInvoice('ccEmail', e.target.value)} />
              )}
            </Field>
            <Field
              label={`${t('profile.paymentDetails')} (${t('common.optional')})`}
              hint={t('profile.paymentDetailsHint')}
              className="sm:col-span-2"
            >
              {(p) => (
                <TextArea
                  {...p}
                  value={profile.invoice.paymentDetails}
                  onChange={(e) => setInvoice('paymentDetails', e.target.value)}
                  rows={3}
                />
              )}
            </Field>
          </div>
        </Card>
      )}

      {profile.overtimeMode && (
        <Card title={t('profile.overtimeMode')} icon={<BriefcaseBusiness size={20} />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('profile.standardHours')}>
              {(p) => (
                <TextInput
                  {...p}
                  type="number"
                  min={0}
                  step="0.5"
                  value={profile.overtime.standardHours}
                  onChange={(e) => setOvertime('standardHours', num(e.target.value, 40))}
                />
              )}
            </Field>
            <Field label={t('profile.weekStart')}>
              {(p) => (
                <Select
                  {...p}
                  value={profile.overtime.weekStartsOn}
                  onChange={(e) => setOvertime('weekStartsOn', Number(e.target.value) as WeekDay)}
                >
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                    <option key={d} value={d}>
                      {t(`weekday.${d}` as MessageKey)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('profile.hoursPerDay')}>
              {(p) => (
                <TextInput
                  {...p}
                  type="number"
                  min={1}
                  step="0.5"
                  value={profile.overtime.hoursPerDay}
                  onChange={(e) => setOvertime('hoursPerDay', num(e.target.value, 8))}
                />
              )}
            </Field>
            <Field label={`${t('profile.openingBalance')} (${t('common.optional')})`} hint={t('profile.openingBalanceHint')}>
              {(p) => (
                <TextInput
                  {...p}
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={profile.overtime.openingBalance || ''}
                  onChange={(e) => setOvertime('openingBalance', num(e.target.value))}
                />
              )}
            </Field>
          </div>
        </Card>
      )}

      <Card title={t('profile.categories')} icon={<Tags size={20} />}>
        <ul className="mb-4 flex flex-wrap gap-2">
          {profile.categories.map((category) => (
            <li key={category} className="flex items-center gap-1 rounded-full border border-peach bg-peach-soft py-1 pl-3 pr-1 text-sm">
              {category}
              <IconButton
                label={t('profile.removeCategory', { name: category })}
                className="h-7 w-7"
                onClick={() => setCategories(profile.categories.filter((c) => c !== category))}
              >
                <X size={14} aria-hidden="true" />
              </IconButton>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field label={t('profile.newCategory')} error={categoryError} className="flex-1">
            {(p) => (
              <TextInput
                {...p}
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCategory();
                  }
                }}
              />
            )}
          </Field>
          <Button onClick={addCategory} className={categoryError ? 'sm:mb-6' : ''}>
            <Plus size={16} aria-hidden="true" />
            {t('common.add')}
          </Button>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>{extraActions}</div>
        <Button type="submit" variant="primary" size="lg">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
