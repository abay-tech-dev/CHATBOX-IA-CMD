// =====================================================
//   CHATBOX-IA — CMD Widget · script.js
//   Terminal / Linux themed Twitch chat for StreamElements & OBS
// =====================================================

const CONFIG = {
  // Connection
  twitchChannel:    '',          // direct Twitch connection (leave empty when using StreamElements)
  streamName:       'Twitch Chat',

  // Look
  theme:            'dark',      // dark | light | amoled
  accentColor:      '#00ff41',
  fontSize:         14,
  chatWidth:        100,         // % of the browser source width
  alignment:        'left',      // left | right | center
  perspectiveX:     0,           // 3D rotation, degrees
  perspectiveY:     0,
  messageAnimation: 'type',      // type | slide | fade | none

  // Terminal chrome
  showHeader:       true,
  showInputBar:     true,

  // Messages
  maxMessages:      15,
  messageDuration:  0,           // seconds, 0 = never fade out
  showTimestamp:    true,
  showBadges:       true,
  badgeStyle:       'text',      // text ([MOD] [VIP]…) | icon (Twitch icons / emoji)
  showAvatars:      false,
  modColor:         '#00ff88',
  vipColor:         '#e91e8c',
  subColor:         '#ffc200',

  // Alerts
  showAlerts:       true,
  alertDuration:    5,

  // Goal
  showGoal:         false,
  goalType:         'subs',      // followers | subs | bits | donations
  goalTitle:        'Sub goal',
  goalDesc:         '',
  goalCurrent:      0,
  goalTarget:       100,
  goalOrientation:  'horizontal',// horizontal (top of the terminal) | vertical (right side)
  goalColor:        '',          // empty = accent color
  goalAutoTrack:    true,
};

const DEFAULTS = { ...CONFIG };

const BADGE_META = {
  broadcaster:  { emoji: '👑', tag: 'LIVE', role: 'broadcaster' },
  moderator:    { emoji: '⚔️', tag: 'MOD',  role: 'moderator'   },
  vip:          { emoji: '💎', tag: 'VIP',  role: 'vip'         },
  subscriber:   { emoji: '⭐', tag: 'SUB',  role: 'subscriber'  },
  'sub-gifter': { emoji: '🎁', tag: 'GIFT', role: 'subscriber'  },
  partner:      { emoji: '✅', tag: 'PRT',  role: 'partner'     },
  premium:      { emoji: '💜', tag: 'PRM',  role: 'partner'     },
  turbo:        { emoji: '⚡', tag: 'TRB',  role: 'partner'     },
};

const USERNAME_COLORS = [
  '#FF6B6B','#FF9A3C','#FFD93D','#6BCB77',
  '#4D96FF','#C77DFF','#FF69B4','#00B4D8',
  '#F72585','#43AA8B','#277DA1','#F8961E',
];

const ALERT_ICONS = { follow: '♥', sub: '★', giftsub: '🎁', bits: '◆', donation: '$', raid: '⚔', host: '📡', goal: '✓' };

let msgCount  = 0;
let goalValue = 0;

// =====================================================
//   StreamElements events
// =====================================================

window.addEventListener('onWidgetLoad', ({ detail }) => {
  if (detail?.fieldData) applyFields(detail.fieldData);
  goalValue = +CONFIG.goalCurrent || 0;
  applyConfig();
});

window.addEventListener('onEventReceived', ({ detail }) => {
  if (!detail?.listener || !detail?.event) return;
  const { listener, event } = detail;

  if (listener === 'message')         { addMessage(normalizeSEMessage(event.data)); return; }
  if (listener === 'delete-message')  { deleteMessage(event.msgId); return; }
  if (listener === 'delete-messages') { deleteUserMessages(event.userId); return; }

  handleStreamEvent(listener, event);
});

