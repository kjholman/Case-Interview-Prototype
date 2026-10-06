import { CONFIG } from '../config';
import { cx } from '../components/ui';

/**
 * Brand wordmark, set in Inter as text (no image asset), so it stays crisp, themes with the
 * surrounding color and adds nothing to the bundle. To use an official logo file instead,
 * put it in src/assets/ and render an <img> here.
 */
export function BrandMark({ className, onLight }: { className?: string; onLight?: boolean }) {
  return (
    <span className={cx('inline-flex select-none items-baseline text-lg font-semibold leading-none tracking-[-0.03em]',
      onLight ? 'text-slate-950 dark:text-white' : 'text-white', className)} aria-label={CONFIG.brand.name}>
      {CONFIG.brand.name}
    </span>
  );
}
