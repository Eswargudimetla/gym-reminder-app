// js/notifications.js
// Notifications for the gym app (Android-safe, gym check-in, streak bump, speech confirm)

import { getItems } from './store.js';
import * as ui from './ui.js';
import * as store from './store.js';
import { speak } from './voice.js';

const FOLLOWUP_OFFSET = 1_000_000; // second notif per item
const MAX_INT = 2_147_483_647;     // Java int max

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------
function getLN() {
  if (typeof window === 'undefined') return null;

  const fromCap = window.Capacitor?.Plugins?.LocalNotifications;
  if (fromCap) return fromCap;

  const fromAlt = window.CapacitorPlugins?.LocalNotifications;
  if (fromAlt) return fromAlt;

  return null;
}

function toNativeId(jsId) {
  return Math.abs(Number(jsId)) % MAX_INT;
}

// -----------------------------------------------------------------------------
// permissions & action types
// -----------------------------------------------------------------------------
export async function requestNotificationPermission() {
  const LN = getLN();
  if (!LN) {
    console.log('[notifications] no plugin → assuming permission OK (web)');
    return true;
  }

  try {
    let perm = await LN.checkPermissions();
    console.log('[notifications] checkPermissions =', perm);

    if (perm.display === 'prompt' || perm.display === 'prompt-with-rationale') {
      perm = await LN.requestPermissions();
      console.log('[notifications] requestPermissions =', perm);
    }

    const granted = perm.display === 'granted';
    if (!granted) {
      ui.showToast('Notifications are blocked on this device/app.');
      speak('Notifications are blocked on this device.');
    }
    return granted;
  } catch (err) {
    console.error('[notifications] permission error', err);
    ui.showToast('Error requesting notification permission.');
    speak('There was an error requesting notification permission.');
    return false;
  }
}

export async function registerNotificationActions() {
  const LN = getLN();
  if (!LN) {
    console.log('[notifications] no plugin → skip action registration');
    return;
  }
  try {
    await LN.registerActionTypes({
      types: [
        {
          id: 'GYM_CHECKIN',
          actions: [
            {
              id: 'GYM_YES',
              title: 'Yes, I went 💪',
              destructive: false
            },
            {
              id: 'GYM_NO',
              title: 'No, not today',
              destructive: false
            }
          ]
        }
      ]
    });
    console.log('[notifications] gym actions registered');
  } catch (e) {
    console.error('[notifications] error registering actions', e);
  }
}

// -----------------------------------------------------------------------------
// main scheduling (with nudge + second cleanup)
// -----------------------------------------------------------------------------
export async function scheduleNotification(item) {
  let when = new Date(item.time);

  // 1) skip completed
  if (item.completed) {
    console.log('[notifications] skip: item completed', item);
    return;
  }

  const now = new Date();
  let diffMs = when.getTime() - now.getTime();

  // 2) far future → snap to :00 so "10:00" doesn't become "10:00:40"
  if (diffMs > 90_000) {
    when.setSeconds(0, 0);
    diffMs = when.getTime() - now.getTime();
  }

  // 3) near future (≤ 90s) → nudge 5s earlier to beat Android delay
  if (diffMs > 0 && diffMs <= 90_000) {
    when = new Date(when.getTime() - 5_000);
    console.log('[notifications] nudged 5s earlier for near-future reminder');
  }

  // 4) still in past? skip
  if (when <= now) {
    console.log('[notifications] skip: past time after adjust', item.time);
    return;
  }

  const LN = getLN();
  if (!LN) {
    console.log('[notifications] no plugin → cannot schedule', item);
    return;
  }

  const nativeId = toNativeId(item.id);

  console.log('[notifications] scheduling', {
    jsId: item.id,
    nativeId,
    label: item.label,
    at: when.toISOString()
  });

  // main notification
  await LN.schedule({
    notifications: [
      {
        id: nativeId,
        title: item.label,
        body: item.details || `Reminder for ${item.label}`,
        schedule: { at: when },
        extra: {
          itemId: item.id,
          kind: 'main'
        }
      }
    ]
  });

  // 5) gym check-in notification (Okta-style) → 2h later
  const isGym = item.label && item.label.toLowerCase().includes('gym');
  if (isGym) {
    const followAt = new Date(when.getTime() + 2 * 60 * 60 * 1000);
    const followNativeId = toNativeId(item.id + FOLLOWUP_OFFSET);

    console.log('[notifications] scheduling gym follow-up', {
      jsId: item.id + FOLLOWUP_OFFSET,
      nativeId: followNativeId,
      at: followAt.toISOString()
    });

    await LN.schedule({
      notifications: [
        {
          id: followNativeId,
          title: 'Gym check-in',
          body: 'Did you go to the gym today?\nTap to update your streak.',
          schedule: { at: followAt },
          actionTypeId: 'GYM_CHECKIN',
          extra: {
            itemId: item.id,
            followup: true,
            label: item.label
          }
        }
      ]
    });
  }
}

// -----------------------------------------------------------------------------
// unschedule
// -----------------------------------------------------------------------------
export async function unscheduleNotification(itemId) {
  const LN = getLN();
  if (!LN) {
    console.log('[notifications] no plugin → unschedule noop');
    return;
  }

  const nativeId = toNativeId(itemId);
  const followNativeId = toNativeId(itemId + FOLLOWUP_OFFSET);

  try {
    const pending = await LN.getPending();
    const toCancel = [];

    if (pending.notifications.some(n => n.id === nativeId)) {
      toCancel.push({ id: nativeId });
    }
    if (pending.notifications.some(n => n.id === followNativeId)) {
      toCancel.push({ id: followNativeId });
    }

    if (toCancel.length > 0) {
      console.log('[notifications] canceling', toCancel);
      await LN.cancel({ notifications: toCancel });
    }
  } catch (err) {
    console.error('[notifications] unschedule error', err);
  }
}

