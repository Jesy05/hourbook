import { addDays, format, parseISO } from 'date-fns';
import { CalendarMinus, CalendarRange, Calculator, Plus, SlidersHorizontal, Table2, Trash2 } from 'lucide-react';
import { formatDuration, secondsToDecimalHours, SECONDS_PER_HOUR, sumSeconds, weeklyOvertimeSeconds } from '../lib/calc';
import { newId } from '../lib/defaults';
import { overtimeDraftSummary } from '../lib/drafts';
import { formatMonth, formatNumber, formatShortDate } from '../lib/format';
import { useStore } from '../lib/store';
import type { MonthBlock, OvertimeDraft, OvertimeWeekRow, RedeemedEntry } from '../lib/types';
import { DurationCell, NumberCell } from './cells';
import { RedeemedTable } from './RedeemedPanel';
import { Button, Card, CellInput, EmptyState, Field, IconButton, StatCard } from './ui';

const th = 'px-2 py-2 text-left text-sm font-semibold';

export function OvertimeEditor({
  draft,
  onChange,
  redeemed,
}: {
  draft: OvertimeDraft;
  onChange: (draft: OvertimeDraft) => void;
  redeemed: RedeemedEntry[];
}) {
  const { t, language } = useStore();
  const summary = overtimeDraftSummary(draft, redeemed);
  const set = <K extends keyof OvertimeDraft>(key: K, value: OvertimeDraft[K]) => onChange({ ...draft, [key]: value });
  const setWeek = (id: string, patch: Partial<OvertimeWeekRow>) =>
    set('weeks', draft.weeks.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  const setMonth = (id: string, fn: (m: MonthBlock) => MonthBlock) =>
    set('months', draft.months.map((m) => (m.id === id ? fn(m) : m)));

  const otSeconds = (w: OvertimeWeekRow) => weeklyOvertimeSeconds(w.workedSeconds, draft.standardHours);
  const totalWorked = sumSeconds(draft.weeks.map((w) => ({ seconds: w.workedSeconds })));
  const totalOt = draft.weeks.reduce((s, w) => s + otSeconds(w), 0);
  const num = (n: number) => formatNumber(n, language);

  return (
    <div className="flex flex-col gap-6">
      <section aria-label={t('ot.summary')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('ot.overtime')} value={num(summary.overtime)} sub="h" icon={<Calculator size={14} />} />
        <StatCard label={t('ot.redeemed')} value={num(summary.redeemed)} sub="h" tone="peach" icon={<CalendarMinus size={14} />} />
        <StatCard label={t('ot.balance')} value={num(summary.balance)} sub="h" tone="sky" />
        <StatCard label={t('ot.days')} value={num(summary.days)} tone="sky" />
      </section>

      <Card title={t('ot.settings')} icon={<SlidersHorizontal size={20} />}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('profile.standardHours')}>
            {(p) => (
              <NumberCell {...p} className="!border-line !text-left" value={draft.standardHours} onChange={(v) => set('standardHours', v)} />
            )}
          </Field>
          <Field label={t('profile.hoursPerDay')}>
            {(p) => (
              <NumberCell {...p} className="!border-line !text-left" value={draft.hoursPerDay} onChange={(v) => set('hoursPerDay', v)} />
            )}
          </Field>
          <Field label={t('profile.openingBalance')}>
            {(p) => (
              <NumberCell {...p} className="!border-line !text-left" value={draft.openingBalance} onChange={(v) => set('openingBalance', v)} />
            )}
          </Field>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Card
          title={t('ot.weekly')}
          icon={<Table2 size={20} />}
          actions={
            <Button
              size="sm"
              onClick={() => {
                const last = draft.weeks.at(-1)?.weekStart;
                const weekStart = last ? format(addDays(parseISO(last), 7), 'yyyy-MM-dd') : draft.periodStart;
                set('weeks', [...draft.weeks, { id: newId(), weekStart, workedSeconds: 0 }]);
              }}
            >
              <Plus size={16} aria-hidden="true" />
              {t('reports.addRow')}
            </Button>
          }
        >
          <div className="max-h-[36rem] overflow-auto rounded-xl border border-line">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="sticky top-0 z-10 bg-coral text-ink">
                <tr>
                  <th scope="col" className={`${th} w-40`}>{t('ot.weekDate')}</th>
                  <th scope="col" className={`${th} text-right`}>
                    {t('ot.worked')} <span className="font-normal">(h:mm)</span>
                  </th>
                  <th scope="col" className={`${th} text-right`}>{t('ot.register')}</th>
                  <th scope="col" className={`${th} text-right`}>{t('ot.otHours')}</th>
                  <th scope="col" className="w-12"><span className="sr-only">{t('common.actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {draft.weeks.map((week, i) => (
                  <tr key={week.id} className="border-t border-line odd:bg-white even:bg-peach-soft">
                    <td className="px-1 py-1">
                      <CellInput
                        type="date"
                        aria-label={`${t('ot.weekDate')} ${i + 1}`}
                        value={week.weekStart}
                        onChange={(e) => e.target.value && setWeek(week.id, { weekStart: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <DurationCell
                        aria-label={`${t('ot.worked')} ${formatShortDate(week.weekStart)}`}
                        seconds={week.workedSeconds}
                        onChange={(s) => setWeek(week.id, { workedSeconds: s })}
                      />
                    </td>
                    <td className="tabular px-3 py-1 text-right">{formatDuration(otSeconds(week))}</td>
                    <td className="tabular px-3 py-1 text-right font-medium">{num(secondsToDecimalHours(otSeconds(week)))}</td>
                    <td className="px-1 py-1 text-right">
                      <IconButton
                        label={`${t('reports.removeRow')} ${formatShortDate(week.weekStart)}`}
                        onClick={() => set('weeks', draft.weeks.filter((w) => w.id !== week.id))}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0">
                <tr className="border-t border-line bg-sky font-semibold text-ink">
                  <td className="px-3 py-2">{t('common.total')}</td>
                  <td className="tabular px-3 py-2 text-right">{formatDuration(totalWorked)}</td>
                  <td className="tabular px-3 py-2 text-right">{formatDuration(totalOt)}</td>
                  <td className="tabular px-3 py-2 text-right">{num(totalOt / SECONDS_PER_HOUR)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        <Card title={t('ot.redeemedLog')} icon={<CalendarMinus size={20} />}>
          <p className="mb-3 text-sm text-muted">{t('ot.redeemedLogHint')}</p>
          <RedeemedTable items={redeemed} />
        </Card>
      </div>

      <Card title={t('ot.monthly')} icon={<CalendarRange size={20} />}>
        <p className="mb-4 text-sm text-muted">{t('ot.monthlyHint')}</p>
        {draft.months.length === 0 ? (
          <EmptyState icon={<CalendarRange size={24} />}>{t('ot.noMonths')}</EmptyState>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {draft.months.map((month) => (
              <div key={month.id} className="w-56 shrink-0 overflow-hidden rounded-xl border border-line">
                <h3 className="bg-coral px-3 py-2 text-sm font-semibold text-ink">{formatMonth(month.month, language)}</h3>
                <ul>
                  {month.rows.map((row, i) => (
                    <li key={row.id} className="flex items-center gap-1 border-t border-line px-2 py-1 odd:bg-white even:bg-peach-soft">
                      <span className="w-14 shrink-0 text-xs text-muted">{formatShortDate(row.weekStart)}</span>
                      <DurationCell
                        withSeconds
                        aria-label={`${formatMonth(month.month, language)} ${formatShortDate(row.weekStart)}`}
                        seconds={row.seconds}
                        onChange={(s) =>
                          setMonth(month.id, (m) => ({ ...m, rows: m.rows.map((r) => (r.id === row.id ? { ...r, seconds: s } : r)) }))
                        }
                      />
                      <IconButton
                        label={`${t('reports.removeRow')} ${i + 1}`}
                        className="h-8 w-8 shrink-0"
                        onClick={() => setMonth(month.id, (m) => ({ ...m, rows: m.rows.filter((r) => r.id !== row.id) }))}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </IconButton>
                    </li>
                  ))}
                </ul>
                <p className="tabular flex justify-between bg-sky px-3 py-2 text-sm font-semibold text-ink">
                  <span>{t('common.total')}</span>
                  <span>{formatDuration(sumSeconds(month.rows), true)}</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
