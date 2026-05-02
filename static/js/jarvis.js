'use strict';

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  voiceOut: true,
  listening: false,
  busy: false,
};

// ── DOM refs ───────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const chatArea    = $('chat-area');
const input       = $('message-input');
const sendBtn     = $('send-btn');
const micBtn      = $('mic-btn');
const core        = $('core');
const coreState   = $('core-state');
const clock       = $('clock');
const statusLabel = $('status-label');
const listenHud   = $('listen-hud');
const sidebar     = $('sidebar');

// ── Clock ──────────────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  clock.textContent = now.toLocaleTimeString('en-US', { hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

// ── Core state ─────────────────────────────────────────────────────────────
function setCoreState(s) {
  core.className = 'core ' + s;
  const labels = { ready: 'READY', listening: 'LISTENING', thinking: 'PROCESSING', speaking: 'SPEAKING' };
  coreState.textContent = labels[s] || s.toUpperCase();
  const colors = { ready: '#00ff88', listening: '#00ff88', thinking: '#ffaa00', speaking: '#00d4ff' };
  coreState.style.color = colors[s] || '#00d4ff';
}

// ── Voice Output ───────────────────────────────────────────────────────────
const synth = window.speechSynthesis;
let chosenVoice = null;

function loadVoice() {
  const voices = synth.getVoices();
  chosenVoice =
    voices.find(v => v.lang === 'en-GB' && /male/i.test(v.name)) ||
    voices.find(v => v.lang === 'en-GB') ||
    voices.find(v => /daniel|oliver|arthur/i.test(v.name)) ||
    voices.find(v => v.lang.startsWith('en')) ||
    voices[0] || null;
}
loadVoice();
if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = loadVoice;

function speak(text) {
  if (!state.voiceOut || !synth) return;
  synth.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  if (chosenVoice) utt.voice = chosenVoice;
  utt.rate = 0.94;
  utt.pitch = 0.82;
  utt.volume = 1;
  utt.onstart  = () => setCoreState('speaking');
  utt.onend    = () => setCoreState('ready');
  utt.onerror  = () => setCoreState('ready');
  synth.speak(utt);
}

// ── Voice Input (Web Speech API) ──────────────────────────────────────────
const SRClass = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SRClass) {
  recognition = new SRClass();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    state.listening = true;
    micBtn.classList.add('active');
    listenHud.classList.add('visible');
    setCoreState('listening');
    input.placeholder = 'Listening…';
  };

  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map(r => r[0].transcript).join('');
    input.value = transcript;
    if (event.results[event.results.length - 1].isFinal) {
      stopListening();
      sendMessage(transcript);
    }
  };

  recognition.onerror = () => stopListening();
  recognition.onend   = () => stopListening();
}

function startListening() {
  if (!recognition || state.busy) return;
  try { recognition.start(); } catch (_) {}
}

function stopListening() {
  state.listening = false;
  micBtn.classList.remove('active');
  listenHud.classList.remove('visible');
  input.placeholder = 'Type a command or click the mic to speak…';
  if (!state.busy) setCoreState('ready');
  try { recognition && recognition.stop(); } catch (_) {}
}

micBtn.addEventListener('click', () => {
  if (!recognition) {
    addMsg('jarvis', 'Voice input is not supported in this browser. Please use Chrome or Edge, and serve over HTTPS or localhost.');
    return;
  }
  state.listening ? stopListening() : startListening();
});

// ── Build message bubbles ──────────────────────────────────────────────────
function removeWelcome() {
  const w = chatArea.querySelector('.welcome');
  if (w) w.remove();
}

function addMsg(role, text) {
  removeWelcome();
  const isJarvis = role === 'jarvis';
  const div = document.createElement('div');
  div.className = `msg ${isJarvis ? 'jarvis' : 'user'}`;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = isJarvis ? 'J.A.R' : 'YOU';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = formatText(text);

  div.appendChild(avatar);
  div.appendChild(bubble);
  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
  return bubble;
}

function addStreamingMsg() {
  removeWelcome();
  const div = document.createElement('div');
  div.className = 'msg jarvis';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = 'J.A.R';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  const textSpan = document.createElement('span');
  const cursor = document.createElement('span');
  cursor.className = 'cursor';

  bubble.appendChild(textSpan);
  bubble.appendChild(cursor);
  div.appendChild(avatar);
  div.appendChild(bubble);
  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;

  return {
    append(chunk) {
      textSpan.textContent += chunk;
      chatArea.scrollTop = chatArea.scrollHeight;
    },
    finish(fullText) {
      cursor.remove();
      bubble.innerHTML = formatText(fullText);
      chatArea.scrollTop = chatArea.scrollHeight;
    },
  };
}

