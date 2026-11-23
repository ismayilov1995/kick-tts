type Voice = { id: string; name: string; lang: string };
type LogEntry = { ts: number; username: string; type: string; text: string; status: string; reason?: string; kind?: string };
type UserRow = { user_id: string; username: string; score: number; level: string; msg_count: number; days_active: number; streak: number; blocked: number };

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return (res.status === 204 ? null : await res.json()) as T;
}

const fail = (err: unknown) => {
  console.error(err);
  alert('Xəta: server cavab vermədi');
};
const safe = <A extends unknown[]>(fn: (...a: A) => unknown) => (...a: A) => {
  try {
    Promise.resolve(fn(...a)).catch(fail);
  } catch (err) {
    fail(err);
  }
};

const SLOTS: Record<string, string> = { main: 'Əsas səs', cyrillic: 'Kiril mətn üçün səs', announcer: 'Aparıcı səsi (şablonlar)' };
const TEMPLATES: Record<string, string> = {
  level_up: 'Səviyyə qalxması',
  msg_milestone: 'Mesaj sayı (100 / 500 / 1000 / 5000)',
  streak: 'Ardıcıl günlər (3 / 7 / 14 / 30)',
  comeback: '7+ gün sonra qayıdış',
  first_message: 'İlk mesaj',
  spam: 'Spam (dəqiqədə 10+ mesaj)',
};
const STATUS: Record<string, string> = { queued: 'növbədə', skipped: 'keçildi', spoken: 'oxundu', failed: 'xəta', dropped: 'atıldı' };

let settings: any;
let voices: Voice[] = [];
let paused = false;

async function save(patch: Record<string, unknown>): Promise<void> {
  settings = await api('/api/settings', 'POST', patch);
}

