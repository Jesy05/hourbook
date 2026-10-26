import { format, parseISO } from 'date-fns';
import { FilePlus2, FileSpreadsheet, FolderOpen, Receipt, Trash2, TrendingUp } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, ConfirmDialog, EmptyState, Field, IconButton, Select, TextInput } from '../components/ui';
import { generateInvoiceDraft, generateOvertimeDraft } from '../lib/drafts';
import { dateLocale, formatMonth } from '../lib/format';
import type { MessageKey } from '../lib/i18n';
import { useStore } from '../lib/store';
import { todayIn } from '../lib/tz';
import type { Draft, Language } from '../lib/types';

export function draftTitle(draft: Draft, t: (key: MessageKey) => string, language: Language): string {
  if (draft.type === 'invoice') {
    return `${t('reports.invoice')} ${draft.invoiceNumber} - ${formatMonth(draft.periodStart.slice(0, 7), language)}`;
  }
  return `${t('reports.overtime')} - ${draftPeriod(draft, language)}`;
}

export function draftPeriod(draft: Draft, language: Language): string {
  const pattern = language === 'es' ? 'd MMM yyyy' : 'MMM d, yyyy';
  const locale = dateLocale(language);
  return `${format(parseISO(draft.periodStart), pattern, { locale })} - ${format(parseISO(draft.periodEnd), pattern, { locale })}`;
}

export function Reports() {
  const { t, profile, data, language, saveDraft, deleteDraft } = useStore();
  const navigate = useNavigate();
  const today = profile ? todayIn(profile.timeZone) : format(new Date(), 'yyyy-MM-dd');
  const [type, setType] = useState<'invoice' | 'overtime'>(profile?.invoiceMode ? 'invoice' : 'overtime');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [periodMode, setPeriodMode] = useState<'ytd' | 'custom'>('ytd');
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [deleting, setDeleting] = useState<Draft | null>(null);

  if (!profile) return null;
  const types = [
    ...(profile.invoiceMode ? (['invoice'] as const) : []),
    ...(profile.overtimeMode ? (['overtime'] as const) : []),
  ];
  const activeType = types.includes(type) ? type : types[0];

  const drafts = data.drafts
    .filter((d) => d.profileId === profile.id)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const generate = (event: FormEvent) => {
    event.preventDefault();
    let draft: Draft;
    if (activeType === 'invoice') {
      if (!month) return;
      draft = generateInvoiceDraft(profile, data.entries, month, today);
    } else {
      const start = periodMode === 'ytd' ? `${today.slice(0, 4)}-01-01` : from;
      const end = periodMode === 'ytd' ? today : to;
      if (!start || !end || end < start) return;
      draft = generateOvertimeDraft(profile, data.entries, start, end);
    }
    saveDraft(draft);
    navigate(`/reports/${draft.id}`);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('reports.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('reports.intro')}</p>
      </div>

      {types.length === 0 ? (
        <EmptyState icon={<FileSpreadsheet size={28} />}>
          <span>{t('reports.noModes')}</span>
          <Link to="/settings" className="font-semibold text-tomato underline">
            {t('nav.settings')}
          </Link>
        </EmptyState>
      ) : (
        <Card title={t('reports.generate')} icon={<FilePlus2 size={20} />}>
          <form onSubmit={generate} className="flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label={t('reports.type')}>
                {(p) => (
                  <Select {...p} value={activeType} onChange={(e) => setType(e.target.value as 'invoice' | 'overtime')}>
                    {types.map((ty) => (
                      <option key={ty} value={ty}>
                        {ty === 'invoice' ? t('reports.invoice') : t('reports.overtime')}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              {activeType === 'invoice' ? (
                <Field label={t('reports.month')}>
                  {(p) => <TextInput {...p} type="month" value={month} onChange={(e) => setMonth(e.target.value)} required />}
                </Field>
              ) : (
                <Field label={t('reports.periodMode')}>
                  {(p) => (
                    <Select {...p} value={periodMode} onChange={(e) => setPeriodMode(e.target.value as 'ytd' | 'custom')}>
                      <option value="ytd">{t('reports.ytd')}</option>
                      <option value="custom">{t('reports.custom')}</option>
                    </Select>
                  )}
                </Field>
              )}
            </div>

            {activeType === 'overtime' && periodMode === 'custom' && (
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                <Field label={t('reports.from')}>
                  {(p) => <TextInput {...p} type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} required />}
                </Field>
                <Field label={t('reports.to')}>
                  {(p) => <TextInput {...p} type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} required />}
                </Field>
              </div>
            )}

            <div>
              <Button type="submit" variant="primary">
                <FilePlus2 size={18} aria-hidden="true" />
                {t('reports.generate')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card title={t('reports.drafts')} icon={<FolderOpen size={20} />}>
        {drafts.length === 0 ? (
          <EmptyState icon={<FileSpreadsheet size={24} />}>{t('reports.noDrafts')}</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line">
            {drafts.map((draft) => (
              <li key={draft.id} className="flex flex-wrap items-center gap-3 px-4 py-3 odd:bg-white even:bg-peach-soft">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    draft.type === 'invoice' ? 'bg-peach text-ink' : 'bg-sky-soft text-ink'
                  }`}
                  aria-hidden="true"
                >
                  {draft.type === 'invoice' ? <Receipt size={20} /> : <TrendingUp size={20} />}
                </span>
                <div className="min-w-0 flex-1">
                  <Link to={`/reports/${draft.id}`} className="block truncate font-semibold hover:text-tomato hover:underline">
                    {draftTitle(draft, t, language)}
                  </Link>
                  <p className="text-xs text-muted">
                    {t('reports.updated', {
                      date: format(draft.updatedAt, language === 'es' ? "d MMM yyyy, HH:mm" : 'MMM d, yyyy, h:mm a', {
                        locale: dateLocale(language),
                      }),
                    })}
                    {draft.edited && (
                      <span className="ml-2 rounded-full bg-coral px-2 py-0.5 font-semibold text-ink">{t('reports.edited')}</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" onClick={() => navigate(`/reports/${draft.id}`)}>
                    {t('reports.open')}
                  </Button>
                  <IconButton label={`${t('common.delete')}: ${draftTitle(draft, t, language)}`} onClick={() => setDeleting(draft)}>
                    <Trash2 size={16} aria-hidden="true" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={!!deleting}
        title={t('reports.deleteTitle')}
        body={t('reports.deleteBody')}
        confirmLabel={t('common.delete')}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) deleteDraft(deleting.id);
          setDeleting(null);
        }}
      />
    </div>
  );
}