// SE sends badges/emotes in a slightly different shape than raw IRC
function normalizeSEMessage(d) {
  if (!d) return null;
  return {
    id:          d.msgId,
    userId:      d.userId,
    displayName: d.displayName,
    username:    d.nick || d.userName || d.displayName,
    text:        d.text,
    color:       d.displayColor || d.color,
    badges:      Array.isArray(d.badges) ? d.badges : parseBadges(String(d.badges || '')),
    emotes:      Array.isArray(d.emotes) ? d.emotes : parseEmotes(String(d.emotes || ''), d.text || ''),
    avatar:      d.avatar,
  };
}

// Unified handler for follows / subs / bits / tips / raids (SE listener names)
function handleStreamEvent(listener, ev) {
  const name   = ev.name || ev.displayName || ev.sender || 'Someone';
  const amount = +(ev.amount || ev.count || 0);
  const msg    = ev.message ? ` — "${ev.message}"` : '';

  switch (listener) {
    case 'follower-latest':
      trackGoal('followers', 1);
      fireAlert('follow', 'NEW FOLLOWER', `${name} is now following the channel!`);
      break;

    case 'subscriber-latest': {
      if (ev.isCommunityGift) return;                 // one gift of a bulk gift: already counted
      if (ev.bulkGifted) {
        trackGoal('subs', amount || 1);
        fireAlert('giftsub', `${amount} GIFT SUBS`, `${name} gifts ${amount} subs to the community!`);
      } else if (ev.gifted) {
        trackGoal('subs', 1);
        fireAlert('giftsub', 'GIFT SUB', `${ev.sender || 'Someone'} gifted a sub to ${name}!`);
      } else {
        const months = +(ev.amount || ev.months || 1);
        trackGoal('subs', 1);
        fireAlert('sub', months > 1 ? `${months} MONTHS SUB` : 'NEW SUBSCRIBER',
          months > 1 ? `${name} has been subscribed for ${months} months!${msg}` : `${name} just subscribed!${msg}`);
      }
      break;
    }

    case 'cheer-latest':
      trackGoal('bits', amount);
      fireAlert('bits', `${amount} BITS`, `${name} sent ${amount} bits!${msg}`);
      break;

    case 'tip-latest':
      trackGoal('donations', amount);
      fireAlert('donation', `DONATION ${amount}€`, `${name} donated ${amount}€!${msg}`);
      break;

    case 'raid-latest':
      fireAlert('raid', 'RAID INCOMING', `${name} raids with ${amount} raiders!`);
      break;

    case 'host-latest':
      fireAlert('host', 'HOST', `${name} is hosting with ${amount} viewers!`);
      break;
  }
}

// =====================================================
//   Configuration
// =====================================================

// Field names from the first CMD version still work
const LEGACY_KEYS = {
  subGoalEnabled: 'showGoal',
  subGoalLabel:   'goalTitle',
  subGoalDesc:    'goalDesc',
  subGoalCurrent: 'goalCurrent',
  subGoalTarget:  'goalTarget',
  channel:        'twitchChannel',
};

function coerce(key, value) {
  const def = DEFAULTS[key];
  if (typeof def === 'number')  return Number.isFinite(+value) ? +value : def;
  if (typeof def === 'boolean') return value === true || value === 'true' || value === '1' || value === 1;
  return value == null ? def : String(value);
}

function applyFields(f) {
  Object.keys(f || {}).forEach(raw => {
    const key = LEGACY_KEYS[raw] || raw;
    if (key in DEFAULTS) CONFIG[key] = coerce(key, f[raw]);
  });
}

// Every setting can also be passed in the widget URL (that's what the OBS link uses):
//   widget/?channel=mychannel&theme=amoled&showGoal=true&goalTarget=50 …
function applyUrlParams() {
  const params = new URLSearchParams(window.location.search);
  if (![...params.keys()].length) return false;
  const f = {};
  params.forEach((v, k) => { f[k] = v; });
  applyFields(f);
  return true;
}

