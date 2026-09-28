import { useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ChangeEvent, type CSSProperties, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  getPushConfig,
  removePushSubscription,
  replacePushReminders,
  savePushSubscription,
} from '@workspace/api-client-react';
import {
  Archive, Award, Bell, CalendarDays, Check, ChevronLeft, ChevronRight, CircleHelp,
  Clock3, Download, Edit3, Flower2, Focus, Gift, Heart, Home, ListChecks, LockKeyhole,
  Moon, Pause, Play, Plus, RotateCcw, Search, Settings, Sparkles,
  Star, Target, Trash2, Upload, X, Zap
} from 'lucide-react';

type Category = 'Personal' | 'Personal Projects' | 'Module' | 'SAT' | 'AP' | 'Unis' | 'General';
type Priority = 'none' | 'high' | 'medium' | 'low';
type Difficulty = 'Easy' | 'Medium' | 'Hard';
type TaskStatus = 'todo' | 'completed';
type Theme = 'pink' | 'lavender' | 'pastel' | 'night' | 'light' | 'dark' | 'auto';
type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly';
type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
type RewardDefinition = { name: string; category: string; rarity: Rarity; icon: typeof Star };
type CharacterDefinition = { id: string; name: string; role: string; icon: typeof Star };
type Task = {
  id: string; title: string; category: Category; date: string; time: string; deadline: string;
  reminderMinutes: number | null; customReminder: string; priority: Priority; durationMinutes: number;
  difficulty: Difficulty; recurrence: Recurrence; notes: string; tags: string[]; status: TaskStatus;
  createdAt: string; completedAt?: string; postponements: number;
};
type Reward = { id: string; name: string; category: string; rarity: string; earnedAt: string; source: string };
type CharacterUnlock = { id: string; unlockedAt: string };
type Settings = { name: string; theme: Theme; animationsEnabled: boolean; soundsEnabled: boolean; notificationsEnabled: boolean; pushNotificationsEnabled: boolean; dailyGoal: number };
type Notice = { id: string; message: string; createdAt: string; read: boolean };
type ProgressEvent = { id: string; taskId: string; date: string; xp: number; category: Category };
type Store = { tasks: Task[]; rewards: Reward[]; settings: Settings; notifications: Notice[]; history: ProgressEvent[]; characters: CharacterUnlock[]; characterNicknames: Record<string, string> };
type Celebration = { reward: Reward; xp: number; character?: CharacterDefinition; milestoneReward?: Reward; perfectReward?: Reward; purpleBox: boolean };

