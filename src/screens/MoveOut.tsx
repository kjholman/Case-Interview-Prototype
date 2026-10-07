import { useMemo, useState } from 'react';
import { CONFIG } from '../config';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { PageHeader, Select, cx } from '../components/ui';
import { daysBetween, formatWeekday, TODAY } from '../domain/dates';
import { useLookups, useScopedData } from '../store/AppStore';

/**
 * Move-out guide — what a resident on notice sees in the app before move-out day:
 * a scheduled move-out checklist and a room-by-room photo guide. Display-only demo:
 * nothing here is saved; "Start over" resets it.
 */

type Room = 'kitchen' | 'bathroom' | 'bedroom' | 'living' | 'floors' | 'walls';

interface Shot { id: string; label: string; tip: string }

const ROOMS: { id: Room; name: string; shots: Shot[] }[] = [
  { id: 'kitchen', name: 'Kitchen', shots: [
    { id: 'k1', label: 'Whole kitchen from the doorway', tip: 'Stand in the doorway so counters and cabinets are all in frame.' },
    { id: 'k2', label: 'Inside the oven and fridge', tip: 'Doors open, light on.' },
    { id: 'k3', label: 'Under the sink', tip: 'Open the cabinet so the pipes and cabinet floor are visible.' },
  ] },
  { id: 'bathroom', name: 'Bathroom', shots: [
    { id: 'b1', label: 'Sink and vanity', tip: 'Include the mirror and faucet.' },
    { id: 'b2', label: 'Tub or shower', tip: 'Show the caulk line and drain.' },
    { id: 'b3', label: 'Toilet and floor around it', tip: 'Step back so the base and floor are both visible.' },
  ] },
  { id: 'bedroom', name: 'Bedroom', shots: [
    { id: 'r1', label: 'Room from the doorway', tip: 'Capture the window wall and as much floor as you can.' },
    { id: 'r2', label: 'Closet, doors open', tip: 'Show the shelf, rod and closet floor.' },
  ] },
  { id: 'living', name: 'Living room', shots: [
    { id: 'l1', label: 'Room from the entry', tip: 'Turn on the lights; include windows and blinds.' },
    { id: 'l2', label: 'Opposite corner', tip: 'Stand in the far corner and shoot back toward the entry.' },
  ] },
  { id: 'floors', name: 'Floors', shots: [
    { id: 'f1', label: 'Carpet or flooring in each room', tip: 'Shoot from standing height, angled down.' },
    { id: 'f2', label: 'Close-up of any stain or damage', tip: 'Place a coin or your hand next to it for scale. Skip if none.' },
  ] },
  { id: 'walls', name: 'Walls', shots: [
    { id: 'w1', label: 'Any holes, scuffs or marks', tip: 'One close-up per mark. Skip if none.' },
    { id: 'w2', label: 'Ceilings in wet areas', tip: 'Kitchen and bathroom ceilings, looking for stains.' },
  ] },
];

const CHECKLIST: { section: string; items: string[] }[] = [
  { section: 'This week', items: ['Schedule your utility transfer for move-out day', 'Add your forwarding address', 'Book a moving elevator or loading spot'] },
  { section: 'Before you leave', items: ['Remove all belongings and trash', 'Clean inside the oven, fridge and microwave', 'Wipe down cabinets, counters and bathroom', 'Take your move-out photos (photo guide below)'] },
  { section: 'On move-out day', items: ['Return all keys, fobs and parking passes', 'Leave the thermostat at 68°F and lights off'] },
];

const ALL_SHOTS = ROOMS.flatMap((r) => r.shots.map((s) => ({ ...s, room: r.id })));
const CLOSER_SHOT: Shot = { id: 'b-close', label: 'Closer photo: under the bathroom sink', tip: 'Open the vanity doors and shoot the cabinet floor and pipes up close.' };