function applyConfig() {
  const root = document.documentElement;
  const term = document.getElementById('widget-container');
  if (!term) return;

  root.dataset.theme     = CONFIG.theme;
  root.dataset.animation = CONFIG.messageAnimation;
  root.dataset.align     = CONFIG.alignment;
  root.style.setProperty('--font-size',  `${CONFIG.fontSize}px`);
  root.style.setProperty('--accent',     validHex(CONFIG.accentColor) || DEFAULTS.accentColor);
  root.style.setProperty('--mod-color',  validHex(CONFIG.modColor)    || DEFAULTS.modColor);
  root.style.setProperty('--vip-color',  validHex(CONFIG.vipColor)    || DEFAULTS.vipColor);
  root.style.setProperty('--sub-color',  validHex(CONFIG.subColor)    || DEFAULTS.subColor);
  root.style.setProperty('--goal-color', validHex(CONFIG.goalColor)   || 'var(--accent)');

  // Size, position & 3D rotation of the terminal window
  term.style.width = `${Math.min(100, Math.max(20, +CONFIG.chatWidth || 100))}%`;
  const rx = +CONFIG.perspectiveX || 0, ry = +CONFIG.perspectiveY || 0;
  term.style.transform = (rx || ry) ? `rotateX(${rx}deg) rotateY(${ry}deg)` : '';

  updateTitle(twitchActiveChannel);

  const promptEl = document.getElementById('terminal-prompt-label');
  if (promptEl) {
    const slug = (CONFIG.twitchChannel || CONFIG.streamName || 'chat').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
    promptEl.textContent = `${slug}@twitch:~$`;
  }

  document.getElementById('wa-header').style.display    = CONFIG.showHeader   ? '' : 'none';
  document.getElementById('wa-input-bar').style.display = CONFIG.showInputBar ? '' : 'none';

  applyGoal();

  if (!IS_SE && CONFIG.twitchChannel) connectTwitch(CONFIG.twitchChannel);
}

function updateTitle(connectedChannel) {
  const titleEl = document.getElementById('contact-name');
  if (!titleEl) return;
  const ch = connectedChannel || CONFIG.twitchChannel;
  const label = ch ? `#${String(ch).replace(/^#/, '')}` : CONFIG.streamName;
  titleEl.textContent = `${label} — bash — ${window.innerWidth}×${window.innerHeight}`;
}

window.addEventListener('resize', () => { updateTitle(twitchActiveChannel); renderGoalBar(); });

// =====================================================
//   Utilities
// =====================================================

