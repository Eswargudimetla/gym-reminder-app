// js/commands.js
import { showToast, renderAll, flashItemsByIds, navigateTo } from './ui.js';
import * as store from './store.js';
import * as dateUtils from './dateUtils.js';
import * as profile from './profile.js';

// ===== regex for main actions =====
const CANCEL_RE = /\b(cancel|cancle|delete|drop|remove|nix|get rid of)\b/i;
const CHANGE_RE = /\b(change|update|reschedule|move|modify|edit)\b/i;
const CREATE_RE = /(?:schedule a|schedule|remind me to|remind me|make a|create a|add a|add|set a|set|book a|book|put|new)\b/i;

// types
const TYPES = { GYM: 'gym', SUPP: 'supplement', WORKOUT: 'workout' };
const SUPPLEMENTS = ['protein', 'creatine', 'pre workout', 'pre-workout', 'preworkout'];
const WORKOUT_KEYWORDS = [
  'cardio', 'run', 'jog', 'lift', 'exercise',
  'push day', 'pull day', 'leg day', 'legs',
  'chest', 'back', 'arms', 'shoulders', 'workout'
];

const DUP_MS = 60 * 1000;

// -------------- helpers ----------------
function normalizeTitleIntent(text) {
  const t = text.toLowerCase().replace(/^to\s+/, '').trim();

  const foundWorkout = WORKOUT_KEYWORDS.find(kw => t.includes(kw));
  if (foundWorkout) {
    const label = foundWorkout.charAt(0).toUpperCase() + foundWorkout.slice(1);
    return { type: TYPES.WORKOUT, label };
  }
  if (t.includes('gym')) {
    return { type: TYPES.GYM, label: 'Gym' };
  }
  if (SUPPLEMENTS.some(s => t.includes(s))) {
    if (t.includes('protein')) return { type: TYPES.SUPP, label: 'Protein' };
    if (t.includes('creatine')) return { type: TYPES.SUPP, label: 'Creatine' };
    return { type: TYPES.SUPP, label: 'Pre-Workout' };
  }

  const cleanTitle = text
    .replace(CREATE_RE, '')
    .replace(CHANGE_RE, '')
    .split(/ at | on | for | with /)[0]
    .trim();

  if (cleanTitle && !['my', 'schedule', 'reminder'].includes(cleanTitle.toLowerCase())) {
    return { type: 'generic', label: cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1) };
  }
  return { type: 'generic', label: 'Reminder' };
}

function normalizeDayTokens(str) {
  return str.toLowerCase()
    .replace(/\bmon(day)?\b/g, 'monday')
    .replace(/\btue(s|sday)?\b/g, 'tuesday')
    .replace(/\bwed(nesday)?\b/g, 'wednesday')
    .replace(/\bthu(r|rs|rsday|rsd)?\b/g, 'thursday')
    .replace(/\bfri(day)?\b/g, 'friday')
    .replace(/\bsat(urday)?\b/g, 'saturday')
    .replace(/\bsun(day)?\b/g, 'sunday');
}

function parseDaysSet(str) {
  const s = normalizeDayTokens(str);
  if (/\bweekdays?\b/.test(s)) return new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday']);
  if (/\bweekend\b/.test(s)) return new Set(['saturday', 'sunday']);
  if (/\bevery\s*day\b|\beveryday\b|\bdaily\b/.test(s)) return new Set(dateUtils.WEEKDAYS);

  const mRange = s.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b\s*(?:-|to|through|till|until)\s*\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (mRange) {
    const start = mRange[1], end = mRange[2];
    const sIdx = dateUtils.WEEKDAYS.indexOf(start);
    const eIdx = dateUtils.WEEKDAYS.indexOf(end);
    const res = new Set();
    let i = sIdx;
    while (true) {
      res.add(dateUtils.WEEKDAYS[i]);
      if (i === eIdx) break;
      i = (i + 1) % 7;
    }
    return res;
  }
  const found = new Set();
  dateUtils.WEEKDAYS.forEach(d => { if (s.includes(d)) found.add(d); });
  return found.size ? found : null;
}

