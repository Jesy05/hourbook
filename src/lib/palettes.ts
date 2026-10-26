/*
 * Color palettes for the exported Excel files. A palette has four roles; the
 * text color on each one is picked automatically so it stays readable.
 */

export interface ExcelPalette {
  /** Title band with the name, report and period, and the "total due" band. */
  title: string;
  /** Column headers of every table. */
  header: string;
  /** Every other row, so long tables are easy to follow. */
  stripe: string;
  /** Totals and key results such as BALANCE, DAYS and the amount due. */
  total: string;
}

export interface PalettePreset {
  id: string;
  name: { es: string; en: string };
  palette: ExcelPalette;
}

export const PRESETS: PalettePreset[] = [
  {
    id: 'hourbook',
    name: { es: 'Hourbook', en: 'Hourbook' },
    palette: { title: '#C93638', header: '#FA855A', stripe: '#FFF6E0', total: '#62C4DA' },
  },
  {
    id: 'ocean',
    name: { es: 'Océano', en: 'Ocean' },
    palette: { title: '#1F4E79', header: '#9DC3E6', stripe: '#EEF5FB', total: '#FFD966' },
  },
  {
    id: 'forest',
    name: { es: 'Bosque', en: 'Forest' },
    palette: { title: '#2E5E3E', header: '#A9D18E', stripe: '#F1F7EC', total: '#F4B183' },
  },
  {
    id: 'lavender',
    name: { es: 'Lavanda', en: 'Lavender' },
    palette: { title: '#5B3F8C', header: '#C9B6E4', stripe: '#F6F1FB', total: '#F8C8DC' },
  },
  {
    id: 'mono',
    name: { es: 'Gris (para imprimir)', en: 'Gray (print friendly)' },
    palette: { title: '#3A3A3A', header: '#BFBFBF', stripe: '#F2F2F2', total: '#D9D9D9' },
  },
];

export const DEFAULT_PALETTE: ExcelPalette = PRESETS[0].palette;

export const PALETTE_ROLES: (keyof ExcelPalette)[] = ['title', 'header', 'stripe', 'total'];

const DARK_TEXT = '#2B2B2B';
const LIGHT_TEXT = '#FFFFFF';

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

/** Keeps only valid colors, falling back to the default palette role by role. */
export function normalizePalette(value: unknown): ExcelPalette {
  const input = (typeof value === 'object' && value !== null ? value : {}) as Partial<Record<keyof ExcelPalette, unknown>>;
  const out = { ...DEFAULT_PALETTE };
  for (const role of PALETTE_ROLES) {
    const color = input[role];
    if (isHexColor(color)) out[role] = color.toUpperCase();
  }
  return out;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** White or dark text, whichever reads better on the given background. */
export function textOn(background: string): string {
  return contrastRatio(background, LIGHT_TEXT) >= contrastRatio(background, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
}

export function presetFor(palette: ExcelPalette): PalettePreset | undefined {
  return PRESETS.find((p) => PALETTE_ROLES.every((role) => p.palette[role].toUpperCase() === palette[role].toUpperCase()));
}