function escHtml(t) {
  if (t == null) return '';
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function validHex(c) {
  return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : '';
}

function formatTime() {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function roleOf(badges) {
  const types = (badges || []).map(b => b.type);
  for (const r of ['broadcaster', 'moderator', 'vip', 'subscriber']) if (types.includes(r)) return r;
  return 'regular';
}

function roleColor(role) {
  return {
    broadcaster: 'var(--accent)',
    moderator:   'var(--mod-color)',
    vip:         'var(--vip-color)',
    subscriber:  'var(--sub-color)',
  }[role] || 'var(--text-muted)';
}

function getUserColor(username, twitchColor) {
  if (validHex(twitchColor)) return twitchColor;
  let h = 0;
  const s = (username || '').toLowerCase();
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return USERNAME_COLORS[Math.abs(h) % USERNAME_COLORS.length];
}

// =====================================================
//   Badges / avatars / text
// =====================================================

function renderBadges(badges) {
  if (!CONFIG.showBadges || !badges?.length) return '';
  return badges.map(b => {
    const meta = BADGE_META[b.type];
    if (!meta) return '';
    if (CONFIG.badgeStyle === 'icon') {
      if (b.url) return `<span class="badge" title="${escHtml(b.type)}"><img src="${escHtml(b.url)}" alt="" /></span>`;
      return `<span class="badge" title="${escHtml(b.type)}">${meta.emoji}</span>`;
    }
    return `<span class="badge badge-text" style="color:${roleColor(meta.role)}">[${meta.tag}]</span>`;
  }).join('');
}

function renderAvatar(data, color) {
  if (!CONFIG.showAvatars) return '';
  const initial = escHtml((data.displayName || data.username || '?').slice(0, 1).toUpperCase());
  const img = data.avatar ? `<img src="${escHtml(data.avatar)}" alt="" onerror="this.remove()" />` : '';
  return `<span class="message-avatar" style="--av:${color}">${initial}${img}</span>`;
}

function renderText(text, emotes) {
  if (!text) return '';
  if (!emotes?.length) return linkMentions(escHtml(text));

  const chars  = [...text];
  const sorted = [...emotes].sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  const parts  = [];
  let cursor   = 0;

  for (const em of sorted) {
    const start = em.start ?? 0;
    const end   = (em.end ?? em.start) + 1;
    if (start < cursor) continue;
    if (start > cursor) parts.push(linkMentions(escHtml(chars.slice(cursor, start).join(''))));
    const name = chars.slice(start, end).join('');
    const url  = em.urls?.['1'] || em.urls?.['1x'] || em.url || '';
    parts.push(url
      ? `<img class="emote" src="${escHtml(url)}" alt="${escHtml(name)}" title="${escHtml(name)}" loading="lazy" />`
      : escHtml(name));
    cursor = end;
  }
  if (cursor < chars.length) parts.push(linkMentions(escHtml(chars.slice(cursor).join(''))));
  return parts.join('');
}

function linkMentions(html) {
  return html.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
}

// =====================================================
//   Messages
// =====================================================

function addMessage(data) {
  if (!data) return;
  const { displayName, username, text, emotes = [], badges = [], color } = data;

  const list = document.getElementById('messages-list');
  if (!list) return;

  const role      = roleOf(badges);
  const userColor = getUserColor(username || displayName, color);
  const time      = CONFIG.showTimestamp ? formatTime() : '';

  const wrapper = document.createElement('div');
  wrapper.className  = `message-wrapper role-${role}`;
  wrapper.dataset.id = data.id || `local-${++msgCount}`;
  if (data.userId) wrapper.dataset.user = data.userId;

  const badgeHtml = renderBadges(badges);
  // Joined without whitespace: in a text-flow line every newline would render as an extra space
  wrapper.innerHTML = '<div class="message-line">' + [
    time ? `<span class="message-time">[${time}]</span>` : '',
    renderAvatar(data, userColor),
    badgeHtml ? `<span class="message-badges">${badgeHtml}</span>` : '',
    `<span class="message-username" style="color:${userColor}">${escHtml(displayName || username || 'anon')}</span>`,
    '<span class="message-separator">&gt;</span>',
    `<span class="message-text">${renderText(text, emotes)}</span>`,
  ].join('') + '</div>';

  appendLine(wrapper);

  if (CONFIG.messageDuration > 0) {
    setTimeout(() => removeMessage(wrapper), CONFIG.messageDuration * 1000);
  }
}

function addSystemMessage(text, type = '') {
  const wrapper = document.createElement('div');
  wrapper.className = `message-wrapper system-msg${type ? ' sys-' + type : ''}`;
  wrapper.innerHTML = `<div class="system-chip">${escHtml(text)}</div>`;
  appendLine(wrapper);
  if (CONFIG.messageDuration > 0) setTimeout(() => removeMessage(wrapper), CONFIG.messageDuration * 1000);
}

function appendLine(el) {
  const list = document.getElementById('messages-list');
  if (!list) return;
  list.appendChild(el);
  list.scrollTop = list.scrollHeight;
  pruneMessages();
}

function removeMessage(el) {
  if (!el || !el.parentNode) return;
  el.classList.add('removing');
  setTimeout(() => el.remove(), 350);
}

function deleteMessage(id) {
  if (!id) return;
  document.querySelectorAll(`.message-wrapper[data-id="${CSS.escape(String(id))}"]`).forEach(removeMessage);
}

function deleteUserMessages(userId) {
  if (!userId) return;
  document.querySelectorAll(`.message-wrapper[data-user="${CSS.escape(String(userId))}"]`).forEach(removeMessage);
}

function pruneMessages() {
  const list = document.getElementById('messages-list');
  if (!list) return;
  const visible = [...list.querySelectorAll('.message-wrapper:not(.removing)')];
  const excess  = visible.length - CONFIG.maxMessages;
  for (let i = 0; i < excess; i++) visible[i].remove();
}

// =====================================================
//   Alerts (terminal pop-up window)
// =====================================================

const alertQueue = [];
let alertBusy = false;

function fireAlert(type, title, message) {
  addSystemMessage(`${ALERT_ICONS[type] || '!'} ${message}`, type);
  if (!CONFIG.showAlerts) return;
  alertQueue.push({ type, title, message });
  if (!alertBusy) nextAlert();
}

function nextAlert() {
  const item = alertQueue.shift();
  if (!item) { alertBusy = false; return; }
  alertBusy = true;

  const layer = document.getElementById('alert-layer');
  const card  = document.createElement('div');
  card.className = `alert-box alert-${item.type}`;
  card.innerHTML = `
    <div class="alert-titlebar"><span class="alert-tag">[ ${escHtml(item.title)} ]</span></div>
    <div class="alert-body"><span class="alert-icon">${ALERT_ICONS[item.type] || '!'}</span><span class="alert-msg">&gt; ${escHtml(item.message)}<span class="terminal-cursor"></span></span></div>`;
  layer.appendChild(card);
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('visible')));

  const duration = Math.max(1, +CONFIG.alertDuration || 5) * 1000;
  setTimeout(() => {
    card.classList.remove('visible');
    card.classList.add('hiding');
    setTimeout(() => { card.remove(); nextAlert(); }, 350);
  }, duration);
}

