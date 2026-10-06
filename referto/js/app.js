/* Referto elettronico di beach volley — interfaccia */
(function () {
  'use strict';

  const R = window.Rules;
  const t = (k, p) => I18n.t(k, p);
  const KEY = 'bvScoresheet.v1';
  const $app = document.getElementById('app');
  const $overlay = document.getElementById('overlay');
  const $toast = document.getElementById('toast');
  const $topInfo = document.getElementById('topInfo');

  // ---------- dati ----------
  let db = load();
  let ui = { view: 'home', id: null, toss: null, tossFor: null };
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
    catch (e) { toast(t('saveError')); }
  }
  function cur() { return db.matches[ui.id]; }
  function touch(m) { m.updated = new Date().toISOString(); save(); if (m.link) schedulePush(m); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function emptyMatch(from) {
    const today = new Date();
    const pad = n => String(n).padStart(2, '0');
    const m = {
      id: uid(),
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      header: { competition: '', location: '', date: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`, phase: '', gender: 'M', matchNo: '', court: '', time: '' },
      teams: {
        A: { name: '', players: [{ no: 1, name: '' }, { no: 2, name: '' }], coach: '' },
        B: { name: '', players: [{ no: 1, name: '' }, { no: 2, name: '' }], coach: '' }
      },
      officials: { ref1: '', ref2: '', scorer: '', assistant: '' },
      settings: Object.assign({}, R.DEFAULT_SETTINGS),
      events: [],
      remarks: '',
      signatures: {},
      approved: null
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
  const hhmm = iso => { if (!iso) return '—'; return new Date(iso).toLocaleTimeString(I18n.locale(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); };
  const fmtDate = s => { if (!s) return ''; const [y, mo, d] = s.split('-'); return d ? `${d}/${mo}/${y}` : s; };
  const mins = (a, b) => (a && b ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000)) : null);

  // ---------- colore della maglia ----------
  // Ogni squadra ha il colore della sua maglia: diventa il colore della squadra in tutto il referto.
  const JERSEYS = [
    ['white', '#ffffff'], ['black', '#1a1a1a'], ['red', '#d62828'], ['bordeaux', '#7b1e2f'], ['orange', '#f76707'],
    ['yellow', '#fcc419'], ['green', '#2b8a3e'], ['lime', '#94d82d'], ['lightblue', '#4dabf7'], ['blue', '#1f63d1'],
    ['navy', '#1b2a4a'], ['purple', '#7048e8'], ['pink', '#e64980'], ['grey', '#868e96']
  ];
  const DEFAULT_COLOR = { A: '#1f63d1', B: '#d9480f' };
  function hexRgb(h) { h = String(h || '').replace('#', ''); if (h.length === 3) h = h.replace(/./g, c => c + c); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function luminance(h) {
    return hexRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
      .reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0);
  }
  const colorOf = (m, tm) => (m && m.teams[tm].color) || DEFAULT_COLOR[tm];
  function jerseyName(m, tm) {
    const c = m.teams[tm].color;
    if (!c) return '';
    const k = JERSEYS.find(j => j[1] === c.toLowerCase());
    return k ? t('col_' + k[0]) : c.toUpperCase();
  }
  // Colore del testo sopra la maglia, colore leggibile su fondo chiaro, bordo per le maglie chiare.
  function teamVars(c) {
    const L = luminance(c);
    return { base: c, ink: L > 0.45 ? '#111111' : '#ffffff', text: L > 0.6 ? '#495057' : c, edge: L > 0.75 ? '#adb5bd' : c };
  }
  function applyTeamColors(m) {
    const st = document.documentElement.style;
    ['A', 'B'].forEach(tm => {
      const k = tm.toLowerCase();
      if (!m) { ['', '-ink', '-text', '-edge'].forEach(x => st.removeProperty(`--${k}${x}`)); return; }
      const v = teamVars(colorOf(m, tm));
      st.setProperty(`--${k}`, v.base); st.setProperty(`--${k}-ink`, v.ink);
      st.setProperty(`--${k}-text`, v.text); st.setProperty(`--${k}-edge`, v.edge);
    });
  }

  function teamName(m, tm) {
    const team = m.teams[tm];
    if (team.name && team.name.trim()) return team.name.trim();
    const n = team.players.map(p => (p.name || '').trim().split(/\s+/).pop()).filter(Boolean);
    return n.length ? n.join(' / ') : t('teamX', { t: tm });
  }
  function playerLabel(m, tm, idx) {
    const p = m.teams[tm].players[idx];
    return `#${p.no} ${p.name || t('playerN', { n: p.no })}`;
  }
  function toast(msg) {
    $toast.textContent = msg;
    $toast.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { $toast.hidden = true; }, 2600);
  }
  function stateOf(m) { return R.replay(m); }

  function viewFor(m) {
    if (m.link && !m.events.length && !m.setupDone) return 'setup';
    if (!m.teams.A.players[0].name && !m.events.length) return 'setup';
    const st = stateOf(m);
    if (m.approved || m.closedAt || st.phase === 'matchEnd') return 'end';
    if (st.phase === 'play') return 'live';
    return 'toss';
  }

  function go(view, id) {
    if (id !== undefined) ui.id = id;
    ui.view = view;
    closeOverlay();
    render();
    window.scrollTo(0, 0);
  }

  function renderChrome() {
    document.documentElement.lang = I18n.lang;
    document.title = t('appName');
    document.getElementById('brandName').textContent = t('appName');
    document.getElementById('homeBtn').setAttribute('aria-label', t('homeAria'));
    const langs = document.getElementById('langs');
    langs.setAttribute('aria-label', t('language'));
    langs.querySelectorAll('[data-lang]').forEach(b => b.classList.toggle('on', b.dataset.lang === I18n.lang));
  }

  function render() {
    const m = ui.id ? cur() : null;
    if (!m && ui.view !== 'home' && ui.view !== 'archive') ui.view = 'home';
    renderChrome();
    applyTeamColors(m);
    $topInfo.innerHTML = m ? `${m.link ? syncDot() : ''}<span>${t('match')} ${esc(m.header.matchNo || '—')}</span><span>${t('court')} ${esc(m.header.court || '—')}</span>` : '';
    document.body.dataset.view = ui.view;
    if (m && m.link) watchLink(m);
    if (ui.view === 'archive') { renderArchive(); return; }
    ({ home: renderHome, setup: renderSetup, toss: renderToss, live: renderLive, end: renderEnd })[ui.view](m);
  }

  // ---------- gara collegata al torneo (E-scoresheet) ----------
  // Aperto dal pulsante E-scoresheet del Championship Manager con l'account del campo (o da admin).
  // m.link = { id }: referti/{id} contiene tutti i dati; live/{id} il punteggio pubblico; refertiPdf/{id} il PDF.
  const sync = { state: 'ok', timer: null, watching: null, unwatch: null };

  function whenCloud() {
    if (window.RefCloud) return Promise.resolve(window.RefCloud);
    return new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('offline')), 15000);
      window.addEventListener('refcloud-ready', () => { clearTimeout(to); resolve(window.RefCloud); }, { once: true });
    });
  }

  function syncDot() {
    return `<span class="sync sync-${sync.state}" title="${esc(t('sync_' + sync.state))}"><i></i>${t('sync_' + sync.state)}</span>`;
  }
  function setSync(v) {
    sync.state = v;
    const el = $topInfo.querySelector('.sync');
    if (el) el.outerHTML = syncDot();
  }

  // Versione del PDF: cambia quando cambiano i dati del referto o il suo stato.
  function pdfVersion(status, approvedAt, json) {
    let h = 2166136261;
    for (let i = 0; i < json.length; i++) { h ^= json.charCodeAt(i); h = Math.imul(h, 16777619); }
    return `${status}:${approvedAt || ''}:${(h >>> 0).toString(36)}:${json.length}`;
  }

  // Dati da salvare: pubblici (squadra A = prima squadra del tabellone) e completi (solo staff).
  function syncData(m) {
    const st = stateOf(m);
    const lower = x => (x ? x.toLowerCase() : null);
    const f = st.forfeit;
    const outcome = f ? { type: f.reason === 'INJ' ? 'inj' : 'dsq', team: lower(f.team) } : null;
    let sets;
    if (outcome && outcome.type === 'dsq') sets = [];
    else if (outcome) {
      // ritiro: set giocati, l'ultimo con il punteggio al momento del ritiro
      sets = st.sets.filter(x => x.startTime).map(x => [x.points.A.filter(p => p.by !== 'awarded').length, x.points.B.filter(p => p.by !== 'awarded').length]);
    } else sets = st.sets.map(x => [x.score.A, x.score.B]);
    const c = st.phase === 'play' ? st.cur : null;
    const copy = Object.assign({}, m);
    ['link', 'id', 'approved', 'updated'].forEach(k => delete copy[k]);
    const status = m.closedAt ? 'finished' : 'live';
    return {
      live: {
        status,
        sets: sets.map(([a, b]) => ({ a, b })),
        setsWon: { a: st.setsWon.A, b: st.setsWon.B },
        cur: c ? { set: c.index + 1, a: c.score.A, b: c.score.B } : null,
        serving: c ? lower(c.serving) : null,
        winner: lower(st.winner),
        outcome
      },
      ref: { json: JSON.stringify(copy), closedAt: m.closedAt || null }
    };
  }

  function schedulePush(m) {
    if (m.approved) return;
    clearTimeout(sync.timer);
    setSync('wait');
    sync.timer = setTimeout(() => pushNow(m), 300);
  }
  function pushNow(m) {
    if (!m.link || m.approved) return Promise.resolve();
    const d = syncData(m);
    return whenCloud()
      .then(c => c.push(m.link.id, d.live, d.ref))
      .then(() => setSync('ok'))
      .catch(err => { console.warn(err); setSync(err && err.code === 'permission-denied' ? 'err' : 'wait'); });
  }

  // PDF salvato nell'archivio (refertiPdf) accanto al referto.
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }
  function makePdfFile(m, draft) {
    return window.ScoresheetPDF.generate(m, stateOf(m), { draft, teamName: tm => teamName(m, tm), jersey: tm => jerseyName(m, tm) });
  }
  async function archivePdf(m) {
    if (!m.link) return;
    try {
      const d = syncData(m);
      const status = m.approved ? 'approved' : m.closedAt ? 'finished' : 'live';
      const at = m.approved ? m.approved.at : null;
      const file = await makePdfFile(m, !m.approved);
      const b64 = await blobToBase64(file.blob);
      const [tid, ...rest] = m.link.id.split('_');
      await (await whenCloud()).savePdf(m.link.id, { tid, key: rest.join('_'), status, version: pdfVersion(status, at, d.ref.json), name: file.name }, b64);
    } catch (err) { console.warn('pdf', err); }
  }

  // Stato deciso dall'organizzazione: omologa, riapertura.
  function watchLink(m) {
    if (!m || !m.link || sync.watching === m.id) return;
    if (sync.unwatch) sync.unwatch();
    sync.watching = m.id;
    whenCloud().then(c => {
      if (sync.watching !== m.id) return;
      sync.unwatch = c.watch(m.link.id, r => {
        if (!r) return;
        let changed = false;
        if (r.status === 'approved' && !m.approved) {
          m.approved = { time: new Date(r.approvedAt || Date.now()).toISOString(), at: r.approvedAt || null, byOrg: true };
          changed = true; toast(t('approvedByOrg'));
          archivePdf(m);
        } else if (r.status === 'live' && (m.closedAt || m.approved)) { m.closedAt = null; m.approved = null; changed = true; toast(t('reopenedByOrg')); }
        else if (r.status === 'finished' && m.approved) { m.approved = null; changed = true; }
        if (changed) {
          m.updated = new Date().toISOString(); save();
          if (ui.id === m.id && ui.view !== 'setup') go(viewFor(m));
        }
      });
    }).catch(() => {});
  }

  // Dati della gara dal torneo (numero, squadre, orario, campo, fase, formula).
  function applyInfo(m, info) {
    Object.assign(m.header, {
      competition: info.competition || '', location: info.location || '', matchNo: info.matchNo || '', phase: info.phase || '',
      gender: info.gender || m.header.gender, date: info.date || m.header.date, time: info.time || '', court: info.court || ''
    });
    if (!m.events.length) {
      ['A', 'B'].forEach(tm => {
        const src = info[tm] || {};
        m.teams[tm].name = src.name || '';
        (src.players || []).forEach((n, i) => { if (m.teams[tm].players[i]) m.teams[tm].players[i].name = n; });
      });
      if (info.settings) Object.assign(m.settings, info.settings);
    }
  }

  function fromJson(m, json) {
    try {
      const prev = JSON.parse(json);
      ['header', 'teams', 'officials', 'settings', 'events', 'remarks', 'closedAt', 'setupDone', 'signatures'].forEach(k => { if (prev[k] != null) m[k] = prev[k]; });
    } catch (e) { /* dati non leggibili */ }
  }

  function centerCard(html) { $app.innerHTML = `<section class="card center-card">${html}</section>`; }

  // Accesso con l'account del campo (lo stesso del Championship Manager).
  function renderLogin(then, msg) {
    $topInfo.innerHTML = '';
    centerCard(`<h2>${t('loginTitle')}</h2><p class="muted">${msg || t('loginText')}</p>
      <form id="loginForm" class="login-form">
        <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="username" autocapitalize="off" spellcheck="false"></label>
        <label class="field"><span>${t('password')}</span><input name="password" type="password" required autocomplete="current-password"></label>
        <p class="error" id="loginErr"></p>
        <button class="btn primary big wide">${t('loginBtn')}</button>
      </form>`);
    const f = document.getElementById('loginForm');
    f.onsubmit = e => {
      e.preventDefault();
      whenCloud().then(c => c.login(f.email.value, f.password.value)).then(then)
        .catch(() => { document.getElementById('loginErr').textContent = t('loginErr'); });
    };
  }

  // Controlla l'accesso; se manca chiede email e password.
  function needStaff(run) {
    return whenCloud().then(c => c.whoami()).then(w => {
      if (w && (w.role === 'admin' || w.role === 'scorer')) return run(w);
      renderLogin(() => needStaff(run), w && w.email ? t('notEnabled') : null);
    });
  }

  function openSession(id) {
    const local = Object.values(db.matches).find(x => x.link && x.link.id === id);
    if (local) { ui.id = local.id; ui.view = viewFor(local); render(); }
    else centerCard(`<h2>${t('linkLoading')}</h2>`);
    needStaff(w => whenCloud().then(c => c.load(id)).then(ref => {
      let m = Object.values(db.matches).find(x => x.link && x.link.id === id);
      if (!m) {
        m = emptyMatch();
        m.link = { id };
        if (ref.json) fromJson(m, ref.json);    // referto già iniziato su un altro dispositivo
        db.matches[m.id] = m;
      } else if (ref.json) {
        // su un altro dispositivo la gara è andata avanti: si riprende da lì
        try { if ((JSON.parse(ref.json).events || []).length > m.events.length) fromJson(m, ref.json); } catch (e) { /* ignore */ }
      }
      applyInfo(m, ref.info || {});
      if (ref.status === 'approved' && !m.approved) m.approved = { time: new Date(ref.approvedAt || Date.now()).toISOString(), at: ref.approvedAt || null, byOrg: true };
      if (ref.status === 'live' && (m.closedAt || m.approved)) { m.closedAt = null; m.approved = null; }
      m.updated = new Date().toISOString();
      save();
      ui.id = m.id;
      ui.who = w;
      watchLink(m);
      go(viewFor(m));
    })).catch(err => {
      console.warn(err);
      if (local) { watchLink(local); return; }   // senza rete si continua con i dati sul dispositivo
      const key = err && err.code === 'not-found' ? 'refNotFound' : err && err.code === 'permission-denied' ? 'notEnabled' : 'linkOffline';
      centerCard(`<h2>${t(key)}</h2><div class="row center"><button class="btn primary" id="retryBtn">↻</button></div>`);
      document.getElementById('retryBtn').onclick = () => location.reload();
    });
  }

  // ---------- archivio dei referti di un torneo ----------
  const refMatch = ref => {
    const m = emptyMatch();
    if (ref.json) fromJson(m, ref.json); else applyInfo(m, ref.info || {});
    m.approved = ref.status === 'approved' ? { time: new Date(ref.approvedAt || Date.now()).toISOString(), at: ref.approvedAt || null } : null;
    return m;
  };
  const refVersion = ref => pdfVersion(ref.status === 'approved' ? 'approved' : ref.status, ref.status === 'approved' ? ref.approvedAt : null, ref.json || '');

  // PDF dall'archivio se aggiornato, altrimenti lo crea dai dati del referto e lo archivia.
  async function ensurePdf(ref) {
    const c = await whenCloud();
    const ver = refVersion(ref);
    const saved = await c.loadPdf(ref.id).catch(() => null);
    if (saved && saved.version === ver) {
      const bytes = Uint8Array.from(atob(saved.data), ch => ch.charCodeAt(0));
      return { blob: new Blob([bytes], { type: 'application/pdf' }), name: saved.name };
    }
    const m = refMatch(ref);
    const file = await makePdfFile(m, ref.status !== 'approved');
    const b64 = await blobToBase64(file.blob);
    await c.savePdf(ref.id, { tid: ref.tid, key: ref.key, status: ref.status, version: ver, name: file.name }, b64).catch(() => {});
    return file;
  }

  function loadZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/jszip.min.js'; s.onload = () => resolve(window.JSZip); s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // Modalità di servizio (?archivio=<torneo>&build=1, aperta di nascosto dalla scheda Referti del
  // Championship Manager): crea o aggiorna i PDF mancanti, poi avvisa la pagina che l'ha aperta.
  async function buildPdfs(tid) {
    const tell = msg => { try { window.parent.postMessage(Object.assign({ source: 'referto-build', tid }, msg), location.origin); } catch (e) { /* ignore */ } };
    try {
      const c = await whenCloud();
      const w = await c.whoami();
      if (!w || !(w.role === 'admin' || w.role === 'scorer')) { tell({ done: true, error: 'permission-denied' }); return; }
      const [refs, pdfs] = await Promise.all([c.list(tid), c.listPdf(tid)]);
      const have = {};
      pdfs.forEach(p => { have[p.ref] = p.version; });
      const todo = refs.filter(r => r.json && have[r.id] !== refVersion(r));
      for (let i = 0; i < todo.length; i++) {
        tell({ progress: i + 1, total: todo.length });
        const r = todo[i];
        const file = await makePdfFile(refMatch(r), r.status !== 'approved');
        await c.savePdf(r.id, { tid: r.tid, key: r.key, status: r.status, version: refVersion(r), name: file.name }, await blobToBase64(file.blob));
      }
      tell({ done: true, built: todo.length });
    } catch (err) { console.warn(err); tell({ done: true, error: err.code || err.message }); }
  }

  function openArchive(tid) {
    ui.view = 'archive';
    centerCard(`<h2>${t('linkLoading')}</h2>`);
    needStaff(() => whenCloud().then(c => c.list(tid)).then(list => {
      ui.archive = { tid, list };
      renderArchive();
    })).catch(err => { console.warn(err); centerCard(`<h2>${t('linkOffline')}</h2>`); });
  }

  function renderArchive() {
    const { list } = ui.archive;
    const num = r => { const n = ((r.info || {}).matchNo || '').replace(/\D/g, ''); return (((r.info || {}).matchNo || '')[0] === 'Q' ? 0 : 1e6) + (+n || 0); };
    list.sort((a, b) => num(a) - num(b));
    const comp = list.length ? (list[0].info || {}).competition || '' : '';
    renderChrome();
    $topInfo.innerHTML = '';
    document.body.dataset.view = 'archive';
    const badge = st => st === 'approved' ? `<span class="badge ok">${t('st_approved')}</span>` : st === 'finished' ? `<span class="badge warn">${t('pendingStamp')}</span>`
      : st === 'live' ? `<span class="badge live">${t('st_live')}</span>` : `<span class="badge idle">${t('st_idle')}</span>`;
    $app.innerHTML = `
      <section class="card">
        <h1>🗂 ${t('archiveTitle')}</h1>
        <p class="muted">${esc(comp)} · ${t('archiveCount', { n: list.length })}</p>
        <p class="muted small">${t('archiveHelp')}</p>
        <div class="row wrap"><button class="btn primary big" id="zipBtn" ${list.length ? '' : 'disabled'}>${t('zipBtn')}</button></div>
      </section>
      <section class="card">
        ${list.length ? `<ul class="match-list archive-list">${list.map((r, i) => {
          const inf = r.info || {};
          const sets = (r.sets || []).map(x => `${x.a}-${x.b}`).join(', ');
          return `<li>
            <div class="match-item static">
              <span class="mi-top"><b>${t('match')} ${esc(inf.matchNo || '—')}</b> · ${t('court')} ${esc(r.court || inf.court || '—')} · ${esc(inf.phase || '')}</span>
              <span class="mi-teams">${esc((inf.A || {}).name || 'A')} <i>${t('vs')}</i> ${esc((inf.B || {}).name || 'B')}</span>
              <span class="mi-bottom">${badge(r.status)} ${esc(sets)} <span class="muted">${esc(r.updatedBy || r.createdBy || '')}</span></span>
            </div>
            <div class="archive-actions">
              <button class="btn" data-pdf="${i}" ${r.json ? '' : 'disabled'}>⬇ PDF</button>
              <a class="btn ghost" href="?g=${encodeURIComponent(r.id)}">${t('openBtn')}</a>
            </div>
          </li>`;
        }).join('')}</ul>` : `<p class="muted">${t('archiveEmpty')}</p>`}
      </section>`;
    $app.querySelectorAll('[data-pdf]').forEach(b => b.onclick = () => {
      b.disabled = true;
      ensurePdf(list[+b.dataset.pdf]).then(f => download(f.blob, f.name)).catch(err => { console.error(err); toast(t('pdfError')); })
        .finally(() => { b.disabled = false; });
    });
    const zb = document.getElementById('zipBtn');
    if (zb) zb.onclick = async () => {
      zb.disabled = true;
      try {
        const JSZip = await loadZip();
        const zip = new JSZip();
        const ok = list.filter(r => r.json);
        for (let i = 0; i < ok.length; i++) {
          zb.textContent = t('zipMaking', { n: i + 1, t: ok.length });
          const f = await ensurePdf(ok[i]);
          zip.file(f.name, f.blob);
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        download(blob, `referti_${window.ScoresheetPDF.safeName(comp) || ui.archive.tid}.zip`);
      } catch (err) { console.error(err); toast(t('pdfError')); }
      zb.disabled = false;
      zb.textContent = t('zipBtn');
    };
  }

  // ---------- overlay ----------
  function openOverlay(html, opts) {
    opts = opts || {};
    $overlay.innerHTML = `<div class="dialog ${opts.cls || ''}" role="dialog" aria-modal="true">${html}</div>`;
    $overlay.hidden = false;
    $overlay.onclick = e => { if (e.target === $overlay && opts.dismiss !== false) closeOverlay(); };
    const f = $overlay.querySelector('[autofocus]');
    if (f) f.focus();
  }
  function closeOverlay() {
    clearInterval(openOverlay.timer);
    $overlay.hidden = true;
    $overlay.innerHTML = '';
    const q = closeOverlay.queue;
    closeOverlay.queue = null;
    if (q) q();
  }
  function confirmBox(title, text, okLabel, onOk, danger) {
    openOverlay(`<h2>${title}</h2><p>${text}</p>
      <div class="row end"><button class="btn ghost" data-x>${t('cancel')}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok autofocus>${okLabel}</button></div>`);
    $overlay.querySelector('[data-x]').onclick = closeOverlay;
    $overlay.querySelector('[data-ok]').onclick = () => { closeOverlay(); onOk(); };
  }
  function countdown(title, sub, secs, cls, then) {
    let left = secs;
    openOverlay(`<div class="big-alert ${cls}"><h2>${title}</h2><p>${sub}</p><div class="count" id="cd">${left}</div>
      <button class="btn primary wide" data-x autofocus>${t('close')}</button></div>`, { cls: 'alert' });
    closeOverlay.queue = then || null;
    $overlay.querySelector('[data-x]').onclick = closeOverlay;
    openOverlay.timer = setInterval(() => {
      left--;
      const el = document.getElementById('cd');
      if (el) el.textContent = Math.max(0, left);
      if (left <= 0) { clearInterval(openOverlay.timer); if (navigator.vibrate) navigator.vibrate([200, 100, 200]); }
    }, 1000);
  }

  // ---------- HOME ----------
  function statusOf(m) {
    if (m.approved) return [t('st_approved'), 'ok'];
    if (m.closedAt) return [t('pendingStamp'), 'warn'];
    if (!m.events.length) return [t('st_idle'), 'idle'];
    const st = stateOf(m);
    if (st.phase === 'matchEnd') return [t('st_toApprove'), 'warn'];
    return [t('st_live'), 'live'];
  }

  function renderHome() {
    const list = Object.values(db.matches).sort((a, b) => b.updated.localeCompare(a.updated));
    const last = list[0];
    $app.innerHTML = `
      <section class="card hero">
        <h1>${t('heroTitle')}</h1>
        <p class="muted">${t('heroText')}</p>
        <div class="row wrap">
          <button class="btn primary big" id="newBtn">${t('newMatch')}</button>
          ${last ? `<button class="btn big" id="newSameBtn" title="${esc(t('newSameTitle'))}">${t('newSame')}</button>` : ''}
        </div>
      </section>
      <section class="card">
        <h2>${t('matches')}</h2>
        ${list.length ? `<ul class="match-list">${list.map(m => {
          const [lab, cls] = statusOf(m);
          const st = m.events.length ? stateOf(m) : null;
          const res = st && st.sets.length ? st.sets.map(s => `${s.score.A}-${s.score.B}`).join(', ') : '';
          return `<li>
            <button class="match-item" data-open="${m.id}">
              <span class="mi-top"><b>${t('match')} ${esc(m.header.matchNo || '—')}</b> · ${t('court')} ${esc(m.header.court || '—')} · ${esc(fmtDate(m.header.date))} ${esc(m.header.time || '')}</span>
              <span class="mi-teams">${esc(teamName(m, 'A'))} <i>${t('vs')}</i> ${esc(teamName(m, 'B'))}</span>
              <span class="mi-bottom"><span class="badge ${cls}">${lab}</span>${m.link ? ` <span class="badge linked">🔗 ${t('linkedBadge')}</span>` : ''} ${esc(res)} <span class="muted">${esc(m.header.competition || '')}</span></span>
            </button>
            <button class="icon-btn" data-del="${m.id}" aria-label="${esc(t('deleteAria'))}" title="${esc(t('del'))}">🗑</button>
          </li>`;
        }).join('')}</ul>` : `<p class="muted">${t('noMatches')}</p>`}
      </section>
      <section class="card">
        <h2>${t('backup')}</h2>
        <p class="muted">${t('backupText')}</p>
        <div class="row wrap">
          <button class="btn" id="expBtn" ${list.length ? '' : 'disabled'}>${t('exportBtn')}</button>
          <label class="btn">${t('importBtn')}<input type="file" id="impFile" accept=".json,application/json" hidden></label>
        </div>
      </section>`;
    document.getElementById('newBtn').onclick = () => { const m = emptyMatch(); db.matches[m.id] = m; save(); go('setup', m.id); };
    const same = document.getElementById('newSameBtn');
    if (same) same.onclick = () => { const m = emptyMatch(last); db.matches[m.id] = m; save(); go('setup', m.id); };
    $app.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { ui.id = b.dataset.open; go(viewFor(cur())); });
    $app.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      const m = db.matches[b.dataset.del];
      confirmBox(t('deleteTitle'), t('deleteText', { m: `${t('match')} ${esc(m.header.matchNo || '—')}`, a: esc(teamName(m, 'A')), b: esc(teamName(m, 'B')) }), t('del'), () => { delete db.matches[m.id]; save(); render(); }, true);
    });
    document.getElementById('expBtn').onclick = () => {
      download(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }), `scoresheets-beach-${new Date().toISOString().slice(0, 10)}.json`);
    };
    document.getElementById('impFile').onchange = e => {
      const f = e.target.files[0];
      if (!f) return;
      f.text().then(txt => {
        const d = JSON.parse(txt);
        if (!d || !d.matches) throw new Error('format');
        let n = 0;
        Object.values(d.matches).forEach(m => { if (m && m.id && m.teams) { db.matches[m.id] = m; n++; } });
        save(); render(); toast(t('imported', { n }));
      }).catch(() => toast(t('badFile')));
    };
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---------- DATI GARA ----------
  function field(label, name, value, attrs) {
    return `<label class="field"><span>${label}</span><input name="${name}" value="${esc(value)}" ${attrs || ''}></label>`;
  }

  function formatText(S) {
    if (S.bestOf === 1) return t('fmt_single', { a: S.points });
    if (S.bestOf === 5) return t('fmt_bo5', { a: S.points, b: S.tiePoints });
    return t('fmt_bo3', { a: S.points, b: S.tiePoints });
  }

  // Scelta del colore della maglia (scheda della squadra e schermata del sorteggio del set 1).
  function jerseyPicker(m, tm) {
    const cur = String(m.teams[tm].color || '').toLowerCase();
    const custom = cur && !JERSEYS.some(j => j[1] === cur);
    return `<div class="jersey" role="radiogroup" aria-label="${esc(t('jersey'))} ${tm}">
        ${JERSEYS.map(([k, c]) => `<label title="${esc(t('col_' + k))}"><input type="radio" name="color${tm}" value="${c}" ${cur === c ? 'checked' : ''}><span class="sw" style="background:${c};--ck:${teamVars(c).ink}"></span></label>`).join('')}
        <label class="custom" title="${esc(t('col_custom'))}"><input type="radio" name="color${tm}" value="custom" ${custom ? 'checked' : ''}>
          <input type="color" name="custom${tm}" value="${esc(custom ? cur : '#808080')}" aria-label="${esc(t('col_custom'))}">${t('col_custom')}</label>
      </div>
      <div class="jersey-name" data-jname="${tm}">${esc(jerseyName(m, tm))}</div>`;
  }
  const colorsOk = m => !!(m.teams.A.color && m.teams.B.color && m.teams.A.color !== m.teams.B.color);

  function pickColor(f, tm) {
    const v = (f.get('color' + tm) || '').toString();
    if (v === 'custom') return (f.get('custom' + tm) || '').toString().toLowerCase();
    return v.toLowerCase();
  }

  function renderSetup(m) {
    const started = m.events.length > 0;
    const S = R.settingsOf(m);
    const fmt = S.bestOf === 1 ? `single${S.points}` : `bo3-${S.points}-${S.tiePoints}`;
    // Gara collegata: i dati del torneo arrivano dall'organizzazione e non si modificano qui.
    const lk = m.link ? ' readonly tabindex="-1"' : '';
    const teamBlock = tm => `
      <fieldset class="card team-${tm}">
        <legend>${t('teamX', { t: tm })}</legend>
        ${field(`${t('teamName')} <small>${m.link ? '' : t('teamNameHint')}</small>`, `team${tm}.name`, m.teams[tm].name, 'autocomplete="off"' + lk)}
        <div class="grid2">
          ${field(t('playerNo', { n: 1 }), `team${tm}.p0`, m.teams[tm].players[0].name, `required autocomplete="off" placeholder="${esc(t('fullName'))}"` + lk)}
          ${field(t('playerNo', { n: 2 }), `team${tm}.p1`, m.teams[tm].players[1].name, `required autocomplete="off" placeholder="${esc(t('fullName'))}"` + lk)}
        </div>
        ${field(t('coach'), `team${tm}.coach`, m.teams[tm].coach, 'autocomplete="off"')}
        <div class="field jersey-field"><span>👕 ${t('jersey')} *</span>${jerseyPicker(m, tm)}</div>
      </fieldset>`;
    const fmtOpt = (v, label) => `<option value="${v}" ${fmt === v ? 'selected' : ''}>${label}</option>`;
    $app.innerHTML = `
      <form id="setupForm" class="setup ${m.link ? 'linked' : ''}" autocomplete="on">
        ${m.link ? `<div class="card linked-banner">🔗 ${t('linkedBanner')}</div>` : ''}
        <fieldset class="card">
          <legend>${t('secTournament')}</legend>
          ${field(t('competition'), 'competition', m.header.competition, `placeholder="${esc(t('competitionPh'))}"` + lk)}
          <div class="grid2">
            ${field(t('location'), 'location', m.header.location, lk)}
            ${field(t('phase'), 'phase', m.header.phase, `placeholder="${esc(t('phasePh'))}"` + lk)}
          </div>
          <div class="grid4">
            ${field(t('matchNo'), 'matchNo', m.header.matchNo, (m.link ? '' : 'inputmode="numeric" required') + lk)}
            ${field(t('court'), 'court', m.header.court, (m.link ? '' : 'required') + lk)}
            ${m.link ? field(t('date'), 'date', fmtDate(m.header.date), lk) : field(t('date'), 'date', m.header.date, 'type="date" required')}
            ${m.link ? field(t('startTime'), 'time', m.header.time, lk) : field(t('startTime'), 'time', m.header.time, 'type="time" required')}
          </div>
          <div class="field"><span>${t('category')}</span>
            <div class="seg">${['M', 'F', 'X'].map(v => `<label><input type="radio" name="gender" value="${v}" ${m.header.gender === v ? 'checked' : ''} ${m.link ? 'disabled' : ''}><span>${t('g_' + v)}</span></label>`).join('')}</div>
          </div>
        </fieldset>
        <div class="grid2 teams">${teamBlock('A')}${teamBlock('B')}</div>
        <fieldset class="card">
          <legend>${t('officials')}</legend>
          <div class="grid2">
            ${field(t('ref1'), 'ref1', m.officials.ref1, 'required')}
            ${field(t('ref2'), 'ref2', m.officials.ref2)}
            ${field(t('scorer'), 'scorer', m.officials.scorer, 'required')}
            ${field(t('assistant'), 'assistant', m.officials.assistant)}
          </div>
        </fieldset>
        <fieldset class="card">
          <legend>${t('format')}</legend>
          ${m.link ? field(t('formatLabel'), 'formatText', formatText(S), lk) : `<label class="field"><span>${t('formatLabel')}</span>
            <select name="format" ${started ? 'disabled' : ''}>
              ${fmtOpt('bo3-21-15', t('fmt_bo3', { a: 21, b: 15 }))}
              ${fmtOpt('bo3-15-15', t('fmt_bo3', { a: 15, b: 15 }))}
              ${fmtOpt('single21', t('fmt_single', { a: 21 }))}
              ${fmtOpt('single15', t('fmt_single', { a: 15 }))}
            </select></label>`}
          <label class="check"><input type="checkbox" name="tto" ${S.tto ? 'checked' : ''} ${started ? 'disabled' : ''}> ${t('ttoLabel')}</label>
          ${started ? `<p class="muted small">${t('formatLocked')}</p>` : ''}
        </fieldset>
        <p class="field-error" id="setupErr" role="alert"></p>
        <div class="row end sticky-actions">
          ${started ? `<button type="button" class="btn ghost" id="backBtn">${t('backToMatch')}</button>` : ''}
          <button class="btn primary big">${started ? t('save') : t('nextToss')}</button>
        </div>
      </form>`;
    const form = document.getElementById('setupForm');
    const back = document.getElementById('backBtn');
    if (back) back.onclick = () => go(viewFor(m));
    // nome del colore scelto, subito sotto le maglie
    form.addEventListener('change', e => {
      const n = e.target.name || '';
      const tm = /^(color|custom)([AB])$/.exec(n);
      if (!tm) return;
      if (n.startsWith('custom')) form.querySelector(`input[name=color${tm[2]}][value=custom]`).checked = true;
      const v = pickColor(new FormData(form), tm[2]);
      const k = JERSEYS.find(j => j[1] === v);
      form.querySelector(`[data-jname=${tm[2]}]`).textContent = v ? (k ? t('col_' + k[0]) : v.toUpperCase()) : '';
      if (v) {   // anteprima immediata del colore della squadra
        const tv = teamVars(v), key = tm[2].toLowerCase(), st = document.documentElement.style;
        st.setProperty(`--${key}`, tv.base); st.setProperty(`--${key}-ink`, tv.ink); st.setProperty(`--${key}-text`, tv.text); st.setProperty(`--${key}-edge`, tv.edge);
      }
      document.getElementById('setupErr').textContent = '';
    });
    form.onsubmit = e => {
      e.preventDefault();
      const f = new FormData(form);
      const g = k => (f.get(k) || '').toString().trim();
      const cA = pickColor(f, 'A'), cB = pickColor(f, 'B');
      const err = document.getElementById('setupErr');
      if (!cA || !cB) { err.textContent = t('jerseyRequired'); err.scrollIntoView({ block: 'center' }); return; }
      if (cA === cB) { err.textContent = t('jerseySame'); err.scrollIntoView({ block: 'center' }); return; }
      m.teams.A.color = cA; m.teams.B.color = cB;
      if (!m.link) Object.assign(m.header, { competition: g('competition'), location: g('location'), phase: g('phase'), matchNo: g('matchNo'), court: g('court'), date: g('date'), time: g('time'), gender: g('gender') || 'M' });
      ['A', 'B'].forEach(tm => {
        if (!m.link) {
          m.teams[tm].name = g(`team${tm}.name`);
          m.teams[tm].players[0].name = g(`team${tm}.p0`);
          m.teams[tm].players[1].name = g(`team${tm}.p1`);
        }
        m.teams[tm].coach = g(`team${tm}.coach`);
      });
      Object.assign(m.officials, { ref1: g('ref1'), ref2: g('ref2'), scorer: g('scorer'), assistant: g('assistant') });
      m.setupDone = true;
      if (!started && m.link) m.settings.tto = f.get('tto') === 'on';
      else if (!started) {
        const v = g('format');
        const [kind, a, b] = v.split('-');
        if (kind === 'bo3') Object.assign(m.settings, { bestOf: 3, points: +a, tiePoints: +b });
        else Object.assign(m.settings, { bestOf: 1, points: +v.replace('single', '') });
        m.settings.tto = f.get('tto') === 'on';
      }
      touch(m);
      go(viewFor(m));
    };
  }

  // ---------- SORTEGGIO / SCELTE / INIZIO SET ----------
  function renderToss(m) {
    const st = stateOf(m);
    const d = R.nextSetDefaults(m, st);
    const key = `${m.id}:${d.index}`;
    if (ui.tossFor !== key) {
      ui.toss = { chooser: d.chooser, choice: null, otherChoice: null, left: null, order: { A: d.order.A.slice(), B: d.order.B.slice() } };
      ui.tossFor = key;
    }
    const T = ui.toss;
    const setNo = d.index + 1;
    const prev = st.sets[d.index - 1];
    const serving = R.servingFromChoice(T.chooser, T.choice, T.otherChoice);
    const opt = (name, val, label, sel, cls) => `<button type="button" class="opt ${sel ? 'on' : ''} ${cls || ''}" data-k="${name}" data-v="${val}">${label}</button>`;
    const teamOpts = (name, sel) => ['A', 'B'].map(tm => opt(name, tm, `<small>${tm}</small> ${esc(teamName(m, tm))}`, sel === tm, `team-${tm}`)).join('');
    const choiceOpts = (name, sel, list) => list.map(c => opt(name, c, t('ch_' + c), sel === c)).join('');
    // riserva: gare arrivate al sorteggio senza colori (impostate prima dell'aggiornamento)
    if (d.index === 0 && !colorsOk(m)) ui.jerseyAtToss = m.id;
    const needJersey = d.index === 0 && ui.jerseyAtToss === m.id;
    const ready = serving && T.left && (!needJersey || colorsOk(m));

    // anteprima campo
    let preview = '';
    if (serving && T.left) {
      const pos = (tm, i) => (tm === serving ? (i === 0 ? 'I' : 'III') : (i === 0 ? 'II' : 'IV'));
      const side = tm => `<div class="pv-side team-${tm}">
        <b>${esc(teamName(m, tm))}</b>
        ${[0, 1].map(i => `<span class="${serving === tm && i === 0 ? 'srv' : ''}">${serving === tm && i === 0 ? '🏐 ' : ''}${esc(playerLabel(m, tm, T.order[tm][i]))} <em>${pos(tm, i)}</em></span>`).join('')}
      </div>`;
      preview = `<div class="preview"><div class="pv-label">${t('scorerView')}</div><div class="pv-court">${side(T.left)}<div class="pv-net"></div>${side(other(T.left))}</div>
        <p class="muted small">${t('serviceOrder')}: ${['I', 'II', 'III', 'IV'].map(p => {
          const tm = (p === 'I' || p === 'III') ? serving : other(serving);
          const i = (p === 'I' || p === 'II') ? 0 : 1;
          return `<b>${p}</b> ${esc(playerLabel(m, tm, T.order[tm][i]))}`;
        }).join(' → ')}</p></div>`;
    }

    $app.innerHTML = `
      <section class="card">
        ${prev ? `<div class="set-done">${t('setN', { n: prev.index + 1 })}: <b>${esc(teamName(m, 'A'))} ${prev.score.A} – ${prev.score.B} ${esc(teamName(m, 'B'))}</b> · ${t('setsWon')} ${st.setsWon.A}–${st.setsWon.B}</div>` : ''}
        <h1>${t('setN', { n: setNo })}${d.needsToss ? t('tossSuffix') : ''}</h1>
        ${needJersey ? `<div class="q jerseys-q"><h3>👕 ${t('jerseyQ')}</h3>
          <div class="grid2">${['A', 'B'].map(tm => `<div class="jersey-team team-${tm}"><b>${tm} · ${esc(teamName(m, tm))}</b>${jerseyPicker(m, tm)}</div>`).join('')}</div>
          ${m.teams.A.color && m.teams.A.color === m.teams.B.color ? `<p class="field-error">${t('jerseySame')}</p>` : !colorsOk(m) ? `<p class="muted small">${t('jerseyRequired')}</p>` : ''}
        </div>` : ''}
        <div class="q"><h3>${d.needsToss ? t('tossWinner') : t('set2Chooser')}</h3><div class="opts">${teamOpts('chooser', T.chooser)}</div></div>
        ${T.chooser ? `<div class="q"><h3>${t('chooserChose', { t: esc(teamName(m, T.chooser)) })}</h3><div class="opts">${choiceOpts('choice', T.choice, ['serve', 'receive', 'side'])}</div></div>` : ''}
        ${T.chooser && T.choice === 'side' ? `<div class="q"><h3>${t('otherChose', { t: esc(teamName(m, other(T.chooser))) })}</h3><div class="opts">${choiceOpts('otherChoice', T.otherChoice, ['serve', 'receive'])}</div></div>` : ''}
        ${serving ? `<div class="q"><h3>${t('servesFirst')}</h3><div class="serving-note team-${serving}">🏐 <b>${esc(teamName(m, serving))}</b></div></div>` : ''}
        ${T.choice ? `<div class="q"><h3>${t('leftSide')} <small class="muted">(${t('leftSideHint')})</small></h3><div class="opts">${teamOpts('left', T.left)}</div></div>` : ''}
        ${serving ? `<div class="grid2">${['A', 'B'].map(tm => `<div class="q"><h3>${t('firstServer', { t: esc(teamName(m, tm)) })}</h3><div class="opts">
          ${[0, 1].map(i => opt(`first${tm}`, i, esc(playerLabel(m, tm, i)), T.order[tm][0] === i, `team-${tm}`)).join('')}</div></div>`).join('')}
        </div>` : ''}
        ${preview}
        <div class="row end">
          ${m.events.length ? `<button class="btn ghost" id="undoBtn">${t('undoLast')}</button>` : `<button class="btn ghost" id="editBtn">${t('editData')}</button>`}
          <button class="btn primary big" id="startBtn" ${ready ? '' : 'disabled'}>${t('startSet', { n: setNo })}</button>
        </div>
      </section>`;

    const jq = $app.querySelector('.jerseys-q');
    if (jq) jq.addEventListener('change', e => {
      const n = /^(color|custom)([AB])$/.exec(e.target.name || '');
      if (!n) return;
      const tm = n[2];
      if (n[1] === 'custom') jq.querySelector(`input[name=color${tm}][value=custom]`).checked = true;
      const r = jq.querySelector(`input[name=color${tm}]:checked`);
      const v = !r ? '' : r.value === 'custom' ? jq.querySelector(`input[name=custom${tm}]`).value.toLowerCase() : r.value;
      m.teams[tm].color = v;
      touch(m);
      render();
    });
    $app.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      const k = b.dataset.k, v = b.dataset.v;
      if (k === 'chooser') { if (T.chooser !== v) { T.chooser = v; T.choice = null; T.otherChoice = null; } }
      else if (k === 'choice') { T.choice = v; if (v !== 'side') T.otherChoice = null; }
      else if (k === 'otherChoice' || k === 'left') T[k] = v;
      else if (k === 'firstA' || k === 'firstB') {
        const tm = k.slice(-1), i = +v;
        T.order[tm] = [i, 1 - i];
      }
      renderToss(m);
    });
    const undo = document.getElementById('undoBtn');
    if (undo) undo.onclick = () => undoLast(m);
    const edit = document.getElementById('editBtn');
    if (edit) edit.onclick = () => go('setup');
    document.getElementById('startBtn').onclick = () => {
      if (!ready) return;
      m.events.push({
        type: 'setStart', serving, left: T.left,
        order: { A: T.order.A.slice(), B: T.order.B.slice() },
        toss: { chooser: T.chooser, choice: T.choice, otherChoice: T.otherChoice, draw: d.needsToss },
        time: new Date().toISOString()
      });
      ui.tossFor = null;
      touch(m);
      go('live');
    };
  }

  // ---------- GARA IN CORSO ----------
  function renderLive(m) {
    const st = stateOf(m);
    const set = st.cur;
    if (!set || st.phase !== 'play') { go(viewFor(m)); return; }
    const S = st.settings;
    const L = set.left, Rt = other(L);
    const nx = R.nextServer(set);
    const total = set.score.A + set.score.B;
    const nextSwitch = set.switchEvery - (total % set.switchEvery);

    const panel = tm => {
      const serving = set.serving === tm;
      const to = set.timeouts[tm].length;
      const need = set.target - set.score[tm];
      const lead = set.score[tm] - set.score[other(tm)];
      const setPoint = set.score[tm] + 1 >= set.target && lead >= 1;
      return `<section class="team-panel team-${tm} ${serving ? 'serving' : ''}">
        <div class="tp-head"><span class="tp-letter">${tm}</span><span class="tp-name">${esc(teamName(m, tm))}</span>${jerseyName(m, tm) ? `<span class="tp-jersey">👕 ${esc(jerseyName(m, tm))}</span>` : ''}<span class="tp-sets" title="${esc(t('setsWon'))}">${st.setsWon[tm]}</span></div>
        <ul class="tp-players">${[0, 1].map(i => {
          const pIdx = set.order[tm][i];
          const pos = (tm === set.firstServing) ? (i === 0 ? 'I' : 'III') : (i === 0 ? 'II' : 'IV');
          const isSrv = serving && set.turn.player === pIdx;
          const isNext = !serving && nx.team === tm && nx.player === pIdx;
          return `<li class="${isSrv ? 'srv' : ''} ${isNext ? 'next' : ''}"><span class="pos">${pos}</span>${isSrv ? `<span class="ball" aria-label="${esc(t('serving'))}">🏐</span>` : ''}${esc(playerLabel(m, tm, pIdx))}${isNext ? `<small> ${t('next')}</small>` : ''}</li>`;
        }).join('')}</ul>
        <button class="score-btn" data-point="${tm}" aria-label="${esc(t('pointTo', { t: teamName(m, tm) }))}">
          <span class="score">${set.score[tm]}</span>
          <span class="plus">${t('plusPoint')}</span>
        </button>
        <div class="tp-foot">
          <button class="btn to-btn" data-to="${tm}" ${to >= S.timeoutsPerSet ? 'disabled' : ''}>${t('timeout')} ${to >= S.timeoutsPerSet ? t('timeoutUsed') : ''}</button>
          ${setPoint ? `<span class="badge warn">${t('setPoint')}</span>` : need > 0 ? `<span class="muted small">${t('toGo', { n: need })}</span>` : ''}
        </div>
      </section>`;
    };

    const recent = set.rallies.slice(-8).reverse();
    $app.innerHTML = `
      <div class="live">
        <div class="scorebar">
          <div><b>${t('setN', { n: set.index + 1 })}</b> <span class="muted">${t('toSet', { n: set.target })}</span></div>
          <div class="sets-won">${t('setsWonShort')} <b>${st.setsWon[L]}</b> – <b>${st.setsWon[Rt]}</b></div>
          <div class="muted small">${t('setStart', { t: hhmm(set.startTime) })} · ${nextSwitch === 1 ? t('switchIn1') : t('switchIn', { n: nextSwitch })}</div>
        </div>
        <div class="court">${panel(L)}<div class="net" aria-hidden="true"></div>${panel(Rt)}</div>
        <div class="toolbar">
          <button class="btn" id="undoBtn" ${m.events.length ? '' : 'disabled'}>${t('undo')}</button>
          <button class="btn" id="sanBtn">${t('sanction')}</button>
          <button class="btn" id="moreBtn">${t('more')}</button>
        </div>
        <div class="log card">
          <h3>${t('lastRallies')}</h3>
          ${recent.length ? `<ol>${recent.map(r => `<li><span class="lg-score">${r.score[L]}–${r.score[Rt]}</span> <span class="dot team-${r.winner}"></span> ${esc(teamName(m, r.winner))}${r.by === 'penalty' ? ` <span class="badge warn">${t('penaltyBadge')}</span>` : ''}${r.sideOut ? ` <span class="muted small">${t('sideOut')}</span>` : ''}</li>`).join('')}</ol>` : `<p class="muted small">${t('tapHint')}</p>`}
          ${set.timeouts.A.length || set.timeouts.B.length || set.sanctions.length ? `<p class="muted small">${['A', 'B'].map(tm => set.timeouts[tm].map(x => `${t('toShort')} ${esc(teamName(m, tm))} ${x.score[tm]}:${x.score[other(tm)]}`).join(' · ')).filter(Boolean).join(' · ')}
            ${set.sanctions.map(s => ` · ${t('sanShort_' + s.kind)} ${esc(teamName(m, s.team))}`).join('')}</p>` : ''}
        </div>
      </div>`;

    $app.querySelectorAll('[data-point]').forEach(b => b.onclick = () => {
      const now = Date.now();
      if (now - lastTap < 350) return; // evita doppi tocchi involontari
      lastTap = now;
      addEvent(m, { type: 'point', team: b.dataset.point });
    });
    $app.querySelectorAll('[data-to]').forEach(b => b.onclick = () => {
      const tm = b.dataset.to;
      confirmBox(t('timeoutTitle'), t('timeoutAsk', { t: esc(teamName(m, tm)) }), t('confirm'), () => addEvent(m, { type: 'timeout', team: tm }));
    });
    document.getElementById('undoBtn').onclick = () => undoLast(m);
    document.getElementById('sanBtn').onclick = () => sanctionDialog(m);
    document.getElementById('moreBtn').onclick = () => moreDialog(m);
  }

  function addEvent(m, e) {
    e.time = new Date().toISOString();
    m.events.push(e);
    touch(m);
    if (navigator.vibrate) navigator.vibrate(25);
    const st = stateOf(m);
    render();
    handleAlerts(m, st);
  }

  function handleAlerts(m, st) {
    const a = st.alerts;
    const has = type => a.find(x => x.type === type);
    const steps = [];
    if (has('timeout')) {
      const tm = has('timeout').team;
      steps.push(next => countdown(t('timeoutTitle'), esc(teamName(m, tm)), 30, `team-${tm}`, next));
    }
    if (has('switch')) {
      const s = has('switch').score;
      steps.push(next => {
        openOverlay(`<div class="big-alert switch"><h2>${t('switchTitle')}</h2><p class="huge">${s.A} – ${s.B}</p><p>${t('switchText')}</p><button class="btn primary wide" data-x autofocus>${t('ok')}</button></div>`, { cls: 'alert' });
        closeOverlay.queue = next;
        $overlay.querySelector('[data-x]').onclick = closeOverlay;
      });
    }
    if (has('tto')) steps.push(next => countdown(t('ttoTitle'), t('ttoSub'), 30, 'tto', next));
    const se = has('setEnd');
    if (se) {
      const set = st.sets[se.set];
      const matchEnd = has('matchEnd');
      steps.push(() => {
        openOverlay(`<div class="big-alert team-${se.winner}"><h2>${matchEnd ? t('matchEndTitle') : t('setEndTitle', { n: se.set + 1 })}</h2>
          <p class="huge">${set.score.A} – ${set.score.B}</p>
          <p>${matchEnd ? t('wins') : t('setTo')} <b>${esc(teamName(m, se.winner))}</b>${matchEnd ? ` ${st.setsWon[se.winner]}–${st.setsWon[other(se.winner)]}` : ''}</p>
          <div class="row center"><button class="btn ghost" data-undo>${t('undoPoint')}</button><button class="btn primary" data-ok autofocus>${t('confirm')}</button></div></div>`, { cls: 'alert', dismiss: false });
        $overlay.querySelector('[data-undo]').onclick = () => { closeOverlay(); undoLast(m, true); };
        $overlay.querySelector('[data-ok]').onclick = () => go(matchEnd ? 'end' : 'toss');
      });
    }
    const run = i => { if (i < steps.length) steps[i](() => run(i + 1)); };
    run(0);
  }

  function undoLast(m, silent) {
    if (m.approved || m.closedAt || !m.events.length) return;
    const e = m.events.pop();
    touch(m);
    ui.tossFor = null;
    if (!silent) toast(t('undone', { x: t('ev_' + e.type) + (e.team ? ' ' + teamName(m, e.team) : '') }));
    go(viewFor(m));
  }

  function sanctionDialog(m) {
    const sel = { team: null, player: null, kind: null };
    const draw = () => {
      openOverlay(`<h2>${t('sanTitle')}</h2>
        <div class="q"><h3>${t('team')}</h3><div class="opts">${['A', 'B'].map(tm => `<button class="opt team-${tm} ${sel.team === tm ? 'on' : ''}" data-team="${tm}">${esc(teamName(m, tm))}</button>`).join('')}</div></div>
        ${sel.team ? `<div class="q"><h3>${t('member')}</h3><div class="opts">${[0, 1].map(i => `<button class="opt ${sel.player === i ? 'on' : ''}" data-player="${i}">${esc(playerLabel(m, sel.team, i))}</button>`).join('')}
          ${m.teams[sel.team].coach ? `<button class="opt ${sel.player === 'C' ? 'on' : ''}" data-player="C">${t('coach')}</button>` : ''}
          <button class="opt ${sel.player === 'T' ? 'on' : ''}" data-player="T">${t('team')}</button></div></div>` : ''}
        <div class="q"><h3>${t('type')}</h3><div class="opts col">${Object.entries(R.SANCTIONS).map(([k, v]) => `<button class="opt ${sel.kind === k ? 'on' : ''}" data-kind="${k}">${t('san_' + k)}${v.point ? ` <small>${t('pointToOpp')}</small>` : ''}</button>`).join('')}</div></div>
        <div class="row end"><button class="btn ghost" data-x>${t('cancel')}</button><button class="btn primary" data-ok ${sel.team && sel.player !== null && sel.kind ? '' : 'disabled'}>${t('record')}</button></div>`);
      $overlay.querySelectorAll('[data-team]').forEach(b => b.onclick = () => { sel.team = b.dataset.team; draw(); });
      $overlay.querySelectorAll('[data-player]').forEach(b => b.onclick = () => { const v = b.dataset.player; sel.player = /^\d$/.test(v) ? +v : v; draw(); });
      $overlay.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { sel.kind = b.dataset.kind; draw(); });
      $overlay.querySelector('[data-x]').onclick = closeOverlay;
      $overlay.querySelector('[data-ok]').onclick = () => {
        const heavy = sel.kind === 'E' || sel.kind === 'D';
        const doIt = () => { closeOverlay(); addEvent(m, { type: 'sanction', team: sel.team, player: sel.player, kind: sel.kind }); };
        if (heavy) confirmBox(t('heavyConfirm'), t(sel.kind === 'E' ? 'heavyE' : 'heavyD', { s: t('san_' + sel.kind), t: esc(teamName(m, sel.team)) }), t('confirm'), doIt, true);
        else doIt();
      };
    };
    draw();
  }

  function moreDialog(m) {
    openOverlay(`<h2>${t('moreTitle')}</h2>
      <div class="opts col">
        <button class="opt" data-a="edit">${t('editMatch')}</button>
        <button class="opt" data-a="draft">${t('draftPdf')}</button>
        <button class="opt" data-a="forfeitA">${t('forfeitOf', { t: esc(teamName(m, 'A')) })}</button>
        <button class="opt" data-a="forfeitB">${t('forfeitOf', { t: esc(teamName(m, 'B')) })}</button>
        <button class="opt" data-a="home">${t('matchList')}</button>
      </div>
      <div class="row end"><button class="btn ghost" data-x>${t('close')}</button></div>`);
    $overlay.querySelector('[data-x]').onclick = closeOverlay;
    $overlay.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'edit') go('setup');
      else if (a === 'home') go('home', null);
      else if (a === 'draft') { closeOverlay(); makePdf(m, true); }
      else {
        const tm = a.slice(-1);
        openOverlay(`<h2>${t('forfeitTitle', { t: esc(teamName(m, tm)) })}</h2><p>${t('forfeitText')}</p>
          <div class="opts col"><button class="opt" data-r="INJ">${t('r_INJ')}</button><button class="opt" data-r="FFT">${t('r_FFT')}</button></div>
          <div class="row end"><button class="btn ghost" data-x>${t('cancel')}</button></div>`);
        $overlay.querySelector('[data-x]').onclick = closeOverlay;
        $overlay.querySelectorAll('[data-r]').forEach(r => r.onclick = () => { closeOverlay(); addEvent(m, { type: 'forfeit', team: tm, reason: r.dataset.r }); });
      }
    });
  }

  // ---------- FINE GARA / OMOLOGA ----------
  const SIGS = ['capA', 'capB', 'scorer', 'ref1'];

  function renderEnd(m) {
    const st = stateOf(m);
    const locked = !!(m.approved || m.closedAt);
    const dur = mins(st.startTime, st.endTime);
    const sigName = k => (k === 'capA' ? teamName(m, 'A') : k === 'capB' ? teamName(m, 'B') : k === 'scorer' ? m.officials.scorer : m.officials.ref1);
    $app.innerHTML = `
      <section class="card result">
        ${m.approved ? `<div class="stamp">${t('approvedStamp')}<br><small>${new Date(m.approved.time).toLocaleString(I18n.locale(), { hourCycle: 'h23' })}</small></div>`
          : m.closedAt ? `<div class="stamp pending">${t('pendingStamp')}</div>` : ''}
        ${m.link && m.approved ? `<p class="linked-note ok">✔ ${t('approvedByOrg')}</p>` : m.closedAt ? `<p class="linked-note">⏳ ${t('pendingText')}</p>` : ''}
        <h1>${t('finalResult')}</h1>
        <div class="final">
          <div class="team-A ${st.winner === 'A' ? 'win' : ''}"><span>${esc(teamName(m, 'A'))}</span><b>${st.setsWon.A}</b></div>
          <div class="team-B ${st.winner === 'B' ? 'win' : ''}"><span>${esc(teamName(m, 'B'))}</span><b>${st.setsWon.B}</b></div>
        </div>
        <table class="sets-table"><thead><tr><th>${t('thSet')}</th><th>A</th><th>B</th><th>${t('thStart')}</th><th>${t('thEnd')}</th><th>${t('thDuration')}</th></tr></thead><tbody>
          ${st.sets.map(s => `<tr><td>${s.index + 1}${s.awarded ? '*' : ''}</td><td>${s.score.A}</td><td>${s.score.B}</td><td>${hhmm(s.startTime)}</td><td>${hhmm(s.endTime)}</td><td>${mins(s.startTime, s.endTime) != null ? mins(s.startTime, s.endTime) + '′' : '—'}</td></tr>`).join('')}
        </tbody></table>
        <p class="muted small">${t('wins')}: <b>${esc(teamName(m, st.winner))}</b>${dur != null ? ` · ${t('matchDuration', { n: dur })}` : ''}${st.forfeit ? ` · ${t('r_' + st.forfeit.reason)} ${esc(teamName(m, st.forfeit.team))} ${t('awardedNote')}` : ''}</p>
        ${!locked ? `<div class="row"><button class="btn ghost" id="undoBtn">${t('undoLast')}</button><button class="btn ghost" id="editBtn">${t('editData')}</button></div>` : ''}
      </section>
      <section class="card">
        <h2>${t('remarks')}</h2>
        <textarea id="remarks" rows="3" placeholder="${esc(t('remarksPh'))}" ${locked ? 'readonly' : ''}>${esc(m.remarks)}</textarea>
      </section>
      <section class="card">
        <h2>${t('signatures')} <small class="muted">${t('optional')}</small></h2>
        <div class="sigs">${SIGS.map(k => `<div class="sig"><div class="sig-label">${t('sig_' + k)}${sigName(k) ? ' – ' + esc(sigName(k)) : ''}</div>
          <canvas data-sig="${k}" width="600" height="200"></canvas>
          ${!locked ? `<button class="link" data-clear="${k}">${t('clear')}</button>` : ''}</div>`).join('')}</div>
      </section>
      <section class="card actions-final">
        ${m.approved
          ? `<button class="btn primary big" id="pdfBtn">${t('downloadPdf')}</button>
             ${m.link ? '' : `<button class="btn big" id="newSameBtn">${t('newSame')}</button>`}`
          : m.closedAt ? `<button class="btn big" id="draftBtn">${t('draftPdf')}</button>`
          : `<button class="btn approve big" id="approveBtn">${m.link ? t('closeSendBtn') : t('approveBtn')}</button>
             <button class="btn" id="draftBtn">${t('draftPdf')}</button>`}
      </section>`;

    const rem = document.getElementById('remarks');
    if (!locked) rem.oninput = () => { m.remarks = rem.value; touch(m); };
    $app.querySelectorAll('canvas[data-sig]').forEach(c => setupSignature(c, m, locked));
    $app.querySelectorAll('[data-clear]').forEach(b => b.onclick = () => {
      delete m.signatures[b.dataset.clear]; touch(m);
      const c = $app.querySelector(`canvas[data-sig="${b.dataset.clear}"]`);
      c.getContext('2d').clearRect(0, 0, c.width, c.height);
    });
    const undo = document.getElementById('undoBtn');
    if (undo) undo.onclick = () => undoLast(m);
    const edit = document.getElementById('editBtn');
    if (edit) edit.onclick = () => go('setup');
    const draft = document.getElementById('draftBtn');
    if (draft) draft.onclick = () => makePdf(m, true);
    const ap = document.getElementById('approveBtn');
    if (ap && m.link) ap.onclick = () => confirmBox(t('closeSendTitle'),
      `<b>${esc(teamName(m, 'A'))} ${st.setsWon.A} – ${st.setsWon.B} ${esc(teamName(m, 'B'))}</b><br>(${st.sets.map(s => `${s.score.A}-${s.score.B}`).join(', ')})<br><br>${t('closeSendText')}`,
      t('closeSendBtn'), () => {
        m.remarks = rem.value;
        m.closedAt = new Date().toISOString();
        m.updated = new Date().toISOString();
        save();
        clearTimeout(sync.timer);
        pushNow(m).then(() => archivePdf(m));
        render();
        toast(t('sentToast'));
      });
    else if (ap) ap.onclick = () => confirmBox(t('approveTitle'),
      `<b>${esc(teamName(m, 'A'))} ${st.setsWon.A} – ${st.setsWon.B} ${esc(teamName(m, 'B'))}</b><br>(${st.sets.map(s => `${s.score.A}-${s.score.B}`).join(', ')})<br><br>${t('approveText')}`,
      t('approveBtn'), () => {
        m.remarks = rem.value;
        m.approved = { time: new Date().toISOString() };
        touch(m);
        render();
        toast(t('approvedToast'));
        makePdf(m, false);
      });
    const pdf = document.getElementById('pdfBtn');
    if (pdf) pdf.onclick = () => makePdf(m, false);
    const same = document.getElementById('newSameBtn');
    if (same) same.onclick = () => { const n = emptyMatch(m); db.matches[n.id] = n; save(); go('setup', n.id); };
  }

  function setupSignature(c, m, locked) {
    const k = c.dataset.sig;
    const ctx = c.getContext('2d');
    ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#123';
    if (m.signatures[k]) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height);
      img.src = m.signatures[k];
    }
    if (locked) return;
    let drawing = false;
    const pt = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
    c.onpointerdown = e => { drawing = true; c.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pt(e)); e.preventDefault(); };
    c.onpointermove = e => { if (!drawing) return; ctx.lineTo(...pt(e)); ctx.stroke(); };
    c.onpointerup = c.onpointercancel = () => {
      if (!drawing) return;
      drawing = false;
      m.signatures[k] = c.toDataURL('image/png');
      touch(m);
    };
  }

  function makePdf(m, draft) {
    toast(t('pdfMaking'));
    window.ScoresheetPDF.generate(m, stateOf(m), { draft, teamName: tm => teamName(m, tm), jersey: tm => jerseyName(m, tm) })
      .then(({ blob, name }) => download(blob, name))
      .catch(err => { console.error(err); toast(t('pdfError')); });
  }

  // ---------- avvio ----------
  document.getElementById('homeBtn').onclick = () => go('home', null);
  document.getElementById('langs').onclick = e => {
    const b = e.target.closest('[data-lang]');
    if (!b) return;
    I18n.set(b.dataset.lang);
    render();
  };
  window.addEventListener('beforeunload', save);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  // Aperto dal Championship Manager: ?g=<torneo>_<gara> (referto della gara) o ?archivio=<torneo>.
  const params = new URLSearchParams(location.search);
  const gid = params.get('g'), arch = params.get('archivio');
  const valid = v => v && /^[\w-]{1,120}$/.test(v);
  if (valid(gid) || valid(arch)) {
    // "casa" = pagina delle gare nel Championship Manager
    document.getElementById('homeBtn').onclick = () => {
      whenCloud().then(c => c.whoami()).then(w => { location.href = w && w.role === 'scorer' ? '../#/mine' : valid(arch) ? `../#/t/${arch}/calendar` : '../#/'; })
        .catch(() => { location.href = '../#/'; });
    };
    if (valid(arch) && params.get('build') === '1') { buildPdfs(arch); return; }
    if (valid(gid)) openSession(gid); else openArchive(arch);
    return;
  }
  // riapre la gara in corso più recente
  const live = Object.values(db.matches).filter(m => !m.approved && m.events.length && stateOf(m).phase !== 'matchEnd').sort((a, b) => b.updated.localeCompare(a.updated))[0];
  if (live) { ui.id = live.id; ui.view = viewFor(live); }
  render();
})();