/** Simple room illustration so the demo needs no images. `captured` shows a "taken" look. */
function RoomArt({ room, captured, small }: { room: Room; captured?: boolean; small?: boolean }) {
  const stroke = captured ? '#334155' : '#94a3b8';
  const fill = captured ? '#e2e8f0' : '#f8fafc';
  const shapes: Record<Room, JSX.Element> = {
    kitchen: <><rect x="10" y="38" width="100" height="30" fill={fill} stroke={stroke} /><rect x="10" y="10" width="100" height="18" fill={fill} stroke={stroke} />
      <rect x="45" y="40" width="24" height="10" rx="2" fill="none" stroke={stroke} /><line x1="35" y1="10" x2="35" y2="28" stroke={stroke} /><line x1="85" y1="10" x2="85" y2="28" stroke={stroke} /></>,
    bathroom: <><rect x="20" y="10" width="34" height="22" fill={fill} stroke={stroke} /><rect x="14" y="40" width="46" height="28" fill={fill} stroke={stroke} />
      <ellipse cx="37" cy="44" rx="12" ry="4" fill="none" stroke={stroke} /><rect x="78" y="44" width="22" height="24" rx="6" fill={fill} stroke={stroke} /></>,
    bedroom: <><rect x="40" y="10" width="40" height="26" fill={fill} stroke={stroke} /><line x1="60" y1="10" x2="60" y2="36" stroke={stroke} />
      <rect x="88" y="14" width="22" height="54" fill={fill} stroke={stroke} /><line x1="10" y1="68" x2="110" y2="68" stroke={stroke} /></>,
    living: <><rect x="16" y="12" width="36" height="28" fill={fill} stroke={stroke} /><rect x="68" y="12" width="36" height="28" fill={fill} stroke={stroke} />
      <line x1="10" y1="62" x2="110" y2="62" stroke={stroke} /><rect x="54" y="50" width="6" height="8" fill="none" stroke={stroke} /></>,
    floors: <>{[0, 1, 2, 3, 4].map((i) => <line key={i} x1={20 + i * 20} y1="20" x2={i * 30} y2="72" stroke={stroke} />)}
      <line x1="16" y1="34" x2="104" y2="34" stroke={stroke} /><line x1="8" y1="52" x2="112" y2="52" stroke={stroke} /><ellipse cx="74" cy="58" rx="10" ry="4" fill={captured ? '#a8a29e' : 'none'} stroke={stroke} strokeDasharray={captured ? undefined : '2 2'} /></>,
    walls: <><rect x="10" y="10" width="100" height="58" fill={fill} stroke={stroke} /><path d="M40 34 l14 4" stroke={stroke} strokeWidth="2" />
      <circle cx="80" cy="30" r="2.5" fill={captured ? '#475569' : 'none'} stroke={stroke} /></>,
  };
  return (
    <svg viewBox="0 0 120 78" className={cx('w-full rounded-md', small ? 'h-14' : 'h-32', captured ? 'bg-slate-100' : 'bg-white')} aria-hidden>
      {shapes[room]}
      {!captured && (
        // Framing guide: corner brackets showing what to fit in the shot.
        <g stroke="#7638FA" strokeWidth="2" fill="none">
          <path d="M6 16 V6 H16" /><path d="M104 6 H114 V16" /><path d="M6 62 V72 H16" /><path d="M104 72 H114 V62" />
        </g>
      )}
      {captured && <g><circle cx="108" cy="12" r="7" fill="#059669" /><path d="M104.5 12 l2.5 2.5 l4.5 -5" stroke="white" strokeWidth="1.8" fill="none" /></g>}
    </svg>
  );
}

type View = 'home' | 'room' | 'closer' | 'done';