// =====================================================
//   Goal (ASCII progress bar, horizontal or vertical)
// =====================================================

const GOAL_UNITS = { followers: 'followers', subs: 'subs', bits: 'bits', donations: '€' };

function applyGoal() {
  const term = document.getElementById('widget-container');
  const h = document.getElementById('goal-h');
  const v = document.getElementById('goal-v');
  const vertical = CONFIG.goalOrientation === 'vertical';

  h.style.display = CONFIG.showGoal && !vertical ? '' : 'none';
  v.style.display = CONFIG.showGoal &&  vertical ? '' : 'none';
  term.classList.toggle('has-goal', !!CONFIG.showGoal);
  if (!CONFIG.showGoal) return;

  document.querySelectorAll('.goal-label-text').forEach(el => { el.textContent = CONFIG.goalTitle || 'Goal'; });
  const descEl = document.getElementById('goal-desc');
  descEl.textContent   = CONFIG.goalDesc || '';
  descEl.style.display = CONFIG.goalDesc ? '' : 'none';

  goalValue = Math.max(0, +CONFIG.goalCurrent || 0);
  // Wait for layout so the bar can be sized to the space it really has
  requestAnimationFrame(renderGoalBar);
}

function goalPct() {
  const target = Math.max(1, +CONFIG.goalTarget || 1);
  return Math.min(100, Math.max(0, (goalValue / target) * 100));
}

// Size of one bar character in the goal font, so the ASCII bar always fits exactly
function charSize(el) {
  const probe = document.createElement('span');
  probe.textContent = '█'.repeat(20);
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;line-height:1;left:0;top:0;';
  el.appendChild(probe);
  const r = probe.getBoundingClientRect();
  probe.remove();
  return { w: r.width / 20 || 8, h: r.height || 14 };
}

function renderGoalBar() {
  if (!CONFIG.showGoal) return;
  const pct      = goalPct();
  const complete = goalValue >= CONFIG.goalTarget;
  const fmt      = n => Math.floor(n).toLocaleString('en-US');

  document.querySelectorAll('.goal-fraction-text').forEach(el => { el.textContent = `${fmt(goalValue)} / ${fmt(CONFIG.goalTarget)}`; });
  document.querySelectorAll('.goal-current-text').forEach(el => { el.textContent = fmt(goalValue); });
  document.querySelectorAll('.goal-target-text').forEach(el => { el.textContent = fmt(CONFIG.goalTarget); });
  document.querySelectorAll('.goal-pct-text').forEach(el => { el.textContent = `${Math.round(pct)}%`; });
  document.getElementById('goal-h').classList.toggle('goal-complete', complete);
  document.getElementById('goal-v').classList.toggle('goal-complete', complete);

  if (CONFIG.goalOrientation === 'vertical') {
    const wrap = document.getElementById('goal-v-bar');
    const { h } = charSize(wrap);
    const rows = Math.max(4, Math.floor(wrap.clientHeight / h));
    const filled = Math.round((pct / 100) * rows);
    wrap.textContent = Array.from({ length: rows }, (_, i) => (rows - i <= filled ? '█' : '░')).join('\n');
  } else {
    const box  = document.getElementById('goal-bar-wrap');
    const { w } = charSize(box);
    const cols = Math.max(8, Math.floor(box.clientWidth / w));
    const filled = Math.round((pct / 100) * cols);
    document.getElementById('goal-bar-ascii').textContent = '█'.repeat(filled) + '░'.repeat(cols - filled);
  }
}

