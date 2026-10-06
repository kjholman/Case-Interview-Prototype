import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * EmptyState — what to show when a list or panel has nothing in it.
 *
 * @prop title   One short sentence ("Nothing needs approval").
 * @prop body    Optional explanation or next step.
 * @prop icon    Icon name (default 'checkCircle').
 * @prop action  Optional button or link.
 */
export interface EmptyStateProps {
  title: string;
  body?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
}

export function EmptyState({ title, body, icon = 'checkCircle', action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 rounded-full bg-slate-100 p-3 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <Icon name={icon} className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