export function MoveOut() {
  const data = useScopedData();
  const l = useLookups();
  const onNotice = useMemo(() => data.residents.filter((r) => r.stage === 'notice_given').sort((a, b) => a.leaseEnd.localeCompare(b.leaseEnd)), [data.residents]);
  const [residentId, setResidentId] = useState(onNotice[0]?.id ?? '');
  const resident = l.residentById.get(residentId) ?? onNotice[0];
  const unit = resident ? l.unitById.get(resident.unitId) : undefined;
  const property = resident ? l.propertyById.get(resident.propertyId) : undefined;

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [photos, setPhotos] = useState<Set<string>>(new Set());
  const [view, setView] = useState<View>('home');
  const [room, setRoom] = useState<Room>('kitchen');
  const cfg = CONFIG.screens.moveout;
  const name = CONFIG.brand.assistantName;

  const reset = () => { setChecked(new Set()); setPhotos(new Set()); setView('home'); };
  const toggle = (set: Set<string>, id: string, fn: (s: Set<string>) => void) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); fn(n); };

  const moveOut = unit?.moveOutDate ?? resident?.leaseEnd ?? TODAY;
  const daysLeft = daysBetween(TODAY, moveOut);
  const checklistTotal = CHECKLIST.reduce((s, c) => s + c.items.length, 0);
  const photosDone = ALL_SHOTS.filter((s) => photos.has(s.id)).length;
  const roomsDone = ROOMS.filter((r) => r.shots.every((s) => photos.has(s.id))).length;
  const pct = Math.round(((checked.size + photosDone) / (checklistTotal + ALL_SHOTS.length)) * 100);
  const current = ROOMS.find((r) => r.id === room)!;

  if (!resident || !unit) {
    return (
      <>
        <PageHeader title={cfg.label} description={cfg.description} />
        <div className="card"><EmptyState icon="users" title="No residents on notice at this property" body="Pick another property in the top bar." /></div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={cfg.label} description={cfg.description}
        actions={<>
          <Select label="Resident" hideLabel value={resident.id} onChange={(v) => { setResidentId(v); reset(); }} className="w-72"
            options={onNotice.map((r) => ({ value: r.id, label: `${r.name} · Unit ${l.unitById.get(r.unitId)?.number} · out ${formatWeekday(l.unitById.get(r.unitId)?.moveOutDate ?? r.leaseEnd)}` }))} />
          <button type="button" className="btn-secondary" onClick={reset}><Icon name="refresh" />Start over</button>
        </>} />

      <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
        {/* ── Phone: what the resident sees ── */}
        <div className="mx-auto w-full max-w-[390px] rounded-[2.25rem] border-[10px] border-slate-900 shadow-2xl dark:border-slate-700">
          <div className="flex h-[760px] flex-col overflow-hidden rounded-[1.6rem] bg-slate-50 dark:bg-slate-950">
            <div className="bg-[#0B0A12] px-4 pb-4 pt-5 text-white">
              {view !== 'home' && view !== 'done' ? (
                <button type="button" onClick={() => setView('home')} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-300"><Icon name="chevronLeft" className="h-4 w-4" />Move-out</button>
              ) : <p className="text-xs font-medium uppercase tracking-wide text-[#AFC1F6]">{property?.name}</p>}
              <h1 className="text-xl font-semibold">{view === 'room' ? `${current.name} photos` : view === 'closer' ? 'One more photo' : view === 'done' ? 'All set' : `Hi ${resident.name.split(' ')[0]}, your move-out`}</h1>
              <p className="text-sm text-slate-300">Unit {unit.number} · {formatWeekday(moveOut)}{daysLeft >= 0 ? ` · in ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : ''}</p>
              {view === 'home' && (
                <div className="mt-3">
                  <div className="h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#7638FA] transition-all" style={{ width: `${pct}%` }} /></div>
                  <p className="mt-1 text-xs text-slate-300">{pct}% complete · {checked.size}/{checklistTotal} tasks · {photosDone}/{ALL_SHOTS.length} photos</p>
                </div>
              )}
            </div>

            <div key={`${view}-${room}`} className="scroll-thin flex-1 overflow-y-auto p-4">
              {view === 'home' && (
                <div className="space-y-5">
                  <div className="flex gap-2.5 rounded-lg border border-[#AFC1F6] bg-[#F1EBFF] p-3 text-sm text-slate-800 dark:bg-[#2A1663] dark:text-slate-100">
                    <Icon name="dollar" className="mt-0.5 h-4 w-4 shrink-0 text-[#7638FA]" />
                    <span><span className="font-semibold">Submit your move-out photos for faster deposit processing.</span> They become the record of how you left your home.</span>
                  </div>

                  {CHECKLIST.map((c) => (
                    <section key={c.section}>
                      <h2 className="section-title mb-2">{c.section}</h2>
                      <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                        {c.items.map((item) => (
                          <li key={item}>
                            <label className="flex min-h-[46px] cursor-pointer items-center gap-3 px-3 py-2">
                              <input type="checkbox" className="h-5 w-5 shrink-0 accent-[#7638FA]" checked={checked.has(item)} onChange={() => toggle(checked, item, setChecked)} />
                              <span className={cx('text-sm', checked.has(item) ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-slate-100')}>{item}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}

                  <section>
                    <h2 className="section-title mb-2">Photo guide · {roomsDone}/{ROOMS.length} rooms</h2>
                    <ul className="grid grid-cols-2 gap-2">
                      {ROOMS.map((r) => {
                        const n = r.shots.filter((s) => photos.has(s.id)).length;
                        const done = n === r.shots.length;
                        return (
                          <li key={r.id}>
                            <button type="button" onClick={() => { setRoom(r.id); setView('room'); }}
                              className={cx('w-full rounded-lg border bg-white p-2 text-left dark:bg-slate-900', done ? 'border-emerald-400' : 'border-slate-200 hover:border-[#7638FA] dark:border-slate-800')}>
                              <RoomArt room={r.id} captured={done} small />
                              <span className="mt-1.5 block text-sm font-medium text-slate-900 dark:text-slate-100">{r.name}</span>
                              <span className={cx('text-xs', done ? 'text-emerald-700 dark:text-emerald-400' : 'muted')}>{done ? 'Done' : `${n}/${r.shots.length} photos`}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>

                  <button type="button" className="btn-primary w-full rounded-full py-3 text-base" disabled={photosDone < ALL_SHOTS.length}
                    onClick={() => setView('closer')}>Submit move-out photos</button>
                  {photosDone < ALL_SHOTS.length && <p className="-mt-3 text-center text-xs muted">Take all {ALL_SHOTS.length} photos to submit ({ALL_SHOTS.length - photosDone} left).</p>}
                  <button type="button" className="w-full text-center text-xs font-medium text-[#7638FA] hover:underline" onClick={() => setPhotos(new Set(ALL_SHOTS.map((s) => s.id)))}>
                    Demo: fill in all photos
                  </button>
                </div>
              )}

              {view === 'room' && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600 dark:text-slate-400">Fit everything inside the purple corners. Daylight or lights on works best.</p>
                  {current.shots.map((s, i) => {
                    const taken = photos.has(s.id);
                    return (
                      <div key={s.id} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{i + 1}. {s.label}</p>
                        <p className="mb-2 text-xs muted">{s.tip}</p>
                        <RoomArt room={current.id} captured={taken} />
                        <button type="button" onClick={() => toggle(photos, s.id, setPhotos)}
                          className={cx('mt-2 w-full', taken ? 'btn-secondary' : 'btn-primary')}>
                          <Icon name="camera" />{taken ? 'Retake photo' : 'Take photo'}
                        </button>
                      </div>
                    );
                  })}
                  <button type="button" className="btn-secondary w-full" onClick={() => {
                    const idx = ROOMS.findIndex((r) => r.id === room);
                    const next = ROOMS.slice(idx + 1).find((r) => !r.shots.every((s) => photos.has(s.id)));
                    if (next) setRoom(next.id); else setView('home');
                  }}>Next room</button>
                </div>
              )}

              {view === 'closer' && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                    <p className="font-semibold">We noticed something near the bathroom sink.</p>
                    <p className="mt-0.5">Can you take a closer photo? It helps us process your deposit without a follow-up visit.</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{CLOSER_SHOT.label}</p>
                    <p className="mb-2 text-xs muted">{CLOSER_SHOT.tip}</p>
                    <RoomArt room="bathroom" captured={photos.has(CLOSER_SHOT.id)} />
                    <button type="button" className={cx('mt-2 w-full', photos.has(CLOSER_SHOT.id) ? 'btn-secondary' : 'btn-primary')} onClick={() => toggle(photos, CLOSER_SHOT.id, setPhotos)}>
                      <Icon name="camera" />{photos.has(CLOSER_SHOT.id) ? 'Retake photo' : 'Take photo'}
                    </button>
                  </div>
                  <button type="button" className="btn-primary w-full rounded-full py-3 text-base" disabled={!photos.has(CLOSER_SHOT.id)} onClick={() => setView('done')}>Send</button>
                  <button type="button" className="w-full text-center text-xs muted hover:underline" onClick={() => setView('done')}>Skip for now</button>
                </div>
              )}

              {view === 'done' && (
                <div className="space-y-4 text-center">
                  <div className="mx-auto mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950"><Icon name="check" className="h-7 w-7 text-emerald-700" /></div>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">Photos received</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {photos.size} photos saved to your move-out record. Your deposit review starts now instead of after the inspection.
                    Return your keys on {formatWeekday(moveOut)} and you're done.
                  </p>
                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-left text-sm dark:border-slate-800 dark:bg-slate-900">
                    <p className="font-medium text-slate-900 dark:text-white">Still to do</p>
                    <ul className="mt-1 list-disc pl-5 text-slate-600 dark:text-slate-400">
                      {CHECKLIST.flatMap((c) => c.items).filter((i) => !checked.has(i) && !i.startsWith('Take your')).slice(0, 4).map((i) => <li key={i}>{i}</li>)}
                    </ul>
                  </div>
                  <p className="text-xs muted">Questions? Reply to {name} any time by text.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: the guide content and what the property team receives ── */}
        <div className="space-y-4">
          <section className="card p-4">
            <h2 className="text-sm text-slate-900 dark:text-white">How it works</h2>
            <ol className="mt-2 grid gap-3 text-sm text-slate-700 dark:text-slate-300 md:grid-cols-4">
              {[
                ['Notice recorded', `${name} schedules the guide for the resident's move-out week.`],
                ['Checklist', 'Reminders for utilities, forwarding address, cleaning and keys.'],
                ['Photo guide', `${ALL_SHOTS.length} framed shots across ${ROOMS.length} rooms, with tips for each.`],
                ['Follow-up', 'If something needs a closer look, the resident is asked for one more photo.'],
              ].map(([t, d], i) => (
                <li key={t} className="rounded-lg bg-[#F1EBFF]/60 p-3 dark:bg-[#2A1663]/50">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#7638FA] text-xs font-semibold text-white">{i + 1}</span>
                  <p className="mt-2 font-medium text-slate-900 dark:text-white">{t}</p>
                  <p className="text-xs muted">{d}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm text-slate-900 dark:text-white">Photo guide · every shot the resident is asked for</h2>
              <span className="text-xs muted">{photosDone}/{ALL_SHOTS.length} taken</span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {ROOMS.map((r) => (
                <div key={r.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-24 shrink-0"><RoomArt room={r.id} small captured={r.shots.every((s) => photos.has(s.id))} /></div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{r.name}</p>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {r.shots.map((s) => (
                      <li key={s.id} className="flex gap-2 text-xs">
                        <Icon name={photos.has(s.id) ? 'checkCircle' : 'camera'} className={cx('mt-0.5 h-3.5 w-3.5 shrink-0', photos.has(s.id) ? 'text-emerald-600' : 'text-slate-400')} />
                        <span><span className="font-medium text-slate-800 dark:text-slate-200">{s.label}.</span> <span className="muted">{s.tip}</span></span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="card p-4">
            <h2 className="text-sm text-slate-900 dark:text-white">What the property team receives</h2>
            <dl className="mt-2 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <div><dt className="text-xs muted">Resident</dt><dd className="font-medium">{resident.name}</dd></div>
              <div><dt className="text-xs muted">Move-out</dt><dd className="font-medium">{formatWeekday(moveOut)}</dd></div>
              <div><dt className="text-xs muted">Checklist</dt><dd className="font-medium">{checked.size}/{checklistTotal} done</dd></div>
              <div><dt className="text-xs muted">Photos</dt><dd className="font-medium">{photosDone + (photos.has(CLOSER_SHOT.id) ? 1 : 0)} of {ALL_SHOTS.length}{photos.has(CLOSER_SHOT.id) ? ' + 1 close-up' : ''}</dd></div>
            </dl>
            <p className="mt-3 text-xs muted">
              {view === 'done'
                ? 'Photos are attached to the unit before move-out, so the turn can be scoped before the inspection.'
                : 'Once submitted, the photos are attached to the unit so the turn can be scoped before the move-out inspection.'}
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
