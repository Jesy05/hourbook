import { Pause, Play, Square, Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatDuration } from '../lib/calc';
import { useStore } from '../lib/store';
import { elapsedSeconds, isTimerActive } from '../lib/timer';
import { useToast } from './Toast';
import { Button, Field, Select, TextInput } from './ui';

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function TimerCard() {
  const { t, profile, data, timer, startTimer, pauseTimer, resumeTimer, stopTimer, setTimerFields, addEntries } = useStore();
  const toast = useToast();
  const running = timer?.runningSince != null;
  const active = isTimerActive(timer);
  const now = useNow(running);
  const elapsed = timer ? elapsedSeconds(timer, now) : 0;

  useEffect(() => {
    document.title = running ? `${formatDuration(elapsed, true)} - Hourbook` : 'Hourbook';
  }, [running, elapsed]);

  if (!profile) return null;

  const categories = profile.categories;
  const category = timer?.category && categories.includes(timer.category) ? timer.category : categories[0] ?? '';
  const otherRunning = data.profiles.find((p) => p.id !== profile.id && isTimerActive(data.timers[p.id]));

  const stop = () => {
    const result = stopTimer();
    if (result.kind === 'saved') {
      toast(
        result.entries.length > 1
          ? t('timer.savedSplit', { count: result.entries.length })
          : t('timer.saved', { duration: formatDuration(result.entries[0].seconds) }),
      );
    } else if (result.kind === 'discarded') {
      const entries = result.entries;
      toast(t('timer.discarded'), {
        tone: 'info',
        action: { label: t('common.undo'), onClick: () => addEntries(entries) },
      });
    }
  };

  const status = running ? t('timer.running') : active ? t('timer.paused') : t('timer.idle');

  return (
    <section
      aria-labelledby="timer-heading"
      className={`overflow-hidden rounded-3xl border shadow-[var(--shadow-card)] transition ${
        running ? 'border-tomato bg-tomato text-white' : 'border-line bg-white text-ink'
      }`}
    >
      <div className="flex flex-col gap-6 p-5 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id="timer-heading" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide">
            <Timer size={18} aria-hidden="true" className={running ? 'text-peach' : 'text-tomato'} />
            {t('timer.title')}
            <span
              role="status"
              className={`ml-1 rounded-full px-2.5 py-0.5 text-xs font-semibold normal-case tracking-normal ${
                running ? 'bg-white/20 text-white' : active ? 'bg-peach text-ink' : 'bg-canvas text-muted'
              }`}
            >
              {status}
            </span>
          </h2>
          <p
            className="tabular text-6xl font-bold tracking-tight sm:text-7xl"
            role="timer"
            aria-label={`${t('timer.elapsed')}: ${formatDuration(elapsed, true)}`}
            aria-live="off"
          >
            {formatDuration(elapsed, true)}
          </p>
          {otherRunning && (
            <p className={`text-sm ${running ? 'text-white' : 'text-muted'}`}>
              {t('timer.otherProfile', { name: otherRunning.name })}
            </p>
          )}
        </div>

        <div className="flex w-full flex-col gap-4 lg:max-w-md">
          <div className={`grid gap-3 sm:grid-cols-[1fr_auto] ${running ? '[&_label]:text-white' : ''}`}>
            <Field label={t('timer.what')}>
              {(p) => (
                <TextInput
                  {...p}
                  value={timer?.description ?? ''}
                  placeholder={t('timer.whatPlaceholder')}
                  onChange={(e) => setTimerFields({ description: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !active) startTimer();
                  }}
                />
              )}
            </Field>
            <Field label={t('common.category')}>
              {(p) => (
                <Select {...p} value={category} onChange={(e) => setTimerFields({ category: e.target.value })}>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label={t('timer.title')}>
            {!active && (
              <Button
                variant="primary"
                size="lg"
                className="flex-1"
                onClick={() => {
                  if (!timer?.category) setTimerFields({ category });
                  startTimer();
                }}
              >
                <Play size={20} aria-hidden="true" />
                {t('timer.start')}
              </Button>
            )}
            {running && (
              <Button size="lg" className="flex-1 border-white/70 !text-white hover:!bg-white/15" onClick={pauseTimer}>
                <Pause size={20} aria-hidden="true" />
                {t('timer.pause')}
              </Button>
            )}
            {active && !running && (
              <Button variant="secondary" size="lg" className="flex-1" onClick={resumeTimer}>
                <Play size={20} aria-hidden="true" />
                {t('timer.resume')}
              </Button>
            )}
            {active && (
              <Button
                size="lg"
                className={`flex-1 ${running ? '!bg-white !text-tomato hover:!bg-peach-soft' : '!bg-tomato !text-white hover:!bg-tomato-dark'}`}
                onClick={stop}
              >
                <Square size={18} aria-hidden="true" />
                {t('timer.stop')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
