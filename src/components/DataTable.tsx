import { useMemo, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { cx } from './ui';

/**
 * DataTable — sortable, keyboard-accessible table for any row type.
 * Filtering stays outside (pass already-filtered rows) so screens can use any filter UI.
 *
 * @prop rows         The rows to show.
 * @prop columns      Column definitions (see `Column`).
 * @prop getRowId     Stable key for a row.
 * @prop onRowClick   Optional; makes rows focusable and opens with Enter/Space.
 * @prop selectedId   Highlights the matching row.
 * @prop initialSort  { id, dir } — column id and direction.
 * @prop empty        Rendered when there are no rows.
 * @prop caption      Screen-reader caption.
 * @prop maxHeight    CSS max-height for the scroll area (header stays sticky).
 */
export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Provide to make the column sortable. */
  sortValue?: (row: T) => string | number | undefined | null;
  align?: 'left' | 'right';
  /** Hide on narrow screens. */
  hideBelow?: 'sm' | 'md' | 'lg';
  className?: string;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedId?: string;
  initialSort?: { id: string; dir: 'asc' | 'desc' };
  empty?: ReactNode;
  caption?: string;
  maxHeight?: string;
}

const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };

export function DataTable<T>({ rows, columns, getRowId, onRowClick, selectedId, initialSort, empty, caption, maxHeight = '70vh' }: DataTableProps<T>) {
  const [sort, setSort] = useState(initialSort);
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.id === sort?.id);
    if (!col?.sortValue || !sort) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // blanks last
      if (vb == null) return -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    });
  }, [rows, columns, sort]);

  const toggle = (id: string) =>
    setSort((s) => (s?.id === id ? { id, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { id, dir: 'asc' }));

  if (!rows.length && empty) return <>{empty}</>;

  return (
    <div className="scroll-thin overflow-auto" style={{ maxHeight }}>
      <table className="w-full border-separate border-spacing-0 text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.id === c.id;
              return (
                <th
                  key={c.id} scope="col"
                  aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cx('sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400',
                    c.align === 'right' ? 'text-right' : 'text-left', c.hideBelow && HIDE[c.hideBelow])}
                >
                  {c.sortValue ? (
                    <button type="button" onClick={() => toggle(c.id)} className={cx('inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white', c.align === 'right' && 'flex-row-reverse')}>
                      {c.header}
                      <Icon name={active ? (sort!.dir === 'asc' ? 'arrowUp' : 'arrowDown') : 'sort'} className={cx('h-3 w-3', !active && 'opacity-40')} />
                    </button>
                  ) : c.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const id = getRowId(row);
            return (
              <tr
                key={id}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row); } } : undefined}
                aria-selected={selectedId ? selectedId === id : undefined}
                className={cx(onRowClick && 'cursor-pointer hover:bg-slate-50 focus-visible:bg-accent-soft dark:hover:bg-slate-800/60',
                  selectedId === id && 'bg-accent-soft/70')}
              >
                {columns.map((c) => (
                  <td key={c.id} className={cx('border-b border-slate-100 px-3 py-2 align-middle dark:border-slate-800', c.align === 'right' && 'text-right tabular-nums', c.hideBelow && HIDE[c.hideBelow], c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
