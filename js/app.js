'use strict';

/* =============================================
   UTILITIES
   ============================================= */

// XSS-safe HTML escaping using a reusable element
const _escDiv = document.createElement('div');

function escapeHtml(str) {
  _escDiv.textContent = str;
  return _escDiv.innerHTML;
}

// Toast notification (supports optional 'warn' type)
let _toastTimer;

function showToast(msg, type) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'show' + (type === 'warn' ? ' warn' : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { toast.className = ''; }, 3000);
}

// Safe localStorage read with fallback
function storageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

// Safe localStorage write
function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) { /* storage unavailable (private mode, full quota) — silent */ }
}

/* =============================================
   THEME (DARK / LIGHT)
   ============================================= */

// Apply saved theme immediately to avoid flash
let isDark = storageGet('dashboard_theme', 'dark') !== 'light';

function applyTheme(dark) {
  isDark = dark;
  document.body.classList.toggle('light', !dark);
  document.getElementById('theme-icon').textContent  = dark ? '☀️' : '🌙';
  document.getElementById('theme-label').textContent = dark ? 'Light' : 'Dark';
  storageSet('dashboard_theme', dark ? 'dark' : 'light');
}

function toggleTheme() {
  applyTheme(!isDark);
}

// Initialise on load
applyTheme(isDark);

window.toggleTheme = toggleTheme;

/* =============================================
   CLOCK & GREETING
   ============================================= */

const DAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday',
  'Thursday', 'Friday', 'Saturday'
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Cache DOM references — avoids repeated getElementById calls every second
const elH     = document.getElementById('c-h');
const elM     = document.getElementById('c-m');
const elS     = document.getElementById('c-s');
const elDate  = document.getElementById('clock-date');
const elGreetText = document.getElementById('greeting-text');

// User's display name — persisted in localStorage
let userName = storageGet('dashboard_username', '') || 'friend';

// Track last rendered values so we only touch the DOM when something changes
let _lastH = '', _lastM = '', _lastS = '', _lastDate = '', _lastGreet = '';

