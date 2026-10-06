/** Field checklists by task type. Edit wording here; the Field app renders them as-is. */
import type { TaskType } from './types';
import type { ChecklistItem } from '../components/ChecklistForm';

export const CHECKLISTS: Record<TaskType, ChecklistItem[]> = {
  inspection: [
    { id: 'keys', label: 'Keys and fobs collected', hint: 'Count matches the lease file' },
    { id: 'walls', label: 'Walls and doors checked for damage' },
    { id: 'appliances', label: 'Appliances tested' },
    { id: 'flooring', label: 'Flooring condition noted' },
    { id: 'photos', label: 'Photos of every room taken' },
  ],
  repair: [
    { id: 'list', label: 'Inspection repair list reviewed' },
    { id: 'fixtures', label: 'Fixtures and hardware repaired or replaced' },
    { id: 'plumbing', label: 'No leaks under sinks' },
    { id: 'electrical', label: 'Outlets, switches and lights working' },
  ],
  paint: [
    { id: 'patch', label: 'Holes patched and sanded' },
    { id: 'walls', label: 'Walls painted, two coats where needed' },
    { id: 'trim', label: 'Trim and doors touched up' },
    { id: 'cleanup', label: 'Drop cloths and tape removed' },
  ],
  flooring: [
    { id: 'removed', label: 'Damaged flooring removed' },
    { id: 'installed', label: 'New flooring or carpet installed' },
    { id: 'transitions', label: 'Transitions and baseboards secure' },
  ],
  clean: [
    { id: 'kitchen', label: 'Kitchen and appliances cleaned inside and out' },
    { id: 'bath', label: 'Bathrooms cleaned and sanitized' },
    { id: 'floors', label: 'Floors vacuumed and mopped' },
    { id: 'windows', label: 'Windows, blinds and sills wiped' },
  ],
  final_walk: [
    { id: 'lights', label: 'Every light and outlet works' },
    { id: 'hvac', label: 'Heating and cooling run' },
    { id: 'water', label: 'Hot water at every tap' },
    { id: 'smoke', label: 'Smoke and CO detectors tested' },
    { id: 'clean', label: 'Unit is clean and odor-free' },
    { id: 'ready', label: 'Ready for move-in' },
  ],
  service: [
    { id: 'arrived', label: 'Knocked and announced entry' },
    { id: 'diagnosed', label: 'Problem diagnosed' },
    { id: 'fixed', label: 'Repair completed and tested' },
    { id: 'note', label: 'Left a note for the resident' },
  ],
};
