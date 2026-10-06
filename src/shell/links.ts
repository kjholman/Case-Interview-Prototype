import type { RecordRef } from '../domain/types';
import type { Lookups } from '../store/AppStore';

/** Route that shows a record: units and residents open the unit drawer, tasks the task drawer, etc. */
export function recordLink(ref: RecordRef, l: Lookups): string | undefined {
  switch (ref.collection) {
    case 'units':
      return `/units?unit=${ref.id}`;
    case 'tasks':
      return `/work?task=${ref.id}`;
    case 'residents': {
      const r = l.residentById.get(ref.id);
      return r ? `/units?unit=${r.unitId}` : undefined;
    }
    case 'prospects': {
      const c = [...l.conversationById.values()].find((x) => x.contact.id === ref.id);
      if (c) return `/conversations?c=${c.id}`;
      const p = l.prospectById.get(ref.id);
      return p?.interestedUnitId ? `/units?unit=${p.interestedUnitId}` : undefined;
    }
    case 'conversations':
      return `/conversations?c=${ref.id}`;
  }
}
