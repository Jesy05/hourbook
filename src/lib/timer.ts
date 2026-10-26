import { splitAtMidnight, timeToSeconds } from './calc';
import { localDateTime } from './tz';
import type { TimerSegment, TimerState } from './types';

export const MIN_ENTRY_SECONDS = 60;

export function idleTimer(category: string): TimerState {
  return { runningSince: null, segments: [], description: '', category };
}

export function isTimerActive(timer: TimerState | undefined): boolean {
  return !!timer && (timer.runningSince !== null || timer.segments.length > 0);
}

/** Elapsed seconds, computed from stored timestamps so it survives refreshes. */
export function elapsedSeconds(timer: TimerState, now: number): number {
  const closed = timer.segments.reduce((total, s) => total + (s.end - s.start), 0);
  const running = timer.runningSince !== null ? Math.max(0, now - timer.runningSince) : 0;
  return Math.floor((closed + running) / 1000);
}

export interface PendingEntry {
  date: string;
  start: string;
  end: string;
  seconds: number;
}

/**
 * Turns timer segments into entries: each segment is split at midnight in the
 * profile zone, and the pieces that fall on the same day merge into one entry.
 */
export function segmentsToEntries(segments: TimerSegment[], timeZone: string): PendingEntry[] {
  const byDate = new Map<string, PendingEntry>();
  for (const segment of segments) {
    const pieces = splitAtMidnight(localDateTime(segment.start, timeZone), localDateTime(segment.end, timeZone));
    for (const piece of pieces) {
      const existing = byDate.get(piece.date);
      if (!existing) {
        byDate.set(piece.date, { ...piece });
        continue;
      }
      existing.seconds += piece.seconds;
      if (timeToSeconds(piece.start) < timeToSeconds(existing.start)) existing.start = piece.start;
      if (timeToSeconds(piece.end) > timeToSeconds(existing.end)) existing.end = piece.end;
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function closeTimer(timer: TimerState, now: number): TimerSegment[] {
  const segments = [...timer.segments];
  if (timer.runningSince !== null && now > timer.runningSince) {
    segments.push({ start: timer.runningSince, end: now });
  }
  return segments;
}