const categories: Category[] = ['Personal', 'Personal Projects', 'Module', 'SAT', 'AP', 'Unis', 'General'];
const difficulties: Difficulty[] = ['Easy', 'Medium', 'Hard'];
const priorities: Priority[] = ['none', 'high', 'medium', 'low'];
const rewardCatalog: RewardDefinition[] = [
  { name: 'Purple Heart', category: 'hearts', rarity: 'common', icon: Heart },
  { name: 'Pink Heart', category: 'hearts', rarity: 'common', icon: Heart },
  { name: 'Star', category: 'stars', rarity: 'uncommon', icon: Star },
  { name: 'Ribbon', category: 'stickers', rarity: 'common', icon: Gift },
  { name: 'Moon', category: 'moons', rarity: 'epic', icon: Moon },
  { name: 'Microphone', category: 'music', rarity: 'uncommon', icon: Archive },
  { name: 'Sparkle', category: 'stickers', rarity: 'common', icon: Sparkles },
  { name: 'Gem', category: 'special', rarity: 'rare', icon: Award },
  { name: 'Flower', category: 'flowers', rarity: 'common', icon: Flower2 },
  { name: 'Magic Wand', category: 'special', rarity: 'rare', icon: Zap },
  { name: 'Legendary Crown', category: 'special', rarity: 'legendary', icon: Award },
];
const characterCatalog: CharacterDefinition[] = [
  { id: 'c1', name: 'Lyra', role: 'Main Vocalist', icon: Sparkles },
  { id: 'c2', name: 'Bloom', role: 'Dance Line', icon: Flower2 },
  { id: 'c3', name: 'Nova', role: 'Leader', icon: Star },
  { id: 'c4', name: 'Iris', role: 'Visual', icon: Heart },
  { id: 'c5', name: 'Pixel', role: 'Rapper', icon: Target },
  { id: 'c6', name: 'Echo', role: 'Producer', icon: Gift },
  { id: 'c7', name: 'Luna', role: 'Maknae', icon: Moon },
];
const defaultSettings: Settings = { name: 'Sanvi', theme: 'pink', animationsEnabled: true, soundsEnabled: false, notificationsEnabled: true, pushNotificationsEnabled: false, dailyGoal: 3 };
const initialStore: Store = { tasks: [], rewards: [], settings: defaultSettings, notifications: [], history: [], characters: [], characterNicknames: {} };
function xpForNextLevel(level: number): number { return 500 + (level - 1) * 250; }
function levelProgressFor(totalXp: number) {
  let level = 1;
  let xp = totalXp;
  let needed = xpForNextLevel(level);
  while (xp >= needed) {
    xp -= needed;
    level += 1;
    needed = xpForNextLevel(level);
  }
  return { level, xp, needed, percent: Math.min(100, Math.round((xp / needed) * 100)) };
}
function streakStats(history: ProgressEvent[]) {
  const dates = [...new Set(history.map((event) => event.date))].sort();
  const completedDates = new Set(dates);
  const cursor = new Date();
  if (!completedDates.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let current = 0;
  while (completedDates.has(dayKey(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  let longest = 0;
  let run = 0;
  let previous: Date | undefined;
  for (const date of dates) {
    const day = new Date(`${date}T12:00:00`);
    if (previous) {
      const expected = new Date(previous);
      expected.setDate(expected.getDate() + 1);
      run = dayKey(expected) === date ? run + 1 : 1;
    } else run = 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  return { current, longest };
}
function rollReward(boost: boolean) {
  const roll = Math.random();
  const rarity: Rarity = boost
    ? roll < 0.35 ? 'legendary' : roll < 0.6 ? 'epic' : roll < 0.8 ? 'rare' : 'uncommon'
    : roll < 0.55 ? 'common' : roll < 0.78 ? 'uncommon' : roll < 0.92 ? 'rare' : roll < 0.985 ? 'epic' : 'legendary';
  const pool = rewardCatalog.filter((reward) => reward.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)] || rewardCatalog[0];
}
type PushStatus = 'ready' | 'enabled' | 'denied' | 'unsupported' | 'error';
type ScheduledPushReminder = { taskId: string; taskTitle: string; scheduledAt: string };
function getPushClientId(): string {
  const storageKey = 'pinky-push-client-id';
  let clientId = localStorage.getItem(storageKey);
  if (!clientId) {
    clientId = crypto.randomUUID();
    localStorage.setItem(storageKey, clientId);
  }
  return clientId;
}
function decodeVapidKey(value: string): Uint8Array<ArrayBuffer> {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const decoded = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    decoded[index] = binary.charCodeAt(index);
  }
  return decoded;
}
function browserSupportsPush(): boolean {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && 'PushManager' in window
    && 'serviceWorker' in navigator;
}
function pushWorkerLocation(): { scope: string; scriptUrl: string } {
  const basePath = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  const baseUrl = new URL(basePath, window.location.origin);
  return {
    scope: baseUrl.pathname,
    scriptUrl: new URL('service-worker.js', baseUrl).toString(),
  };
}
function serializePushSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('The browser returned an incomplete push subscription.');
  }
  return {
    endpoint: json.endpoint,
    expirationTime: json.expirationTime,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  };
}
function sameVapidKey(subscription: PushSubscription, expected: Uint8Array<ArrayBuffer>): boolean {
  const applicationServerKey = subscription.options.applicationServerKey;
  if (!applicationServerKey) return false;
  const current = new Uint8Array(applicationServerKey);
  return current.length === expected.length && current.every((byte, index) => byte === expected[index]);
}
async function getOrCreatePushSubscription(registration: ServiceWorkerRegistration, publicKey: string): Promise<PushSubscription> {
  const applicationServerKey = decodeVapidKey(publicKey);
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !sameVapidKey(subscription, applicationServerKey)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  return subscription || registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });
}
function pushSupportMessage(): string {
  return browserSupportsPush()
    ? 'PINKY will only send alerts for reminders you set on your own tasks.'
    : 'This browser does not support background notifications. Try a supported browser or installable PINKY app.';
}
function scheduledPushReminders(tasks: Task[]): ScheduledPushReminder[] {
  const now = Date.now();
  return tasks.flatMap((task) => {
    if (task.status !== 'todo' || !task.date || !task.time || task.reminderMinutes === null) return [];
    const dueAt = new Date(`${task.date}T${task.time}`);
    const scheduledAt = new Date(dueAt.getTime() - task.reminderMinutes * 60_000);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= now) return [];
    return [{ taskId: task.id, taskTitle: task.title, scheduledAt: scheduledAt.toISOString() }];
  });
}
type TaskDraft = Omit<Task, 'id' | 'createdAt' | 'postponements' | 'status' | 'tags' | 'reminderMinutes'> & { tags: string; reminderMinutes: number | null | '' };
const queryClient = new QueryClient();
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const dayKey = (date = new Date()) => {
  const y = date.getFullYear(); const m = `${date.getMonth() + 1}`.padStart(2, '0'); const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const prettyDate = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'No date';
const difficultyXp = (difficulty: Difficulty) => difficulty === 'Easy' ? 5 : difficulty === 'Hard' ? 20 : 10;
const priorityLabel = (priority: Priority) => priority === 'none' ? 'No priority' : `${priority[0].toUpperCase()}${priority.slice(1)} priority`;
const emptyTask = (): Omit<Task, 'id' | 'createdAt' | 'postponements' | 'status'> => ({
  title: '', category: 'General', date: '', time: '', deadline: '', reminderMinutes: null, customReminder: '',
  priority: 'none', durationMinutes: 25, difficulty: 'Medium', recurrence: 'none', notes: '', tags: []
});
function normalizeStore(parsed: Partial<Store>): Store {
  return {
    ...initialStore,
    ...parsed,
    settings: { ...defaultSettings, ...(parsed.settings || {}) },
    tasks: parsed.tasks || [],
    rewards: parsed.rewards || [],
    notifications: parsed.notifications || [],
    history: parsed.history || [],
    characters: parsed.characters || [],
    characterNicknames: parsed.characterNicknames || {},
  };
}
function loadStore(): Store {
  try {
    const raw = localStorage.getItem('pinky-store-v1');
    if (!raw) return initialStore;
    const parsed = JSON.parse(raw) as Partial<Store>;
    return normalizeStore(parsed);
  } catch { return initialStore; }
}
function useStore() {
  const [store, setStore] = useState<Store>(loadStore);
  useEffect(() => localStorage.setItem('pinky-store-v1', JSON.stringify(store)), [store]);
  return [store, setStore] as const;
}
function setTheme(theme: Theme) {
  const resolved = theme === 'light' ? 'pink' : theme === 'dark' ? 'night' : theme === 'auto' ? 'pink' : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.classList.toggle('dark', resolved === 'night');
}

function IconForReward({ name, size = 25 }: { name: string; size?: number }) {
  const item = rewardCatalog.find((reward) => reward.name === name);
  const Icon = item?.icon || Gift;
  return <Icon size={size} strokeWidth={1.8} />;
}
function normalizeRarity(value: string): Rarity {
  const rarity = value.toLowerCase();
  return rarity === 'uncommon' || rarity === 'rare' || rarity === 'epic' || rarity === 'legendary' ? rarity : 'common';
}
function BadgeArtwork({ rarity, icon: Icon, locked = false, small = false }: {
  rarity: string;
  icon: typeof Star;
  locked?: boolean;
  small?: boolean;
}) {
  const normalized = normalizeRarity(rarity);
  const BadgeIcon = locked ? CircleHelp : Icon;
  return <div className={`badge-artwork rarity-${normalized} ${locked ? 'badge-locked' : ''} ${small ? 'badge-small' : ''}`}>
    <div className="badge-disc"><BadgeIcon size={small ? 24 : 30} strokeWidth={1.8} /></div>
    <div className="badge-ribbon"><span>{locked ? '?' : normalized[0].toUpperCase()}</span></div>
  </div>;
}
function Button({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return <button className={`btn ${className}`} {...props}>{children}</button>;
}
function Empty({ title, copy, action }: { title: string; copy: string; action?: ReactNode }) {
  return <div className="empty"><div className="empty-icon"><Sparkles size={20} /></div><strong>{title}</strong><p className="small">{copy}</p>{action}</div>;
}
function TaskRow({ task, onToggle, onEdit, onDelete, onSnooze }: { task: Task; onToggle: () => void; onEdit: () => void; onDelete: () => void; onSnooze?: () => void }) {
  return <div className={`task-row ${task.status === 'completed' ? 'done' : ''}`} data-testid={`row-task-${task.id}`}>
    <button className={`check ${task.status === 'completed' ? 'checked' : ''}`} onClick={onToggle} data-testid={`button-complete-task-${task.id}`} aria-label={`Mark ${task.title} ${task.status === 'completed' ? 'open' : 'complete'}`}>{task.status === 'completed' && <Check size={14} />}</button>
    <div style={{ minWidth: 0, flex: 1 }}>
      <div className="task-title" data-testid={`text-task-title-${task.id}`}>{task.title}</div>
      <div className="task-meta"><span className="pill pill-purple">{task.category}</span>{task.date && <span className="pill"><CalendarDays size={11} />{prettyDate(task.date)}</span>}{task.time && <span className="pill"><Clock3 size={11} />{task.time}</span>}{task.priority !== 'none' && <span className={`pill ${task.priority === 'high' ? 'pill-pink' : 'pill-yellow'}`}>{priorityLabel(task.priority)}</span>}</div>
    </div>
    <div className="task-actions">{onSnooze && task.status !== 'completed' && <button className="btn btn-ghost icon-btn" onClick={onSnooze} data-testid={`button-snooze-task-${task.id}`} aria-label={`Snooze ${task.title} to tomorrow`}><Clock3 size={15} /></button>}<button className="btn btn-ghost icon-btn" onClick={onEdit} data-testid={`button-edit-task-${task.id}`} aria-label={`Edit ${task.title}`}><Edit3 size={15} /></button><button className="btn btn-ghost icon-btn" onClick={onDelete} data-testid={`button-delete-task-${task.id}`} aria-label={`Delete ${task.title}`}><Trash2 size={15} /></button></div>
  </div>;
}

function TaskForm({ task, onSave, onClose }: { task?: Task; onSave: (task: Task) => void; onClose: () => void }) {
  const [form, setForm] = useState<TaskDraft>(() => task ? { ...task, tags: task.tags.join(', '), reminderMinutes: task.reminderMinutes ?? '' } : { ...emptyTask(), tags: '', reminderMinutes: '' });
  const update = (key: keyof TaskDraft, value: string | number | null) => setForm((current) => ({ ...current, [key]: value } as TaskDraft));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    onSave({ ...form, title: form.title.trim(), id: task?.id || uid(), createdAt: task?.createdAt || new Date().toISOString(), status: task?.status || 'todo', postponements: task?.postponements || 0, tags: form.tags.split(',').map((tag: string) => tag.trim()).filter(Boolean), durationMinutes: Number(form.durationMinutes), reminderMinutes: form.reminderMinutes === null || form.reminderMinutes === '' ? null : Number(form.reminderMinutes) } as Task);
  };
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="modal" onSubmit={submit} data-testid="form-task">
    <div className="modal-head"><div><div className="eyebrow">{task ? 'Refine your plan' : 'Make room for one thing'}</div><h2>{task ? 'Edit task' : 'Add a task'}</h2></div><button type="button" className="close icon-btn" onClick={onClose} data-testid="button-close-task-form" aria-label="Close task form"><X size={20} /></button></div>
    <div className="form-grid">
      <div className="field wide"><label htmlFor="task-title">Title</label><input id="task-title" autoFocus value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="What would you like to move forward?" data-testid="input-task-title" required /></div>
      <div className="field"><label htmlFor="task-category">Category</label><select id="task-category" value={form.category} onChange={(e) => update('category', e.target.value)} data-testid="select-task-category">{categories.map((item) => <option key={item}>{item}</option>)}</select></div>
      <div className="field"><label htmlFor="task-difficulty">Difficulty</label><select id="task-difficulty" value={form.difficulty} onChange={(e) => update('difficulty', e.target.value)} data-testid="select-task-difficulty">{difficulties.map((item) => <option key={item}>{item}</option>)}</select><small>Selected difficulty awards {difficultyXp(form.difficulty as Difficulty)} XP.</small></div>
      <div className="field"><label htmlFor="task-date">Date</label><input id="task-date" type="date" value={form.date} onChange={(e) => update('date', e.target.value)} data-testid="input-task-date" /></div>
      <div className="field"><label htmlFor="task-time">Time</label><input id="task-time" type="time" value={form.time} onChange={(e) => update('time', e.target.value)} data-testid="input-task-time" /></div>
      <div className="field"><label htmlFor="task-deadline">Deadline</label><input id="task-deadline" type="datetime-local" value={form.deadline} onChange={(e) => update('deadline', e.target.value)} data-testid="input-task-deadline" /></div>
      <div className="field"><label htmlFor="task-reminder">Reminder</label><select id="task-reminder" value={form.reminderMinutes === null ? '' : form.reminderMinutes} onChange={(e) => update('reminderMinutes', e.target.value === '' ? null : Number(e.target.value))} data-testid="select-task-reminder"><option value="">No reminder</option><option value="5">5 minutes before</option><option value="15">15 minutes before</option><option value="30">30 minutes before</option><option value="60">1 hour before</option></select><small>In-app only while PINKY is open.</small></div>
      <div className="field"><label htmlFor="task-priority">Priority</label><select id="task-priority" value={form.priority} onChange={(e) => update('priority', e.target.value)} data-testid="select-task-priority">{priorities.map((item) => <option key={item} value={item}>{priorityLabel(item)}</option>)}</select></div>
      <div className="field"><label htmlFor="task-duration">Focus duration (minutes)</label><input id="task-duration" type="number" min="1" value={form.durationMinutes} onChange={(e) => update('durationMinutes', e.target.value)} data-testid="input-task-duration" /></div>
      <div className="field"><label htmlFor="task-recurrence">Recurrence note</label><select id="task-recurrence" value={form.recurrence} onChange={(e) => update('recurrence', e.target.value)} data-testid="select-task-recurrence"><option value="none">Does not repeat</option><option value="daily">Daily metadata</option><option value="weekly">Weekly metadata</option><option value="monthly">Monthly metadata</option></select><small>Metadata only. PINKY never creates the next task.</small></div>
      <div className="field"><label htmlFor="task-tags">Tags</label><input id="task-tags" value={form.tags} onChange={(e) => update('tags', e.target.value)} placeholder="comma separated" data-testid="input-task-tags" /></div>
      <div className="field wide"><label htmlFor="task-notes">Notes</label><textarea id="task-notes" value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Anything you want beside this task?" data-testid="textarea-task-notes" /></div>
    </div>
    <div className="modal-actions"><Button type="button" className="btn-secondary" onClick={onClose} data-testid="button-cancel-task">Cancel</Button><Button type="submit" className="btn-primary" data-testid="button-save-task"><Check size={16} />Save task</Button></div>
  </form></div>;
}

function Shell({ children, store, unread, onMarkRead, onAdd }: { children: ReactNode; store: Store; unread: number; onMarkRead: () => void; onAdd: () => void }) {
  const [location] = useLocation();
  const nav = [{ href: '/', label: 'Dashboard', icon: Home }, { href: '/tasks', label: 'Tasks', icon: ListChecks }, { href: '/calendar', label: 'Calendar', icon: CalendarDays }, { href: '/focus', label: 'Focus', icon: Focus }, { href: '/rewards', label: 'Rewards', icon: Gift }, { href: '/progress', label: 'Progress', icon: Target }];
  const title = nav.find((item) => item.href === location)?.label || (location === '/settings' ? 'Settings' : 'PINKY');
  const isHome = location === '/';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const streak = streakStats(store.history).current;
  const level = levelProgressFor(store.history.reduce((sum, event) => sum + event.xp, 0)).level;
  return <div className="pinky-shell"><aside className="pinky-sidebar"><div className="brand"><div className="brand-mark" /><div><div className="brand-name">PINKY</div><span className="brand-sub">a little room for you</span></div></div><div className="nav-label">Your space</div><nav className="nav-list">{nav.map(({ href, label, icon: Icon }) => <Link href={href} key={href} className={`nav-link ${location === href ? 'active' : ''}`} data-testid={`link-nav-${label.toLowerCase()}`}><Icon size={17} />{label}</Link>)}</nav><div className="sidebar-spacer" /><div className="sidebar-note"><strong>Made for your pace</strong>Nothing is added here unless you choose it. A small plan is still a plan.</div><Link href="/settings" className={`nav-link ${location === '/settings' ? 'active' : ''}`} data-testid="link-nav-settings"><Settings size={17} />Settings</Link></aside><main className="main-wrap"><header className="topbar"><div><div className="topbar-kicker" style={isHome ? { textTransform: 'uppercase' } : undefined}>{isHome ? `${greeting}, ${store.settings.name || 'Sanvi'}` : `Good to see you, ${store.settings.name || 'Sanvi'}`}</div><div className="topbar-title">{isHome ? `Level ${level} · ${streak} day streak` : title}</div></div><div className="topbar-actions"><button className="btn btn-ghost icon-btn" onClick={onMarkRead} data-testid="button-notifications" aria-label={`${unread} unread notifications`}><Bell size={18} />{unread > 0 && <span className="pill pill-pink" style={{ padding: '2px 5px', position: 'absolute', margin: '-24px 0 0 22px' }}>{unread}</span>}</button><Link href="/settings" className="avatar" data-testid="link-settings-avatar">{(store.settings.name || 'S').slice(0, 1).toUpperCase()}</Link></div></header>{children}<button className="fab" onClick={onAdd} data-testid="button-floating-add-task" aria-label="Add a task"><Plus size={24} /></button><nav className="mobile-nav">{nav.slice(0, 5).map(({ href, label, icon: Icon }) => <Link href={href} key={href} className={location === href ? 'active' : ''} data-testid={`mobile-nav-${label.toLowerCase()}`}><Icon size={17} />{label}</Link>)}</nav></main></div>;
}

function Dashboard({ store, onAdd, onToggle, onEdit, onDelete, onSnooze }: { store: Store; onAdd: () => void; onToggle: (task: Task) => void; onEdit: (task: Task) => void; onDelete: (task: Task) => void; onSnooze?: (task: Task) => void }) {
  const today = dayKey();
  const todayTasks = store.tasks
    .filter((task) => task.date === today)
    .sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed') || a.time.localeCompare(b.time));
  const done = todayTasks.filter((task) => task.status === 'completed').length;
  const percent = todayTasks.length ? Math.round((done / todayTasks.length) * 100) : 0;
  const overdue = store.tasks.filter((task) => task.status === 'todo' && task.date && task.date < today).sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = store.tasks
    .filter((task) => task.status === 'todo' && task.date > today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    .slice(0, 4);
  const renderTask = (task: Task) => <TaskRow
    key={task.id}
    task={task}
    onToggle={() => onToggle(task)}
    onEdit={() => onEdit(task)}
    onDelete={() => onDelete(task)}
    onSnooze={onSnooze ? () => onSnooze(task) : undefined}
  />;

  return <div className="page" data-testid="page-dashboard">
    <section className="card card-pad" style={{ margin: '8px 0 18px' }}>
      <div className="section-head" style={{ marginBottom: 10 }}>
        <div className="eyebrow">Today's progress</div>
      </div>
      <div className="progress-ring-wrap">
        <div className="display" style={{ fontSize: 35, lineHeight: 1, fontWeight: 700 }} data-testid="text-today-progress">{done} / {todayTasks.length}</div>
        <div style={{ flex: 1 }}>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${percent}%` }} /></div>
          <div className="small muted" style={{ marginTop: 5 }}>{percent}% complete</div>
        </div>
      </div>
    </section>

    {overdue.length > 0 && <>
      <div className="section-head" style={{ margin: '19px 0 9px' }}>
        <h2 style={{ fontSize: 16 }}>Needs attention</h2>
        <span className="pill pill-pink">{overdue.length} overdue</span>
      </div>
      <div className="task-list">{overdue.map(renderTask)}</div>
    </>}

    <div className="section-head" style={{ margin: '19px 0 9px' }}>
      <h2 style={{ fontSize: 16 }}>Today's tasks</h2>
      <Link href="/tasks" data-testid="link-dashboard-tasks">See all tasks</Link>
    </div>
    {todayTasks.length
      ? <div className="task-list">{todayTasks.map(renderTask)}</div>
      : <Empty
        title="No tasks for today yet"
        copy="Tap + to add one when you are ready."
        action={<Button className="btn-secondary" onClick={onAdd} data-testid="button-empty-add-task"><Plus size={15} />Add a task</Button>}
      />}

    {upcoming.length > 0 && <>
      <div className="section-head" style={{ margin: '20px 0 9px' }}>
        <h2 style={{ fontSize: 16 }}>Upcoming</h2>
        <Link href="/calendar">Calendar</Link>
      </div>
      <div className="task-list">{upcoming.map(renderTask)}</div>
    </>}
  </div>;
}

function TasksPage({ store, onAdd, onToggle, onEdit, onDelete, onSnooze = () => undefined }: { store: Store; onAdd: () => void; onToggle: (task: Task) => void; onEdit: (task: Task) => void; onDelete: (task: Task) => void; onSnooze?: (task: Task) => void }) {
  const [query, setQuery] = useState(''); const [category, setCategory] = useState('all'); const [status, setStatus] = useState('active'); const [sort, setSort] = useState('date');
  const filtered = useMemo(() => store.tasks.filter((task) => (category === 'all' || task.category === category) && (status === 'all' || (status === 'active' ? task.status === 'todo' : task.status === 'completed')) && `${task.title} ${task.notes} ${task.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : (a.date || '9999').localeCompare(b.date || '9999')), [store.tasks, query, category, status, sort]);
  return <div className="page" data-testid="page-tasks"><div className="page-heading"><div><div className="eyebrow">Your chosen list</div><h1>Tasks</h1><p className="muted">Only what you put here belongs here.</p></div><Button className="btn-primary" onClick={onAdd} data-testid="button-add-task"><Plus size={17} />Add task</Button></div><div className="card card-pad"><div className="toolbar"><div className="search" style={{ position: 'relative' }}><Search size={15} style={{ position: 'absolute', left: 12, top: 13, color: 'hsl(var(--muted-foreground))' }} /><input value={query} onChange={(e) => setQuery(e.target.value)} style={{ paddingLeft: 35 }} placeholder="Search your task list" data-testid="input-search-tasks" /></div><select value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 165 }} data-testid="select-filter-category"><option value="all">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 135 }} data-testid="select-filter-status"><option value="active">Open tasks</option><option value="completed">Completed</option><option value="all">All tasks</option></select><select value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 125 }} data-testid="select-sort-tasks"><option value="date">By date</option><option value="title">By title</option></select></div>{filtered.length ? <div className="task-list">{filtered.map((task) => <TaskRow key={task.id} task={task} onToggle={() => onToggle(task)} onEdit={() => onEdit(task)} onDelete={() => onDelete(task)} onSnooze={() => onSnooze(task)} />)}</div> : <Empty title={store.tasks.length ? 'Nothing matches that view' : 'Your list starts here'} copy={store.tasks.length ? 'Try a different search or filter.' : 'Add your first task when you are ready.'} action={!store.tasks.length && <Button className="btn-secondary" onClick={onAdd} data-testid="button-empty-tasks"><Plus size={15} />Add task</Button>} />}</div></div>;
}

