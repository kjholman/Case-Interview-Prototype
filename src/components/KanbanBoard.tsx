import { useId, useState, type ReactNode } from 'react';
import { StatusPill, type Tone } from './StatusPill';
import { cx } from './ui';

/**
 * KanbanBoard — columns of cards. Cards move by drag and drop, or with the keyboard through
 * the "Move to" control on each card.
 *
 * @prop columns     Ordered columns: { id, title, tone? }.
 * @prop items       All cards.
 * @prop getId       Card key.
 * @prop getColumn   Which column a card is in.
 * @prop renderCard  Card body.
 * @prop onMove      Called with (itemId, toColumnId). Omit for a read-only board.
 * @prop onOpen      Called when a card is clicked.
 * @prop maxPerColumn  Show "+N more" after this many (default 40).
 */
export interface KanbanColumn {
  id: string;
  title: string;
  tone?: Tone;
}

export interface KanbanBoardProps<T> {
  columns: KanbanColumn[];
  items: T[];
  getId: (item: T) => string;
  getColumn: (item: T) => string;
  renderCard: (item: T) => ReactNode;
  onMove?: (id: string, toColumn: string) => void;
  onOpen?: (item: T) => void;
  maxPerColumn?: number;
}

export function KanbanBoard<T>({ columns, items, getId, getColumn, renderCard, onMove, onOpen, maxPerColumn = 40 }: KanbanBoardProps<T>) {
  const [over, setOver] = useState<string | null>(null);
  const uid = useId();
  return (
    <div className="scroll-thin -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:grid lg:overflow-visible" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
      {columns.map((col) => {
        const colItems = items.filter((i) => getColumn(i) === col.id);
        return (
          <section
            key={col.id}
            aria-labelledby={`${uid}-${col.id}`}
            onDragOver={onMove ? (e) => { e.preventDefault(); setOver(col.id); } : undefined}
            onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
            onDrop={onMove ? (e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/plain'); if (id) onMove(id, col.id); } : undefined}
            className={cx('flex w-[78vw] max-w-[300px] shrink-0 snap-start flex-col rounded-lg bg-slate-100 p-2 dark:bg-slate-900/60 lg:w-auto lg:max-w-none',
              over === col.id && 'ring-2 ring-accent')}
          >
            <header className="mb-2 flex items-center justify-between px-1">
              <h3 id={`${uid}-${col.id}`} className="text-sm text-slate-800 dark:text-slate-200">
                <StatusPill tone={col.tone ?? 'neutral'} label={col.title} />
              </h3>
              <span className="text-xs tabular-nums muted">{colItems.length}</span>
            </header>
            <ul className="flex flex-col gap-2">
              {colItems.slice(0, maxPerColumn).map((item) => {
                const id = getId(item);
                return (
                  <li
                    key={id}
                    draggable={!!onMove}
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', id)}
                    className="card cursor-grab p-2.5 shadow-sm active:cursor-grabbing"
                  >
                    <div role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined}
                      onClick={onOpen ? () => onOpen(item) : undefined}
                      onKeyDown={onOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(item); } } : undefined}
                      className="rounded outline-offset-2">
                      {renderCard(item)}
                    </div>
                    {onMove && (
                      <label className="mt-2 flex items-center gap-1.5 text-[11px] muted">
                        <span>Move to</span>
                        <select value={col.id} onChange={(e) => onMove(id, e.target.value)}
                          className="rounded border border-slate-200 bg-transparent px-1 py-0.5 text-[11px] text-slate-700 dark:border-slate-700 dark:text-slate-300">
                          {columns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                        </select>
                      </label>
                    )}
                  </li>
                );
              })}
              {colItems.length > maxPerColumn && <li className="px-1 text-xs muted">+{colItems.length - maxPerColumn} more — narrow the filters</li>}
              {!colItems.length && <li className="rounded border border-dashed border-slate-300 px-2 py-6 text-center text-xs muted dark:border-slate-700">Nothing here</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
