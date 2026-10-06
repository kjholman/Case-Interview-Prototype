import { useCallback } from 'react';
import { formatDate } from '../domain/dates';
import type { FieldChange, FieldValue } from '../domain/types';
import { useLookups } from '../store/AppStore';

/** Formats raw field values for people: ids → names, ISO dates → "Oct 6", enums → words. */
export function useFormatValue() {
  const l = useLookups();
  return useCallback(
    (change: FieldChange, value: FieldValue): string => {
      if (value === null || value === undefined || value === '') return '—';
      const opt = change.options?.find((o) => o.value === value);
      if (opt) return opt.label;
      if (typeof value === 'string') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
        const staff = l.staffById.get(value);
        if (staff) return staff.name;
        const vendor = l.vendorById.get(value);
        if (vendor) return vendor.name;
        return value.replace(/_/g, ' ');
      }
      if (typeof value === 'number') return value.toLocaleString('en-US');
      return value ? 'Yes' : 'No';
    },
    [l],
  );
}

export function useWhoLabel() {
  const l = useLookups();
  return useCallback(
    (t: { assigneeId?: string; vendorId?: string }) =>
      t.assigneeId ? l.staffById.get(t.assigneeId)?.name ?? 'Unknown' : t.vendorId ? l.vendorById.get(t.vendorId)?.name ?? 'Vendor' : undefined,
    [l],
  );
}
