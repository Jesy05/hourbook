import { addDays, format, parseISO } from 'date-fns';
import { TriangleAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { findOverlaps, formatDuration, parseDuration, splitAtMidnight, timeToSeconds } from '../lib/calc';
import { newId } from '../lib/defaults';
import { shortTime } from '../lib/format';
import { useStore } from '../lib/store';
import type { Entry } from '../lib/types';
import { useToast } from './Toast';
import { Button, Field, Modal, Select, TextInput } from './ui';

type Mode = 'range' | 'duration';

export function EntryForm({
  open,
  entry,
  defaultDate,
  onClose,
}: {
  open: boolean;
  entry: Entry | null;
  defaultDate: string;
  onClose: () => void;
}) {
  if (!open) return null;
  return <EntryFormInner entry={entry} defaultDate={defaultDate} onClose={onClose} />;
}

function EntryFormInner({ entry, defaultDate, onClose }: { entry: Entry | null; defaultDate: string; onClose: () => void }) {
  const { t, profile, data, addEntries, replaceEntry } = useStore();
  const toast = useToast();
  const categories = profile?.categories ?? [];
  const [mode, setMode] = useState<Mode>(entry && !entry.start ? 'duration' : 'range');
  const [date, setDate] = useState(entry?.date ?? defaultDate);
  const [start, setStart] = useState(shortTime(entry?.start) || '09:00');
  const [end, setEnd] = useState(shortTime(entry?.end) || '10:00');
  const [duration, setDuration] = useState(entry ? formatDuration(entry.seconds) : '1:00');
  const [description, setDescription] = useState(entry?.description ?? '');
  const [category, setCategory] = useState(entry?.category || categories[0] || '');
  const [error, setError] = useState('');
  const [overlap, setOverlap] = useState<{ pending: Entry[]; list: string } | null>(null);

  if (!profile) return null;

  const crossesMidnight = mode === 'range' && start && end && timeToSeconds(end) < timeToSeconds(start);

  const build = (): Entry[] | null => {
    const base = {
      profileId: profile.id,
      description: description.trim(),
      category,
      createdAt: entry?.createdAt ?? Date.now(),
    };
    if (mode === 'duration') {
      const seconds = parseDuration(duration);
      if (!seconds || seconds <= 0) {
        setError(t('entries.invalidDuration'));
        return null;
      }
      return [{ ...base, id: entry?.id ?? newId(), date, seconds }];
    }
    if (!start || !end || start === end) {
      setError(t('entries.invalidRange'));
      return null;
    }
    // Keep the original seconds when the times were not touched, so paused
    // timer entries do not get their pauses counted as work.
    const untouched =
      entry?.start && entry.end && entry.date === date && shortTime(entry.start) === start && shortTime(entry.end) === end;
    if (untouched) {
      return [{ ...base, id: entry.id, date, start: entry.start, end: entry.end, seconds: entry.seconds }];
    }
    const endDate = crossesMidnight ? format(addDays(parseISO(date), 1), 'yyyy-MM-dd') : date;
    const segments = splitAtMidnight({ date, time: `${start}:00` }, { date: endDate, time: `${end}:00` });
    if (!segments.length) {
      setError(t('entries.invalidRange'));
      return null;
    }
    return segments.map((s, i) => ({
      ...base,
      id: i === 0 && entry ? entry.id : newId(),
      date: s.date,
      start: s.start,
      end: s.end,
      seconds: s.seconds,
    }));
  };

  const commit = (pending: Entry[]) => {
    if (entry) replaceEntry(entry.id, pending);
    else addEntries(pending);
    toast(t('entries.saved'));
    onClose();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const pending = build();
    if (!pending) return;
    const others = data.entries.filter((e) => e.profileId === profile.id && e.id !== entry?.id);
    const hits = pending.flatMap((p) => findOverlaps(p, others));
    if (hits.length) {
      const list = hits
        .map((h) => `${shortTime(h.start)}-${shortTime(h.end)}${h.description ? ` (${h.description})` : ''}`)
        .join(', ');
      setOverlap({ pending, list });
      return;
    }
    commit(pending);
  };

  return (
    <Modal
      open
      title={entry ? t('entries.editTitle') : t('entries.addTitle')}
      onClose={onClose}
      footer={
        overlap ? (
          <>
            <Button onClick={() => setOverlap(null)}>{t('common.back')}</Button>
            <Button variant="primary" onClick={() => commit(overlap.pending)}>
              {t('entries.saveAnyway')}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button variant="primary" type="submit" form="entry-form">
              {t('common.save')}
            </Button>
          </>
        )
      }
    >
      {overlap ? (
        <div className="flex gap-3 rounded-xl border border-peach bg-peach-soft p-4 text-sm" role="alert">
          <TriangleAlert size={20} className="shrink-0 text-tomato" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t('entries.overlapTitle')}</p>
            <p className="mt-1">{t('entries.overlapBody', { count: overlap.list.split(', ').length, list: overlap.list })}</p>
          </div>
        </div>
      ) : (
        <form id="entry-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label={t('common.date')}>
            {(p) => <TextInput {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />}
          </Field>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">{t('entries.mode')}</legend>
            <div className="inline-flex rounded-xl border border-line bg-canvas p-1">
              {(['range', 'duration'] as const).map((m) => (
                <label
                  key={m}
                  className={`flex-1 cursor-pointer rounded-lg px-3 py-1.5 text-center text-sm font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky ${
                    mode === m ? 'bg-white text-ink shadow-sm' : 'text-muted'
                  }`}
                >
                  <input
                    type="radio"
                    name="entry-mode"
                    value={m}
                    checked={mode === m}
                    onChange={() => setMode(m)}
                    className="sr-only"
                  />
                  {m === 'range' ? t('entries.modeRange') : t('entries.modeDuration')}
                </label>
              ))}
            </div>
          </fieldset>

          {mode === 'range' ? (
            <>
              <Field label={t('common.start')}>
                {(p) => <TextInput {...p} type="time" value={start} onChange={(e) => setStart(e.target.value)} required />}
              </Field>
              <Field label={t('common.end')}>
                {(p) => <TextInput {...p} type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />}
              </Field>
              {crossesMidnight && (
                <p className="text-sm text-muted sm:col-span-2" role="status">
                  {t('entries.crossesMidnight')}
                </p>
              )}
            </>
          ) : (
            <Field label={t('entries.duration')} hint={t('entries.durationHint')} className="sm:col-span-2">
              {(p) => (
                <TextInput {...p} value={duration} inputMode="decimal" onChange={(e) => setDuration(e.target.value)} required />
              )}
            </Field>
          )}

          <Field label={t('common.description')} className="sm:col-span-2">
            {(p) => <TextInput {...p} value={description} onChange={(e) => setDescription(e.target.value)} />}
          </Field>
          <Field label={t('common.category')} className="sm:col-span-2">
            {(p) => (
              <Select {...p} value={category} onChange={(e) => setCategory(e.target.value)}>
                {(categories.includes(category) || !category ? categories : [category, ...categories]).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {error && (
            <p className="text-sm font-medium text-tomato sm:col-span-2" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}
