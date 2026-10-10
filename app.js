import { CONFIG } from './config.js';
import { analyze, scoreToTemp, summarizeDay, dayKey, countWords, MIN_WORDS, TAG_LABEL } from './analyzer.js';
import { createStore, localStore } from './store.js';
import { Recorder } from './recorder.js';

const $ = (sel, el = document) => el.querySelector(sel);
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n) => String(n).padStart(2, '0');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lsGet = (k, d = null) => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? d : v;
  } catch {
    return d;
  }
};
const lsSet = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* 저장이 막힌 환경 */
  }
};
const lsDel = (k) => {
  try {
    localStorage.removeItem(k);
  } catch {
    /* 저장이 막힌 환경 */
  }
};

/* ---------- 집 코드 ---------- */
function readCode() {
  const m = location.hash.match(/c=([A-Za-z0-9]{16,64})/);
  if (m) {
    lsSet('jibon:code', m[1]);
    history.replaceState(null, '', location.pathname + location.search);
    return m[1];
  }
  return lsGet('jibon:code');
}
function newCode() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const a = new Uint32Array(24);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => abc[n % abc.length]).join('');
}
const shareLink = () => `${location.origin}${location.pathname}#c=${code}`;

/* ---------- 상태 ---------- */
let code = readCode();
let store = null;
let unsub = null;
let readings = [];
let selectedDay = null;
let ticking = false;

/* 측정 시간: 기본값은 config.js, 폰마다 거실 폰 탭에서 바꿀 수 있어요 */
const toMin = (s) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};
const atMinutes = (base, m) => {
  const d = new Date(base);
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d;
};
function loadWindow() {
  try {
    const w = JSON.parse(lsGet('jibon:win', 'null'));
    if (w && /^\d\d:\d\d$/.test(w.start) && /^\d\d:\d\d$/.test(w.end) && toMin(w.end) > toMin(w.start)) return w;
  } catch {
    /* 기본값 사용 */
  }
  return { start: `${pad(CONFIG.window.start)}:00`, end: `${pad(CONFIG.window.end)}:00` };
}
let win = loadWindow();