// -----------------------------------------------------------------------------
// schedule all (on startup / after clear)
// -----------------------------------------------------------------------------
export async function scheduleAllNotifications() {
  const LN = getLN();
  if (!LN) {
    console.log('[notifications] no plugin → scheduleAll noop (web)');
    return;
  }

  try {
    const pending = await LN.getPending();
    if (pending.notifications.length > 0) {
      console.log('[notifications] clearing pending =', pending.notifications.length);
      await LN.cancel(pending);
    }
  } catch (err) {
    console.error('[notifications] error clearing pending', err);
  }

  const items = getItems();
  console.log('[notifications] re-scheduling from store, count =', items.length);
  await Promise.all(items.map(item => scheduleNotification(item)));
}

// -----------------------------------------------------------------------------
// gym follow-up handling
// -----------------------------------------------------------------------------
async function markTodaysGymDone() {
  const all = getItems();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const todaysGyms = all.filter(i => {
    if (!i.label) return false;
    const isGym = i.label.toLowerCase().includes('gym');
    const t = new Date(i.time);
    return isGym && t >= todayStart && t < tomorrow;
  });

  todaysGyms.forEach(g => {
    if (!g.completed) {
      store.toggleComplete(g.id);
    }
    unscheduleNotification(g.id);
  });

  // bump streak (must exist in store.js)
  let newStreak = 1;
  if (typeof store.incrementGymStreakForToday === 'function') {
    newStreak = store.incrementGymStreakForToday();
  }

  ui.renderAll();
  const msg = `Gym logged for today. Streak ${newStreak} day${newStreak === 1 ? '' : 's'}.`;
  ui.showToast(`Gym logged for today 🔥 Streak: ${newStreak} day(s)`);
  speak(msg);

  const LN = getLN();
  if (LN) {
    await LN.schedule({
      notifications: [
        {
          id: toNativeId(Date.now()),
          title: 'Nice 🔥',
          body: `Streak is now ${newStreak} day(s)!`
        }
      ]
    });
  }
}

async function handleGymMissedInternal() {
  const all = getItems();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  let changed = false;

  all.forEach(it => {
    const isGym = it.label && it.label.toLowerCase().includes('gym');
    const t = new Date(it.time);
    const isToday = t >= todayStart && t < tomorrow;
    if (isGym && isToday) {
      it.missed = true;
      changed = true;
    }
  });

  if (changed) {
    store.saveItems(all);
    ui.renderAll();
  }

  ui.showToast('Gym not done today.');
  speak('Marked as missed for today.');

  const LN = getLN();
  if (LN) {
    await LN.schedule({
      notifications: [
        {
          id: toNativeId(Date.now()),
          title: 'Streak slipped 😕',
          body: 'You missed today. Back at it tomorrow!'
        }
      ]
    });
  }
}

export async function handleNotificationAction(performed) {
  const actionId = performed?.actionId;
  const extra = performed?.notification?.extra || {};

  if (!extra || !extra.followup) return;

  const isGym = extra.label && extra.label.toLowerCase().includes('gym');
  if (!isGym) return;

  if (actionId === 'GYM_YES') {
    await markTodaysGymDone();
  } else if (actionId === 'GYM_NO') {
    await handleGymMissedInternal();
  } else {
    console.log('[notifications] unknown action', actionId);
  }
}

// -----------------------------------------------------------------------------
// debug helpers
// -----------------------------------------------------------------------------
export async function debugScheduleTestNotif() {
  const LN = getLN();
  if (!LN) {
    ui.showToast('No LocalNotifications plugin (debug).');
    console.warn('[notifications] debug: plugin missing');
    return;
  }
  const at = new Date(Date.now() + 8_000);
  const id = toNativeId(Date.now());
  await LN.schedule({
    notifications: [
      {
        id,
        title: 'Debug 🔔',
        body: 'This was scheduled from notifications.js (safe int, nudge on).',
        schedule: { at }
      }
    ]
  });
  ui.showToast('Debug notification scheduled (8s).');
  console.log('[notifications] debug notif scheduled for', at.toISOString(), 'with id', id);
}

// GYM CHECK-IN 2-button test
export async function debugGymFollowupTest() {
  const LN = getLN();
  if (!LN) {
    console.warn('[debugGymFollowupTest] no plugin');
    return;
  }

  await registerNotificationActions();

  const at = new Date(Date.now() + 10_000);
  const id = toNativeId(Date.now());

  await LN.schedule({
    notifications: [
      {
        id,
        title: 'Gym check-in',
        body: 'Did you go to the gym today?\nTap to update your streak.',
        schedule: { at },
        actionTypeId: 'GYM_CHECKIN',
        extra: {
          followup: true,
          label: 'Gym',
          itemId: id
        }
      }
    ]
  });

  ui.showToast('Test gym check-in in 10s.');
  console.log('[debugGymFollowupTest] scheduled for', at.toISOString());
}

// expose for chrome://inspect
if (typeof window !== 'undefined') {
  window.debugScheduleTestNotif = debugScheduleTestNotif;
  window.debugGymFollowupTest = debugGymFollowupTest;
}
