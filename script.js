// script.js
import * as store from './js/store.js';
import * as ui from './js/ui.js';
import { processCommand } from './js/commands.js';
import * as profile from './js/profile.js';
import {
  requestNotificationPermission,
  scheduleNotification,
  unscheduleNotification,
  scheduleAllNotifications,
  registerNotificationActions,
  handleNotificationAction
} from './js/notifications.js';

document.addEventListener('DOMContentLoaded', () => {
  // ====== DOM refs ======
  const greeting = document.getElementById('greeting');
  const chatInput = document.getElementById('chat-input');
  const chatForm = document.getElementById('chat-form');
  const micButton = document.getElementById('mic-button');
  const sendButton = document.getElementById('send-button');
  const todayList = document.getElementById('today-list');
  const calendarList = document.getElementById('calendar-list');
  const editForm = document.getElementById('edit-form');
  const cancelEditButton = document.getElementById('cancel-edit');
  const clearDataButton = document.getElementById('clear-data-button');
  const quickActionButtons = document.querySelectorAll('.action-btn');
  const listeningOverlay = document.getElementById('listening-overlay');
  const liveText = document.getElementById('live-text');
  const profileForm = document.getElementById('profile-form');

  // ------------------------------------------------------------
  // helper: get native speech plugin from global
  // ------------------------------------------------------------
  function getNativeSpeechFromGlobal() {
    const cap = window.Capacitor;
    const p1 = cap?.Plugins?.SpeechRecognition;
    if (p1) return p1;
    const p2 = window.CapacitorPlugins?.SpeechRecognition;
    if (p2) return p2;
    return null;
  }

  // ------------------------------------------------------------
  // navigation buttons
  // ------------------------------------------------------------
  quickActionButtons.forEach(b =>
    b.addEventListener('click', () => ui.navigateTo(b.dataset.page))
  );

  // ------------------------------------------------------------
  // chat input: toggle mic/send
  // ------------------------------------------------------------
  chatInput.addEventListener('input', () => {
    const hasText = chatInput.value.trim() !== '';
    micButton.classList.toggle('hidden', hasText);
    sendButton.classList.toggle('hidden', !hasText);
  });

  // ------------------------------------------------------------
  // chat submit (text commands)
  // ------------------------------------------------------------
  chatForm.addEventListener('submit', e => {
    e.preventDefault();
    const cmd = chatInput.value.trim();
    if (cmd) {
      processCommand(cmd);
      chatInput.value = '';
      chatInput.dispatchEvent(new Event('input'));
    }
  });

  // ------------------------------------------------------------
  // list click (complete / edit / delete)
  // ------------------------------------------------------------
  function handleListClick(e) {
    const checkbox = e.target.closest('.checkbox');
    const editBtn = e.target.closest('.edit-btn');
    const deleteBtn = e.target.closest('.delete-btn');

    // toggle complete
    if (checkbox) {
      const id = Number(checkbox.dataset.id);
      store.toggleComplete(id);
      const item = store.getItems().find(i => i.id === id);

      if (item && item.completed) {
        unscheduleNotification(id);
      } else if (item && !item.completed) {
        scheduleNotification(item);
      }

      ui.renderAll();
      ui.flashItemsByIds([id]);
    }

    // edit
    if (editBtn) {
      const id = Number(editBtn.dataset.id);
      const item = store.getItems().find(i => i.id === id);
      if (item) ui.openEditModal(item);
    }

    // delete
    if (deleteBtn) {
      const id = Number(deleteBtn.dataset.id);
      if (confirm('Are you sure you want to delete this reminder?')) {
        unscheduleNotification(id);
        store.deleteItem(id);
        ui.renderAll();
      }
    }
  }

  todayList.addEventListener('click', handleListClick);
  calendarList.addEventListener('click', handleListClick);

  // ------------------------------------------------------------
  // edit form
  // ------------------------------------------------------------
  editForm.addEventListener('submit', e => {
    e.preventDefault();
    const id = Number(document.getElementById('edit-id').value);
    const label = document.getElementById('edit-title').value.trim();
    const time = document.getElementById('edit-time').value;

    store.updateItem(id, label, time);
    const updatedItem = store.getItems().find(i => i.id === id);
    if (updatedItem) {
      scheduleNotification(updatedItem);
    }

    ui.renderAll();
    ui.flashItemsByIds([id]);
    ui.closeEditModal();
    ui.showToast('Updated.');
  });

  cancelEditButton.addEventListener('click', ui.closeEditModal);

  // ------------------------------------------------------------
  // profile form
  // ------------------------------------------------------------
  profileForm.addEventListener('submit', e => {
    e.preventDefault();
    const userProfile = {
      name: document.getElementById('profile-name').value,
      age: document.getElementById('profile-age').value,
      gender: document.getElementById('profile-gender').value,
      weight: document.getElementById('profile-weight').value,
      height: document.getElementById('profile-height').value
    };
    profile.saveProfile(userProfile);
    ui.showToast('Profile saved!');

    const getDynamicGreeting = () => {
      const hr = new Date().getHours();
      if (hr < 12) return 'Good morning';
      if (hr < 18) return 'Good afternoon';
      return 'Good evening';
    };
    greeting.textContent = `${getDynamicGreeting()}, ${userProfile.name || 'Admin'}!`;

    scheduleAllNotifications();
  });

  // ------------------------------------------------------------
  // clear all data
  // ------------------------------------------------------------
  clearDataButton.addEventListener('click', async () => {
    if (confirm('Are you sure you want to delete all reminders? This cannot be undone.')) {
      store.saveItems([]);
      profile.saveProfile({});
      ui.renderAll();
      ui.navigateTo('today-page');
      await scheduleAllNotifications();
      ui.showToast('All data has been cleared.');
      init();
    }
  });

  // ------------------------------------------------------------
  // MIC / VOICE
  // ------------------------------------------------------------
  micButton.addEventListener('click', async () => {
    // 1) native first
    const NativeSpeech = getNativeSpeechFromGlobal();

    if (NativeSpeech) {
      try {
        const has = await (NativeSpeech.hasPermission?.() || NativeSpeech.checkPermission?.());
        if (has && (has.permission === false || has.status === 'denied')) {
          await (NativeSpeech.requestPermission?.() || NativeSpeech.requestPermissions?.());
        }

        const result = await NativeSpeech.start({
          language: 'en-US',
          maxResults: 1,
          prompt: 'Say your gym reminder...',
          partialResults: false,
          popup: true
        });

        const text = result?.matches?.[0];
        if (text && text.trim()) {
          console.log('[voice/native]', text);
          processCommand(text.trim());
          chatInput.value = '';
          chatInput.dispatchEvent(new Event('input'));
          if (liveText) liveText.textContent = '';
        } else {
          ui.showToast("I didn't catch that.");
        }
        return;
      } catch (err) {
        console.error('[voice/native] failed, fallback to web', err);
      }
    }

    // 2) web speech fallback
    const WebSpeech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!WebSpeech) {
      ui.showToast('Voice not supported on this device.');
      return;
    }

    const rec = new WebSpeech();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = false;

    rec.onstart = () => {
      if (listeningOverlay) listeningOverlay.classList.remove('hidden');
      if (liveText) liveText.textContent = '';
    };

    let finalTranscript = '';

    rec.onresult = ev => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const chunk = ev.results[i][0].transcript;
        if (liveText) liveText.textContent = chunk;
        if (ev.results[i].isFinal) finalTranscript += chunk;
      }
    };

    rec.onerror = () => {
      if (listeningOverlay) listeningOverlay.classList.add('hidden');
      ui.showToast('Could not understand, try again.');
    };

    rec.onend = () => {
      if (listeningOverlay) listeningOverlay.classList.add('hidden');
      if (finalTranscript.trim().length > 0) {
        processCommand(finalTranscript.trim());
        chatInput.value = '';
        chatInput.dispatchEvent(new Event('input'));
        if (liveText) liveText.textContent = '';
      }
    };

    rec.start();
  });

  // ------------------------------------------------------------
  // INIT
  // ------------------------------------------------------------
  async function init() {
    // notifications
    await requestNotificationPermission();
    await registerNotificationActions();

    // profile
    const userProfile = profile.getProfile();
    document.getElementById('profile-name').value = userProfile.name || '';
    document.getElementById('profile-age').value = userProfile.age || '';
    document.getElementById('profile-gender').value = userProfile.gender || '';
    document.getElementById('profile-weight').value = userProfile.weight || '';
    document.getElementById('profile-height').value = userProfile.height || '';

    const getDynamicGreeting = () => {
      const hr = new Date().getHours();
      if (hr < 12) return 'Good morning';
      if (hr < 18) return 'Good afternoon';
      return 'Good evening';
    };
    greeting.textContent = `${getDynamicGreeting()}, ${userProfile.name || 'Admin'}!`;

    ui.renderAll();
    ui.navigateTo('today-page');

    scheduleAllNotifications();
  }

  // listen for native notification button taps (Yes / No)
  const cap = window.Capacitor;
  const lnGlobal =
    cap?.Plugins?.LocalNotifications || window.CapacitorPlugins?.LocalNotifications;
  if (lnGlobal && lnGlobal.addListener) {
    lnGlobal.addListener('localNotificationActionPerformed', (performed) => {
      console.log('[notifications] action performed', performed);
      handleNotificationAction(performed);
    });
  }

  init();
});