function updateClock() {
  const now = new Date();

  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');

  if (h !== _lastH) { elH.textContent = h; _lastH = h; }
  if (m !== _lastM) { elM.textContent = m; _lastM = m; }
  if (s !== _lastS) { elS.textContent = s; _lastS = s; }

  // Date string — only changes once per day
  const dateStr = `${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
  if (dateStr !== _lastDate) {
    elDate.textContent = dateStr;
    _lastDate = dateStr;
  }

  // Greeting — changes at midnight, noon, and 17:00
  const hr = now.getHours();
  const greetWord  = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  const greetEmoji = hr < 12 ? '☀️'           : hr < 17 ? '🌤️'            : '🌙';
  const greetHTML  = `${greetWord}, <em>${escapeHtml(userName)}</em> ${greetEmoji}`;
  if (greetHTML !== _lastGreet) {
    elGreetText.innerHTML = greetHTML;
    _lastGreet = greetHTML;
  }
}

/* ── Edit name ── */
function startEditName() {
  const input = document.getElementById('name-input');
  input.value = userName === 'friend' ? '' : userName;
  document.getElementById('btn-edit-name').style.display  = 'none';
  document.getElementById('greeting-edit').style.display  = 'inline-flex';
  input.focus();
}

function saveName() {
  const input   = document.getElementById('name-input');
  const trimmed = input.value.trim();
  userName = trimmed || 'friend';
  storageSet('dashboard_username', userName);
  _lastGreet = ''; // force greeting re-render
  updateClock();
  cancelEditName();
  showToast(`Hi, ${userName}! 👋`);
}

function cancelEditName() {
  document.getElementById('btn-edit-name').style.display  = '';
  document.getElementById('greeting-edit').style.display  = 'none';
}

// Save on Enter, cancel on Escape inside the name input
document.getElementById('name-input').addEventListener('keydown', e => {
  if (e.key === 'Enter')  saveName();
  if (e.key === 'Escape') cancelEditName();
});

// Expose to HTML onclick
window.startEditName  = startEditName;
window.saveName       = saveName;
window.cancelEditName = cancelEditName;

// Use recursive setTimeout instead of setInterval to avoid timer drift
(function clockTick() {
  updateClock();
  const ms = 1000 - new Date().getMilliseconds(); // fire exactly on the next second
  setTimeout(clockTick, ms);
})();

/* =============================================
   WEATHER
   ============================================= */

// WMO weather interpretation codes → label + SVG icon
// https://open-meteo.com/en/docs#weathervariables
const WEATHER_CODES = {
  0:  { label: 'Clear sky',         icon: 'sun' },
  1:  { label: 'Mainly clear',      icon: 'sun' },
  2:  { label: 'Partly cloudy',     icon: 'cloud-sun' },
  3:  { label: 'Overcast',          icon: 'cloud' },
  45: { label: 'Foggy',             icon: 'cloud' },
  48: { label: 'Icy fog',           icon: 'cloud' },
  51: { label: 'Light drizzle',     icon: 'cloud-rain' },
  53: { label: 'Drizzle',           icon: 'cloud-rain' },
  55: { label: 'Heavy drizzle',     icon: 'cloud-rain' },
  61: { label: 'Light rain',        icon: 'cloud-rain' },
  63: { label: 'Rain',              icon: 'cloud-rain' },
  65: { label: 'Heavy rain',        icon: 'cloud-rain' },
  71: { label: 'Light snow',        icon: 'cloud-snow' },
  73: { label: 'Snow',              icon: 'cloud-snow' },
  75: { label: 'Heavy snow',        icon: 'cloud-snow' },
  77: { label: 'Snow grains',       icon: 'cloud-snow' },
  80: { label: 'Light showers',     icon: 'cloud-rain' },
  81: { label: 'Showers',           icon: 'cloud-rain' },
  82: { label: 'Heavy showers',     icon: 'cloud-rain' },
  85: { label: 'Snow showers',      icon: 'cloud-snow' },
  86: { label: 'Heavy snow shower', icon: 'cloud-snow' },
  95: { label: 'Thunderstorm',      icon: 'storm' },
  96: { label: 'Thunderstorm',      icon: 'storm' },
  99: { label: 'Thunderstorm',      icon: 'storm' },
};

// Inline SVG icons — no external files, works offline
const WEATHER_SVGS = {

  sun: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="4" fill="#f5c542"/>
    <g stroke="#f5c542" stroke-width="1.8" stroke-linecap="round">
      <line x1="12" y1="2"  x2="12" y2="5"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
      <line x1="2"  y1="12" x2="5"  y2="12"/>
      <line x1="19" y1="12" x2="22" y2="12"/>
      <line x1="4.22"  y1="4.22"  x2="6.34"  y2="6.34"/>
      <line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/>
      <line x1="19.78" y1="4.22"  x2="17.66" y2="6.34"/>
      <line x1="6.34"  y1="17.66" x2="4.22"  y2="19.78"/>
    </g>
  </svg>`,

  'cloud-sun': `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="15.5" cy="7.5" r="3" fill="#f5c542"/>
    <g stroke="#f5c542" stroke-width="1.5" stroke-linecap="round">
      <line x1="15.5" y1="2"   x2="15.5" y2="3.5"/>
      <line x1="15.5" y1="11.5" x2="15.5" y2="13"/>
      <line x1="10"   y1="7.5" x2="11.5" y2="7.5"/>
      <line x1="19.5" y1="7.5" x2="21"   y2="7.5"/>
      <line x1="11.7" y1="3.7" x2="12.76" y2="4.76"/>
      <line x1="18.24" y1="10.24" x2="19.3" y2="11.3"/>
      <line x1="19.3"  y1="3.7"   x2="18.24" y2="4.76"/>
      <line x1="12.76" y1="10.24" x2="11.7"  y2="11.3"/>
    </g>
    <path d="M7 19a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.5 1.6A3.5 3.5 0 0 1 17 19H7z"
          fill="#93b4d4" stroke="#7ba0c0" stroke-width="1"/>
  </svg>`,

  cloud: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 19a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.5 1.6A3.5 3.5 0 0 1 16 19H6z"
          fill="#93b4d4" stroke="#7ba0c0" stroke-width="1.2"/>
  </svg>`,

  'cloud-rain': `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 15a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.5 1.6A3.5 3.5 0 0 1 16 15H6z"
          fill="#93b4d4" stroke="#7ba0c0" stroke-width="1.2"/>
    <g stroke="#6b9fc4" stroke-width="1.5" stroke-linecap="round">
      <line x1="8"  y1="17" x2="7"  y2="20"/>
      <line x1="12" y1="17" x2="11" y2="20"/>
      <line x1="16" y1="17" x2="15" y2="20"/>
    </g>
  </svg>`,

  'cloud-snow': `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 15a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.5 1.6A3.5 3.5 0 0 1 16 15H6z"
          fill="#b8d4ec" stroke="#96bcdc" stroke-width="1.2"/>
    <g fill="#6b9fc4">
      <circle cx="8"  cy="18.5" r="1.1"/>
      <circle cx="12" cy="18.5" r="1.1"/>
      <circle cx="16" cy="18.5" r="1.1"/>
      <circle cx="10" cy="21"   r="1.1"/>
      <circle cx="14" cy="21"   r="1.1"/>
    </g>
  </svg>`,

  storm: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 14a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.5 1.6A3.5 3.5 0 0 1 16 14H6z"
          fill="#8090b0" stroke="#6878a0" stroke-width="1.2"/>
    <polyline points="13,14 10,19 13,19 10,24"
              fill="none" stroke="#f5c542" stroke-width="1.8"
              stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
};

function getWeatherSvg(iconKey) {
  return WEATHER_SVGS[iconKey] || WEATHER_SVGS['cloud'];
}

function setWeatherUI(svgHtml, tempText, descText, cityText) {
  document.getElementById('weather-icon').innerHTML    = svgHtml;
  document.getElementById('weather-temp').textContent  = tempText;
  document.getElementById('weather-desc').textContent  = descText;
  document.getElementById('weather-city').textContent  = cityText || '';
}

function setWeatherLoading() {
  document.getElementById('weather-icon').innerHTML = '';
  document.getElementById('weather-temp').textContent = '';
  document.getElementById('weather-city').textContent = '';
  document.getElementById('weather-desc').innerHTML =
    '<span class="weather-loading">Fetching weather…</span>';
}

function setWeatherError(msg) {
  document.getElementById('weather-icon').innerHTML = '📍';
  document.getElementById('weather-temp').textContent = '';
  document.getElementById('weather-city').textContent = '';
  document.getElementById('weather-desc').innerHTML =
    `<span class="weather-error">${msg}</span>`;
}

// Reverse-geocode lat/lon → city name via Nominatim (OpenStreetMap, no key needed)
async function fetchCityName(lat, lon) {
  const url =
    `https://nominatim.openstreetmap.org/reverse` +
    `?lat=${lat}&lon=${lon}&format=json&zoom=10` +
    `&accept-language=en`;

  const res  = await fetch(url, {
    headers: { 'Accept-Language': 'en' }
  });
  if (!res.ok) return '';
  const data = await res.json();

  // Prefer city > town > village > county, fallback to country
  const addr = data.address || {};
  return (
    addr.city      ||
    addr.town      ||
    addr.village   ||
    addr.county    ||
    addr.state     ||
    addr.country   ||
    ''
  );
}

