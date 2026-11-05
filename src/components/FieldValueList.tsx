import { ArrowDown, ArrowUp, Check, Pencil, Pin, PinOff, Plus, Trash2, X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import {
  cleanValue,
  countUses,
  findValue,
  movePinned,
  pinnedValues,
  removeProfileValue,
  suggestions,
  togglePinned,
  valueKey,
  type ListField,
} from '../lib/fieldValues';
import { useStore } from '../lib/store';
import { useToast } from './Toast';
import { Button, ConfirmDialog, IconButton, TextInput } from './ui';

/**
 * Settings for one saved list (Requested by or Project): add, rename (updates
 * entries after a confirmation), remove from suggestions, pin and reorder pins.
 */
export function FieldValueList({ field, title }: { field: ListField; title: string }) {
  const { t, profile, data, saveProfile, renameFieldValue, addFieldValue } = useStore();
  const toast = useToast();
  const headingId = useId();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ value: string; text: string } | null>(null);
  const [confirm, setConfirm] = useState<{ from: string; to: string; count: number; merge: boolean } | null>(null);
  const values = useMemo(() => (profile ? suggestions(profile, data.entries, field) : []), [profile, data.entries, field]);
  if (!profile) return null;

  const pinned = pinnedValues(profile, field);
  const uses = (v: string) => countUses(data.entries, profile.id, field, v);

  const rename = (from: string, to: string) => {
    renameFieldValue(field, from, to);
    setEditing(null);
    setConfirm(null);
    toast(t('fieldList.renamed', { from, to: cleanValue(to) }));
  };

  const askRename = () => {
    if (!editing) return;
    const to = cleanValue(editing.text);
    if (!to || to === editing.value) {
      setEditing(null);
      return;
    }
    const count = uses(editing.value);
    const other = findValue(profile[field === 'requestedBy' ? 'requesters' : 'projects'], to);
    const merge = !!other && valueKey(other) !== valueKey(editing.value);
    if (count === 0 && !merge) rename(editing.value, to);
    else setConfirm({ from: editing.value, to: merge && other ? other : to, count, merge });
  };

  const remove = (value: string) => {
    const before = profile;
    saveProfile(removeProfileValue(profile, field, value));
    // Undo puts back the list and pins exactly as they were.
    toast(t('fieldList.removed', { value }), { action: { label: t('common.undo'), onClick: () => saveProfile(before) } });
  };

  return (
    <section className="mt-5" aria-labelledby={headingId}>
      <h3 id={headingId} className="mb-1 text-sm font-semibold">
        {title}
      </h3>
      <p className="mb-2 text-xs text-muted">{t('fieldList.hint')}</p>
      {values.length === 0 ? (
        <p className="mb-2 text-sm text-muted">{t('entryFields.emptyList')}</p>
      ) : (
        <ul className="mb-3 flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line">
          {values.map((value) => {
            const pinIndex = pinned.findIndex((p) => valueKey(p) === valueKey(value));
            const count = uses(value);
            return (
              <li key={value} className="flex flex-wrap items-center gap-2 px-3 py-2 odd:bg-surface even:bg-peach-soft">
                {editing?.value === value ? (
                  <form
                    className="flex min-w-0 flex-1 gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      askRename();
                    }}
                  >
                    <TextInput
                      autoFocus
                      aria-label={t('fieldList.renameLabel', { value })}
                      value={editing.text}
                      onChange={(e) => setEditing({ value, text: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditing(null);
                      }}
                    />
                    <IconButton type="submit" label={t('common.save')}>
                      <Check size={16} aria-hidden="true" />
                    </IconButton>
                    <IconButton label={t('common.cancel')} onClick={() => setEditing(null)}>
                      <X size={16} aria-hidden="true" />
                    </IconButton>
                  </form>
                ) : (
                  <>
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      {pinIndex >= 0 && <Pin size={14} className="shrink-0 text-brand" aria-label={t('combo.pinned')} />}
                      <span className="min-w-0 break-words font-medium">{value}</span>
                      <span className="shrink-0 text-xs text-muted">{count === 1 ? t('fieldList.usesOne') : t('fieldList.uses', { count })}</span>
                    </span>
                    <span className="flex items-center">
                      {pinIndex >= 0 && (
                        <>
                          <IconButton
                            label={t('fieldList.moveUp', { value })}
                            disabled={pinIndex === 0}
                            className="disabled:opacity-30"
                            onClick={() => saveProfile(movePinned(profile, field, value, -1))}
                          >
                            <ArrowUp size={16} aria-hidden="true" />
                          </IconButton>
                          <IconButton
                            label={t('fieldList.moveDown', { value })}
                            disabled={pinIndex === pinned.length - 1}
                            className="disabled:opacity-30"
                            onClick={() => saveProfile(movePinned(profile, field, value, 1))}
                          >
                            <ArrowDown size={16} aria-hidden="true" />
                          </IconButton>
                        </>
                      )}
                      <IconButton
                        label={t(pinIndex >= 0 ? 'fieldList.unpin' : 'fieldList.pin', { value })}
                        aria-pressed={pinIndex >= 0}
                        onClick={() => saveProfile(togglePinned(profile, field, value))}
                      >
                        {pinIndex >= 0 ? <PinOff size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />}
                      </IconButton>
                      <IconButton label={t('fieldList.rename', { value })} onClick={() => setEditing({ value, text: value })}>
                        <Pencil size={16} aria-hidden="true" />
                      </IconButton>
                      <IconButton label={t('fieldList.remove', { value })} onClick={() => remove(value)}>
                        <Trash2 size={16} aria-hidden="true" />
                      </IconButton>
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (cleanValue(draft)) addFieldValue(field, draft);
          setDraft('');
        }}
      >
        <TextInput aria-label={t('fieldList.addLabel', { list: title })} placeholder={t('fields.newPlaceholder')} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <Button type="submit" size="sm">
          <Plus size={16} aria-hidden="true" />
          {t('common.add')}
        </Button>
      </form>

      <ConfirmDialog
        open={!!confirm}
        danger={false}
        title={t('fieldList.confirmTitle')}
        body={
          confirm
            ? t(confirm.merge ? 'fieldList.confirmMerge' : 'fieldList.confirmBody', { from: confirm.from, to: confirm.to, count: confirm.count })
            : ''
        }
        confirmLabel={t('fieldList.confirmAction')}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && rename(confirm.from, confirm.to)}
      />
    </section>
  );
}
