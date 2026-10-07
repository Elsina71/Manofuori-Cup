/* Referto elettronico di pallavolo indoor — interfaccia */
(function () {
  'use strict';

  const R = window.Rules;
  const KEY = 'mfIndoorScoresheet.v1';
  const $app = document.getElementById('app');
  const $overlay = document.getElementById('overlay');
  const $toast = document.getElementById('toast');
  const $topInfo = document.getElementById('topInfo');
  const $print = document.getElementById('print');

  // ---------- dati ----------
  let db = load();
  let ui = { view: 'home', id: null, lineup: null };
  let lastTap = 0;

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && d.matches) return d;
    } catch (e) { /* dati assenti o non leggibili */ }
    return { matches: {} };
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) { toast('Impossibile salvare sul dispositivo'); }
  }
  function cur() { return db.matches[ui.id]; }
  function touch(m) { m.updated = new Date().toISOString(); save(); if (m.link) Cloud.schedule(m); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  const today = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const emptyPlayers = n => Array.from({ length: n }, () => ({ no: '', name: '', gender: '', libero: false, captain: false }));

  function emptyMatch(from) {
    const m = {
      id: uid(),
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      header: { competition: '', phase: '', matchNo: '', date: today(), time: '', venue: '', court: '' },
      teams: {
        A: { name: '', color: '#1f63d1', coach: '', players: emptyPlayers(10) },
        B: { name: '', color: '#d9480f', coach: '', players: emptyPlayers(10) }
      },
      officials: { ref1: '', ref2: '', scorer: '' },
      settings: Object.assign({}, R.DEFAULT_SETTINGS),
      events: [],
      remarks: '',
      closedAt: null
    };
    if (from) {
      Object.assign(m.header, from.header, { time: '' });
      const n = parseInt(from.header.matchNo, 10);
      m.header.matchNo = isNaN(n) ? '' : String(n + 1);
      m.officials = Object.assign({}, from.officials);
      m.settings = Object.assign({}, from.settings);
    }
    return m;
  }

  // ---------- utilità ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const other = R.other;
  const hhmm = iso => (iso ? new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '—');
  const fmtDate = s => { if (!s) return ''; const [y, mo, d] = s.split('-'); return d ? `${d}/${mo}/${y}` : s; };
  const mins = (a, b) => (a && b ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000)) : null);
  const POS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];   // posti in campo (1 = al servizio)
  const SAN = {
    DW: ['Avvertimento per ritardo', 'AR'], DP: ['Penalizzazione per ritardo', 'PR'],
    W: ['Avvertimento (giallo)', 'G'], P: ['Penalizzazione (rosso)', 'R'],
    E: ['Espulsione (resto del set)', 'ESP'], D: ['Squalifica (resto della gara)', 'SQ']
  };

  function teamName(m, tm) { return m.teams[tm].name || `Squadra ${tm}`; }
  const roster = (m, tm) => m.teams[tm].players.filter(p => p.no !== '' && p.no != null);
  const player = (m, tm, no) => roster(m, tm).find(p => +p.no === +no);
  function pLabel(m, tm, no) {
    const p = player(m, tm, no);
    return p && p.name ? `${no} ${p.name}` : String(no);
  }
  const isWoman = (m, tm, no) => { const p = player(m, tm, no); return !!p && p.gender === 'F'; };
  const playable = (m, tm) => roster(m, tm).filter(p => !p.libero).map(p => +p.no);
  const liberi = (m, tm) => roster(m, tm).filter(p => p.libero).map(p => +p.no);
  const womenIn = (m, tm, nos) => nos.filter(n => isWoman(m, tm, n)).length;

  function toast(msg) {
    $toast.textContent = msg;
    $toast.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { $toast.hidden = true; }, 2600);
  }

  function applyTeamColors(m) {
    const root = document.documentElement.style;
    ['A', 'B'].forEach(tm => {
      const c = (m && m.teams[tm].color) || (tm === 'A' ? '#1f63d1' : '#d9480f');
      const h = c.replace('#', ''), n = parseInt(h, 16);
      const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
      root.setProperty(`--${tm.toLowerCase()}`, c);
      root.setProperty(`--${tm.toLowerCase()}-ink`, lum > 0.62 ? '#13222e' : '#fff');
    });
  }

  const stateOf = m => R.replay(m);

  function viewFor(m) {
    if (!m) return 'home';
    if (!m.setupDone) return 'setup';
    const st = stateOf(m);
    if (st.phase === 'play') return 'live';
    if (st.phase === 'matchEnd') return 'end';
    return 'lineup';
  }

  function go(view, id) {
    if (id !== undefined) ui.id = id;
    ui.view = view;
    if (view !== 'lineup') ui.lineup = null;
    render();
    window.scrollTo(0, 0);
  }

  function renderTop(m) {
    if (!m || ui.view === 'home') { $topInfo.innerHTML = ''; return; }
    const st = stateOf(m);
    const parts = [];
    if (m.header.matchNo) parts.push(`Gara ${esc(m.header.matchNo)}`);
    parts.push(`${esc(teamName(m, 'A'))} <b>${st.setsWon.A}–${st.setsWon.B}</b> ${esc(teamName(m, 'B'))}`);
    $topInfo.innerHTML = parts.map(p => `<span>${p}</span>`).join('') + (m.link ? Cloud.dot() : '');
  }

  function render() {
    const m = cur();
    if (ui.view !== 'home' && !m) ui.view = 'home';
    applyTeamColors(m);
    renderTop(m);
    ({ home: renderHome, setup: renderSetup, lineup: renderLineup, live: renderLive, end: renderEnd })[ui.view](m);
  }

  // ---------- finestre ----------
  function openOverlay(html, opts) {
    opts = opts || {};
    $overlay.innerHTML = `<div class="dialog ${opts.cls || ''}" role="dialog" aria-modal="true">${html}</div>`;
    $overlay.hidden = false;
    $overlay.onclick = e => { if (e.target === $overlay && opts.dismiss !== false) closeOverlay(); };
  }
  function closeOverlay() {
    $overlay.hidden = true;
    $overlay.innerHTML = '';
    clearInterval(closeOverlay.timer);
    const q = closeOverlay.queue;
    closeOverlay.queue = null;
    if (q) q();
  }
  function confirmBox(title, text, okLabel, onOk, danger) {
    openOverlay(`<h2>${title}</h2><p>${text}</p><div class="row end"><button class="btn ghost" data-x>Annulla</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${okLabel}</button></div>`);
    $overlay.querySelector('[data-x]').onclick = closeOverlay;
    $overlay.querySelector('[data-ok]').onclick = () => { closeOverlay(); onOk(); };
  }
  function countdown(title, sub, secs, cls, then) {
    let left = secs;
    openOverlay(`<div class="big-alert ${cls}"><h2>${title}</h2><p>${sub}</p><p class="huge" data-c>${left}″</p><button class="btn primary wide" data-x>Fine</button></div>`, { cls: 'alert' });
    closeOverlay.queue = then;
    const el = $overlay.querySelector('[data-c]');
    closeOverlay.timer = setInterval(() => {
      left--;
      el.textContent = `${Math.max(0, left)}″`;
      if (left <= 0) { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); closeOverlay(); }
    }, 1000);
    $overlay.querySelector('[data-x]').onclick = closeOverlay;
  }

  // ---------- elenco gare ----------
  function statusOf(m) {
    if (m.closedAt) return ['Chiusa', 'done'];
    if (!m.events.length) return ['Da iniziare', 'idle'];
    const st = stateOf(m);
    return st.phase === 'matchEnd' ? ['Terminata', 'done'] : ['In corso', 'live'];
  }

  function renderHome() {
    const list = Object.values(db.matches).sort((a, b) => b.updated.localeCompare(a.updated));
    $app.innerHTML = `
      <section class="card">
        <h1>Referto pallavolo</h1>
        <p class="muted">Inserisci squadre e formazioni, indica il sorteggio e poi segna solo chi vince ogni azione: rotazioni, servizio, cambi di campo e fine set sono automatici.</p>
        <div class="row wrap">
          <button class="btn primary big" id="newBtn">+ Nuova gara</button>
          ${list.length ? '<button class="btn" id="sameBtn">Nuova gara, stesso torneo</button>' : ''}
        </div>
      </section>
      <section class="card">
        <h2>Gare</h2>
        ${list.length ? `<ul class="match-list">${list.map(m => {
          const st = stateOf(m); const [lab, cls] = statusOf(m);
          return `<li><button class="match-item" data-open="${m.id}">
            <span class="mi-title">${m.header.matchNo ? `Gara ${esc(m.header.matchNo)} · ` : ''}${esc(teamName(m, 'A'))} – ${esc(teamName(m, 'B'))}</span>
            <span class="mi-sub">${esc(m.header.competition)} ${fmtDate(m.header.date)} ${esc(m.header.time)}</span>
            <span class="mi-score">${st.setsWon.A}–${st.setsWon.B}</span><span class="badge ${cls}">${lab}</span></button>
            <button class="icon-btn" data-del="${m.id}" title="Elimina" aria-label="Elimina la gara">🗑</button></li>`;
        }).join('')}</ul>` : '<p class="muted">Nessuna gara salvata su questo dispositivo.</p>'}
      </section>
      <section class="card">
        <h2>Backup</h2>
        <p class="muted small">Le gare restano salvate su questo dispositivo. Esporta un file per conservarle o spostarle.</p>
        <div class="row wrap"><button class="btn" id="expBtn">Esporta gare (JSON)</button><label class="btn">Importa…<input type="file" id="impFile" accept=".json,application/json" hidden></label></div>
      </section>`;
    document.getElementById('newBtn').onclick = () => { const m = emptyMatch(); db.matches[m.id] = m; save(); go('setup', m.id); };
    const same = document.getElementById('sameBtn');
    if (same) same.onclick = () => { const m = emptyMatch(list[0]); db.matches[m.id] = m; save(); go('setup', m.id); };
    $app.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { const m = db.matches[b.dataset.open]; go(viewFor(m), m.id); });
    $app.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      const m = db.matches[b.dataset.del];
      confirmBox('Eliminare la gara?', `${esc(teamName(m, 'A'))} – ${esc(teamName(m, 'B'))}: il referto verrà cancellato da questo dispositivo.`, 'Elimina', () => { delete db.matches[m.id]; save(); render(); }, true);
    });
    document.getElementById('expBtn').onclick = () => download(new Blob([JSON.stringify(db, null, 1)], { type: 'application/json' }), `referti-pallavolo-${today()}.json`);
    document.getElementById('impFile').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then(txt => {
        const d = JSON.parse(txt);
        const n = Object.keys(d.matches || {}).length;
        Object.assign(db.matches, d.matches || {});
        save(); render(); toast(`${n} gare importate`);
      }).catch(() => toast('File non valido'));
    };
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- dati della gara ----------
  const field = (label, name, value, attrs) => `<label class="field"><span>${label}</span><input name="${name}" value="${esc(value)}" ${attrs || ''}></label>`;

  function renderSetup(m) {
    const locked = m.events.length > 0;
    const S = R.settingsOf(m);
    const linked = !!m.link;
    const teamBox = tm => {
      const T = m.teams[tm];
      return `<fieldset class="card team-box team-${tm}"><legend><span class="dot team-${tm}"></span> Squadra ${tm}</legend>
        <div class="grid2">
          ${field('Nome squadra', `${tm}.name`, T.name, linked ? 'readonly' : '')}
          <label class="field"><span>Colore maglia</span><input type="color" name="${tm}.color" value="${esc(T.color)}"></label>
        </div>
        <table class="roster"><thead><tr><th>N.</th><th>Nome e cognome</th><th title="Donna / Uomo">D/U</th><th title="Libero">L</th><th title="Capitano">K</th><th></th></tr></thead>
        <tbody>${T.players.map((p, i) => `<tr data-row="${i}">
          <td><input class="no" name="${tm}.p.${i}.no" value="${esc(p.no)}" inputmode="numeric" maxlength="2" ${locked ? 'readonly' : ''}></td>
          <td><input name="${tm}.p.${i}.name" value="${esc(p.name)}"></td>
          <td><select name="${tm}.p.${i}.gender"><option value=""></option><option value="F" ${p.gender === 'F' ? 'selected' : ''}>D</option><option value="M" ${p.gender === 'M' ? 'selected' : ''}>U</option></select></td>
          <td><input type="checkbox" name="${tm}.p.${i}.libero" ${p.libero ? 'checked' : ''} ${locked ? 'disabled' : ''}></td>
          <td><input type="radio" name="${tm}.captain" value="${i}" ${p.captain ? 'checked' : ''}></td>
          <td>${locked ? '' : `<button type="button" class="icon-btn" data-delrow="${tm}.${i}" aria-label="Togli la riga">✕</button>`}</td></tr>`).join('')}</tbody></table>
        ${locked ? '' : `<button type="button" class="btn small" data-addrow="${tm}">+ Giocatore</button>`}
        ${field('Allenatore', `${tm}.coach`, T.coach)}
      </fieldset>`;
    };
    $app.innerHTML = `<form id="setupForm">
      <section class="card"><h2>Gara</h2>
        <div class="grid3">
          ${field('Torneo / competizione', 'h.competition', m.header.competition, linked ? 'readonly' : '')}
          ${field('Fase', 'h.phase', m.header.phase, linked ? 'readonly' : '')}
          ${field('Gara n.', 'h.matchNo', m.header.matchNo, linked ? 'readonly' : 'inputmode="numeric"')}
          ${field('Data', 'h.date', m.header.date, 'type="date"')}
          ${field('Ora', 'h.time', m.header.time, 'type="time"')}
          ${field('Palestra / luogo', 'h.venue', m.header.venue)}
          ${field('Campo', 'h.court', m.header.court)}
        </div>
      </section>
      <div class="teams-grid">${teamBox('A')}${teamBox('B')}</div>
      <section class="card"><h2>Ufficiali di gara</h2>
        <div class="grid3">${field('1° arbitro', 'o.ref1', m.officials.ref1)}${field('2° arbitro', 'o.ref2', m.officials.ref2)}${field('Segnapunti', 'o.scorer', m.officials.scorer)}</div>
      </section>
      <section class="card"><h2>Formula</h2>
        ${locked ? '<p class="muted small">La gara è iniziata: la formula non si può più cambiare.</p>' : ''}
        <div class="grid3">
          <label class="field"><span>Set</span><select name="s.mode" ${locked ? 'disabled' : ''}>
            <option value="best" ${S.mode !== 'fixed' ? 'selected' : ''}>Al meglio di…</option>
            <option value="fixed" ${S.mode === 'fixed' ? 'selected' : ''}>Set fissi</option></select></label>
          ${field('Numero di set', 's.sets', S.sets, `type="number" min="1" max="7" ${locked ? 'readonly' : ''}`)}
          ${field('Punti per set', 's.points', S.points, `type="number" min="5" max="50" ${locked ? 'readonly' : ''}`)}
          ${field('Punti ultimo set', 's.lastPoints', S.lastPoints, `type="number" min="5" max="50" ${locked ? 'readonly' : ''}`)}
          ${field('Punteggio massimo (0 = nessuno)', 's.cap', S.cap, `type="number" min="0" max="60" ${locked ? 'readonly' : ''}`)}
          ${field('Time-out per set', 's.timeoutsPerSet', S.timeoutsPerSet, `type="number" min="0" max="5" ${locked ? 'readonly' : ''}`)}
          ${field('Sostituzioni per set', 's.subsPerSet', S.subsPerSet, `type="number" min="0" max="20" ${locked ? 'readonly' : ''}`)}
          ${S.minWomen && typeof S.minWomen === 'object'
            ? `<label class="field"><span>Donne in campo, minimo</span><input value="${esc(`${teamName(m, 'A')}: ${R.minWomenOf(S, 'A')} · ${teamName(m, 'B')}: ${R.minWomenOf(S, 'B')}`)}" readonly></label>`
            : field('Donne in campo, minimo (0 = nessun controllo)', 's.minWomen', S.minWomen, `type="number" min="0" max="6" ${locked ? 'readonly' : ''}`)}
        </div>
        <p class="muted small">Regole FIVB: al meglio dei 5, set a 25, quinto set a 15, 2 time-out e 6 sostituzioni per set.</p>
      </section>
      <p class="error" id="setupErr"></p>
      <div class="row end sticky-actions"><button type="button" class="btn ghost" id="backBtn">Elenco gare</button><button class="btn primary big">${locked ? 'Salva e torna alla gara' : 'Avanti: sorteggio e formazioni'}</button></div>
    </form>`;

    const f = document.getElementById('setupForm');
    const read = () => {
      const fd = new FormData(f);
      const get = k => (fd.has(k) ? String(fd.get(k)).trim() : null);
      Object.keys(m.header).forEach(k => { const v = get('h.' + k); if (v != null) m.header[k] = v; });
      Object.keys(m.officials).forEach(k => { const v = get('o.' + k); if (v != null) m.officials[k] = v; });
      ['A', 'B'].forEach(tm => {
        const T = m.teams[tm];
        ['name', 'color', 'coach'].forEach(k => { const v = get(`${tm}.${k}`); if (v != null) T[k] = v; });
        const cap = get(`${tm}.captain`);
        T.players.forEach((p, i) => {
          const no = get(`${tm}.p.${i}.no`);
          if (no != null) p.no = no === '' ? '' : (parseInt(no, 10) >= 0 ? parseInt(no, 10) : '');
          p.name = get(`${tm}.p.${i}.name`) || '';
          p.gender = get(`${tm}.p.${i}.gender`) || '';
          if (!locked) p.libero = fd.has(`${tm}.p.${i}.libero`);
          p.captain = cap === String(i);
        });
      });
      if (!locked) {
        const n = (k, d) => { const v = parseInt(get('s.' + k), 10); return isNaN(v) ? d : v; };
        m.settings = {
          mode: get('s.mode') === 'fixed' ? 'fixed' : 'best', sets: n('sets', 5), points: n('points', 25), lastPoints: n('lastPoints', 15),
          cap: n('cap', 0), timeoutsPerSet: n('timeoutsPerSet', 2), subsPerSet: n('subsPerSet', 6), minWomen: m.settings.minWomen && typeof m.settings.minWomen === 'object' ? m.settings.minWomen : n('minWomen', 2)
        };
      }
    };
    f.oninput = f.onchange = () => { read(); touch(m); if (f.querySelector('[name="A.color"]')) applyTeamColors(m); };
    $app.querySelectorAll('[data-addrow]').forEach(b => b.onclick = () => { read(); m.teams[b.dataset.addrow].players.push(emptyPlayers(1)[0]); touch(m); render(); });
    $app.querySelectorAll('[data-delrow]').forEach(b => b.onclick = () => { read(); const [tm, i] = b.dataset.delrow.split('.'); m.teams[tm].players.splice(+i, 1); touch(m); render(); });
    document.getElementById('backBtn').onclick = () => go('home');
    f.onsubmit = e => {
      e.preventDefault();
      read();
      const err = validateSetup(m);
      document.getElementById('setupErr').textContent = err || '';
      if (err) return;
      // righe vuote in fondo: tolte
      ['A', 'B'].forEach(tm => { m.teams[tm].players = m.teams[tm].players.filter(p => p.no !== '' || p.name); });
      m.setupDone = true;
      touch(m);
      go(viewFor(m));
    };
  }

  function validateSetup(m) {
    const S = R.settingsOf(m);
    if (S.mode !== 'fixed' && S.sets % 2 === 0) return 'Con "Al meglio di…" il numero di set deve essere dispari (1, 3, 5).';
    for (const tm of ['A', 'B']) {
      const r = roster(m, tm);
      const nos = r.map(p => +p.no);
      if (new Set(nos).size !== nos.length) return `${teamName(m, tm)}: due giocatori con lo stesso numero.`;
      if (m.teams[tm].players.some(p => p.name && (p.no === '' || p.no == null))) return `${teamName(m, tm)}: manca il numero di maglia di un giocatore.`;
      if (r.filter(p => !p.libero).length < 6) return `${teamName(m, tm)}: servono almeno 6 giocatori (liberi esclusi).`;
      if (r.filter(p => p.libero).length > 2) return `${teamName(m, tm)}: al massimo 2 liberi.`;
      const mw = R.minWomenOf(S, tm);
      if (mw && r.filter(p => p.gender === 'F').length < mw) return `${teamName(m, tm)}: servono almeno ${mw} donne a referto, libero compreso (indica D/U per ogni giocatore).`;
    }
    if (!m.teams.A.name || !m.teams.B.name) return 'Inserisci il nome delle due squadre.';
    return null;
  }

  // ---------- sorteggio e formazioni ----------
  // Ogni squadra su due righe da 3, vista da dietro la propria linea di fondo (rete in alto):
  // in alto 4 3 2, in basso 5 6 1 (posti in senso antiorario, 1 in basso a destra = al servizio).
  const GRID = [3, 2, 1, 4, 5, 0];

  function renderLineup(m) {
    const st = stateOf(m);
    if (st.phase === 'play' || st.phase === 'matchEnd') { go(viewFor(m)); return; }
    const d = R.nextSetDefaults(m, st);
    if (!ui.lineup || ui.lineup.index !== d.index) {
      ui.lineup = {
        index: d.index, needsToss: d.needsToss, winner: null, choice: null, otherChoice: null,
        serving: d.serving, left: d.left,
        lineup: { A: d.lineup.A.length === 6 ? d.lineup.A.slice() : ['', '', '', '', '', ''], B: d.lineup.B.length === 6 ? d.lineup.B.slice() : ['', '', '', '', '', ''] }
      };
    }
    const L = ui.lineup;
    if (L.needsToss) L.serving = R.servingFromChoice(L.winner, L.choice, L.otherChoice);
    const left = L.left || 'A', right = other(left);
    const opt = (key, val, label, on, cls) => `<button type="button" class="opt ${cls || ''} ${on ? 'on' : ''}" data-k="${key}" data-v="${val}">${label}</button>`;
    const teamOpts = key => ['A', 'B'].map(tm => opt(key, tm, esc(teamName(m, tm)), L[key] === tm, `team-${tm}`)).join('');

    const pos = (tm, p) => {
      const cand = playable(m, tm).filter(n => !st.barredMatch[tm][n]);
      const v = L.lineup[tm][p];
      const dup = v !== '' && L.lineup[tm].filter(x => x === v).length > 1;
      return `<label class="pos-cell ${dup ? 'dup' : ''} ${v !== '' && isWoman(m, tm, v) ? 'woman' : ''}"><span class="roman">${POS[p]}</span>
        <select data-pos="${tm}.${p}"><option value=""></option>${cand.map(n => `<option value="${n}" ${+v === n && v !== '' ? 'selected' : ''}>${esc(pLabel(m, tm, n))}</option>`).join('')}</select></label>`;
    };
    const court = (tm, side) => `<div class="lineup-court team-${tm}">
      <h3><span class="dot team-${tm}"></span> ${esc(teamName(m, tm))}${L.serving === tm ? ' · <span class="badge serve">al servizio</span>' : ''}</h3>
      <div class="net-label">rete</div><div class="court-grid">${GRID.map(p => pos(tm, p)).join('')}</div>
      <p class="muted small">P1 = al servizio</p></div>`;

    const ready = L.serving && L.left && ['A', 'B'].every(tm => L.lineup[tm].every(x => x !== '') && new Set(L.lineup[tm]).size === 6);
    $app.innerHTML = `
      <section class="card"><h1>Set ${d.index + 1}</h1>
        ${L.needsToss ? `
          <div class="q"><h3>Chi ha vinto il sorteggio?</h3><div class="opts">${teamOpts('winner')}</div></div>
          ${L.winner ? `<div class="q"><h3>${esc(teamName(m, L.winner))} sceglie</h3><div class="opts">
            ${opt('choice', 'serve', 'Servizio', L.choice === 'serve')}${opt('choice', 'receive', 'Ricezione', L.choice === 'receive')}${opt('choice', 'side', 'Campo', L.choice === 'side')}</div></div>` : ''}
          ${L.choice === 'side' ? `<div class="q"><h3>${esc(teamName(m, other(L.winner)))} sceglie</h3><div class="opts">
            ${opt('otherChoice', 'serve', 'Servizio', L.otherChoice === 'serve')}${opt('otherChoice', 'receive', 'Ricezione', L.otherChoice === 'receive')}</div></div>` : ''}
          <div class="q"><h3>Squadra alla sinistra del segnapunti</h3><div class="opts">${teamOpts('left')}</div></div>
        ` : `
          <p class="muted">Cambio di campo; serve per prima la squadra che ha ricevuto per prima nel set precedente. Puoi correggere se serve.</p>
          <div class="q"><h3>Al servizio</h3><div class="opts">${teamOpts('serving')}</div></div>
          <div class="q"><h3>A sinistra del segnapunti</h3><div class="opts">${teamOpts('left')}</div></div>`}
      </section>
      <section class="card"><h2>Formazioni (posto 1 → 6)</h2>
        <p class="muted small">Scegli il giocatore di ogni posizione come sul tagliando della formazione. I liberi non entrano nella formazione.</p>
        <div class="lineups">${court(left, 'left')}${court(right, 'right')}</div>
      </section>
      <p class="error" id="luErr"></p>
      <div class="row end sticky-actions">
        <button class="btn ghost" id="editBtn">Dati gara</button>
        ${m.events.length ? '<button class="btn ghost" id="undoBtn">↶ Annulla ultimo evento</button>' : ''}
        <button class="btn primary big" id="goBtn" ${ready ? '' : 'disabled'}>▶ Inizia set ${d.index + 1}</button>
      </div>`;

    $app.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
      L[b.dataset.k] = b.dataset.v;
      if (b.dataset.k === 'winner') { L.choice = null; L.otherChoice = null; }
      if (b.dataset.k === 'choice' && b.dataset.v !== 'side') L.otherChoice = null;
      render();
    });
    $app.querySelectorAll('[data-pos]').forEach(s => s.onchange = () => {
      const [tm, p] = s.dataset.pos.split('.');
      L.lineup[tm][+p] = s.value === '' ? '' : +s.value;
      render();
    });
    document.getElementById('editBtn').onclick = () => go('setup');
    const ub = document.getElementById('undoBtn');
    if (ub) ub.onclick = () => undoLast(m);
    document.getElementById('goBtn').onclick = () => {
      const S = R.settingsOf(m);
      // il libero donna può essere una delle donne: entra in seconda linea prima del primo servizio
      const short = ['A', 'B'].filter(tm => R.minWomenOf(S, tm) && womenIn(m, tm, L.lineup[tm]) + (liberi(m, tm).some(n => isWoman(m, tm, n) && !stateOf(m).barredMatch[tm][n]) ? 1 : 0) < R.minWomenOf(S, tm));
      const start = () => {
        const toss = L.needsToss ? { winner: L.winner, choice: L.choice, otherChoice: L.otherChoice } : null;
        addEvent(m, { type: 'setStart', serving: L.serving, left: L.left, lineup: { A: L.lineup.A.slice(), B: L.lineup.B.slice() }, toss });
      };
      if (short.length) confirmBox('Donne in campo', `${short.map(tm => `${esc(teamName(m, tm))} (minimo ${R.minWomenOf(S, tm)})`).join(' e ')}: meno donne del minimo in formazione. Iniziare comunque?`, 'Inizia', start);
      else start();
    };
  }

  // ---------- gara in corso ----------
  function renderLive(m) {
    const st = stateOf(m);
    const set = st.cur;
    if (!set || st.phase !== 'play') { go(viewFor(m)); return; }
    const S = st.settings;
    const L = set.left, Rt = other(L);

    const court = (tm, side) => {
      const c = R.visibleCourt(set, tm);
      const lib = set.libero[tm];
      const serving = set.serving === tm;
      return `<div class="net-label">rete</div><div class="court-grid live team-${tm} ${serving ? 'serving' : ''}">${GRID.map(p => {
        const no = c[p];
        const srv = serving && p === 0;
        const isLib = lib && lib.no === no;
        return `<button class="pos-live ${srv ? 'srv' : ''} ${isLib ? 'libero' : ''} ${isWoman(m, tm, no) ? 'woman' : ''}" data-${isLib ? 'libero' : 'player'}="${tm}.${no}" title="${esc(pLabel(m, tm, no))}">
          <span class="roman">${POS[p]}</span><span class="pno">${no}</span>${srv ? '<span class="ball">🏐</span>' : ''}${isLib ? `<span class="lib-tag">L · ${set.occ[tm][lib.col]}</span>` : `<span class="pname">${esc((player(m, tm, no) || {}).name || '')}</span>`}</button>`;
      }).join('')}</div>`;
    };
    const panel = (tm, side) => {
      const to = set.timeouts[tm].length;
      const lead = set.score[tm] - set.score[other(tm)];
      const setPoint = (set.score[tm] + 1 >= set.target && lead >= 1) || (S.cap && set.score[tm] + 1 >= S.cap && lead >= 0);
      return `<section class="team-panel team-${tm} ${set.serving === tm ? 'serving' : ''}">
        <div class="tp-head"><span class="tp-name">${esc(teamName(m, tm))}</span><span class="tp-sets" title="Set vinti">${st.setsWon[tm]}</span></div>
        ${court(tm, side)}
        <button class="score-btn" data-point="${tm}" aria-label="Punto a ${esc(teamName(m, tm))}"><span class="score">${set.score[tm]}</span><span class="plus">+1 punto</span></button>
        <div class="tp-foot">
          <button class="btn small" data-to="${tm}" ${to >= S.timeoutsPerSet ? 'disabled' : ''}>Time-out ${to}/${S.timeoutsPerSet}</button>
          <button class="btn small" data-sub="${tm}">Cambio ${set.regSubs[tm]}/${S.subsPerSet}</button>
          ${liberi(m, tm).length ? `<button class="btn small ${set.libero[tm] ? 'lib-on' : ''}" data-lib="${tm}">Libero${set.libero[tm] ? ' ' + set.libero[tm].no : ''}</button>` : ''}
          ${setPoint ? '<span class="badge warn">Set point</span>' : ''}
          ${R.minWomenOf(S, tm) && womenIn(m, tm, R.visibleCourt(set, tm)) < R.minWomenOf(S, tm) ? `<span class="badge women">⚠ ${womenIn(m, tm, R.visibleCourt(set, tm))} donne in campo</span>` : ''}
        </div>
      </section>`;
    };

    // set già giocati, con i punti nello stesso ordine delle squadre in campo (sinistra – destra)
    const prev = st.sets.filter(x => x.index < set.index && x.winner);
    const recent = set.rallies.slice(-8).reverse();
    const nextSw = set.midSwitch && !set.switched ? ` · cambio campo a ${set.midSwitch}` : '';
    $app.innerHTML = `
      <div class="live">
        <div class="scorebar">
          <div><b>Set ${set.index + 1}</b> <span class="muted">a ${set.target}${S.cap ? ` (max ${S.cap})` : ''}</span></div>
          <div class="sets-won">Set <b>${st.setsWon[L]}</b> – <b>${st.setsWon[Rt]}</b></div>
          ${prev.length ? `<div class="sets-prev" aria-label="Set precedenti">${prev.map(p => `<span class="sp"><span class="muted">${p.index + 1}°</span> <span class="${p.winner === L ? 'w' : ''}">${p.score[L]}</span>–<span class="${p.winner === Rt ? 'w' : ''}">${p.score[Rt]}</span></span>`).join('')}</div>` : ''}
          <div class="muted small">inizio ${hhmm(set.startTime)}${nextSw}</div>
        </div>
        <div class="court">${panel(L, 'left')}${panel(Rt, 'right')}</div>
        <div class="toolbar">
          <button class="btn" id="undoBtn" ${m.events.length ? '' : 'disabled'}>↶ Annulla</button>
          <button class="btn" id="sanBtn">Sanzione</button>
          <button class="btn" id="moreBtn">Altro…</button>
        </div>
        <div class="log card">
          <h3>Ultime azioni</h3>
          ${recent.length ? `<ol>${recent.map(r => `<li><span class="lg-score">${r.score[L]}–${r.score[Rt]}</span> <span class="dot team-${r.winner}"></span> ${esc(teamName(m, r.winner))}${r.by === 'penalty' ? ' <span class="badge warn">penalità</span>' : ''}${r.sideOut ? ' <span class="muted small">cambio palla</span>' : ''}</li>`).join('')}</ol>` : '<p class="muted small">Tocca “+1 punto” sotto la squadra che vince l\'azione. Tocca un giocatore per sostituirlo.</p>'}
          ${eventsLine(m, set)}
        </div>
      </div>`;

    $app.querySelectorAll('[data-point]').forEach(b => b.onclick = () => {
      const now = Date.now();
      if (now - lastTap < 350) return; // evita i doppi tocchi involontari
      lastTap = now;
      addEvent(m, { type: 'point', team: b.dataset.point });
    });
    $app.querySelectorAll('[data-to]').forEach(b => b.onclick = () => {
      const tm = b.dataset.to;
      confirmBox('Time-out', `Time-out per <b>${esc(teamName(m, tm))}</b>?`, 'Conferma', () => addEvent(m, { type: 'timeout', team: tm }));
    });
    $app.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => subDialog(m, b.dataset.sub));
    $app.querySelectorAll('[data-player]').forEach(b => b.onclick = () => { const [tm, no] = b.dataset.player.split('.'); subDialog(m, tm, +no); });
    $app.querySelectorAll('[data-lib]').forEach(b => b.onclick = () => liberoDialog(m, b.dataset.lib));
    $app.querySelectorAll('[data-libero]').forEach(b => b.onclick = () => liberoDialog(m, b.dataset.libero.split('.')[0]));
    document.getElementById('undoBtn').onclick = () => undoLast(m);
    document.getElementById('sanBtn').onclick = () => sanctionDialog(m);
    document.getElementById('moreBtn').onclick = () => moreDialog(m);
  }

  function eventsLine(m, set) {
    const items = [];
    ['A', 'B'].forEach(tm => {
      set.timeouts[tm].forEach(x => items.push(`T-O ${esc(teamName(m, tm))} ${x.score[tm]}:${x.score[other(tm)]}`));
      set.subs[tm].forEach(x => items.push(`${esc(teamName(m, tm))} ${x.out}→${x.in}${x.exceptional ? ' (ecc.)' : ''} ${x.score[tm]}:${x.score[other(tm)]}`));
      set.liberoLog[tm].forEach(x => items.push(`L ${esc(teamName(m, tm))} ${x.type === 'out' ? `${x.no} esce (rientra ${x.back})` : `${x.no} per ${x.out}`} ${x.score[tm]}:${x.score[other(tm)]}`));
    });
    set.sanctions.forEach(s => items.push(`${SAN[s.kind][1]} ${esc(teamName(m, s.team))} ${s.player === 'C' ? 'all.' : s.player === 'T' ? '' : s.player}`));
    return items.length ? `<p class="muted small">${items.join(' · ')}</p>` : '';
  }

  function addEvent(m, e) {
    if (m.closedAt) return;
    e.time = new Date().toISOString();
    m.events.push(e);
    const st = stateOf(m);
    if (st.rejected.includes(m.events.length - 1)) {
      m.events.pop();
      toast('Operazione non consentita dalle regole');
      return;
    }
    touch(m);
    if (navigator.vibrate) navigator.vibrate(25);
    if (e.type === 'setStart') ui.lineup = null;
    go(viewFor(m));
    handleAlerts(m, st);
  }

  function handleAlerts(m, st) {
    const a = st.alerts;
    const has = type => a.find(x => x.type === type);
    const steps = [];
    if (has('timeout')) {
      const tm = has('timeout').team;
      steps.push(next => countdown('Time-out', esc(teamName(m, tm)), 30, `team-${tm}`, next));
    }
    a.filter(x => x.type === 'liberoOut' && x.reason !== 'manual').forEach(x => {
      const S = st.settings, set = st.cur;
      const mw = R.minWomenOf(S, x.team);
      const w = set && mw ? womenIn(m, x.team, R.visibleCourt(set, x.team)) : null;
      toast(`${teamName(m, x.team)}: il libero ${x.libero} esce, rientra il n. ${x.back}${w != null && w < mw ? ` · ⚠ ${w} donne in campo` : ''}`);
    });
    if (has('mustSub')) {
      const x = has('mustSub');
      steps.push(() => { subDialog(m, x.team, x.player, true); });
    }
    if (has('switch')) {
      const s = has('switch').score;
      steps.push(next => {
        openOverlay(`<div class="big-alert switch"><h2>Cambio di campo</h2><p class="huge">${s.A} – ${s.B}</p><p>Le squadre cambiano campo senza ritardo: sullo schermo i lati sono già invertiti.</p><button class="btn primary wide" data-x>OK</button></div>`, { cls: 'alert' });
        closeOverlay.queue = next;
        $overlay.querySelector('[data-x]').onclick = closeOverlay;
      });
    }
    const se = has('setEnd');
    if (se) {
      const set = st.sets[se.set];
      const me = has('matchEnd');
      steps.push(() => {
        const res = me ? (st.winner ? `Vince <b>${esc(teamName(m, st.winner))}</b> ${st.setsWon[st.winner]}–${st.setsWon[other(st.winner)]}` : `Pareggio ${st.setsWon.A}–${st.setsWon.B}`) : `Set a <b>${esc(teamName(m, se.winner))}</b>`;
        openOverlay(`<div class="big-alert team-${se.winner}"><h2>${me ? 'Fine gara' : `Fine set ${se.set + 1}`}</h2>
          <p class="huge">${set.score.A} – ${set.score.B}</p><p>${res}</p>
          <div class="row center"><button class="btn ghost" data-undo>↶ Annulla l'ultimo punto</button><button class="btn primary" data-ok>Conferma</button></div></div>`, { cls: 'alert', dismiss: false });
        $overlay.querySelector('[data-undo]').onclick = () => { closeOverlay(); undoLast(m, true); };
        $overlay.querySelector('[data-ok]').onclick = () => { closeOverlay(); go(me ? 'end' : 'lineup'); };
      });
    }
    const run = i => { if (i < steps.length) steps[i](() => run(i + 1)); };
    run(0);
  }

  const EV = { setStart: 'inizio set', point: 'punto', timeout: 'time-out', sub: 'sostituzione', sanction: 'sanzione', incomplete: 'squadra incompleta', forfeit: 'rinuncia', liberoIn: 'ingresso del libero', liberoOut: 'uscita del libero' };
  function undoLast(m, silent) {
    if (m.closedAt || !m.events.length) return;
    const e = m.events.pop();
    touch(m);
    ui.lineup = null;
    if (!silent) toast(`Annullato: ${EV[e.type] || e.type}${e.team ? ' ' + teamName(m, e.team) : ''}`);
    go(viewFor(m));
  }

  // Sostituzione: chi esce (in campo) → chi entra (solo i giocatori ammessi dalle regole)
  function subDialog(m, tm, out, forced) {
    const st = stateOf(m);
    const set = st.cur;
    if (!set || st.phase !== 'play') return;
    const S = st.settings;
    const sel = { out: out != null ? out : null, inn: null, exc: false };
    const draw = () => {
      const lib = set.libero[tm];
      const c = R.visibleCourt(set, tm).filter(n => !(lib && lib.no === n));   // il libero non si sostituisce
      const o = sel.out != null ? R.subOptions(st, tm, sel.out, playable(m, tm)) : null;
      const list = o ? (sel.exc ? o.exceptional : o.regular) : [];
      const why = o && !sel.exc && !o.regular.length
        ? (set.regSubs[tm] >= S.subsPerSet ? `Sostituzioni regolari esaurite (${S.subsPerSet}).` : o.rule && o.rule.only != null ? `Può rientrare solo il n. ${o.rule.only}, che non è disponibile.` : 'Questo giocatore non può più uscire con una sostituzione regolare in questo set.')
        : '';
      openOverlay(`<h2>Sostituzione · ${esc(teamName(m, tm))}</h2>
        ${forced ? '<p class="warn-box">Il giocatore sanzionato deve lasciare il campo: sostituiscilo (regolare se possibile, altrimenti eccezionale). Se nessuno può entrare la squadra è incompleta (Altro…).</p>' : ''}
        <div class="q"><h3>Esce</h3><div class="opts">${c.map(n => `<button class="opt team-${tm} ${sel.out === n ? 'on' : ''}" data-out="${n}">${esc(pLabel(m, tm, n))}</button>`).join('')}</div></div>
        ${o ? `<div class="q"><h3>Entra</h3>
          <div class="opts">${list.map(n => `<button class="opt ${sel.inn === n ? 'on' : ''} ${isWoman(m, tm, n) ? 'woman' : ''}" data-in="${n}">${esc(pLabel(m, tm, n))}</button>`).join('') || `<span class="muted small">${why || 'Nessun giocatore disponibile.'}</span>`}</div>
          <label class="check"><input type="checkbox" id="excChk" ${sel.exc ? 'checked' : ''}> Sostituzione eccezionale (infortunio, espulsione, squalifica): non conta, e chi esce non può più rientrare nella gara</label></div>` : ''}
        <p class="muted small">Sostituzioni regolari: ${set.regSubs[tm]}/${S.subsPerSet}</p>
        <div class="row end"><button class="btn ghost" data-x>Annulla</button><button class="btn primary" data-ok ${sel.out != null && sel.inn != null ? '' : 'disabled'}>Registra</button></div>`, { dismiss: !forced });
      $overlay.querySelectorAll('[data-out]').forEach(b => b.onclick = () => { sel.out = +b.dataset.out; sel.inn = null; draw(); });
      $overlay.querySelectorAll('[data-in]').forEach(b => b.onclick = () => { sel.inn = +b.dataset.in; draw(); });
      const chk = document.getElementById('excChk');
      if (chk) chk.onchange = () => { sel.exc = chk.checked; sel.inn = null; draw(); };
      $overlay.querySelector('[data-x]').onclick = closeOverlay;
      $overlay.querySelector('[data-ok]').onclick = () => {
        const ev = { type: 'sub', team: tm, out: sel.out, in: sel.inn, exceptional: sel.exc };
        const after = R.visibleCourt(set, tm).map(n => (n === sel.out ? sel.inn : n));
        const women = womenIn(m, tm, after);
        if (R.minWomenOf(S, tm) && women < R.minWomenOf(S, tm)) {
          closeOverlay();
          confirmBox('Donne in campo', `Dopo il cambio ${esc(teamName(m, tm))} avrebbe ${women} donne in campo (minimo ${R.minWomenOf(S, tm)}). Registrare comunque?`, 'Registra', () => addEvent(m, ev));
        } else { closeOverlay(); addEvent(m, ev); }
      };
    };
    draw();
  }

  // Libero: entra al posto di un giocatore di seconda linea (non al servizio), esce, o cambio tra i due liberi
  function liberoDialog(m, tm) {
    const st = stateOf(m);
    const set = st.cur;
    if (!set || st.phase !== 'play') return;
    const S = st.settings;
    const lib = set.libero[tm];
    const avail = liberi(m, tm).filter(n => !st.barredMatch[tm][n] && !set.barred[tm][n] && !(lib && lib.no === n));
    const sel = { libero: avail.length === 1 && !lib ? avail[0] : null, out: null };
    const court = R.courtOf(set, tm);
    const eligible = R.BACK_ROW.filter(p => !(p === 0 && set.serving === tm)).map(p => court[p]);
    const womenAfter = nos => womenIn(m, tm, nos);
    const warnThen = (nos, ev) => {
      const w = womenAfter(nos);
      closeOverlay();
      if (R.minWomenOf(S, tm) && w < R.minWomenOf(S, tm)) confirmBox('Donne in campo', `Dopo il cambio ${esc(teamName(m, tm))} avrebbe ${w} donne in campo (minimo ${R.minWomenOf(S, tm)}). Registrare comunque?`, 'Registra', () => addEvent(m, ev));
      else addEvent(m, ev);
    };
    const draw = () => {
      if (lib) {
        const back = set.occ[tm][lib.col];
        openOverlay(`<h2>Libero · ${esc(teamName(m, tm))}</h2>
          <p>In campo il libero <b>${esc(pLabel(m, tm, lib.no))}</b> al posto di ${esc(pLabel(m, tm, back))}.</p>
          <div class="opts col">
            <button class="opt" data-out>Esce il libero, rientra ${esc(pLabel(m, tm, back))}</button>
            ${avail.map(n => `<button class="opt ${isWoman(m, tm, n) ? 'woman' : ''}" data-swap="${n}">Cambio con l'altro libero: ${esc(pLabel(m, tm, n))}</button>`).join('')}
          </div>
          <div class="row end"><button class="btn ghost" data-x>Annulla</button></div>`);
        $overlay.querySelector('[data-out]').onclick = () => warnThen(R.courtOf(set, tm), { type: 'liberoOut', team: tm });
        $overlay.querySelectorAll('[data-swap]').forEach(b => b.onclick = () => {
          const n = +b.dataset.swap;
          warnThen(R.visibleCourt(set, tm).map(x => (x === lib.no ? n : x)), { type: 'liberoIn', team: tm, libero: n, out: lib.no });
        });
      } else {
        openOverlay(`<h2>Ingresso del libero · ${esc(teamName(m, tm))}</h2>
          ${avail.length ? `<div class="q"><h3>Libero</h3><div class="opts">${avail.map(n => `<button class="opt ${sel.libero === n ? 'on' : ''} ${isWoman(m, tm, n) ? 'woman' : ''}" data-l="${n}">${esc(pLabel(m, tm, n))}</button>`).join('')}</div></div>
          <div class="q"><h3>Al posto di (seconda linea${set.serving === tm ? ', non chi serve' : ''})</h3><div class="opts">${eligible.map(n => `<button class="opt team-${tm} ${sel.out === n ? 'on' : ''} ${isWoman(m, tm, n) ? 'woman' : ''}" data-o="${n}">${POS[court.indexOf(n)]} · ${esc(pLabel(m, tm, n))}</button>`).join('')}</div></div>
          <p class="muted small">Il libero non conta come sostituzione e esce da solo quando ruota in prima linea.</p>` : '<p class="muted">Nessun libero disponibile.</p>'}
          <div class="row end"><button class="btn ghost" data-x>Annulla</button><button class="btn primary" data-ok ${sel.libero != null && sel.out != null ? '' : 'disabled'}>Registra</button></div>`);
        $overlay.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { sel.libero = +b.dataset.l; draw(); });
        $overlay.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { sel.out = +b.dataset.o; draw(); });
        $overlay.querySelector('[data-ok]').onclick = () => warnThen(court.map(x => (x === sel.out ? sel.libero : x)), { type: 'liberoIn', team: tm, libero: sel.libero, out: sel.out });
      }
      $overlay.querySelector('[data-x]').onclick = closeOverlay;
    };
    draw();
  }

  function sanctionDialog(m) {
    const sel = { team: null, player: null, kind: null };
    const draw = () => {
      openOverlay(`<h2>Sanzione</h2>
        <div class="q"><h3>Squadra</h3><div class="opts">${['A', 'B'].map(tm => `<button class="opt team-${tm} ${sel.team === tm ? 'on' : ''}" data-team="${tm}">${esc(teamName(m, tm))}</button>`).join('')}</div></div>
        ${sel.team ? `<div class="q"><h3>A chi</h3><div class="opts">${roster(m, sel.team).map(p => `<button class="opt ${sel.player === +p.no ? 'on' : ''}" data-player="${p.no}">${esc(pLabel(m, sel.team, p.no))}${p.libero ? ' (L)' : ''}</button>`).join('')}
          <button class="opt ${sel.player === 'C' ? 'on' : ''}" data-player="C">Allenatore</button>
          <button class="opt ${sel.player === 'T' ? 'on' : ''}" data-player="T">Squadra</button></div></div>` : ''}
        <div class="q"><h3>Tipo</h3><div class="opts col">${Object.keys(R.SANCTIONS).map(k => `<button class="opt ${sel.kind === k ? 'on' : ''}" data-kind="${k}">${SAN[k][0]}${R.SANCTIONS[k].point ? ' <small>· punto e servizio agli avversari</small>' : ''}</button>`).join('')}</div></div>
        <div class="row end"><button class="btn ghost" data-x>Annulla</button><button class="btn primary" data-ok ${sel.team && sel.player !== null && sel.kind ? '' : 'disabled'}>Registra</button></div>`);
      $overlay.querySelectorAll('[data-team]').forEach(b => b.onclick = () => { sel.team = b.dataset.team; sel.player = null; draw(); });
      $overlay.querySelectorAll('[data-player]').forEach(b => b.onclick = () => { const v = b.dataset.player; sel.player = /^\d+$/.test(v) ? +v : v; draw(); });
      $overlay.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { sel.kind = b.dataset.kind; draw(); });
      $overlay.querySelector('[data-x]').onclick = closeOverlay;
      $overlay.querySelector('[data-ok]').onclick = () => { closeOverlay(); addEvent(m, { type: 'sanction', team: sel.team, player: sel.player, kind: sel.kind }); };
    };
    draw();
  }

  function moreDialog(m) {
    openOverlay(`<h2>Altro</h2>
      <div class="opts col">
        <button class="opt" data-a="incomplete">Squadra incompleta (perde il set)</button>
        <button class="opt" data-a="forfeit">Rinuncia / ritiro (perde la gara)</button>
        <button class="opt" data-a="setup">Dati gara e squadre</button>
        <button class="opt" data-a="pdf">Scarica il PDF del referto fin qui (bozza)</button>
        <button class="opt" data-a="print">Stampa il referto fin qui</button>
      </div>
      <div class="row end"><button class="btn ghost" data-x>Chiudi</button></div>`);
    $overlay.querySelector('[data-x]').onclick = closeOverlay;
    $overlay.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'setup') { closeOverlay(); go('setup'); return; }
      if (a === 'print') { closeOverlay(); printSheet(m); return; }
      if (a === 'pdf') { closeOverlay(); downloadPdf(m); return; }
      openOverlay(`<h2>${a === 'incomplete' ? 'Squadra incompleta' : 'Rinuncia / ritiro'}</h2><p>Quale squadra?</p>
        <div class="opts">${['A', 'B'].map(tm => `<button class="opt team-${tm}" data-t="${tm}">${esc(teamName(m, tm))}</button>`).join('')}</div>
        <div class="row end"><button class="btn ghost" data-x>Annulla</button></div>`);
      $overlay.querySelector('[data-x]').onclick = closeOverlay;
      $overlay.querySelectorAll('[data-t]').forEach(x => x.onclick = () => {
        const tm = x.dataset.t;
        confirmBox('Confermi?', a === 'incomplete' ? `${esc(teamName(m, tm))} perde il set: agli avversari i punti mancanti.` : `${esc(teamName(m, tm))} perde la gara: agli avversari i set mancanti.`, 'Conferma',
          () => addEvent(m, a === 'incomplete' ? { type: 'incomplete', team: tm } : { type: 'forfeit', team: tm, reason: 'RIT' }), true);
      });
    });
  }

  // ---------- fine gara ----------
  function renderEnd(m) {
    const st = stateOf(m);
    const res = st.winner ? `Vince <b>${esc(teamName(m, st.winner))}</b> ${st.setsWon[st.winner]}–${st.setsWon[other(st.winner)]}` : `Pareggio ${st.setsWon.A}–${st.setsWon.B}`;
    $app.innerHTML = `
      <section class="card"><h1>Fine gara</h1>
        <p class="result">${res}${st.forfeit ? ` <span class="badge warn">${esc(teamName(m, st.forfeit.team))} rinuncia</span>` : ''}</p>
        <table class="sum"><thead><tr><th>Set</th><th>${esc(teamName(m, 'A'))}</th><th>${esc(teamName(m, 'B'))}</th><th>Durata</th></tr></thead>
        <tbody>${st.sets.map(s => `<tr><td>${s.index + 1}</td><td class="${s.winner === 'A' ? 'won' : ''}">${s.score.A}</td><td class="${s.winner === 'B' ? 'won' : ''}">${s.score.B}</td><td>${mins(s.startTime, s.endTime) != null ? mins(s.startTime, s.endTime) + '′' : '—'}</td></tr>`).join('')}</tbody></table>
        <p class="muted small">Inizio ${hhmm(st.startTime)} · fine ${hhmm(st.endTime)} · durata ${mins(st.startTime, st.endTime) != null ? mins(st.startTime, st.endTime) + '′' : '—'}</p>
      </section>
      <section class="card"><h2>Osservazioni</h2>
        <textarea id="remarks" rows="4" ${m.closedAt ? 'readonly' : ''} placeholder="Reclami, infortuni, note dell'arbitro…">${esc(m.remarks)}</textarea>
      </section>
      <div class="row end sticky-actions">
        ${m.closedAt ? '' : '<button class="btn ghost" id="undoBtn">↶ Annulla ultimo evento</button>'}
        <button class="btn" id="pdfBtn">📄 Scarica PDF</button>
        <button class="btn" id="printBtn">🖨 Stampa</button>
        ${m.closedAt ? `<span class="badge done">Chiusa alle ${hhmm(m.closedAt)}</span>` : '<button class="btn primary big" id="closeBtn">✔ Chiudi gara</button>'}
      </div>`;
    const ta = document.getElementById('remarks');
    ta.oninput = () => { m.remarks = ta.value; touch(m); };
    const ub = document.getElementById('undoBtn');
    if (ub) ub.onclick = () => undoLast(m);
    document.getElementById('printBtn').onclick = () => printSheet(m);
    document.getElementById('pdfBtn').onclick = () => downloadPdf(m);
    const cb = document.getElementById('closeBtn');
    if (cb) cb.onclick = () => confirmBox('Chiudere la gara?', 'Il referto viene bloccato e il risultato inviato. Dopo la chiusura non si può più modificare.', 'Chiudi gara', () => {
      m.closedAt = new Date().toISOString(); touch(m); render(); toast('Gara chiusa');
      if (m.link) { Cloud.archivePdf(m); Cloud.sendResult(m); }
    });
  }

  // ---------- PDF del referto ----------
  function makePdf(m) {
    return window.ScoresheetPDF.generate(m, stateOf(m), { draft: !m.closedAt, teamName: tm => teamName(m, tm) });
  }
  function downloadPdf(m) {
    toast('Preparazione del PDF…');
    makePdf(m).then(f => download(f.blob, f.name)).catch(err => { console.warn(err); toast('PDF non disponibile: usa Stampa'); });
  }

  // ---------- referto stampabile ----------
  function printSheet(m) {
    const st = stateOf(m);
    const H = m.header;
    const rosterTable = tm => `<table class="p-roster"><thead><tr><th colspan="4" class="team-${tm}-h">${tm} · ${esc(teamName(m, tm))}</th></tr><tr><th>N.</th><th>Nome</th><th>D/U</th><th></th></tr></thead><tbody>
      ${roster(m, tm).sort((a, b) => a.no - b.no).map(p => `<tr><td>${p.no}</td><td>${esc(p.name)}</td><td>${p.gender === 'F' ? 'D' : p.gender === 'M' ? 'U' : ''}</td><td>${p.libero ? 'L' : ''}${p.captain ? ' K' : ''}</td></tr>`).join('')}
      <tr><td colspan="4">Allenatore: ${esc(m.teams[tm].coach)}</td></tr></tbody></table>`;
    const setBlock = s => {
      if (!s.lineup) return `<div class="p-set"><h3>Set ${s.index + 1} — non giocato, assegnato ${s.score.A}–${s.score.B}</h3></div>`;
      const team = tm => {
        const turnsByCol = [0, 1, 2, 3, 4, 5].map(c => s.turns.filter(t => t.team === tm && t.col === c && t.end != null).map(t => t.end));
        return `<tr><th class="team-${tm}-h">${esc(teamName(m, tm))}${s.firstServing === tm ? ' (S)' : ' (R)'}</th>
          ${[0, 1, 2, 3, 4, 5].map(c => `<td><b>${s.lineup[tm][c]}</b>${s.subs[tm].filter(x => x.col === c).map(x => `<div class="p-sub">${x.out}→${x.in} ${x.score[tm]}:${x.score[other(tm)]}${x.exceptional ? ' ecc.' : ''}</div>`).join('')}<div class="p-turns">${turnsByCol[c].join(' ')}</div></td>`).join('')}
          <td>${s.timeouts[tm].map(x => `${x.score[tm]}:${x.score[other(tm)]}`).join('<br>') || '—'}</td><td class="p-pts">${s.score[tm]}</td></tr>`;
      };
      return `<div class="p-set"><h3>Set ${s.index + 1} · ${hhmm(s.startTime)}–${hhmm(s.endTime)} (${mins(s.startTime, s.endTime) ?? '—'}′) · vince ${s.winner ? esc(teamName(m, s.winner)) : '—'}${s.switchScore ? ` · cambio campo ${s.switchScore.A}:${s.switchScore.B}` : ''}${s.awarded ? ' · assegnato' : ''}</h3>
        <table class="p-grid"><thead><tr><th></th>${POS.map(r => `<th>${r}</th>`).join('')}<th>T-O</th><th>Punti</th></tr></thead><tbody>${team('A')}${team('B')}</tbody></table>
        ${['A', 'B'].filter(tm => s.liberoLog[tm].length).map(tm => `<p class="p-note">Libero ${esc(teamName(m, tm))}: ${s.liberoLog[tm].map(x => `${x.type === 'out' ? `${x.no} esce (rientra ${x.back})` : `${x.no} per ${x.out}`} ${x.score[tm]}:${x.score[other(tm)]}`).join(' · ')}</p>`).join('')}</div>`;
    };
    const sanctions = st.sanctions.length ? `<h3>Sanzioni</h3><table class="p-san"><thead><tr><th>Tipo</th><th>Squadra</th><th>A chi</th><th>Set</th><th>Punteggio</th></tr></thead><tbody>
      ${st.sanctions.map(x => `<tr><td>${SAN[x.kind][0]}</td><td>${esc(teamName(m, x.team))}</td><td>${x.player === 'C' ? 'Allenatore' : x.player === 'T' ? 'Squadra' : esc(pLabel(m, x.team, x.player))}</td><td>${x.set + 1}</td><td>${x.score[x.team]}:${x.score[other(x.team)]}</td></tr>`).join('')}</tbody></table>` : '';
    const res = st.phase === 'matchEnd' ? (st.winner ? `Vince ${esc(teamName(m, st.winner))} ${st.setsWon[st.winner]}–${st.setsWon[other(st.winner)]}` : `Pareggio ${st.setsWon.A}–${st.setsWon.B}`) : `In corso: ${st.setsWon.A}–${st.setsWon.B}`;
    $print.innerHTML = `<div class="p-sheet">
      <h1>Referto di gara — pallavolo</h1>
      <p>${[H.competition, H.phase, H.matchNo && 'Gara n. ' + H.matchNo, [fmtDate(H.date), H.time].filter(Boolean).join(' '), H.venue, H.court && 'Campo ' + H.court].filter(Boolean).map(esc).join(' · ')}</p>
      <div class="p-two">${rosterTable('A')}${rosterTable('B')}</div>
      <p class="p-note">In ogni posizione: n. del titolare, sostituzioni (esce→entra, punteggio) e, sotto, il punteggio della squadra alla fine di ogni turno di servizio. (S) = servizio, (R) = ricezione per primi.</p>
      ${st.sets.map(setBlock).join('')}
      ${sanctions}
      <h3>Risultato</h3>
      <p><b>${res}</b> · set: ${st.sets.map(s => `${s.score.A}–${s.score.B}`).join(', ')} · inizio ${hhmm(st.startTime)} · fine ${hhmm(st.endTime)}</p>
      ${m.remarks ? `<h3>Osservazioni</h3><p>${esc(m.remarks).replace(/\n/g, '<br>')}</p>` : ''}
      <div class="p-sign">
        <div>1° arbitro<br><b>${esc(m.officials.ref1)}</b></div><div>2° arbitro<br><b>${esc(m.officials.ref2)}</b></div>
        <div>Segnapunti<br><b>${esc(m.officials.scorer)}</b></div><div>Capitano ${esc(teamName(m, 'A'))}</div><div>Capitano ${esc(teamName(m, 'B'))}</div>
      </div>
      ${m.closedAt ? `<p class="p-note">Gara chiusa il ${new Date(m.closedAt).toLocaleString('it-IT')}</p>` : '<p class="p-note">BOZZA — gara non ancora chiusa</p>'}
    </div>`;
    window.print();
  }

  // ---------- collegamento all'app del torneo ----------
  // Aperto con ?g=<torneo>_<gara>: se l'app del torneo fornisce window.RefCloud (js/cloud.js),
  // i dati della gara arrivano dal torneo e il risultato torna al torneo. Vedi README.
  const Cloud = (function () {
    const sync = { state: 'ok', timer: null };
    function when() {
      if (window.RefCloud) return Promise.resolve(window.RefCloud);
      return new Promise((resolve, reject) => {
        const to = setTimeout(() => reject(new Error('offline')), 15000);
        window.addEventListener('refcloud-ready', () => { clearTimeout(to); resolve(window.RefCloud); }, { once: true });
      });
    }
    const LABEL = { ok: 'In diretta', wait: 'In attesa di rete', err: 'Non autorizzato' };
    function dot() { return `<span class="sync sync-${sync.state}"><i></i>${LABEL[sync.state]}</span>`; }
    function setState(v) { sync.state = v; const el = $topInfo.querySelector('.sync'); if (el) el.outerHTML = dot(); }
    // Dati pubblici (punteggio in diretta) e completi (referto) per l'app del torneo
    function data(m) {
      const st = stateOf(m);
      const c = st.phase === 'play' ? st.cur : null;
      const copy = Object.assign({}, m);
      ['link', 'id', 'updated'].forEach(k => delete copy[k]);
      return {
        live: {
          status: m.closedAt ? 'finished' : 'live',
          sets: st.sets.map(s => ({ a: s.score.A, b: s.score.B })),
          setsWon: { a: st.setsWon.A, b: st.setsWon.B },
          cur: c ? { set: c.index + 1, a: c.score.A, b: c.score.B } : null,
          serving: c ? c.serving.toLowerCase() : null,
          winner: st.winner ? st.winner.toLowerCase() : null,
          outcome: st.forfeit ? { type: 'forfeit', team: st.forfeit.team.toLowerCase() } : null
        },
        ref: { json: JSON.stringify(copy), closedAt: m.closedAt || null }
      };
    }
    function schedule(m) {
      clearTimeout(sync.timer);
      setState('wait');
      sync.timer = setTimeout(() => {
        const d = data(m);
        when().then(c => c.push(m.link.id, d.live, d.ref)).then(() => setState('ok'))
          .catch(err => { console.warn(err); setState(err && err.code === 'permission-denied' ? 'err' : 'wait'); });
      }, 300);
    }
    // Dati della gara forniti dal torneo: vedi "Formato dei dati" nel README
    function applyInfo(m, info) {
      ['competition', 'phase', 'matchNo', 'date', 'time', 'venue', 'court'].forEach(k => { if (info[k] != null) m.header[k] = String(info[k]); });
      if (m.events.length) return;
      ['A', 'B'].forEach(tm => {
        const src = info[tm] || {};
        const T = m.teams[tm];
        if (src.name) T.name = src.name;
        if (src.color) T.color = src.color;
        if (src.coach) T.coach = src.coach;
        if (Array.isArray(src.players) && src.players.length) {
          T.players = src.players.map(p => (typeof p === 'string' ? { no: '', name: p } : p)).map(p => ({
            no: p.no === '' || p.no == null ? '' : +p.no, name: p.name || '', gender: p.gender === 'F' || p.gender === 'M' ? p.gender : '', libero: !!p.libero, captain: !!p.captain
          }));
        }
      });
      if (info.settings) Object.assign(m.settings, info.settings);
    }
    function open(id) {
      $app.innerHTML = '<section class="card center-card"><h2>Apertura della gara…</h2></section>';
      const s = document.createElement('script');
      s.type = 'module'; s.src = 'js/cloud.js';
      s.onerror = () => { $app.innerHTML = '<section class="card center-card"><h2>Collegamento al torneo non disponibile</h2><p class="muted">Questa copia del referto non è collegata all\'app del torneo.</p></section>'; };
      document.head.appendChild(s);
      when().then(c => c.whoami().then(w => {
        if (!w || (w.role !== 'admin' && w.role !== 'scorer')) throw Object.assign(new Error('login'), { code: 'permission-denied' });
        return c.load(id);
      })).then(ref => {
        let m = Object.values(db.matches).find(x => x.link && x.link.id === id);
        if (!m) { m = emptyMatch(); m.link = { id }; db.matches[m.id] = m; }
        // gara di un torneo a squadre: alla chiusura il risultato va nella gara (vmatches)
        m.link.vmatch = !!(ref.info && ref.info.vmatch);
        m.link.stage = (ref.info && ref.info.stage) || '';
        if (ref.json) {
          try {
            const prev = JSON.parse(ref.json);
            if ((prev.events || []).length > m.events.length) ['header', 'teams', 'officials', 'settings', 'events', 'remarks', 'closedAt', 'setupDone'].forEach(k => { if (prev[k] != null) m[k] = prev[k]; });
          } catch (e) { /* dati non leggibili */ }
        }
        applyInfo(m, ref.info || {});
        if (ref.status === 'live') m.closedAt = null;
        save();
        go(viewFor(m), m.id);
      }).catch(err => {
        console.warn(err);
        const local = Object.values(db.matches).find(x => x.link && x.link.id === id);
        if (local) { go(viewFor(local), local.id); return; }  // senza rete si continua con i dati sul dispositivo
        $app.innerHTML = `<section class="card center-card"><h2>${err && err.code === 'permission-denied' ? 'Accedi con l\'account del campo nell\'app del torneo' : err && err.code === 'not-found' ? 'Gara non trovata' : 'Nessuna connessione'}</h2><div class="row center"><button class="btn primary" id="retryBtn">↻ Riprova</button></div></section>`;
        document.getElementById('retryBtn').onclick = () => location.reload();
      });
    }
    // PDF archiviato nell'app del torneo (refertiPdf/{id}) quando la gara si chiude
    function archivePdf(m) {
      const blobToB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
      return makePdf(m).then(f => blobToB64(f.blob).then(b64 => when().then(c => {
        const [tid, ...rest] = m.link.id.split('_');
        return c.savePdf(m.link.id, { tid, key: rest.join('_'), status: m.closedAt ? 'finished' : 'live', version: `${m.closedAt || ''}:${m.events.length}`, name: f.name }, b64);
      }))).catch(err => console.warn('pdf', err));
    }
    // Risultato nella gara del torneo a squadre (A = casa, B = ospiti)
    function sendResult(m) {
      if (!m.link || !m.link.vmatch) return Promise.resolve();
      const st = stateOf(m);
      if (st.phase !== 'matchEnd') return Promise.resolve();
      const sets = st.sets.map(s => ({ h: s.score.A, a: s.score.B }));
      return when().then(c => c.result(m.link.id, sets, m.link.stage === 'p' ? { golden: null } : null))
        .then(() => toast('Risultato inviato al torneo'))
        .catch(err => { console.warn(err); toast('Risultato non inviato al torneo: inseriscilo a mano o riprova'); });
    }
    return { dot, schedule, open, applyInfo, archivePdf, sendResult };
  })();

  // ---------- avvio ----------
  document.getElementById('homeBtn').onclick = () => go('home');
  window.addEventListener('afterprint', () => { $print.innerHTML = ''; });
  const gid = new URLSearchParams(location.search).get('g');
  if (gid) Cloud.open(gid);
  else {
    const live = Object.values(db.matches).filter(m => !m.closedAt && m.events.length && stateOf(m).phase !== 'matchEnd').sort((a, b) => b.updated.localeCompare(a.updated))[0];
    if (live) { ui.id = live.id; ui.view = viewFor(live); }
    render();
  }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