/* ---------- 색 ---------- */
function cssHex(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function hexToRgb(h) {
  const n = parseInt(h.replace('#', '').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
function tempColor(t) {
  const { min, max, neutral } = CONFIG.tempRange;
  const cold = hexToRgb(cssHex('--cold') || '#3f7bd9');
  const mid = hexToRgb(cssHex('--mid') || '#94a0ac');
  const warm = hexToRgb(cssHex('--warm') || '#e5742b');
  const rgb = t <= neutral
    ? mix(cold, mid, clamp((t - min) / (neutral - min), 0, 1))
    : mix(mid, warm, clamp((t - neutral) / (max - neutral), 0, 1));
  return `rgb(${rgb.join(',')})`;
}

/* ---------- 날짜 ---------- */
function fmtDay(key) {
  const d = new Date(`${key}T12:00:00`);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`;
}
function lastNDays(n) {
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const x = new Date(base);
    x.setDate(base.getDate() - i);
    out.push(dayKey(x));
  }
  return out;
}
function byDay() {
  const m = new Map();
  for (const r of readings) {
    if (!m.has(r.day)) m.set(r.day, []);
    m.get(r.day).push(r);
  }
  for (const list of m.values()) list.sort((a, b) => a.ts - b.ts);
  return m;
}
function fmtDur(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}시간 ${pad(m)}분` : `${pad(m)}:${pad(s % 60)}`;
}

/* ---------- 온도계 그림 ---------- */
function thermometerSVG(temp) {
  const { min, max } = CONFIG.tempRange;
  const has = temp != null;
  const frac = has ? clamp((temp - min) / (max - min), 0, 1) : 0;
  const x = 46;
  const w = 28;
  const top = 14;
  const tubeH = 214;
  const cy = 252;
  const r = 32;
  const level = has ? Math.max(8, tubeH * frac) : 0;
  const liquidY = top + tubeH - level;
  const col = has ? tempColor(temp) : 'var(--line)';
  const shape = `<rect x="${x}" y="${top}" width="${w}" height="${tubeH + 20}" rx="14"/><circle cx="60" cy="${cy}" r="${r}"/>`;
  const ticks = [14, 18, 22, 26, 30]
    .map((v) => {
      const y = top + tubeH * (1 - (v - min) / (max - min));
      return `<line x1="${x + w + 6}" x2="${x + w + 14}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-width="1.5"/><text x="${x + w + 18}" y="${y + 4}" font-size="11" fill="var(--muted)">${v}°</text>`;
    })
    .join('');
  const label = has ? `집안 온도 ${temp.toFixed(1)}도` : '집안 온도 기록 없음';
  return `<svg viewBox="0 0 124 292" role="img" aria-label="${label}">
    <g fill="none" stroke="var(--line)" stroke-width="3">${shape}</g>
    <g fill="var(--surface)">${shape}</g>
    ${has ? `<rect class="thermo-fill" x="${x + 5}" y="${liquidY}" width="${w - 10}" height="${cy - liquidY}" rx="9" fill="${col}"/>` : ''}
    <circle cx="60" cy="${cy}" r="${r - 6}" fill="${col}"/>
    ${ticks}
  </svg>`;
}

/* ---------- 확인 화면 ---------- */
function renderHero(focus, today, s) {
  const isToday = focus === today;
  const dayLabel = isToday
    ? `오늘 · ${fmtDay(focus)}`
    : `${fmtDay(focus)}${selectedDay ? '' : ' · 마지막 측정'}`;
  const col = s.temp != null ? tempColor(s.temp) : 'var(--line)';
  const tempText = s.temp != null ? `${s.temp.toFixed(1)}<sup>°C</sup>` : '--';
  const chip = s.band ? `<span class="chip"><i style="background:${col}"></i>${s.band.label}</span>` : '';
  const tags = s.tags.length
    ? `<div class="tags">${s.tags.map((t) => `<span class="tag">${TAG_LABEL[t] || t}</span>`).join('')}</div>`
    : '';
  const empty = s.count === 0;
  const comment = empty
    ? '아직 측정된 기록이 없어요. 거실 폰에서 측정을 시작하면 여기에 나타나요.'
    : s.comment;
  $('#hero').innerHTML = `
    <div class="thermo">${thermometerSVG(s.temp)}</div>
    <div class="hero-text">
      <p class="eyebrow">${dayLabel}</p>
      <p class="temp">${tempText}</p>
      ${chip}
      <p class="comment">${comment}</p>
      <p class="meta">측정 ${s.count}회</p>
      ${tags}
      ${empty ? '<button class="link-btn" type="button" data-go="room">거실 폰 화면으로 가기</button>' : ''}
    </div>`;
}

function renderFlow(list) {
  const el = $('#flow');
  if (!list.length) {
    el.innerHTML = '<p class="muted">이 날의 측정 기록이 없어요.</p>';
    return;
  }
  const { min, max } = CONFIG.tempRange;
  const many = list.length > 8;
  const cols = list
    .map((r, i) => {
      const t = new Date(r.ts);
      const hhmm = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
      const quiet = r.quiet || typeof r.temp !== 'number';
      const h = quiet ? 6 : 12 + 88 * clamp((r.temp - min) / (max - min), 0, 1);
      const col = quiet ? 'var(--line)' : tempColor(r.temp);
      const desc = quiet ? `${hhmm} 조용` : `${hhmm} ${r.temp.toFixed(1)}도`;
      const show = !many || i % 2 === 0;
      return `<div class="col" title="${desc}" aria-label="${desc}">
        <div class="track"><span class="bar" style="height:${h}%;background:${col}"></span></div>
        <span class="tlabel">${show ? hhmm : ''}</span>
      </div>`;
    })
    .join('');
  const real = list.filter((r) => !r.quiet && typeof r.temp === 'number');
  let note = '';
  if (real.length >= 2) {
    const lo = real.reduce((a, b) => (b.temp < a.temp ? b : a));
    const hi = real.reduce((a, b) => (b.temp > a.temp ? b : a));
    const f = (r) => {
      const t = new Date(r.ts);
      return `${pad(t.getHours())}:${pad(t.getMinutes())} (${r.temp.toFixed(1)}°)`;
    };
    note = `<p class="flow-note">가장 쌀쌀했던 때 ${f(lo)} · 가장 따뜻했던 때 ${f(hi)}</p>`;
  }
  el.innerHTML = `<div class="flow">${cols}</div>${note}`;
}

function weekChartSVG(keys, map, focus) {
  const W = 340;
  const H = 184;
  const L = 32;
  const R = 20;
  const T = 18;
  const B = 30;
  const iw = W - L - R;
  const ih = H - T - B;
  const { min, max, neutral } = CONFIG.tempRange;
  const X = (i) => L + (iw * i) / (keys.length - 1);
  const Y = (t) => T + ih * (1 - (clamp(t, min, max) - min) / (max - min));
  const pts = keys.map((k, i) => ({ k, i, x: X(i), temp: summarizeDay(map.get(k) || []).temp }));
  if (!pts.some((p) => p.temp != null)) return '<p class="muted">아직 그래프로 그릴 기록이 없어요.</p>';

  const grid = [18, 22, 26]
    .map(
      (v) =>
        `<line class="grid${v === neutral ? ' mid' : ''}" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${v}°</text>`,
    )
    .join('');

  let d = '';
  let prev = false;
  for (const p of pts) {
    if (p.temp == null) {
      prev = false;
    } else {
      d += `${prev ? 'L' : 'M'}${p.x.toFixed(1)} ${Y(p.temp).toFixed(1)} `;
      prev = true;
    }
  }

  const dots = pts
    .filter((p) => p.temp != null)
    .map((p) => {
      const y = Y(p.temp);
      const active = p.k === focus;
      return `${active ? `<circle cx="${p.x}" cy="${y}" r="9" fill="none" stroke="var(--accent)" stroke-width="2"/>` : ''}
        <circle cx="${p.x}" cy="${y}" r="5" fill="${tempColor(p.temp)}" stroke="var(--surface)" stroke-width="2"/>
        ${active ? `<text class="val" x="${p.x}" y="${y - 14}" text-anchor="middle">${p.temp.toFixed(1)}°</text>` : ''}`;
    })
    .join('');

  const xl = pts
    .map((p) => {
      const dt = new Date(`${p.k}T12:00:00`);
      return `<text class="${p.k === focus ? 'xl-active' : ''}" x="${p.x}" y="${H - 8}" text-anchor="middle">${dt.getMonth() + 1}/${dt.getDate()}</text>`;
    })
    .join('');

  const hits = pts
    .map((p) => {
      const has = (map.get(p.k) || []).length > 0;
      return `<rect class="hit" x="${p.x - iw / 12}" y="0" width="${iw / 6}" height="${H}" ${has ? `data-day="${p.k}"` : ''}/>`;
    })
    .join('');

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 7일 집안 온도 변화">
    ${grid}
    <path class="line" d="${d}"/>
    ${dots}
    ${xl}
    ${hits}
  </svg>`;
}

function renderRows(keys, map, focus) {
  const rows = keys
    .slice()
    .reverse()
    .filter((k) => (map.get(k) || []).length)
    .map((k) => {
      const s = summarizeDay(map.get(k));
      const dt = new Date(`${k}T12:00:00`);
      const col = s.temp != null ? tempColor(s.temp) : 'var(--line)';
      const val = s.temp != null ? `${s.temp.toFixed(1)}°` : '조용';
      return `<li><button class="row" type="button" data-day="${k}" aria-pressed="${k === focus}">
        <span class="d">${dt.getMonth() + 1}/${dt.getDate()}<small>${WEEK[dt.getDay()]}요일</small></span>
        <span class="c">${s.comment}</span>
        <span class="pill"><i style="background:${col}"></i>${val}</span>
      </button></li>`;
    })
    .join('');
  $('#rows').innerHTML = rows;
}

function renderCheck() {
  const map = byDay();
  const today = dayKey(new Date());
  const keys = [...map.keys()].sort();
  const focus = selectedDay && map.has(selectedDay)
    ? selectedDay
    : map.has(today)
      ? today
      : keys[keys.length - 1] || today;
  const list = map.get(focus) || [];
  const s = summarizeDay(list);
  renderHero(focus, today, s);
  renderFlow(list);
  const week = lastNDays(7);
  $('#week').innerHTML = weekChartSVG(week, map, focus);
  renderRows(week, map, focus);
}

/* ---------- 거실 폰 ---------- */
let recording = false;
let chunkTimer = null;
let lastFlushAt = 0;
let wakeLock = null;
let chunkWords = 0;
let msgText = '';
let autoStart = lsGet('jibon:auto', '1') === '1';
let autoBlocked = false;
let pausedDay = null; // 오늘은 직접 멈췄으면 자동 시작을 쉬어요
let manualRun = false; // 측정 시간 밖에 직접 시작했으면 직접 멈출 때까지 계속해요

const rec = new Recorder({
  lang: CONFIG.lang,
  onWords: (n) => {
    chunkWords = n;
    if (n > 0 && msgText.startsWith('음성 인식 서버')) msgText = '';
    if (recording) paintRoom();
  },
  onError: (kind) => {
    if (kind === 'mic-denied') {
      forceStopLocal();
      autoBlocked = true;
      msgText = '마이크 권한이 꺼져 있어요. 주소창 옆 사이트 설정에서 마이크를 허용한 뒤 다시 눌러 주세요.';
    } else if (kind === 'network') {
      msgText = '음성 인식 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.';
    }
    paintRoom();
  },
});

function windowInfo(now = new Date()) {
  const s = atMinutes(now, toMin(win.start));
  const e = atMinutes(now, toMin(win.end));
  if (now < s) return { phase: 'before', ms: s - now };
  if (now < e) return { phase: 'open', ms: e - now };
  const next = new Date(s);
  next.setDate(next.getDate() + 1);
  return { phase: 'after', ms: next - now };
}

async function requestWake() {
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    /* 지원하지 않는 기기 */
  }
}
function releaseWake() {
  try {
    wakeLock && wakeLock.release();
  } catch {
    /* 이미 해제됨 */
  }
  wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && recording) requestWake();
});

function setBanner(on, manual = false) {
  $('#rec-banner').hidden = !on;
  document.body.classList.toggle('recording', on);
  $('#rec-banner-sub').textContent = on ? (manual ? '직접 멈출 때까지 듣고 있어요' : `${win.end}에 자동으로 끝나요`) : '';
}

function forceStopLocal() {
  recording = false;
  manualRun = false;
  clearInterval(chunkTimer);
  rec.stop();
  releaseWake();
  setBanner(false);
}

async function save(r) {
  try {
    await store.add(r);
  } catch {
    msgText = '기록을 저장하지 못했어요. 인터넷 연결을 확인해 주세요.';
    paintRoom();
  }
}

// 글자를 꺼내 분석하고, 온도와 태그만 저장해요. 글자는 이 함수가 끝나면 사라져요.
async function flush(final) {
  const text = rec.takeText();
  const words = countWords(text);
  const elapsed = Date.now() - lastFlushAt;
  lastFlushAt = Date.now();
  const now = new Date();
  const base = { ts: now.getTime(), day: dayKey(now), source: 'voice' };
  if (words < MIN_WORDS) {
    if (final && elapsed < 60000) return;
    await save({ ...base, quiet: true, words, tags: ['quiet'] });
    return;
  }
  const a = analyze(text);
  await save({ ...base, temp: scoreToTemp(a.score), words: a.words, tags: a.tags });
}

function startRecording(manual = false) {
  if (recording || !rec.supported) return;
  manualRun = manual && windowInfo().phase !== 'open';
  recording = true;
  msgText = '';
  chunkWords = 0;
  lastFlushAt = Date.now();
  rec.start();
  chunkTimer = setInterval(() => flush(false), CONFIG.chunkMinutes * 60 * 1000);
  requestWake();
  setBanner(true, manualRun);
  paintRoom();
}

async function stopRecording() {
  if (!recording) return;
  recording = false;
  manualRun = false;
  clearInterval(chunkTimer);
  rec.stop();
  await new Promise((resolve) => setTimeout(resolve, 800));
  await flush(true);
  releaseWake();
  setBanner(false);
  paintRoom();
}

function paintRoom() {
  const info = windowInfo();
  $('#window-label').textContent = `${win.start} – ${win.end}`;
  const manualHint = '지금 바로 하려면 아래 버튼을 눌러 주세요.';
  let head;
  let sub;
  if (recording && manualRun) {
    head = '측정 중이에요';
    sub = `직접 멈출 때까지 들어요 · 이번 구간 ${chunkWords}단어`;
  } else if (recording) {
    head = '측정 중이에요';
    sub = `${win.end}까지 ${fmtDur(info.ms)} 남았어요 · 이번 구간 ${chunkWords}단어`;
  } else if (info.phase === 'open') {
    head = '지금 측정할 수 있어요';
    sub = autoStart ? '자동 시작이 켜져 있어요.' : '버튼을 눌러 시작해 주세요.';
  } else if (info.phase === 'before') {
    head = `${win.start}에 시작해요`;
    sub = `${autoStart ? `${fmtDur(info.ms)} 후 자동으로 시작해요.` : '자동 시작이 꺼져 있어요.'} ${manualHint}`;
  } else {
    head = '오늘 측정이 끝났어요';
    sub = `다음 측정까지 ${fmtDur(info.ms)}. ${manualHint}`;
  }
  $('#room-headline').textContent = head;
  $('#room-sub').textContent = sub;

  const btn = $('#rec-btn');
  btn.classList.toggle('stop', recording);
  if (recording) {
    btn.textContent = '측정 멈추기';
    btn.disabled = false;
  } else {
    btn.textContent = info.phase === 'open' ? '측정 시작' : '지금 바로 측정 시작';
    btn.disabled = !rec.supported;
  }
  $('#room-msg').textContent = rec.supported
    ? msgText
    : '이 브라우저는 음성 인식을 지원하지 않아요. 안드로이드 크롬으로 열어 주세요.';
  $('#auto-start').checked = autoStart;

  document.querySelectorAll('.mood').forEach((b) => b.style.setProperty('--c', tempColor(Number(b.dataset.temp))));
}

/* ---------- 공통 ---------- */
let toastTimer = null;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 2500);
}

function setNotice(text) {
  const el = $('#notice');
  el.textContent = text || '';
  el.hidden = !text;
}

function setView(v) {
  lsSet('jibon:view', v);
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.view === v)));
  $('#view-check').hidden = v !== 'check';
  $('#view-room').hidden = v !== 'room';
  if (v === 'room') paintRoom();
}

function render() {
  renderCheck();
  paintRoom();
}

function tick() {
  const now = new Date();
  $('#now').textContent = now.toLocaleString('ko-KR', { weekday: 'long', hour: 'numeric', minute: '2-digit' });
  const phase = windowInfo(now).phase;
  if (recording && !manualRun && phase !== 'open') {
    stopRecording();
  } else if (autoStart && !recording && !autoBlocked && pausedDay !== dayKey(now) && phase === 'open' && rec.supported) {
    startRecording();
  }
  if (recording || !$('#view-room').hidden) paintRoom();
}

/* ---------- 시작 ---------- */
async function boot() {
  if (!code) {
    $('#app').hidden = true;
    $('#setup').hidden = false;
    return;
  }
  $('#setup').hidden = true;
  $('#app').hidden = false;
  setNotice('');
  try {
    store = await createStore(code);
  } catch {
    store = localStore(code);
    setNotice('Firebase에 연결하지 못해 이 기기에만 저장해요.');
  }
  if (store.mode === 'local' && !CONFIG.firebase) {
    setNotice('Firebase 연결 전이라 이 기기에만 저장돼요. 다른 폰에서 보려면 README의 연결 방법을 따라 주세요.');
  }
  if (unsub) unsub();
  unsub = store.subscribe(
    (rs) => {
      readings = rs;
      render();
    },
    () => setNotice('기록을 불러오지 못했어요. 인터넷 연결과 Firebase 규칙을 확인해 주세요.'),
  );
  setView(lsGet('jibon:view', 'check'));
  if (!ticking) {
    ticking = true;
    tick();
    setInterval(tick, 1000);
  }
}

/* ---------- 이벤트 ---------- */
$('#btn-create').addEventListener('click', () => {
  code = newCode();
  lsSet('jibon:code', code);
  boot().then(() => {
    openSettings('다른 폰(거실 폰)에서 이 링크를 열면 같은 집으로 연결돼요.');
  });
});

$('#join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#join-input').value.trim();
  if (!/^[A-Za-z0-9]{16,64}$/.test(v)) {
    $('#join-error').textContent = '집 코드는 영문과 숫자 16자 이상이에요. 다시 확인해 주세요.';
    return;
  }
  code = v;
  lsSet('jibon:code', code);
  boot();
});

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));

$('#view-check').addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) {
    setView(go.dataset.go);
    return;
  }
  const el = e.target.closest('[data-day]');
  if (!el) return;
  selectedDay = el.dataset.day;
  renderCheck();
  $('#hero').scrollIntoView({ block: 'start' });
});

$('#rec-btn').addEventListener('click', () => {
  autoBlocked = false;
  if (recording) {
    pausedDay = dayKey(new Date());
    stopRecording();
  } else {
    pausedDay = null;
    startRecording(true);
  }
});

$('#auto-start').addEventListener('change', (e) => {
  autoStart = e.target.checked;
  lsSet('jibon:auto', autoStart ? '1' : '0');
  autoBlocked = false;
  paintRoom();
});

document.querySelectorAll('.mood').forEach((b) =>
  b.addEventListener('click', async () => {
    const now = new Date();
    await save({ ts: now.getTime(), day: dayKey(now), temp: Number(b.dataset.temp), tags: ['manual'], words: 0, source: 'manual' });
    toast('기록했어요');
  }),
);

/* 측정 시간 */
$('#win-start').value = win.start;
$('#win-end').value = win.end;
function onWindowChange() {
  const s = $('#win-start').value;
  const e = $('#win-end').value;
  const msg = $('#win-msg');
  if (!s || !e) return;
  if (toMin(e) <= toMin(s)) {
    msg.textContent = '끝나는 시간이 시작 시간보다 늦어야 해요.';
    return;
  }
  msg.textContent = '';
  win = { start: s, end: e };
  lsSet('jibon:win', JSON.stringify(win));
  autoBlocked = false;
  pausedDay = null;
  paintRoom();
  toast('측정 시간을 바꿨어요');
}
$('#win-start').addEventListener('change', onWindowChange);
$('#win-end').addEventListener('change', onWindowChange);

/* 설정 */
const dlg = $('#settings');
function openSettings(hint = '') {
  $('#code-field').value = code;
  $('#store-mode').textContent = store && store.mode === 'firebase'
    ? '저장 방식: Firebase로 여러 기기에 동기화 중'
    : '저장 방식: 이 기기에만 저장 중 (Firebase 연결 전)';
  $('#settings-hint').textContent = hint;
  dlg.showModal();
}
$('#btn-settings').addEventListener('click', () => openSettings());

$('#btn-copy').addEventListener('click', async () => {
  const link = shareLink();
  try {
    await navigator.clipboard.writeText(link);
    $('#settings-hint').textContent = '링크를 복사했어요. 다른 폰에서 이 링크를 열면 연결돼요.';
  } catch {
    const f = $('#code-field');
    f.value = link;
    f.select();
    $('#settings-hint').textContent = '링크를 길게 눌러 복사해 주세요.';
  }
});

function twoStep(btn, armedText, action) {
  let armed = false;
  let timer = null;
  const original = btn.textContent;
  btn.addEventListener('click', async () => {
    if (!armed) {
      armed = true;
      btn.textContent = armedText;
      timer = setTimeout(() => {
        armed = false;
        btn.textContent = original;
      }, 4000);
      return;
    }
    clearTimeout(timer);
    armed = false;
    btn.textContent = original;
    await action();
  });
}
twoStep($('#btn-clear'), '한 번 더 누르면 오늘 기록이 삭제돼요', async () => {
  try {
    await store.clearDay(dayKey(new Date()));
    toast('오늘 기록을 삭제했어요');
  } catch {
    toast('삭제하지 못했어요');
  }
});
twoStep($('#btn-reset'), '한 번 더 누르면 이 기기의 코드가 지워져요', async () => {
  lsDel('jibon:code');
  location.reload();
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (store) render();
});

boot();