function trackGoal(type, amount) {
  if (!CONFIG.showGoal || !CONFIG.goalAutoTrack || CONFIG.goalType !== type || !(amount > 0)) return;
  setGoalValue(goalValue + amount, true);
}

function setGoalValue(value, pulse = false) {
  const before = goalValue >= CONFIG.goalTarget;
  goalValue = Math.max(0, +value || 0);
  CONFIG.goalCurrent = goalValue;
  renderGoalBar();

  if (pulse) {
    ['goal-h', 'goal-v'].forEach(id => {
      const el = document.getElementById(id);
      el.classList.remove('goal-pulse'); void el.offsetWidth; el.classList.add('goal-pulse');
    });
  }

  if (!before && goalValue >= CONFIG.goalTarget) {
    setTimeout(() => {
      addSystemMessage(`${ALERT_ICONS.goal} Goal reached! ${CONFIG.goalTarget} ${GOAL_UNITS[CONFIG.goalType] || ''}`, 'goal');
      spawnConfetti();
    }, 600);
  }
}

// Kept for older integrations of the first CMD version
function updateSubGoal(username, amount = 1, type = 'sub') {
  handleStreamEvent('subscriber-latest',
    type === 'giftsub'
      ? (amount > 1 ? { name: username, amount, bulkGifted: true } : { name: 'someone', sender: username, gifted: true })
      : { name: username, amount: 1 });
}
function applySubGoal() { applyGoal(); }

function spawnConfetti() {
  const container = document.getElementById('messages-container');
  if (!container) return;
  const colors = ['#00ff41','#00A884','#FFD700','#FF6B6B','#4D96FF','#C77DFF','#FF9A3C'];
  for (let i = 0; i < 14; i++) {
    setTimeout(() => {
      const c = document.createElement('div');
      c.className = 'confetti-piece';
      c.style.cssText = `left:${15 + Math.random() * 70}%;bottom:10px;background:${colors[Math.floor(Math.random() * colors.length)]};animation-duration:${.65 + Math.random() * .45}s;`;
      container.appendChild(c);
      c.addEventListener('animationend', () => c.remove(), { once: true });
    }, i * 55);
  }
}

// =====================================================
//   Direct Twitch connection (anonymous, read-only IRC over WebSocket)
//   No login needed — works in OBS with  widget/?channel=yourchannel
// =====================================================

let twitchWS             = null;
let twitchReconnectTimer = null;
let twitchReconnectDelay = 1500;
let twitchActiveChannel  = '';