// Basic markdown-ish formatting
function formatText(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

// ── Send message ───────────────────────────────────────────────────────────
async function sendMessage(text) {
  text = (text || input.value).trim();
  if (!text || state.busy) return;

  input.value = '';
  state.busy = true;
  sendBtn.disabled = true;
  setCoreState('thinking');
  statusLabel.textContent = 'PROCESSING';
  statusLabel.style.color = 'var(--orange)';

  addMsg('user', text);

  const streaming = addStreamingMsg();
  let fullText = '';

  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    });

    if (!resp.ok) {
      const err = await resp.json();
      streaming.finish(err.error || 'Server error');
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'token') {
            fullText += data.text;
            streaming.append(data.text);
          } else if (data.type === 'done') {
            if (data.full) { fullText = data.full; streaming.finish(data.full); }
            else streaming.finish(fullText);
            speak(fullText);
          } else if (data.type === 'error') {
            streaming.finish('⚠ ' + data.message);
          }
        } catch (_) {}
      }
    }
  } catch (err) {
    streaming.finish('⚠ Connection error: ' + err.message);
  } finally {
    state.busy = false;
    sendBtn.disabled = false;
    setCoreState('ready');
    statusLabel.textContent = 'ONLINE';
    statusLabel.style.color = 'var(--green)';
    input.focus();
  }
}

// ── Controls ───────────────────────────────────────────────────────────────
sendBtn.addEventListener('click', () => sendMessage());

input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

$('voice-toggle').addEventListener('click', () => {
  state.voiceOut = !state.voiceOut;
  synth.cancel();
  $('voice-toggle').style.color = state.voiceOut ? '' : 'var(--text-dim)';
  $('voice-toggle').title = state.voiceOut ? 'Voice ON (click to mute)' : 'Voice OFF (click to unmute)';
});

$('clear-btn').addEventListener('click', async () => {
  if (!confirm('Clear conversation memory?')) return;
  await fetch('/api/clear', { method: 'POST' });
  chatArea.innerHTML = `
    <div class="welcome">
      <div class="welcome-core">
        <div class="wc-ring r1"></div><div class="wc-ring r2"></div>
        <div class="wc-ring r3"></div><div class="wc-dot"></div>
      </div>
      <p class="welcome-text">Memory cleared. How may I assist you?</p>
    </div>`;
});

$('sidebar-toggle').addEventListener('click', () => {
  sidebar.classList.toggle('open');
  if (sidebar.classList.contains('open')) loadSchedule();
});

// Hint chips and quick buttons
document.addEventListener('click', e => {
  const chip = e.target.closest('.hint-chip, .q-btn');
  if (chip) sendMessage(chip.dataset.msg);
});

// ── Schedule sidebar ───────────────────────────────────────────────────────
async function loadSchedule() {
  try {
    const data = await fetch('/api/schedule').then(r => r.json());

    // Today
    const todayEl = $('today-events');
    if (data.today.length === 0) {
      todayEl.innerHTML = '<div class="sb-empty">No events today</div>';
    } else {
      todayEl.innerHTML = data.today.map(e => `
        <div class="sb-event">
          <div class="sb-event-time">${e.time || 'All day'}</div>
          <div class="sb-event-title">${escHtml(e.title)}</div>
        </div>`).join('');
    }

    // Upcoming
    const upEl = $('upcoming-events');
    if (data.upcoming.length === 0) {
      upEl.innerHTML = '<div class="sb-empty">Nothing scheduled</div>';
    } else {
      upEl.innerHTML = data.upcoming.slice(0, 6).map(e => `
        <div class="sb-event">
          <div class="sb-event-time">${e.date} ${e.time || ''}</div>
          <div class="sb-event-title">${escHtml(e.title)}</div>
        </div>`).join('');
    }

    // Reminders
    const remEl = $('reminders-list');
    if (data.reminders.length === 0) {
      remEl.innerHTML = '<div class="sb-empty">No reminders</div>';
    } else {
      remEl.innerHTML = data.reminders.map(r => `
        <div class="sb-reminder">
          <div class="sb-reminder-text">${escHtml(r.text)}</div>
          <div class="sb-reminder-when">${escHtml(r.remind_at)}</div>
        </div>`).join('');
    }
  } catch (_) {}
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  input.focus();
  loadVoice();
  try {
    const data = await fetch('/api/status').then(r => r.json());
    const providerEl = $('provider-label');
    if (providerEl && data.provider) {
      providerEl.textContent = data.provider === 'groq' ? 'GROQ (FREE)' : 'CLAUDE';
      providerEl.style.color = data.provider === 'groq' ? 'var(--green)' : 'var(--cyan)';
    }
  } catch (_) {}
}
init();