function CalendarPage({ store, onAdd }: { store: Store; onAdd: () => void }) {
  const [cursor, setCursor] = useState(new Date()); const [mode, setMode] = useState<'month' | 'week' | 'day'>('month');
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1); const first = new Date(monthStart); first.setDate(1 - monthStart.getDay()); const cells = Array.from({ length: 42 }, (_, index) => { const date = new Date(first); date.setDate(first.getDate() + index); return date; }); const selectedKey = dayKey(cursor);
  const taskFor = (date: Date) => store.tasks.filter((task) => task.date === dayKey(date));
  return <div className="page" data-testid="page-calendar"><div className="page-heading"><div><div className="eyebrow">Put things somewhere gentle</div><h1>Calendar</h1><p className="muted">A view of the dates you chose for your tasks.</p></div><Button className="btn-primary" onClick={onAdd} data-testid="button-calendar-add-task"><Plus size={17} />Add task</Button></div><div className="card card-pad"><div className="calendar-head"><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><button className="btn btn-secondary icon-btn" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} data-testid="button-calendar-previous" aria-label="Previous period"><ChevronLeft size={17} /></button><h2>{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2><button className="btn btn-secondary icon-btn" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} data-testid="button-calendar-next" aria-label="Next period"><ChevronRight size={17} /></button></div><div className="calendar-actions">{(['month', 'week', 'day'] as const).map((item) => <Button key={item} className={mode === item ? 'btn-primary' : 'btn-secondary'} onClick={() => setMode(item)} data-testid={`button-calendar-${item}`}>{item}</Button>)}</div></div>{mode === 'month' && <div className="calendar-grid"><div className="calendar-cell calendar-weekday">Sun</div><div className="calendar-cell calendar-weekday">Mon</div><div className="calendar-cell calendar-weekday">Tue</div><div className="calendar-cell calendar-weekday">Wed</div><div className="calendar-cell calendar-weekday">Thu</div><div className="calendar-cell calendar-weekday">Fri</div><div className="calendar-cell calendar-weekday">Sat</div>{cells.map((date) => <button key={date.toISOString()} className="calendar-cell" onClick={() => setCursor(date)} data-testid={`calendar-day-${dayKey(date)}`} style={{ textAlign: 'left', opacity: date.getMonth() === cursor.getMonth() ? 1 : .48 }}><div className={`calendar-date ${dayKey(date) === dayKey() ? 'today' : ''}`}>{date.getDate()}</div>{taskFor(date).slice(0, 3).map((task) => <div className="calendar-task" key={task.id}>{task.title}</div>)}</button>)}</div>}{mode === 'day' && <div><div className="eyebrow" style={{ marginBottom: 9 }}>{prettyDate(selectedKey)}</div>{taskFor(cursor).length ? <div className="task-list">{taskFor(cursor).map((task) => <div className="task-row" key={task.id}><CalendarDays size={16} color="hsl(var(--primary))" /><div><strong>{task.title}</strong><div className="small muted">{task.time || 'No time chosen'} · {task.category}</div></div></div>)}</div> : <Empty title="No tasks on this date" copy="Choose another date or add something yourself." action={<Button className="btn-secondary" onClick={onAdd} data-testid="button-day-empty-add"><Plus size={15} />Add task</Button>} />}</div>}{mode === 'week' && <div className="grid" style={{ gridTemplateColumns: 'repeat(7, minmax(0,1fr))' }}>{Array.from({ length: 7 }, (_, index) => { const date = new Date(cursor); date.setDate(cursor.getDate() - cursor.getDay() + index); return <div className="card" style={{ padding: 12, minHeight: 180 }} key={dayKey(date)}><div className="small muted">{date.toLocaleDateString(undefined, { weekday: 'short' })}</div><strong>{date.getDate()}</strong>{taskFor(date).map((task) => <div className="calendar-task" key={task.id}>{task.title}</div>)}</div> })}</div>}</div></div>;
}