function renderSettings(): void {
  $<HTMLInputElement>('username').value = settings.username;
  $<HTMLInputElement>('channelId').value = settings.channelId;
  $<HTMLInputElement>('chatroomId').value = settings.chatroomId;
  document.querySelectorAll<HTMLInputElement>('[data-key]').forEach((el) => {
    const key = el.dataset.key!;
    if (el.type === 'checkbox') el.checked = settings[key];
    else el.value = String(settings[key]);
    el.onchange = safe(() => save({ [key]: el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value }));
  });

  $('voices').innerHTML = Object.entries(SLOTS)
    .map(([slot, label]) => `<div class="row"><label>${label}<select data-slot="${slot}"><option value="">Avtomatik</option>${voices
      .map((v) => `<option value="${esc(v.id)}"${settings.voices[slot] === v.id ? ' selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`)
      .join('')}</select></label><button data-listen="${slot}">Dinlə</button></div>`)
    .join('');
  document.querySelectorAll<HTMLSelectElement>('[data-slot]').forEach((el) => {
    el.onchange = safe(() => save({ voices: { [el.dataset.slot!]: el.value } }));
  });
  document.querySelectorAll<HTMLButtonElement>('[data-listen]').forEach((el) => {
    el.onclick = safe(() => api('/api/test', 'POST', { slot: el.dataset.listen }));
  });

  $('templates').innerHTML = Object.entries(TEMPLATES)
    .map(([key, label]) => `<fieldset><legend><label><input type="checkbox" data-tpl-on="${key}"${settings.templates[key].enabled ? ' checked' : ''}> ${label}</label></legend>
      <textarea data-tpl="${key}" rows="2">${esc(settings.templates[key].variants.join('\n'))}</textarea></fieldset>`)
    .join('');
  document.querySelectorAll<HTMLInputElement>('[data-tpl-on]').forEach((el) => {
    el.onchange = safe(() => save({ templates: { [el.dataset.tplOn!]: { enabled: el.checked } } }));
  });
  document.querySelectorAll<HTMLTextAreaElement>('[data-tpl]').forEach((el) => {
    el.onchange = safe(() => save({ templates: { [el.dataset.tpl!]: { variants: el.value.split('\n') } } }));
  });
}

function renderStatus(st: any): void {
  const src = st.source;
  const label = src.state === 'connected' ? 'Kick: qoşulub' : src.state === 'connecting' ? 'Kick: qoşulur…' : 'Kick: qoşulmayıb';
  $('status').textContent = label + (src.fallbackKey ? ' (ehtiyat açar)' : '') + (src.error ? ` — xəta: ${src.error}` : '');
  $('status').className = `pill ${src.state === 'connected' && !src.error ? 'ok' : 'bad'}`;
  $('overlay').textContent = st.overlays > 0 ? 'OBS overlay: qoşulub' : 'OBS overlay qoşulmayıb!';
  $('overlay').className = `pill ${st.overlays > 0 ? 'ok' : 'bad'}`;
  $('queue').textContent = `Növbədə: ${st.queue}${st.current ? ` · İndi oxunur: ${st.current}` : ''}`;
  paused = st.paused;
  $('pause').textContent = paused ? 'Davam et' : 'Pauza';
}

function addLog(e: LogEntry, prepend = true): void {
  const li = document.createElement('li');
  li.className = e.status;
  li.innerHTML = `<time>${new Date(e.ts).toLocaleTimeString()}</time> <b>${esc(e.username)}</b> <i>${esc(e.kind ?? e.type)}</i> ${esc(e.text)} <span>${esc(STATUS[e.status] ?? e.status)}${e.reason ? `: ${esc(e.reason)}` : ''}</span>`;
  const log = $('log');
  if (prepend) log.prepend(li);
  else log.append(li);
  while (log.children.length > 100) log.lastElementChild!.remove();
}

async function loadUsers(): Promise<void> {
  const rows = await api<UserRow[]>(`/api/users?q=${encodeURIComponent($<HTMLInputElement>('search').value)}`);
  $('users').innerHTML =
    '<tr><th>#</th><th>Ad</th><th>Səviyyə</th><th>Bal</th><th>Mesaj</th><th>Gün</th><th>Streak</th></tr>' +
    rows
      .map((r, i) => `<tr data-user="${esc(r.user_id)}"><td>${i + 1}</td><td>${esc(r.username)}${r.blocked ? ' 🚫' : ''}</td><td>${esc(r.level)}</td><td>${r.score}</td><td>${r.msg_count}</td><td>${r.days_active}</td><td>${r.streak}</td></tr>`)
      .join('');
  $('users').querySelectorAll<HTMLTableRowElement>('[data-user]').forEach((tr) => {
    tr.onclick = safe(() => showProfile(tr.dataset.user!));
  });
}

async function showProfile(id: string): Promise<void> {
  const url = `/api/users/${encodeURIComponent(id)}`;
  const p = await api(url);
  if (!p || p.error) return;
  $('profile').innerHTML = `<h3>${esc(p.username)} — ${esc(p.level)} (${p.score})</h3>
    <p class="hint">Mesaj: ${p.msg_count} · Gün: ${p.days_active} · Streak: ${p.streak} · KICK: ${p.kicks_total} · Abunə: ${p.subs} · Hədiyyə abunə: ${p.gift_subs} · Reward: ${p.redemptions}</p>
    <button id="block">${p.blocked ? 'Bloku aç' : 'Blokla'}</button> <button id="delete" class="danger">Məlumatı sil</button>
    <ul>${p.recent.map((m: { text: string; ts: number }) => `<li><time>${new Date(m.ts).toLocaleString()}</time> ${esc(m.text)}</li>`).join('')}</ul>`;
  $('block').onclick = safe(async () => {
    await api(`${url}/block`, 'POST', { blocked: !p.blocked });
    await showProfile(id);
    await loadUsers();
  });
  $('delete').onclick = safe(async () => {
    if (!confirm(`${p.username} haqqında bütün məlumat silinsin? Bu geri qaytarıla bilməz.`)) return;
    await api(url, 'DELETE');
    $('profile').innerHTML = '';
    await loadUsers();
  });
}

async function connectKick(): Promise<void> {
  const r = await api('/api/connect', 'POST');
  $('manual').hidden = !r.needManual;
  if (r.needManual) {
    const link = `https://kick.com/api/v2/channels/${encodeURIComponent(settings.username.toLowerCase())}`;
    const a = $<HTMLAnchorElement>('manual-link');
    a.href = link;
    a.textContent = link;
  }
  if (r.error) alert(r.error);
}

$('connect').onclick = safe(async () => {
  await save({ username: $<HTMLInputElement>('username').value.trim() });
  await connectKick();
});
$('save-ids').onclick = safe(async () => {
  await save({ channelId: $<HTMLInputElement>('channelId').value.trim(), chatroomId: $<HTMLInputElement>('chatroomId').value.trim() });
  await connectKick();
});
$('test').onclick = safe(() => api('/api/test', 'POST', { slot: 'main' }));
$('skip').onclick = safe(() => api('/api/skip', 'POST'));
$('pause').onclick = safe(() => api(paused ? '/api/resume' : '/api/pause', 'POST'));
$('search').oninput = safe(() => loadUsers());

function connectWs(): void {
  const ws = new WebSocket(`ws://${location.host}/ws?role=dashboard`);
  ws.onmessage = (m) => {
    const msg = JSON.parse(String(m.data));
    if (msg.type === 'status') renderStatus(msg.status);
    if (msg.type === 'log') addLog(msg.entry);
  };
  ws.onclose = () => setTimeout(connectWs, 2000);
}

async function init(): Promise<void> {
  const s = await api('/api/state');
  settings = s.settings;
  voices = s.voices;
  renderSettings();
  renderStatus(s.status);
  for (const e of s.log) addLog(e, false);
  await loadUsers();
  connectWs();
  setInterval(loadUsers, 15_000);
}

init().catch(fail);
