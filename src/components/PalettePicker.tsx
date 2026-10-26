import { Check, Palette } from 'lucide-react';
import { useState } from 'react';
import type { MessageKey } from '../lib/i18n';
import { normalizePalette, PALETTE_ROLES, PRESETS, presetFor, textOn, type ExcelPalette } from '../lib/palettes';
import { useStore } from '../lib/store';
import { Card } from './ui';

const ROLE_LABEL: Record<keyof ExcelPalette, MessageKey> = {
  title: 'palette.roleTitle',
  header: 'palette.roleHeader',
  stripe: 'palette.roleStripe',
  total: 'palette.roleTotal',
};

const ROLE_HINT: Record<keyof ExcelPalette, MessageKey> = {
  title: 'palette.roleTitleHint',
  header: 'palette.roleHeaderHint',
  stripe: 'palette.roleStripeHint',
  total: 'palette.roleTotalHint',
};

/** Small picture of the exported sheet, painted with the palette. */
function SheetPreview({ palette }: { palette: ExcelPalette }) {
  const { t } = useStore();
  const paint = (color: string) => ({ backgroundColor: color, color: textOn(color) });
  const cell = 'px-2 py-1';
  return (
    <figure className="overflow-hidden rounded-xl border border-line text-[11px] leading-tight" aria-label={t('palette.preview')}>
      <div className="px-2 py-1.5 font-bold" style={paint(palette.title)}>
        Jesy Gonzalez | Invoice | October 2026
      </div>
      <table className="w-full border-collapse" aria-hidden="true">
        <thead>
          <tr style={paint(palette.header)} className="font-bold">
            <td className={cell}>Date</td>
            <td className={`${cell} text-right`}>Hours</td>
          </tr>
        </thead>
        <tbody>
          <tr style={{ backgroundColor: '#FFFFFF', color: '#2B2B2B' }}>
            <td className={cell}>1-Oct</td>
            <td className={`${cell} text-right`}>8.50</td>
          </tr>
          <tr style={paint(palette.stripe)}>
            <td className={cell}>2-Oct</td>
            <td className={`${cell} text-right`}>7.25</td>
          </tr>
          <tr style={{ backgroundColor: '#FFFFFF', color: '#2B2B2B' }}>
            <td className={cell}>3-Oct</td>
            <td className={`${cell} text-right`}>9.00</td>
          </tr>
          <tr style={paint(palette.total)} className="font-bold">
            <td className={cell}>Total</td>
            <td className={`${cell} text-right`}>24.75</td>
          </tr>
        </tbody>
      </table>
    </figure>
  );
}

function same(a: ExcelPalette, b: ExcelPalette): boolean {
  return PALETTE_ROLES.every((role) => a[role].toUpperCase() === b[role].toUpperCase());
}

export function PalettePicker({
  palette,
  saved,
  onChange,
}: {
  palette: ExcelPalette;
  /** The saved custom palette, if the user has made one. */
  saved?: ExcelPalette;
  onChange: (palette: ExcelPalette, isCustom: boolean) => void;
}) {
  const { t, language } = useStore();
  const current = presetFor(palette);
  const savedCustom = saved ? normalizePalette(saved) : undefined;
  const [customOpen, setCustomOpen] = useState(!current || (!!savedCustom && same(palette, savedCustom)));
  const custom = customOpen || !current;
  // The custom chip previews the saved slot, or the current colors when there is none yet.
  const customSwatch = savedCustom ?? palette;

  return (
    <Card title={t('palette.title')} icon={<Palette size={20} />}>
      <p className="mb-4 text-sm text-muted">{t('palette.hint')}</p>

      <div role="radiogroup" aria-label={t('palette.title')} className="mb-5 flex flex-wrap gap-2">
        {PRESETS.map((preset) => {
          const selected = !custom && current?.id === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                setCustomOpen(false);
                onChange({ ...preset.palette }, false);
              }}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                selected ? 'border-coral bg-peach-soft' : 'border-line bg-surface hover:bg-canvas'
              }`}
            >
              <span className="flex overflow-hidden rounded-md border border-line" aria-hidden="true">
                {PALETTE_ROLES.map((role) => (
                  <span key={role} className="h-5 w-3" style={{ backgroundColor: preset.palette[role] }} />
                ))}
              </span>
              {preset.name[language]}
              {selected && <Check size={16} className="text-brand" aria-hidden="true" />}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={custom}
          onClick={() => {
            setCustomOpen(true);
            // Bring back the saved custom colors, or start the slot from the current ones.
            onChange({ ...customSwatch }, true);
          }}
          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
            custom ? 'border-coral bg-peach-soft' : 'border-line bg-surface hover:bg-canvas'
          }`}
        >
          {savedCustom && (
            <span className="flex overflow-hidden rounded-md border border-line" aria-hidden="true">
              {PALETTE_ROLES.map((role) => (
                <span key={role} className="h-5 w-3" style={{ backgroundColor: savedCustom[role] }} />
              ))}
            </span>
          )}
          {t('palette.custom')}
          {custom && <Check size={16} className="text-brand" aria-hidden="true" />}
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ul className="flex flex-col gap-3">
          {PALETTE_ROLES.map((role) => (
            <li key={role} className="flex items-start gap-3">
              {custom ? (
                <input
                  type="color"
                  value={palette[role]}
                  onChange={(e) => onChange({ ...palette, [role]: e.target.value.toUpperCase() }, true)}
                  aria-label={t('palette.pick', { role: t(ROLE_LABEL[role]) })}
                  className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-surface p-1"
                />
              ) : (
                <span
                  className="flex h-10 w-12 shrink-0 items-center justify-center rounded-lg border border-line text-xs font-bold"
                  style={{ backgroundColor: palette[role], color: textOn(palette[role]) }}
                  aria-hidden="true"
                >
                  Aa
                </span>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold">{t(ROLE_LABEL[role])}</p>
                <p className="text-xs text-muted">{t(ROLE_HINT[role])}</p>
              </div>
            </li>
          ))}
          <li className="text-xs text-muted">{t('palette.textAuto')}</li>
          {custom && <li className="text-xs text-muted">{t('palette.customSaved')}</li>}
        </ul>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t('palette.preview')}</p>
          <SheetPreview palette={palette} />
        </div>
      </div>
    </Card>
  );
}