function connectTwitch(channel) {
  const ch = String(channel || '').toLowerCase().replace(/^#/, '').trim();
  if (!ch) return;
  if (ch === twitchActiveChannel && twitchWS && twitchWS.readyState <= 1) return;

  disconnectTwitch();
  twitchActiveChannel = ch;
  setConnectionStatus('connecting');

  const ws = new WebSocket('wss://irc-ws.chat.twitch.tv/');
  twitchWS = ws;

  ws.onopen = () => {
    ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
    ws.send('PASS oauth:anonymous');
    ws.send(`NICK justinfan${Math.floor(Math.random() * 80000) + 10000}`);
    ws.send(`JOIN #${ch}`);
  };

  ws.onmessage = ({ data }) => {
    data.split('\r\n').forEach(line => { if (line) handleIRCLine(line, ch); });
  };

  ws.onerror = () => setConnectionStatus('error');

  ws.onclose = () => {
    if (twitchActiveChannel !== ch) return;
    setConnectionStatus('disconnected');
    twitchReconnectDelay = Math.min(twitchReconnectDelay * 2, 30000);
    twitchReconnectTimer = setTimeout(() => { twitchActiveChannel = ''; connectTwitch(ch); }, twitchReconnectDelay);
  };
}

function disconnectTwitch() {
  clearTimeout(twitchReconnectTimer);
  twitchActiveChannel = '';
  if (twitchWS) {
    twitchWS.onclose = null;
    twitchWS.close();
    twitchWS = null;
  }
  setConnectionStatus('disconnected');
}

function handleIRCLine(line, ch) {
  if (line.startsWith('PING')) { twitchWS?.send('PONG :tmi.twitch.tv'); return; }

  if (line.includes(` JOIN #${ch}`)) {
    twitchReconnectDelay = 1500;
    setConnectionStatus('connected');
    updateTitle(ch);
    return;
  }

  const m = line.match(/^(?:@([^ ]+) )?:([^! ]+)(?:![^ ]+)? ([A-Z]+) #\S+(?: :(.*))?$/);
  if (!m) return;

  const [, tagsStr = '', username, command, text = ''] = m;
  const tags = parseTags(tagsStr);

  if (command === 'PRIVMSG') {
    addMessage({
      id:          tags['id'],
      userId:      tags['user-id'],
      displayName: tags['display-name'] || username,
      username,
      text,
      color:  tags['color'] || null,
      badges: parseBadges(tags['badges'] || ''),
      emotes: parseEmotes(tags['emotes'] || '', text),
    });
    if (tags['bits']) {
      handleStreamEvent('cheer-latest', { name: tags['display-name'] || username, amount: +tags['bits'] });
    }
  } else if (command === 'USERNOTICE') {
    handleUserNotice(tags);
  } else if (command === 'CLEARMSG') {
    deleteMessage(tags['target-msg-id']);
  } else if (command === 'CLEARCHAT') {
    if (tags['target-user-id']) deleteUserMessages(tags['target-user-id']);
  }
}

function parseTags(str) {
  const t = {};
  str.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i !== -1) t[p.slice(0, i)] = p.slice(i + 1).replace(/\\s/g, ' ');
  });
  return t;
}

function parseBadges(str) {
  return String(str || '').split(',').filter(Boolean).map(b => ({ type: b.split('/')[0] }));
}

function parseEmotes(str) {
  if (!str) return [];
  const list = [];
  str.split('/').forEach(part => {
    if (!part) return;
    const [id, positions] = part.split(':');
    (positions || '').split(',').forEach(pos => {
      const [start, end] = pos.split('-').map(Number);
      if (!isNaN(start) && !isNaN(end)) {
        const url = `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/1.0`;
        list.push({ id, start, end, urls: { '1': url, '1x': url } });
      }
    });
  });
  return list;
}

function handleUserNotice(tags) {
  const msgId = tags['msg-id'] || '';
  const user  = tags['display-name'] || tags['login'] || 'Someone';

  if (msgId === 'sub') {
    handleStreamEvent('subscriber-latest', { name: user, amount: 1 });
  } else if (msgId === 'resub') {
    handleStreamEvent('subscriber-latest', { name: user, amount: +(tags['msg-param-cumulative-months'] || 1) });
  } else if (msgId === 'subgift' || msgId === 'anonsubgift') {
    // Gifts that belong to a mass gift are already counted by "submysterygift"
    if (tags['msg-param-community-gift-id']) return;
    handleStreamEvent('subscriber-latest', { name: tags['msg-param-recipient-display-name'] || 'someone', sender: user, gifted: true });
  } else if (msgId === 'submysterygift') {
    handleStreamEvent('subscriber-latest', { name: user, amount: +(tags['msg-param-mass-gift-count'] || 1), bulkGifted: true });
  } else if (msgId === 'raid') {
    handleStreamEvent('raid-latest', { name: tags['msg-param-displayName'] || user, amount: +(tags['msg-param-viewerCount'] || 0) });
  }
}

