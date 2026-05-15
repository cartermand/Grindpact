
Copy

// ── GrindPact app.js ─────────────────────────────────────────────────────────
// Runs after firebase-ready event. All Firebase calls go through window._fb.
 
let db, fbRef, fbSet, fbGet, fbOnValue, fbPush, fbServerTimestamp;
let firebaseReady = false;
 
window.addEventListener('firebase-ready', () => {
  const f = window._fb;
  db = f.db; fbRef = f.ref; fbSet = f.set; fbGet = f.get;
  fbOnValue = f.onValue; fbPush = f.push; fbServerTimestamp = f.serverTimestamp;
  firebaseReady = true;
  initApp();
});
 
// ── Local state ───────────────────────────────────────────────────────────────
let state = {
  userName: '',
  myCode: '',
  friendCode: '',
  friendName: '',
  workouts: [],       // [{id,name,type,duration,notes,date,ts}]
  notifications: [],  // [{text,dotClass,time}]
  settings: {
    notifPermission: false,
    reminderTime: '',
    friendAlerts: true,
    streakAlerts: true,
  },
  streak: 0,
  reminderTimer: null,
};
 
// ── Persistence ───────────────────────────────────────────────────────────────
function saveLocal() {
  localStorage.setItem('grindpact_state', JSON.stringify(state));
}
function loadLocal() {
  try {
    const raw = localStorage.getItem('grindpact_state');
    if (raw) state = { ...state, ...JSON.parse(raw) };
  } catch(e) {}
}
 
// ── Init ──────────────────────────────────────────────────────────────────────
function initApp() {
  loadLocal();
  updateGreeting();
 
  if (!state.userName) {
    showScreen('onboard');
  } else {
    showScreen('app');
    bootApp();
  }
}
 
function bootApp() {
  if (!state.myCode) {
    state.myCode = genCode();
    saveLocal();
  }
 
  document.getElementById('userPill').textContent = state.userName;
  document.getElementById('myCode').textContent   = state.myCode;
  document.getElementById('myCode2').textContent  = state.myCode;
  document.getElementById('profileNameDisplay').textContent = state.userName;
  document.getElementById('profileCode').textContent = state.myCode;
 
  // Restore settings UI
  const s = state.settings;
  document.getElementById('notifStatus').textContent =
    Notification.permission === 'granted' ? '✅ Enabled' : 'Not enabled';
  document.getElementById('notifPermBtn').textContent =
    Notification.permission === 'granted' ? 'Enabled ✓' : 'Enable';
  document.getElementById('notifPermBtn').disabled = Notification.permission === 'granted';
  document.getElementById('reminderTime').value = s.reminderTime || '';
  document.getElementById('friendAlertToggle').checked  = s.friendAlerts !== false;
  document.getElementById('streakAlertToggle').checked  = s.streakAlerts !== false;
 
  renderDashboard();
  renderWorkoutHistory();
  renderFriendTab();
  renderNotifBadge();
 
  if (state.friendCode && firebaseReady) subscribeToFriend();
  scheduleReminder();
}
 
// ── Screens ───────────────────────────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.classList.add('hidden');
  });
  const el = document.getElementById('screen-' + name);
  el.classList.remove('hidden');
  el.classList.add('active');
}
 
// ── Onboarding ────────────────────────────────────────────────────────────────
window.setName = function() {
  const name = document.getElementById('input-name').value.trim();
  if (!name) return shake('input-name');
  state.userName = name;
  state.myCode   = genCode();
  saveLocal();
  document.getElementById('step-name').classList.add('hidden');
  document.getElementById('myCode').textContent = state.myCode;
  document.getElementById('step-link').classList.remove('hidden');
};
 
window.skipLink = function() {
  showScreen('app');
  bootApp();
};
 
window.linkFriend = function() {
  const code = document.getElementById('input-friend-code').value.trim().toUpperCase();
  if (!code || code.length < 4) return shake('input-friend-code');
  state.friendCode = code;
  saveLocal();
  showScreen('app');
  bootApp();
};
 
