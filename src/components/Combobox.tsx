import { Check, ChevronDown, Pin, Plus, X } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { cleanValue, findValue, suggestions, valueKey, type ListField } from '../lib/fieldValues';
import { useStore } from '../lib/store';

type Item = { kind: 'option'; value: string } | { kind: 'add'; value: string };

/**
 * Text box with a filtered list of saved values (ARIA 1.2 combobox pattern).
 * Typing filters; arrows move, Enter picks, Escape closes. A value that is not
 * saved yet shows as "Add '...'". The list is drawn in a portal so it is not
 * clipped by scrolling tables.
 */
export function Combobox({
  id,
  value,
  options,
  pinned = [],
  onChange,
  onAdd,
  label,
  describedBy,
  compact = false,
  placeholder,
}: {
  id?: string;
  value: string;
  /** Saved values, already in display order. */
  options: string[];
  pinned?: string[];
  onChange: (value: string) => void;
  /** Saves a new value to the list and returns its saved spelling. */
  onAdd?: (value: string) => string;
  /** Accessible name; also used for the clear button. */
  label: string;
  describedBy?: string;
  compact?: boolean;
  placeholder?: string;
}) {
  const { t } = useStore();
  const autoId = useId();
  const inputId = id ?? `${autoId}-input`;
  const listId = `${autoId}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [dirty, setDirty] = useState(false);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState<CSSProperties>({});

  // Follow outside changes (another row, a rename) while the user is not typing.
  useEffect(() => {
    if (!dirty) setQuery(value);
  }, [value, dirty]);

  const clean = cleanValue(query);
  const exact = findValue(options, query);
  const items = useMemo<Item[]>(() => {
    const filter = dirty ? valueKey(query) : '';
    const list: Item[] = options.filter((o) => !filter || valueKey(o).includes(filter)).map((o) => ({ kind: 'option', value: o }));
    if (dirty && clean && !exact && onAdd) list.push({ kind: 'add', value: clean });
    return list;
  }, [options, query, dirty, clean, exact, onAdd]);

  const place = () => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom;
    const up = below < 240 && rect.top > below;
    setPosition({
      position: 'fixed',
      left: rect.left,
      width: Math.max(rect.width, 220),
      ...(up ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      maxHeight: Math.max(120, Math.min(280, (up ? rect.top : below) - 12)),
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  // Keep the highlighted option in view by scrolling the list only, never the page.
  useEffect(() => {
    const list = listRef.current;
    const option = open && active >= 0 ? (document.getElementById(`${listId}-${active}`) as HTMLElement | null) : null;
    if (!list || !option) return;
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
  }, [open, active, listId, position]);

  const commit = (next: string) => {
    setDirty(false);
    setOpen(false);
    setActive(-1);
    setQuery(next);
    if (next !== value) onChange(next);
  };

  const choose = (item: Item) => commit(item.kind === 'add' && onAdd ? onAdd(item.value) : item.value);

  /** Leaving the box keeps what was typed, with the saved spelling when it matches. */
  const settle = () => {
    if (dirty) commit(exact ?? clean);
    else setOpen(false);
  };

  const openList = () => {
    setOpen(true);
    setActive(Math.max(0, options.findIndex((o) => o === value)));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) openList();
        else setActive((i) => Math.min(items.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) openList();
        else setActive((i) => Math.max(0, i - 1));
        break;
      case 'Home':
      case 'End':
        if (open && items.length) {
          e.preventDefault();
          setActive(e.key === 'Home' ? 0 : items.length - 1);
        }
        break;
      case 'Enter':
        if (open && active >= 0 && items[active]) {
          e.preventDefault();
          choose(items[active]);
        } else if (dirty) {
          e.preventDefault();
          if (exact) commit(exact);
          else if (clean && onAdd) commit(onAdd(clean));
          else commit(clean);
        }
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          e.stopPropagation(); // do not close a dialog around the box
          setOpen(false);
        } else if (dirty) {
          e.preventDefault();
          setDirty(false);
          setQuery(value);
        }
        break;
      case 'Tab':
        settle();
        break;
    }
  };

  const box = compact
    ? 'border-transparent bg-transparent hover:border-line focus-within:border-sky focus-within:bg-surface'
    : 'border-line bg-surface';
  const activeId = open && active >= 0 && items[active] ? `${listId}-${active}` : undefined;

  return (
    <div
      ref={wrapRef}
      className={`flex w-full min-w-0 items-center rounded-xl border ${box} focus-within:ring-2 focus-within:ring-sky/40 ${compact ? 'rounded-lg' : ''}`}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-label={id ? undefined : label}
        aria-describedby={describedBy}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        autoComplete="off"
        spellCheck={false}
        value={query}
        placeholder={placeholder ?? t('combo.placeholder')}
        onChange={(e) => {
          setQuery(e.target.value);
          setDirty(true);
          setOpen(true);
          setActive(e.target.value.trim() ? 0 : -1);
        }}
        onClick={() => (open ? undefined : openList())}
        onKeyDown={onKeyDown}
        onBlur={settle}
        className={`w-full min-w-0 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none ${compact ? 'px-2 py-1.5' : 'px-3 py-2.5'}`}
      />
      {query && (
        <button
          type="button"
          aria-label={t('combo.clear', { name: label })}
          title={t('combo.clear', { name: label })}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            commit('');
            inputRef.current?.focus();
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-peach-soft hover:text-ink"
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        tabIndex={-1}
        aria-label={t('combo.show', { name: label })}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          inputRef.current?.focus();
          if (open) setOpen(false);
          else openList();
        }}
        className={`mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:text-ink ${compact ? 'hidden sm:flex' : ''}`}
      >
        <ChevronDown size={16} aria-hidden="true" className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {createPortal(
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          hidden={!open}
          style={position}
          onMouseDown={(e) => e.preventDefault()}
          className="z-[60] overflow-y-auto rounded-xl border border-line bg-surface p-1 text-sm text-ink shadow-lg"
        >
          {items.length === 0 && (
            <li role="presentation" className="px-3 py-2 text-muted">
              {options.length ? t('combo.noMatch') : t('combo.empty')}
            </li>
          )}
          {items.map((item, i) => {
            const selected = item.kind === 'option' && item.value === value;
            const isPinned = item.kind === 'option' && pinned.some((p) => valueKey(p) === valueKey(item.value));
            return (
              <li
                key={`${item.kind}-${item.value}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(item)}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 ${i === active ? 'bg-peach-soft' : ''} ${
                  item.kind === 'add' ? 'border-t border-line font-semibold' : ''
                }`}
              >
                {item.kind === 'add' ? (
                  <>
                    <Plus size={14} className="shrink-0 text-brand" aria-hidden="true" />
                    <span className="min-w-0 break-words">{t('combo.add', { value: item.value })}</span>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 break-words">{item.value}</span>
                    {isPinned && <Pin size={12} className="shrink-0 text-muted" aria-label={t('combo.pinned')} />}
                    {selected && <Check size={14} className="shrink-0 text-brand" aria-hidden="true" />}
                  </>
                )}
              </li>
            );
          })}
        </ul>,
        document.body,
      )}
    </div>
  );
}

/** Combobox for a profile's "Requested by" or "Project" values: ordered, and new values are saved. */
export function FieldValueInput({
  field,
  value,
  onChange,
  id,
  label,
  describedBy,
  compact,
}: {
  field: ListField;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  label?: string;
  describedBy?: string;
  compact?: boolean;
}) {
  const { t, profile, data, addFieldValue } = useStore();
  const options = useMemo(() => (profile ? suggestions(profile, data.entries, field) : []), [profile, data.entries, field]);
  if (!profile) return null;
  return (
    <Combobox
      id={id}
      value={value}
      options={options}
      pinned={field === 'requestedBy' ? profile.pinnedRequesters : profile.pinnedProjects}
      onChange={onChange}
      onAdd={(v) => addFieldValue(field, v)}
      label={label ?? t(field === 'requestedBy' ? 'fields.requestedBy' : 'fields.project')}
      describedBy={describedBy}
      compact={compact}
    />
  );
}
