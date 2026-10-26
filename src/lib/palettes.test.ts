import { describe, expect, it } from 'vitest';
import { contrastRatio, DEFAULT_PALETTE, normalizePalette, PRESETS, presetFor, textOn } from './palettes';

describe('excel palettes', () => {
  it('picks white text on dark colors and dark text on light ones', () => {
    expect(textOn('#C93638')).toBe('#FFFFFF');
    expect(textOn('#1F4E79')).toBe('#FFFFFF');
    expect(textOn('#FFD966')).toBe('#2B2B2B');
    expect(textOn('#FA855A')).toBe('#2B2B2B');
  });

  it('keeps every preset role readable (WCAG AA, 4.5:1)', () => {
    for (const preset of PRESETS) {
      for (const color of Object.values(preset.palette)) {
        expect(contrastRatio(color, textOn(color)), `${preset.id} ${color}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('repairs invalid input role by role', () => {
    expect(normalizePalette({ title: '#123456', header: 'red', stripe: null })).toEqual({
      ...DEFAULT_PALETTE,
      title: '#123456',
    });
    expect(normalizePalette(undefined)).toEqual(DEFAULT_PALETTE);
  });

  it('recognizes a preset by its colors', () => {
    expect(presetFor({ ...PRESETS[1].palette })?.id).toBe('ocean');
    expect(presetFor({ ...PRESETS[1].palette, total: '#000000' })).toBeUndefined();
  });
});