window.linkFriend2 = function() {
  const code = document.getElementById('input-friend-code2').value.trim().toUpperCase();
  if (!code || code.length < 4) return shake('input-friend-code2');
  state.friendCode = code;
  saveLocal();
  renderFriendTab();
  if (firebaseReady) subscribeToFriend();
  toast('Linked! Waiting for your friend to show up.');
};
 
// ── Tab switching ─────────────────────────────────────────────────────────────
window.switchTab = function(btn, name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => { p.classList.remove('active'); p.classList.add('hidden'); });
  btn.classList.add('active');
  const panel = document.getElementById('tab-' + name);
  panel.classList.remove('hidden');
  panel.classList.add('active');
};
 
// ── Dashboard ─────────────────────────────────────────────────────────────────
function renderDashboard() {
  updateGreeting();
 
  const myStreak = calcStreak(state.workouts);
  state.streak = myStreak;
  const thisWeek = workoutsThisWeek(state.workouts);
 
  document.getElementById('stat-myWeek').textContent = thisWeek;
  document.getElementById('stat-myStreak').textContent = myStreak > 0 ? myStreak + '🔥' : '0';
  document.getElementById('weekStatus').textContent = thisWeek >= 3 ? 'On track 💪' : 'Keep going!';
  document.getElementById('weekStatus').className = 'chip ' + (thisWeek >= 3 ? 'chip-green' : 'chip-orange');
 
  // Week dots
  const dotsEl = document.getElementById('weekDots');
  dotsEl.innerHTML = '';
  const days = ['S','M','T','W','T','F','S'];
  const today = new Date().getDay();
  const weekStart = getWeekStart();
  days.forEach((d, i) => {
    const dot = document.createElement('div');
    const dayDate = new Date(weekStart);
    dayDate.setDate(weekStart.getDate() + i);
    const hasWorkout = state.workouts.some(w => sameDay(new Date(w.date), dayDate));
    dot.className = 'week-dot' + (hasWorkout ? ' done' : '') + (i === today ? ' today' : '');
    dot.innerHTML = `<span>${d}</span>`;
    dotsEl.appendChild(dot);
  });
 
  // Today chip
  const todayLogged = state.workouts.some(w => sameDay(new Date(w.date), new Date()));
  const todayChip = document.getElementById('todayChip');
  todayChip.textContent = todayLogged ? 'Logged ✓' : 'Not yet';
  todayChip.className   = 'chip ' + (todayLogged ? 'chip-green' : 'chip-orange');
}
 
window.quickLog = function() {
  const name = document.getElementById('quickName').value.trim();
  const type = document.getElementById('quickType').value;
  const dur  = parseInt(document.getElementById('quickDur').value) || 30;
  if (!name) return shake('quickName');
  addWorkout({ name, type, duration: dur, notes: '' });
  document.getElementById('quickName').value = '';
  document.getElementById('quickDur').value  = '';
};
 
function updateGreeting() {
  const h = new Date().getHours();
  const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const el = document.getElementById('greeting');
  if (el) el.textContent = `${g}, ${state.userName || 'friend'} 👋`;
}
 
// ── Workouts tab ──────────────────────────────────────────────────────────────
window.logWorkout = function() {
  const name = document.getElementById('wName').value.trim();
  const type = document.getElementById('wType').value;
  const dur  = parseInt(document.getElementById('wDur').value) || 0;
  const notes = document.getElementById('wNotes').value.trim();
  if (!name) return shake('wName');
  addWorkout({ name, type, duration: dur, notes });
  document.getElementById('wName').value  = '';
  document.getElementById('wDur').value   = '';
  document.getElementById('wNotes').value = '';
};
 
