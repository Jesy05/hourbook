import { Building2, Coins, FileText, Hash, ImageUp, Plus, Receipt, Star, Trash2, TriangleAlert, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { formatInvoiceNumber } from '../lib/calc';
import { emptyClient, newId } from '../lib/defaults';
import { formatLongDate } from '../lib/format';
import type { MessageKey } from '../lib/i18n';
import { renderFileName } from '../lib/invoice/filename';
import { COMMON_CURRENCIES, formatCurrency } from '../lib/invoice/money';
import { dueDate, TERMS_PRESETS, termsLabel } from '../lib/invoice/terms';
import { useStore } from '../lib/store';
import { todayIn } from '../lib/tz';
import type { Adjustment, Client, InvoiceSettings as Settings, RateOverride, RoundingRule } from '../lib/types';
import { NumberCell } from './cells';
import { useToast } from './Toast';
import { Button, Card, Field, IconButton, Select, TextArea, TextInput } from './ui';

export const LOGO_MAX_BYTES = 300 * 1024;
export const ROUNDING_RULES: RoundingRule[] = ['none', 'quarter', 'tenth', 'up15'];

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-5 first:border-t-0 first:pt-0">
      <h3 className="mb-3 flex items-center gap-2 font-semibold">
        <span className="text-brand" aria-hidden="true">
          {icon}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Settings > Invoice. Every change is saved right away. */
export function InvoiceSettingsCard() {
  const { t, language, profile, saveProfile } = useStore();
  const toast = useToast();
  const [logoError, setLogoError] = useState('');
  if (!profile) return null;
  const s = profile.invoice;
  const set = (patch: Partial<Settings>) => saveProfile({ ...profile, invoice: { ...profile.invoice, ...patch } });
  const setBusiness = (patch: Partial<Settings['business']>) => set({ business: { ...s.business, ...patch } });
  const setClient = (id: string, patch: Partial<Client>) => set({ clients: s.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const setOverride = (id: string, patch: Partial<RateOverride>) =>
    set({ rateOverrides: s.rateOverrides.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  const setAdjustment = (id: string, patch: Partial<Adjustment>) =>
    set({ adjustments: s.adjustments.map((a) => (a.id === id ? { ...a, ...patch } : a)) });

  const today = todayIn(profile.timeZone);
  const due = dueDate(today, s.terms);
  const sampleName = renderFileName(
    s.fileNameTemplate,
    { name: s.business.name || profile.name, number: formatInvoiceNumber(s.prefix, s.nextNumber, s.padding), client: s.clients[0]?.company ?? '', start: `${today.slice(0, 7)}-01`, end: today },
    'xlsx',
  );

  const onLogo = (file: File | undefined) => {
    setLogoError('');
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) return setLogoError(t('invoiceSettings.logoType'));
    if (file.size > LOGO_MAX_BYTES) return setLogoError(t('invoiceSettings.logoSize', { kb: Math.round(LOGO_MAX_BYTES / 1024) }));
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' && setBusiness({ logo: reader.result });
    reader.onerror = () => setLogoError(t('invoiceSettings.logoType'));
    reader.readAsDataURL(file);
  };

  const overrideKeys = (kind: RateOverride['kind']) =>
    kind === 'category' ? profile.categories.map((c) => ({ value: c, label: c }))
    : kind === 'project' ? profile.projects.map((p) => ({ value: p, label: p }))
    : s.clients.map((c) => ({ value: c.id, label: c.company || t('invoiceSettings.unnamedClient') }));

  return (
    <Card title={t('invoiceSettings.title')} icon={<Receipt size={20} />}>
      <p className="mb-5 text-sm text-muted">{t('invoiceSettings.hint')}</p>
      <div className="flex flex-col gap-6">
        <Section title={t('invoiceSettings.business')} icon={<Building2 size={18} />}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t('invoiceSettings.businessName')}>
              {(p) => <TextInput {...p} value={s.business.name} placeholder={profile.name} onChange={(e) => setBusiness({ name: e.target.value })} />}
            </Field>
            <Field label={`${t('invoiceSettings.taxId')} (${t('common.optional')})`}>
              {(p) => <TextInput {...p} value={s.business.taxId} onChange={(e) => setBusiness({ taxId: e.target.value })} />}
            </Field>
            <Field label={t('invoiceSettings.email')}>
              {(p) => <TextInput {...p} type="email" value={s.business.email} onChange={(e) => setBusiness({ email: e.target.value })} />}
            </Field>
            <Field label={t('invoiceSettings.phone')}>
              {(p) => <TextInput {...p} type="tel" value={s.business.phone} onChange={(e) => setBusiness({ phone: e.target.value })} />}
            </Field>
            <Field label={t('invoiceSettings.address')} className="md:col-span-2">
              {(p) => <TextArea {...p} rows={2} className="min-h-0" value={s.business.address} onChange={(e) => setBusiness({ address: e.target.value })} />}
            </Field>
            <div className="md:col-span-2">
              <p className="mb-1.5 text-sm font-medium">{t('invoiceSettings.logo')}</p>
              <div className="flex flex-wrap items-center gap-3">
                {s.business.logo && (
                  <img src={s.business.logo} alt={t('invoiceSettings.logo')} className="h-14 max-w-40 rounded-lg border border-line bg-white object-contain p-1" />
                )}
                <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold hover:bg-peach-soft has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky">
                  <ImageUp size={16} aria-hidden="true" />
                  {s.business.logo ? t('invoiceSettings.logoChange') : t('invoiceSettings.logoUpload')}
                  <input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => onLogo(e.target.files?.[0])} />
                </label>
                {s.business.logo && (
                  <Button size="sm" onClick={() => setBusiness({ logo: undefined })}>
                    <Trash2 size={16} aria-hidden="true" />
                    {t('invoiceSettings.logoRemove')}
                  </Button>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">{t('invoiceSettings.logoHint', { kb: Math.round(LOGO_MAX_BYTES / 1024) })}</p>
              {logoError && (
                <p className="mt-1 text-xs font-medium text-brand" role="alert">
                  {logoError}
                </p>
              )}
            </div>
          </div>
        </Section>

        <Section title={t('invoiceSettings.clients')} icon={<Users size={18} />}>
          <ul className="flex flex-col gap-3">
            {s.clients.map((client) => {
              const isDefault = s.defaultClientId === client.id;
              return (
                <li key={client.id} className={`rounded-xl border p-3 ${isDefault ? 'border-coral' : 'border-line'}`}>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label={t('invoiceSettings.company')}>
                      {(p) => <TextInput {...p} value={client.company} onChange={(e) => setClient(client.id, { company: e.target.value })} />}
                    </Field>
                    <Field label={t('invoiceSettings.contactName')}>
                      {(p) => <TextInput {...p} value={client.contact} onChange={(e) => setClient(client.id, { contact: e.target.value })} />}
                    </Field>
                    <Field label={t('invoiceSettings.clientEmail')}>
                      {(p) => <TextInput {...p} type="email" value={client.email} onChange={(e) => setClient(client.id, { email: e.target.value })} />}
                    </Field>
                    <Field label={`${t('profile.ccEmail')} (${t('common.optional')})`}>
                      {(p) => <TextInput {...p} type="email" value={client.cc} onChange={(e) => setClient(client.id, { cc: e.target.value })} />}
                    </Field>
                    <Field label={t('invoiceSettings.address')} className="md:col-span-2">
                      {(p) => <TextArea {...p} rows={2} className="min-h-0" value={client.address} onChange={(e) => setClient(client.id, { address: e.target.value })} />}
                    </Field>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                    {isDefault ? (
                      <span className="mr-auto inline-flex items-center gap-1 text-xs font-semibold text-brand">
                        <Star size={14} aria-hidden="true" />
                        {t('invoiceSettings.defaultClient')}
                      </span>
                    ) : (
                      <Button size="sm" className="mr-auto" onClick={() => set({ defaultClientId: client.id })}>
                        <Star size={16} aria-hidden="true" />
                        {t('invoiceSettings.makeDefault')}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        const clients = s.clients.filter((c) => c.id !== client.id);
                        set({ clients, defaultClientId: isDefault ? (clients[0]?.id ?? null) : s.defaultClientId });
                      }}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      {t('common.delete')}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <Button
            size="sm"
            className="mt-3"
            onClick={() => {
              const client = emptyClient();
              set({ clients: [...s.clients, client], defaultClientId: s.defaultClientId ?? client.id });
            }}
          >
            <Plus size={16} aria-hidden="true" />
            {t('invoiceSettings.addClient')}
          </Button>
        </Section>

        <Section title={t('invoiceSettings.currencyRates')} icon={<Coins size={18} />}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('profile.currency')}>
              {(p) => (
                <Select {...p} value={s.currency} onChange={(e) => set({ currency: e.target.value })}>
                  {(COMMON_CURRENCIES.includes(s.currency) ? COMMON_CURRENCIES : [s.currency, ...COMMON_CURRENCIES]).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={`${t('invoiceSettings.symbol')} (${t('common.optional')})`} hint={t('invoiceSettings.symbolHint')}>
              {(p) => <TextInput {...p} value={s.currencySymbol} maxLength={5} onChange={(e) => set({ currencySymbol: e.target.value })} />}
            </Field>
            <Field label={t('profile.rate')} hint={t('invoiceSettings.preview', { value: formatCurrency(1234.5, s.currency, s.currencySymbol) })}>
              {(p) => <NumberCell {...p} className="!border-line !text-left !py-2.5" value={s.rate} onChange={(v) => set({ rate: v })} />}
            </Field>
          </div>
          <p className="mb-2 mt-4 text-sm font-medium">{t('invoiceSettings.overrides')}</p>
          <p className="mb-2 text-xs text-muted">{t('invoiceSettings.overridesHint')}</p>
          {s.rateOverrides.length > 0 && (
            <ul className="mb-2 flex flex-col gap-2">
              {s.rateOverrides.map((o) => (
                <li key={o.id} className="grid items-end gap-2 sm:grid-cols-[10rem_1fr_8rem_auto]">
                  <Field label={t('invoiceSettings.appliesTo')}>
                    {(p) => (
                      <Select {...p} value={o.kind} onChange={(e) => setOverride(o.id, { kind: e.target.value as RateOverride['kind'], key: '' })}>
                        <option value="category">{t('common.category')}</option>
                        <option value="project">{t('fields.project')}</option>
                        <option value="client">{t('invoiceSettings.client')}</option>
                      </Select>
                    )}
                  </Field>
                  <Field label={t('invoiceSettings.which')}>
                    {(p) => (
                      <Select {...p} value={o.key} onChange={(e) => setOverride(o.id, { key: e.target.value })}>
                        <option value="">{t('fields.none')}</option>
                        {overrideKeys(o.kind).map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label={t('invoice.rate')}>
                    {(p) => <NumberCell {...p} className="!border-line !text-left !py-2.5" value={o.rate} onChange={(v) => setOverride(o.id, { rate: v })} />}
                  </Field>
                  <IconButton label={t('common.delete')} className="mb-1" onClick={() => set({ rateOverrides: s.rateOverrides.filter((x) => x.id !== o.id) })}>
                    <Trash2 size={16} aria-hidden="true" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
          <Button size="sm" onClick={() => set({ rateOverrides: [...s.rateOverrides, { id: newId(), kind: 'category', key: '', rate: s.rate }] })}>
            <Plus size={16} aria-hidden="true" />
            {t('invoiceSettings.addOverride')}
          </Button>
        </Section>

        <Section title={t('invoiceSettings.termsNumbering')} icon={<Hash size={18} />}>
          <div className="grid gap-4 md:grid-cols-3">
            <Field
              label={t('invoiceSettings.terms')}
              hint={due ? t('invoiceSettings.dueExample', { date: formatLongDate(due, language) }) : t('invoiceSettings.noDue')}
            >
              {(p) => (
                <Select {...p} value={s.terms.preset} onChange={(e) => set({ terms: { ...s.terms, preset: e.target.value as Settings['terms']['preset'] } })}>
                  {TERMS_PRESETS.map((preset) => (
                    <option key={preset} value={preset}>
                      {preset === 'custom' ? t('invoiceSettings.customTerms') : termsLabel({ ...s.terms, preset })}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {s.terms.preset === 'custom' && (
              <>
                <Field label={t('invoiceSettings.termsText')}>
                  {(p) => <TextInput {...p} value={s.terms.customText} placeholder="Net 45" onChange={(e) => set({ terms: { ...s.terms, customText: e.target.value } })} />}
                </Field>
                <Field label={`${t('invoiceSettings.termsDays')} (${t('common.optional')})`}>
                  {(p) => (
                    <TextInput
                      {...p}
                      type="number"
                      min={0}
                      value={s.terms.customDays ?? ''}
                      onChange={(e) => set({ terms: { ...s.terms, customDays: e.target.value === '' ? null : Math.max(0, Math.floor(Number(e.target.value))) } })}
                    />
                  )}
                </Field>
              </>
            )}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            <Field label={t('profile.prefix')}>
              {(p) => <TextInput {...p} value={s.prefix} onChange={(e) => set({ prefix: e.target.value })} />}
            </Field>
            <Field label={t('profile.nextNumber')}>
              {(p) => (
                <TextInput {...p} type="number" min={1} value={s.nextNumber} onChange={(e) => set({ nextNumber: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />
              )}
            </Field>
            <Field label={t('invoiceSettings.padding')}>
              {(p) => (
                <TextInput {...p} type="number" min={1} max={8} value={s.padding} onChange={(e) => set({ padding: Math.min(8, Math.max(1, Math.floor(Number(e.target.value) || 1))) })} />
              )}
            </Field>
            <div className="flex flex-col justify-end gap-1">
              <p className="text-xs text-muted">{t('invoiceSettings.nextInvoice')}</p>
              <p className="tabular text-lg font-bold">{formatInvoiceNumber(s.prefix, s.nextNumber, s.padding)}</p>
            </div>
          </div>
          <Button
            size="sm"
            className="mt-3"
            onClick={() => {
              set({ nextNumber: 1 });
              toast(t('invoiceSettings.numberReset', { number: formatInvoiceNumber(s.prefix, 1, s.padding) }));
            }}
          >
            {t('invoiceSettings.resetNumber')}
          </Button>
        </Section>

        <Section title={t('invoiceSettings.texts')} icon={<FileText size={18} />}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t('invoice.payment')} className="md:col-span-2">
              {(p) => (
                <TextArea {...p} rows={3} value={s.paymentDetails} placeholder="Payment via Wise (USD, Swift) to bank account on file" onChange={(e) => set({ paymentDetails: e.target.value })} />
              )}
            </Field>
            <p className="-mt-2 flex items-start gap-2 rounded-xl border border-peach bg-peach-soft p-3 text-sm text-ink md:col-span-2">
              <TriangleAlert size={18} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
              {t('invoiceSettings.cardWarning')}
            </p>
            <Field label={t('invoiceSettings.notes')}>
              {(p) => <TextArea {...p} rows={2} className="min-h-0" value={s.notes} onChange={(e) => set({ notes: e.target.value })} />}
            </Field>
            <Field label={t('invoiceSettings.footer')}>
              {(p) => <TextArea {...p} rows={2} className="min-h-0" value={s.footer} onChange={(e) => set({ footer: e.target.value })} />}
            </Field>
          </div>
        </Section>

        <Section title={t('invoiceSettings.adjustments')} icon={<Receipt size={18} />}>
          <p className="mb-2 text-xs text-muted">{t('invoiceSettings.adjustmentsHint')}</p>
          <AdjustmentList items={s.adjustments} onChange={(adjustments) => set({ adjustments })} onEdit={setAdjustment} />
        </Section>

        <Section title={t('invoiceSettings.fileAndHours')} icon={<FileText size={18} />}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t('invoiceSettings.fileName')} hint={t('invoiceSettings.fileNameHint', { example: sampleName })}>
              {(p) => <TextInput {...p} value={s.fileNameTemplate} onChange={(e) => set({ fileNameTemplate: e.target.value })} />}
            </Field>
            <Field label={t('invoiceSettings.rounding')} hint={t('invoiceSettings.roundingHint')}>
              {(p) => (
                <Select {...p} value={s.rounding} onChange={(e) => set({ rounding: e.target.value as RoundingRule })}>
                  {ROUNDING_RULES.map((rule) => (
                    <option key={rule} value={rule}>
                      {t(`rounding.${rule}` as MessageKey)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </Section>
      </div>
    </Card>
  );
}

/** Tax and discount lines; used in Settings (defaults) and in each invoice draft. */
export function AdjustmentList({
  items,
  onChange,
  onEdit,
}: {
  items: Adjustment[];
  onChange: (items: Adjustment[]) => void;
  onEdit: (id: string, patch: Partial<Adjustment>) => void;
}) {
  const { t } = useStore();
  return (
    <div>
      {items.length > 0 && (
        <ul className="mb-2 flex flex-col gap-2">
          {items.map((a) => (
            <li key={a.id} className="grid items-end gap-2 sm:grid-cols-[1fr_9rem_9rem_7rem_auto]">
              <Field label={t('invoiceSettings.adjLabel')}>
                {(p) => <TextInput {...p} value={a.label} onChange={(e) => onEdit(a.id, { label: e.target.value })} />}
              </Field>
              <Field label={t('invoiceSettings.adjKind')}>
                {(p) => (
                  <Select {...p} value={a.kind} onChange={(e) => onEdit(a.id, { kind: e.target.value as Adjustment['kind'] })}>
                    <option value="tax">{t('invoiceSettings.tax')}</option>
                    <option value="discount">{t('invoiceSettings.discount')}</option>
                  </Select>
                )}
              </Field>
              <Field label={t('invoiceSettings.adjMode')}>
                {(p) => (
                  <Select {...p} value={a.mode} onChange={(e) => onEdit(a.id, { mode: e.target.value as Adjustment['mode'] })}>
                    <option value="percent">{t('invoiceSettings.percent')}</option>
                    <option value="fixed">{t('invoiceSettings.fixed')}</option>
                  </Select>
                )}
              </Field>
              <Field label={a.mode === 'percent' ? '%' : t('invoiceSettings.amount')}>
                {(p) => <NumberCell {...p} className="!border-line !text-left !py-2.5" value={a.value} onChange={(v) => onEdit(a.id, { value: v })} />}
              </Field>
              <IconButton label={t('common.delete')} className="mb-1" onClick={() => onChange(items.filter((x) => x.id !== a.id))}>
                <Trash2 size={16} aria-hidden="true" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <Button
        size="sm"
        onClick={() => onChange([...items, { id: newId(), label: t('invoiceSettings.tax'), kind: 'tax', mode: 'percent', value: 0 }])}
      >
        <Plus size={16} aria-hidden="true" />
        {t('invoiceSettings.addAdjustment')}
      </Button>
    </div>
  );
}
