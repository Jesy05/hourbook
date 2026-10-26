import { addDays, format, parseISO } from 'date-fns';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ListChecks,
  Pencil,
  Plus,
  Receipt,
  Scale,
  Trash2,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { EntryForm } from '../components/EntryForm';
import { RedeemedPanel, useRedeemed } from '../components/RedeemedPanel';
import { TimerCard } from '../components/TimerCard';
import { useToast } from '../components/Toast';
import { Button, Card, ConfirmDialog, EmptyState, Field, IconButton, StatCard, TextInput } from '../components/ui';
import {
  formatDuration,
  groupByWeek,
  lineAmount,
  overtimeSummary,
  secondsToDecimalHours,
  SECONDS_PER_HOUR,
  sumSeconds,
  weekStartOf,
  weeklyOvertimeSeconds,
} from '../lib/calc';
import { formatDay, formatMoney, formatNumber, shortTime } from '../lib/format';
import { useStore } from '../lib/store';
import { todayIn } from '../lib/tz';
import type { Entry } from '../lib/types';

export function Tracker() {
  const { t, profile, data, language, deleteEntry, addEntries } = useStore();
  const toast = useToast();
  const redeemed = useRedeemed();
  const today = profile ? todayIn(profile.timeZone) : format(new Date(), 'yyyy-MM-dd');
  const [day, setDay] = useState(today);
  const [weekOffset, setWeekOffset] = useState(0);
  const [editing, setEditing] = useState<Entry | null | 'new'>(null);
  const [deleting, setDeleting] = useState<Entry | null>(null);

  const entries = useMemo(
    () => data.entries.filter((e) => e.profileId === profile?.id),
    [data.entries, profile?.id],
  );

  if (!profile) return null;
  const weekStartsOn = profile.overtime.weekStartsOn;
  const thisWeek = weekStartOf(today, weekStartsOn);
  const month = today.slice(0, 7);

  const todaySec = sumSeconds(entries.filter((e) => e.date === today));
  const weekSec = sumSeconds(entries.filter((e) => weekStartOf(e.date, weekStartsOn) === thisWeek));
  const monthEntries = entries.filter((e) => e.date.startsWith(month));
  const monthSec = sumSeconds(monthEntries);

  const weekOtSec = weeklyOvertimeSeconds(weekSec, profile.overtime.standardHours);
  const balance = overtimeSummary({
    weeklyOtHours: groupByWeek(entries, weekStartsOn).map(
      (w) => weeklyOvertimeSeconds(w.seconds, profile.overtime.standardHours) / SECONDS_PER_HOUR,
    ),
    openingBalance: profile.overtime.openingBalance,
    redeemedHours: redeemed.map((r) => r.hours),
    hoursPerDay: profile.overtime.hoursPerDay,
  });
  const monthHours = secondsToDecimalHours(monthSec);

  const dayEntries = entries
    .filter((e) => e.date === day)
    .sort((a, b) => (a.start ?? '99').localeCompare(b.start ?? '99') || a.createdAt - b.createdAt);

  const shownWeek = format(addDays(parseISO(thisWeek), weekOffset * 7), 'yyyy-MM-dd');
  const weekDays = Array.from({ length: 7 }, (_, i) => format(addDays(parseISO(shownWeek), i), 'yyyy-MM-dd'));
  const perDay = weekDays.map((d) => ({ date: d, seconds: sumSeconds(entries.filter((e) => e.date === d)) }));
  const shownWeekTotal = sumSeconds(perDay);
  const barMax = Math.max(8 * SECONDS_PER_HOUR, ...perDay.map((d) => d.seconds));

  return (
    <div className="flex flex-col gap-6">
      <TimerCard />

      <section aria-label={t('summary.today')} className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label={t('summary.today')} value={formatDuration(todaySec)} icon={<Clock3 size={14} />} />
        <StatCard label={t('summary.week')} value={formatDuration(weekSec)} icon={<CalendarDays size={14} />} />
        <StatCard label={t('summary.month')} value={formatDuration(monthSec)} icon={<CalendarDays size={14} />} />
        {profile.overtimeMode && (
          <>
            <StatCard
              tone="peach"
              label={t('summary.weekOvertime')}
              value={formatDuration(weekOtSec)}
              sub={`${formatNumber(secondsToDecimalHours(weekOtSec), language)} h`}
              icon={<TrendingUp size={14} />}
            />
            <StatCard
              tone="sky"
              label={t('summary.balance')}
              value={`${formatNumber(balance.balance, language)} h`}
              sub={t('summary.balanceDays', { days: formatNumber(balance.days, language) })}
              icon={<Scale size={14} />}
            />
          </>
        )}
        {profile.invoiceMode && (
          <>
            <StatCard
              tone="peach"
              label={t('summary.monthHours')}
              value={`${formatNumber(monthHours, language)} h`}
              icon={<Receipt size={14} />}
            />
            <StatCard
              tone="sky"
              label={t('summary.accrued')}
              value={formatMoney(lineAmount(monthHours, profile.invoice.rate), profile.invoice.currency, language)}
              icon={<Wallet size={14} />}
            />
          </>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card
          title={day === today ? t('entries.today') : formatDay(day, language)}
          icon={<ListChecks size={20} />}
          actions={
            <Button variant="secondary" size="sm" onClick={() => setEditing('new')}>
              <Plus size={16} aria-hidden="true" />
              {t('entries.addManual')}
            </Button>
          }
        >
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <IconButton label={formatDay(format(addDays(parseISO(day), -1), 'yyyy-MM-dd'), language)} onClick={() => setDay(format(addDays(parseISO(day), -1), 'yyyy-MM-dd'))}>
              <ChevronLeft size={18} aria-hidden="true" />
            </IconButton>
            <Field label={t('entries.recent')} className="w-44">
              {(p) => <TextInput {...p} type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} />}
            </Field>
            <IconButton
              label={formatDay(format(addDays(parseISO(day), 1), 'yyyy-MM-dd'), language)}
              onClick={() => setDay(format(addDays(parseISO(day), 1), 'yyyy-MM-dd'))}
              disabled={day >= today}
              className="disabled:opacity-40"
            >
              <ChevronRight size={18} aria-hidden="true" />
            </IconButton>
            {day !== today && (
              <Button size="sm" onClick={() => setDay(today)}>
                {t('summary.today')}
              </Button>
            )}
          </div>

          {dayEntries.length === 0 ? (
            <EmptyState icon={<Clock3 size={24} />}>{t('entries.empty')}</EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line">
              {dayEntries.map((entry) => {
                const desc = entry.description || t('common.none');
                return (
                  <li key={entry.id} className="flex items-center gap-3 px-3 py-3 odd:bg-white even:bg-peach-soft sm:px-4">
                    <div className="min-w-0 flex-1">
                      <p
                        title={entry.description || undefined}
                        className={`line-clamp-2 break-words font-medium ${entry.description ? '' : 'italic text-muted'}`}
                      >
                        {desc}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <span className="rounded-full bg-sky-soft px-2 py-0.5 font-medium text-ink">{entry.category}</span>
                        <span className="tabular">
                          {entry.start ? `${shortTime(entry.start)} - ${shortTime(entry.end)}` : t('entries.durationOnly')}
                        </span>
                      </p>
                    </div>
                    <span className="tabular text-base font-semibold">{formatDuration(entry.seconds)}</span>
                    <div className="flex">
                      <IconButton label={t('entries.editLabel', { desc })} onClick={() => setEditing(entry)}>
                        <Pencil size={16} aria-hidden="true" />
                      </IconButton>
                      <IconButton label={t('entries.deleteLabel', { desc })} onClick={() => setDeleting(entry)}>
                        <Trash2 size={16} aria-hidden="true" />
                      </IconButton>
                    </div>
                  </li>
                );
              })}
              <li className="flex items-center justify-between bg-sky px-3 py-2.5 font-semibold text-ink sm:px-4">
                <span>{t('common.total')}</span>
                <span className="tabular">{formatDuration(sumSeconds(dayEntries))}</span>
              </li>
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card
            title={t('week.title')}
            icon={<CalendarDays size={20} />}
            actions={
              <div className="flex items-center gap-1">
                <IconButton label={t('week.prev')} onClick={() => setWeekOffset((w) => w - 1)}>
                  <ChevronLeft size={18} aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={t('week.next')}
                  onClick={() => setWeekOffset((w) => w + 1)}
                  disabled={weekOffset >= 0}
                  className="disabled:opacity-40"
                >
                  <ChevronRight size={18} aria-hidden="true" />
                </IconButton>
              </div>
            }
          >
            <ul className="flex flex-col gap-2">
              {perDay.map((d) => (
                <li key={d.date}>
                  <button
                    type="button"
                    onClick={() => setDay(d.date)}
                    className={`grid w-full grid-cols-[5.5rem_1fr_3.5rem] items-center gap-3 rounded-lg px-2 py-1 text-left text-sm hover:bg-peach-soft ${
                      d.date === day ? 'bg-peach-soft' : ''
                    }`}
                    aria-label={`${formatDay(d.date, language)}: ${formatDuration(d.seconds)}`}
                  >
                    <span className={`truncate ${d.date === today ? 'font-semibold text-tomato' : 'text-muted'}`}>
                      {formatDay(d.date, language)}
                    </span>
                    <span className="h-3 overflow-hidden rounded-full bg-canvas" aria-hidden="true">
                      <span
                        className="block h-full rounded-full bg-coral"
                        style={{ width: `${Math.min(100, (d.seconds / barMax) * 100)}%` }}
                      />
                    </span>
                    <span className="tabular text-right font-medium">{formatDuration(d.seconds)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap justify-between gap-2 rounded-xl bg-sky px-3 py-2.5 text-sm font-semibold text-ink">
              <span>
                {t('week.total')}: <span className="tabular">{formatDuration(shownWeekTotal)}</span>
              </span>
              {profile.overtimeMode && (
                <span>
                  {t('week.overtime')}:{' '}
                  <span className="tabular">
                    {formatDuration(weeklyOvertimeSeconds(shownWeekTotal, profile.overtime.standardHours))}
                  </span>
                </span>
              )}
            </div>
          </Card>

          {profile.overtimeMode && <RedeemedPanel />}
        </div>
      </div>

      <EntryForm
        open={editing !== null}
        entry={editing === 'new' ? null : editing}
        defaultDate={day}
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog
        open={!!deleting}
        title={t('entries.deleteTitle')}
        body={t('entries.deleteBody', { duration: deleting ? formatDuration(deleting.seconds) : '' })}
        confirmLabel={t('common.delete')}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            const removed = deleting;
            deleteEntry(removed.id);
            toast(t('entries.deleted'), { action: { label: t('common.undo'), onClick: () => addEntries([removed]) } });
          }
          setDeleting(null);
        }}
      />
    </div>
  );
}
