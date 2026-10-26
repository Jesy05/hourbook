import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { formatDuration, parseDuration } from '../lib/calc';
import { CellInput } from './ui';

type BaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>;

/**
 * Number input that keeps what the person is typing ("12.", "0,5") and only
 * reports a value once it parses.
 */
export function NumberCell({
  value,
  onChange,
  className = '',
  ...props
}: BaseProps & { value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const parsed = Number(text.replace(',', '.'));
  const invalid = text.trim() !== '' && !Number.isFinite(parsed);

  return (
    <CellInput
      {...props}
      inputMode="decimal"
      value={text}
      aria-invalid={invalid || undefined}
      className={`tabular text-right ${invalid ? 'border-tomato' : ''} ${className}`}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setText(String(value));
      }}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value.replace(',', '.'));
        if (e.target.value.trim() === '') onChange(0);
        else if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

/** Duration input in h:mm (or h:mm:ss); also accepts decimal hours. */
export function DurationCell({
  seconds,
  onChange,
  withSeconds = false,
  className = '',
  ...props
}: BaseProps & { seconds: number; onChange: (seconds: number) => void; withSeconds?: boolean }) {
  const [text, setText] = useState(formatDuration(seconds, withSeconds));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(formatDuration(seconds, withSeconds));
  }, [seconds, focused, withSeconds]);

  const invalid = text.trim() !== '' && parseDuration(text) === null;

  return (
    <CellInput
      {...props}
      value={text}
      aria-invalid={invalid || undefined}
      className={`tabular text-right ${invalid ? 'border-tomato' : ''} ${className}`}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setText(formatDuration(seconds, withSeconds));
      }}
      onChange={(e) => {
        setText(e.target.value);
        const parsed = e.target.value.trim() === '' ? 0 : parseDuration(e.target.value);
        if (parsed !== null) onChange(parsed);
      }}
    />
  );
}