function addWorkout(data) {
  const workout = {
    id:       Date.now().toString(),
    name:     data.name,
    type:     data.type || 'Other',
    duration: data.duration || 0,
    notes:    data.notes || '',
    date:     new Date().toISOString(),
    ts:       Date.now(),
  };
  state.workouts.unshift(workout);
  saveLocal();
 
  // Push to Firebase if connected
  if (firebaseReady && state.myCode) {
    fbSet(fbRef(db, `users/${state.myCode}/workouts/${workout.id}`), workout).catch(() => {});
    fbSet(fbRef(db, `users/${state.myCode}/name`), state.userName).catch(() => {});
  }
 
  renderDashboard();
  renderWorkoutHistory();
 
  // Streak milestone notification
  const streak = calcStreak(state.workouts);
  if (state.settings.streakAlerts !== false && [3,7,14,21,30].includes(streak)) {
    pushNotif(`🔥 ${streak}-day streak! You're on fire!`, 'nd-orange');
    sendBrowserNotif('GrindPact 🔥', `${streak}-day streak — absolutely crushing it!`);
  } else {
    pushNotif(`✅ Logged: ${workout.name} (${workout.duration || '?'} min)`, 'nd-green');
    sendBrowserNotif('GrindPact', `"${workout.name}" logged! Keep the streak alive.`);
  }
 
  toast(`"${workout.name}" logged 💪`);
}
 
function renderWorkoutHistory() {
  const list = document.getElementById('historyList');
  const total = document.getElementById('totalCount');
  total.textContent = state.workouts.length + ' logged';
 
  if (!state.workouts.length) {
    list.innerHTML = '<div class="empty-state">No workouts logged yet. Get moving! 💪</div>';
    return;
  }
 
  const icons = { Cardio:'fa-person-running', Weights:'fa-dumbbell', HIIT:'fa-fire-flame-curved',
                  Yoga:'fa-spa', Sports:'fa-futbol', Other:'fa-bolt' };
 
  list.innerHTML = state.workouts.slice(0, 20).map(w => `
    <div class="workout-item">
      <div class="wi-icon"><i class="fa ${icons[w.type]||'fa-bolt'}"></i></div>
      <div class="wi-info">
        <div class="wi-name">${esc(w.name)}</div>
        <div class="wi-meta">${w.duration ? w.duration+' min · ' : ''}${w.type} · ${fmtDate(w.date)}</div>
      </div>
      <button class="wi-delete" onclick="deleteWorkout('${w.id}')" title="Delete"><i class="fa fa-trash"></i></button>
    </div>`).join('');
}
 
window.deleteWorkout = function(id) {
  state.workouts = state.workouts.filter(w => w.id !== id);
  saveLocal();
  if (firebaseReady && state.myCode) {
    fbSet(fbRef(db, `users/${state.myCode}/workouts/${id}`), null).catch(() => {});
  }
  renderWorkoutHistory();
  renderDashboard();
};
 
// ── Friend tab ────────────────────────────────────────────────────────────────
function renderFriendTab() {
  const linked = !!state.friendCode;
  document.getElementById('friendLinked').classList.toggle('hidden', !linked);
  document.getElementById('friendUnlinked').classList.toggle('hidden', linked);
 
  if (linked) {
    const myStreak = calcStreak(state.workouts);
    const myWeek   = workoutsThisWeek(state.workouts);
    const initials = state.userName.slice(0,2).toUpperCase();
 
    document.getElementById('yourAvatar').textContent = initials;
    document.getElementById('yourNameDisplay').textContent = state.userName;
    document.getElementById('yourStreakBig').textContent   = myStreak > 0 ? myStreak+'🔥' : '0';
    document.getElementById('yourWeekBig').textContent     = myWeek + ' this week';
  }
}
 