function FocusPage({ store, onToggle }: { store: Store; onToggle: (task: Task) => void }) {
  const tasks = store.tasks.filter((task) => task.status === 'todo'); const [selectedId, setSelectedId] = useState(tasks[0]?.id || ''); const selected = tasks.find((task) => task.id === selectedId); const [seconds, setSeconds] = useState((selected?.durationMinutes || 25) * 60); const [running, setRunning] = useState(false); const [finished, setFinished] = useState(false);
  useEffect(() => { if (!running) return; const timer = window.setInterval(() => setSeconds((value) => { if (value <= 1) { setRunning(false); setFinished(true); return 0; } return value - 1; }), 1000); return () => window.clearInterval(timer); }, [running]);
  useEffect(() => { if (selected) { setSeconds(selected.durationMinutes * 60); setFinished(false); setRunning(false); } }, [selectedId]);
  const max = (selected?.durationMinutes || 25) * 60; const progress = max ? ((max - seconds) / max) * 100 : 0;
  return <div className="page" data-testid="page-focus"><div className="page-heading"><div><div className="eyebrow">A pocket of attention</div><h1>Focus</h1><p className="muted">A countdown can hold the time. You decide when the work is complete.</p></div></div><div className="focus-layout"><section className="card card-pad"><div className="section-head"><h2>Choose an existing task</h2><span className="pill">{tasks.length} open</span></div>{tasks.length ? <div className="focus-picker">{tasks.map((task) => <button className={`focus-option ${selectedId === task.id ? 'selected' : ''}`} onClick={() => setSelectedId(task.id)} key={task.id} data-testid={`button-focus-task-${task.id}`}><strong>{task.title}</strong><div className="small muted">{task.durationMinutes} minutes · {task.category}</div></button>)}</div> : <Empty title="No open tasks yet" copy="Add a task before starting a focus session." />}</section><section className="card timer-card">{selected ? <><div className="timer-ring" style={{ '--timer-progress': `${progress}%` } as CSSProperties}><div className="timer-content"><div className="eyebrow">{finished ? 'Time is held' : running ? 'In the pocket' : 'Ready when you are'}</div><div className="timer" data-testid="text-focus-timer">{`${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`}</div><div className="small muted">{selected.title}</div></div></div><div className="timer-actions">{running ? <Button className="btn-secondary" onClick={() => setRunning(false)} data-testid="button-pause-focus"><Pause size={16} />Pause</Button> : <Button className="btn-primary" onClick={() => { setFinished(false); setRunning(true); }} data-testid="button-start-focus"><Play size={16} />{finished ? 'Start again' : 'Start focus'}</Button>}<Button className="btn-secondary" onClick={() => { setSeconds(max); setFinished(false); setRunning(false); }} data-testid="button-reset-focus"><RotateCcw size={16} />Reset</Button>{!finished && <Button className="btn-secondary" onClick={() => onToggle(selected)} data-testid="button-focus-complete"><Check size={16} />Complete manually</Button>}</div></> : <Empty title="Choose a task" copy="Focus only works with a task you explicitly created." />}</section></div></div>;
}