async function fetchWeather(lat, lon) {
  // Run weather + reverse-geocode requests in parallel
  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weathercode` +
    `&temperature_unit=celsius` +
    `&timezone=auto`;

  const [weatherRes, cityName] = await Promise.all([
    fetch(weatherUrl),
    fetchCityName(lat, lon).catch(() => ''),
  ]);

  if (!weatherRes.ok) throw new Error(`HTTP ${weatherRes.status}`);
  const data = await weatherRes.json();

  const temp = Math.round(data.current.temperature_2m);
  const code = data.current.weathercode;
  const info = WEATHER_CODES[code] || { label: 'Unknown', icon: 'cloud' };

  setWeatherUI(getWeatherSvg(info.icon), `${temp}°C`, info.label, cityName);
}

function initWeather() {
  if (!navigator.geolocation) {
    setWeatherError('Geolocation not supported');
    return;
  }

  setWeatherLoading();

  navigator.geolocation.getCurrentPosition(
    pos => fetchWeather(pos.coords.latitude, pos.coords.longitude)
           .catch(() => setWeatherError('Weather unavailable')),
    err => {
      const msgs = {
        1: 'Location access denied',
        2: 'Location unavailable',
        3: 'Location request timed out',
      };
      setWeatherError(msgs[err.code] || 'Location error');
    },
    { timeout: 10000, maximumAge: 300000 } // cache position up to 5 minutes
  );
}

// Fetch weather on load, then refresh every 15 minutes
initWeather();
setInterval(initWeather, 15 * 60 * 1000);

/* =============================================
   TO-DO LIST
   ============================================= */

let todos = storageGet('dashboard_todos', []);
if (!Array.isArray(todos)) todos = [];

// Index of the task currently being edited (-1 = none)
let editingIndex = -1;

function saveTodos() {
  storageSet('dashboard_todos', todos);
}

function renderTodos() {
  const list     = document.getElementById('todo-list');
  const statsEl  = document.getElementById('todo-stats');
  const bar      = document.getElementById('todo-progress-bar');
  const barWrap  = bar.parentElement;
  const clearBtn = document.getElementById('btn-clear-done');

  const total = todos.length;
  const done  = todos.filter(t => t.done).length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

  // Stats text
  statsEl.innerHTML = total === 0 ? '' : `<b>${done}</b> of ${total} completed`;

  // Progress bar
  bar.style.width = pct + '%';
  barWrap.setAttribute('aria-valuenow', pct);

  // Show "Clear done" only when there are completed tasks
  clearBtn.style.display = done > 0 ? 'block' : 'none';

  // Empty state
  if (total === 0) {
    list.innerHTML = '<li class="todo-empty">No tasks yet — add one above ✨</li>';
    return;
  }

  // Build list items — use sorted view, but keep original index for mutations
  const items = getSortedTodos().map((task) => {
    const i  = task._orig; // original index in `todos` array
    const li = document.createElement('li');
    li.className = `todo-item${task.done ? ' done' : ''}`;
    li.dataset.idx = i;

    // Checkbox
    const checkbox = document.createElement('input');
    checkbox.type      = 'checkbox';
    checkbox.className = 'todo-check';
    checkbox.checked   = task.done;
    checkbox.setAttribute('aria-label', task.text);
    checkbox.addEventListener('change', () => toggleTodo(i));

    // ── Editing mode ──
    if (editingIndex === i) {
      const editInput = document.createElement('input');
      editInput.type      = 'text';
      editInput.className = 'todo-edit-input';
      editInput.value     = task.text;
      editInput.maxLength = 120;
      editInput.setAttribute('aria-label', 'Edit task');

      // Confirm edit on Enter, cancel on Escape
      editInput.addEventListener('keydown', e => {
        if (e.key === 'Enter')  confirmEdit(i, editInput.value);
        if (e.key === 'Escape') cancelEdit();
      });

      // Confirm edit when focus leaves the input
      editInput.addEventListener('blur', () => confirmEdit(i, editInput.value));

      // Actions: confirm ✓ / cancel ✕
      const actions = document.createElement('div');
      actions.className = 'todo-actions';

      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'btn-edit';
      confirmBtn.title     = 'Save (Enter)';
      confirmBtn.textContent = '✓';
      confirmBtn.addEventListener('mousedown', e => {
        e.preventDefault(); // prevent blur from firing before click
        confirmEdit(i, editInput.value);
      });

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn-edit';
      cancelBtn.title     = 'Cancel (Esc)';
      cancelBtn.textContent = '✕';
      cancelBtn.addEventListener('mousedown', e => {
        e.preventDefault();
        cancelEdit();
      });

      actions.append(confirmBtn, cancelBtn);
      li.append(checkbox, editInput, actions);

      // Auto-focus and place cursor at end
      requestAnimationFrame(() => {
        editInput.focus();
        editInput.setSelectionRange(editInput.value.length, editInput.value.length);
      });

    // ── Normal (view) mode ──
    } else {
      const textSpan = document.createElement('span');
      textSpan.className   = 'todo-text';
      textSpan.textContent = task.text;
      textSpan.title       = task.done ? '' : 'Click to edit';

      // Click on text to enter edit mode (skip if task is done)
      if (!task.done) {
        textSpan.addEventListener('click', () => startEdit(i));
      }

      const actions = document.createElement('div');
      actions.className = 'todo-actions';

      // Edit pencil button
      const editBtn = document.createElement('button');
      editBtn.className   = 'btn-edit';
      editBtn.title       = 'Edit task';
      editBtn.textContent = '✏️';
      editBtn.style.display = task.done ? 'none' : '';
      editBtn.setAttribute('aria-label', 'Edit task');
      editBtn.addEventListener('click', () => startEdit(i));

      // Delete button
      const delBtn = document.createElement('button');
      delBtn.className   = 'btn btn-danger';
      delBtn.title       = 'Delete task';
      delBtn.textContent = '✕';
      delBtn.setAttribute('aria-label', 'Delete task');
      delBtn.addEventListener('click', () => deleteTodo(i));

      actions.append(editBtn, delBtn);
      li.append(checkbox, textSpan, actions);
    }

    return li;
  });

  list.replaceChildren(...items);
}

/* ── Sort ── */
let currentSort = storageGet('dashboard_todo_sort', 'default');

function getSortedTodos() {
  // Work on a shallow copy with original indices attached
  const indexed = todos.map((t, i) => ({ ...t, _orig: i }));
  switch (currentSort) {
    case 'az':
      return indexed.sort((a, b) => a.text.localeCompare(b.text));
    case 'za':
      return indexed.sort((a, b) => b.text.localeCompare(a.text));
    case 'active':
      return indexed.sort((a, b) => Number(a.done) - Number(b.done));
    case 'done':
      return indexed.sort((a, b) => Number(b.done) - Number(a.done));
    default:
      return indexed; // insertion order
  }
}

function applySort() {
  const sel = document.getElementById('todo-sort');
  currentSort = sel.value;
  storageSet('dashboard_todo_sort', currentSort);
  renderTodos();
}

// Initialise dropdown to saved value
window.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('todo-sort');
  if (sel) sel.value = currentSort;
});

window.applySort = applySort;

/* ── Add ── */
function addTodo() {
  const input = document.getElementById('todo-input');
  const text  = input.value.trim();
  if (!text) { input.focus(); return; }

  // Reject duplicate task names (case-insensitive)
  const isDuplicate = todos.some(
    t => t.text.toLowerCase() === text.toLowerCase()
  );
  if (isDuplicate) {
    input.classList.add('input-error');
    showToast('Task already exists!', 'warn');
    input.select();
    setTimeout(() => input.classList.remove('input-error'), 1200);
    return;
  }

  todos.unshift({ text, done: false, id: Date.now() });
  saveTodos();
  editingIndex = -1;
  renderTodos();
  input.value = '';
  input.focus();
  showToast('Task added ✓');
}

/* ── Toggle done ── */
function toggleTodo(i) {
  if (i < 0 || i >= todos.length) return;
  // Cancel any active edit when a checkbox is toggled
  if (editingIndex === i) editingIndex = -1;
  todos[i].done = !todos[i].done;
  saveTodos();
  renderTodos();
}

/* ── Delete ── */
function deleteTodo(i) {
  if (i < 0 || i >= todos.length) return;
  if (editingIndex === i) editingIndex = -1;
  else if (editingIndex > i) editingIndex--;
  todos.splice(i, 1);
  saveTodos();
  renderTodos();
}

/* ── Clear completed ── */
function clearDone() {
  const count = todos.filter(t => t.done).length;
  todos = todos.filter(t => !t.done);
  if (editingIndex >= todos.length) editingIndex = -1;
  saveTodos();
  renderTodos();
  showToast(`Cleared ${count} completed task${count !== 1 ? 's' : ''} ✓`);
}

/* ── Edit ── */
function startEdit(i) {
  if (todos[i].done) return; // don't edit completed tasks
  editingIndex = i;
  renderTodos();
}

function confirmEdit(i, newText) {
  const trimmed = (newText || '').trim();
  if (!trimmed) {
    // Empty text → cancel without saving
    cancelEdit();
    return;
  }
  editingIndex = -1;
  todos[i].text = trimmed;
  saveTodos();
  renderTodos();
  showToast('Task updated ✓');
}

function cancelEdit() {
  editingIndex = -1;
  renderTodos();
}

// Add task on Enter key
document.getElementById('todo-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') addTodo();
});

// Expose button-level functions to HTML onclick attributes
window.addTodo   = addTodo;
window.clearDone = clearDone;

renderTodos();

/* =============================================
   FOCUS TIMER
   ============================================= */

const RADIUS        = 72;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const ringFill = document.getElementById('ring-fill');
ringFill.style.strokeDasharray  = CIRCUMFERENCE;
ringFill.style.strokeDashoffset = 0;

// Default durations (minutes) per mode key
const DEFAULT_DURATIONS = { pomodoro: 25, shortBreak: 5, longBreak: 15 };

// Load saved durations from localStorage, fall back to defaults
let durations = storageGet('dashboard_durations', null);
if (
  !durations ||
  typeof durations.pomodoro   !== 'number' ||
  typeof durations.shortBreak !== 'number' ||
  typeof durations.longBreak  !== 'number'
) {
  durations = { ...DEFAULT_DURATIONS };
  storageSet('dashboard_durations', durations);
}

// Track which mode key is active
let activeModeKey = 'pomodoro';

let timerTotal    = durations[activeModeKey] * 60;
let timerLeft     = timerTotal;
let timerRunning  = false;
let timerInterval = null;
let isPomodoro    = true;
let sessionsDone  = 0;

// Keep the duration input in sync with the active mode
function syncDurationInput() {
  const input = document.getElementById('duration-input');
  input.value = durations[activeModeKey];
}

function setMode(btn) {
  if (timerRunning) return;

  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  activeModeKey = btn.dataset.key;
  isPomodoro    = activeModeKey === 'pomodoro';

  timerTotal = durations[activeModeKey] * 60;
  timerLeft  = timerTotal;

  document.getElementById('timer-label').textContent = btn.dataset.label;
  ringFill.style.stroke = 'var(--accent)';

  syncDurationInput();
  clearDurationHint();
  renderTimer();
  updateRing();
}

function applyDuration() {
  const input = document.getElementById('duration-input');
  const mins  = parseInt(input.value, 10);

  if (!mins || mins < 1 || mins > 180) {
    showDurationHint('Enter a value between 1 and 180 minutes.');
    input.focus();
    return;
  }

  if (timerRunning) {
    showDurationHint("Pause the timer before changing the duration.");
    return;
  }

  clearDurationHint();
  durations[activeModeKey] = mins;
  storageSet('dashboard_durations', durations);

  timerTotal = mins * 60;
  timerLeft  = timerTotal;
  ringFill.style.stroke = 'var(--accent)';

  renderTimer();
  updateRing();
  showToast(`Duration set to ${mins} min ✓`);
}

function showDurationHint(msg) {
  const hint = document.getElementById('duration-hint');
  hint.textContent = msg;
  hint.style.display = 'block';
}

function clearDurationHint() {
  const hint = document.getElementById('duration-hint');
  hint.textContent = '';
  hint.style.display = 'none';
}

// Apply on Enter inside the duration input
document.getElementById('duration-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') applyDuration();
});

// Initialise input to match the starting mode
syncDurationInput();

function renderTimer() {
  const m = String(Math.floor(timerLeft / 60)).padStart(2, '0');
  const s = String(timerLeft % 60).padStart(2, '0');
  document.getElementById('timer-time').textContent = `${m}:${s}`;
  document.title = timerRunning ? `${m}:${s} — Life Dashboard` : 'Life Dashboard';
}

function updateRing() {
  const pct = timerLeft / timerTotal;
  ringFill.style.strokeDashoffset = CIRCUMFERENCE * (1 - pct);
}

function renderSessionBadge() {
  const badge = document.getElementById('session-badge');
  const dots = Array.from({ length: 4 }, (_, i) =>
    `<span class="${i < sessionsDone ? 'filled' : ''}" title="Session ${i + 1}"></span>`
  ).join('');
  badge.innerHTML = `Sessions: ${dots}`;
}

function toggleTimer() {
  const btn = document.getElementById('btn-start');

  if (timerRunning) {
    // Pause
    clearInterval(timerInterval);
    timerRunning    = false;
    btn.textContent = '▶ Resume';
    document.title  = 'Life Dashboard';
  } else {
    // Start / Resume
    if (timerLeft === 0) { resetTimer(); return; }

    timerRunning    = true;
    btn.textContent = '⏸ Pause';

    // Use Date.now() as the truth source to prevent drift
    const expectedEnd = Date.now() + timerLeft * 1000;

    timerInterval = setInterval(() => {
      timerLeft = Math.max(0, Math.round((expectedEnd - Date.now()) / 1000));
      renderTimer();
      updateRing();

      if (timerLeft <= 0) {
        clearInterval(timerInterval);
        timerRunning    = false;
        btn.textContent = '▶ Start';
        document.title  = 'Life Dashboard';

        ringFill.style.stroke = 'var(--green)';

        if (isPomodoro) {
          sessionsDone = (sessionsDone % 4) + 1;
          renderSessionBadge();
        }

        showToast(
          isPomodoro
            ? '🎉 Focus session done! Time to take a break.'
            : '⏱ Break over — back to focus!'
        );

        playDing();
      }
    }, 500); // 500 ms tick; Date.now() keeps the count accurate
  }
}

function resetTimer() {
  clearInterval(timerInterval);
  timerRunning    = false;
  timerLeft       = timerTotal;
  ringFill.style.stroke = 'var(--accent)';
  document.getElementById('btn-start').textContent = '▶ Start';
  document.title = 'Life Dashboard';
  renderTimer();
  updateRing();
}

// Synthesise a short ding via Web Audio API — no external audio files needed
function playDing() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4);

    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch (_) { /* AudioContext unavailable — silent fallback */ }
}

// Expose timer controls to HTML onclick attributes
window.setMode       = setMode;
window.toggleTimer   = toggleTimer;
window.resetTimer    = resetTimer;
window.applyDuration = applyDuration;

renderTimer();
updateRing();
renderSessionBadge();

/* =============================================
   QUICK LINKS
   ============================================= */

const DEFAULT_LINKS = [
  { name: 'Google',  url: 'https://google.com',      icon: '🔍' },
  { name: 'GitHub',  url: 'https://github.com',      icon: '🐙' },
  { name: 'YouTube', url: 'https://youtube.com',     icon: '▶️' },
  { name: 'Gmail',   url: 'https://mail.google.com', icon: '📧' },
  { name: 'ChatGPT', url: 'https://chat.openai.com', icon: '🤖' },
  { name: 'Twitter', url: 'https://x.com',           icon: '🐦' },
];

let links = storageGet('dashboard_links', null);

if (!Array.isArray(links)) {
  links = DEFAULT_LINKS;
  saveLinks();
}

function saveLinks() {
  storageSet('dashboard_links', links);
}

function renderLinks() {
  const grid = document.getElementById('links-grid');

  grid.replaceChildren(
    ...links.map((link, i) => {
      const a = document.createElement('a');
      a.className = 'link-item';
      a.href      = link.url;
      a.target    = '_blank';
      a.rel       = 'noopener noreferrer';
      a.setAttribute('aria-label', link.name);

      // Delete button (visible on hover via CSS)
      const delBtn = document.createElement('button');
      delBtn.className   = 'link-delete';
      delBtn.textContent = '✕';
      delBtn.setAttribute('aria-label', `Remove ${link.name}`);
      delBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        deleteLink(i);
      });

      // Icon: image URL/base64 or emoji text
      const iconEl = document.createElement('span');
      iconEl.className = 'link-icon';
      iconEl.setAttribute('aria-hidden', 'true');

      if (link.icon && link.icon.startsWith('data:')) {
        // Uploaded image stored as base64 PNG (background removed)
        const img  = document.createElement('img');
        const size = (link.iconSize || 48) + 'px';
        img.src    = link.icon;
        img.alt    = '';
        img.style.cssText =
          `width:${size};height:${size};object-fit:contain;display:block;`;
        iconEl.appendChild(img);
      } else {
        iconEl.textContent = link.icon || '🔗';
      }

      const label = document.createElement('span');
      label.textContent = link.name;

      a.append(delBtn, iconEl, label);
      return a;
    })
  );
}

/* ── Icon field state ── */
let _pendingIconDataUrl = null; // base64 PNG after processing
let _pendingIconSize    = 48;   // display size in px (24–72)

/* ─────────────────────────────────────
   Background removal via Canvas
   Multi-pass strategy:
   1. Sample bg colour from corners AND entire border ring
   2. BFS flood-fill from ALL border pixels (not just corners)
      — catches logos with padding where corners are transparent/white
   3. Anti-aliasing cleanup: semi-transparent edge pixels get
      alpha reduced proportionally to how close they are to bg
───────────────────────────────────── */
function removeBackground(srcDataUrl, callback) {
  const img = new Image();
  img.onload = () => {
    const SIZE = 256; // higher resolution = better edge quality
    const canvas = document.createElement('canvas');
    canvas.width  = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');

    // Fill with white first so transparent source pixels read as white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Draw image scaled + centred
    const scale = Math.min(SIZE / img.width, SIZE / img.height);
    const dw = Math.round(img.width  * scale);
    const dh = Math.round(img.height * scale);
    const dx = Math.round((SIZE - dw) / 2);
    const dy = Math.round((SIZE - dh) / 2);
    ctx.drawImage(img, dx, dy, dw, dh);

    const imageData = ctx.getImageData(0, 0, SIZE, SIZE);
    const data      = imageData.data;

    function getPixel(x, y) {
      const i = (y * SIZE + x) * 4;
      return [data[i], data[i+1], data[i+2], data[i+3]];
    }

    // ── Step 1: sample bg colour from the ENTIRE border ring ──
    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    for (let x = 0; x < SIZE; x++) {
      for (const y of [0, SIZE - 1]) {
        const [r, g, b] = getPixel(x, y);
        rSum += r; gSum += g; bSum += b; count++;
      }
    }
    for (let y = 1; y < SIZE - 1; y++) {
      for (const x of [0, SIZE - 1]) {
        const [r, g, b] = getPixel(x, y);
        rSum += r; gSum += g; bSum += b; count++;
      }
    }
    const bgR = rSum / count;
    const bgG = gSum / count;
    const bgB = bSum / count;

    // Also detect if background is "nearly white" regardless of corner
    const bgIsLight = bgR > 200 && bgG > 200 && bgB > 200;

    const TOLERANCE  = 55; // primary flood-fill threshold
    const LIGHT_THR  = 235; // extra pass: almost-white pixel threshold

    function colorDist(r, g, b) {
      return Math.sqrt((r-bgR)**2 + (g-bgG)**2 + (b-bgB)**2);
    }

    // ── Step 2: BFS flood-fill seeded from ALL border pixels ──
    const removed = new Uint8Array(SIZE * SIZE); // 1 = will be transparent
    const queue   = [];

    function tryEnqueue(x, y) {
      if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
      const i = y * SIZE + x;
      if (removed[i]) return;
      const idx = i * 4;
      const r = data[idx], g = data[idx+1], b = data[idx+2], a = data[idx+3];
      // Mark if: nearly transparent, close to bg colour, or nearly-white (if bg is light)
      const isNearBg    = colorDist(r, g, b) <= TOLERANCE;
      const isNearWhite = bgIsLight && r >= LIGHT_THR && g >= LIGHT_THR && b >= LIGHT_THR;
      if (a < 20 || isNearBg || isNearWhite) {
        removed[i] = 1;
        queue.push(x, y);
      }
    }

    // Seed from entire border
    for (let x = 0; x < SIZE; x++) {
      tryEnqueue(x, 0);
      tryEnqueue(x, SIZE - 1);
    }
    for (let y = 1; y < SIZE - 1; y++) {
      tryEnqueue(0, y);
      tryEnqueue(SIZE - 1, y);
    }

    while (queue.length) {
      const x = queue.shift();
      const y = queue.shift();
      tryEnqueue(x-1, y); tryEnqueue(x+1, y);
      tryEnqueue(x, y-1); tryEnqueue(x, y+1);
    }

    // ── Step 3: apply removal + anti-aliasing cleanup ──
    for (let i = 0; i < SIZE * SIZE; i++) {
      const idx = i * 4;
      if (removed[i]) {
        data[idx+3] = 0; // fully transparent
      } else {
        // Soften pixels near the boundary (anti-aliasing)
        const r = data[idx], g = data[idx+1], b = data[idx+2];
        const dist = colorDist(r, g, b);
        if (dist < TOLERANCE + 20) {
          // Linearly reduce alpha for pixels in the "fringe" zone
          const factor = (dist - TOLERANCE) / 20; // 0..1
          data[idx+3] = Math.round(data[idx+3] * Math.max(0, Math.min(1, factor)));
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
    callback(canvas.toDataURL('image/png'));
  };
  img.src = srcDataUrl;
}

function onEmojiInput() {
  _pendingIconDataUrl = null;
  const val = document.getElementById('link-emoji').value.trim();
  updateIconPreview(val || '🔗', false);
  document.getElementById('btn-clear-icon').style.display = val ? 'inline-flex' : 'none';
  document.getElementById('icon-size-row').style.display  = 'none';
}

function onImageUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  // 2 MB limit (canvas processing, not localStorage raw size)
  if (file.size > 2 * 1024 * 1024) {
    showHint('Image is too large. Please use an image under 2 MB.');
    e.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = ev => {
    hideHint();
    document.getElementById('icon-preview').textContent = '⏳';

    removeBackground(ev.target.result, processedDataUrl => {
      _pendingIconDataUrl = processedDataUrl;
      document.getElementById('link-emoji').value = '';
      updateIconPreview(_pendingIconDataUrl, true, _pendingIconSize);
      document.getElementById('btn-clear-icon').style.display = 'inline-flex';

      // Show size slider
      const sizeRow    = document.getElementById('icon-size-row');
      const slider     = document.getElementById('icon-size-slider');
      sizeRow.style.display = 'flex';
      slider.value     = _pendingIconSize;
      document.getElementById('icon-size-val').textContent = _pendingIconSize;
    });
  };
  reader.readAsDataURL(file);
}

function onIconSizeChange(val) {
  _pendingIconSize = parseInt(val);
  document.getElementById('icon-size-val').textContent = val;
  if (_pendingIconDataUrl) {
    updateIconPreview(_pendingIconDataUrl, true, _pendingIconSize);
  }
}

function updateIconPreview(value, isImage, size) {
  const preview = document.getElementById('icon-preview');
  if (isImage) {
    const px = (size || 48) + 'px';
    preview.innerHTML = `<img src="${value}" alt=""
      style="width:${px};height:${px};object-fit:contain;display:block;" />`;
  } else {
    preview.textContent = value;
  }
}

function clearIcon() {
  _pendingIconDataUrl = null;
  _pendingIconSize    = 48;
  document.getElementById('link-emoji').value           = '';
  document.getElementById('link-image').value           = '';
  document.getElementById('btn-clear-icon').style.display = 'none';
  document.getElementById('icon-size-row').style.display  = 'none';
  document.getElementById('icon-size-slider').value       = 48;
  document.getElementById('icon-size-val').textContent    = 48;
  updateIconPreview('🔗', false);
}

function resetIconField() {
  clearIcon();
}

// Expose icon handlers
window.onEmojiInput    = onEmojiInput;
window.onImageUpload   = onImageUpload;
window.onIconSizeChange = onIconSizeChange;
window.clearIcon       = clearIcon;

function toggleAddLink() {
  const form = document.getElementById('add-link-form');
  const btn  = document.getElementById('add-link-btn');
  const open = form.classList.toggle('open');

  btn.setAttribute('aria-expanded', String(open));
  hideHint();

  if (open) document.getElementById('link-name').focus();
  else resetIconField();
}

function saveLink(e) {
  if (e) e.preventDefault();

  const name  = document.getElementById('link-name').value.trim();
  const raw   = document.getElementById('link-url').value.trim();
  const emoji = document.getElementById('link-emoji').value.trim();

  // Icon priority: uploaded image > typed emoji > default
  const icon = _pendingIconDataUrl || emoji || '🔗';

  // Validate
  if (!name) { showHint('Please enter a name for the link.'); return; }
  if (!raw)  { showHint('Please enter a URL.'); return; }

  // Auto-prepend https:// if missing
  const url = (raw.startsWith('http://') || raw.startsWith('https://'))
    ? raw
    : 'https://' + raw;

  try {
    new URL(url); // throws if invalid
  } catch (_) {
    showHint("That doesn't look like a valid URL.");
    return;
  }

  hideHint();
  links.push({ name, url, icon, iconSize: _pendingIconDataUrl ? _pendingIconSize : null });
  saveLinks();
  renderLinks();

  // Reset form fields
  document.getElementById('link-name').value = '';
  document.getElementById('link-url').value  = '';
  resetIconField();

  toggleAddLink();
  showToast('Link saved ✓');
}

function deleteLink(i) {
  if (i < 0 || i >= links.length) return;
  links.splice(i, 1);
  saveLinks();
  renderLinks();
}

function showHint(msg) {
  const hint = document.getElementById('link-hint');
  hint.textContent = msg;
  hint.classList.add('show');
}

function hideHint() {
  document.getElementById('link-hint').classList.remove('show');
}

// Expose link controls to HTML onclick attributes
window.toggleAddLink = toggleAddLink;
window.saveLink      = saveLink;

renderLinks();