function updateFriendDisplay(friendWorkouts, friendName) {
  state.friendName = friendName || 'Friend';
  document.getElementById('stat-friendStreak').textContent =
    calcStreak(friendWorkouts) + '🔥';
  document.getElementById('friendNameDisplay').textContent = state.friendName;
  const initials = state.friendName.slice(0,2).toUpperCase();
  document.getElementById('friendAvatar').textContent = initials;
  const fStreak = calcStreak(friendWorkouts);
  const fWeek   = workoutsThisWeek(friendWorkouts);
  document.getElementById('friendStreakBig').textContent = fStreak > 0 ? fStreak+'🔥' : '0';
  document.getElementById('friendWeekBig').textContent   = fWeek + ' this week';
 
  // Friend workout list
  const fList = document.getElementById('friendWorkoutList');
  const icons = { Cardio:'fa-person-running', Weights:'fa-dumbbell', HIIT:'fa-fire-flame-curved',
                  Yoga:'fa-spa', Sports:'fa-futbol', Other:'fa-bolt' };
  if (!friendWorkouts.length) {
    fList.innerHTML = '<div class="empty-state">No workouts from your friend yet</div>';
  } else {
    fList.innerHTML = friendWorkouts.slice(0,10).map(w => `
      <div class="workout-item">
        <div class="wi-icon" style="background:#1e1a2e;color:#a78bfa"><i class="fa ${icons[w.type]||'fa-bolt'}"></i></div>
        <div class="wi-info">
          <div class="wi-name">${esc(w.name)}</div>
          <div class="wi-meta">${w.duration ? w.duration+' min · ' : ''}${w.type} · ${fmtDate(w.date)}</div>
        </div>
      </div>`).join('');
  }
 
  // Friend activity feed on dashboard
  const feed = document.getElementById('friendFeed');
  if (friendWorkouts.length) {
    feed.innerHTML = friendWorkouts.slice(0,3).map(w =>
      `<div class="workout-item">
        <div class="wi-icon" style="background:#1e1a2e;color:#a78bfa"><i class="fa ${icons[w.type]||'fa-bolt'}"></i></div>
        <div class="wi-info">
          <div class="wi-name">${esc(state.friendName)}: ${esc(w.name)}</div>
          <div class="wi-meta">${w.duration ? w.duration+' min · ' : ''}${w.type} · ${fmtDate(w.date)}</div>
        </div>
      </div>`).join('');
  }
}
 
function subscribeToFriend() {
  if (!state.friendCode) return;
  const friendRef = fbRef(db, `users/${state.friendCode}`);
  let lastKnownCount = 0;
 
  fbOnValue(friendRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    const friendName = data.name || 'Friend';
    const rawWorkouts = data.workouts ? Object.values(data.workouts) : [];
    rawWorkouts.sort((a,b) => b.ts - a.ts);
 
    // Alert if new workout appeared and we already had some
    if (state.settings.friendAlerts !== false && rawWorkouts.length > lastKnownCount && lastKnownCount > 0) {
      const newest = rawWorkouts[0];
      pushNotif(`💪 ${friendName} just logged "${newest.name}"!`, 'nd-purple');
      sendBrowserNotif('GrindPact', `${friendName} just logged a workout — don't let them pull ahead!`);
    }
    lastKnownCount = rawWorkouts.length;
 
    updateFriendDisplay(rawWorkouts, friendName);
 
    // Vibes feed
    if (data.vibes) {
      const vibes = Object.values(data.vibes).sort((a,b) => b.ts - a.ts);
      vibes.slice(0,3).forEach(v => {
        // only show vibes sent TO us (addressed to myCode)
        if (v.to === state.myCode && v.ts > (state.lastVibeCheck || 0)) {
          state.lastVibeCheck = v.ts;
          saveLocal();
          const msg = v.type === 'fire'  ? `🔥 ${friendName} sent you a nudge — get moving!`
                    : v.type === 'clap'  ? `👏 ${friendName} hyped you up!`
                    : `💀 ${friendName} says: you slacking??`;
          pushNotif(msg, 'nd-orange');
          sendBrowserNotif('GrindPact', msg);
          toast(msg);
        }
      });
    }
  });
}
 
window.sendVibe = function(type) {
  const btn = event.currentTarget;
  btn.disabled = true;
 
  const vibeMessages = {
    fire:  '🔥 Nudge sent!',
    clap:  '👏 Hype sent!',
    skull: '💀 Sent the wake-up call!'
  };
 
  toast(vibeMessages[type]);
 
  if (firebaseReady && state.friendCode && state.myCode) {
    const vibe = { type, from: state.myCode, to: state.friendCode, ts: Date.now() };
    // Write to friend's vibe inbox
    fbPush(fbRef(db, `users/${state.friendCode}/vibes`), vibe).catch(() => {});
  }
 
  setTimeout(() => { btn.disabled = false; }, 3000);
};
 
