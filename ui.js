// js/ui.js
import { getItems } from './store.js';
import { isToday, isPastDate } from './dateUtils.js';

const subGreeting = document.getElementById('sub-greeting');
const pages = document.querySelectorAll('.page');
const quickActionButtons = document.querySelectorAll('.action-btn');
const chatFooter = document.getElementById('chat-footer');
const todayList = document.getElementById('today-list');
const calendarList = document.getElementById('calendar-list');
const statCompletedToday = document.getElementById('stat-completed-today');
const statTotalCompleted = document.getElementById('stat-total-completed');
const statUpcoming = document.getElementById('stat-upcoming');
const statTotalReminders = document.getElementById('stat-total-reminders');
const statGymStreak = document.getElementById('stat-gym-streak');

// these might exist depending on your HTML
const appContainer = document.getElementById('app-container');
const headerStreakBadge = document.querySelector('.streak-badge');

const toast = document.createElement('div');
toast.id = 'toast';
document.body.appendChild(toast);
export function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3200);
}

export function navigateTo(pageId) {
  pages.forEach(p => {
    p.classList.add('hidden');
  });
  const target = document.getElementById(pageId);
  if (target) target.classList.remove('hidden');

  quickActionButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === pageId);
  });

  chatFooter.classList.toggle('hidden', pageId === 'settings-page');

  if (pageId === 'today-page') {
    subGreeting.textContent = 'Here are your Gym & Supplements for today.';
    renderToday();
  } else if (pageId === 'calendar-page') {
    subGreeting.textContent = 'All upcoming items.';
    renderCalendar();
  } else if (pageId === 'stats-page') {
    subGreeting.textContent = 'Your productivity summary.';
    renderStats();
  } else if (pageId === 'settings-page') {
    subGreeting.textContent = 'Manage your app settings.';
  }
}

function createItemElement(item, showFullDate = false) {
  const li = document.createElement('li');
  li.className = `reminder-item ${item.completed ? 'completed' : ''}`;

  const checkbox = document.createElement('span');
  checkbox.className = `material-symbols-outlined checkbox ${item.completed ? 'completed' : ''}`;
  checkbox.dataset.id = String(item.id);
  checkbox.textContent = item.completed ? 'task_alt' : 'radio_button_unchecked';

  const details = document.createElement('div');
  details.className = 'details';

  const titleEl = document.createElement('div');
  titleEl.className = 'title';
  titleEl.textContent = item.label;

  const t = new Date(item.time);
  const timeEl = document.createElement('div');
  timeEl.className = 'time';
  timeEl.textContent = showFullDate
    ? t.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : t.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  details.appendChild(titleEl);
  details.appendChild(timeEl);

  if (item.details) {
    const detailsEl = document.createElement('div');
    detailsEl.className = 'details-text';
    detailsEl.textContent = item.details;
    details.appendChild(detailsEl);
  }

  const actions = document.createElement('div');
  actions.className = 'reminder-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'action-icon edit-btn';
  editBtn.dataset.id = String(item.id);
  editBtn.innerHTML = `<span class="material-symbols-outlined">edit</span>`;

  const delBtn = document.createElement('button');
  delBtn.className = 'action-icon delete-btn';
  delBtn.dataset.id = String(item.id);
  delBtn.innerHTML = `<span class="material-symbols-outlined">delete</span>`;

  actions.appendChild(editBtn);
  actions.appendChild(delBtn);

  li.appendChild(checkbox);
  li.appendChild(details);
  li.appendChild(actions);

  return li;
}

export function renderToday() {
  const items = getItems().filter(x => isToday(new Date(x.time)));
  items.sort((a, b) => new Date(a.time) - new Date(b.time));
  todayList.innerHTML = '';
  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = 'No reminders for today.';
    todayList.appendChild(li);
  } else {
    items.forEach(i => todayList.appendChild(createItemElement(i)));
  }
  renderStats();
}

