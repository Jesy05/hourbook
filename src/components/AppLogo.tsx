/** Tomato clock logo: white hands in light mode, black hands in dark mode. */
export function AppLogo({ size }: { size: number }) {
  return (
    <picture className="shrink-0" aria-hidden="true">
      <source srcSet="/icon-dark.png" media="(prefers-color-scheme: dark)" />
      <img src="/icon-light.png" alt="" width={size} height={size} style={{ width: size, height: size }} />
    </picture>
  );
}