function RewardsCollectionPage({ store, setStore }: { store: Store; setStore: Dispatch<SetStateAction<Store>> }) {
  const totalXp = store.history.reduce((sum, event) => sum + event.xp, 0);
  const level = levelProgressFor(totalXp);
  const streak = streakStats(store.history);
  const hearts = store.rewards.filter((reward) => reward.category === 'hearts' || reward.category === 'heart' || reward.name.includes('Heart')).length;
  const stars = store.rewards.filter((reward) => reward.category === 'stars' || reward.category === 'star' || reward.name === 'Star').length;
  const special = store.rewards.filter((reward) => reward.category === 'special' || ['Gem', 'Magic Wand', 'Legendary Crown'].includes(reward.name)).length;
  const unlockedIds = new Set(store.characters.map((character) => character.id));
  const saveNickname = (characterId: string, nickname: string) => setStore((current) => ({
    ...current,
    characterNicknames: { ...current.characterNicknames, [characterId]: nickname },
  }));

  return <div className="page" data-testid="page-rewards">
    <div className="page-heading rewards-heading">
      <div><div className="eyebrow">Your collection</div><h1><Heart size={22} fill="currentColor" />My Rewards</h1></div>
      <div className="pill pill-pink"><Gift size={13} />{store.rewards.length} collected</div>
    </div>

    <section className="card card-pad reward-summary" data-testid="card-reward-summary">
      <div><strong>XP:</strong> {level.xp} / {level.needed}</div>
      <div className="xp-bar-bg"><div className="xp-bar-fill" style={{ width: `${level.percent}%` }} /></div>
      <div className="reward-level">LEVEL {level.level}</div>
      <div className="reward-counts">
        <span><Heart size={14} />Hearts: {hearts}</span>
        <span><Star size={14} />Stars: {stars}</span>
        <span><GemIcon />Special: {special}</span>
      </div>
      <div className="small muted">Collection: {store.rewards.length} / 100</div>
    </section>

    <section className="card card-pad streak-card" data-testid="card-reward-streak">
      <div className="streak-title"><Zap size={17} />{streak.current} DAY STREAK</div>
      <div className="small muted">
        {streak.current > 0
          ? "You've been showing up for yourself."
          : 'No worries. Your progress still counts. Ready when you are?'}
      </div>
      <div className="small muted">Longest streak: {streak.longest} days</div>
    </section>

    <div className="section-head rewards-section-heading"><h2>My Army Collection</h2></div>
    <div className="collectible-grid" data-testid="grid-reward-collection">
      {Array.from({ length: 24 }, (_, index) => {
        const earned = store.rewards[index];
        if (!earned) return <div className="collectible collectible-locked" key={`locked-${index}`} data-testid={`slot-reward-locked-${index + 1}`}>
          <BadgeArtwork rarity="common" icon={CircleHelp} locked />
          <span className="rarity-label">Locked</span>
        </div>;
        const definition = rewardCatalog.find((reward) => reward.name === earned.name);
        return <div className="collectible" key={earned.id} data-testid={`slot-reward-${index + 1}`}>
          <BadgeArtwork rarity={definition?.rarity || earned.rarity} icon={definition?.icon || Gift} />
          <span className="rarity-label">{earned.name}</span>
        </div>;
      })}
    </div>

    <div className="section-head rewards-section-heading"><h2>Character Cards</h2></div>
    <div className="character-grid" data-testid="grid-character-cards">
      {characterCatalog.map((character) => {
        const unlocked = unlockedIds.has(character.id);
        return <div className={`character-card ${unlocked ? '' : 'character-locked'}`} key={character.id} data-testid={`card-character-${character.id}`}>
          <BadgeArtwork rarity="epic" icon={character.icon} small locked={!unlocked} />
          <div className="character-name">{unlocked ? character.name : '???'}</div>
          <div className="character-role">{unlocked ? character.role : 'Locked'}</div>
          {unlocked && <input
            className="character-nickname"
            value={store.characterNicknames[character.id] || ''}
            onChange={(event) => saveNickname(character.id, event.target.value)}
            placeholder="add a nickname..."
            aria-label={`Nickname for ${character.name}`}
            maxLength={24}
            data-testid={`input-character-nickname-${character.id}`}
          />}
        </div>;
      })}
    </div>
  </div>;
}

function GemIcon() {
  return <span className="reward-gem-icon" aria-hidden="true"><Award size={14} /></span>;
}