// ── Notifications ─────────────────────────────────────────────────────────────
window.requestNotifPermission = async function() {
  if (!('Notification' in window)) {
    showTestResult('Notifications not supported in this browser.', true);
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    state.settings.notifPermission = true;
    saveLocal();
    document.getElementById('notifStatus').textContent = '✅ Enabled';
    document.getElementById('notifPermBtn').textContent = 'Enabled ✓';
    document.getElementById('notifPermBtn').disabled = true;
    sendBrowserNotif('GrindPact 🔥', "Notifications are on! We'll keep you both accountable.");
    document.getElementById('permBanner')?.classList.add('hidden');
  } else {
    showTestResult('Permission denied. Enable it in your browser settings.', true);
  }
};
 
function sendBrowserNotif(title, body) {
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      body,
      icon: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/1f525.png',
    });
  } catch(e) {}
}
 
function pushNotif(text, dotClass = 'nd-green') {
  const entry = { text, dotClass, time: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) };
  state.notifications.unshift(entry);
  if (state.notifications.length > 50) state.notifications.pop();
  saveLocal();
  renderNotifBadge();
  renderNotifList();
}
 
function renderNotifBadge() {
  const badge = document.getElementById('notifBadge');
  const count = state.notifications.length;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}
 
function renderNotifList() {
  const list = document.getElementById('notifList');
  if (!state.notifications.length) {
    list.innerHTML = '<div class="empty-state">No notifications yet</div>';
    return;
  }
  list.innerHTML = state.notifications.map(n =>
    `<div class="notif-entry">
      <div class="notif-dot ${n.dotClass}"></div>
      <div>
        <div>${esc(n.text)}</div>
        <div class="notif-entry-time">${n.time}</div>
      </div>
    </div>`).join('');
}
 
window.showNotifPanel = function() {
  document.getElementById('notifOverlay').classList.remove('hidden');
  document.getElementById('notifPanel').classList.remove('hidden');
  renderNotifList();
};
window.hideNotifPanel = function() {
  document.getElementById('notifOverlay').classList.add('hidden');
  document.getElementById('notifPanel').classList.add('hidden');
};
window.clearNotifs = function() {
  state.notifications = [];
  saveLocal();
  renderNotifBadge();
  renderNotifList();
};
 
// ── Reminder scheduler ────────────────────────────────────────────────────────
function scheduleReminder() {
  if (state.reminderTimer) clearTimeout(state.reminderTimer);
  const time = state.settings.reminderTime;
  if (!time) return;
  const [h, m] = time.split(':').map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1); // next day
  const ms = target - now;
  state.reminderTimer = setTimeout(() => {
    const todayLogged = state.workouts.some(w => sameDay(new Date(w.date), new Date()));
    if (!todayLogged) {
      pushNotif("⏰ Reminder: you haven't logged today's workout yet!", 'nd-orange');
      sendBrowserNotif('GrindPact ⏰', "Hey! You haven't logged a workout today yet. Don't break your streak!");
    }
    scheduleReminder(); // re-schedule for next day
  }, ms);
}
 
window.saveReminderTime = function() {
  state.settings.reminderTime = document.getElementById('reminderTime').value;
  saveLocal();
  scheduleReminder();
  toast(state.settings.reminderTime ? `Reminder set for ${state.settings.reminderTime}` : 'Reminder off');
};
 
window.saveSetting = function(key, value) {
  state.settings[key] = value;
  saveLocal();
};
 
