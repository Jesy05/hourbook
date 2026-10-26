import { CalendarMinus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { newId } from '../lib/defaults';
import { formatNumber, formatRedeemedDate } from '../lib/format';
import { useStore } from '../lib/store';
import { todayIn } from '../lib/tz';
import type { RedeemedEntry } from '../lib/types';
import { Button, Card, ConfirmDialog, EmptyState, Field, IconButton, Modal, TextInput } from './ui';

export function useRedeemed(): RedeemedEntry[] {
  const { data, profile } = useStore();
  return data.redeemed
    .filter((r) => r.profileId === profile?.id)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function RedeemedForm({ item, onClose }: { item: RedeemedEntry | null; onClose: () => void }) {
  const { t, profile, saveRedeemed } = useStore();
  const [date, setDate] = useState(item?.date ?? (profile ? todayIn(profile.timeZone) : ''));
  const [endDate, setEndDate] = useState(item?.endDate ?? '');
  const [hours, setHours] = useState(item ? String(item.hours) : '');
  const [note, setNote] = useState(item?.note ?? '');
  const [error, setError] = useState('');

  if (!profile) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(hours.replace(',', '.'));
    if (!date || !Number.isFinite(value) || value <= 0) {
      setError(t('redeemed.invalid'));
      return;
    }
    const end = endDate && endDate > date ? endDate : undefined;
    saveRedeemed({ id: item?.id ?? newId(), profileId: profile.id, date, endDate: end, hours: value, note: note.trim() });
    onClose();
  };

  return (
    <Modal
      open
      title={t('redeemed.title')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" type="submit" form="redeemed-form">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="redeemed-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label={t('redeemed.date')}>
          {(p) => <TextInput {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />}
        </Field>
        <Field label={t('redeemed.endDate')}>
          {(p) => <TextInput {...p} type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />}
        </Field>
        <Field label={t('redeemed.hours')}>
          {(p) => (
            <TextInput
              {...p}
              type="number"
              min={0}
              step="0.25"
              inputMode="decimal"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              required
            />
          )}
        </Field>
        <Field label={`${t('common.note')} (${t('common.optional')})`}>
          {(p) => <TextInput {...p} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        {error && (
          <p className="text-sm font-medium text-brand sm:col-span-2" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

/** Table of redeemed time with add, edit and delete. Shared by the tracker and the OT editor. */
export function RedeemedTable({ items, compact = false }: { items: RedeemedEntry[]; compact?: boolean }) {
  const { t, language, deleteRedeemed } = useStore();
  const [editing, setEditing] = useState<RedeemedEntry | null | 'new'>(null);
  const [deleting, setDeleting] = useState<RedeemedEntry | null>(null);
  const total = items.reduce((sum, r) => sum + r.hours, 0);

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? (
        <EmptyState icon={<CalendarMinus size={24} />}>{t('redeemed.empty')}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-coral text-left text-ink">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">{t('redeemed.date')}</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">{t('redeemed.hours')}</th>
                {!compact && <th scope="col" className="px-3 py-2 font-semibold">{t('common.note')}</th>}
                <th scope="col" className="px-3 py-2 text-right font-semibold"><span className="sr-only">{t('common.actions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-t border-line odd:bg-surface even:bg-peach-soft">
                  <td className="px-3 py-2 whitespace-nowrap">{formatRedeemedDate(r.date, r.endDate)}</td>
                  <td className="tabular px-3 py-2 text-right">{formatNumber(r.hours, language)}</td>
                  {!compact && <td className="px-3 py-2 text-muted">{r.note}</td>}
                  <td className="px-1 py-1 text-right whitespace-nowrap">
                    <IconButton label={t('common.edit')} onClick={() => setEditing(r)}>
                      <Pencil size={16} aria-hidden="true" />
                    </IconButton>
                    <IconButton label={t('common.delete')} onClick={() => setDeleting(r)}>
                      <Trash2 size={16} aria-hidden="true" />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-sky font-semibold text-ink">
                <td className="px-3 py-2">{t('common.total')}</td>
                <td className="tabular px-3 py-2 text-right">{formatNumber(total, language)}</td>
                <td colSpan={compact ? 1 : 2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus size={16} aria-hidden="true" />
          {t('redeemed.add')}
        </Button>
      </div>
      {editing && <RedeemedForm item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        title={t('redeemed.deleteTitle')}
        body={t('redeemed.deleteBody', { hours: deleting ? formatNumber(deleting.hours, language) : '' })}
        confirmLabel={t('common.delete')}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) deleteRedeemed(deleting.id);
          setDeleting(null);
        }}
      />
    </div>
  );
}

export function RedeemedPanel() {
  const { t } = useStore();
  const items = useRedeemed();
  return (
    <Card title={t('redeemed.title')} icon={<CalendarMinus size={20} />}>
      <p className="mb-3 text-sm text-muted">{t('redeemed.hint')}</p>
      <RedeemedTable items={items} compact />
    </Card>
  );
}