function ProgressPage({ store }: { store: Store }) {
  const completed = store.tasks.filter((task) => task.status === 'completed');
  const xp = store.history.reduce((sum, item) => sum + item.xp, 0);
  const todayDone = completed.filter((task) => task.completedAt?.slice(0, 10) === dayKey()).length;
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekDone = completed.filter((task) => task.completedAt && new Date(task.completedAt) >= weekStart).length;
  const streak = streakStats(store.history).current;
  const byCategory = categories.map((category) => ({ category, count: completed.filter((task) => task.category === category).length })).filter((item) => item.count > 0);
  const level = levelProgressFor(xp);

  return <div className="page" data-testid="page-progress">
    <div className="page-heading">
      <div><div className="eyebrow">Your real pattern</div><h1>Progress</h1><p className="muted">A mirror of what you actually completed, never a prediction.</p></div>
      <div className="pill pill-yellow"><Zap size={13} />Level {level.level}</div>
    </div>
    <div className="grid metric-grid">
      <div className="card metric-card"><div className="muted small">Today</div><div className="metric-number" data-testid="metric-today">{todayDone}</div><div className="small muted">completed tasks</div></div>
      <div className="card metric-card"><div className="muted small">This week</div><div className="metric-number" data-testid="metric-week">{weekDone}</div><div className="small muted">completed tasks</div></div>
      <div className="card metric-card"><div className="muted small">Current streak</div><div className="metric-number" data-testid="metric-streak">{streak}</div><div className="small muted">days with a win</div></div>
      <div className="card metric-card"><div className="muted small">XP bank</div><div className="metric-number" data-testid="metric-xp">{xp}</div><div className="small muted">Level {level.level} · {level.xp}/{level.needed} to next</div><div className="progress-track" style={{ marginTop: 13 }}><div className="progress-fill" style={{ width: `${level.percent}%` }} /></div></div>
      <div className="card metric-card"><div className="muted small">Completion rate</div><div className="metric-number" data-testid="metric-completion-rate">{store.tasks.length ? Math.round(completed.length / store.tasks.length * 100) : 0}%</div><div className="small muted">of all chosen tasks</div></div>
      <div className="card metric-card"><div className="muted small">Collectibles</div><div className="metric-number" data-testid="metric-collectibles">{store.rewards.length}</div><div className="small muted">{rewardCatalog.length} collectible types</div></div>
    </div>
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(280px,.75fr)', marginTop: 16 }}>
      <section className="card card-pad">
        <div className="section-head"><h2>By category</h2><BarChartIcon /></div>
        {byCategory.length
          ? <div className="bar-list">{byCategory.map((item) => <div className="bar-row" key={item.category}><span>{item.category}</span><div className="progress-track"><div className="progress-fill" style={{ width: `${Math.min(100, item.count / Math.max(...byCategory.map((entry) => entry.count)) * 100)}%` }} /></div><strong>{item.count}</strong></div>)}</div>
          : <Empty title="Your pattern is still unwritten" copy="Complete a task to see your chosen categories take shape." />}
      </section>
      <section className="card card-pad">
        <div className="section-head"><h2>How XP works</h2><CircleHelp size={18} color="hsl(var(--primary))" /></div>
        <div className="small muted" style={{ lineHeight: 1.7 }}>
          <p style={{ marginTop: 0 }}><strong>Easy</strong> tasks add 5 XP.</p>
          <p><strong>Medium</strong> tasks add 10 XP.</p>
          <p><strong>Hard</strong> tasks add 20 XP.</p>
          <p><strong>High priority</strong> adds a clearly marked +15 bonus when you choose it yourself.</p>
        </div>
      </section>
    </div>
  </div>;
}
function BarChartIcon() { return <div style={{ display: 'flex', gap: 3, alignItems: 'end', height: 20, color: 'hsl(var(--primary))' }}><span style={{ height: 8, width: 4, background: 'currentColor', borderRadius: 3 }} /><span style={{ height: 14, width: 4, background: 'currentColor', borderRadius: 3 }} /><span style={{ height: 20, width: 4, background: 'currentColor', borderRadius: 3 }} /></div>; }

function SettingsPage({ store, setStore, onDisablePush }: { store: Store; setStore: Dispatch<SetStateAction<Store>>; onDisablePush: () => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null); const [saved, setSaved] = useState(false); const saveSettings = (patch: Partial<Settings>) => { setStore((current) => ({ ...current, settings: { ...current.settings, ...patch } })); setSaved(true); window.setTimeout(() => setSaved(false), 1400); };
  const exportData = () => { const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'pinky-data.json'; anchor.click(); URL.revokeObjectURL(url); };
  const importData = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const parsed = JSON.parse(String(reader.result)) as Partial<Store>; if (parsed.tasks && parsed.settings) setStore(normalizeStore(parsed)); } catch { window.alert('That file could not be read as PINKY data.'); } }; reader.readAsText(file); event.target.value = ''; };
  const clearData = () => { if (window.confirm('Clear all PINKY tasks, rewards, notifications and progress? This cannot be undone.')) { if (store.settings.pushNotificationsEnabled) void onDisablePush(); setStore(initialStore); } };
  const toggle = (key: 'animationsEnabled' | 'soundsEnabled' | 'notificationsEnabled') => saveSettings({ [key]: !store.settings[key] });
  return <div className="page" data-testid="page-settings"><div className="page-heading"><div><div className="eyebrow">Make it feel like yours</div><h1>Settings</h1><p className="muted">Your preferences and your data stay on this device.</p></div>{saved && <span className="pill pill-pink" data-testid="status-settings-saved"><Check size={13} />Saved</span>}</div><section className="card card-pad"><div className="setting-section"><div><div className="setting-title">Your name</div><div className="setting-desc">Used in your private PINKY welcome.</div></div><div className="setting-controls"><input value={store.settings.name} onChange={(e) => saveSettings({ name: e.target.value })} aria-label="Your name" data-testid="input-settings-name" /></div></div><div className="setting-section"><div><div className="setting-title">Appearance</div><div className="setting-desc">Pick the atmosphere that helps this space feel like yours.</div></div><div className="setting-controls"><select value={store.settings.theme === 'light' ? 'pink' : store.settings.theme === 'dark' ? 'night' : store.settings.theme} onChange={(e) => { const theme = e.target.value as Theme; saveSettings({ theme }); setTheme(theme); }} data-testid="select-settings-theme"><option value="pink">Pink morning</option><option value="lavender">Lavender bloom</option><option value="pastel">Pastel sky</option><option value="night">Night plum</option></select></div></div><div className="setting-section"><div><div className="setting-title">Gentle controls</div><div className="setting-desc">PINKY respects your sensory preferences. Sound is opt-in and currently silent by default.</div></div><div className="setting-controls">{([['animationsEnabled', 'Animations'], ['soundsEnabled', 'Sound cues'], ['notificationsEnabled', 'In-app reminders']] as const).map(([key, label]) => <div className="switch-row" key={key}><span className="small">{label}</span><button className={`switch ${store.settings[key] ? 'on' : ''}`} onClick={() => toggle(key)} aria-label={`Toggle ${label}`} data-testid={`switch-settings-${key}`}><span /></button></div>)}</div></div><div className="setting-section"><div><div className="setting-title">Daily goal</div><div className="setting-desc">Only a target you set for yourself. PINKY never adds tasks to reach it.</div></div><div className="setting-controls"><input type="number" min="1" max="50" value={store.settings.dailyGoal} onChange={(e) => saveSettings({ dailyGoal: Math.max(1, Number(e.target.value)) })} aria-label="Daily goal" data-testid="input-settings-daily-goal" /></div></div><div className="setting-section"><div><div className="setting-title">Your data</div><div className="setting-desc">Export a portable JSON copy, import one, or clear this device.</div></div><div className="setting-controls" style={{ flexDirection: 'row', flexWrap: 'wrap' }}><Button className="btn-secondary" onClick={exportData} data-testid="button-export-data"><Download size={15} />Export JSON</Button><Button className="btn-secondary" onClick={() => fileRef.current?.click()} data-testid="button-import-data"><Upload size={15} />Import JSON</Button><input ref={fileRef} type="file" accept="application/json" onChange={importData} hidden data-testid="input-import-data" /><Button className="btn-danger" onClick={clearData} data-testid="button-clear-data"><Trash2 size={15} />Clear all data</Button></div></div></section></div>;
}