export function renderCalendar() {
  const items = getItems().filter(x => !isPastDate(new Date(x.time)));
  items.sort((a, b) => new Date(a.time) - new Date(b.time));
  calendarList.innerHTML = '';
  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = 'No reminders scheduled.';
    calendarList.appendChild(li);
  } else {
    items.forEach(i => calendarList.appendChild(createItemElement(i, true)));
  }
}

// same logic you had
function calculateGymStreak() {
  const items = getItems();
  const oneDay = 24 * 60 * 60 * 1000;

  const completedGymDates = items
    .filter(item => item.label && item.label.toLowerCase() === 'gym' && item.completed)
    .map(item => {
      const d = new Date(item.time);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    });

  if (completedGymDates.length === 0) return 0;

  const uniqueDates = [...new Set(completedGymDates)].sort((a, b) => b - a);

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  if (todayStart - uniqueDates[0] > oneDay) {
    return 0;
  }

  let streak = 1;
  for (let i = 0; i < uniqueDates.length - 1; i++) {
    const diff = uniqueDates[i] - uniqueDates[i + 1];
    if (diff === oneDay) streak++;
    else break;
  }
  return streak;
}

// number animation
function animateNumber(el, target) {
  const start = Number(el.textContent) || 0;
  const duration = 500;
  const startTime = performance.now();

  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const value = Math.floor(progress * (target - start) + start);
    el.textContent = value;
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

export function renderStats() {
  const all = getItems();
  const completed = all.filter(r => r.completed);
  const upcoming = all.filter(r => !r.completed && new Date(r.time) > new Date());
  const completedToday = completed.filter(r => isToday(new Date(r.time)));
  const currentStreak = calculateGymStreak();

  if (statCompletedToday) statCompletedToday.textContent = String(completedToday.length);
  if (statTotalCompleted) statTotalCompleted.textContent = String(completed.length);
  if (statUpcoming) statUpcoming.textContent = String(upcoming.length);
  if (statTotalReminders) statTotalReminders.textContent = String(all.length);
  if (statGymStreak) {
    animateNumber(statGymStreak, currentStreak);
    // add class so CSS glow works
    statGymStreak.classList.add('streak-active', 'animated');
    setTimeout(() => {
      statGymStreak.classList.remove('animated');
    }, 600);
  }

  // 🔁 also update app background class based on streak
  if (appContainer) {
    appContainer.classList.remove('streak-1', 'streak-2', 'streak-3');
    if (currentStreak >= 1 && currentStreak < 3) {
      appContainer.classList.add('streak-1');
    } else if (currentStreak >= 3 && currentStreak < 7) {
      appContainer.classList.add('streak-2');
    } else if (currentStreak >= 7) {
      appContainer.classList.add('streak-3');
    }
  }

  // 🔁 header badge show/hide
  if (headerStreakBadge) {
    if (currentStreak > 0) {
      headerStreakBadge.classList.remove('hidden');
      headerStreakBadge.querySelector('.streak-count').textContent = currentStreak;
    } else {
      headerStreakBadge.classList.add('hidden');
    }
  }
}

export function renderAll() {
  renderToday();
  renderCalendar();
}

export function flashItemsByIds(ids = []) {
  setTimeout(() => {
    ids.forEach(id => {
      const el = document.querySelector(`.reminder-item .checkbox[data-id="${id}"]`);
      if (el) {
        const li = el.closest('.reminder-item');
        if (li) {
          li.classList.add('flash');
          setTimeout(() => li.classList.remove('flash'), 2000);
        }
      }
    });
  }, 60);
}

export function openEditModal(item) {
  document.getElementById('edit-id').value = String(item.id);
  document.getElementById('edit-title').value = item.label;

  const d = new Date(item.time);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  document.getElementById('edit-time').value = `${yyyy}-${mm}-${dd}T${hh}:${mi}`;

  document.getElementById('edit-modal').classList.remove('hidden');
}

export function closeEditModal() {
  document.getElementById('edit-modal').classList.add('hidden');
}