function parseNextWeekday(str) {
  const s = normalizeDayTokens(str);
  const m = s.match(/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  return m ? m[1] : null;
}

function buildDateFromPhrases(lower, timeDate) {
  const t = timeDate || new Date();
  const hasTomorrow = /\btomorrow\b/.test(lower);
  const isoMatch = lower.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const nextWk = parseNextWeekday(lower);
  const explicitWk = dateUtils.WEEKDAYS.find(d => lower.includes(d));

  let base = new Date();
  if (isoMatch) {
    const dt = dateUtils.parseISODate(isoMatch[1]);
    if (dt) base = dt;
  } else if (nextWk) {
    base = dateUtils.getNextDateForDayOfWeek(nextWk, t.getHours(), t.getMinutes());
  } else if (explicitWk) {
    base = dateUtils.getNextDateForDayOfWeek(explicitWk, t.getHours(), t.getMinutes());
  } else if (hasTomorrow) {
    base.setDate(base.getDate() + 1);
  } else if (
    base.getHours() > t.getHours() ||
    (base.getHours() === t.getHours() && base.getMinutes() > t.getMinutes())
  ) {
    if (new Date().toDateString() === base.toDateString()) {
      base.setDate(base.getDate() + 1);
    }
  }

  base.setHours(t.getHours(), t.getMinutes(), 0, 0);
  return base;
}

function getTitleForCommand(original, lower) {
  let title = original;
  const onIdx = lower.lastIndexOf(' on ');
  const atIdx = lower.lastIndexOf(' at ');
  const forIdx = lower.lastIndexOf(' for ');
  const withIdx = lower.lastIndexOf(' with ');
  const splitIdx = Math.max(onIdx, atIdx, forIdx, withIdx);
  if (splitIdx !== -1) {
    title = original.substring(0, splitIdx);
  }
  title = title.replace(CREATE_RE, '').replace(CHANGE_RE, '').trim();
  return title || original;
}

// -------------- CREATE --------------
function createByCommand(original, lower) {
  const title = getTitleForCommand(original, lower);
  const { type, label } = normalizeTitleIntent(title || original);
  const timeToken = dateUtils.extractFirstTime(lower);

  let details = null;
  const forMatch = lower.match(/\bfor\s+(.*)$/);
  const withMatch = lower.match(/\bwith\s+(.*)$/);
  if (forMatch) details = forMatch[1];
  else if (withMatch) details = withMatch[1];

  if (!timeToken) {
    showToast("Please specify a time.");
    return;
  }
  const time = dateUtils.parseTimeStringMaybe24(timeToken);
  if (!time) {
    showToast("Couldn't understand that time.");
    return;
  }

  const daysSet = parseDaysSet(lower);
  const items = store.getItems();
  let createdCount = 0;
  const createdIds = [];
  const reminderData = { type, label, details, completed: false };

  if (daysSet && daysSet.size > 0) {
    for (const day of daysSet) {
      const dt = dateUtils.getNextDateForDayOfWeek(day, time.getHours(), time.getMinutes());
      if (!items.some(i => Math.abs(new Date(i.time).getTime() - dt.getTime()) < DUP_MS && i.label === label)) {
        const id = Date.now() + createdCount;
        items.push({ id, ...reminderData, time: dt.toISOString() });
        createdIds.push(id);
        createdCount++;
      }
    }
  } else {
    const dt = buildDateFromPhrases(lower, time);
    if (!items.some(i => Math.abs(new Date(i.time).getTime() - dt.getTime()) < DUP_MS && i.label === label)) {
      const id = Date.now();
      items.push({ id, ...reminderData, time: dt.toISOString() });
      createdIds.push(id);
      createdCount++;
    }
  }

  if (createdCount > 0) {
    store.saveItems(items);
    renderAll();
    flashItemsByIds(createdIds);
    showToast(`Added ${createdCount} reminder(s).`);
  } else {
    showToast("Reminder already exists at that time.");
  }
}

// -------------- CHANGE --------------
function changeByFilters(original, lower) {
  const newTimeToken = dateUtils.extractFirstTime(lower);
  const newTime = newTimeToken ? dateUtils.parseTimeStringMaybe24(newTimeToken) : null;
  const changeMatch = lower.match(CHANGE_RE);
  const commandAfterChange = changeMatch ? original.substring(changeMatch.index + changeMatch[0].length).trim() : '';
  const newTitleIntent = normalizeTitleIntent(commandAfterChange);

  let targetContext = '';
  if (changeMatch) {
    const textAfterChange = lower.substring(changeMatch.index + changeMatch[0].length).trim();
    const firstWords = textAfterChange.split(' ').slice(0, 2).join(' ');
    targetContext = firstWords;
    if (
      /\btoday\b|\btomorrow\b|^\d{1,2}/.test(firstWords) ||
      parseDaysSet(firstWords) ||
      parseNextWeekday(firstWords)
    ) {
      targetContext = lower.substring(0, changeMatch.index).trim();
    }
  }
  if (!targetContext) {
    targetContext = changeMatch ? lower.substring(0, changeMatch.index).trim() : original;
  }
  const targetTitleIntent = normalizeTitleIntent(targetContext);

  const items = store.getItems();
  let potentialTargets = [];

  if (
    targetTitleIntent.label.toLowerCase() === 'workout' ||
    targetTitleIntent.label.toLowerCase() === 'exercise'
  ) {
    potentialTargets = items
      .filter(item =>
        !item.completed &&
        new Date(item.time) >= dateUtils.startOfTodayDate() &&
        item.type === TYPES.WORKOUT
      )
      .sort((a, b) => new Date(a.time) - new Date(b.time));
  } else {
    potentialTargets = items
      .filter(item =>
        !item.completed &&
        new Date(item.time) >= dateUtils.startOfTodayDate() &&
        item.label.toLowerCase() === targetTitleIntent.label.toLowerCase()
      )
      .sort((a, b) => new Date(a.time) - new Date(b.time));
  }

  const daysSet = parseDaysSet(lower);
  const hasTomorrow = /\btomorrow\b/.test(lower);
  const hasToday = /\btoday\b/.test(lower);
  const isoMatch = lower.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  let targetItems = [];

  if (daysSet && daysSet.size > 0) {
    const dayIndexes = new Set(Array.from(daysSet).map(d => dateUtils.WEEKDAYS.indexOf(d)));
    const firstOccurrencePerDay = {};
    targetItems = potentialTargets.filter(item => {
      const day = new Date(item.time).getDay();
      if (dayIndexes.has(day) && !firstOccurrencePerDay[day]) {
        firstOccurrencePerDay[day] = true;
        return true;
      }
      return false;
    });
  } else if (isoMatch) {
    const targetDate = dateUtils.parseISODate(isoMatch[1]);
    if (targetDate) {
      targetItems = potentialTargets.filter(item => {
        const d = new Date(item.time);
        return (
          d.getFullYear() === targetDate.getFullYear() &&
          d.getMonth() === targetDate.getMonth() &&
          d.getDate() === targetDate.getDate()
        );
      });
      if (targetItems.length > 0) targetItems = [targetItems[0]];
    }
  } else if (hasTomorrow || hasToday) {
    const targetDateStart = new Date(dateUtils.startOfTodayDate());
    if (hasTomorrow) targetDateStart.setDate(targetDateStart.getDate() + 1);
    const targetDateEnd = new Date(targetDateStart);
    targetDateEnd.setHours(23, 59, 59, 999);
    targetItems = potentialTargets.filter(item => {
      const d = new Date(item.time);
      return d >= targetDateStart && d <= targetDateEnd;
    });
    if (targetItems.length > 0) targetItems = [targetItems[0]];
  } else {
    if (potentialTargets.length > 0) targetItems = [potentialTargets[0]];
  }

  if (targetItems.length === 0) {
    showToast(`Couldn't find upcoming "${targetTitleIntent.label}" to change.`);
    return;
  }

  let changedCount = 0;
  const changedIds = [];

  targetItems.forEach(item => {
    let changed = false;
    if (newTime) {
      const currentItemDate = new Date(item.time);
      currentItemDate.setHours(newTime.getHours());
      currentItemDate.setMinutes(newTime.getMinutes());
      currentItemDate.setSeconds(0);
      currentItemDate.setMilliseconds(0);
      item.time = currentItemDate.toISOString();
      changed = true;
    }
    if (newTitleIntent.type !== 'generic' && newTitleIntent.label !== targetTitleIntent.label) {
      item.label = newTitleIntent.label;
      item.type = newTitleIntent.type;
      changed = true;
    }
    if (changed) {
      changedCount++;
      changedIds.push(item.id);
    }
  });

  if (changedCount > 0) {
    store.saveItems(items);
    renderAll();
    flashItemsByIds(changedIds);
    showToast(`Updated ${changedCount} reminder(s).`);
  } else {
    showToast("Didn't find anything specific to change.");
  }
}

// ---- small helper: streak from here ----
function computeGymStreak() {
  const items = store.getItems();
  const oneDay = 24 * 60 * 60 * 1000;

  const completedGymDates = items
    .filter(it => it.label && it.label.toLowerCase().includes('gym') && it.completed)
    .map(it => {
      const d = new Date(it.time);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    });

  if (completedGymDates.length === 0) return 0;

  const uniqueDates = [...new Set(completedGymDates)].sort((a, b) => b - a);

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (todayStart - uniqueDates[0] > oneDay) return 0;

  let streak = 1;
  for (let i = 0; i < uniqueDates.length - 1; i++) {
    const diff = uniqueDates[i] - uniqueDates[i + 1];
    if (diff === oneDay) streak++;
    else break;
  }
  return streak;
}

// ---- cancel today's thing ----
function cancelTodayByLabel(label) {
  const lowered = label.toLowerCase();
  const items = store.getItems();
  const todayStart = dateUtils.startOfTodayDate();
  const todayEnd = new Date(todayStart);
  todayEnd.setHours(23, 59, 59, 999);

  const remaining = [];
  let removed = 0;
  items.forEach(it => {
    const t = new Date(it.time);
    const isToday = t >= todayStart && t <= todayEnd;
    if (isToday && it.label && it.label.toLowerCase().includes(lowered)) {
      removed++;
    } else {
      remaining.push(it);
    }
  });

  store.saveItems(remaining);
  renderAll();

  if (removed > 0) {
    showToast(`Canceled ${removed} ${label} for today.`);
  } else {
    showToast(`No ${label} found for today.`);
  }
}

// -------------- MAIN DISPATCH --------------
export function processCommand(command) {
  const lower = command.toLowerCase().trim();

  // A) navigation
  if (lower === 'open stats' || lower === 'show my progress' || lower === 'stats') {
    navigateTo('stats-page');
    return;
  }
  if (lower === 'open calendar' || lower === 'show calendar' || lower === 'calendar') {
    navigateTo('calendar-page');
    return;
  }
  if (lower === 'open settings' || lower === 'settings' || lower === 'open profile') {
    navigateTo('settings-page');
    return;
  }
  if (lower === 'open today' || lower === 'today' || lower === 'go to today') {
    navigateTo('today-page');
    return;
  }

  // B) mute / unmute (just in profile, no notifications file)
  if (lower === 'mute notifications') {
    const cur = profile.getProfile() || {};
    profile.saveProfile({ ...cur, notificationsMuted: true });
    showToast('Notifications muted.');
    return;
  }
  if (lower === 'unmute notifications') {
    const cur = profile.getProfile() || {};
    profile.saveProfile({ ...cur, notificationsMuted: false });
    showToast('Notifications unmuted.');
    return;
  }

  // C) “i went to the gym today” → mark today's gym done
  if (
    lower === 'i went to the gym today' ||
    lower === 'i did gym today' ||
    lower === 'yes i went to gym' ||
    lower === 'mark gym done'
  ) {
    const items = store.getItems();
    const todayStart = dateUtils.startOfTodayDate();
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);

    let updated = 0;
    items.forEach(it => {
      const t = new Date(it.time);
      const isToday = t >= todayStart && t <= todayEnd;
      if (isToday && it.label && it.label.toLowerCase().includes('gym')) {
        it.completed = true;
        updated++;
      }
    });

    if (updated > 0) {
      store.saveItems(items);
      renderAll();
      showToast('Nice! Gym marked as done 🔥');
    } else {
      showToast("I didn't find a gym reminder for today.");
    }
    return;
  }

  // D) “what’s my streak”
  if (
    lower === "what's my streak" ||
    lower === 'whats my streak' ||
    lower === 'what is my streak'
  ) {
    const st = computeGymStreak();
    if (st === 0) {
      showToast("You're at 0 today. Let's start!");
    } else {
      showToast(`You're on a ${st}-day streak 🔥`);
    }
    return;
  }

  // E) “what are today's tasks”
  if (
    lower === "what are today's tasks" ||
    lower === 'what are todays tasks' ||
    lower === 'what do i have today'
  ) {
    const items = store.getItems().filter(x => isToday(new Date(x.time)));
    if (items.length === 0) {
      showToast('No reminders for today.');
    } else {
      const names = items.slice(0, 3).map(i => i.label).join(', ');
      showToast(`Today: ${names}${items.length > 3 ? '…' : ''}`);
    }
    return;
  }

  // F) “did i take supplements”
  if (
    lower === 'did i take supplements' ||
    lower === 'did i take my supplements'
  ) {
    const items = store.getItems().filter(x => isToday(new Date(x.time)));
    const sups = items.filter(x =>
      x.type === TYPES.SUPP ||
      (x.label && SUPPLEMENTS.some(s => x.label.toLowerCase().includes(s)))
    );
    if (sups.length === 0) {
      showToast('No supplements scheduled today.');
    } else {
      const done = sups.filter(s => s.completed).length;
      if (done === sups.length) {
        showToast('All supplements done ✅');
      } else {
        showToast(`You still have ${sups.length - done} supplement(s) to do.`);
      }
    }
    return;
  }

  // G) cancel gym today
  if (lower.startsWith('cancel gym today') || lower.startsWith('cancle gym today')) {
    cancelTodayByLabel('gym');
    return;
  }

  // H) cancel protein today
  if (lower.startsWith('cancel protein today')) {
    cancelTodayByLabel('protein');
    return;
  }

  // I) generic cancel (not perfect yet)
  if (CANCEL_RE.test(lower)) {
    showToast("Cancel command isn't fully built yet! Try: “cancel gym today”.");
    return;
  }

  // J) change
  if (CHANGE_RE.test(lower)) {
    changeByFilters(command, lower);
    return;
  }

  // K) create
  if (CREATE_RE.test(lower) || dateUtils.extractFirstTime(lower)) {
    createByCommand(command, lower);
    return;
  }

  // fallback
  showToast("Sorry, I didn't understand that command.");
}

// local helper for today's check
function isToday(d) {
  const start = dateUtils.startOfTodayDate();
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
}