// ── TEST notifications ─────────────────────────────────────────────────────────
window.testNotif = function(type) {
  if (Notification.permission !== 'granted') {
    showTestResult('⚠️ Enable notifications first (button above) before testing!', true);
    return;
  }
 
  const tests = {
    reminder: () => {
      sendBrowserNotif('GrindPact ⏰', "Hey! You haven't logged a workout today. Don't break your streak!");
      pushNotif("⏰ [TEST] Workout reminder fired", 'nd-orange');
    },
    friend: () => {
      const name = state.friendName || 'Alex';
      sendBrowserNotif('GrindPact 💪', `${name} just logged a workout — don't let them pull ahead!`);
      pushNotif(`[TEST] 💪 ${name} just logged a workout!`, 'nd-purple');
    },
    streak: () => {
      sendBrowserNotif('GrindPact 🔥', "7-day streak — absolutely crushing it!");
      pushNotif("[TEST] 🔥 7-day streak! You're on fire!", 'nd-orange');
    },
    nudge: () => {
      const name = state.friendName || 'Alex';
      sendBrowserNotif('GrindPact', `${name} sent you a nudge — get moving!`);
      pushNotif(`[TEST] 🔥 ${name} sent you a nudge!`, 'nd-orange');
    },
    congrats: () => {
      sendBrowserNotif('GrindPact ✅', '"Morning Run" logged! Keep the streak alive.');
      pushNotif("[TEST] ✅ Workout logged successfully!", 'nd-green');
    },
    all: () => {
      ['reminder','friend','streak','nudge','congrats'].forEach((t, i) => {
        setTimeout(() => window.testNotif(t), i * 700);
      });
      showTestResult('🧪 Firing all 5 notifications with 0.7s delay each!');
      return;
    }
  };
 
  if (tests[type]) tests[type]();
 
  if (type !== 'all') {
    const labels = { reminder:'Workout reminder', friend:'Friend logged', streak:'Streak milestone', nudge:'Nudge received', congrats:'Workout logged' };
    showTestResult(`✅ "${labels[type]}" notification sent! Check your browser.`);
  }
 
  renderNotifBadge();
  renderNotifList();
};
 
function showTestResult(msg, isError = false) {
  const el = document.getElementById('testResult');
  el.textContent = msg;
  el.className = 'test-result' + (isError ? ' error' : '');
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 5000);
}
 
// ── Settings ──────────────────────────────────────────────────────────────────
window.changeName = function() {
  const name = prompt('Enter your new display name:', state.userName);
  if (name && name.trim()) {
    state.userName = name.trim();
    saveLocal();
    document.getElementById('userPill').textContent        = state.userName;
    document.getElementById('profileNameDisplay').textContent = state.userName;
    updateGreeting();
  }
};
 
window.copyCode = function() {
  navigator.clipboard.writeText(state.myCode).then(() => toast('Code copied!')).catch(() => {});
};
 
window.resetApp = function() {
  if (!confirm('Reset all app data? This cannot be undone.')) return;
  localStorage.removeItem('grindpact_state');
  location.reload();
};
 
// ── Helpers ───────────────────────────────────────────────────────────────────
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length:6}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
}
 
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}
 
function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
}
 
function workoutsThisWeek(workouts) {
  const start = getWeekStart();
  start.setHours(0,0,0,0);
  const daysHit = new Set();
  workouts.forEach(w => {
    const d = new Date(w.date);
    if (d >= start) daysHit.add(d.toDateString());
  });
  return daysHit.size;
}
 
function calcStreak(workouts) {
  if (!workouts.length) return 0;
  const daySet = new Set(workouts.map(w => new Date(w.date).toDateString()));
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (daySet.has(d.toDateString())) streak++;
    else if (i > 0) break; // allow missing today
  }
  return streak;
}
 
function fmtDate(iso) {
  const d = new Date(iso);
  const today = new Date();
  if (sameDay(d, today)) return 'Today';
  const yesterday = new Date(); yesterday.setDate(today.getDate()-1);
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
}
 
function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
 
function shake(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.borderColor = '#ef4444';
  el.animate([{transform:'translateX(-4px)'},{transform:'translateX(4px)'},{transform:'translateX(0)'}], {duration:200});
  setTimeout(() => el.style.borderColor = '', 1000);
}
 
function toast(msg) {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.id = 'toast';
  t.textContent = msg;
  Object.assign(t.style, {
    position:'fixed', bottom:'24px', left:'50%', transform:'translateX(-50%) translateY(0)',
    background:'#22c55e', color:'#0d0f0e', padding:'10px 18px', borderRadius:'10px',
    fontSize:'13px', fontWeight:'600', zIndex:'999', whiteSpace:'nowrap',
    transition:'opacity 0.3s', pointerEvents:'none'
  });
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2200);
}
 