function setConnectionStatus(status) {
  const dot = document.getElementById('connection-dot');
  if (dot) {
    dot.className = `wa-online-dot conn-${status}`;
    dot.title = {
      connected:    `Connected to #${twitchActiveChannel}`,
      connecting:   'Connecting…',
      disconnected: 'Not connected',
      error:        'Connection error',
    }[status] ?? '';
  }
  try { window.parent.postMessage({ type: 'twitchStatus', status, channel: twitchActiveChannel }, '*'); } catch (_) {}
}

// =====================================================
//   Configurator bridge (index.html drives the preview through postMessage,
//   which also works when the files are opened locally with file://)
// =====================================================

window.addEventListener('message', ({ data }) => {
  if (!data || typeof data.type !== 'string' || !data.type.startsWith('cmd:')) return;
  switch (data.type) {
    case 'cmd:config':
      applyFields(data.config || {});
      applyConfig();
      break;
    case 'cmd:message':    addMessage(data.data); break;
    case 'cmd:event':      handleStreamEvent(data.listener, data.event || {}); break;
    case 'cmd:goal':       setGoalValue(data.value, true); break;
    case 'cmd:connect':    CONFIG.twitchChannel = data.channel || ''; applyConfig(); updateTitle(); break;
    case 'cmd:disconnect': CONFIG.twitchChannel = ''; disconnectTwitch(); applyConfig(); break;
    case 'cmd:clear':      document.getElementById('messages-list').innerHTML = ''; break;
  }
});

// =====================================================
//   Boot
// =====================================================

const IS_SE      = typeof window.SE_API !== 'undefined' || /streamelements\.com/.test(window.location.href);
const IS_IFRAME  = window !== window.top;
const HAS_PARAMS = applyUrlParams();
goalValue = +CONFIG.goalCurrent || 0;

function boot() {
  // Opened directly with no settings → demo mode, so you can see what it looks like
  if (!IS_SE && !IS_IFRAME && !HAS_PARAMS) {
    CONFIG.showGoal    = true;
    CONFIG.goalCurrent = 45;
    CONFIG.goalDesc    = 'Facecam at 100 subs!';
    startDemo();
  }
  applyConfig();
  try { window.parent.postMessage({ type: 'cmd:ready' }, '*'); } catch (_) {}
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

function startDemo() {
  const SAMPLES = [
    { displayName: 'StreamFan42',  username: 'streamfan42',  text: 'Hey everyone! 🎮',                        badges: [{ type: 'subscriber' }],                         color: '#FF6B6B' },
    { displayName: 'ModPowerful',  username: 'modpowerful',  text: 'Welcome to the chat!',                     badges: [{ type: 'moderator' }],                          color: '#34AE1A' },
    { displayName: 'CasualViewer', username: 'casualviewer', text: 'This game looks so good tonight 🔥',       badges: [],                                               color: null      },
    { displayName: 'VIP_Legend',   username: 'vip_legend',   text: 'Love this stream, keep it up!',            badges: [{ type: 'vip' }],                                color: '#FF69B4' },
    { displayName: 'Broadcaster',  username: 'broadcaster',  text: 'Thanks for the sub! <3',                   badges: [{ type: 'broadcaster' }],                        color: '#FFD700' },
    { displayName: 'SubGifter99',  username: 'subgifter99',  text: 'Just gifted 5 subs!',                      badges: [{ type: 'sub-gifter' }, { type: 'subscriber' }], color: '#C77DFF' },
    { displayName: 'TwitchUser',   username: 'twitchuser',   text: 'Does anyone know this game?',              badges: [],                                               color: null      },
    { displayName: 'NightBot',     username: 'nightbot',     text: '!commands to see the available commands',  badges: [{ type: 'moderator' }],                          color: '#1B9AF5' },
  ];
  let idx = 0;
  const tick = () => {
    addMessage(SAMPLES[idx % SAMPLES.length]);
    idx++;
    setTimeout(tick, 1800 + Math.random() * 2200);
  };
  setTimeout(tick, 600);
}
