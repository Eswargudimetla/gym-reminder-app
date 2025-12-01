// js/store.js
// Local storage for reminders + helpers for Gym sessions by weekday.
// Existing API kept: getItems(), saveItems(items), toggleComplete(id), updateItem(id,label,time), deleteItem(id)

const KEY = 'gym_app_items_v1';

// -------------------- basic CRUD --------------------
export function getItems() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveItems(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function toggleComplete(id) {
  const all = getItems();
  const i = all.findIndex(x => x.id === id);
  if (i >= 0) {
    all[i].completed = !all[i].completed;
    saveItems(all);
  }
}

export function updateItem(id, label, time) {
  const all = getItems();
  const i = all.findIndex(x => x.id === id);
  if (i >= 0) {
    all[i].label = label ?? all[i].label;
    if (time) all[i].time = new Date(time).toISOString();
    saveItems(all);
    return all[i];
  }
  return null;
}

export function deleteItem(id) {
  const all = getItems().filter(x => x.id !== id);
  saveItems(all);
}

// -------------------- helpers: ids, time --------------------
function nextId() {
  return Date.now() + Math.floor(Math.random() * 1000);
}

function zeroSeconds(d) {
  const c = new Date(d);
  c.setSeconds(0, 0);
  return c;
}

function setTimeOfDay(baseDate, refTime) {
  // copy hours/minutes from refTime into baseDate
  const d = new Date(baseDate);
  d.setHours(refTime.getHours(), refTime.getMinutes(), 0, 0);
  return d;
}

const IDX_TO_BYDAY = ['SU','MO','TU','WE','TH','FR','SA'];
const BYDAY_TO_IDX = { SU:0, MO:1, TU:2, WE:3, TH:4, FR:5, SA:6 };

function nextOccurrenceFor(byday, refTime, from = new Date()) {
  // returns Date of next occurrence of weekday `byday` (MO..SU) using refTime's hour/minute
  const targetDow = BYDAY_TO_IDX[byday];
  const base = new Date(from);
  let diff = (targetDow - base.getDay() + 7) % 7;
  let d = new Date(base);
  d.setDate(d.getDate() + diff);
  d = setTimeOfDay(d, refTime);
  d = zeroSeconds(d);
  if (d <= from) {
    d.setDate(d.getDate() + 7);
  }
  return d;
}

// -------------------- new: Gym session upserts --------------------
export function upsertGymSessions({ bydays, baseTime, workouts = [] }) {
  const all = getItems();
  const out = [];

  // If DAILY, expand to MO..SU
  let days = [...bydays];
  if (days.length === 1 && days[0] === 'DAILY') days = ['MO','TU','WE','TH','FR','SA','SU'];

  days.forEach(day => {
    // find an existing Gym on that BYDAY (we store byday on item.meta)
    let item = all.find(x => x.label === 'Gym' && x.meta?.byday === day);

    const when = nextOccurrenceFor(day, baseTime, new Date());
    if (!item) {
      item = {
        id: nextId(),
        label: 'Gym',
        details: workouts.length ? workouts.join(', ') : null,
        workouts,
        time: when.toISOString(),
        completed: false,
        meta: {
          byday: day,          // our key for the weekday
          rrule: `FREQ=WEEKLY;BYDAY=${day};BYHOUR=${when.getHours()};BYMINUTE=${when.getMinutes()}`
        }
      };
      all.push(item);
    } else {
      // update time-of-day and workouts
      item.time = when.toISOString();
      if (workouts.length) {
        const merged = mergeUnique((item.workouts || fromDetails(item.details)), workouts);
        item.workouts = merged;
        item.details = merged.length ? merged.join(', ') : null;
      }
      item.meta = item.meta || {};
      item.meta.byday = day;
      item.meta.rrule = `FREQ=WEEKLY;BYDAY=${day};BYHOUR=${when.getHours()};BYMINUTE=${when.getMinutes()}`;
      item.completed = false;
    }
    out.push(item);
  });

  saveItems(all);
  return out;
}

// replace whole workouts list for a day
export function replaceWorkoutsForDay(label, byday, workouts) {
  const all = getItems();
  const changed = [];

  all.forEach(item => {
    if (item.label === label && item.meta?.byday === byday) {
      item.workouts = [...workouts];
      item.details = workouts.length ? workouts.join(', ') : null;
      item.completed = false;
      changed.push(item);
    }
  });

  saveItems(all);
  return changed;
}

export function addWorkoutsToDay(label, byday, workouts) {
  const all = getItems();
  const changed = [];

  all.forEach(item => {
    if (item.label === label && item.meta?.byday === byday) {
      const base = item.workouts || fromDetails(item.details);
      const merged = mergeUnique(base, workouts);
      item.workouts = merged;
      item.details = merged.length ? merged.join(', ') : null;
      item.completed = false;
      changed.push(item);
    }
  });

  saveItems(all);
  return changed;
}

export function removeWorkoutsFromDay(label, byday, workouts) {
  const all = getItems();
  const changed = [];

  all.forEach(item => {
    if (item.label === label && item.meta?.byday === byday) {
      const base = item.workouts || fromDetails(item.details);
      const filtered = base.filter(x => !hasCaseInsensitive(workouts, x));
      item.workouts = filtered;
      item.details = filtered.length ? filtered.join(', ') : null;
      changed.push(item);
    }
  });

  saveItems(all);
  return changed;
}

export function changeTimeForDay(label, byday, newTime) {
  const all = getItems();
  const changed = [];

  all.forEach(item => {
    if (item.label === label && item.meta?.byday === byday) {
      const next = nextOccurrenceFor(byday, newTime, new Date());
      item.time = next.toISOString();
      item.completed = false;
      item.meta = item.meta || {};
      item.meta.rrule = `FREQ=WEEKLY;BYDAY=${byday};BYHOUR=${next.getHours()};BYMINUTE=${next.getMinutes()}`;
      changed.push(item);
    }
  });

  saveItems(all);
  return changed;
}

export function removeGymDay(byday) {
  const all = getItems();
  const removed = all.filter(x => x.label === 'Gym' && x.meta?.byday === byday);
  const keep = all.filter(x => !(x.label === 'Gym' && x.meta?.byday === byday));
  saveItems(keep);
  return removed;
}

// Mark only the next instance (today or tomorrow) completed; keep recurring future
export function skipGymOnce(when = 'today') {
  const all = getItems();
  const targetDay = when === 'tomorrow' ? dayKeyOfDate(daysFromNow(1)) : dayKeyOfDate(new Date());
  const changed = [];

  all.forEach(item => {
    if (item.label !== 'Gym') return;
    if (item.meta?.byday !== targetDay) return;

    // if scheduled for "today" (time>=now) or "tomorrow"
    const t = new Date(item.time);
    if ((when === 'today' && isSameDate(t, new Date())) ||
        (when === 'tomorrow' && isSameDate(t, daysFromNow(1)))) {
      item.completed = true;
      changed.push(item);
    }
  });

  saveItems(all);
  return changed;
}

// -------------------- streak helpers (optional) --------------------
const STREAK_KEY = 'gym_streak';
const STREAK_LAST_DAY_KEY = 'gym_streak_last_day'; // yyyy-mm-dd

export function getGymStreak() {
  return Number(localStorage.getItem(STREAK_KEY) || '0');
}
export function saveGymStreak(value) {
  localStorage.setItem(STREAK_KEY, String(value));
}
export function getLastGymDay() {
  return localStorage.getItem(STREAK_LAST_DAY_KEY) || null;
}
export function saveLastGymDay(iso) {
  localStorage.setItem(STREAK_LAST_DAY_KEY, iso);
}
export function incrementGymStreakForToday() {
  const today = toISODate(new Date());
  const last = getLastGymDay();
  if (last === today) return getGymStreak();

  let streak = 1;
  const yIso = toISODate(daysFromNow(-1));
  if (last === yIso) {
    streak = getGymStreak() + 1;
  }
  saveGymStreak(streak);
  saveLastGymDay(today);
  return streak;
}

// -------------------- misc utils --------------------
function fromDetails(details) {
  if (!details) return [];
  return details.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

function mergeUnique(a = [], b = []) {
  const set = new Set(a.map(x => x.toLowerCase()));
  b.forEach(x => set.add(x.toLowerCase()));
  return Array.from(set);
}

function hasCaseInsensitive(list, value) {
  const v = value.toLowerCase();
  return list.some(x => x.toLowerCase() === v);
}

function dayKeyOfDate(d) {
  return IDX_TO_BYDAY[d.getDay()];
}

function toISODate(d) {
  return d.toISOString().slice(0,10);
}

function isSameDate(a, b) {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}
