import { useTheme } from '../lib/theme';

/** Tomato clock logo: white hands in light mode, black hands in dark mode. */
export function AppLogo({ size }: { size: number }) {
  const theme = useTheme();
  return (
    <img
      src={theme === 'dark' ? '/icon-dark.png' : '/icon-light.png'}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className="shrink-0"
      style={{ width: size, height: size }}
    />
  );
}
