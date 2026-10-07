/**
 * Screen registry — maps each ScreenId to its route, icon and component.
 * Labels, descriptions and on/off switches live in config.ts (CONFIG.screens).
 * To add a screen: create it in src/screens/, add an id to ScreenId + CONFIG.screens, and register it here.
 */
import type { ComponentType } from 'react';
import { CONFIG, type ScreenId } from '../config';
import type { IconName } from '../components/Icon';
import { Activity } from './Activity';
import { Approvals } from './Approvals';
import { Conversations } from './Conversations';
import { Exceptions } from './Exceptions';
import { FieldApp } from './FieldApp';
import { Impact } from './Impact';
import { Leasing } from './Leasing';
import { MoveOut } from './MoveOut';
import { Overview } from './Overview';
import { Residents } from './Residents';
import { Settings } from './Settings';
import { TurnBoard } from './TurnBoard';
import { Units } from './Units';
import { WorkBoard } from './WorkBoard';

export const SCREENS: Record<ScreenId, { path: string; icon: IconName; component: ComponentType }> = {
  turns: { path: '/turns', icon: 'columns', component: TurnBoard },
  overview: { path: '/overview', icon: 'home', component: Overview },
  units: { path: '/units', icon: 'building', component: Units },
  residents: { path: '/residents', icon: 'users', component: Residents },
  leasing: { path: '/leasing', icon: 'key', component: Leasing },
  work: { path: '/work', icon: 'wrench', component: WorkBoard },
  exceptions: { path: '/exceptions', icon: 'alert', component: Exceptions },
  approvals: { path: '/approvals', icon: 'checkCircle', component: Approvals },
  conversations: { path: '/conversations', icon: 'message', component: Conversations },
  field: { path: '/field', icon: 'phone', component: FieldApp },
  moveout: { path: '/move-out', icon: 'camera', component: MoveOut },
  impact: { path: '/impact', icon: 'calculator', component: Impact },
  activity: { path: '/activity', icon: 'history', component: Activity },
  settings: { path: '/settings', icon: 'settings', component: Settings },
};

export const enabledScreens = () => (Object.keys(CONFIG.screens) as ScreenId[]).filter((id) => CONFIG.screens[id].enabled);