function PushNotificationsCard({ enabled, status, message, busy, onEnable, onDisable }: {
  enabled: boolean;
  status: PushStatus;
  message: string;
  busy: boolean;
  onEnable: () => Promise<void>;
  onDisable: () => Promise<void>;
}) {
  const unavailable = status === 'unsupported' || status === 'denied';
  return <div className="page push-settings-page" data-testid="page-browser-notifications"><section className="card card-pad">
    <div className="setting-section">
      <div>
        <div className="setting-title">Browser notifications</div>
        <div className="setting-desc">Optional alerts for reminders on tasks you created. PINKY never invents tasks or sends other notifications.</div>
        <div className="setting-desc">{message}</div>
        <div className="setting-desc">On iPhone or iPad, add PINKY to your Home Screen before enabling alerts.</div>
      </div>
      <div className="setting-controls">
        {enabled
          ? <Button className="btn-secondary" onClick={() => void onDisable()} disabled={busy} data-testid="button-disable-push"><Bell size={15} />Turn off browser alerts</Button>
          : <Button className="btn-primary" onClick={() => void onEnable()} disabled={busy || unavailable} data-testid="button-enable-push"><Bell size={15} />{busy ? 'Setting up…' : 'Enable browser alerts'}</Button>}
      </div>
    </div>
  </section></div>;
}

function SettingsScreen({ store, setStore, pushStatus, pushMessage, pushBusy, onEnablePush, onDisablePush }: {
  store: Store;
  setStore: Dispatch<SetStateAction<Store>>;
  pushStatus: PushStatus;
  pushMessage: string;
  pushBusy: boolean;
  onEnablePush: () => Promise<void>;
  onDisablePush: () => Promise<void>;
}) {
  return <div className="settings-composite">
    <SettingsPage store={store} setStore={setStore} onDisablePush={onDisablePush} />
    <PushNotificationsCard
      enabled={store.settings.pushNotificationsEnabled}
      status={pushStatus}
      message={pushMessage}
      busy={pushBusy}
      onEnable={onEnablePush}
      onDisable={onDisablePush}
    />
  </div>;
}

function Router() {
  const [store, setStore] = useStore(); const [modal, setModal] = useState<Task | 'new' | null>(null); const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [clientId] = useState(getPushClientId);
  const [pushStatus, setPushStatus] = useState<PushStatus>(() => browserSupportsPush() ? 'ready' : 'unsupported');
  const [pushMessage, setPushMessage] = useState(pushSupportMessage);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushReady, setPushReady] = useState(false);
  const reminderSyncQueue = useRef<Promise<unknown>>(Promise.resolve());

  const enablePush = async () => {
    setPushBusy(true);
    setPushMessage('Setting up browser alerts…');
    try {
      if (!browserSupportsPush()) {
        setPushStatus('unsupported');
        setPushMessage(pushSupportMessage());
        return;
      }
      if (Notification.permission === 'denied') {
        setPushStatus('denied');
        setPushMessage('Notifications are blocked for this site. Change the site permission in your browser settings, then return here.');
        return;
      }
      const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushStatus(permission === 'denied' ? 'denied' : 'ready');
        setPushMessage(permission === 'denied'
          ? 'Notifications are blocked for this site. Change the site permission in your browser settings, then return here.'
          : 'No permission was granted. PINKY will not send browser alerts.');
        return;
      }

      const config = await getPushConfig();
      const { scope, scriptUrl } = pushWorkerLocation();
      const registration = await navigator.serviceWorker.getRegistration(scope)
        || await navigator.serviceWorker.register(scriptUrl, { scope });
      await navigator.serviceWorker.ready;
      const subscription = await getOrCreatePushSubscription(registration, config.publicKey);
      await savePushSubscription({
        clientId,
        subscription: serializePushSubscription(subscription),
      });

      setStore((current) => ({
        ...current,
        settings: { ...current.settings, pushNotificationsEnabled: true },
      }));
      setPushReady(true);
      setPushStatus('enabled');
      setPushMessage('Browser alerts are enabled for your future task reminders.');
    } catch (error) {
      setPushStatus('error');
      setPushMessage(error instanceof Error ? error.message : 'PINKY could not enable browser alerts.');
    } finally {
      setPushBusy(false);
    }
  };

  const disablePush = async () => {
    setPushBusy(true);
    setPushReady(false);
    try {
      await reminderSyncQueue.current.catch(() => undefined);
      const { scope } = pushWorkerLocation();
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration(scope);
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          const endpoint = subscription.endpoint;
          await subscription.unsubscribe();
          await removePushSubscription({ clientId, endpoint });
        }
      }
      await replacePushReminders({ clientId, reminders: [] });
      setPushMessage('Browser alerts are off. PINKY will not send background reminders.');
      setPushStatus(browserSupportsPush() ? 'ready' : 'unsupported');
    } catch (error) {
      setPushStatus('error');
      setPushMessage(error instanceof Error
        ? `Alerts were turned off on this device, but PINKY could not finish server cleanup: ${error.message}`
        : 'Alerts were turned off on this device, but PINKY could not finish server cleanup.');
    } finally {
      setStore((current) => ({
        ...current,
        settings: { ...current.settings, pushNotificationsEnabled: false },
      }));
      setPushBusy(false);
    }
  };

  const rewardsSetStore = useRef(setStore);
  rewardsSetStore.current = setStore;
  const RewardsPage = useMemo(() => function RewardsPageRoute({ store: pageStore }: { store: Store }) {
    return <RewardsCollectionPage store={pageStore} setStore={rewardsSetStore.current} />;
  }, []);

  const settingsPushProps = useRef({
    pushStatus,
    pushMessage,
    pushBusy,
    onEnablePush: enablePush,
    onDisablePush: disablePush,
  });
  settingsPushProps.current = {
    pushStatus,
    pushMessage,
    pushBusy,
    onEnablePush: enablePush,
    onDisablePush: disablePush,
  };
  const SettingsPage = useMemo(() => function SettingsPage({
    store: pageStore,
    setStore: pageSetStore,
  }: { store: Store; setStore: Dispatch<SetStateAction<Store>> }) {
    return <SettingsScreen
      store={pageStore}
      setStore={pageSetStore}
      {...settingsPushProps.current}
    />;
  }, []);

  useEffect(() => {
    if (!browserSupportsPush()) {
      setPushStatus('unsupported');
      setPushMessage(pushSupportMessage());
      return;
    }
    if (Notification.permission === 'denied') {
      setPushStatus('denied');
      setPushMessage('Notifications are blocked for this site. Change the site permission in your browser settings to enable them.');
      return;
    }
    if (!store.settings.pushNotificationsEnabled) {
      setPushStatus('ready');
      setPushMessage(pushSupportMessage());
      return;
    }

    let active = true;
    void (async () => {
      try {
        const { scope, scriptUrl } = pushWorkerLocation();
        const registration = await navigator.serviceWorker.getRegistration(scope)
          || await navigator.serviceWorker.register(scriptUrl, { scope });
        const config = await getPushConfig();
        const subscription = await getOrCreatePushSubscription(registration, config.publicKey);
        await savePushSubscription({
          clientId,
          subscription: serializePushSubscription(subscription),
        });
        if (active) {
          setPushReady(true);
          setPushStatus('enabled');
          setPushMessage('Browser alerts are enabled for your future task reminders.');
        }
      } catch (error) {
        if (active) {
          setPushReady(false);
          setPushStatus('error');
          setPushMessage(error instanceof Error ? error.message : 'PINKY could not restore browser alerts.');
        }
      }
    })();
    return () => { active = false; };
  }, [store.settings.pushNotificationsEnabled, clientId, setStore]);

  useEffect(() => {
    if (!pushReady) return;
    const reminders = scheduledPushReminders(store.tasks);
    reminderSyncQueue.current = reminderSyncQueue.current
      .catch(() => undefined)
      .then(() => replacePushReminders({ clientId, reminders }))
      .then(({ scheduled }) => {
        setPushMessage(scheduled
          ? `${scheduled} future task reminder${scheduled === 1 ? '' : 's'} will arrive as browser alerts.`
          : 'Browser alerts are on. No future task reminders are currently scheduled.');
      })
      .catch((error: unknown) => {
        setPushStatus('error');
        setPushMessage(error instanceof Error ? error.message : 'PINKY could not sync your task reminders.');
      });
  }, [clientId, pushReady, store.tasks]);

  useEffect(() => { setTheme(store.settings.theme); document.documentElement.classList.toggle('no-motion', !store.settings.animationsEnabled); }, [store.settings.theme, store.settings.animationsEnabled]);
  useEffect(() => { if (!store.settings.notificationsEnabled) return; const check = () => { const now = new Date(); store.tasks.filter((task) => task.status === 'todo' && task.date && task.time && task.reminderMinutes !== null).forEach((task) => { const target = new Date(`${task.date}T${task.time}`); const reminderAt = new Date(target.getTime() - task.reminderMinutes! * 60000); const noticeId = `reminder-${task.id}-${task.date}`; if (now >= reminderAt && now < target && !store.notifications.some((notice) => notice.id === noticeId)) setStore((current) => ({ ...current, notifications: [...current.notifications, { id: noticeId, message: `Reminder: ${task.title} is coming up.`, createdAt: now.toISOString(), read: false }] })); }); }; check(); const timer = window.setInterval(check, 30000); return () => window.clearInterval(timer); }, [store.settings.notificationsEnabled, store.tasks, store.notifications, setStore]);
  const unread = store.notifications.filter((notice) => !notice.read).length;
  const markRead = () => setStore((current) => ({ ...current, notifications: current.notifications.map((notice) => ({ ...notice, read: true })) }));
  const saveTask = (task: Task) => { setStore((current) => ({ ...current, tasks: current.tasks.some((item) => item.id === task.id) ? current.tasks.map((item) => item.id === task.id ? task : item) : [...current.tasks, task] })); setModal(null); };
  const deleteTask = (task: Task) => { if (window.confirm(`Delete “${task.title}”?`)) setStore((current) => ({ ...current, tasks: current.tasks.filter((item) => item.id !== task.id) })); };
  const snoozeTask = (task: Task) => { const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); setStore((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, date: dayKey(tomorrow), postponements: item.postponements + 1 } : item) })); };
  const quickAdd = (title: string) => { const draft = emptyTask(); setStore((current) => ({ ...current, tasks: [...current.tasks, { ...draft, title, id: uid(), createdAt: new Date().toISOString(), status: 'todo', postponements: 0 } as Task] })); };
  useEffect(() => { const receiveQuickAdd = (event: Event) => quickAdd((event as CustomEvent<string>).detail); window.addEventListener('pinky-quick-add', receiveQuickAdd); return () => window.removeEventListener('pinky-quick-add', receiveQuickAdd); }, []);
  const toggleTask = (task: Task) => {
    if (task.status === 'completed') {
      setStore((current) => ({
        ...current,
        tasks: current.tasks.map((item) => item.id === task.id ? { ...item, status: 'todo', completedAt: undefined } : item),
        history: current.history.filter((event) => event.taskId !== task.id),
      }));
      return;
    }
    if (store.history.some((event) => event.taskId === task.id)) {
      setStore((current) => ({
        ...current,
        tasks: current.tasks.map((item) => item.id === task.id ? { ...item, status: 'completed', completedAt: new Date().toISOString() } : item),
      }));
      return;
    }

    const now = new Date().toISOString();
    const date = dayKey();
    const xp = difficultyXp(task.difficulty) + (task.priority === 'high' ? 15 : 0);
    const historyEvent: ProgressEvent = { id: uid(), taskId: task.id, date, xp, category: task.category };
    const nextHistory = [...store.history, historyEvent];
    const streak = streakStats(nextHistory).current;
    const milestoneNames: Record<number, string> = { 3: 'Star', 7: 'Purple Heart', 14: 'Moon', 30: 'Legendary Crown' };
    const milestoneDefinition = rewardCatalog.find((reward) => reward.name === milestoneNames[streak]);
    const rewardDefinition = rollReward(task.priority === 'high');
    const allToday = store.tasks.filter((item) => item.date === date);
    const perfectDay = allToday.length > 0 && allToday.every((item) => item.id === task.id || item.status === 'completed');
    const perfectDefinition = perfectDay ? rollReward(true) : undefined;
    const availableCharacters = characterCatalog.filter((character) => !store.characters.some((unlocked) => unlocked.id === character.id));
    const unlockedCharacter = availableCharacters.length > 0 && Math.random() < 0.12
      ? availableCharacters[Math.floor(Math.random() * availableCharacters.length)]
      : undefined;
    const makeReward = (definition: RewardDefinition, source: string): Reward => ({
      id: uid(),
      name: definition.name,
      category: definition.category,
      rarity: definition.rarity,
      earnedAt: now,
      source,
    });
    const reward = makeReward(rewardDefinition, `Completed: ${task.title}`);
    const milestoneReward = milestoneDefinition ? makeReward(milestoneDefinition, `${streak}-day streak milestone`) : undefined;
    const perfectReward = perfectDefinition ? makeReward(perfectDefinition, 'Perfect day bonus') : undefined;
    const earnedRewards = [reward, milestoneReward, perfectReward].filter((item): item is Reward => Boolean(item));

    setStore((current) => ({
      ...current,
      tasks: current.tasks.map((item) => item.id === task.id ? { ...item, status: 'completed', completedAt: now } : item),
      rewards: [...current.rewards, ...earnedRewards],
      history: nextHistory,
      characters: unlockedCharacter
        ? [...current.characters, { id: unlockedCharacter.id, unlockedAt: now }]
        : current.characters,
    }));
    setCelebration({
      reward,
      xp,
      character: unlockedCharacter,
      milestoneReward,
      perfectReward,
      purpleBox: Math.random() < 0.28 || task.priority === 'high',
    });
    window.setTimeout(() => setCelebration(null), 4800);
  };
  const shell = (children: ReactNode) => <Shell store={store} unread={unread} onMarkRead={markRead} onAdd={() => setModal('new')}>{children}</Shell>;
  return <RoutedErrorBoundary><Switch><Route path="/"><>{shell(<Dashboard store={store} onAdd={() => setModal('new')} onToggle={toggleTask} onEdit={setModal} onDelete={deleteTask} />)}</></Route><Route path="/tasks"><>{shell(<TasksPage store={store} onAdd={() => setModal('new')} onToggle={toggleTask} onEdit={setModal} onDelete={deleteTask} />)}</></Route><Route path="/calendar"><>{shell(<CalendarPage store={store} onAdd={() => setModal('new')} />)}</></Route><Route path="/focus"><>{shell(<FocusPage store={store} onToggle={toggleTask} />)}</></Route><Route path="/rewards"><>{shell(<RewardsPage store={store} />)}</></Route><Route path="/progress"><>{shell(<ProgressPage store={store} />)}</></Route><Route path="/settings"><>{shell(<SettingsPage store={store} setStore={setStore} />)}</></Route><Route component={NotFound} /></Switch>{modal && <TaskForm task={modal === 'new' ? undefined : modal} onSave={saveTask} onClose={() => setModal(null)} />}{celebration && <div className="toast-celebration" data-testid="toast-task-complete"><strong><Sparkles size={15} style={{ verticalAlign: 'middle', marginRight: 5 }} />Task complete</strong><p>+{celebration.xp} XP and a new {celebration.reward.name} collectible joined your shelf.</p></div>}</RoutedErrorBoundary>;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) { const [location] = useLocation(); return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>; }
function App() { return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>; }
export default App;