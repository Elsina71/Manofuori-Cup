// Interfaccia: routing, viste ed eventi.
(function () {
  'use strict';

  const S = () => Store.state;
  const t = (k, p) => I18n.t(k, p);
  const L = Logic;
  const $app = document.getElementById('app');
  const $dialog = document.getElementById('matchDialog');

  const ui = { rankGender: 'M', rankCat: '', editingPlayer: null, playerFilter: '', matchCtx: null, flash: null, openCat: null, busy: false };
  const admin = () => !!(window.Cloud && window.Cloud.isAdmin);
  // admin tornei (o generale): tornei, categorie e punti, giocatori, iscrizioni, referti e refertisti
  const tourAdmin = () => !!(window.Cloud && window.Cloud.tourAdmin);
  // cassa (o admin generale): incassi e ricevute
  const cashier = () => !!(window.Cloud && window.Cloud.cashier);
  // avviso della prima pagina: admin generale; avviso di un torneo: admin tornei
  // zona pericolosa (cancella tutti i dati): solo il Presidente
  const isOwner = () => admin() && !!(window.Cloud && window.Cloud.user && (window.Cloud.user.email || '').toLowerCase() === 'pierpaolomurgioni@gmail.com');
  const canNotice = scope => (scope === 'home' ? admin() : tourAdmin());
  // Account di un campo (refertista): vede "Le mie gare" e apre i referti elettronici.
  const scorer = () => (window.Cloud && !window.Cloud.isAdmin && window.Cloud.scorer) || null;
  // L'account del campo può essere legato a un solo torneo (scorer().tid); vuoto = tutti i tornei in corso.
  const scorerTour = tour => { const sc = scorer(); return !!sc && (!sc.tid || sc.tid === tour.id); };
  const sameCourt = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  let rankCache = {};
  let pendingRender = false;

  // ---------- helper ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const player = id => S().players.find(p => p.id === id);
  // Alias (nickname) assegnato dall'admin a un utente registrato (es. omonimi): sostituisce il nome ovunque.
  const nickOf = p => (p && p.uid && (S().nicks || {})[p.uid]) || '';
  const playerFull = p => p ? (nickOf(p) || `${p.last} ${p.first}`) : '?';
  const shortName = p => p ? (nickOf(p) || p.last) : '?';
  // Nome in grassetto (cognome) + nome; con l'alias, l'admin vede anche il nome vero.
  const nameHtml = p => {
    const n = nickOf(p);
    if (!n) return `<strong>${esc(p.last)}</strong> ${esc(p.first)}`;
    return `<strong>${esc(n)}</strong>${tourAdmin() ? ` <small class="muted">(${esc(p.last)} ${esc(p.first)})</small>` : ''}`;
  };
  const tourById = id => S().tournaments.find(x => x.id === id);
  const entryById = (tour, id) => tour.entries.find(x => x.id === id);
  const catById = id => S().categories.find(x => x.id === id);
  const sel = (a, b) => (String(a) === String(b) ? 'selected' : '');
  const genderLabel = g => (g === 'F' ? t('catWomen') : g === 'X' ? t('catMixed') : t('catMen'));
  // Genere dei due giocatori di una squadra: nei tornei misti il 1° è l'uomo e il 2° la donna.
  const teamGenders = tour => (tour.gender === 'X' ? ['M', 'F'] : [tour.gender, tour.gender]);
  const teamLabels = tour => (tour.gender === 'X' ? [t('male').toLowerCase(), t('female').toLowerCase()] : ['1', '2']);
  const medal = p => `<span class="medal ${p <= 3 ? 'm' + p : ''}">${p}</span>`;
  const fmtPts = n =>Number(n || 0).toLocaleString(I18n.locale(), { maximumFractionDigits: 2 });

  function teamName(tour, id) {
    if (id === L.BYE) return `<span class="muted">${esc(t('bye'))}</span>`;
    if (!id) return `<span class="muted">${esc(t('tbd'))}</span>`;
    const e = entryById(tour, id);
    if (!e) return '?';
    const a = player(e.p1), b = player(e.p2);
    return esc(`${shortName(a)} / ${shortName(b)}`);
  }

  function fmtDate(d) {
    if (!d) return '';
    const dt = new Date(d.slice(0, 10) + 'T12:00:00');
    return isNaN(dt) ? d : dt.toLocaleDateString(I18n.locale(), { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function fmtDateTime(v) {
    if (!v) return '';
    const [d, tm] = v.split('T');
    return fmtDate(d) + (tm ? ` · ${tm}` : '');
  }

  function fmtRange(a, b) {
    if (!a) return '';
    return b && b !== a.slice(0, 10) ? `${fmtDate(a)} – ${fmtDate(b)}` : fmtDate(a);
  }

  function rankMap(gender) {
    if (gender === 'X') return Object.assign({}, rankMap('M'), rankMap('F'));
    if (!rankCache[gender]) {
      rankCache[gender] = {};
      L.ranking(S(), gender, null).forEach(r => { rankCache[gender][r.id] = r.total; });
    }
    return rankCache[gender];
  }

  function commit(msg) {
    Store.save();
    if (msg) ui.flash = typeof msg === 'string' ? { text: msg } : msg;
    render();
  }

  function warn(key, params) {
    ui.flash = { type: 'warn', text: t(key, params) };
    render();
  }

  // Il messaggio resta qualche secondo sulla pagina in cui compare, anche se nel frattempo arrivano
  // aggiornamenti dal database che la ridisegnano; cambiando pagina sparisce.
  function flashHtml() {
    const f = ui.flash;
    if (!f) return '';
    if (!f.shownAt) { f.shownAt = Date.now(); f.hash = location.hash; }
    else if (f.hash !== location.hash || Date.now() - f.shownAt > 5000) { ui.flash = null; return ''; }
    return `<div class="flash ${f.type || 'ok'}" role="status">${esc(f.text)}</div>`;
  }

  function roundLabel(teamsInRound) {
    if (teamsInRound === 2) return t('final');
    if (teamsInRound === 4) return t('semifinal');
    if (teamsInRound === 8) return t('quarterfinal');
    return t('roundOf', { n: teamsInRound });
  }

  function formatSummary(tour) {
    const c = tour.config;
    const sets = c.setsToWin === 1 ? t('setsSingle', { p: c.setPoints })
      : t('setsBestOf', { n: 2 * c.setsToWin - 1, p: c.setPoints, tb: c.tiebreakPoints });
    if (tour.format === 'gold_silver') return `${t('fmt_gold_silver')} · ${t('gsInfo', { p: L.gsSizes(tour, c.mainSize).length, g: c.goldSpots })} · ${sets}`;
    return `${t('fmt_' + tour.format)} · ${sets}`;
  }

  // Numero di gara (G1, G2... tabellone principale; Q1, Q2... qualifiche), fisso dalla creazione del torneo.
  let numCache = {};
  function nums(tour) {
    if (!numCache[tour.id]) numCache[tour.id] = L.numbering(tour);
    return numCache[tour.id];
  }
  function gNo(tour, m) { return nums(tour)[m.key] || ''; }
  // Gold & Silver: l'admin può cambiare il numero delle gare (G…).
  const gsNoEditable = (tour, m) => tourAdmin() && tour.format === 'gold_silver' && /^G\d+$/.test(gNo(tour, m));
  const gCount = tour => Object.values(nums(tour)).filter(v => v[0] === 'G').length;

  // Nome della squadra o, se non ancora nota, il segnaposto ("A1", "Vincente G19", "Perdente G20").
  function slotName(tour, m, side) {
    const id = side ? m.b : m.a;
    if (id) return teamName(tour, id);
    const ph = L.placeholder(tour, m, side, nums(tour));
    if (!ph) return teamName(tour, id);
    const txt = ph.text || t(ph.kind, { g: ph.no || '?' });
    return `<span class="muted ph">${esc(txt)}</span>`;
  }

  // Etichetta della fase di una partita (calendario e finestra del risultato).
  function phaseLabel(tour, m) {
    switch (m.stage) {
      case 'qual': return `${t('qualification')} · ${m.round === m.rounds - 1 ? t('qualDecisive') : t('qualRound', { n: m.round + 1 })}`;
      case 'pool': { const pn = m.poolName != null ? m.poolName : tour.pools[m.pool].name; return `${pn ? t('pool') + ' ' + pn : t('singlePool')} · ${m.label ? t('fivb_' + m.label) : 'R' + m.round}`; }
      case 'ko': return (tour.format === 'gold_silver' ? 'Gold · ' : '') + roundLabel((m.size || tour.bracket.size) / 2 ** m.round);
      case 'third': return (tour.format === 'gold_silver' ? 'Gold · ' : '') + t('thirdPlace');
      case 'silver': return 'Silver · ' + roundLabel((m.size || (tour.silver && tour.silver.size) || 16) / 2 ** m.round);
      case 'silver3': return 'Silver · ' + t('thirdPlace');
      case 'wb': return `${t('winnersBracket')} · ${m.round === m.rounds - 1 ? t('final') : t('roundN', { n: m.round + 1 })}`;
      case 'lb': return `${t('losersBracket')} · ${m.round === m.rounds - 1 ? t('final') : t('roundN', { n: m.round + 1 })}`;
      case 'gf': return t('grandFinal');
      default: return '';
    }
  }

  // ---------- routing ----------
  function route() {
    return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  }

  function render() {
    rankCache = {};
    numCache = {};
    pendingRender = false;
    if (!Store.ready) {
      $app.innerHTML = flashHtml() + `<div class="empty"><i class="ti ti-loader-2" aria-hidden="true"></i> ${esc(t('loading'))}</div>`;
      updateChrome('tournaments');
      return;
    }
    const r = route();
    if (window.Cloud && window.Cloud.watchLive) {
      window.Cloud.watchLive(r[0] === 't' && tourById(r[1]) ? r[1] : r[0] === 'mine' && scorer() ? mineTours().map(x => x.id) : null);
      window.Cloud.watchReferti(r[0] === 't' && r[2] === 'referti' && tourById(r[1]) ? r[1] : null);
    }
    const tourOnly = r[0] === 'players' || r[0] === 'new' || (r[0] === 't' && (r[2] === 'manage' || r[2] === 'edit'));
    if (tourOnly && !tourAdmin()) { location.hash = '#/'; return; }
    const adminOnly = r[0] === 'messages' || r[0] === 'users' || r[0] === 'courts' || r[0] === 'athletes' || r[0] === 'payments';
    if (adminOnly && !admin()) { location.hash = '#/'; return; }
    let nav = 'tournaments', html;
    const loadingHtml = `<div class="empty"><i class="ti ti-loader-2" aria-hidden="true"></i> ${esc(t('loading'))}</div>`;
    // Ranking, giocatori e tornei non ancora caricati richiedono anche i tornei passati.
    const wantsPast = r[0] === 'ranking' || r[0] === 'p' || r[0] === 'me' || (r[0] === 't' && !tourById(r[1]));
    if (wantsPast && needPast()) { $app.innerHTML = flashHtml() + loadingHtml; updateChrome(r[0] === 't' ? 'tournaments' : 'ranking'); return; }
    if (r[0] === 'players') { nav = 'players'; html = viewPlayers(); }
    else if (r[0] === 'p' && player(r[1])) { nav = 'ranking'; html = viewPlayer(player(r[1])); }
    else if (r[0] === 'categories') { nav = 'categories'; html = viewCategories(); }
    else if (r[0] === 'ranking') { nav = 'ranking'; html = viewRanking(); }
    else if (r[0] === 'settings') { nav = 'settings'; html = viewSettings(); }
    else if (r[0] === 'mine') { nav = 'mine'; html = viewMine(); }
    else if (r[0] === 'new') { html = viewNewTournament(); }
    else if (r[0] === 't' && tourById(r[1])) { html = viewTournament(tourById(r[1]), r[2]); }
    else if (r[0] === 'tournaments') { html = viewHome(); }
    else if (r[0] === 'me') { nav = 'me'; html = viewProfile(); }
    else if (r[0] === 'book') { nav = 'book'; html = viewBook(); }
    else if (r[0] === 'challenges') { nav = 'challenges'; html = viewChallenges(); }
    else if (r[0] === 'free') { nav = 'free'; html = viewFreeplay(); }
    else if (r[0] === 'train') { nav = 'train'; html = viewTraining(); }
    else if (r[0] === 'privacy' || r[0] === 'cookie' || r[0] === 'termini') { nav = 'settings'; html = viewLegal(r[0]); }
    else if (r[0] === 'athletes' && admin()) { nav = 'train'; html = viewAthletes(); }
    else if (r[0] === 'payments' && admin()) { nav = 'settings'; html = viewPayments(); }
    else if (r[0] === 'report' && admin()) { nav = 'train'; html = viewReport(); }
    else if (r[0] === 'cassa' && cashier()) { nav = 'cassa'; html = viewCassa(); }
    else if (r[0] === 'courts' && admin()) { nav = 'book'; html = viewCourts(); }
    else if (r[0] === 'messages' && admin()) { nav = 'settings'; html = viewMessages(); }
    else if (r[0] === 'users' && admin()) { nav = 'settings'; html = viewUsers(); }
    else if (r[0] === 'a' && (r[1] === '1' || r[1] === '2')) { nav = 'home'; html = viewArticle(+r[1] - 1); }
    else { nav = 'home'; html = viewFeatured(); }
    $app.innerHTML = flashHtml() + html;
    $app.querySelectorAll('form[data-form^="tournament-"]').forEach(syncTournamentForm);
    updateChrome(nav);
    fitEditorial();
  }

  function updateChrome(nav) {
    document.documentElement.lang = I18n.lang;
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === nav));
    document.querySelectorAll('.langs [data-lang]').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === I18n.lang));
    document.querySelectorAll('[data-admin-only]').forEach(el => { el.hidden = !admin(); });
    document.querySelectorAll('[data-tour-only]').forEach(el => { el.hidden = !tourAdmin(); });
    document.querySelectorAll('[data-cash-only]').forEach(el => { el.hidden = !cashier(); });
    document.querySelectorAll('[data-staff-badge]').forEach(el => { el.hidden = !(admin() || tourAdmin() || cashier()); const l = el.querySelector('.lbl'); if (l) l.textContent = ' ' + (admin() ? 'Admin' : [tourAdmin() ? t('roleTourShort') : '', cashier() ? t('roleCashShort') : ''].filter(Boolean).join(' · ')); });
    document.querySelectorAll('[data-guest-only]').forEach(el => { el.hidden = admin() || !!scorer() || !!member(); });
    document.querySelectorAll('[data-member-only]').forEach(el => { el.hidden = !member(); });
    document.querySelectorAll('[data-scorer-only]').forEach(el => { el.hidden = !scorer(); });
    document.querySelectorAll('[data-train-only]').forEach(el => { el.hidden = !(admin() || coach()); });
    // banner dei cookie: finché non si sceglie (o se si riapre dalle "Preferenze cookie")
    const bar = document.getElementById('cookieBar');
    if (bar) bar.hidden = Consent.decided() && !ui.cookieOpen;
  }

  // Banner cookie: Accetta tutti, Rifiuta (solo necessari), Personalizza. "Preferenze cookie" nel piè di pagina lo riapre.
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-consent]');
    if (!b) return;
    e.preventDefault();
    const bar = document.getElementById('cookieBar'), what = b.dataset.consent;
    if (what === 'open') { ui.cookieOpen = true; bar.hidden = false; const c = bar.querySelector('#ckPrefs'); if (c) c.checked = Consent.prefs(); return; }
    if (what === 'custom') { bar.classList.add('custom'); const c = bar.querySelector('#ckPrefs'); if (c) c.checked = Consent.prefs(); return; }
    const prefs = what === 'all' ? true : what === 'none' ? false : !!(bar.querySelector('#ckPrefs') || {}).checked;
    const before = Consent.prefs();
    Consent.set(prefs);
    // con il consenso si salvano le scelte già fatte in questa visita
    if (prefs) { Consent.write('pcm-lang', I18n.lang); if (ui.theme) Consent.write(THEME_KEY, ui.theme); if (ui.design) Consent.write(DESIGN_KEY, ui.design); }
    ui.cookieOpen = false; bar.classList.remove('custom'); bar.hidden = true;
    ui.flash = { text: t(prefs ? 'ckSavedYes' : 'ckSavedNo') + (prefs !== before ? ' ' + t('ckNextOpen') : '') };
    render();
  });

  // Aggiornamento dal database: se l'utente sta scrivendo in un campo, o ha un modulo compilato a metà
  // (modificato negli ultimi 2 minuti e non ancora inviato), si aspetta per non perdere quello che ha scritto.
  function isTyping() {
    const a = document.activeElement;
    if ($dialog.open || (a && a !== document.body && a.matches('input, select, textarea') && $app.contains(a))) return true;
    return [...$app.querySelectorAll('form[data-dirty]')].some(f => Date.now() - Number(f.dataset.dirty) < 120000);
  }
  ['input', 'change'].forEach(ev => document.addEventListener(ev, e => {
    const f = e.target.closest && e.target.closest('form');
    if (f && $app.contains(f) && !e.target.matches('[type=search]')) f.dataset.dirty = Date.now();
  }, true));
  // aggiornamenti rimandati: appena non si sta più compilando nulla
  setInterval(() => { if (pendingRender && !isTyping()) render(); }, 3000);

  // Correzione una tantum (solo admin): gironi da 3 e da 4 tutti contro tutti con il calendario precedente.
  function migrateRR4() {
    if (!tourAdmin() || !Store.ready || !window.Cloud || !window.Cloud.matchDocKeys) return;
    ui.rr4 = ui.rr4 || {};   // tornei già controllati in questa sessione
    S().tournaments.filter(tr => tr.pools && !ui.rr4[tr.id] && tr.pools.some(p => p.mode !== 'fivb' && tr.format !== 'fivb_pools' && (p.teamIds.length === 3 || p.teamIds.length === 4))).forEach(tr => {
      ui.rr4[tr.id] = true;
      window.Cloud.matchDocKeys(tr.id).then(keys => {
        const cur = tourById(tr.id);
        if (cur && L.fixRR4(cur, k => !!(cur.results && cur.results[k]) || keys.has(k))) commit();
      }).catch(() => { ui.rr4[tr.id] = false; });
    });
  }

  function refresh() {
    if (ui.afterLogin && scorer()) { ui.afterLogin = false; if (location.hash !== '#/mine') { location.hash = '#/mine'; return; } }
    migrateRR4();
    if (isTyping()) { pendingRender = true; return; }
    render();
  }

  document.addEventListener('focusout', () => {
    setTimeout(() => { if (pendingRender && !isTyping()) render(); }, 400);
  });
  $dialog.addEventListener('close', () => { if (pendingRender) render(); });

  // ---------- avvisi per i visitatori (prima pagina e pagina di ogni torneo) ----------
  function richText(s) {
    return esc(s)
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
      .replace(/\n/g, '<br>');
  }

  const todayStr = () => new Date().toLocaleDateString('sv');   // AAAA-MM-GG, ora locale

  // Tornei passati: caricati dal database solo quando servono (elenco dei passati, ranking, giocatori).
  function needPast() {
    const c = window.Cloud;
    if (!c || !c.loadPast || c.pastLoaded) return false;
    c.loadPast();
    return true;
  }
  // Torneo terminato: passata la data di fine (o di inizio, se manca la fine).
  const tourEnded = tour => { const d = (tour.end || tour.start || '').slice(0, 10); return !!d && d < todayStr(); };

  // scope: 'home' oppure l'id del torneo; until: data di scadenza dell'avviso generale (facoltativa)
  function noticeBox(scope, text, until) {
    const editing = canNotice(scope) && ui.editNotice === scope;
    const expired = scope === 'home' && until && until < todayStr();
    if (editing) {
      return `<form class="card notice-box editing" data-form="notice-save" data-scope="${esc(scope)}">
        <h2><i class="ti ti-info-circle" aria-hidden="true"></i> ${esc(t('noticeTitle'))}</h2>
        <textarea name="text" rows="5" maxlength="4000" placeholder="${esc(t('noticePlaceholder'))}">${esc(text || '')}</textarea>
        <p class="muted small">${esc(t('noticeHelp'))}</p>
        ${scope === 'home' ? `<label class="until">${esc(t('noticeUntil'))}<input type="date" name="until" value="${esc(until || '')}">
          <small class="muted">${esc(t('noticeUntilHelp'))}</small></label>` : ''}
        <div class="form-actions">
          <button type="button" class="btn" data-action="notice-cancel">${esc(t('cancel'))}</button>
          ${text ? `<button type="button" class="btn danger" data-action="notice-clear" data-scope="${esc(scope)}">${esc(t('noticeClear'))}</button>` : ''}
          <button class="btn primary">${esc(t('save'))}</button>
        </div>
      </form>`;
    }
    if (!text) {
      return canNotice(scope) ? `<button class="notice-add" data-action="notice-edit" data-scope="${esc(scope)}"><i class="ti ti-speakerphone" aria-hidden="true"></i> ${esc(t('noticeAdd'))}</button>` : '';
    }
    if (expired && !canNotice(scope)) return '';
    return `<div class="notice-box ${expired ? 'expired' : ''}" role="note">
      <div class="notice-head"><h2><i class="ti ti-info-circle" aria-hidden="true"></i> ${esc(t('noticeTitle'))}
          ${until ? `<span class="badge">${esc(t(expired ? 'noticeExpired' : 'noticeVisibleUntil', { d: fmtDate(until) }))}</span>` : ''}</h2>
        ${canNotice(scope) ? `<button class="btn small" data-action="notice-edit" data-scope="${esc(scope)}"><i class="ti ti-pencil" aria-hidden="true"></i> ${esc(t('edit'))}</button>` : ''}</div>
      <div class="notice-text">${richText(text)}</div>
    </div>`;
  }

  // Spazi editoriali della prima pagina (due articoli con foto, titolo e testo), modificabili dall'admin.
  const safePhoto = p => (typeof p === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p) ? p : '');

  function editorialSection() {
    const items = S().editorial || [];
    const cards = [0, 1].map(i => editorialCard(i, items[i])).filter(Boolean);
    return cards.length ? `<section class="editorial" aria-label="${esc(t('edSection'))}">${cards.join('')}</section>` : '';
  }

  function editorialForm(i, a) {
    const photo = safePhoto(a.photo);
    return `<form class="card editorial-form" data-form="editorial-save" data-idx="${i}">
        <h2><i class="ti ti-article" aria-hidden="true"></i> ${esc(t('edSlot', { n: i + 1 }))}</h2>
        ${photo ? `<img class="ed-preview" src="${photo}" alt="">
        <label class="check"><input type="checkbox" name="removePhoto"> ${esc(t('edRemovePhoto'))}</label>` : ''}
        <label>${esc(t(photo ? 'edPhotoChange' : 'edPhoto'))}<input type="file" name="photo" accept="image/*"></label>
        <p class="muted small">${esc(t('edPhotoHelp'))}</p>
        <label>${esc(t('edTitle'))}<input name="title" maxlength="120" value="${esc(a.title || '')}"></label>
        <label>${esc(t('edText'))}<textarea name="text" rows="8" maxlength="6000">${esc(a.text || '')}</textarea></label>
        <p class="muted small">${esc(t('edTextHelp'))}</p>
        <p class="error" data-ed-err role="alert"></p>
        <div class="form-actions">
          <button type="button" class="btn" data-action="editorial-cancel">${esc(t('cancel'))}</button>
          ${a.title || a.text || photo ? `<button type="button" class="btn danger" data-action="editorial-clear" data-idx="${i}">${esc(t('edClear'))}</button>` : ''}
          <button class="btn primary">${esc(t('save'))}</button>
        </div>
      </form>`;
  }

  const edEmpty = a => !a || (!a.title && !a.text && !safePhoto(a.photo));

  // Scheda a dimensione fissa e identica per i due spazi: il testo che non ci sta finisce con "…"
  // e compare "Visualizza l'articolo" (pagina autonoma #/a/1 o #/a/2).
  function editorialCard(i, a) {
    a = a || {};
    if (admin() && ui.editEditorial === i) return editorialForm(i, a);
    if (edEmpty(a)) {
      return admin() ? `<button class="editorial-add" data-action="editorial-edit" data-idx="${i}"><i class="ti ti-article" aria-hidden="true"></i> ${esc(t('edAdd', { n: i + 1 }))}</button>` : '';
    }
    const photo = safePhoto(a.photo);
    return `<article class="card editorial-card">
      <a class="ed-photo ${photo ? '' : 'no-photo'}" href="#/a/${i + 1}" tabindex="-1" aria-hidden="true">${photo ? `<img src="${photo}" alt="" loading="lazy">` : '<i class="ti ti-article"></i>'}</a>
      <div class="ed-body">
        ${a.title ? `<h2><a href="#/a/${i + 1}">${esc(a.title)}</a></h2>` : ''}
        <div class="ed-text">${richText(a.text || '')}</div>
        <div class="ed-foot">
          <a class="ed-more" href="#/a/${i + 1}" hidden>${esc(t('edReadMore'))} →</a>
          ${admin() ? `<button class="btn small" data-action="editorial-edit" data-idx="${i}"><i class="ti ti-pencil" aria-hidden="true"></i> ${esc(t('edit'))}</button>` : ''}
        </div>
      </div>
    </article>`;
  }

  // Mostra "Visualizza l'articolo" solo dove titolo o testo sono stati tagliati.
  function fitEditorial() {
    document.querySelectorAll('.editorial-card').forEach(card => {
      const cut = [...card.querySelectorAll('.ed-text, .ed-body h2')].some(el => el.scrollHeight > el.clientHeight + 2);
      const more = card.querySelector('.ed-more');
      if (more) more.hidden = !cut;
    });
  }
  window.addEventListener('resize', () => fitEditorial());

  // Pagina autonoma di un articolo.
  function viewArticle(i) {
    const a = (S().editorial || [])[i];
    const back = `<a class="back" href="#/">← ${esc(t('navHome'))}</a>`;
    if (admin() && ui.editEditorial === i) return `<div class="page-head">${back}</div>${editorialForm(i, a || {})}`;
    if (edEmpty(a)) return `<div class="page-head">${back}</div><div class="empty">${esc(t('edNotFound'))}</div>`;
    const photo = safePhoto(a.photo);
    return `<article class="article-page">
      <div class="page-head">${back}</div>
      ${photo ? `<img class="article-photo" src="${photo}" alt="">` : ''}
      <div class="card article-body">
        ${a.title ? `<h1>${esc(a.title)}</h1>` : ''}
        <div class="article-text">${richText(a.text || '')}</div>
        ${admin() ? `<div class="btn-row"><button class="btn small" data-action="editorial-edit" data-idx="${i}"><i class="ti ti-pencil" aria-hidden="true"></i> ${esc(t('edit'))}</button></div>` : ''}
      </div>
    </article>`;
  }

  // ---------- pagina "In evidenza" ----------
  function rankTop(gender) {
    const rows = L.ranking(S(), gender, null).filter(r => r.total > 0 || r.events > 0).slice(0, 20);
    const list = rows.map((r, i) => { const p = player(r.id); return p ? `<tr class="${i < 3 ? 'podium' : ''}">
        <td class="num">${medal(i + 1)}</td><td><a href="#/p/${p.id}">${nameHtml(p)}</a> ${rewardBadge(playedCount(p.id))}</td>
        <td class="num"><strong>${fmtPts(r.total)}</strong></td></tr>` : ''; }).join('');
    return `<div class="card rank-top">
      <h3><span class="badge g-${gender}">${esc(genderLabel(gender))}</span></h3>
      ${list ? `<div class="table-wrap"><table class="table"><tbody>${list}</tbody></table></div>` : `<p class="muted small">${esc(t('noRankingYet'))}</p>`}
    </div>`;
  }

  function viewFeatured() {
    const active = S().tournaments.filter(tr => !tourEnded(tr)).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    const pastReady = !needPast();
    return `
      ${admin() && homonymPending().length ? `<div class="msg-alert" role="alert"><div class="msg-head"><strong><i class="ti ti-users" aria-hidden="true"></i> ${esc(t('homonym'))}</strong></div>
        <div class="msg-text">${esc(t('homonymWarn'))}</div><a class="btn small" href="#/users">${esc(t('usersOpen'))} →</a></div>` : ''}
      ${privacyAlert()}
      ${messageAlerts()}
      ${trainingAlerts()}
      ${certAlerts()}
      ${bkReminderAlerts()}
      ${bookingAlerts()}
      ${challengeAlerts()}
      ${partnerAlerts()}
      ${verifyNotice()}
      ${noticeBox('home', S().notice, S().noticeUntil)}
      ${tourNoticesHome()}
      <div class="theme-hero" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <h1 class="sr-only">${esc(t('navHome'))}</h1>
      ${editorialSection()}
      ${spotSection(true)}
      <section class="feat-block">
        <div class="page-head row"><h2><i class="ti ti-trophy" aria-hidden="true"></i> ${esc(t('activeTournaments'))}</h2>
          <a class="btn small" href="#/tournaments">${esc(t('allTournaments'))} →</a></div>
        ${active.length ? `<div class="cards">${active.map(tourCard).join('')}</div>`
          : `<div class="empty">${esc(t(admin() ? 'noTournamentsAdmin' : 'noUpcomingTournaments'))}</div>`}
      </section>
      ${freeplayHome()}
      <section class="feat-block">
        <div class="page-head row"><h2><i class="ti ti-chart-bar" aria-hidden="true"></i> ${esc(t('rankingTop'))}</h2>
          <a class="btn small" href="#/ranking">${esc(t('seeFullRanking'))} →</a></div>
        ${pastReady ? `<div class="rank-top-grid">${rankTop('M')}${rankTop('F')}</div>`
          : `<div class="empty"><i class="ti ti-loader-2" aria-hidden="true"></i> ${esc(t('loading'))}</div>`}
        <div class="next-step center"><a class="btn primary" href="#/ranking">${esc(t('seeFullRanking'))} →</a></div>
      </section>`;
  }

  // Foto ridimensionata nel browser (max 1200 px, JPEG) perché stia comodamente nel database.
  async function shrinkPhoto(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
      let w = Math.min(1200, img.naturalWidth), q = .82, out = '';
      for (let k = 0; k < 8; k++) {
        const c = document.createElement('canvas');
        c.width = w; c.height = Math.round(img.naturalHeight * w / img.naturalWidth);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        out = c.toDataURL('image/jpeg', q);
        if (out.length < 600000) return out;
        if (q > .55) q -= .1; else w = Math.round(w * .8);
      }
      throw new Error('too-big');
    } finally { URL.revokeObjectURL(url); }
  }

  async function saveEditorialForm(f) {
    const i = +f.dataset.idx, cur = (S().editorial || [])[i] || {};
    const err = f.querySelector('[data-ed-err]');
    let photo = safePhoto(cur.photo);
    if (f.removePhoto && f.removePhoto.checked) photo = '';
    const file = f.photo.files && f.photo.files[0];
    if (file) {
      err.textContent = t('edPhotoWorking');
      try { photo = await shrinkPhoto(file); } catch (e) { err.textContent = t('errPhoto'); return; }
    }
    const data = { title: f.title.value.trim(), text: f.text.value.trim(), photo };
    const empty = !data.title && !data.text && !data.photo;
    S().editorial = (S().editorial || [null, null]).slice();
    S().editorial[i] = empty ? null : data;
    ui.editEditorial = null;
    if (window.Cloud && window.Cloud.saveEditorial) window.Cloud.saveEditorial(i, empty ? null : data).catch(e => App.error(e.code || e.message));
    ui.flash = { text: t('saved') };
    render();
  }

  // Avvisi dei tornei mostrati anche in prima pagina finché il torneo non è terminato.
  function tourNoticesHome() {
    const list = S().tournaments.filter(tr => tr.notice && !tourEnded(tr))
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    return list.map(tr => `<div class="notice-box tour-notice" role="note">
      <div class="notice-head"><h2><i class="ti ti-trophy" aria-hidden="true"></i> <a href="#/t/${tr.id}/info">${esc(tr.name)}</a></h2>
        <span class="muted small">${esc(fmtRange(tr.start, tr.end))}</span></div>
      <div class="notice-text">${richText(tr.notice)}</div>
    </div>`).join('');
  }

  // ---------- elenco tornei ----------
  function viewHome() {
    // In corso e futuri: dal più vicino; passati: dal più recente. I passati si mostrano solo a richiesta.
    const current = S().tournaments.filter(tr => !tourEnded(tr)).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    const past = S().tournaments.filter(tourEnded).sort((a, b) => (b.start || '').localeCompare(a.start || ''));
    const pastReady = !window.Cloud || !window.Cloud.loadPast || window.Cloud.pastLoaded;
    let pastBlock = '';
    if (ui.showPast) {
      pastBlock = `<div class="page-head row past-head"><h2><i class="ti ti-history" aria-hidden="true"></i> ${esc(t('pastTournaments'))}</h2>
          <button class="btn small" data-action="toggle-past">${esc(t('hidePast'))}</button></div>
        ${!pastReady ? `<div class="empty"><i class="ti ti-loader-2" aria-hidden="true"></i> ${esc(t('loading'))}</div>`
          : past.length ? `<div class="cards past">${past.map(tourCard).join('')}</div>` : `<p class="muted">${esc(t('noPastTournaments'))}</p>`}`;
    } else {
      pastBlock = `<div class="next-step center"><button class="btn" data-action="toggle-past"><i class="ti ti-history" aria-hidden="true"></i> ${esc(t('showPast'))}${pastReady && past.length ? ` (${past.length})` : ''}</button></div>`;
    }
    return `
      <div class="page-head row">
        <h1>${esc(t('tournaments'))}</h1>
        ${tourAdmin() ? `<a class="btn primary" href="#/new"><i class="ti ti-plus" aria-hidden="true"></i> ${esc(t('newTournament'))}</a>` : ''}
      </div>
      <p class="muted small">${esc(t('currentAndUpcoming'))}</p>
      ${current.length ? `<div class="cards">${current.map(tourCard).join('')}</div>`
        : `<div class="empty">${esc(t(tourAdmin() ? 'noTournamentsAdmin' : 'noUpcomingTournaments'))}</div>`}
      ${pastBlock}`;
  }

  function tourProgress(tour) {
    const ms = L.allMatches(tour).filter(m => !m.bye);
    if (!ms.length) return '';
    const done = ms.filter(m => m.stats).length;
    return `<div class="tc-progress"><span class="bar"><span style="width:${Math.round(done / ms.length * 100)}%"></span></span>
      <small>${esc(t('matchesClosed', { done, total: ms.length }))}</small></div>`;
  }

  function tourCard(tour) {
    const st = L.status(tour);
    const cat = catById(tour.categoryId);
    return `
      <a class="card tour-card" href="#/t/${tour.id}">
        <div class="tour-card-top">
          <span class="badge g-${tour.gender}">${esc(genderLabel(tour.gender))}</span>
          ${cat ? `<span class="badge cat">${esc(cat.name)}</span>` : ''}
          <span class="badge st-${st}">${esc(t('st_' + st))}</span>
        </div>
        ${tourFlag(tour)}
        <h3>${esc(tour.name)}</h3>
        <p class="muted"><i class="ti ti-calendar" aria-hidden="true"></i> ${esc(fmtRange(tour.start, tour.end))}${tour.location ? ` &nbsp;<i class="ti ti-map-pin" aria-hidden="true"></i> ${esc(tour.location)}` : ''}</p>
        ${regPhase(tour) && regPhase(tour) !== 'formula' ? regLine(tour) : `<p class="muted small">${esc(formatSummary(tour))}</p>
        <p class="muted small"><i class="ti ti-users" aria-hidden="true"></i> ${tour.entries.length} ${esc(t('teamsCount'))} · ${esc(t('coefficient'))} ×${esc(fmtPts(tour.coefficient))}</p>`}
        ${tourProgress(tour)}
      </a>`;
  }

  // Segnale di stato nel riquadro del torneo: iscrizioni aperte (stellina verde lampeggiante),
  // iscrizioni chiuse (stellina rossa), gare create (scritta lampeggiante "Torneo in corso").
  function tourFlag(tour) {
    if (tour.closed) return `<p class="tour-flag done">${esc(t('flagDone'))}</p>`;
    if (tour.qual || tour.mainIds) return `<p class="tour-flag live"><span class="blink">${esc(t('flagLive'))}</span></p>`;
    const ph = regPhase(tour);
    if (ph === 'open') return `<p class="tour-flag open"><span class="flag-star blink" aria-hidden="true">★</span> ${esc(t('flagOpen'))}</p>`;
    if (ph === 'soon') return `<p class="tour-flag soon"><span class="flag-star" aria-hidden="true">★</span> ${esc(t('flagSoon'))}</p>`;
    if (ph) return `<p class="tour-flag shut"><span class="flag-star" aria-hidden="true">★</span> ${esc(t('flagClosed'))}</p>`;
    return '';
  }

  // ---------- scheda torneo (creazione / modifica) ----------
  function viewNewTournament() {
    return `<div class="page-head"><a class="back" href="#/tournaments">← ${esc(t('tournaments'))}</a><h1>${esc(t('newTournament'))}</h1></div>
      ${regForm(null)}`;
  }

  function viewNewTournamentFull() {
    if (!S().categories.length) {
      return `<div class="page-head"><a class="back" href="#/tournaments">← ${esc(t('tournaments'))}</a><h1>${esc(t('newTournament'))}</h1></div>
        <div class="card"><p>${esc(t('needCategoryFirst'))}</p><a class="btn primary" href="#/categories">${esc(t('goCategories'))} →</a></div>`;
    }
    return `
      <div class="page-head">
        <a class="back" href="#/tournaments">← ${esc(t('tournaments'))}</a>
        <h1>${esc(t('newTournament'))}</h1>
      </div>
      ${tournamentForm(null)}`;
  }

  function tournamentForm(tour) {
    const c = tour ? tour.config : L.defaultConfig();
    const listLock = tour && tour.entryLocked ? 'disabled' : '';
    const fmtLock = tour && (tour.qual || tour.mainIds) ? 'disabled' : '';
    const v = (k, d) => esc(tour && tour[k] != null ? tour[k] : (d == null ? '' : d));
    const format = tour ? tour.format : 'single_elim';
    return `
    <form class="card grid-form" data-form="${tour ? 'tournament-edit' : 'tournament-new'}" ${tour ? `data-tid="${tour.id}"` : ''}>
      <h2 class="span-all">${esc(t('details'))}</h2>
      <label>${esc(t('category'))}<select name="categoryId" required>
        ${S().categories.map(k => `<option value="${k.id}" ${sel(tour && tour.categoryId, k.id)}>${esc(k.name)}</option>`).join('')}
      </select></label>
      <label>${esc(t('coefficient'))}<input name="coefficient" type="number" min="0" step="0.01" inputmode="decimal" required value="${v('coefficient', 1)}">
        <small class="muted">${esc(t('coefficientHelp'))}</small></label>
      <label>${esc(t('gender'))}<select name="gender" ${tour && tour.entries.length ? 'disabled' : ''}>
        <option value="M" ${sel(tour && tour.gender, 'M')}>${esc(t('catMen'))}</option>
        <option value="F" ${sel(tour && tour.gender, 'F')}>${esc(t('catWomen'))}</option>
        <option value="X" ${sel(tour && tour.gender, 'X')}>${esc(t('catMixed'))}</option></select></label>
      <label>${esc(t('name'))}<input name="name" required maxlength="80" value="${v('name')}" placeholder="${esc(t('namePlaceholder'))}"></label>
      <label>${esc(t('location'))}<input name="location" maxlength="80" value="${v('location')}"></label>
      <span class="hide-sm"></span>

      <h2 class="span-all">${esc(t('datesSection'))}</h2>
      <label>${esc(t('startDate'))}<input name="start" type="date" required value="${v('start')}"></label>
      <label>${esc(t('endDate'))}<input name="end" type="date" value="${v('end')}"></label>
      <label>${esc(t('inquiry'))}<input name="inquiry" type="datetime-local" value="${v('inquiry')}">
        <small class="muted">${esc(t('inquiryHelp'))}</small></label>
      <label>${esc(t('qualStart'))}<input name="qualStart" type="datetime-local" value="${v('qualStart')}"></label>
      <label>${esc(t('qualEnd'))}<input name="qualEnd" type="date" value="${v('qualEnd')}"></label>
      <span class="hide-sm"></span>
      <label>${esc(t('mainStart'))}<input name="mainStart" type="datetime-local" value="${v('mainStart')}"></label>
      <label>${esc(t('mainEnd'))}<input name="mainEnd" type="date" value="${v('mainEnd')}"></label>

      <h2 class="span-all">${esc(t('format'))}</h2>
      ${fmtLock ? `<p class="note span-all"><i class="ti ti-lock" aria-hidden="true"></i> ${esc(t('formatLocked'))}</p>` : ''}
      <label class="span-all">${esc(t('mainFormat'))}<select name="format" ${fmtLock}>
        ${L.FORMATS.map(f => `<option value="${f}" ${sel(format, f)}>${esc(t('fmt_' + f))}</option>`).join('')}
      </select><small class="muted" data-format-desc></small></label>
      <label data-show-format="pools_ko">${esc(t('poolSize'))}<input name="poolSize" type="number" min="2" max="16" value="${c.poolSize}" ${fmtLock}></label>
      <label data-show-format="pools_ko fivb_pools">${esc(t('qualifyPerPool'))}<input name="qualify" type="number" min="1" max="8" value="${c.qualify}" ${fmtLock}></label>
      <label class="check" data-show-format="pools_ko fivb_pools single_elim"><input type="checkbox" name="thirdPlace" ${c.thirdPlace ? 'checked' : ''} ${tour && tour.bracket ? 'disabled' : ''}> ${esc(t('thirdPlaceMatch'))}</label>
      ${gsFormFields(tour, c, fmtLock)}
      <label>${esc(t('setsToWin'))}<select name="setsToWin" ${fmtLock}>
        ${[1, 2, 3].map(n => `<option value="${n}" ${sel(c.setsToWin, n)}>${esc(n === 1 ? t('oneSet') : t('bestOfN', { w: n, n: 2 * n - 1 }))}</option>`).join('')}
      </select><small class="muted">${esc(t('formatBothPhases'))}</small></label>
      <label>${esc(t('setPoints'))}<input name="setPoints" type="number" min="5" max="50" value="${c.setPoints}" ${fmtLock}></label>
      <label data-show-sets>${esc(t('tiebreakPoints'))}<input name="tiebreakPoints" type="number" min="5" max="50" value="${c.tiebreakPoints}" ${fmtLock}></label>

      <h2 class="span-all">${esc(t('admission'))}</h2>
      ${listLock ? `<p class="note span-all"><i class="ti ti-lock" aria-hidden="true"></i> ${esc(t('admissionLocked'))}</p>` : ''}
      <label data-show-format="gold_silver">${esc(t('mainSize'))}<input name="mainSizeGs" type="number" min="6" max="64" inputmode="numeric" value="${c.mainSize}" ${listLock}>
        <small class="muted">${esc(t('mainSizeHelp'))}</small></label>
      <label data-hide-format="gold_silver">${esc(t('mainSize'))}<select name="mainSize" ${listLock}>
        ${(L.MAIN_SIZES.includes(c.mainSize) ? L.MAIN_SIZES : L.MAIN_SIZES.concat(c.mainSize)).map(n => `<option value="${n}" ${sel(c.mainSize, n)}>${n} ${esc(t('teamsWord'))}</option>`).join('')}
      </select><small class="muted">${esc(t('mainSizeHelp'))}</small></label>
      <label>${esc(t('directSpots'))}<input name="directSpots" type="number" min="0" max="64" required value="${c.directSpots}" ${listLock}></label>
      <label>${esc(t('qualSpots'))}<input name="qualSpots" type="number" min="0" max="64" required value="${c.qualSpots}" ${listLock}>
        <small class="muted">${esc(t('qualSpotsHelp'))}</small></label>
      <label>${esc(t('wcSpots'))}<input name="wcSpots" type="number" min="0" max="32" required value="${c.wcSpots}" ${listLock}>
        <small class="muted">${esc(t('wcSpotsHelp'))}</small></label>
      <p class="note span-all" data-composition></p>
      <label>${esc(t('qualWcSpots'))}<input name="qualWcSpots" type="number" min="0" max="32" value="${c.qualWcSpots || 0}" ${listLock}>
        <small class="muted">${esc(t('qualWcSpotsHelp'))}</small></label>
      <label>${esc(t('qualMax'))}<input name="qualMax" type="number" min="0" inputmode="numeric" value="${c.qualMax || ''}" placeholder="${esc(t('unlimited'))}" ${listLock}>
        <small class="muted">${esc(t('qualMaxHelp'))}</small></label>

      <div class="form-actions span-all">
        <button class="btn primary">${esc(tour ? t('save') : t('create'))}</button>
        ${tour ? `<button type="button" class="btn danger" data-action="delete-tournament" data-tid="${tour.id}">${esc(t('deleteTournament'))}</button>` : ''}
      </div>
    </form>`;
  }

  // ---------- Gold & Silver: campi del modulo ----------
  function gsRowInputs(which, place, pts) {
    return `<div class="pt-row">
      <input type="number" min="1" inputmode="numeric" name="${which}Place" value="${place}" aria-label="${esc(t('place'))}">
      <input type="number" min="0" step="0.01" inputmode="decimal" name="${which}Pts" value="${pts}" aria-label="${esc(t('points'))}">
      <button type="button" class="icon-btn" data-action="del-row" aria-label="${esc(t('remove'))}">✕</button>
    </div>`;
  }

  function gsFormFields(tour, c, fmtLock) {
    const G = Object.assign({}, L.GS_DEFAULTS, c);
    const lockBracket = tour && tour.bracket ? 'disabled' : '';
    const table = (which, rows) => `<div class="gs-table">
        <h3>${esc(t(which === 'gold' ? 'goldTable' : 'silverTable'))}</h3>
        <div class="pt-rows" data-rows="${which}">${(rows && rows.length ? rows : [[1, 0]]).map(r => gsRowInputs(which, r[0], r[1])).join('')}</div>
        <button type="button" class="btn small" data-action="gs-add-row" data-which="${which}"><i class="ti ti-plus" aria-hidden="true"></i> ${esc(t('addRow'))}</button>
      </div>`;
    return `<div class="span-all gs-box" data-show-format="gold_silver">
      <p class="muted small">${esc(t('gsIntro'))}</p>
      <div class="grid-form tight">
        <label>${esc(t('gsPools'))}<input name="gsPools" type="number" min="1" max="16" value="${G.poolCount}" ${fmtLock}></label>
        <label>${esc(t('goldSpots'))}<input name="goldSpots" type="number" min="2" max="16" value="${G.goldSpots}" ${lockBracket}>
          <small class="muted">${esc(t('goldSpotsHelp'))}</small></label>
      </div>
      <div class="gs-pools" data-gs-pools data-sizes="${esc((G.poolSizes || []).join(','))}" data-modes="${esc((G.poolModes || []).join(','))}" data-lock="${fmtLock ? 1 : 0}"></div>
      <p class="note" data-gs-summary></p>
      <label class="check"><input type="checkbox" name="goldThird" ${G.thirdPlace ? 'checked' : ''} ${lockBracket}> ${esc(t('goldThird'))}</label>
      <label class="check"><input type="checkbox" name="silverThird" ${G.silverThird ? 'checked' : ''} ${lockBracket}> ${esc(t('silverThird'))}</label>
      <h3>${esc(t('gsTablesTitle'))}</h3>
      <p class="muted small">${esc(t('gsTablesHelp'))}</p>
      <div class="gs-tables">${table('gold', tour && tour.goldRows)}${table('silver', tour && tour.silverRows)}</div>
    </div>`;
  }

  // Elenco dei gironi (dimensione e formula) e riepilogo Gold / Silver, aggiornati mentre si compila.
  function syncGsFields(f) {
    const box = f.querySelector('[data-gs-pools]');
    if (!box) return;
    const n = +f.mainSizeGs.value || 0;
    const P = Math.max(1, Math.min(16, +f.gsPools.value || 1));
    const key = `${n}|${P}`;
    const lock = box.dataset.lock === '1';
    if (box.dataset.key !== key) {
      // valori attuali (o quelli salvati) se tornano con il nuovo numero di gironi, altrimenti distribuzione automatica
      let sizes = [...box.querySelectorAll('[name=gsSize]')].map(x => +x.value);
      let modes = [...box.querySelectorAll('[name=gsMode]')].map(x => x.value);
      if (!box.dataset.key) { sizes = (box.dataset.sizes || '').split(',').filter(Boolean).map(Number); modes = (box.dataset.modes || '').split(','); }
      if (sizes.length !== P || sizes.reduce((a, b) => a + b, 0) !== n) sizes = Array.from({ length: P }, (_, i) => Math.floor(n / P) + (i < n % P ? 1 : 0));
      box.dataset.key = key;
      box.innerHTML = sizes.map((size, i) => `<div class="gs-pool">
          <b>${esc(t('pool'))} ${String.fromCharCode(65 + i)}</b>
          <select name="gsSize" ${lock ? 'disabled' : ''} aria-label="${esc(t('teamsWord'))}">${[3, 4, 5].map(k => `<option value="${k}" ${k === size ? 'selected' : ''}>${k} ${esc(t('teamsWord'))}</option>`).join('')}${size < 3 || size > 5 ? `<option value="${size}" selected>${size} ${esc(t('teamsWord'))}</option>` : ''}</select>
          <select name="gsMode" ${lock ? 'disabled' : ''} aria-label="${esc(t('gsMode'))}">
            <option value="rr" ${modes[i] !== 'fivb' ? 'selected' : ''}>${esc(t('gsModeRr'))}</option>
            <option value="fivb" ${modes[i] === 'fivb' ? 'selected' : ''}>${esc(t('gsModeFivb'))}</option>
          </select>
        </div>`).join('');
    }
    // la formula FIVB esiste solo per i gironi da 4
    box.querySelectorAll('.gs-pool').forEach(row => {
      const size = +row.querySelector('[name=gsSize]').value, mode = row.querySelector('[name=gsMode]');
      if (size !== 4) mode.value = 'rr';
      mode.disabled = lock || size !== 4;
    });
    const sizes = [...box.querySelectorAll('[name=gsSize]')].map(x => +x.value);
    const tot = sizes.reduce((a, b) => a + b, 0);
    const gold = Math.max(0, +f.goldSpots.value || 0);
    const sum = f.querySelector('[data-gs-summary]');
    const problems = [];
    if (tot !== n) problems.push(t('gsSumErr', { s: tot, n }));
    if (sizes.some(x => x < 3 || x > 5)) problems.push(t('errPoolSizes'));
    if (gold < 2 || gold > Math.min(16, n)) problems.push(t('errGoldSpots', { max: Math.min(16, n) }));
    if (problems.length) { sum.textContent = '⚠ ' + problems.join(' '); sum.classList.add('warn'); return; }
    // chi va nel Gold: 1ª, 2ª... e le migliori della posizione successiva
    const parts = [];
    let left = gold;
    for (let r = 0; left > 0 && r < 5; r++) {
      const avail = sizes.filter(x => x > r).length;
      if (!avail) break;
      const take = Math.min(avail, left);
      parts.push(take === avail ? t('gsAll', { n: avail, r: r + 1 }) : t('gsBest', { n: take, r: r + 1 }));
      left -= take;
    }
    sum.textContent = '✔ ' + t('gsSummary', { g: gold, parts: parts.join(', '), s: n - gold });
    sum.classList.remove('warn');
  }

  function syncTournamentForm(f) {
    const format = f.format.value, sets = +f.setsToWin.value;
    f.querySelectorAll('[data-show-format]').forEach(el => { el.hidden = !el.dataset.showFormat.split(' ').includes(format); });
    f.querySelectorAll('[data-hide-format]').forEach(el => { el.hidden = el.dataset.hideFormat.split(' ').includes(format); });
    if (format === 'gold_silver') syncGsFields(f);
    f.querySelectorAll('[data-show-sets]').forEach(el => { el.hidden = sets === 1; });
    const d = f.querySelector('[data-format-desc]');
    if (d) d.textContent = t('fmtDesc_' + format);
    const comp = f.querySelector('[data-composition]');
    if (comp) {
      const n = format === 'gold_silver' ? +f.mainSizeGs.value || 0 : +f.mainSize.value, dir = +f.directSpots.value || 0, q = +f.qualSpots.value || 0, w = +f.wcSpots.value || 0;
      const ok = dir + q + w === n;
      comp.textContent = ok ? '✔ ' + t('mainComposition', { n, d: dir, q, w }) : '⚠ ' + t('errComposition', { n, s: dir + q + w });
      comp.classList.toggle('warn', !ok);
    }
  }

  function readTournamentForm(f, tour) {
    const num = (name, min, def) => { const x = parseFloat(String(f[name].value).replace(',', '.')); return isNaN(x) ? def : Math.max(min, x); };
    const data = {
      name: f.name.value.trim(), location: f.location.value.trim(), categoryId: f.categoryId.value,
      coefficient: num('coefficient', 0, 1),
      start: f.start.value, end: f.end.value, inquiry: f.inquiry.value, qualStart: f.qualStart.value, qualEnd: f.qualEnd.value,
      mainStart: f.mainStart.value, mainEnd: f.mainEnd.value
    };
    if (!tour || !tour.entries.length) data.gender = f.gender.value;
    const cfg = Object.assign({}, tour ? tour.config : L.defaultConfig());
    if (!tour || !(tour.qual || tour.mainIds)) {
      data.format = f.format.value;
      Object.assign(cfg, {
        poolSize: Math.round(num('poolSize', 2, 4)), qualify: Math.round(num('qualify', 1, 2)),
        setsToWin: +f.setsToWin.value, setPoints: Math.round(num('setPoints', 5, 21)),
        tiebreakPoints: Math.round(num('tiebreakPoints', 5, 15))
      });
    }
    if (!tour || !tour.entryLocked) {
      Object.assign(cfg, {
        mainSize: Math.round(num('mainSize', 2, 16)), directSpots: Math.round(num('directSpots', 0, 0)),
        qualSpots: Math.round(num('qualSpots', 0, 0)), wcSpots: Math.round(num('wcSpots', 0, 0)),
        qualWcSpots: Math.round(num('qualWcSpots', 0, 0)), qualMax: Math.round(num('qualMax', 0, 0))
      });
    }
    if (!tour || !tour.bracket) cfg.thirdPlace = f.thirdPlace.checked;
    // Gold & Silver: gironi, squadre al Gold, finali 3°/4°, tabelle punti (solo per questo formato)
    const fmt = data.format || (tour && tour.format);
    if (fmt === 'gold_silver') {
      if (!tour || !tour.entryLocked) cfg.mainSize = Math.round(num('mainSizeGs', 2, 16));
      if (!tour || !(tour.qual || tour.mainIds)) {
        const sizes = [...f.querySelectorAll('[name=gsSize]')].map(x => +x.value);
        const modes = [...f.querySelectorAll('[name=gsMode]')].map((x, i) => (sizes[i] === 4 && x.value === 'fivb' ? 'fivb' : 'rr'));
        Object.assign(cfg, { poolCount: sizes.length || Math.round(num('gsPools', 1, 4)), poolSizes: sizes, poolModes: modes });
      }
      if (!tour || !tour.bracket) {
        cfg.goldSpots = Math.round(num('goldSpots', 2, 8));
        cfg.thirdPlace = f.goldThird.checked;
        cfg.silverThird = f.silverThird.checked;
      }
      const rows = which => {
        const pl = [...f.querySelectorAll(`[name=${which}Place]`)].map(x => parseInt(x.value, 10));
        const pt = [...f.querySelectorAll(`[name=${which}Pts]`)].map(x => parseFloat(String(x.value).replace(',', '.')));
        return pl.map((p, i) => [p, pt[i]]).filter(r => r[0] > 0 && r[1] >= 0).sort((a, b) => a[0] - b[0]);
      };
      data.goldRows = rows('gold');
      data.silverRows = rows('silver');
    }
    data.config = cfg;
    return data;
  }

  // ---------- torneo ----------
  function tabsFor(tour) {
    const ph = regPhase(tour);
    if (ph && ph !== 'formula') {
      const tb = ['info', 'entries'];
      if (tourAdmin()) tb.push('manage', 'edit');
      return tb;
    }
    const tabs = ['info', 'entries', 'calendar'];
    if (tour.qual) tabs.push('qual');
    if (tour.pools) tabs.push('pools');
    if (tour.bracket) tabs.push('bracket');
    tabs.push('final');
    if (tourAdmin() || scorerTour(tour)) tabs.push('referti');
    if (tourAdmin()) tabs.push('manage', 'edit');
    return tabs;
  }

  function viewTournament(tour, tab) {
    const tabs = tabsFor(tour);
    if (!tabs.includes(tab)) tab = tourAdmin() ? 'manage' : 'info';
    const st = L.status(tour);
    const cat = catById(tour.categoryId);
    const body = {
      info: tabInfo, entries: tabEntries, calendar: tabCalendar, qual: tabQual, pools: tabPools,
      bracket: tabBracket, final: tabFinal, referti: tabReferti, manage: tabManage, edit: tabEdit
    }[tab](tour);
    return `
      <div class="page-head">
        <a class="back" href="#/tournaments">← ${esc(t('tournaments'))}</a>
        <h1>${esc(tour.name)}</h1>
        <p class="meta">
          <span class="badge g-${tour.gender}">${esc(genderLabel(tour.gender))}</span>
          ${cat ? `<span class="badge cat">${esc(cat.name)}</span>` : ''}
          <span class="badge st-${st}">${esc(t('st_' + st))}</span>
          <span class="muted"><i class="ti ti-calendar" aria-hidden="true"></i> ${esc(fmtRange(tour.start, tour.end))}${tour.location ? ` &nbsp;<i class="ti ti-map-pin" aria-hidden="true"></i> ${esc(tour.location)}` : ''}</span>
        </p>
      </div>
      ${noticeBox(tour.id, tour.notice)}
      <nav class="tabs" aria-label="${esc(t('sections'))}">
        ${tabs.map(k => `<a href="#/t/${tour.id}/${k}" class="${k === tab ? 'active' : ''} ${k === 'manage' || k === 'edit' ? 'tab-admin' : ''}">${esc(t('tab_' + k))}</a>`).join('')}
      </nav>
      <section class="tab-body">${body}</section>`;
  }

  // Scheda: impostazioni delle iscrizioni finché la lista non è confermata, poi la formula completa.
  function tabEdit(tour) {
    const ph = regPhase(tour);
    if (ph && ph !== 'confirmed' && ph !== 'formula') return regForm(tour);
    if (ph && !S().categories.length) return `<div class="card"><p>${esc(t('needCategoryFirst'))}</p><a class="btn primary" href="#/categories">${esc(t('goCategories'))} →</a></div>`;
    return (ph === 'confirmed' ? `<p class="note"><i class="ti ti-info-circle" aria-hidden="true"></i> ${esc(t('regFormulaNote', { n: tour.entries.length }))}</p>` : '') + tournamentForm(tour);
  }

  function gsPointsCard(tour) {
    const tbl = (title, rows, offset) => `<h3>${esc(title)}</h3><div class="table-wrap"><table class="table">
        <thead><tr><th>${esc(t('place'))}</th><th class="num">${esc(t('teamPts'))}</th><th class="num">${esc(t('perPlayer'))}</th></tr></thead>
        <tbody>${rows.slice().sort((a, b) => a[0] - b[0]).map((r, i, arr) => {
          const next = arr[i + 1];
          const range = next && next[0] - 1 > r[0] ? `${r[0]}°–${next[0] - 1}°` : `${r[0]}°${next ? '' : '+'}`;
          const tp = L.teamPoints(S(), tour, r[0] + offset);
          return `<tr><td>${range}</td><td class="num"><strong>${fmtPts(tp)}</strong></td><td class="num">${fmtPts(tp / 2)}</td></tr>`;
        }).join('')}</tbody></table></div>`;
    return `<div class="card">
      <h2>${esc(t('pointsAwarded'))}</h2>
      ${tbl(t('goldTable'), tour.goldRows || [], 0)}
      ${tbl(t('silverTable'), tour.silverRows || [], L.goldCount(tour))}
      <p class="muted small">${esc(t('pointsFormula', { coef: fmtPts(tour.coefficient) }))}</p>
    </div>`;
  }

  function tabInfo(tour) {
    const ph = regPhase(tour);
    if (ph && ph !== 'formula' && tour.reg.formulaSet) return regBox(tour) + partnerBox(tour) + tabInfoFull(tour);
    if (ph && ph !== 'formula') {
      const r = tour.reg;
      const row = (k, v) => v ? `<div class="kv"><span>${esc(t(k))}</span><strong>${v}</strong></div>` : '';
      return regBox(tour) + partnerBox(tour) + `<div class="card">
        <h2>${esc(t('details'))}</h2>
        ${row('startDateTime', esc(fmtDateTime(r.startAt)))}
        ${row('gender', esc(genderLabel(tour.gender)))}
        ${row('location', esc(tour.location))}
        ${row('maxTeams', esc(r.maxTeams))}
        ${row('regDeadline', esc(fmtDateTime(r.deadline)))}
        <p class="muted small">${esc(t('regFormulaLater'))}</p>
      </div>`;
    }
    return tabInfoFull(tour);
  }

  function tabInfoFull(tour) {
    const c = tour.config, cat = catById(tour.categoryId);
    const rows = cat ? cat.rows.slice().sort((a, b) => a[0] - b[0]) : [];
    const row = (k, v) => v ? `<div class="kv"><span>${esc(t(k))}</span><strong>${v}</strong></div>` : '';
    const direct = Math.max(0, c.mainSize - c.qualSpots - c.wcSpots);
    return `
      <div class="pools-grid">
        <div class="card">
          <h2>${esc(t('details'))}</h2>
          ${row('category', esc(cat ? cat.name : '—'))}
          ${row('coefficient', '×' + esc(fmtPts(tour.coefficient)))}
          ${row('location', esc(tour.location))}
          ${row('tournamentDates', esc(fmtRange(tour.start, tour.end)))}
          ${row('inquiry', esc(fmtDateTime(tour.inquiry)))}
          ${row('qualification', esc([fmtDateTime(tour.qualStart), tour.qualEnd ? fmtDate(tour.qualEnd) : ''].filter(Boolean).join(' → ')))}
          ${row('mainDraw', esc([fmtDateTime(tour.mainStart), tour.mainEnd ? fmtDate(tour.mainEnd) : ''].filter(Boolean).join(' → ')))}
          ${row('format', esc(formatSummary(tour)))}
          ${row('mainSize', esc(t('mainComposition', { n: c.mainSize, d: direct, q: c.qualSpots, w: c.wcSpots })))}
          ${c.qualSpots ? row('qualMax', esc(c.qualMax ? c.qualMax : t('unlimited'))) : ''}
          ${c.qualSpots && c.qualWcSpots ? row('qualWcSpots', esc(c.qualWcSpots)) : ''}
        </div>
        ${tour.format === 'gold_silver' ? gsPointsCard(tour) : `<div class="card">
          <h2>${esc(t('pointsAwarded'))}</h2>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>${esc(t('place'))}</th><th class="num">${esc(t('teamPts'))}</th><th class="num">${esc(t('perPlayer'))}</th></tr></thead>
            <tbody>${rows.map((r, i) => {
              const next = rows[i + 1];
              const range = next && next[0] - 1 > r[0] ? `${r[0]}°–${next[0] - 1}°` : `${r[0]}°${next ? '' : '+'}`;
              const tp = L.teamPoints(S(), tour, r[0]);
              return `<tr><td>${range}</td><td class="num"><strong>${fmtPts(tp)}</strong></td><td class="num">${fmtPts(tp / 2)}</td></tr>`;
            }).join('')}</tbody></table></div>
          <p class="muted small">${esc(t('pointsFormula', { coef: fmtPts(tour.coefficient) }))}</p>
        </div>`}
      </div>`;
  }

  // Tabella di squadre con punti dei giocatori (lista d'ingresso).
  function entryTable(tour, ids, opts) {
    opts = opts || {};
    const map = rankMap(tour.gender);
    if (!ids.length) return `<p class="muted">${esc(t('noTeams'))}</p>`;
    const qualWinners = tour.qualClosed && tour.qual ? new Set(L.qualWinners(tour) || []) : new Set();
    const wcSet = new Set(tour.split ? tour.split.wc : tour.entries.filter(e => e.wc === 'main').map(e => e.id));
    const qwcSet = new Set(tour.split ? (tour.split.qualWc || []) : tour.entries.filter(e => e.wc === 'qual').map(e => e.id));
    const rows = ids.map((id, i) => {
      const e = entryById(tour, id);
      if (!e) return '';
      const [p1, p2] = L.entryPts(tour, e, map);
      const a = player(e.p1), b = player(e.p2);
      const ptsCell = (which, val, man) => opts.editable
        ? `<input class="pts-input" type="number" step="0.01" min="0" inputmode="decimal" value="${man != null ? man : ''}" placeholder="${fmtPts(val)}" data-change="entry-pts" data-tid="${tour.id}" data-id="${e.id}" data-which="${which}" aria-label="${esc(t('points'))}">`
        : `<b>${fmtPts(val)}</b>`;
      const badges = `${wcSet.has(id) ? '<span class="badge wc">WC</span>' : ''}${qwcSet.has(id) ? `<span class="badge wc" title="${esc(t('qualWcSpots'))}">WC-Q</span>` : ''}${qualWinners.has(id) ? '<span class="badge q">Q</span>' : ''}`;
      return `<tr>
        <td class="num">${opts.posInput
          ? `<input class="pos-input" type="number" min="1" max="${ids.length}" inputmode="numeric" value="${i + 1}" data-change="main-pos" data-tid="${tour.id}" data-id="${e.id}" aria-label="${esc(t('movePos'))}" title="${esc(t('movePos'))}">`
          : i + 1 + (opts.offset || 0)}</td>
        <td>
          <div class="entry-player"><a href="#/p/${e.p1}">${esc(playerFull(a))}</a> ${ptsCell(1, p1, e.man1)}</div>
          <div class="entry-player"><a href="#/p/${e.p2}">${esc(playerFull(b))}</a> ${ptsCell(2, p2, e.man2)}</div>
        </td>
        <td class="num"><strong>${fmtPts(p1 + p2)}</strong> ${badges}</td>
        ${opts.editable || opts.movable ? `<td class="num nowrap">
          <button class="icon-btn" data-action="${opts.movable === 'main' ? 'main-move' : 'entry-move'}" data-dir="-1" data-tid="${tour.id}" data-id="${e.id}" aria-label="${esc(t('moveUp'))}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="icon-btn" data-action="${opts.movable === 'main' ? 'main-move' : 'entry-move'}" data-dir="1" data-tid="${tour.id}" data-id="${e.id}" aria-label="${esc(t('moveDown'))}" ${i === ids.length - 1 ? 'disabled' : ''}>↓</button>
          ${opts.editable ? `
          <select class="wc-select" data-change="entry-wc" data-tid="${tour.id}" data-id="${e.id}" aria-label="${esc(t('wildCard'))}">
            <option value="" ${e.wc ? '' : 'selected'}>—</option>
            <option value="main" ${sel(e.wc, 'main')}>WC</option>
            <option value="qual" ${sel(e.wc, 'qual')}>WC-Q</option>
          </select>
          ${opts.editBtn ? `<button class="icon-btn" data-action="entry-edit-open" data-tid="${tour.id}" data-id="${e.id}" title="${esc(t('edit'))}" aria-label="${esc(t('edit'))}"><i class="ti ti-pencil" aria-hidden="true"></i></button>` : ''}
          <button class="icon-btn" data-action="remove-entry" data-tid="${tour.id}" data-id="${e.id}" title="${esc(t('remove'))}" aria-label="${esc(t('remove'))}">✕</button>` : ''}
        </td>` : ''}
      </tr>`;
    }).join('');
    return `<div class="table-wrap"><table class="table entries">
      <thead><tr><th class="num">#</th><th>${esc(t('team'))} · ${esc(t('rankPts'))}</th><th class="num">${esc(t('total'))}</th>${opts.editable || opts.movable ? '<th></th>' : ''}</tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  function tabEntries(tour) {
    const rph = regPhase(tour);
    if (rph === 'open' || rph === 'expired' || rph === 'soon') {
      return (presetCount(tour) ? `<div class="card"><h2>${esc(t('regPresetTitle'))} (${presetCount(tour)})</h2>${entryTable(tour, tour.entries.filter(e => !e.regId).map(e => e.id))}</div>` : '')
        + `<div class="card"><h2>${esc(t('regRegistered'))} (${regsOf(tour).length + presetCount(tour)}/${tour.reg.maxTeams})</h2>
        <p class="muted small">${esc(t('regListHelp', { n: Math.max(0, tour.reg.maxTeams - presetCount(tour)) }))}</p>${regList(tour)}</div>`;
    }
    const card = (title, ids, note, offset) => `<div class="card"><h2>${esc(title)} (${ids.length})</h2>${note ? `<p class="muted small">${esc(note)}</p>` : ''}${entryTable(tour, ids, { offset })}</div>`;
    if (tour.mainList) {
      return card(t('mainDrawList'), tour.mainList, tour.mainLocked ? '' : t('listProvisional'))
        + (tour.split && tour.split.reserve.length ? card(t('reserves'), tour.split.reserve) : '');
    }
    if (tour.split) {
      return card(t('mainDrawDirect'), tour.split.main)
        + (tour.config.qualSpots ? card(t('qualEntries'), tour.split.qual, t('qualEntriesNote', { spots: tour.config.qualSpots })) : '')
        + (tour.split.reserve.length ? card(t('reserves'), tour.split.reserve) : '');
    }
    return card(t('entryList'), tour.entries.map(e => e.id), t('listProvisional'));
  }

  // ---------- calendario ----------
  function dayTitle(d) {
    const dt = new Date(d + 'T12:00:00');
    if (isNaN(dt)) return d;
    const s = dt.toLocaleDateString(I18n.locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Calendario: per giorno (ordine di orario; "a seguire" dopo la gara precedente sullo stesso campo) o per fase.
  function tabCalendar(tour) {
    const planned = L.plannedMatches(tour).filter(m => !(m.bye && m.a === L.BYE && m.b === L.BYE));
    if (!planned.length) return `<div class="card"><p class="muted">${esc(t('noMatchesYet'))}</p></div>`;
    // I visitatori vedono solo le gare pubblicate.
    const matches = tourAdmin() ? planned : planned.filter(m => isVisible(tour, m));
    if (!matches.length) return `<div class="card"><p class="muted"><i class="ti ti-eye-off" aria-hidden="true"></i> ${esc(t('calendarNotPublished'))}</p></div>`;
    const view = ui.calView || 'day';
    const views = [['number', 'hash', 'calByNumber'], ['day', 'calendar-event', 'calByDay'], ['court', 'map-pin', 'calByCourt'], ['phase', 'list-details', 'calByPhase']];
    const toggle = `<div class="toolbar"><span class="muted small">${esc(t('sortBy'))}</span><div class="segmented wrap" role="group">
      ${views.map(([v, ic, k]) => `<button data-action="cal-view" data-view="${v}" aria-pressed="${view === v}"><i class="ti ti-${ic}" aria-hidden="true"></i> ${esc(t(k))}</button>`).join('')}
    </div></div>`;
    const groups = [];
    const push = (title, m, icon) => {
      if (!groups.length || groups[groups.length - 1].title !== title) groups.push({ title, icon, items: [] });
      groups[groups.length - 1].items.push(m);
    };
    // Chiave di ordinamento per data e orario: le gare "a seguire" dopo la precedente sullo stesso campo.
    const timeKey = {};
    const last = {};
    matches.forEach((m, i) => {
      const s = tour.schedule[m.key];
      if (!s || !s.date) return;
      const seq = String(i).padStart(4, '0');
      let base;
      if (s.time && !s.follow) { base = s.time; last[s.date + '|' + (s.court || '')] = s.time; last[s.date] = s.time; }
      else base = last[s.date + '|' + (s.court || '')] || last[s.date] || '99:99';
      timeKey[m.key] = `${s.date} ${base}~${s.follow ? seq : '0000' + seq}`;
    });
    const num = m => { const s = gNo(tour, m); return s ? (s[0] === 'Q' ? 0 : 1e6) + parseInt(s.slice(1), 10) : 1e9; };
    // Per tempo: prima le gare con data e orario (in ordine), poi quelle da programmare in ordine di numero di gara.
    const byTime = list => list.slice().sort((a, b) => {
      const ka = timeKey[a.key], kb = timeKey[b.key];
      if (ka && kb) return ka.localeCompare(kb);
      if (ka || kb) return ka ? -1 : 1;
      return num(a) - num(b);
    });

    if (view === 'phase') {
      matches.forEach(m => push(m.stage === 'qual' ? t('qualification') : m.stage === 'pool' ? t('tab_pools') : t('mainDraw'), m));
    } else if (view === 'number') {
      matches.slice().sort((a, b) => num(a) - num(b)).forEach(m => push(t('allMatches'), m, 'hash'));
    } else if (view === 'court') {
      const courtOf = m => ((tour.schedule[m.key] || {}).court || '').trim();
      const courts = [...new Set(matches.map(courtOf))].sort((a, b) => !a ? 1 : !b ? -1 : a.localeCompare(b, undefined, { numeric: true }));
      courts.forEach(c => byTime(matches.filter(m => courtOf(m) === c)).forEach(m => push(c ? `${t('court')} ${c}` : t('courtTbd'), m, 'map-pin')));
    } else {
      byTime(matches).forEach(m => {
        if (timeKey[m.key]) push(dayTitle(tour.schedule[m.key].date), m, 'calendar-event');
        else push(t('toSchedule'), m, 'clock-question');
      });
    }
    const gsNote = tourAdmin() && tour.format === 'gold_silver' && tour.gsNums
      ? `<p class="note"><i class="ti ti-hash" aria-hidden="true"></i> ${esc(t('gsNumsChanged'))} <button class="btn small" data-action="gs-nums-reset" data-tid="${tour.id}">${esc(t('gsNumsReset'))}</button></p>` : '';
    return visibilityBar(tour, planned) + toggle + gsNote + groups.map(g => `
      <div class="card">
        <div class="card-head"><h2>${g.icon ? `<i class="ti ti-${g.icon}" aria-hidden="true"></i> ` : ''}${esc(g.title)} <span class="muted small">(${g.items.length})</span></h2>${groupVisButtons(tour, g.items)}</div>
        <ul class="cal-list">${g.items.map(m => calRow(tour, m, view === 'day')).join('')}</ul>
      </div>`).join('');
  }

  // Data sempre indicata; orario oppure "a seguire"; campo. Nella vista per giorno la data è nell'intestazione.
  function scheduleText(tour, key, hideDate) {
    const s = tour.schedule[key];
    if (!s) return '';
    return [hideDate || !s.date ? '' : fmtDate(s.date), s.follow ? t('toFollow') : s.time || '', s.court ? `${t('court')} ${s.court}` : '']
      .filter(Boolean).join(' · ');
  }

  function scoreBlock(tour, m) {
    if (m.stats) {
      const sets = m.res.sets.map(([a, b]) => `${a}-${b}`).join(' ');
      return `<strong>${m.stats.a.sw}-${m.stats.b.sw}</strong><small>${esc([sets, m.stats.tag].filter(Boolean).join(' '))}</small>`;
    }
    if (tourAdmin() && m.draft) return `<small class="draft">${esc(t('notClosed'))}</small>`;
    return '';
  }

  function canEdit(tour) { return tourAdmin() && !tour.closed; }

  // ---------- referto elettronico: punteggio in diretta e risultato in attesa di omologa ----------
  const liveId = (tour, key) => `${tour.id}_${key}`;
  // Dati del referto per una gara ancora senza risultato ufficiale (null se assente o per altre squadre).
  function liveFor(tour, m) {
    const lv = S().live && S().live[liveId(tour, m.key)];
    if (!lv || m.stats || lv.a !== m.a || lv.b !== m.b) return null;
    if (lv.status === 'live' && !(lv.sets && lv.sets.length)) return null;
    return lv.status === 'live' || lv.status === 'finished' ? lv : null;
  }
  function rawLive(tour, m) {
    const lv = S().live && S().live[liveId(tour, m.key)];
    return lv && lv.a === m.a && lv.b === m.b ? lv : null;
  }
  const liveSummary = lv => `${lv.setsWon.a}-${lv.setsWon.b}${lv.sets && lv.sets.length ? ` (${lv.sets.map(x => `${x[0]}-${x[1]}`).join(', ')})` : ''}${lv.outcome ? ` · ${lv.outcome.type.toUpperCase()}` : ''}`;
  const liveSets = lv => (lv.sets || []).map(x => `${x[0]}-${x[1]}`).join('  ');
  const liveTag = lv => lv.status === 'live'
    ? `<span class="live-badge"><i class="dot" aria-hidden="true"></i>${esc(t('liveBadge'))}</span>`
    : `<span class="pending-badge"><i class="ti ti-hourglass" aria-hidden="true"></i> ${esc(t('pendingBadge'))}</span>`;
  const liveWin = (lv, side) => lv.status === 'finished' && lv.winner === side;
  // Pulsanti accanto alla gara (admin): link per il refertista e, se il referto è concluso, omologa.
  function escoreButtons(tour, m) {
    if (!(canEdit(tour) || (scorerTour(tour) && !tour.closed)) || m.bye || m.stats || !L.real(m.a) || !L.real(m.b)) return '';
    const lv = liveFor(tour, m);
    return `<div class="cal-actions">
      <button class="btn small escore-btn" data-action="escore-open" data-tid="${tour.id}" data-key="${m.key}" title="${esc(t('escoreTitle'))}"><i class="ti ti-device-mobile" aria-hidden="true"></i> ${esc(t('escoreBtn'))}</button>
      ${lv && lv.status === 'finished' && tourAdmin() ? `<button class="btn small primary" data-action="escore-approve" data-tid="${tour.id}" data-key="${m.key}"><i class="ti ti-rosette-discount-check" aria-hidden="true"></i> ${esc(t('approveResult'))}</button>` : ''}
    </div>`;
  }

  // ---------- visibilità delle gare ai visitatori ----------
  const isVisible = (tour, m) => !!(tour.visible && tour.visible[m.key]);

  function visToggle(tour, key, vis) {
    return `<button class="vis-toggle ${vis ? 'on' : ''}" data-action="toggle-visible" data-tid="${tour.id}" data-key="${key}"
      title="${esc(t(vis ? 'hideGroup' : 'publishGroup'))}" aria-label="${esc(t('visibleToPublic'))}" aria-pressed="${vis}">
      <i class="ti ti-${vis ? 'eye' : 'eye-off'}" aria-hidden="true"></i></button>`;
  }

  function visibilityBar(tour, planned) {
    if (!tourAdmin()) return '';
    const n = planned.length, v = planned.filter(m => isVisible(tour, m)).length;
    return `<div class="card vis-bar">
      <div class="vis-count"><i class="ti ti-${v === n ? 'eye' : 'eye-off'}" aria-hidden="true"></i> <strong>${esc(t('visibleCount', { v, n }))}</strong></div>
      <p class="muted small">${esc(t('visibilityHelp'))}</p>
      <div class="btn-row">
        <button class="btn small primary" data-action="vis-all" data-tid="${tour.id}" data-value="1"><i class="ti ti-eye" aria-hidden="true"></i> ${esc(t('publishAll'))}</button>
        <button class="btn small" data-action="vis-all" data-tid="${tour.id}" data-value="0"><i class="ti ti-eye-off" aria-hidden="true"></i> ${esc(t('hideAll'))}</button>
        <a class="btn small" href="#/t/${tour.id}/referti"><i class="ti ti-folder" aria-hidden="true"></i> ${esc(t('archive'))}</a>
      </div>
    </div>`;
  }

  function groupVisButtons(tour, items) {
    if (!tourAdmin()) return '';
    const keys = items.map(m => m.key).join(',');
    const allVis = items.every(m => isVisible(tour, m));
    return `<button class="btn small" data-action="vis-group" data-tid="${tour.id}" data-keys="${esc(keys)}" data-value="${allVis ? 0 : 1}">
      <i class="ti ti-${allVis ? 'eye-off' : 'eye'}" aria-hidden="true"></i> ${esc(t(allVis ? 'hideGroup' : 'publishGroup'))}</button>`;
  }

  function setVisible(tour, keys, value) {
    keys.forEach(k => { if (value) tour.visible[k] = true; else delete tour.visible[k]; });
  }

  function calRow(tour, m, hideDate) {
    const s = m.stats;
    const lv = liveFor(tour, m);
    const edit = canEdit(tour);
    const when = scheduleText(tour, m.key, hideDate);
    const sets = s ? [m.res.sets.map(([a, b]) => `${a}-${b}`).join('  '), s.tag].filter(Boolean).join(' · ') : lv ? liveSets(lv) : '';
    const line = (id, side) => `<span class="cal-team ${(s && s.winner === side) || (lv && liveWin(lv, side)) ? 'win' : ''}">
        <span class="nm">${slotName(tour, m, side === 'b' ? 1 : 0)}</span><b class="sc">${s ? s[side].sw : lv ? lv.setsWon[side] : ''}</b></span>`;
    const inner = `
      <span class="cal-head">
        <span class="cal-when">${when ? `<i class="ti ti-clock" aria-hidden="true"></i> ${esc(when)}` : `<span class="muted">${esc(t('toBeScheduled'))}</span>`}</span>
        <span class="cal-phase">${tourAdmin() && !isVisible(tour, m) ? `<span class="badge hidden-b"><i class="ti ti-eye-off" aria-hidden="true"></i> ${esc(t('hiddenBadge'))}</span> ` : ''}${gNo(tour, m) ? `<b class="gno">${gNo(tour, m)}</b> ` : ''}${esc(phaseLabel(tour, m))}</span>
      </span>
      <span class="cal-teams">${line(m.a, 'a')}${line(m.b, 'b')}</span>
      ${lv ? `<span class="cal-sets live-sets">${liveTag(lv)} ${esc(sets)}</span>` : sets ? `<span class="cal-sets">${esc(sets)}</span>` : tourAdmin() && m.draft ? `<span class="cal-sets draft">${esc(t('notClosed'))}</span>` : ''}`;
    const vis = isVisible(tour, m);
    return `<li class="cal-item ${s ? 'played' : ''} ${lv ? 'is-' + lv.status : ''} ${tourAdmin() ? 'with-vis' : ''} ${tourAdmin() && !vis ? 'is-hidden' : ''}">${tourAdmin() ? visToggle(tour, m.key, vis) : ''}${edit
      ? `<button class="cal-btn" data-action="edit-match" data-tid="${tour.id}" data-key="${m.key}">${inner}</button>`
      : `<div class="cal-btn">${inner}</div>`}${escoreButtons(tour, m)}</li>`;
  }

  // ---------- tabelloni ----------
  function koCard(tour, m, title) {
    // Gara nascosta: i visitatori vedono le squadre nel tabellone ma non orario, campo e risultato.
    const vis = m.bye || isVisible(tour, m);
    const show = tourAdmin() || vis;
    const stats = show ? m.stats : null;
    const lv = show ? liveFor(tour, m) : null;
    const sets = stats ? m.res.sets : lv ? lv.sets || [] : [];
    const edit = canEdit(tour) && !m.bye;
    const line = (id, side) => `<div class="ko-team ${(stats && m.winner === id && L.real(id)) || (lv && liveWin(lv, side ? 'b' : 'a')) ? 'win' : ''}">
        <span class="ko-name">${slotName(tour, m, side)}</span>
        <span class="ko-sets">${sets.map(x => `<b>${x[side]}</b>`).join('')}</span></div>`;
    const sch = show ? scheduleText(tour, m.key) : '';
    return `<button class="ko-card ${stats ? 'played' : ''} ${m.bye ? 'is-bye' : ''}" ${edit ? '' : 'disabled'} data-action="edit-match" data-tid="${tour.id}" data-key="${m.key}">
      ${gNo(tour, m) ? `<small class="gno-tag">${gNo(tour, m)}${tourAdmin() && !vis ? ` · <span class="hidden-b"><i class="ti ti-eye-off" aria-hidden="true"></i> ${esc(t('hiddenBadge'))}</span>` : ''}</small>` : ''}
      ${line(m.a, 0)}${line(m.b, 1)}
      ${stats && stats.tag ? `<small class="tag">${esc(stats.tag)}</small>` : ''}
      ${lv ? `<small class="ko-live">${liveTag(lv)}</small>` : ''}
      ${!stats && tourAdmin() && m.draft ? `<small class="draft">${esc(t('notClosed'))}</small>` : ''}
      ${sch ? `<small class="muted">${esc(sch)}</small>` : ''}
    </button>`;
  }

  // Tabellone: con connected=true le partite sono raggruppate a coppie e collegate da linee
  // alla partita del turno successivo (le linee diventano colorate quando la gara è decisa).
  function bracketCols(tour, rounds, labelFn, connected) {
    const slot = m => `<div class="br-slot ${m.winner && L.real(m.winner) ? 'done' : ''}">${koCard(tour, m)}</div>`;
    return `<div class="bracket ${connected ? 'connected' : ''}">${rounds.map((round, r) => {
      let body;
      if (connected && r < rounds.length - 1) {
        const pairs = [];
        for (let i = 0; i < round.length; i += 2) pairs.push(`<div class="br-pair">${slot(round[i])}${round[i + 1] ? slot(round[i + 1]) : ''}</div>`);
        body = pairs.join('');
      } else {
        body = round.map(slot).join('');
      }
      return `<div class="br-col"><h3>${esc(labelFn(r))}</h3><div class="br-matches">${body}</div></div>`;
    }).join('')}</div>`;
  }

  function tabQual(tour) {
    const rounds = L.computeQual(tour);
    const winners = L.qualWinners(tour);
    return `
      <p class="muted">${esc(t('qualSummary', { spots: tour.config.qualSpots }))}</p>
      <div class="bracket-scroll">${bracketCols(tour, rounds, r => r === rounds.length - 1 ? t('qualDecisive') : t('qualRound', { n: r + 1 }), true)}</div>
      ${winners ? `<div class="card"><h2>${esc(t('qualifiedTeams'))}</h2><ol class="plain-list">${winners.map(id => `<li>${teamName(tour, id)}</li>`).join('')}</ol></div>` : ''}`;
  }

  function tabPools(tour) {
    const qualify = tour.format === 'round_robin' ? 0 : tour.config.qualify;
    const gs = tour.format === 'gold_silver';
    const goldIds = gs ? new Set(L.gsSplit(tour).gold.map(x => x.id)) : null;
    return `<div class="pools-grid">${tour.pools.map((p, pi) => {
      const st = L.poolStandings(tour, pi);
      const matches = L.poolMatches(tour, pi);
      return `<div class="card pool">
        <h2>${esc(p.name ? `${t('pool')} ${p.name}` : t('singlePool'))}${gs ? ` <span class="badge">${esc(t(p.mode === 'fivb' ? 'gsModeFivb' : 'gsModeRr'))}</span>` : ''}</h2>
        <div class="table-wrap"><table class="table standings">
          <thead><tr><th class="num">#</th><th>${esc(t('team'))}</th><th class="num">${esc(t('winsShort'))}-${esc(t('lossesShort'))}</th><th class="num">${esc(t('ptsShort'))}</th><th class="num hide-sm">${esc(t('setsShort'))}</th><th class="num">${esc(t('pointsRatio'))}</th></tr></thead>
          <tbody>${st.map((r, i) => `<tr class="${gs ? (goldIds.has(r.id) ? 'qualified' : '') : i < qualify ? 'qualified' : ''}">
            <td class="num">${i + 1}</td><td>${teamName(tour, r.id)}</td><td class="num">${r.w}-${r.l}</td>
            <td class="num"><strong>${r.mp}</strong></td><td class="num hide-sm">${r.sw}:${r.sl}</td>
            <td class="num">${r.played ? (r.pl ? (r.pw / r.pl).toFixed(3) : '∞') : '—'}</td></tr>`).join('')}
          </tbody></table></div>
        <ul class="cal-list">${matches.filter(m => tourAdmin() || isVisible(tour, m)).map(m => calRow(tour, m)).join('')}</ul>
      </div>`;
    }).join('')}</div>
    <p class="muted small">${esc(t(gs ? 'gsLegend' : tour.format === 'fivb_pools' ? 'fivbLegend' : 'tiebreakLegend'))}</p>`;
  }

  function teamText(tour, id) {
    const e = entryById(tour, id);
    if (!e) return '?';
    const a = player(e.p1), b = player(e.p2);
    return `${shortName(a)} / ${shortName(b)}`;
  }

  // Fase finale dopo i gironi: l'admin assegna le squadre qualificate alle partite del primo turno.
  function slotAssignCard(tour) {
    const br = tour.bracket;
    if (!tourAdmin() || !br.manual || tour.closed) return '';
    const cands = L.bracketCandidates(tour);
    const byes = br.size - br.qualified;
    const placed = br.slots.filter(Boolean).length;
    const usedAt = {};
    br.slots.forEach((id, i) => { if (id) usedAt[id] = i; });
    const select = idx => {
      const cur = br.slots[idx];
      return `<select data-change="slot-assign" data-tid="${tour.id}" data-idx="${idx}" aria-label="${esc(t('chooseTeam'))}">
        <option value="">— ${esc(t('chooseTeam'))} —</option>
        ${cands.map(c => `<option value="${c.id}" ${cur === c.id ? 'selected' : ''}>${c.rank}° ${esc(t('pool'))} ${esc(c.pool)}${c.mp != null ? ` (${c.mp} ${esc(t('ptsShort'))})` : ''} · ${esc(teamText(tour, c.id))}${usedAt[c.id] != null && usedAt[c.id] !== idx ? ' ✓' : ''}</option>`).join('')}
        ${byes ? `<option value="${L.BYE}" ${cur === L.BYE ? 'selected' : ''}>BYE</option>` : ''}
      </select>`;
    };
    const clashes = tour.format === 'gold_silver' ? L.gsClashes(tour, br.slots) : [];
    const clashNote = clashes.length ? `<p class="note warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> ${esc(t('gsClashWarn'))}<br>${clashes.map(c => esc(t('gsClashRow', { a: teamText(tour, c.a), b: teamText(tour, c.b), pool: c.pool }))).join('<br>')}</p>` : '';
    const rows = [];
    for (let i = 0; i < br.size / 2; i++) {
      const no = nums(tour)['W0-' + i];
      rows.push(`<div class="assign-row"><b class="gno">${no || '#' + (i + 1)}</b>${select(2 * i)}<span class="vs">vs</span>${select(2 * i + 1)}</div>`);
    }
    return `<div class="card">
      <h2><i class="ti ti-arrows-shuffle" aria-hidden="true"></i> ${esc(t('assignTitle'))} <span class="badge ${placed === br.size ? 'st-done' : ''}">${placed}/${br.size}</span></h2>
      <p class="muted small">${esc(tour.format === 'gold_silver' ? t('assignHelpGs', { b: byes }) : t('assignHelp', { q: tour.config.qualify, b: byes }))}</p>
      ${clashNote}
      <div class="assign-list">${rows.join('')}</div>
      <div class="btn-row">
        <button class="btn" data-action="auto-fill-bracket" data-tid="${tour.id}"><i class="ti ti-wand" aria-hidden="true"></i> ${esc(t('autoFill'))}</button>
        <button class="btn" data-action="clear-bracket-slots" data-tid="${tour.id}"><i class="ti ti-eraser" aria-hidden="true"></i> ${esc(t('clearSlots'))}</button>
      </div>
    </div>`;
  }

  function tabBracket(tour) {
    const cm = L.computeMain(tour);
    const size = tour.bracket.size;
    const assign = slotAssignCard(tour);
    if (tour.format === 'gold_silver') {
      const sv = cm.silver;
      return `${assign}
        <h2 class="section-title gs-title gold">🥇 Gold</h2>
        ${cm.champion ? `<p class="champion"><i class="ti ti-trophy" aria-hidden="true"></i> ${teamName(tour, cm.champion)}</p>` : ''}
        <div class="bracket-scroll">${bracketCols(tour, cm.rounds, r => roundLabel(size / 2 ** r), true)}</div>
        ${cm.third ? `<div class="third"><h3>${esc(t('thirdPlace'))}</h3>${koCard(tour, cm.third)}</div>` : ''}
        ${sv ? `<h2 class="section-title gs-title silver">🥈 Silver</h2>
        ${sv.champion ? `<p class="champion"><i class="ti ti-trophy" aria-hidden="true"></i> ${teamName(tour, sv.champion)}</p>` : ''}
        <div class="bracket-scroll">${bracketCols(tour, sv.rounds, r => roundLabel(tour.silver.size / 2 ** r), true)}</div>
        ${sv.third ? `<div class="third"><h3>${esc(t('thirdPlace'))}</h3>${koCard(tour, sv.third)}</div>` : ''}` : ''}`;
    }
    if (cm.type === 'single') {
      return `${assign}${cm.champion ? `<p class="champion"><i class="ti ti-trophy" aria-hidden="true"></i> ${teamName(tour, cm.champion)}</p>` : ''}
        <div class="bracket-scroll">${bracketCols(tour, cm.rounds, r => roundLabel(size / 2 ** r), true)}</div>
        ${cm.third ? `<div class="third"><h3>${esc(t('thirdPlace'))}</h3>${koCard(tour, cm.third)}</div>` : ''}`;
    }
    return `${cm.champion ? `<p class="champion"><i class="ti ti-trophy" aria-hidden="true"></i> ${teamName(tour, cm.champion)}</p>` : ''}
      <h2 class="section-title">${esc(t('winnersBracket'))}</h2>
      <div class="bracket-scroll">${bracketCols(tour, cm.wb, r => r === cm.wb.length - 1 ? t('final') : t('roundN', { n: r + 1 }), true)}</div>
      <h2 class="section-title">${esc(t('losersBracket'))}</h2>
      <div class="bracket-scroll">${bracketCols(tour, cm.lb, r => r === cm.lb.length - 1 ? t('final') : t('roundN', { n: r + 1 }), false)}</div>
      <div class="third"><h3>${esc(t('grandFinal'))}</h3>${koCard(tour, cm.gf)}</div>`;
  }

  function tabFinal(tour) {
    const pl = L.placements(tour);
    if (!pl || (!tour.closed && !tourAdmin())) return `<div class="card"><p class="muted">${esc(t('finalNotReady'))}</p></div>`;
    const rows = tour.entries.filter(e => pl[e.id] != null).sort((a, b) => pl[a.id] - pl[b.id]);
    return `<div class="card">
      <h2>${esc(t('finalStandings'))}</h2>
      ${tour.closed ? '' : `<p class="note warn">${esc(t('finalPreview'))}</p>`}
      <div class="table-wrap"><table class="table">
        <thead><tr><th class="num">${esc(t('place'))}</th><th>${esc(t('team'))}</th><th class="num">${esc(t('teamPts'))}</th><th class="num">${esc(t('perPlayer'))}</th></tr></thead>
        <tbody>${rows.map(e => {
          const tp = L.teamPoints(S(), tour, pl[e.id]);
          return `<tr class="${pl[e.id] <= 3 ? 'podium' : ''}">
          <td class="num">${medal(pl[e.id])}</td>
          <td>${teamName(tour, e.id)}${tour.format === 'gold_silver' ? ` <span class="badge ${pl[e.id] <= L.goldCount(tour) ? 'gs-gold' : 'gs-silver'}">${pl[e.id] <= L.goldCount(tour) ? 'Gold' : 'Silver'}</span>` : ''}<div class="muted small"><a href="#/p/${e.p1}">${esc(playerFull(player(e.p1)))}</a> · <a href="#/p/${e.p2}">${esc(playerFull(player(e.p2)))}</a></div></td>
          <td class="num">${fmtPts(tp)}</td><td class="num"><strong>${fmtPts(tp / 2)}</strong></td></tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>`;
  }

  // ---------- gestione del torneo (admin) ----------
  function stepIndex(tour) {
    if (tour.closed) return 5;
    if (tour.mainIds) return 4;
    if (tour.qualClosed) return 3;
    if (tour.qual || tour.entryLocked) return 2;
    return 1;
  }

  // Gold & Silver: come verranno i gironi con l'ordine attuale della lista (serpentina).
  function gsPreviewCard(tour) {
    const ids = tour.mainList || [];
    if (ids.length < 3) return '';
    const sizes = L.gsSizes(tour, ids.length);
    const pools = L.snakeSizes(ids, sizes);
    const modes = tour.config.poolModes || [];
    return `<div class="card">
      <h2><i class="ti ti-layout-grid" aria-hidden="true"></i> ${esc(t('gsPreviewTitle'))}</h2>
      <p class="muted small">${esc(t(tour.mainLocked ? 'gsPreviewHelpLocked' : 'gsPreviewHelp'))}</p>
      <div class="gs-preview">${pools.map((teamIds, pi) => `<div class="gs-preview-pool">
        <h3>${esc(t('pool'))} ${String.fromCharCode(65 + pi)} <span class="badge">${esc(t(teamIds.length === 4 && modes[pi] === 'fivb' ? 'gsModeFivb' : 'gsModeRr'))}</span></h3>
        <ol>${teamIds.map(id => `<li><b class="seed-no">${ids.indexOf(id) + 1}</b> ${esc(teamText(tour, id))}</li>`).join('')}</ol>
      </div>`).join('')}</div>
    </div>`;
  }

  function tabManage(tour) {
    const rph = regPhase(tour);
    if (rph && rph !== 'formula') return regManagePanel(tour);
    if (canOpenReg(tour) && ui.openRegFor === tour.id) return openRegCard(tour);
    const step = stepIndex(tour);
    const steps = ['stepEntries', 'stepQual', 'stepMainList', 'stepMain', 'stepClosed'];
    const stepper = `<ol class="stepper">${steps.map((k, i) => `<li class="${i + 1 < step ? 'done' : i + 1 === step ? 'current' : ''}">${esc(t(k))}</li>`).join('')}</ol>`;
    const btn = (action, label, cls, disabled, icon) => `<button class="btn ${cls || ''}" data-action="${action}" data-tid="${tour.id}" ${disabled ? 'disabled' : ''}>${icon ? `<i class="ti ti-${icon}" aria-hidden="true"></i> ` : ''}${esc(label)}</button>`;
    let panel = '';

    if (tour.closed) {
      panel = `<div class="card"><h2><i class="ti ti-circle-check" aria-hidden="true"></i> ${esc(t('tournamentClosed'))}</h2><p class="muted">${esc(t('tournamentClosedHelp'))}</p>
        <div class="btn-row">${btn('reopen-tournament', t('reopenTournament'), 'danger')}</div></div>`;
    } else if (tour.mainIds) {
      const all = L.allMatches(tour).filter(m => !m.bye && (m.stage !== 'qual'));
      const done = all.filter(m => m.stats).length;
      const needKo = L.hasPools(tour.format) && L.hasBracket(tour.format) && !tour.bracket;
      const canClose = !!L.placements(tour);
      const pendingSlots = tour.bracket && tour.bracket.manual && tour.bracket.slots.some(s => !s);
      panel = `<div class="card"><h2>${esc(t('stepMain'))}</h2>
        ${progress(done, all.length)}
        ${pendingSlots ? `<p class="note warn">${esc(t('assignPending'))} <a href="#/t/${tour.id}/bracket">${esc(t('tab_bracket'))} →</a></p>` : ''}
        <div class="btn-row">
          ${needKo ? btn('gen-bracket', t('generateKo'), 'primary', !L.poolsComplete(tour)) : ''}
          ${btn('close-tournament', t('closeTournament'), 'primary', !canClose)}
          <a class="btn" href="#/t/${tour.id}/calendar">${esc(t('tab_calendar'))} →</a>
          ${btn('reset-main', t('resetMain'), 'danger')}
        </div>
        ${needKo && !L.poolsComplete(tour) ? `<p class="muted small">${esc(t('koAfterPools'))}</p>` : ''}
        ${!canClose ? `<p class="muted small">${esc(t('closeWhenDone'))}</p>` : ''}</div>`;
    } else if (tour.qualClosed) {
      const check = L.mainDrawCheck(tour);
      panel = `<div class="card"><h2>${esc(t('stepMainList'))}</h2>
        <p class="muted">${esc(t(tour.mainLocked ? 'mainListLockedHelp' : 'mainListHelp'))}</p>
        ${entryTable(tour, tour.mainList, tour.mainLocked ? {} : { movable: 'main', posInput: tour.format === 'gold_silver' })}
        <div class="btn-row">
          ${tour.mainLocked
            ? btn('unlock-main', t('unlockList')) + btn('start-main', t('generateMain'), 'primary', !!check)
            : btn('sort-main', t('sortByPoints')) + btn('lock-main', t('lockList'), 'primary')}
          ${btn('reopen-qual', t('reopenQual'), 'danger')}
        </div>
        ${tour.mainLocked && check ? `<p class="note warn">${esc(t(check.key, check))}</p>` : ''}</div>
        ${tour.format === 'gold_silver' ? gsPreviewCard(tour) : ''}`;
    } else if (tour.qual) {
      const ms = L.allMatches(tour).filter(m => m.stage === 'qual' && !m.bye);
      const done = ms.filter(m => m.stats).length;
      const complete = !!L.qualWinners(tour);
      panel = `<div class="card"><h2>${esc(t('stepQual'))}</h2>
        ${progress(done, ms.length)}
        <div class="btn-row">
          ${btn('close-qual', t('closeQual'), 'primary', !complete)}
          <a class="btn" href="#/t/${tour.id}/calendar">${esc(t('tab_calendar'))} →</a>
          ${btn('reset-qual', t('resetQual'), 'danger')}
        </div>
        ${!complete ? `<p class="muted small">${esc(t('closeQualHelp'))}</p>` : ''}</div>`;
    } else if (tour.entryLocked) {
      const need = L.qualNeeded(tour);
      panel = `<div class="card"><h2>${esc(t('listLocked'))}</h2>
        <p class="muted">${esc(t('splitSummary', { main: tour.split.main.length, qual: tour.split.qual.length, res: tour.split.reserve.length }))}</p>
        <div class="btn-row">
          ${btn('unlock-entries', t('unlockList'))}
          ${need ? btn('gen-qual', t('generateMatches'), 'primary') : btn('skip-qual', t('proceedMain'), 'primary')}
        </div>
        ${!need && tour.config.qualSpots ? `<p class="muted small">${esc(t('noQualNeeded'))}</p>` : ''}</div>
        ${tabEntries(tour)}`;
    } else {
      panel = (canOpenReg(tour) ? `<div class="card"><p class="muted small">${esc(t('regOpenLegacyAsk'))}</p>
          <button class="btn primary" data-action="reg-open-start" data-tid="${tour.id}"><i class="ti ti-pencil-plus" aria-hidden="true"></i> ${esc(t('regOpenLegacy'))}</button></div>` : '')
        + wcCard(tour) + `<div class="card">
        <h2>${esc(t('stepEntries'))} (${tour.entries.length})</h2>
        <p class="muted">${esc(t(tour.gender === 'X' ? 'entriesHelpMixed' : 'entriesHelp'))}</p>
        <div class="btn-row">
          ${btn('import-entries', t('importExcel'), 'primary', false, 'upload')}
          ${btn('template-entries', t('downloadTemplate'), '', false, 'download')}
          ${tour.entries.length > 1 ? btn('sort-entries', t('sortByPoints'), '', false, 'arrows-sort') : ''}
        </div>
        ${entryTable(tour, tour.entries.map(e => e.id), { editable: true })}
        <p class="muted small">${esc(t('entriesEditHelp'))}</p>
        <details class="sub-form"><summary><i class="ti ti-plus" aria-hidden="true"></i> ${esc(t('addTeamManually'))}</summary>
          <form class="grid-form" data-form="entry-add" data-tid="${tour.id}">
            ${teamNameFields(tour)}
            <label>${esc(t('wildCard'))}<select name="wc"><option value="">—</option><option value="main">WC</option><option value="qual">WC-Q</option></select></label>
            <div class="form-actions"><button class="btn primary">${esc(t('add'))}</button></div>
          </form>
          ${teamDatalists(tour)}
        </details>
        <div class="btn-row end">${btn('lock-entries', t('lockList'), 'primary', tour.entries.length < 2, 'lock')}</div>
      </div>`;
    }
    return stepper + panel;
  }

  // Campi cognome/nome dei due giocatori (nei tornei misti: uomo e donna) e suggerimenti dei cognomi.
  function teamNameFields(tour) {
    const g = teamGenders(tour), lab = teamLabels(tour);
    return [1, 2].map(i => `
            <label>${esc(t('lastName'))} ${esc(lab[i - 1])}<input name="l${i}" required list="dl-last-${g[i - 1]}"></label>
            <label>${esc(t('firstName'))} ${esc(lab[i - 1])}<input name="f${i}" required></label>`).join('');
  }

  function teamDatalists(tour) {
    return [...new Set(teamGenders(tour))].map(g => `<datalist id="dl-last-${g}">${[...new Set(S().players.filter(p => p.gender === g).map(p => p.last))]
      .map(n => `<option value="${esc(n)}">`).join('')}</datalist>`).join('');
  }

  const wcLimit = (tour, kind) => (kind === 'qual' ? tour.config.qualWcSpots || 0 : tour.config.wcSpots);

  // Wild card (main draw o qualifiche): numero previsto nella scheda del torneo e squadre assegnate.
  function wcCard(tour) {
    const block = kind => {
      const n = wcLimit(tour, kind);
      const wcs = tour.entries.filter(e => e.wc === kind);
      const label = kind === 'qual' ? t('wcQualSection') : t('wcSection');
      if (!n && !wcs.length) return `<div class="wc-block"><h3>${esc(label)} <span class="badge">0</span></h3><p class="muted small">${esc(t('wcNone'))} <a href="#/t/${tour.id}/edit">${esc(t('tab_edit'))}</a></p></div>`;
      return `<div class="wc-block">
        <h3>${esc(label)} <span class="badge ${wcs.length === n ? 'st-done' : ''}">${wcs.length}/${n}</span></h3>
        ${wcs.length ? `<ul class="player-list">${wcs.map(e => `<li>
          <span class="badge wc">${kind === 'qual' ? 'WC-Q' : 'WC'}</span>
          <span class="pl-name"><strong>${teamName(tour, e.id)}</strong> <small class="muted">${esc(playerFull(player(e.p1)))} · ${esc(playerFull(player(e.p2)))}</small></span>
          <button class="btn small" data-action="set-wc" data-kind="" data-tid="${tour.id}" data-id="${e.id}">${esc(t('removeWc'))}</button></li>`).join('')}</ul>` : ''}
        ${wcs.length > n ? `<p class="note warn">${esc(t('wcTooMany', { n }))}</p>` : ''}
        ${wcs.length >= n ? '' : `<form class="grid-form" data-form="wc-add" data-kind="${kind}" data-tid="${tour.id}">
          ${teamNameFields(tour)}
          <div class="form-actions"><button class="btn primary"><i class="ti ti-star" aria-hidden="true"></i> ${esc(t('addWc'))}</button></div>
        </form>`}
      </div>`;
    };
    return `<div class="card">
      <h2><i class="ti ti-star" aria-hidden="true"></i> ${esc(t('wcTitle'))}</h2>
      <p class="muted">${esc(t('wcHelp'))}</p>
      ${block('main')}
      ${tour.config.qualSpots ? block('qual') : ''}
    </div>`;
  }

  function progress(done, total) {
    return `<div class="toolbar"><span class="progress"><span style="width:${total ? done / total * 100 : 0}%"></span></span>
      <span class="muted">${esc(t('matchesClosed', { done, total }))}</span></div>`;
  }

  // ====================================================================
  // ISCRIZIONI ONLINE, PROFILO, REWARD, MESSAGGI (utenti registrati)
  // ====================================================================
  const member = () => (window.Cloud && !window.Cloud.isAdmin && !window.Cloud.scorer && window.Cloud.member) || null;
  const nowMs = () => Date.now();
  const msOf = v => Date.parse(v) || 0;
  const regOf = tour => tour.reg || null;
  // Fase del torneo con iscrizioni online: open (aperte) → closed (squadre importate) → confirmed (lista
  // ufficiale) → formula (formula scelta: da qui il flusso normale del torneo).
  function regPhase(tour) {
    const r = regOf(tour);
    if (!r) return null;
    if (!r.closed) {
      // stato scelto dall'admin: non ancora aperte / aperte (fino al termine) / chiuse
      if (r.status === 'soon') return 'soon';
      if (r.status === 'closed') return 'expired';
      return nowMs() < msOf(r.deadline) ? 'open' : 'expired';
    }
    if (!r.confirmed) return 'closed';
    return r.formulaSet ? 'formula' : 'confirmed';
  }
  // Squadre già inserite dall'admin (non da iscrizione online): occupano i primi posti finché le iscrizioni sono aperte.
  const presetCount = tour => (tour.reg && !tour.reg.closed ? tour.entries.filter(e => !e.regId).length : 0);
  const regsOf = tour => (S().registrations || []).filter(x => x.tid === tour.id).sort((a, b) => (a.created || 0) - (b.created || 0));
  const personName = p => `${p.last} ${p.first}`;
  // Nome mostrato agli altri: alias dell'admin se l'utente ne ha uno.
  const personLabel = p => (p && p.uid && (S().nicks || {})[p.uid]) || personName(p);
  const sameName = (a, b) => L.nameKey(a.last, a.first) === L.nameKey(b.last, b.first) && a.gender === b.gender;
  // Persona già iscritta al torneo (per uid se registrata, altrimenti per nome e sesso).
  const personInRegs = (tour, p) => regsOf(tour).find(r => [r.p1, r.p2].some(x => (p.uid && x.uid === p.uid) || (!p.uid && !x.uid && sameName(x, p)) || (p.uid && !x.uid && sameName(x, p))));

  // ---------- reward (stelline, stelle comete, Terra, pianeti, galassia) ----------
  const REWARDS = [['star', '⭐'], ['comet', '☄️'], ['earth', '🌍'], ['planets', '🪐'], ['galaxy', '🌌']];
  // Tornei disputati: il giocatore è nella lista ufficiale (confermata o bloccata).
  function playedCount(pid) {
    return S().tournaments.filter(tr => (tr.reg ? tr.reg.confirmed : tr.entryLocked) && tr.entries.some(e => e.p1 === pid || e.p2 === pid)).length;
  }
  function rewardFor(n) {
    const th = S().rewards || {};
    let best = null;
    REWARDS.forEach(([k, icon]) => { const v = Number(th[k]); if (v > 0 && n >= v) best = { key: k, icon }; });
    return best;
  }
  // Reward visibili solo all'admin nelle liste (l'utente vede il suo nel profilo).
  const rewardBadge = n => { if (!tourAdmin()) return ''; const r = rewardFor(n); return r ? `<span class="reward" title="${esc(t('rw_' + r.key))}">${r.icon}</span>` : ''; };

  function rewardsCard() {
    const th = S().rewards || {};
    return `<form class="card" data-form="rewards-save" id="rewards">
      <h2><i class="ti ti-star" aria-hidden="true"></i> ${esc(t('rewardsTitle'))}</h2>
      <p class="muted small">${esc(t('rewardsHelp'))}</p>
      <div class="grid-form">${REWARDS.map(([k, icon]) => `<label>${icon} ${esc(t('rw_' + k))}
        <input name="${k}" type="number" min="0" inputmode="numeric" value="${th[k] || ''}" placeholder="—"></label>`).join('')}</div>
      <div class="form-actions"><button class="btn primary">${esc(t('save'))}</button></div>
    </form>`;
  }

  // ---------- omonimi (utenti registrati con stesso nome, cognome e sesso) ----------
  const nameKeyOf = p => `${p.gender}|${L.nameKey(p.last, p.first)}`;
  function homonymGroups() {
    const g = {};
    (S().members || []).forEach(m => { (g[nameKeyOf(m)] = g[nameKeyOf(m)] || []).push(m); });
    return Object.values(g).filter(list => list.length > 1);
  }
  const isHomonym = p => (S().members || []).filter(m => nameKeyOf(m) === nameKeyOf(p)).length > 1;
  // Gruppi di omonimi ancora da distinguere con un alias (due o più persone mostrate con lo stesso nome).
  const homonymPending = () => homonymGroups().filter(list => new Set(list.map(m => personLabel(m).toLowerCase())).size < list.length);

  // ---------- giocatore collegato all'utente ----------
  // Per uid; per nome solo se il nome non è condiviso da più utenti (omonimi: li collega l'admin).
  function memberPlayer(m) {
    if (!m) return null;
    const byUid = S().players.find(p => p.uid === m.uid);
    if (byUid || isHomonym(m)) return byUid || null;
    return S().players.find(p => !p.uid && p.gender === m.gender && L.nameKey(p.last, p.first) === L.nameKey(m.last, m.first)) || null;
  }

  // Persona di un'iscrizione → giocatore dell'anagrafica (creato se manca; collegato all'utente se registrato).
  function personToPlayer(p, created) {
    if (p.uid) {
      let pl = S().players.find(x => x.uid === p.uid);
      if (!pl && !isHomonym(p)) pl = S().players.find(x => !x.uid && x.gender === p.gender && L.nameKey(x.last, x.first) === L.nameKey(p.last, p.first));
      if (!pl) { pl = { id: Store.uid('p'), first: p.first, last: p.last, gender: p.gender, club: '', base: 0 }; S().players.push(pl); created.n++; }
      pl.uid = p.uid;
      return pl;
    }
    return findOrCreatePlayer(p.last, p.first, p.gender, created);
  }

  // ---------- utenti registrati (solo admin): email, alias, giocatore collegato ----------
  // Stato della conferma: email confermata dall'utente, confermato a mano dall'admin, oppure da confermare.
  function verifyBadge(uid) {
    if ((S().emailVerified || {})[uid]) return `<span class="badge st-done"><i class="ti ti-mail-check" aria-hidden="true"></i> ${esc(t('verEmail'))}</span>`;
    if ((S().manualVerified || {})[uid]) return `<span class="badge st-done"><i class="ti ti-user-check" aria-hidden="true"></i> ${esc(t('verManual'))}</span>
      <button class="btn small" data-action="ver-manual" data-uid="${uid}" data-on="0">${esc(t('verUndo'))}</button>`;
    return `<span class="badge warn-b">${esc(t('verPending'))}</span>
      <button class="btn small primary" data-action="ver-manual" data-uid="${uid}" data-on="1"><i class="ti ti-check" aria-hidden="true"></i> ${esc(t('verConfirm'))}</button>`;
  }

  // Riepilogo dei ruoli: admin generali (fissi), admin tornei, cassa, coach e refertisti.
  function rolesCard() {
    const rs = S().roles || {};
    const who = r => Object.entries(rs).filter(([, v]) => v && v[r]).map(([uid, v]) => { const m = memberByUid(uid); return m ? personName(m) : v.name || uid; }).sort();
    const coaches = (S().coaches || []).map(c => coachName(c.id)).sort();
    const row = (icon, label, help, names) => `<li><span class="reg-names"><strong><i class="ti ti-${icon}" aria-hidden="true"></i> ${esc(label)}</strong>
      <br><small class="muted">${esc(help)}</small><br>${names.length ? names.map(n => `<span class="badge">${esc(n)}</span>`).join(' ') : `<small class="muted">—</small>`}</span></li>`;
    return `<div class="card" id="roles"><h2><i class="ti ti-key" aria-hidden="true"></i> ${esc(t('rolesTitle'))}</h2>
      <p class="muted small">${esc(t('rolesHelp'))}</p>
      <ul class="reg-list">
        ${row('crown', t('role_general'), t('roleHelp_general'), ['pierpaolomurgioni@gmail.com'])}
        ${row('trophy', t('role_tour'), t('roleHelp_tour'), who('tour'))}
        ${row('cash-register', t('role_cash'), t('roleHelp_cash'), who('cash'))}
        ${row('whistle', t('role_coach'), t('roleHelp_coach'), coaches)}
        ${row('device-mobile', t('role_scorer'), t('roleHelp_scorer'), [])}
      </ul></div>`;
  }
  function viewUsers() {
    const f = L.norm(ui.userFilter || '');
    const acc = S().accounts || {};
    const pend = new Set(homonymPending().flat().map(m => m.uid));
    const homs = new Set(homonymGroups().flat().map(m => m.uid));
    const list = (S().members || []).filter(m => !f || L.norm(`${m.first} ${m.last} ${acc[m.uid] || ''} ${(S().nicks || {})[m.uid] || ''}`).includes(f))
      .sort((a, b) => personName(a).localeCompare(personName(b)));
    const linked = m => S().players.find(p => p.uid === m.uid);
    return `
      <div class="page-head"><a class="back" href="#/settings">← ${esc(t('settings'))}</a><h1><i class="ti ti-users" aria-hidden="true"></i> ${esc(t('usersTitle'))} (${(S().members || []).length})</h1>
        <p class="muted">${esc(t('usersIntro'))}</p></div>
      ${pend.size ? `<p class="note warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> ${esc(t('homonymWarn'))}</p>` : ''}
      ${rolesCard()}
      <details class="card sub-form" data-keep="user-create" ${keepOpen('user-create')}><summary><i class="ti ti-user-plus" aria-hidden="true"></i> ${esc(t('userCreateTitle'))}</summary>
        <p class="muted small">${esc(t('userCreateHelp'))}</p>
        <form class="grid-form" data-form="user-create">
          <label>${esc(t('firstName'))}<input name="first" required maxlength="60"></label>
          <label>${esc(t('lastName'))}<input name="last" required maxlength="60"></label>
          <label>${esc(t('gender'))}<select name="gender" required><option value="">—</option><option value="M">${esc(t('male'))}</option><option value="F">${esc(t('female'))}</option></select></label>
          <label>Email<input name="email" type="email" required autocomplete="off" autocapitalize="off" spellcheck="false"></label>
          <label>${esc(t('password'))}<input name="password" type="text" required minlength="6" autocomplete="off"></label>
          <div class="form-actions"><button class="btn primary">${esc(t('userCreateBtn'))}</button></div>
        </form></details>
      <div class="toolbar"><input type="search" class="search" placeholder="${esc(t('search'))}" value="${esc(ui.userFilter || '')}" data-change="user-filter" aria-label="${esc(t('search'))}"></div>
      <div class="card"><ul class="reg-list users-list">${list.map(m => {
        const pl = linked(m);
        const cands = homs.has(m.uid) ? S().players.filter(p => p.gender === m.gender && L.nameKey(p.last, p.first) === L.nameKey(m.last, m.first) && (!p.uid || p.uid === m.uid)) : [];
        return `<li class="${pend.has(m.uid) ? 'homonym' : ''} ${banOf(m.uid).tour || banOf(m.uid).book ? 'banned' : ''}">
          <span class="reg-names"><strong>${esc(personName(m))}</strong> <span class="badge g-${m.gender}">${esc(m.gender)}</span>
            ${homs.has(m.uid) ? `<span class="badge warn-b">${esc(t('homonym'))}</span>` : ''}<br>
            <small class="muted">${esc(acc[m.uid] || '—')}${pl ? ` · ${esc(t('linkedPlayer'))}: <a href="#/p/${pl.id}">${esc(pl.last)} ${esc(pl.first)}</a>` : ''}</small>
            <button class="btn small danger" data-action="user-delete" data-uid="${m.uid}"><i class="ti ti-user-x" aria-hidden="true"></i> ${esc(t('userDelete'))}</button>
            <span class="ban-row">${verifyBadge(m.uid)} ${m.privacyAt ? `<span class="badge st-done" title="${esc(t('privacyAcceptedOn', { d: fmtDate(new Date(m.privacyAt).toLocaleDateString('sv')) }))}"><i class="ti ti-shield-check" aria-hidden="true"></i> ${esc(t('privacyOkBadge'))}</span>` : `<span class="badge tess-no">${esc(t('privacyNoBadge'))}</span>`}${m.deleteReq ? ` <span class="badge st-full">${esc(t('deleteRequested', { d: fmtDate(new Date(m.deleteReq).toLocaleDateString('sv')) }))}</span>` : ''}</span>
            <span class="ban-row"><i class="ti ti-key" aria-hidden="true"></i> ${esc(t('rolesTitle'))}:
              ${['tour', 'cash'].map(r => `<label class="check"><input type="checkbox" data-change="role" data-uid="${m.uid}" data-role="${r}" ${((S().roles || {})[m.uid] || {})[r] ? 'checked' : ''}> ${esc(t('role_' + r))}</label>`).join('')}
              ${coachOf(m.uid) ? `<span class="badge">${esc(t('role_coach'))}</span>` : ''}</span>
            <span class="ban-row"><i class="ti ti-ban" aria-hidden="true"></i> ${esc(t('banTitle'))}:
              <label class="check"><input type="checkbox" data-change="ban" data-uid="${m.uid}" data-what="tour" ${banOf(m.uid).tour ? 'checked' : ''}> ${esc(t('banTour'))}</label>
              <label class="check"><input type="checkbox" data-change="ban" data-uid="${m.uid}" data-what="book" ${banOf(m.uid).book ? 'checked' : ''}> ${esc(t('banBook'))}</label></span></span>
          <form class="nick-form" data-form="nick-save" data-uid="${m.uid}">
            <input name="nick" maxlength="40" value="${esc((S().nicks || {})[m.uid] || '')}" placeholder="${esc(t('nickPh'))}" aria-label="${esc(t('nick'))}">
            ${cands.length ? `<select name="link" aria-label="${esc(t('linkedPlayer'))}"><option value="">${esc(t('linkNone'))}</option>
              ${cands.map(p => `<option value="${p.id}" ${pl && pl.id === p.id ? 'selected' : ''}>${esc(p.last)} ${esc(p.first)} · ${esc(t('tournamentsPlayedN', { n: playedCount(p.id) }))}</option>`).join('')}</select>` : ''}
            <button class="btn small">${esc(t('save'))}</button>
          </form>
        </li>`; }).join('') || `<li class="muted">${esc(t('noMembers'))}</li>`}</ul></div>`;
  }

  // ---------- tornei già creati: apertura delle iscrizioni online ----------
  const canOpenReg = tour => !tour.reg && !tour.closed && !tour.entryLocked && !tour.qual && !tour.mainIds;
  function openRegCard(tour) {
    return `<form class="card grid-form" data-form="reg-open-legacy" data-tid="${tour.id}">
      <h2 class="span-all"><i class="ti ti-pencil-plus" aria-hidden="true"></i> ${esc(t('regOpenLegacy'))}</h2>
      <p class="muted small span-all">${esc(t('regOpenLegacyHelp', { n: tour.entries.length }))}</p>
      <label>${esc(t('startDateTime'))}<input name="startAt" type="datetime-local" required value="${esc(tour.start ? tour.start + 'T09:00' : '')}"></label>
      <label>${esc(t('maxTeams'))}<input name="maxTeams" type="number" min="2" max="128" inputmode="numeric" required value="${Math.max(tour.config.mainSize || 16, tour.entries.length)}"></label>
      <label>${esc(t('regDeadline'))}<input name="deadline" type="datetime-local" required></label>
      <label>${esc(t('regStateTitle'))}<select name="status">
        ${[['soon', 'flagSoon'], ['open', 'flagOpen']].map(([x, k]) => `<option value="${x}" ${x === 'open' ? 'selected' : ''}>${esc(t(k))}</option>`).join('')}
      </select></label>
      <div class="form-actions span-all"><button class="btn primary">${esc(t('regOpenBtn'))}</button></div>
    </form>`;
  }

  // ---------- fase 1: creazione del torneo ----------
  function regForm(tour) {
    const r = tour ? tour.reg : null;
    const v = (x, d) => esc(x != null ? x : (d || ''));
    return `<form class="card grid-form" data-form="${tour ? 'tour-reg-edit' : 'tour-create'}" ${tour ? `data-tid="${tour.id}"` : ''}>
      <h2 class="span-all">${esc(t(tour ? 'regSettings' : 'phase1Title'))}</h2>
      <p class="muted small span-all">${esc(t('phase1Help'))}</p>
      <label class="span-all">${esc(t('name'))}<input name="name" required maxlength="80" value="${v(tour && tour.name)}" placeholder="${esc(t('namePlaceholder'))}"></label>
      <label>${esc(t('startDateTime'))}<input name="startAt" type="datetime-local" required value="${v(r && r.startAt)}"></label>
      <label>${esc(t('gender'))}<select name="gender" ${tour && (tour.entries.length || regsOf(tour).length) ? 'disabled' : ''}>
        <option value="M" ${sel(tour && tour.gender, 'M')}>${esc(t('catMen'))}</option>
        <option value="F" ${sel(tour && tour.gender, 'F')}>${esc(t('catWomen'))}</option>
        <option value="X" ${sel(tour && tour.gender, 'X')}>${esc(t('catMixed'))}</option></select></label>
      <label>${esc(t('maxTeams'))}<input name="maxTeams" type="number" min="2" max="128" inputmode="numeric" required value="${v(r && r.maxTeams, 16)}"></label>
      <label>${esc(t('regDeadline'))}<input name="deadline" type="datetime-local" required value="${v(r && r.deadline)}"></label>
      <label>${esc(t('regStateTitle'))}<select name="status">
        ${[['soon', 'flagSoon'], ['open', 'flagOpen'], ['closed', 'flagClosed']].map(([x, k]) => `<option value="${x}" ${sel((r && r.status) || 'open', x)}>${esc(t(k))}</option>`).join('')}
      </select></label>
      <div class="form-actions span-all">
        <button class="btn primary">${esc(t(tour ? 'save' : 'create'))}</button>
        ${tour ? `<button type="button" class="btn danger" data-action="delete-tournament" data-tid="${tour.id}">${esc(t('deleteTournament'))}</button>` : ''}
      </div>
    </form>`;
  }

  function readRegForm(f) {
    const d = { name: f.name.value.trim(), startAt: f.startAt.value, deadline: f.deadline.value, maxTeams: Math.max(2, parseInt(f.maxTeams.value, 10) || 2), status: f.status ? f.status.value : 'open' };
    if (f.gender && !f.gender.disabled) d.gender = f.gender.value;
    if (!d.name || !d.startAt || !d.deadline) return { err: 'errRegFields' };
    if (msOf(d.deadline) >= msOf(d.startAt)) return { err: 'errRegDeadline' };
    return d;
  }

  // ---------- riepilogo iscrizioni (carte e pagine del torneo) ----------
  function regLine(tour) {
    const r = regOf(tour), ph = regPhase(tour);
    if (!r || ph === 'formula') return '';
    const n = ph === 'open' || ph === 'expired' || ph === 'soon' ? regsOf(tour).length + presetCount(tour) : tour.entries.length;
    const label = ph === 'soon' ? t('flagSoon') : ph === 'open' ? t('regOpenUntil', { d: fmtDateTime(r.deadline) }) : ph === 'expired' ? t('regClosedWait') : ph === 'closed' ? t('regReview') : t('regConfirmedLine');
    return `<p class="reg-line ${ph === 'open' ? 'open' : ''}"><i class="ti ti-${ph === 'open' ? 'pencil-plus' : 'lock'}" aria-hidden="true"></i> ${esc(label)} · ${esc(t('teamsOfMax', { n, max: r.maxTeams }))}</p>`;
  }

  // Lista delle iscrizioni online (in lista / lista d'attesa).
  function regList(tour, opts) {
    opts = opts || {};
    const list = regsOf(tour), max = Math.max(0, tour.reg.maxTeams - presetCount(tour));
    if (!list.length) return `<p class="muted">${esc(t('noRegs'))}</p>`;
    return `<ol class="reg-list">${list.map((x, i) => `<li class="${i >= max ? 'wait' : ''}">
      <span class="reg-no">${i + 1}</span>
      <span class="reg-names">${esc(personLabel(x.p1))} · ${esc(personLabel(x.p2))}${x.p2.uid ? '' : ` <small class="muted">(${esc(t('notRegistered'))})</small>`}</span>
      ${i >= max ? `<span class="badge">${esc(t('waitingList'))}</span>` : ''}
      ${opts.admin ? `<button class="icon-btn" data-action="reg-remove" data-id="${x.id}" title="${esc(t('remove'))}" aria-label="${esc(t('remove'))}">✕</button>` : ''}
    </li>`).join('')}</ol>`;
  }

  // Box di iscrizione nella pagina del torneo.
  function regBox(tour) {
    const r = regOf(tour), ph = regPhase(tour);
    if (!r || ph === 'formula' || ph === 'confirmed') return '';
    const m = member();
    let body;
    if (ph === 'soon') body = `<p class="muted">${esc(t('regSoonMsg'))}</p>`;
    else if (ph !== 'open') body = `<p class="muted">${esc(t('regClosedMsg'))}</p>`;
    else if (tourAdmin()) body = `<p class="muted small">${esc(t('regAdminNote'))}</p>`;
    else if (!m) body = `<p>${esc(t('regLoginFirst'))}</p><a class="btn primary" href="#/settings">${esc(t('loginOrRegister'))}</a>`;
    else if (!regsOf(tour).some(x => x.uids && x.uids.includes(m.uid)) && banOf(m.uid).tour) body = banNotice('tour');
    else if (!regsOf(tour).some(x => x.uids && x.uids.includes(m.uid)) && needsVerify()) body = verifyNotice();
    else {
      const mine = regsOf(tour).find(x => x.uids && x.uids.includes(m.uid));
      if (mine) {
        const pos = regsOf(tour).indexOf(mine) + presetCount(tour);
        body = `<p class="note ok"><i class="ti ti-circle-check" aria-hidden="true"></i> ${esc(t('regDone', { a: personLabel(mine.p1), b: personLabel(mine.p2) }))}
          ${pos >= r.maxTeams ? `<br>${esc(t('regWaitPos', { n: pos - r.maxTeams + 1 }))}` : ''}</p>
          <a class="btn" href="#/me">${esc(t('goProfile'))} →</a>`;
      } else body = regSignupForm(tour, m);
    }
    return `<div class="card reg-box">
      <h2><i class="ti ti-pencil-plus" aria-hidden="true"></i> ${esc(t('regTitle'))}</h2>
      <p class="muted small">${esc(t('regDeadlineLine', { d: fmtDateTime(r.deadline) }))} · ${esc(t('teamsOfMax', { n: regsOf(tour).length + presetCount(tour), max: r.maxTeams }))}</p>
      ${body}
    </div>`;
  }

  function partnerGender(tour, m) { return tour.gender === 'X' ? (m.gender === 'M' ? 'F' : 'M') : tour.gender; }

  function regSignupForm(tour, m) {
    if (tour.gender !== 'X' && m.gender !== tour.gender) return `<p class="note warn">${esc(t('regWrongGender'))}</p>`;
    const g = partnerGender(tour, m);
    const taken = new Set(regsOf(tour).flatMap(x => [x.p1.uid, x.p2.uid]).filter(Boolean));
    const opts = (S().members || []).filter(x => x.gender === g && x.uid !== m.uid && !taken.has(x.uid))
      .sort((a, b) => personLabel(a).localeCompare(personLabel(b)));
    return `<form class="grid-form" data-form="reg-signup" data-tid="${tour.id}">
      <p class="span-all"><strong>${esc(t('regYou'))}:</strong> ${esc(personName(m))}</p>
      <label class="span-all">${esc(t(g === 'F' ? 'regPartnerF' : 'regPartnerM'))}
        <input name="search" list="dl-members" autocomplete="off" placeholder="${esc(t('regSearchPh'))}" data-change="reg-search">
        <datalist id="dl-members">${opts.map(x => `<option value="${esc(personLabel(x))}" data-uid="${x.uid}">`).join('')}</datalist>
        <small class="muted">${esc(t('regSearchHelp'))}</small></label>
      <input type="hidden" name="puid" value="">
      <label>${esc(t('lastName'))}<input name="plast" required maxlength="60"></label>
      <label>${esc(t('firstName'))}<input name="pfirst" required maxlength="60"></label>
      <p class="muted small span-all" data-reg-who></p>
      <div class="form-actions span-all"><button class="btn primary"><i class="ti ti-check" aria-hidden="true"></i> ${esc(t('regSubmit'))}</button></div>
    </form>`;
  }

  function onRegSearch(el) {
    const f = el.form, m = member();
    const tour = tourById(f.dataset.tid);
    const g = partnerGender(tour, m);
    const hit = (S().members || []).find(x => x.gender === g && x.uid !== m.uid && personLabel(x).toLowerCase() === el.value.trim().toLowerCase());
    f.puid.value = hit ? hit.uid : '';
    f.plast.value = hit ? hit.last : f.plast.value;
    f.pfirst.value = hit ? hit.first : f.pfirst.value;
    f.plast.readOnly = f.pfirst.readOnly = !!hit;
    f.querySelector('[data-reg-who]').textContent = hit ? t('regPartnerFound') : el.value ? t('regPartnerNew') : '';
  }

  function submitSignup(f) {
    const m = member(), tour = tourById(f.dataset.tid);
    if (!m || !tour || regPhase(tour) !== 'open') return warn('regClosedMsg');
    if (needsVerify()) return warn('verifyFirst');
    if (banOf(m.uid).tour) return warn('banTourMsg');
    const g = partnerGender(tour, m);
    const puid = f.puid.value || null;
    const p2 = { uid: puid, first: f.pfirst.value.trim(), last: f.plast.value.trim(), gender: g };
    const p1 = { uid: m.uid, first: m.first, last: m.last, gender: m.gender };
    if (!p2.first || !p2.last) return warn('errRegFields');
    if (puid === m.uid || (!puid && sameName(p1, p2))) return warn('errSamePlayer');
    const inEntries = p => tour.entries.some(e => [e.p1, e.p2].some(id => { const x = player(id); return x && ((p.uid && x.uid === p.uid) || (!x.uid && !isHomonym(p) && x.gender === p.gender && L.nameKey(x.last, x.first) === L.nameKey(p.last, p.first))); }));
    if (personInRegs(tour, p1) || inEntries(p1)) return warn('regAlready');
    if (personInRegs(tour, p2) || inEntries(p2)) return warn('regPartnerAlready');
    const btn = f.querySelector('button.primary'); btn.disabled = true;
    window.Cloud.addRegistration({ tid: tour.id, by: m.uid, uids: puid ? [m.uid, puid] : [m.uid], p1, p2 })
      .then(() => { ui.flash = { text: t('regSaved') }; render(); })
      .catch(e => { btn.disabled = false; warn('regError', { code: e.code || e.message }); });
  }

  // ---------- gestione admin del torneo con iscrizioni ----------
  function regManagePanel(tour) {
    const ph = regPhase(tour), r = tour.reg;
    const btn = (action, label, cls, icon, extra) => `<button class="btn ${cls || ''}" data-action="${action}" data-tid="${tour.id}" ${extra || ''}>${icon ? `<i class="ti ti-${icon}" aria-hidden="true"></i> ` : ''}${esc(label)}</button>`;
    const steps = ['regStepOpen', 'regStepReview', 'regStepFormula', 'regStepPlay'];
    const cur = { soon: 1, open: 1, expired: 1, closed: 2, confirmed: 3 }[ph] || 4;
    const stepper = `<ol class="stepper">${steps.map((k, i) => `<li class="${i + 1 < cur ? 'done' : i + 1 === cur ? 'current' : ''}">${esc(t(k))}</li>`).join('')}</ol>`;
    if (ph === 'open' || ph === 'expired' || ph === 'soon') {
      const stv = r.status || 'open';
      return stepper + `<div class="card">
        <h2>${esc(t('regStateTitle'))}</h2>
        <div class="segmented wrap" role="group">
          ${[['soon', 'flagSoon'], ['open', 'flagOpen'], ['closed', 'flagClosed']].map(([v, k]) => `<button data-action="reg-state" data-tid="${tour.id}" data-v="${v}" aria-pressed="${stv === v}">${esc(t(k))}</button>`).join('')}
        </div>
        <p class="muted small">${esc(t(stv === 'open' && ph === 'expired' ? 'regStateExpired' : 'regStateHelp', { d: fmtDateTime(r.deadline) }))}</p>
      </div><div class="card">
        <h2>${esc(t('regStepOpen'))} · ${esc(t('teamsOfMax', { n: regsOf(tour).length + presetCount(tour), max: r.maxTeams }))}</h2>
        ${presetCount(tour) ? `<p class="muted small">${esc(t('regPreset', { n: presetCount(tour) }))}</p>` : ''}
        <p class="muted">${esc(t(ph === 'open' ? 'regAdminOpenHelp' : ph === 'soon' ? 'regAdminSoonHelp' : stv === 'closed' ? 'regAdminClosedHelp' : 'regAdminExpiredHelp', { d: fmtDateTime(r.deadline) }))}</p>
        ${regList(tour, { admin: true })}
        <div class="btn-row">${btn('reg-import', t('regImport'), 'primary', 'download')}</div>
      </div>`;
    }
    if (ph === 'closed') {
      const gone = tour.entries.filter(e => e.regId && !regsOf(tour).some(x => x.id === e.regId));
      const wait = (r.waitlist || []);
      return stepper + (gone.length ? `<div class="card"><p class="note warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> ${esc(t('regWithdrawn'))}</p>
          <ul class="reg-list">${gone.map(e => `<li><span class="reg-names">${esc(teamText(tour, e.id))}</span>
            <button class="btn small danger" data-action="remove-entry" data-tid="${tour.id}" data-id="${e.id}">${esc(t('remove'))}</button></li>`).join('')}</ul></div>` : '')
        + (wait.length ? `<div class="card"><h2>${esc(t('waitingList'))} (${wait.length})</h2>
          <ol class="reg-list">${wait.map((x, i) => `<li><span class="reg-names">${esc(personLabel(x.p1))} · ${esc(personLabel(x.p2))}</span>
            <button class="btn small" data-action="reg-wait-add" data-tid="${tour.id}" data-idx="${i}"><i class="ti ti-plus" aria-hidden="true"></i> ${esc(t('regAddToList'))}</button></li>`).join('')}</ol></div>` : '')
        + entriesEditorCard(tour)
        + `<div class="card"><div class="btn-row end">
          ${btn('reg-reopen', t('regReopen'), '', 'lock-open')}
          ${btn('reg-confirm', t('regConfirm'), 'primary', 'checks', tour.entries.length < 2 ? 'disabled' : '')}</div>
          <p class="muted small">${esc(t('regConfirmHelp'))}</p></div>`;
    }
    if (ph === 'confirmed') {
      return stepper + `<div class="card">
        <h2>${esc(t('regStepFormula'))}</h2>
        <p>${esc(t('regFormulaHelp', { n: tour.entries.length }))}</p>
        <div class="btn-row">
          <a class="btn primary" href="#/t/${tour.id}/edit"><i class="ti ti-adjustments" aria-hidden="true"></i> ${esc(t('regChooseFormula'))}</a>
          ${btn('reg-unconfirm', t('regEditList'), '', 'pencil')}
        </div>
      </div>
      <div class="card"><h2>${esc(t('regOfficialList'))} (${tour.entries.length})</h2>${entryTable(tour, tour.entries.map(e => e.id))}</div>`;
    }
    return '';
  }

  // Elenco squadre modificabile (aggiungi, modifica, cancella).
  function entriesEditorCard(tour) {
    const ed = ui.editEntry && entryById(tour, ui.editEntry);
    const g = teamGenders(tour), lab = teamLabels(tour);
    const pa = ed && player(ed.p1), pb = ed && player(ed.p2);
    return `<div class="card">
      <h2>${esc(t('regTeams'))} (${tour.entries.length})</h2>
      <p class="muted small">${esc(t('regTeamsHelp'))}</p>
      ${entryTable(tour, tour.entries.map(e => e.id), { editable: true, editBtn: true })}
      ${ed ? `<form class="grid-form" data-form="entry-edit" data-tid="${tour.id}" data-id="${ed.id}">
        <h3 class="span-all">${esc(t('editTeam'))}</h3>
        ${[1, 2].map(i => { const p = i === 1 ? pa : pb; return `
          <label>${esc(t('lastName'))} ${esc(lab[i - 1])}<input name="l${i}" required list="dl-last-${g[i - 1]}" value="${esc(p ? p.last : '')}"></label>
          <label>${esc(t('firstName'))} ${esc(lab[i - 1])}<input name="f${i}" required value="${esc(p ? p.first : '')}"></label>`; }).join('')}
        <div class="form-actions span-all"><button type="button" class="btn" data-action="entry-edit-cancel">${esc(t('cancel'))}</button><button class="btn primary">${esc(t('save'))}</button></div>
      </form>` : ''}
      <details class="sub-form"><summary><i class="ti ti-plus" aria-hidden="true"></i> ${esc(t('addTeamManually'))}</summary>
        <form class="grid-form" data-form="entry-add" data-tid="${tour.id}">
          ${teamNameFields(tour)}
          <input type="hidden" name="wc" value="">
          <div class="form-actions"><button class="btn primary">${esc(t('add'))}</button></div>
        </form>
        ${teamDatalists(tour)}
      </details>
    </div>`;
  }

  function importRegistrations(tour) {
    const list = regsOf(tour), max = Math.max(0, tour.reg.maxTeams - presetCount(tour)), created = { n: 0 };
    const inList = list.slice(0, max), wait = list.slice(max);
    inList.forEach(x => {
      if (tour.entries.some(e => e.regId === x.id)) return;
      const a = personToPlayer(x.p1, created), b = personToPlayer(x.p2, created);
      if (tour.entries.some(e => [e.p1, e.p2].some(id => id === a.id || id === b.id))) return;
      tour.entries.push({ id: Store.uid('e'), p1: a.id, p2: b.id, man1: null, man2: null, wc: false, regId: x.id });
    });
    tour.reg.waitlist = wait.map(x => ({ regId: x.id, p1: x.p1, p2: x.p2 }));
    tour.reg.closed = true;
    rankCache = {};
    L.sortEntries(tour, rankMap(tour.gender));
  }

  // ====================================================================
  // PRENOTAZIONE DEI CAMPI, CONFERMA EMAIL, LISTA NERA
  // ====================================================================
  // Slot di mezz'ora: verde libero, rosso occupato, giallo selezione. Si prenota per multipli di 30 minuti.
  const BOOK_DEFAULTS = { minHours: 0.5, maxHours: 2, maxPerDay: 1, daysAhead: 7 };
  const bookCfg = () => Object.assign({}, BOOK_DEFAULTS, S().booking || {});
  // Durata minima di una prenotazione in minuti (l'admin non ha limiti).
  const minBook = () => (admin() ? 30 : Math.max(30, Math.round(Number(bookCfg().minHours) * 60) || 30));
  const hoursText = h => durText('00:00', fromMin(Math.round(Number(h) * 60) || 30));
  const toMin = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
  const fromMin = n => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  const addMin = (hm, n) => fromMin(toMin(hm) + n);
  const addDays = (d, n) => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('sv'); };
  const dow = d => { const x = new Date(d + 'T12:00').getDay(); return x === 0 ? 7 : x; };
  const nowHM = () => { const d = new Date(); return fromMin(d.getHours() * 60 + d.getMinutes()); };
  const dayName = n => new Date(2024, 0, n).toLocaleDateString(I18n.locale(), { weekday: 'long' });   // 1 gen 2024 = lunedì
  const longDate = d => new Date(d + 'T12:00').toLocaleDateString(I18n.locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  const durText = (from, to) => { const n = toMin(to) - toMin(from), h = Math.floor(n / 60), m = n % 60; return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' '); };
  const HALF_HOURS = Array.from({ length: 37 }, (_, i) => fromMin(360 + i * 30));   // 06:00 – 24:00
  const myUid = () => (window.Cloud && window.Cloud.user && window.Cloud.user.uid) || null;
  const isPastSlot = (date, hm) => date < todayStr() || (date === todayStr() && hm <= nowHM());
  const courtById = id => (S().courts || []).find(c => c.id === id);
  const courtName = id => { const c = courtById(id); return c ? c.name : t('bkCourtDeleted'); };
  const courtHours = (c, date) => { const o = c.hours[dow(date)]; return o && o.open && o.from < o.to ? o : null; };
  const bookableCourts = () => (S().courts || []).filter(c => c.visible || admin());
  // Blocchi ricorrenti di quel giorno della settimana (allenamenti fissi): sempre occupati.
  const weeklyOn = date => {
    const g = {}, wd = dow(date);
    (S().weekly || []).filter(w => w.dow === wd).forEach(w => { g[w.rid] = g[w.rid] || { id: 'w:' + w.rid, rid: w.rid, recurring: true, courtId: w.courtId, date, from: w.from, to: w.to, userId: null, blocked: '' }; });
    return Object.values(g);
  };
  const bookingAt = (courtId, date, hm) => (S().bookings || []).concat(weeklyOn(date)).find(b => b.courtId === courtId && b.date === date && b.from <= hm && hm < b.to);
  const recurringReason = rid => { const r = (S().recurring || []).find(x => x.id === rid); return r ? r.reason : ''; };
  const bookingText = b => `${courtName(b.courtId)}, ${fmtDate(b.date)} ${b.from}–${b.to}`;
  const memberByUid = uid => (S().members || []).find(m => m.uid === uid);
  const uidName = uid => { const m = memberByUid(uid); return m ? personLabel(m) : uid === myUid() && admin() ? 'Admin' : '?'; };
  const banOf = uid => (S().bans || {})[uid] || {};

  // Conferma dell'email: senza conferma non ci si iscrive ai tornei e non si prenota.
  const needsVerify = () => !!member() && !!window.Cloud && !window.Cloud.verified;
  function verifyNotice() {
    if (!needsVerify()) return '';
    return `<div class="msg-alert verify-alert" role="alert">
      <div class="msg-head"><strong><i class="ti ti-mail" aria-hidden="true"></i> ${esc(t('verifyTitle'))}</strong></div>
      <div class="msg-text">${esc(t('verifyText', { e: window.Cloud.user.email }))}</div>
      <div class="btn-row"><button class="btn small primary" data-action="verify-check">${esc(t('verifyCheck'))}</button>
        <button class="btn small" data-action="verify-resend">${esc(t('verifyResend'))}</button></div></div>`;
  }
  // Lista nera: avviso all'utente bloccato (what = 'tour' | 'book').
  function banNotice(what) {
    const m = member();
    if (!m || !banOf(m.uid)[what]) return '';
    return `<p class="note warn"><i class="ti ti-ban" aria-hidden="true"></i> ${esc(t(what === 'tour' ? 'banTourMsg' : 'banBookMsg'))}</p>`;
  }

  // Avvisi delle prenotazioni modificate o cancellate (ALERT in cima alla pagina, finché non si preme "Ho letto").
  function bookingAlerts() {
    if (!(member() || admin())) return '';
    return (S().notices || []).map(n => `<div class="msg-alert" role="alert">
      <div class="msg-head"><strong><i class="ti ti-calendar-exclamation" aria-hidden="true"></i> ${esc(t(n.to === 'admins' ? 'bkNoticeAdmins' : 'bkNotice'))}</strong>
        <small>${esc(new Date(n.at).toLocaleString(I18n.locale(), { dateStyle: 'medium', timeStyle: 'short' }))}</small></div>
      <div class="msg-text">${esc(n.text)}</div>
      <button class="btn small" data-action="notice-dismiss" data-id="${n.id}"><i class="ti ti-check" aria-hidden="true"></i> ${esc(t('msgRead'))}</button>
    </div>`).join('');
  }

  // per conto di chi è la prenotazione: utente registrato o nome scritto dall'admin (giocatore non registrato)
  const bkWho = b => (b.guest ? `${b.guest} (${t('bkGuestShort')})` : uidName(b.userId));
  function myBookings(uid) {
    return (S().bookings || []).filter(b => b.userId === uid && !b.guest && !isPastSlot(b.date, b.to))
      .sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from));
  }
  function bookingItem(b) {
    return `<li><span class="reg-names"><i class="ti ti-calendar-event" aria-hidden="true"></i> <strong>${esc(fmtDate(b.date))}</strong> · ${b.from}–${b.to}<br>
      <small class="muted">${esc(courtName(b.courtId))} · ${esc(durText(b.from, b.to))}</small></span>
      <span class="btn-row"><button class="btn small" data-action="booking-open" data-id="${b.id}">${esc(t('edit'))}</button>
      <button class="btn small danger" data-action="booking-delete" data-id="${b.id}">${esc(t('bkCancel'))}</button></span></li>`;
  }

  // Selezione in corso: { courtId, date, from, to, editId, userId, blocked } (editId = prenotazione in modifica).
  function selFree(courtId, date, from, to, editId) {
    const c = courtById(courtId), h = c && courtHours(c, date);
    if (!h || from < h.from || to > h.to) return false;
    for (let x = from; x < to; x = addMin(x, 30)) {
      const b = bookingAt(courtId, date, x);
      if ((b && b.id !== editId) || isPastSlot(date, x)) return false;
    }
    return true;
  }

  function slotClick(courtId, hm) {
    const d = ui.bookDate, s = ui.bkSel;
    const keep = s && s.editId ? { editId: s.editId, userId: s.userId, blocked: s.blocked } : {};
    if (s && s.courtId === courtId && s.date === d) {
      if (hm >= s.from && hm < s.to) {
        // Tocco dentro la selezione: la prenotazione finisce in quello slot (mai sotto la durata minima);
        // toccando il primo slot di una selezione di durata minima la si annulla.
        const minEnd = addMin(s.from, minBook());
        if (hm === s.from && s.to <= minEnd && !s.editId) ui.bkSel = null;
        else s.to = addMin(hm, 30) > minEnd ? addMin(hm, 30) : (selFree(courtId, d, s.from, minEnd, s.editId) ? minEnd : addMin(hm, 30));
        return render();
      }
      const from = hm < s.from ? hm : s.from, to = hm < s.from ? s.to : addMin(hm, 30);
      if (selFree(courtId, d, from, to, s.editId)) { s.from = from; s.to = to; return render(); }
    }
    // Nuova selezione: parte già dalla durata minima, se gli slot successivi sono liberi.
    const to = selFree(courtId, d, hm, addMin(hm, minBook()), keep.editId || null) ? addMin(hm, minBook()) : addMin(hm, 30);
    ui.bkSel = Object.assign({ courtId, date: d, from: hm, to, editId: null, userId: null, blocked: '' }, keep);
    render();
  }

  function summaryPanel() {
    const s = ui.bkSel, uid = myUid();
    const legend = `<div class="legend"><span><i class="sw free"></i>${esc(t('bkFree'))}</span><span><i class="sw busy"></i>${esc(t('bkBusy'))}</span>
      <span><i class="sw sel"></i>${esc(t('bkSelected'))}</span><span><i class="sw off"></i>${esc(t('bkClosed'))}</span></div>`;
    if (!s) {
      return `<h3><i class="ti ti-calendar-plus" aria-hidden="true"></i> ${esc(t('bkYour'))}</h3>
        <p class="muted small">${uid && (member() || admin()) ? esc(t('bkHowTo')) : `${esc(t('bkLoginFirst'))} <a href="#/settings">${esc(t('loginOrRegister'))}</a>`}</p>${legend}`;
    }
    const orig = s.editId && (S().bookings || []).find(b => b.id === s.editId);
    const slotChanged = orig && (orig.courtId !== s.courtId || orig.date !== s.date || orig.from !== s.from || orig.to !== s.to || (orig.userId || '') !== (s.userId || '') || (orig.blocked || '') !== (s.blocked || '') || (orig.guest || '') !== (s.guest || ''));
    const plBox = bkPlayersBox(s, orig);
    const changed = slotChanged || (orig && plBox && bkPlayersChanged(s, orig));
    const canLonger = selFree(s.courtId, s.date, s.from, addMin(s.to, 30), s.editId);
    const mem = (S().members || []).slice().sort((a, b) => personLabel(a).localeCompare(personLabel(b)));
    const who = s.userId || (orig ? '' : uid);
    const adminFields = admin() ? `
      <label>${esc(t('bkFor'))}<select data-change="bk-user"><option value="">${esc(orig ? '—' : t('bkForMe'))}</option>
        ${mem.map(m => `<option value="${m.uid}" ${m.uid === who && m.uid !== uid ? 'selected' : ''}>${esc(personLabel(m))}</option>`).join('')}</select></label>
      <label>${esc(t('bkGuest'))}<input value="${esc(s.guest || '')}" maxlength="60" data-change="bk-guest" placeholder="${esc(t('bkGuestPh'))}" autocomplete="off"></label>
      <label>${esc(t('bkBlockReason'))}<input value="${esc(s.blocked || '')}" maxlength="60" data-change="bk-blocked" placeholder="${esc(t('bkBlockPh'))}"></label>` : '';
    return `<h3><i class="ti ti-${orig ? 'pencil' : 'calendar-plus'}" aria-hidden="true"></i> ${esc(t(orig ? 'bkEditTitle' : 'bkSummary'))}</h3><div class="summary-body"><div>
      ${orig ? `<p class="muted small">${esc(t('bkEditOf', { w: orig.blocked ? t('bkBlock') + ': ' + orig.blocked : bkWho(orig), b: bookingText(orig) }))}</p>` : ''}
      <dl class="summary">
        <dt>${esc(t('bkCourt'))}</dt><dd>${esc(courtName(s.courtId))}</dd>
        <dt>${esc(t('bkDay'))}</dt><dd>${esc(longDate(s.date))}</dd>
        <dt>${esc(t('bkTime'))}</dt><dd><strong>${s.from} – ${s.to}</strong></dd>
        <dt>${esc(t('bkDuration'))}</dt><dd>${esc(durText(s.from, s.to))}</dd>
      </dl>
      <div class="btn-row">
        <button class="btn small" data-action="bk-shorter" ${toMin(s.to) - toMin(s.from) - 30 < minBook() ? 'disabled' : ''}>− 30 min</button>
        <button class="btn small" data-action="bk-longer" ${canLonger ? '' : 'disabled'}>+ 30 min</button>
      </div></div><div>
      ${adminFields}
      ${plBox}
      <div class="btn-row">
        ${orig ? `<button class="btn primary" data-action="booking-confirm" ${changed ? '' : 'disabled'}><i class="ti ti-check" aria-hidden="true"></i> ${esc(t('bkSaveChanges'))}</button>
          <button class="btn danger" data-action="booking-delete" data-id="${orig.id}"><i class="ti ti-trash" aria-hidden="true"></i> ${esc(t('bkCancel'))}</button>`
        : `<button class="btn primary" data-action="booking-confirm"><i class="ti ti-check" aria-hidden="true"></i> ${esc(t('bkConfirm'))}</button>`}
        <button class="btn" data-action="bk-clear">${esc(t(orig ? 'close' : 'cancel'))}</button>
      </div></div></div>${legend}`;
  }

  function viewBook() {
    const cfg = bookCfg(), uid = myUid();
    const today = todayStr();
    if (!ui.bookDate || ui.bookDate < today) ui.bookDate = today;
    const d = ui.bookDate;
    const max = addDays(today, Number(cfg.daysAhead) || 7);
    const courts = bookableCourts();
    const open = courts.map(c => ({ c, h: courtHours(c, d) }));
    const opened = open.filter(x => x.h && x.c.visible);
    const starts = open.filter(x => x.h).map(x => x.h.from).sort(), ends = open.filter(x => x.h).map(x => x.h.to).sort();
    let rows = [];
    if (starts.length) for (let x = starts[0]; x < ends[ends.length - 1]; x = addMin(x, 30)) rows.push(x);
    const allRows = rows.length;
    // Oggi si mostrano solo gli orari non ancora passati.
    if (d === today) rows = rows.filter(x => !isPastSlot(d, x));
    // Fasce orarie (mattina, pomeriggio, sera) quando gli orari sono molti.
    const inBand = (x, k) => (k === 'am' ? x < '13:00' : k === 'pm' ? x >= '13:00' && x < '18:00' : k === 'eve' ? x >= '18:00' : true);
    const showBands = rows.length > 12;
    let band = showBands ? ui.bookBand || 'all' : 'all';
    if (!rows.some(x => inBand(x, band))) band = 'all';
    const bandsBar = showBands ? `<div class="bands" role="group" aria-label="${esc(t('bkBands'))}">${['all', 'am', 'pm', 'eve'].map(k =>
      `<button class="${k === band ? 'on' : ''}" data-action="bk-band" data-band="${k}" ${rows.some(x => inBand(x, k)) ? '' : 'disabled'}>${esc(t('bkBand_' + k))}</button>`).join('')}</div>` : '';
    rows = rows.filter(x => inBand(x, band));
    const s = ui.bkSel && ui.bkSel.date === d ? ui.bkSel : null;
    const freeHours = c => { const h = courtHours(c, d); if (!h || !c.visible) return 0; let n = 0; for (let x = h.from; x < h.to; x = addMin(x, 30)) if (!bookingAt(c.id, d, x) && !isPastSlot(d, x)) n++; return n / 2; };
    // Un riquadro per campo, con gli orari in orizzontale; stessa scala oraria per tutti i campi.
    const courtBox = c => {
      const h = courtHours(c, d);
      const head = `<div class="court-head"><h3>${esc(c.name)}${!c.visible ? ` <span class="badge">${esc(t('bkHidden'))}</span>` : ''}</h3>
        <span class="muted small">${h ? `${esc(t('bkOpenHours', { a: h.from, b: h.to }))} · <strong>${esc(t('bkFreeHours', { n: String(freeHours(c)).replace('.', ',') }))}</strong>` : esc(t('bkClosedDay'))}</span></div>`;
      if (!h || !rows.some(x => x >= h.from && x < h.to)) return `<section class="card court-box closed">${head}${h ? `<p class="muted small">${esc(t(band !== 'all' ? 'bkNoneInBand' : 'bkOverToday'))}</p>` : ''}</section>`;
      const labels = rows.map((x, k) => (x.endsWith(':00') || k === 0 ? `<span class="tl" style="grid-column:${k + 1} / span ${x.endsWith(':00') && k + 1 < rows.length ? 2 : 1}">${x}</span>` : '')).join('');
      const cells = [];
      for (let k = 0; k < rows.length; k++) {
        const x = rows[k], b = bookingAt(c.id, d, x);
        const inSel = s && s.courtId === c.id && x >= s.from && x < s.to;
        if (b && !(s && s.editId === b.id)) {
          // Prenotazione: un unico blocco rosso che copre tutti i suoi slot.
          let n = 0;
          while (k + n < rows.length && rows[k + n] < b.to) n++;
          // Gli utenti vedono solo "occupato": chi ha prenotato e il motivo dei blocchi li vede solo l'admin.
          const mine = uid && b.userId === uid && !b.guest, canOpen = !b.recurring && !b.fp && (mine || admin()) && !isPastSlot(d, b.to);
          const who = !admin() ? t('bkBusy') : b.recurring ? `${t('recurringShort')}: ${recurringReason(b.rid) || '—'}` : b.blocked ? b.blocked : bkWho(b);
          const label = mine ? esc(t('bkMine')) : !admin() ? esc(who)
            : b.recurring ? `<i class="ti ti-repeat" aria-hidden="true"></i> ${esc(recurringReason(b.rid) || t('recurringShort'))}`
            : b.blocked ? `<i class="ti ti-lock" aria-hidden="true"></i> ${esc(b.blocked)}` : esc(who);
          // Nelle prenotazioni brevi c'è spazio solo per l'orario (il nome è nel suggerimento).
          // l'admin vede subito per chi è la prenotazione anche quando è breve (l'orario resta nel suggerimento)
          const inner = n === 1 ? `<small>${admin() && !mine ? label : b.from}</small>` : n === 2 && !mine ? `<small>${admin() ? label : `${b.from}–${b.to}`}</small>` : `<span>${label}</span><small>${b.from}–${b.to}</small>`;
          const adminBlock = admin() && (b.blocked || b.recurring);
          const body = canOpen ? `<button data-action="booking-open" data-id="${b.id}">${inner}</button>`
            : admin() && b.recurring ? `<a href="#/courts">${inner}</a>` : admin() && b.fp ? `<a href="#/free">${inner}</a>` : `<div>${inner}</div>`;
          cells.push(`<div class="slot busy ${mine ? 'mine' : ''} ${adminBlock ? 'blocked' : ''} ${admin() && b.recurring ? 'recurring' : ''}" style="grid-column:${k + 1} / span ${n}" title="${esc(who)} ${b.from}–${b.to}">${body}</div>`);
          k += n - 1;
          continue;
        }
        const pos = `style="grid-column:${k + 1}"`;
        if (x < h.from || x >= h.to) cells.push(`<div class="slot off" ${pos} title="${x} – ${esc(t('bkClosed'))}"></div>`);
        else if (inSel) cells.push(`<div class="slot sel" ${pos}><button data-action="bk-slot" data-court="${c.id}" data-t="${x}" title="${x}" aria-label="${esc(c.name)} ${x} ${esc(t('bkSelected'))}">${x === s.from ? '<i class="ti ti-check" aria-hidden="true"></i>' : ''}</button></div>`);
        else if (isPastSlot(d, x)) cells.push(`<div class="slot off past" ${pos} title="${x}"></div>`);
        else if (d > max || !c.visible) cells.push(`<div class="slot off" ${pos} title="${x} – ${esc(t('bkNotBookable'))}"></div>`);
        else cells.push(`<div class="slot free" ${pos}><button data-action="bk-slot" data-court="${c.id}" data-t="${x}" title="${x} – ${addMin(x, 30)}" aria-label="${esc(c.name)} ${x} ${esc(t('bkFree'))}"></button></div>`);
      }
      return `<section class="card court-box">${head}
        <div class="strip-wrap"><div class="strip" style="--n:${rows.length}">
          <div class="strip-labels">${labels}</div><div class="strip-slots">${cells.join('')}</div>
        </div></div></section>`;
    };
    const mine = uid ? myBookings(uid) : [];
    return `
      ${bookingAlerts()}
      ${verifyNotice()}
      ${banNotice('book')}
      <div class="page-head row"><h1><i class="ti ti-calendar-time" aria-hidden="true"></i> ${esc(t('bkTitle'))}</h1>
        ${admin() ? `<a class="btn small" href="#/courts"><i class="ti ti-settings" aria-hidden="true"></i> ${esc(t('courtsManage'))}</a>` : ''}</div>
      <p class="muted">${esc(t('bkIntro', { c: courts.filter(c => c.visible).length, o: opened.length, m: hoursText(cfg.minHours), h: hoursText(cfg.maxHours), d: cfg.daysAhead }))}</p>
      <div class="date-nav">
        <button class="btn icon" data-action="bk-day" data-delta="-1" aria-label="${esc(t('bkPrevDay'))}" ${d <= today ? 'disabled' : ''}><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
        <input type="date" value="${d}" min="${today}" max="${max}" data-change="bk-date" aria-label="${esc(t('bkDay'))}">
        <button class="btn icon" data-action="bk-day" data-delta="1" aria-label="${esc(t('bkNextDay'))}" ${d >= max ? 'disabled' : ''}><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
        <strong class="date-label">${esc(longDate(d))}</strong>
      </div>
      ${bandsBar}
      <div class="book-layout">
        <div class="book-grid">
        ${!courts.length ? `<div class="empty"><i class="ti ti-layout-grid" aria-hidden="true"></i> ${esc(t(admin() ? 'bkNoCourtsAdmin' : 'bkNoCourts'))}</div>`
        : !rows.length ? `<div class="empty"><i class="ti ti-door-off" aria-hidden="true"></i> ${esc(t(allRows ? 'bkOverTodayAll' : 'bkClosedAll'))}</div>`
        : courts.map(courtBox).join('')}
        </div>
        <aside class="card book-summary ${ui.bkSel ? 'active' : 'idle'}">${ui.bkSel && ui.bkSel.date !== d ? `<p class="muted small">${esc(t('bkSelOtherDay', { d: fmtDate(ui.bkSel.date) }))}</p>` : ''}${summaryPanel()}</aside>
      </div>
      ${uid && (member() || admin()) ? `<div class="card"><h2><i class="ti ti-calendar-event" aria-hidden="true"></i> ${esc(t('bkMyNext'))}</h2>
        ${mine.length ? `<ul class="reg-list">${mine.map(bookingItem).join('')}</ul>` : `<p class="muted">${esc(t('bkNoMine'))}</p>`}</div>` : ''}`;
  }

  // Conferma (nuova prenotazione o modifica) con tutti i controlli; avvisi a titolare e amministratori.
  // ---------- giocatori della prenotazione e reminder ----------
  const BK_REMIND = [30, 60, 120, 180, 360, 720, 1440];
  const remindLabel = m => (m < 60 ? t('bkRemMin', { n: m }) : m === 60 ? t('bkRem1h') : t('bkRemH', { n: m / 60 }));
  const bkOwnerOf = (s, orig) => (admin() ? (s.blocked ? null : s.userId || (orig ? orig.userId : myUid())) : myUid());
  const bkPlayersOf = gid => (S().bkplayers || []).find(x => x.id === gid);
  const bkStartMs = b => new Date(`${b.date}T${b.from}`).getTime();
  // chi ha prenotato sceglie quante persone giocano con lui (fino a 7), chi sono e quando ricevere il reminder
  function bkPlayersBox(s, orig) {
    const owner = bkOwnerOf(s, orig);
    if (!owner || s.blocked || s.guest) return '';   // prenotazione per un non registrato: niente giocatori né reminder
    if (orig && Date.now() >= bkStartMs(orig)) return '';   // modificabile fino all'inizio
    const cur = orig && bkPlayersOf(orig.id);
    if (!s.plInit) { s.plInit = true; s.players = cur ? (cur.uids || []).slice() : []; s.np = s.players.length; s.remind = cur ? cur.remind : 60; }
    const mem = (S().members || []).filter(m => m.uid !== owner).sort((a, b) => personLabel(a).localeCompare(personLabel(b)));
    return `<div class="bk-players"><h4><i class="ti ti-users" aria-hidden="true"></i> ${esc(t('bkPlayersTitle'))}</h4>
      <label>${esc(t('bkPlayersN'))}<select data-change="bk-np">${[0, 1, 2, 3, 4, 5, 6, 7].map(n => `<option value="${n}" ${n === s.np ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      ${Array.from({ length: s.np }, (_, i) => `<label>${esc(t('bkPlayerN', { n: i + 1 }))}<select data-change="bk-pl" data-i="${i}"><option value="">—</option>
        ${mem.map(m => `<option value="${m.uid}" ${s.players[i] === m.uid ? 'selected' : ''}>${esc(personLabel(m))}</option>`).join('')}</select></label>`).join('')}
      <label>${esc(t('bkRemind'))}<select data-change="bk-rem">${BK_REMIND.map(m => `<option value="${m}" ${m === s.remind ? 'selected' : ''}>${esc(remindLabel(m))}</option>`).join('')}</select></label>
      <p class="muted small">${esc(t('bkPlayersHelp'))}</p></div>`;
  }
  const bkPickedUids = s => [...new Set((s.players || []).slice(0, s.np || 0).filter(Boolean))];
  const bkPlayersChanged = (s, orig) => { const cur = bkPlayersOf(orig.id); return JSON.stringify(bkPickedUids(s)) !== JSON.stringify(cur ? cur.uids || [] : []) || (s.remind || 60) !== (cur ? cur.remind : 60); };
  function bkPlayersDoc(data, s) {
    const uids = bkPickedUids(s).filter(u => u !== data.userId);
    const om = memberByUid(data.userId);
    return { gid: data.id, by: data.userId, ownerName: om ? personLabel(om) : '', date: data.date, from: data.from, to: data.to, courtId: data.courtId, courtName: courtName(data.courtId),
      uids, names: Object.fromEntries(uids.map(u => { const m = memberByUid(u); return [u, m ? personLabel(m) : '']; })), remind: s.remind || 60 };
  }
  // Reminder in prima pagina: da "remind" minuti prima dell'inizio fino alla fine della prenotazione.
  function bkReminderAlerts() {
    const me = myUid();
    if (!me) return '';
    const now = Date.now();
    const when = d => (d === todayStr() ? t('bkToday') : d === addDays(todayStr(), 1) ? t('bkTomorrow') : longDate(d));
    return (S().bkplayers || []).filter(x => now >= bkStartMs(x) - (x.remind || 60) * 60000 && now < new Date(`${x.date}T${x.to}`).getTime())
      .sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from)).map(x => {
        const mine = x.by === me;
        const others = Object.entries(x.names || {}).filter(([u]) => u !== me).map(([, n]) => n).filter(Boolean);
        const txt = mine ? t('bkRemOwner', { q: when(x.date), a: x.from, b: x.to }) : t('bkRemGuest', { q: when(x.date), a: x.from, b: x.to, n: x.ownerName || '?' });
        const players = mine ? others : [x.ownerName].concat(others).filter(Boolean);
        return `<div class="msg-alert ok bk-reminder" role="status"><div class="msg-head"><strong><i class="ti ti-bell-ringing" aria-hidden="true"></i> ${esc(t('bkRemTitle'))}</strong></div>
          <div class="msg-text">${esc(txt)}<br><small>${esc(x.courtName || courtName(x.courtId))}${players.length ? ` · ${esc(t('bkRemWith', { l: players.join(', ') }))}` : ''}</small></div></div>`;
      }).join('');
  }
  function confirmBooking() {
    const s = ui.bkSel, uid = myUid(), cfg = bookCfg();
    if (!s) return;
    if (!uid || !(member() || admin())) { location.hash = '#/settings'; return warn('bkLoginFirst'); }
    if (needsVerify()) return warn('verifyFirst');
    if (!admin() && banOf(uid).book) return warn('banBookMsg');
    const c = courtById(s.courtId);
    if (!c || (!c.visible && !admin())) return warn('bkNotBookable');
    if (!selFree(s.courtId, s.date, s.from, s.to, s.editId)) return warn('bkTaken');
    const orig = s.editId && (S().bookings || []).find(b => b.id === s.editId);
    const owner = admin() ? (s.blocked ? null : s.userId || (orig ? orig.userId : uid)) : uid;
    if (!admin()) {
      if (s.date > addDays(todayStr(), Number(cfg.daysAhead) || 7)) return warn('bkNotBookable');
      if (toMin(s.to) - toMin(s.from) < minBook()) return warn('bkMinHours', { h: hoursText(cfg.minHours) });
      if (toMin(s.to) - toMin(s.from) > Number(cfg.maxHours) * 60) return warn('bkMaxHours', { h: hoursText(cfg.maxHours) });
      const same = (S().bookings || []).filter(b => b.userId === uid && b.date === s.date && b.id !== s.editId).length;
      if (same >= Number(cfg.maxPerDay)) return warn('bkMaxDay', { n: same, max: cfg.maxPerDay });
    }
    const guest = admin() && !s.blocked ? (s.guest || '').trim() : '';
    const data = { id: orig ? orig.id : Store.uid('g'), courtId: s.courtId, date: s.date, from: s.from, to: s.to, userId: guest ? uid : owner, blocked: admin() ? (s.blocked || '').trim() : '' };
    if (guest) data.guest = guest;
    const slotSame = orig && orig.courtId === data.courtId && orig.date === data.date && orig.from === data.from && orig.to === data.to && (orig.userId || '') === (data.userId || '') && (orig.blocked || '') === (data.blocked || '') && (orig.guest || '') === (data.guest || '');
    const withPlayers = !!data.userId && !data.blocked && !data.guest && s.plInit;
    if (slotSame) {
      // cambiano solo i giocatori o il reminder
      if (!withPlayers) return;
      return window.Cloud.saveBkPlayers(bkPlayersDoc(data, s)).then(() => { ui.bkSel = null; ui.flash = { text: t('bkPlayersSaved') }; render(); }).catch(e => warn('regError', { code: e.code || e.message }));
    }
    if (orig && !confirm(t('bkConfirmEdit', { a: bookingText(orig), b: bookingText(data) }))) return;
    // prenotazione di una sfida: se resta del proponente segue il nuovo orario, altrimenti la sfida torna aperta
    const chOf = orig && orig.ch ? chById(orig.ch) : null;
    const keepCh = !!(orig && orig.ch && !data.blocked && (!chOf || data.userId === chOf.by));
    if (keepCh) data.ch = orig.ch;
    window.Cloud.saveBooking(data, orig || null).then(() => {
      // giocatori e reminder (anche senza giocatori: il reminder serve a chi ha prenotato)
      if (withPlayers) window.Cloud.saveBkPlayers(bkPlayersDoc(data, s)).catch(e => console.error(e));
      if (orig && orig.ch) window.Cloud.updateChallenge(orig.ch, keepCh
        ? { book: { courtId: data.courtId, date: data.date, from: data.from, to: data.to, gid: data.id }, date: data.date, from: data.from, dur: toMin(data.to) - toMin(data.from) }
        : { status: 'open', book: null, holdUntil: 0 }).catch(() => {});
      if (orig) notifyBooking(orig, data, 'edit');
      ui.bkSel = null;
      ui.flash = { text: orig ? t('bkEdited') : data.blocked ? t('bkBlocked') : t('bkDone', { b: bookingText(data) }) };
      render();
    }).catch(e => warn(e.code === 'permission-denied' ? 'bkTaken' : 'regError', { code: e.code || e.message }));
  }

  function removeBooking(id) {
    const b = (S().bookings || []).find(x => x.id === id);
    if (!b) return;
    if (!confirm(t(b.blocked ? 'bkConfirmUnblock' : 'bkConfirmDelete', { b: bookingText(b) }))) return;
    window.Cloud.deleteBooking(b).then(() => {
      // prenotazione di una sfida cancellata: la sfida torna aperta (e non vale per il reward)
      if (b.ch) window.Cloud.updateChallenge(b.ch, { status: 'open', book: null, holdUntil: 0 }).catch(() => {});
      notifyBooking(b, null, 'delete');
      if (ui.bkSel && ui.bkSel.editId === id) ui.bkSel = null;
      ui.flash = { text: t('bkDeleted') };
      render();
    }).catch(e => warn('regError', { code: e.code || e.message }));
  }

  // Chi cambia una prenotazione altrui avvisa il titolare; l'utente che cambia la propria avvisa gli amministratori.
  function notifyBooking(b, next, what) {
    const uid = myUid();
    if (!b.userId || b.blocked) return;
    if (admin() && b.userId !== uid) {
      window.Cloud.notify(b.userId, what === 'edit' ? t('bkNoteEditedByAdmin', { a: bookingText(b), b: bookingText(next) }) : t('bkNoteDeletedByAdmin', { a: bookingText(b) }));
    } else if (!admin()) {
      const who = member() ? personLabel(member()) : '?';
      window.Cloud.notify('admins', what === 'edit' ? t('bkNoteEditedByUser', { u: who, a: bookingText(b), b: bookingText(next) }) : t('bkNoteDeletedByUser', { u: who, a: bookingText(b) }));
    }
  }

  // ---------- reward dei campi (prenotazioni giocate), soglie decise dall'admin ----------
  function bookRewardFor(n) {
    const th = S().bookRewards || {};
    let best = null;
    REWARDS.forEach(([k, icon]) => { const v = Number(th[k]); if (v > 0 && n >= v) best = { key: k, icon }; });
    return best;
  }
  // Prenotazioni giocate (concluse e non cancellate): conteggio dal database meno quelle non ancora finite.
  function loadBookCount(uid) {
    ui.bookCounts = ui.bookCounts || {};
    if (ui.bookCounts[uid] != null || ui.bookCountLoading || !window.Cloud) return;
    ui.bookCountLoading = true;
    // prenotazioni giocate + sfide giocate come partecipante (solo se il campo era prenotato e l'orario è finito)
    ui.chCounts = ui.chCounts || {};
    Promise.all([window.Cloud.countBookings(uid), window.Cloud.countChallenges(uid).catch(() => 0)]).then(([total, chs]) => {
      ui.chCounts[uid] = chs;
      ui.bookCounts[uid] = Math.max(0, total - (S().bookings || []).filter(b => b.userId === uid && !isPastSlot(b.date, b.to)).length) + chs;
    }).catch(() => { ui.bookCounts[uid] = 0; }).finally(() => { ui.bookCountLoading = false; render(); });
  }
  function bookRewardStat(uid) {
    loadBookCount(uid);
    const n = (ui.bookCounts || {})[uid];
    if (n == null) return `<div class="stat"><span>${esc(t('bookReward'))}</span><strong>…</strong></div>`;
    const rw = bookRewardFor(n), th = S().bookRewards || {};
    const next = REWARDS.find(([k]) => Number(th[k]) > n);
    return `<div class="stat"><span>${esc(t('bookReward'))}</span><strong>${rw ? `${rw.icon} ${esc(t('rw_' + rw.key))}` : '—'}</strong>
      <small class="muted">${esc((ui.chCounts || {})[uid] ? t('bookPlayedCh', { b: n - ui.chCounts[uid], c: ui.chCounts[uid] }) : t('bookPlayed', { n }))}${next ? ` · ${esc(t('rewardNext', { n: Number(th[next[0]]) - n, r: t('rw_' + next[0]) }))} ${next[1]}` : ''}</small></div>`;
  }

  // ---------- amministrazione dei campi ----------
  function courtForm(c) {
    const opt = v => HALF_HOURS.map(h => `<option ${h === v ? 'selected' : ''}>${h}</option>`).join('');
    return `<form data-form="court-save" class="card court-form"><input type="hidden" name="id" value="${c.id}">
      <div class="grid-form"><label>${esc(t('courtName'))}<input name="name" value="${esc(c.name)}" maxlength="40" required></label>
        <label class="check"><input type="checkbox" name="visible" ${c.visible ? 'checked' : ''}> ${esc(t('courtVisible'))}</label></div>
      <div class="table-wrap"><table class="table hours"><thead><tr><th>${esc(t('bkDay'))}</th><th>${esc(t('courtOpen'))}</th><th>${esc(t('courtFrom'))}</th><th>${esc(t('courtTo'))}</th></tr></thead><tbody>
      ${[1, 2, 3, 4, 5, 6, 7].map(n => { const o = c.hours[n]; return `<tr><td>${esc(dayName(n))}</td>
        <td><input type="checkbox" name="open${n}" ${o.open ? 'checked' : ''} aria-label="${esc(dayName(n))}"></td>
        <td><select name="from${n}">${opt(o.from)}</select></td>
        <td><select name="to${n}">${opt(o.to)}</select></td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="form-actions">
        <button type="button" class="btn small" data-action="court-copy">${esc(t('courtCopy'))}</button>
        <button type="button" class="btn small danger" data-action="court-delete" data-id="${c.id}"><i class="ti ti-trash" aria-hidden="true"></i> ${esc(t('courtDelete'))}</button>
        <button class="btn small primary">${esc(t('save'))}</button>
      </div></form>`;
  }

  // Blocchi ricorrenti (allenamenti fissi): ogni settimana, quel giorno, dalle … alle …
  function recurringCard() {
    const courts = S().courts || [];
    const list = (S().recurring || []).slice().sort((a, b) => courtName(a.courtId).localeCompare(courtName(b.courtId)) || a.dow - b.dow || a.from.localeCompare(b.from));
    const opt = (v, sel) => HALF_HOURS.map(h => `<option ${h === sel ? 'selected' : ''}>${h}</option>`).join('');
    return `<div class="card" id="recurring">
      <h2><i class="ti ti-repeat" aria-hidden="true"></i> ${esc(t('recurringTitle'))}</h2>
      <p class="muted small">${esc(t('recurringHelp'))}</p>
      ${list.length ? `<ul class="reg-list">${list.map(r => `<li><span class="reg-names"><strong>${esc(courtName(r.courtId))}</strong> · <span class="cap">${esc(dayName(r.dow))}</span> · ${r.from}–${r.to}<br>
        <small class="muted">${esc(r.reason || '—')}</small></span>
        ${r.trid ? `<a class="btn small" href="#/train">${esc(t('navTrain'))} →</a>` : `<button class="btn small danger" data-action="recurring-delete" data-id="${r.id}"><i class="ti ti-trash" aria-hidden="true"></i> ${esc(t('remove'))}</button>`}</li>`).join('')}</ul>`
        : `<p class="muted">${esc(t('recurringNone'))}</p>`}
      ${courts.length ? `<form class="grid-form" data-form="recurring-add">
        <h3 class="span-all">${esc(t('recurringNew'))}</h3>
        <label>${esc(t('bkCourt'))}<select name="courtId">${courts.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
        <label>${esc(t('bkDay'))}<select name="dow">${[1, 2, 3, 4, 5, 6, 7].map(n => `<option value="${n}">${esc(dayName(n))}</option>`).join('')}</select></label>
        <label>${esc(t('courtFrom'))}<select name="from">${opt(0, '18:00')}</select></label>
        <label>${esc(t('courtTo'))}<select name="to">${opt(0, '19:30')}</select></label>
        <label class="span-all">${esc(t('recurringReason'))}<input name="reason" maxlength="60" required placeholder="${esc(t('recurringReasonPh'))}"></label>
        <div class="form-actions span-all"><button class="btn primary"><i class="ti ti-plus" aria-hidden="true"></i> ${esc(t('recurringAdd'))}</button></div>
      </form>` : ''}
    </div>`;
  }

  function addRecurringForm(f) {
    const r = { courtId: f.courtId.value, dow: Number(f.dow.value), from: f.from.value, to: f.to.value, reason: f.reason.value.trim() };
    if (!r.reason) return warn('recurringNoReason');
    if (r.to <= r.from) return warn('courtHoursErr', { d: dayName(r.dow) });
    // niente sovrapposizioni con altri blocchi ricorrenti dello stesso campo e giorno
    if ((S().recurring || []).some(x => x.courtId === r.courtId && x.dow === r.dow && x.from < r.to && r.from < x.to)) return warn('recurringOverlap');
    // prenotazioni già fatte in quegli orari (da oggi in poi): restano, ma l'admin lo sa
    const clash = (S().bookings || []).filter(b => b.courtId === r.courtId && dow(b.date) === r.dow && b.from < r.to && r.from < b.to && !isPastSlot(b.date, b.to));
    if (clash.length && !confirm(t('recurringClash', { n: clash.length, list: clash.map(b => `${fmtDate(b.date)} ${b.from}–${b.to} · ${b.blocked || bkWho(b)}`).join('\n') }))) return;
    window.Cloud.addRecurring(r).then(() => { ui.flash = { text: t('recurringAdded') }; render(); }).catch(e => warn('regError', { code: e.code || e.message }));
  }

  function viewCourts() {
    const cfg = bookCfg(), th = S().bookRewards || {};
    return `
      <div class="page-head"><a class="back" href="#/book">← ${esc(t('bkTitle'))}</a><h1><i class="ti ti-layout-grid" aria-hidden="true"></i> ${esc(t('courtsManage'))}</h1></div>
      <form class="card grid-form" data-form="booking-settings">
        <h2 class="span-all">${esc(t('bkRules'))}</h2>
        <label>${esc(t('bkMinHoursLbl'))}<select name="minHours">${[0.5, 1, 1.5, 2, 2.5, 3].map(h => `<option value="${h}" ${h == cfg.minHours ? 'selected' : ''}>${esc(durText('00:00', fromMin(h * 60)))}</option>`).join('')}</select></label>
        <label>${esc(t('bkMaxHoursLbl'))}<select name="maxHours">${[0.5, 1, 1.5, 2, 2.5, 3, 4].map(h => `<option value="${h}" ${h == cfg.maxHours ? 'selected' : ''}>${esc(durText('00:00', fromMin(h * 60)))}</option>`).join('')}</select></label>
        <label>${esc(t('bkMaxDayLbl'))}<input type="number" min="1" name="maxPerDay" value="${cfg.maxPerDay}"></label>
        <label>${esc(t('bkDaysAheadLbl'))}<input type="number" min="1" max="90" name="daysAhead" value="${cfg.daysAhead}"></label>
        <div class="form-actions span-all"><button class="btn primary">${esc(t('save'))}</button></div>
      </form>
      <h2>${esc(t('courtsTitle'))}</h2>
      <p class="muted small">${esc(t('courtsHelp'))}</p>
      ${(S().courts || []).map(courtForm).join('')}
      <div class="btn-row"><button class="btn" data-action="court-add"><i class="ti ti-plus" aria-hidden="true"></i> ${esc(t('courtAdd'))}</button></div>
      <p class="muted small">${esc(t('courtsBlockHelp'))}</p>
      ${recurringCard()}
      <form class="card" data-form="book-rewards-save">
        <h2><i class="ti ti-star" aria-hidden="true"></i> ${esc(t('bookRewardsTitle'))}</h2>
        <p class="muted small">${esc(t('bookRewardsHelp'))}</p>
        <div class="grid-form">${REWARDS.map(([k, icon]) => `<label>${icon} ${esc(t('rw_' + k))}
          <input name="${k}" type="number" min="0" inputmode="numeric" value="${th[k] || ''}" placeholder="—"></label>`).join('')}</div>
        <div class="form-actions"><button class="btn primary">${esc(t('save'))}</button></div>
      </form>`;
  }

  // ====================================================================
  // SFIDE: un utente cerca giocatori (uomini / donne), gli altri si candidano, il proponente accetta o declina;
  // a sfida completa "Fai partire la sfida" prenota un campo libero (o propone l'orario libero più vicino).
  // ====================================================================
  const LEVELS = ['start', 'inter', 'high', 'pro'];
  // livello cercato (sfide, cerco compagno/a): anche "Non importa il livello"
  const SEEK_LEVELS = LEVELS.concat('any');
  const chApps = c => (S().chapps || []).filter(a => a.cid === c.id);
  const chAccepted = c => chApps(c).filter(a => a.status === 'accepted');
  const chCount = (c, g) => chAccepted(c).filter(a => a.gender === g).length + (c.guests || []).filter(x => x.gender === g).length;
  const chNeed = (c, g) => Number(g === 'M' ? c.needM : c.needF) || 0;
  const chMissing = (c, g) => Math.max(0, chNeed(c, g) - chCount(c, g));
  const chComplete = c => !chMissing(c, 'M') && !chMissing(c, 'F');
  const chTo = c => addMin(c.from, Number(c.dur) || 60);
  const chPast = c => isPastSlot(c.date, c.from);
  const chMine = c => c.by === myUid();
  // nome del proponente: salvato nella sfida (l'admin compare come "Manofuori Cup")
  const chByName = c => c.byName || uidName(c.by);
  const chMyApp = c => chApps(c).find(a => a.uid === myUid());
  // partecipanti registrati: proponente + candidati accettati (gli ospiti non registrati li conferma il proponente)
  const chRegistered = c => [c.by].concat(chAccepted(c).map(a => a.uid));
  const chAltOk = c => !!c.alt && chRegistered(c).every(u => (c.alt.ok || []).includes(u));
  const canPlay = () => !!member() && !needsVerify() && !banOf(member().uid).book;
  const gWord = (g, n) => t(g === 'F' ? (n === 1 ? 'chWoman' : 'chWomen') : (n === 1 ? 'chMan' : 'chMen'), { n });
  const needText = (c, fn) => ['F', 'M'].filter(g => fn(c, g) > 0).map(g => gWord(g, fn(c, g))).join(', ');

  // Primo campo libero (visibile) per tutta la durata; poi l'orario libero più vicino nello stesso giorno.
  function chFindCourt(date, from, dur) {
    const to = addMin(from, dur);
    if (toMin(to) > 24 * 60) return null;
    const c = (S().courts || []).filter(x => x.visible).find(x => selFree(x.id, date, from, to, null));
    return c ? { courtId: c.id, date, from, to } : null;
  }
  function chFindAlternative(date, from, dur) {
    for (let off = 30; off <= 18 * 60; off += 30) {
      for (const sign of [1, -1]) {
        const m = toMin(from) + sign * off;
        if (m < 6 * 60 || m + dur > 24 * 60) continue;
        const hit = chFindCourt(date, fromMin(m), dur);
        if (hit) return hit;
      }
    }
    return null;
  }

  // Dopo la revoca di un giocatore: scaduta l'ora senza conferma del proponente, la prenotazione si cancella
  // al primo accesso di un partecipante (o dell'admin).
  function chProcessExpired() {
    ui.chExpiring = ui.chExpiring || {};
    (S().challenges || []).forEach(c => {
      if (c.status !== 'started' || !(c.holdUntil > 0) || Date.now() <= c.holdUntil || ui.chExpiring[c.id]) return;
      if (!(admin() || chMine(c) || chMyApp(c))) return;
      ui.chExpiring[c.id] = true;
      window.Cloud.releaseChallenge(c).catch(() => { ui.chExpiring[c.id] = false; });
    });
  }

  // Avvisi in prima pagina: candidature da valutare, revoche, orari alternativi da confermare.
  function challengeAlerts() {
    const uid = myUid();
    if (!uid || !(member() || admin())) return '';
    chProcessExpired();
    const out = [];
    const mine = (S().challenges || []).filter(chMine);
    const pend = mine.reduce((n, c) => n + chApps(c).filter(a => a.status === 'pending').length, 0);
    if (pend) out.push(`<div class="msg-alert" role="alert"><div class="msg-head"><strong><i class="ti ti-swords" aria-hidden="true"></i> ${esc(t('chTitle'))}</strong></div>
      <div class="msg-text">${esc(t('chPendingAlert', { n: pend }))}</div><a class="btn small" href="#/challenges">${esc(t('chOpen'))} →</a></div>`);
    mine.forEach(c => chApps(c).filter(a => a.status === 'revoked').forEach(a => out.push(revokeWarning(c, a))));
    (S().challenges || []).filter(c => c.alt && !chMine(c) && chMyApp(c) && chMyApp(c).status === 'accepted' && !(c.alt.ok || []).includes(uid)).forEach(c =>
      out.push(`<div class="msg-alert" role="alert"><div class="msg-head"><strong><i class="ti ti-clock-question" aria-hidden="true"></i> ${esc(t('chAltTitle'))}</strong></div>
        <div class="msg-text">${esc(t('chAltAsk', { d: fmtDate(c.date), a: c.from, alt: `${courtName(c.alt.courtId)} ${c.alt.from}–${c.alt.to}` }))}</div>
        <a class="btn small" href="#/challenges">${esc(t('chOpen'))} →</a></div>`));
    return out.join('');
  }

  function revokeWarning(c, a) {
    const hold = c.status === 'started' && c.holdUntil > Date.now();
    const until = hold ? new Date(c.holdUntil).toLocaleTimeString(I18n.locale(), { hour: '2-digit', minute: '2-digit' }) : '';
    return `<div class="msg-alert warn-alert" role="alert">
      <div class="msg-head"><strong><i class="ti ti-alert-triangle" aria-hidden="true"></i> ${esc(t('chRevokedTitle'))}</strong></div>
      <div class="msg-text">${esc(t('chRevokedText', { n: a.name, d: fmtDate(c.date), a: c.from }))}${hold ? `<br><strong>${esc(t('chHoldText', { h: until }))}</strong>` : ''}</div>
      <div class="btn-row">${hold
        ? `<button class="btn small primary" data-action="ch-keep" data-id="${c.id}">${esc(t('chKeep'))}</button>
           <button class="btn small danger" data-action="ch-release" data-id="${c.id}">${esc(t('chRelease'))}</button>`
        : `<button class="btn small primary" data-action="ch-ack" data-id="${a.id}"><i class="ti ti-check" aria-hidden="true"></i> ${esc(t('chAckRevoke'))}</button>`}</div></div>`;
  }

  function chStatusBadge(c) {
    if (c.status === 'started' && c.book) return `<span class="badge st-done">${esc(t('chStarted'))}</span>`;
    if (c.alt) return `<span class="badge warn-b">${esc(t('chAltPending'))}</span>`;
    return chComplete(c) ? `<span class="badge ch-full">${esc(t('chComplete'))}</span>` : `<span class="badge">${esc(t('chOpenBadge'))}</span>`;
  }

  function challengeCard(c) {
    const uid = myUid(), mine = chMine(c), my = chMyApp(c), m = member();
    const apps = chApps(c), acc = chAccepted(c);
    const players = [`<li><strong>${esc(chByName(c))}</strong> <small class="muted">· ${esc(t('chProposer'))}</small></li>`]
      .concat(acc.map(a => `<li>${esc(a.name)} <span class="badge g-${a.gender}">${esc(a.gender)}</span>${mine && c.status !== 'started' ? ` <button class="icon-btn" data-action="ch-app" data-id="${a.id}" data-v="declined" title="${esc(t('remove'))}" aria-label="${esc(t('remove'))}">✕</button>` : ''}</li>`))
      .concat((c.guests || []).map((g, i) => `<li>${esc(g.last)} ${esc(g.first)} <span class="badge g-${g.gender}">${esc(g.gender)}</span> <small class="muted">· ${esc(t('chGuest'))}</small>${mine ? ` <button class="icon-btn" data-action="ch-guest-del" data-id="${c.id}" data-i="${i}" title="${esc(t('remove'))}" aria-label="${esc(t('remove'))}">✕</button>` : ''}</li>`));
    const missing = needText(c, chMissing);
    let mineBox = '';
    if (my) {
      const lbl = { pending: 'chToConfirm', accepted: 'chConfirmed', declined: 'chDeclined', revoked: 'chRevoked' }[my.status];
      mineBox = `<p class="ch-me"><span class="badge ${my.status === 'accepted' ? 'st-done' : my.status === 'pending' ? 'warn-b' : ''}">${esc(t(lbl))}</span>
        ${['pending', 'accepted'].includes(my.status) && !chPast(c) ? `<button class="btn small danger" data-action="ch-revoke" data-id="${my.id}">${esc(t('chRevoke'))}</button>` : ''}</p>`;
      if (c.alt && my.status === 'accepted') mineBox += (c.alt.ok || []).includes(uid) ? `<p class="note ok">${esc(t('chAltConfirmed'))}</p>`
        : `<p class="note warn">${esc(t('chAltAskShort', { alt: `${courtName(c.alt.courtId)} ${c.alt.from}–${c.alt.to}` }))} <button class="btn small primary" data-action="ch-alt-ok" data-id="${c.id}">${esc(t('chAltConfirm'))}</button></p>`;
    } else if (!mine && m && !chPast(c) && chMissing(c, m.gender) > 0) {
      mineBox = canPlay() ? `<button class="btn primary" data-action="ch-apply" data-id="${c.id}"><i class="ti ti-hand-finger" aria-hidden="true"></i> ${esc(t('chApply'))}</button>`
        : banOf(m.uid).book ? banNotice('book') : `<p class="note warn">${esc(t('verifyFirst'))}</p>`;
    }
    let ownerBox = '';
    if (mine || admin()) {
      const pend = apps.filter(a => a.status === 'pending');
      ownerBox = `${pend.length ? `<h4>${esc(t('chApplications'))}</h4><ul class="reg-list">${pend.map(a => `<li><span class="reg-names">${esc(a.name)} <span class="badge g-${a.gender}">${esc(a.gender)}</span></span>
          <span class="btn-row"><button class="btn small primary" data-action="ch-app" data-id="${a.id}" data-v="accepted">${esc(t('chAccept'))}</button>
          <button class="btn small" data-action="ch-app" data-id="${a.id}" data-v="declined">${esc(t('chDecline'))}</button></span></li>`).join('')}</ul>` : ''}
        ${mine && !chComplete(c) && !chPast(c) ? `<details class="sub-form"><summary><i class="ti ti-user-plus" aria-hidden="true"></i> ${esc(t('chAddGuest'))}</summary>
          <form class="grid-form" data-form="ch-guest" data-id="${c.id}">
            <label>${esc(t('lastName'))}<input name="last" required maxlength="60"></label>
            <label>${esc(t('firstName'))}<input name="first" required maxlength="60"></label>
            <label>${esc(t('gender'))}<select name="gender">${['F', 'M'].filter(g => chMissing(c, g) > 0).map(g => `<option value="${g}">${esc(t(g === 'F' ? 'female' : 'male'))}</option>`).join('')}</select></label>
            <div class="form-actions"><button class="btn primary">${esc(t('add'))}</button></div></form></details>` : ''}
        <div class="btn-row">
          ${mine && c.status !== 'started' && !c.alt && !chPast(c) ? `<button class="btn primary" data-action="ch-start" data-id="${c.id}" ${chComplete(c) ? '' : 'disabled'}><i class="ti ti-player-play" aria-hidden="true"></i> ${esc(t('chStart'))}</button>` : ''}
          ${mine && c.alt ? `${chAltOk(c) ? `<button class="btn primary" data-action="ch-alt-book" data-id="${c.id}">${esc(t('chAltBook'))}</button>` : ''}<button class="btn" data-action="ch-alt-cancel" data-id="${c.id}">${esc(t('chAltCancel'))}</button>` : ''}
          ${mine && c.status === 'started' && !(c.holdUntil > 0) ? `<button class="btn" data-action="ch-release" data-id="${c.id}">${esc(t('chRelease'))}</button>` : ''}
          <button class="btn danger" data-action="ch-delete" data-id="${c.id}"><i class="ti ti-trash" aria-hidden="true"></i> ${esc(t('chDelete'))}</button>
        </div>
        ${mine && c.status !== 'started' && !chComplete(c) ? `<p class="muted small">${esc(t('chStartHelp'))}</p>` : ''}`;
    }
    return `<div class="card ch-card ${mine ? 'mine' : ''}" id="ch-${c.id}">
      <div class="ch-head"><span class="badge">${esc(t('chType_' + c.type))}</span> <span class="badge lvl-${c.level}">${esc(t('chLevel_' + c.level))}</span> ${chStatusBadge(c)}</div>
      <h3 class="cap">${esc(longDate(c.date))} · ${c.from}–${chTo(c)}</h3>
      <p class="muted small">${esc(t('chBy', { n: chByName(c) }))} · ${esc(t('chSeeks', { s: needText(c, chNeed) || '—' }))}${missing ? ` · <strong>${esc(t('chMissingTxt', { s: missing }))}</strong>` : ''}</p>
      ${c.status === 'started' && c.book ? `<p class="note ok"><i class="ti ti-calendar-check" aria-hidden="true"></i> ${esc(t('chBooked', { c: courtName(c.book.courtId), a: c.book.from, b: c.book.to }))}</p>` : ''}
      ${c.alt ? `<p class="note warn"><i class="ti ti-clock-question" aria-hidden="true"></i> ${esc(t('chAltLine', { alt: `${courtName(c.alt.courtId)} ${c.alt.from}–${c.alt.to}`, n: chRegistered(c).filter(u => (c.alt.ok || []).includes(u)).length, tot: chRegistered(c).length }))}</p>` : ''}
      <ul class="ch-players">${players.join('')}</ul>
      ${mineBox}${ownerBox}
    </div>`;
  }

  function challengeForm() {
    const cfg = bookCfg(), today = todayStr(), max = addDays(today, Number(cfg.daysAhead) || 7);
    const durs = []; for (let x = Math.max(30, Math.round(Number(cfg.minHours) * 60) || 30); x <= Number(cfg.maxHours) * 60; x += 30) durs.push(x);
    const type = ui.chType || 'X';
    return `<details class="card sub-form" ${ui.chFormOpen ? 'open' : ''}><summary><i class="ti ti-plus" aria-hidden="true"></i> ${esc(t('chNew'))}</summary>
      <form class="grid-form" data-form="ch-create">
        <label>${esc(t('chType'))}<select name="type" data-change="ch-type">${['M', 'F', 'X'].map(x => `<option value="${x}" ${x === type ? 'selected' : ''}>${esc(t('chType_' + x))}</option>`).join('')}</select></label>
        <label>${esc(t('chLevel'))}<select name="level">${SEEK_LEVELS.map(l => `<option value="${l}">${esc(t('chLevel_' + l))}</option>`).join('')}</select></label>
        <label>${esc(t('bkDay'))}<input type="date" name="date" required min="${today}" ${admin() ? '' : `max="${max}"`} value="${today}"></label>
        <label>${esc(t('bkTime'))}<select name="from">${HALF_HOURS.slice(0, -1).map(h => `<option ${h === '18:00' ? 'selected' : ''}>${h}</option>`).join('')}</select></label>
        <label>${esc(t('bkDuration'))}<select name="dur">${durs.map(x => `<option value="${x}" ${x === 90 ? 'selected' : ''}>${esc(durText('00:00', fromMin(x)))}</option>`).join('')}</select></label>
        ${type !== 'F' ? `<label>${esc(t('chNeedM'))}<input type="number" name="needM" min="0" max="20" value="${type === 'M' ? 3 : 1}"></label>` : ''}
        ${type !== 'M' ? `<label>${esc(t('chNeedF'))}<input type="number" name="needF" min="0" max="20" value="${type === 'F' ? 3 : 2}"></label>` : ''}
        <p class="muted small span-all">${esc(t('chFormHelp', { d: cfg.daysAhead }))}</p>
        <div class="form-actions span-all"><button class="btn primary"><i class="ti ti-swords" aria-hidden="true"></i> ${esc(t('chLaunch'))}</button></div>
      </form></details>`;
  }

  function viewChallenges() {
    const uid = myUid();
    const head = `<div class="page-head"><h1><i class="ti ti-swords" aria-hidden="true"></i> ${esc(t('chTitle'))}</h1><p class="muted">${esc(t('chIntro'))}</p></div>`;
    if (!uid || !(member() || admin())) return `${head}<div class="card"><p>${esc(t('chLoginFirst'))}</p><a class="btn primary" href="#/settings">${esc(t('loginOrRegister'))}</a></div>`;
    chProcessExpired();
    const all = (S().challenges || []).filter(c => c.date >= todayStr()).sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from));
    const mine = all.filter(chMine);
    const joined = all.filter(c => !chMine(c) && chMyApp(c));
    const others = all.filter(c => !chMine(c) && !chMyApp(c) && !chPast(c) && (admin() || !chComplete(c)));
    const sec = (title, list, empty) => `<section class="feat-block"><h2>${esc(t(title))} (${list.length})</h2>
      ${list.length ? `<div class="ch-grid">${list.map(challengeCard).join('')}</div>` : `<p class="muted">${esc(t(empty))}</p>`}</section>`;
    return `${challengeAlerts()}${verifyNotice()}${banNotice('book')}${head}
      ${canPlay() || admin() ? challengeForm() : ''}
      ${sec('chMine', mine, 'chNoneMine')}
      ${member() ? sec('chJoined', joined, 'chNoneJoined') : ''}
      ${sec(admin() ? 'chAll' : 'chOthers', admin() ? all.filter(c => !chMine(c)) : others, 'chNoneOpen')}`;
  }

  // ---------- azioni delle sfide ----------
  const chById = id => (S().challenges || []).find(c => c.id === id);
  const chErr = e => warn(e && e.code === 'permission-denied' ? 'chDenied' : 'regError', { code: (e && (e.code || e.message)) || '' });
  function chCreate(f) {
    const cfg = bookCfg();
    const type = f.type.value, needM = type === 'F' ? 0 : Math.max(0, parseInt(f.needM.value, 10) || 0), needF = type === 'M' ? 0 : Math.max(0, parseInt(f.needF.value, 10) || 0);
    const c = { type, level: f.level.value, date: f.date.value, from: f.from.value, dur: Number(f.dur.value), needM, needF, guests: [] };
    if (!c.date || !c.from) return warn('errRegFields');
    if (needM + needF < 1) return warn('chNeedSome');
    if (isPastSlot(c.date, c.from)) return warn('chPastErr');
    if (!admin() && c.date > addDays(todayStr(), Number(cfg.daysAhead) || 7)) return warn('chTooFar', { d: cfg.daysAhead });
    c.byName = admin() ? 'Manofuori Cup' : personLabel(member());
    if (toMin(c.from) + c.dur > 24 * 60) return warn('chPastErr');
    window.Cloud.createChallenge(c).then(() => { ui.chFormOpen = false; ui.flash = { text: t('chCreated') }; render(); }).catch(chErr);
  }
  function chStart(c) {
    const cfg = bookCfg(), uid = myUid();
    if (!chComplete(c)) return warn('chIncomplete');
    if (chPast(c)) return warn('chPastErr');
    if (!admin() && (S().bookings || []).filter(b => b.userId === uid && b.date === c.date).length >= Number(cfg.maxPerDay)) return warn('bkMaxDay', { n: cfg.maxPerDay, max: cfg.maxPerDay });
    const hit = chFindCourt(c.date, c.from, Number(c.dur));
    if (hit) {
      return window.Cloud.startChallenge(c, Object.assign({ id: Store.uid('g') }, hit))
        .then(() => { ui.flash = { text: t('chBookedOk', { c: courtName(hit.courtId), a: hit.from, b: hit.to }) }; render(); }).catch(chErr);
    }
    const alt = chFindAlternative(c.date, c.from, Number(c.dur));
    if (!alt) return warn('chNoSlot');
    const data = Object.assign({}, alt, { ok: [uid] });
    window.Cloud.updateChallenge(c.id, { alt: data })
      .then(() => { ui.flash = { type: 'warn', text: t('chAltProposed', { alt: `${courtName(alt.courtId)} ${alt.from}–${alt.to}` }) }; render(); }).catch(chErr);
  }
  function chBookAlt(c) {
    const a = c.alt;
    if (!a || !chAltOk(c)) return;
    if (!chFindCourtExact(a)) { window.Cloud.updateChallenge(c.id, { alt: null }).catch(() => {}); return warn('chAltTaken'); }
    window.Cloud.startChallenge(c, { id: Store.uid('g'), courtId: a.courtId, date: a.date, from: a.from, to: a.to }, { date: a.date, from: a.from })
      .then(() => { ui.flash = { text: t('chBookedOk', { c: courtName(a.courtId), a: a.from, b: a.to }) }; render(); }).catch(chErr);
  }
  const chFindCourtExact = a => { const c = courtById(a.courtId); return c && c.visible && selFree(a.courtId, a.date, a.from, a.to, null); };

  // ====================================================================
  // CERCO COMPAGNO/A (tornei con iscrizioni aperte)
  // Chi cerca è un utente registrato; si candida chiunque (anche senza account). Le candidature complete le vede
  // solo chi cerca (prima pagina e pagina del torneo); gli altri vedono solo "x candidature ricevute".
  // ====================================================================
  const ROLES = ['def', 'block', 'any'];
  // Moduli a scomparsa che restano aperti anche se la pagina si ridisegna (aggiornamenti dal database).
  const keepOpen = key => ((ui.keep || {})[key] ? 'open' : '');
  // La ricerca si chiude anche quando chi cerca risulta già iscritto (per esempio iscritto dall'admin).
  const searcherInTour = (tour, sr) => regsOf(tour).some(r => (r.uids || []).includes(sr.by))
    || tour.entries.some(e => [e.p1, e.p2].some(id => { const p = player(id); return p && p.uid === sr.by; }));
  const psOfTour = tour => (S().psearch || []).filter(x => x.tid === tour.id && x.status !== 'done' && !searcherInTour(tour, x));
  const psActive = sr => (sr.act != null ? sr.act : sr.n) || 0;
  // Chi cerca (o l'admin) segna come conclusa la ricerca di chi risulta già iscritto.
  function psHousekeeping(tour) {
    if (!(admin() || member())) return;
    ui.psFix = ui.psFix || {};
    (S().psearch || []).filter(x => x.tid === tour.id && x.status !== 'done' && (x.by === myUid() || admin())).forEach(sr => {
      const patch = searcherInTour(tour, sr) ? { status: 'done' } : null;
      const key = sr.id + JSON.stringify(patch);
      if (!patch || ui.psFix[key]) return;
      ui.psFix[key] = true;
      window.Cloud.updateSearch(sr.id, patch).catch(() => {});
    });
  }
  const psApps = sid => (S().papps || []).filter(a => a.sid === sid).sort((a, b) => a.k - b.k);
  const psMine = tour => (S().psearch || []).find(x => x.tid === tour.id && x.by === myUid());
  const psPartnerGender = (tour, g) => (tour.gender === 'X' ? (g === 'M' ? 'F' : 'M') : tour.gender);
  // livello "-" (none): il candidato non indica il livello, si mostra solo il ruolo
  const lvlRole = (l, r) => (l === 'none' ? t('psRole_' + r) : `${t('chLevel_' + l)} · ${t('psRole_' + r)}`);
  const memberInTour = (tour, m) => !!(personInRegs(tour, { uid: m.uid, first: m.first, last: m.last, gender: m.gender })
    || tour.entries.some(e => [e.p1, e.p2].some(id => { const p = player(id); return p && p.uid === m.uid; })));

  function psAppCard(sr, a, tour) {
    const st = { pending: 'chToConfirm', accepted: 'chConfirmed', declined: 'chDeclined', revoked: 'chRevoked' }[a.status];
    return `<li class="ps-app ${a.status}"><span class="reg-names"><strong>${esc(a.last)} ${esc(a.first)}</strong> <span class="badge g-${a.gender}">${esc(a.gender)}</span>
        ${a.uid ? '' : `<span class="badge">${esc(t('psNoAccount'))}</span>`}<br>
        <small>${esc(lvlRole(a.level, a.role))}${a.contact ? ` · <i class="ti ti-phone" aria-hidden="true"></i> ${esc(a.contact)}` : ''}</small>
        ${a.status !== 'pending' ? `<br><span class="badge ${a.status === 'accepted' ? 'st-done' : ''}">${esc(t(st))}</span>` : ''}</span>
      ${a.status === 'pending' && sr.status === 'open' ? `<span class="btn-row"><button class="btn small primary" data-action="ps-accept" data-id="${a.id}">${esc(t('chAccept'))}</button>
        <button class="btn small" data-action="ps-decline" data-id="${a.id}">${esc(t('chDecline'))}</button></span>` : ''}</li>`;
  }

  // Riquadro di chi cerca: candidature complete, accetta/rifiuta, poi "Iscrivi la squadra al torneo".
  function psOwnerBlock(sr, tour) {
    const apps = psApps(sr.id).filter(a => a.status !== 'revoked');
    const acc = sr.acc && apps.find(a => a.id === sr.acc);
    return `<div class="ps-owner">
      ${acc ? `<p class="note ok"><i class="ti ti-heart-handshake" aria-hidden="true"></i> ${esc(t('psMatched', { n: `${acc.last} ${acc.first}` }))}</p>
        ${sr.by !== myUid() && !admin() ? '' : `<div class="btn-row"><button class="btn primary" data-action="ps-register" data-id="${sr.id}"><i class="ti ti-pencil-plus" aria-hidden="true"></i> ${esc(t('psRegister'))}</button></div>`}` : ''}
      ${apps.length ? `<ul class="reg-list">${apps.map(a => psAppCard(sr, a, tour)).join('')}</ul>` : `<p class="muted small">${esc(t('psNoApps'))}</p>`}
      <div class="btn-row"><button class="btn small danger" data-action="ps-close" data-id="${sr.id}">${esc(t('psClose'))}</button></div>
    </div>`;
  }

  function psApplyForm(sr) {
    const m = member(), mine = (S().papps || []).find(a => a.sid === sr.id && a.uid && a.uid === myUid() && a.status !== 'revoked');
    if (mine) {
      const st = { pending: 'chToConfirm', accepted: 'chConfirmed', declined: 'chDeclined' }[mine.status];
      return `<p class="ch-me"><span class="badge ${mine.status === 'accepted' ? 'st-done' : mine.status === 'pending' ? 'warn-b' : ''}">${esc(t(st))}</span>
        ${['pending', 'accepted'].includes(mine.status) ? `<button class="btn small danger" data-action="ps-revoke" data-id="${mine.id}">${esc(t('chRevoke'))}</button>` : ''}</p>`;
    }
    if (sr.status !== 'open' || sr.by === myUid() || admin() || scorer()) return '';
    if (m && m.gender !== sr.pg) return '';
    if (m && banOf(m.uid).tour) return '';
    const g = sr.pg, opts = (list, pre) => list.map(x => `<option value="${x}">${esc(t(pre + x))}</option>`).join('');
    return `<details class="sub-form" data-keep="psa-${sr.id}" ${keepOpen('psa-' + sr.id)}><summary><i class="ti ti-hand-finger" aria-hidden="true"></i> ${esc(t('psApply'))}</summary>
      <form class="grid-form" data-form="ps-apply" data-id="${sr.id}">
        ${m ? `<p class="span-all"><strong>${esc(personLabel(m))}</strong></p>`
          : `<label>${esc(t('lastName'))}<input name="last" required maxlength="60"></label>
             <label>${esc(t('firstName'))}<input name="first" required maxlength="60"></label>
             <p class="muted small span-all">${esc(t('psGenderFixed', { g: t(g === 'F' ? 'female' : 'male').toLowerCase() }))}</p>`}
        <label>${esc(t('psMyLevel'))}<select name="level">${opts(['none'].concat(LEVELS), 'chLevel_')}</select></label>
        <label>${esc(t('psMyRole'))}<select name="role">${opts(ROLES, 'psRole_')}</select></label>
        ${m ? '' : `<label class="span-all">${esc(t('psContact'))}<input name="contact" maxlength="80" placeholder="${esc(t('psContactPh'))}"></label>`}
        <div class="form-actions span-all"><button class="btn primary">${esc(t('psSend'))}</button></div>
      </form></details>`;
  }

  function partnerBox(tour) {
    if (regPhase(tour) !== 'open') return '';
    psHousekeeping(tour);
    const m = member(), list = psOfTour(tour), mine = psMine(tour);
    // Il riquadro c'è sempre finché le iscrizioni sono aperte; sotto, cosa può fare chi guarda.
    let create = '';
    if (admin()) create = `<p class="muted small">${esc(t('psAdminHint'))}</p>`;
    else if (!m) create = scorer() ? '' : `<p class="muted small">${esc(t(list.length ? 'psGuestHint' : 'psLoginHint'))}</p>${list.length ? '' : `<a class="btn small" href="#/settings">${esc(t('loginOrRegister'))}</a>`}`;
    else if (mine) create = '';
    else if (memberInTour(tour, m)) create = `<p class="muted small">${esc(t('psAlreadyIn'))}</p>`;
    else if (banOf(m.uid).tour) create = banNotice('tour');
    else if (tour.gender !== 'X' && m.gender !== tour.gender) create = `<p class="muted small">${esc(t('regWrongGender'))}</p>`;
    else {
      create = needsVerify() ? `<p class="note warn">${esc(t('verifyFirst'))}</p>` :
        `<details class="sub-form" data-keep="pso-${tour.id}" ${keepOpen('pso-' + tour.id)}><summary><i class="ti ti-search" aria-hidden="true"></i> ${esc(t('psStart'))}</summary>
        <form class="grid-form" data-form="ps-open" data-tid="${tour.id}">
          <p class="span-all"><strong>${esc(personLabel(m))}</strong> · ${esc(t('psSeeking', { g: t(psPartnerGender(tour, m.gender) === 'F' ? 'psFemale' : 'psMale') }))}</p>
          <label>${esc(t('psLevel'))}<select name="level">${SEEK_LEVELS.map(l => `<option value="${l}">${esc(t('chLevel_' + l))}</option>`).join('')}</select></label>
          <label>${esc(t('psRole'))}<select name="role">${ROLES.map(r => `<option value="${r}">${esc(t('psRole_' + r))}</option>`).join('')}</select></label>
          <div class="form-actions span-all"><button class="btn primary">${esc(t('psPublish'))}</button></div>
        </form></details>`;
    }
    return `<div class="card ps-box" id="partner">
      <h2><i class="ti ti-users-plus" aria-hidden="true"></i> ${esc(t('psTitle'))}</h2>
      <p class="muted small">${esc(t('psIntro'))}</p>
      ${list.length ? '' : `<p class="muted">${esc(t('psNone'))}</p>`}
      ${list.length ? `<ul class="ps-list">${list.map(sr => `<li class="${sr.by === myUid() ? 'mine' : ''}">
        <div class="ps-head"><strong>${esc(sr.name)}</strong> <span class="badge g-${sr.gender}">${esc(sr.gender)}</span>
          <span class="muted small">${esc(t('psLooksFor', { g: t(sr.pg === 'F' ? 'psFemale' : 'psMale'), lr: lvlRole(sr.level, sr.role) }))}</span>
          ${sr.status === 'matched' ? `<span class="badge st-done">${esc(t('psFound'))}</span>` : ''}
          ${sr.by !== myUid() && !admin() ? `<span class="badge">${esc(t('psReceived', { n: psActive(sr) }))}</span>` : ''}</div>
        ${sr.by === myUid() || admin() ? psOwnerBlock(sr, tour) : psApplyForm(sr)}
      </li>`).join('')}</ul>` : ''}
      ${create}
    </div>`;
  }

  // Prima pagina: a chi cerca le candidature complete; al candidato registrato l'esito positivo.
  function partnerAlerts() {
    const uid = myUid();
    if (!uid || !member()) return '';
    const out = [];
    (S().psearch || []).filter(sr => sr.by === uid && sr.status !== 'done').forEach(sr => {
      const tour = tourById(sr.tid);
      if (!tour || regPhase(tour) !== 'open') return;
      psHousekeeping(tour);
      if (searcherInTour(tour, sr)) return;
      const pend = psApps(sr.id).filter(a => a.status === 'pending');
      if (!pend.length && sr.status !== 'matched') return;
      out.push(`<div class="msg-alert" role="alert"><div class="msg-head"><strong><i class="ti ti-users-plus" aria-hidden="true"></i> ${esc(t('psAlertTitle', { t: tour.name }))}</strong></div>
        ${psOwnerBlock(sr, tour)}<a class="btn small" href="#/t/${tour.id}">${esc(t('psGoTour'))} →</a></div>`);
    });
    (S().papps || []).filter(a => a.uid === uid && a.status === 'accepted').forEach(a => {
      const sr = (S().psearch || []).find(x => x.id === a.sid), tour = tourById(a.tid);
      if (!sr || sr.status !== 'matched' || !tour) return;
      out.push(`<div class="msg-alert" role="alert"><div class="msg-head"><strong><i class="ti ti-heart-handshake" aria-hidden="true"></i> ${esc(t('psYouAccepted', { n: sr.name, t: tour.name }))}</strong></div>
        <div class="msg-text">${esc(t('psYouAcceptedText'))}</div><a class="btn small" href="#/t/${tour.id}">${esc(t('psGoTour'))} →</a></div>`);
    });
    return out.join('');
  }

  const psById = id => (S().psearch || []).find(x => x.id === id);
  const pappById = id => (S().papps || []).find(x => x.id === id);
  const psErr = e => warn(e && (e.code === 'permission-denied' || e.code === 'closed') ? 'psDenied' : 'regError', { code: (e && (e.code || e.message)) || '' });
  function psRegister(sr) {
    // l'admin può iscrivere la squadra al posto di chi cerca
    const tour = tourById(sr.tid), m = admin() ? memberByUid(sr.by) : member(), a = pappById(sr.acc);
    if (!tour || !m || !a || regPhase(tour) !== 'open') return warn('regClosedMsg');
    const p1 = { uid: m.uid, first: m.first, last: m.last, gender: m.gender };
    const p2 = { uid: a.uid || null, first: a.first, last: a.last, gender: a.gender };
    if (personInRegs(tour, p1) || memberInTour(tour, m)) return warn('regAlready');
    if (personInRegs(tour, p2)) return warn('regPartnerAlready');
    window.Cloud.registerFromSearch(sr, { tid: tour.id, by: admin() ? myUid() : m.uid, uids: a.uid ? [m.uid, a.uid] : [m.uid], p1, p2 })
      .then(() => { ui.flash = { text: t('regSaved') }; location.hash = `#/t/${tour.id}`; render(); }).catch(psErr);
  }

  // ====================================================================
  // PRIVACY E TERMINI: pagine legali, presa visione, dati personali (diritti GDPR artt. 15-22).
  // ====================================================================
  function viewLegal(kind) {
    const title = { privacy: 'legalPrivacy', cookie: 'legalCookie', termini: 'legalTerms' }[kind];
    return `<div class="page-head"><h1><i class="ti ti-shield-lock" aria-hidden="true"></i> ${esc(t(title))}</h1>
      ${I18n.lang !== 'it' ? `<p class="note">${esc(t('legalItalianOnly'))}</p>` : ''}</div>
      <article class="card legal-text" lang="it">${Legal.pages[kind]}</article>
      <p class="muted small"><a href="#/privacy">${esc(t('legalPrivacy'))}</a> · <a href="#/cookie">${esc(t('legalCookie'))}</a> · <a href="#/termini">${esc(t('legalTerms'))}</a></p>`;
  }
  // Utente registrato che non ha ancora preso visione della versione attuale (es. registrato prima, o creato dall'admin).
  function privacyAlert() {
    const m = member();
    if (!m || m.privacyVer === Legal.VERSION) return '';
    return `<div class="msg-alert privacy-alert" role="alert"><div class="msg-head"><strong><i class="ti ti-shield-check" aria-hidden="true"></i> ${esc(t('privacyAlertTitle'))}</strong></div>
      <div class="msg-text">${t('privacyAlertText')}</div>
      <button class="btn small primary" data-action="privacy-accept">${esc(t('privacyAccept'))}</button></div>`;
  }
  function privacyCard() {
    const m = member();
    if (!m) return '';
    return `<div class="card" id="my-privacy"><h2><i class="ti ti-shield-lock" aria-hidden="true"></i> ${esc(t('myPrivacy'))}</h2>
      <p class="muted small">${m.privacyAt ? esc(t('privacyAcceptedOn', { d: fmtDate(new Date(m.privacyAt).toLocaleDateString('sv')) })) : ''}
        <a href="#/privacy">${esc(t('legalPrivacy'))}</a> · <a href="#/cookie">${esc(t('legalCookie'))}</a> · <a href="#/termini">${esc(t('legalTerms'))}</a></p>
      <p class="small">${esc(t('myPrivacyHelp'))}</p>
      <div class="btn-row">
        <button class="btn" data-action="my-data"><i class="ti ti-download" aria-hidden="true"></i> ${esc(t('myDataDownload'))}</button>
        ${m.deleteReq ? `<span class="badge">${esc(t('deleteRequested', { d: fmtDate(new Date(m.deleteReq).toLocaleDateString('sv')) }))}</span>`
          : `<button class="btn danger" data-action="delete-request"><i class="ti ti-user-x" aria-hidden="true"></i> ${esc(t('deleteRequest'))}</button>`}
      </div>
      <p class="muted small">${esc(t('myPrivacyContact'))} <a href="mailto:${Legal.ORG.email}">${Legal.ORG.email}</a></p></div>`;
  }
  // Copia dei propri dati (art. 15 e 20 GDPR) in formato JSON.
  function myDataExport() {
    const m = member(), uid = m.uid, mine = x => x.uid === uid;
    const data = {
      titolare: Legal.ORG.name, generato: new Date().toISOString(),
      profilo: { nome: m.first, cognome: m.last, sesso: m.gender, email: m.email, registrato: m.created ? new Date(m.created).toISOString() : null, informativaAccettata: m.privacyAt ? new Date(m.privacyAt).toISOString() : null },
      schedaCorsista: (S().athletes || []).find(a => a.id === uid) || null,
      pianiAllenamento: (S().plans || []).filter(mine),
      presenze: (S().att || []).filter(mine),
      spotERecuperi: (S().spots || []).filter(mine),
      ricevute: (S().receipts || []).filter(mine),
      prenotazioni: (S().bookingsMine || []).map(b => ({ campo: courtName(b.courtId), data: b.date, dalle: b.from, alle: b.to })),
      iscrizioniTornei: (S().registrations || []).filter(x => x.uids && x.uids.includes(uid)).map(x => ({ torneo: (tourById(x.tid) || {}).name || x.tid, iscritto: x.created ? new Date(x.created).toISOString() : null })),
      giocoLibero: (S().fpreg || []).filter(mine)
    };
    saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `manofuori-cup_dati_${latinName(personName(m))}.json`);
  }
  const privacyActions = {
    'privacy-accept': () => { window.Cloud.acceptPrivacy(Legal.VERSION).then(() => { ui.flash = { text: t('privacyAccepted') }; render(); }).catch(e => warn('regError', { code: e.code || e.message })); },
    'my-data': () => myDataExport(),
    'delete-request': () => {
      const m = member();
      if (!m || !confirmed('deleteRequestConfirm')) return;
      window.Cloud.requestDeletion(t('deleteRequestNotice', { n: personName(m), e: m.email || '' }))
        .then(() => { ui.flash = { text: t('deleteRequestSent') }; render(); }).catch(e => warn('regError', { code: e.code || e.message }));
    }
  };

  // ====================================================================
  // ALLENAMENTI: allenamenti settimanali (admin), coach, gruppi del mese, schede corsisti e listino.
  // I gruppi li compone l'admin mese per mese; il piano del corsista (quanti a settimana, prezzo)
  // si ricava dai gruppi in cui è inserito. Il coach vede solo nomi (e poi presenze).
  // ====================================================================
  const coach = () => (member() && window.Cloud.coach) || null;
  // Chi usa gli allenamenti in prima persona: l'utente registrato, oppure l'admin che ha anche la scheda da giocatore
  // (così un admin può essere corsista o coach).
  const self = () => member() || (admin() && window.Cloud.adminMember) || null;
  const curMonth = () => todayStr().slice(0, 7);
  const shiftMonth = (m, n) => { const d = new Date(m + '-15T12:00'); d.setMonth(d.getMonth() + n); return d.toLocaleDateString('sv').slice(0, 7); };
  const monthLabel = m => { const x = new Date(m + '-15T12:00').toLocaleDateString(I18n.locale(), { month: 'long', year: 'numeric' }); return x.charAt(0).toUpperCase() + x.slice(1); };
  // stagione sportiva dal 1° settembre: "2026/27"
  const seasonOf = d => { const y = +d.slice(0, 4), mo = +d.slice(5, 7); const a = mo >= 9 ? y : y - 1; return `${a}/${String((a + 1) % 100).padStart(2, '0')}`; };
  const QUARTERS = Array.from({ length: 73 }, (_, i) => fromMin(360 + i * 15));   // 06:00 – 24:00 ogni 15 minuti
  const trainings = () => (S().trainings || []).slice().sort((a, b) => a.dow - b.dow || a.from.localeCompare(b.from));
  const trainingById = id => (S().trainings || []).find(x => x.id === id);
  const trLabel = tr => { const d = dayName(tr.dow); return `${d.charAt(0).toUpperCase() + d.slice(1)} ${tr.from}–${tr.to}`; };
  const trTitle = tr => tr.name || t('trDefaultName', { l: t('fpLevel_' + tr.level) });
  const groupOf = (tid, month) => (S().groups || []).find(g => g.tid === tid && g.month === month);
  const athleteOf = uid => (S().athletes || []).find(a => a.id === uid);
  const planOf = (uid, month) => (S().plans || []).find(p => p.uid === uid && p.month === month);
  const coachOf = uid => (S().coaches || []).find(c => c.id === uid);
  const coachName = uid => { const m = memberByUid(uid), c = coachOf(uid); return m ? personName(m) : (c && c.name) || '—'; };
  const priceFor = n => { const p = S().prices || {}; const v = p['w' + Math.min(n, 4)]; return n && v != null && v !== '' ? Number(v) : null; };
  const euro = v => (v == null || v === '' ? '—' : Number(v).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }));
  // certificato medico: scaduto, in scadenza (entro 30 giorni) o valido
  const certState = a => {
    if (!a || !a.certExp) return 'none';
    const today = todayStr(), soon = new Date(); soon.setDate(soon.getDate() + 30);
    return a.certExp < today ? 'expired' : a.certExp <= soon.toLocaleDateString('sv') ? 'soon' : 'ok';
  };
  const certBadge = a => {
    const st = certState(a);
    return `<span class="badge cert-${st}"><i class="ti ti-${st === 'ok' ? 'heart-check' : st === 'none' ? 'heart-question' : 'alert-triangle'}" aria-hidden="true"></i> ${esc(st === 'none' ? t('certNone') : t('cert_' + st, { d: fmtDate(a.certExp) }))}</span>`;
  };
  const tessBadge = a => {
    const s = seasonOf(todayStr()), ok = !!(a && a.tess && a.tess[s]);
    return `<span class="badge ${ok ? 'st-done' : 'tess-no'}">${esc(t(ok ? 'tessYes' : 'tessNo', { s }))}</span>`;
  };
  // Allenamenti che il coach può vedere (tutti o solo i suoi)
  const visibleTrainings = () => (admin() ? trainings() : coach() ? trainings().filter(tr => coach().all || tr.coachUid === myUid()) : []);

  // Descrizione degli allenamenti del piano (dagli allenamenti attuali; per quelli eliminati resta quella salvata).
  const trDesc = tr => [trTitle(tr), trLabel(tr), tr.coachUid ? coachName(tr.coachUid) : ''].filter(Boolean).join(' · ');
  const planDesc = p => (p.tids || []).map((id, i) => { const tr = trainingById(id); return tr ? trDesc(tr) : (p.desc || [])[i] || ''; }).filter(Boolean);
  // Piano del mese ricalcolato da tutti i gruppi (con le modifiche "groups" non ancora salvate).
  function planFrom(uid, month, groups) {
    const tids = groups.filter(g => g.month === month && (g.uids || []).includes(uid)).map(g => g.tid)
      .sort((a, b) => { const x = trainingById(a), y = trainingById(b); return x && y ? x.dow - y.dow || x.from.localeCompare(y.from) : 0; });
    const old = planOf(uid, month);
    const desc = tids.map(id => { const tr = trainingById(id); return tr ? trDesc(tr) : ''; }).filter(Boolean);
    if (!tids.length) return old ? { id: old.id, del: true } : null;
    const auto = priceFor(tids.length);
    return { id: `${uid}_${month}`, uid, month, tids, desc, n: tids.length, price: old && old.manual ? old.price : auto, manual: !!(old && old.manual), updated: Date.now() };
  }

  function viewTraining() {
    // utenti e visitatori: posti spot disponibili e i propri allenamenti
    if (!admin() && !coach()) {
      const mine = member() ? myTrainingCard() : '';
      return `${trainingAlerts()}<div class="page-head"><h1><i class="ti ti-barbell" aria-hidden="true"></i> ${esc(t('navTrain'))}</h1><p class="muted">${esc(t('trIntroPublic'))}</p></div>${mine}${spotSection(false)}`;
    }
    const tab = ui.trTab || 'day';
    const tabs = `<nav class="tabs">${[['day', 'trTabDay', 'calendar-check'], ['groups', 'trTabGroups', 'users-group']].map(([k, l, i]) =>
      `<a href="#/train" class="${tab === k ? 'active' : ''}" data-action="tr-tab" data-tab="${k}"><i class="ti ti-${i}" aria-hidden="true"></i> ${esc(t(l))}</a>`).join('')}</nav>`;
    if (tab === 'day') return `${admin() ? trainingAlerts() : ''}<div class="page-head row"><h1><i class="ti ti-barbell" aria-hidden="true"></i> ${esc(t('navTrain'))}</h1>
        ${admin() ? `<span class="btn-row"><a class="btn small" href="#/report"><i class="ti ti-report-analytics" aria-hidden="true"></i> ${esc(t('rpTitle'))} →</a><a class="btn small" href="#/athletes"><i class="ti ti-id-badge-2" aria-hidden="true"></i> ${esc(t('athTitle'))} →</a></span>` : ''}</div>${tabs}${admin() ? myTrainingCard() : ''}${trainingDay()}`;
    const month = ui.trMonth || curMonth();
    const list = visibleTrainings();
    const prev = shiftMonth(month, -1);
    const canCopy = admin() && list.some(tr => !groupOf(tr.id, month) && groupOf(tr.id, prev));
    return `
      <div class="page-head row"><h1><i class="ti ti-barbell" aria-hidden="true"></i> ${esc(t('navTrain'))}</h1>
        ${admin() ? `<span class="btn-row"><a class="btn small" href="#/report"><i class="ti ti-report-analytics" aria-hidden="true"></i> ${esc(t('rpTitle'))} →</a><a class="btn small" href="#/athletes"><i class="ti ti-id-badge-2" aria-hidden="true"></i> ${esc(t('athTitle'))} →</a></span>` : ''}</div>
      ${tabs}
      <div class="month-nav card">
        <button class="btn small" data-action="tr-month" data-m="${prev}" aria-label="${esc(t('prevMonth'))}"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
        <strong>${esc(monthLabel(month))}</strong>
        <button class="btn small" data-action="tr-month" data-m="${shiftMonth(month, 1)}" aria-label="${esc(t('nextMonth'))}"><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
        ${canCopy ? `<button class="btn small" data-action="tr-copy" data-m="${month}"><i class="ti ti-copy" aria-hidden="true"></i> ${esc(t('trCopyPrev', { m: monthLabel(prev) }))}</button>` : ''}
      </div>
      ${list.length ? `<div class="tr-grid">${list.map(tr => trainingCard(tr, month)).join('')}</div>` : `<div class="empty"><i class="ti ti-barbell" aria-hidden="true"></i> ${esc(t('trNone'))}</div>`}
      ${admin() ? trainingForm(null) : ''}
      ${admin() ? coachesCard() : ''}
      ${admin() ? selfProfileCard() : ''}`;
  }

  function trainingCard(tr, month) {
    if (admin() && ui.trEdit === tr.id) return `<div class="card tr-card" id="tr-${tr.id}">${trainingForm(tr)}</div>`;
    const g = groupOf(tr.id, month), uids = (g && g.uids) || [];
    const names = (g && g.names) || {};
    const full = uids.length >= (tr.max || 0);
    const od = nextOcc(tr, month), oc = od && occOf(tr.id, od);
    const rows = uids.map(uid => {
      const a = athleteOf(uid), at = od && attOf(tr.id, od, uid);
      return `<li><span class="reg-names"><strong>${esc(names[uid] || coachName(uid))}</strong>${od && !(oc && oc.cancelled) ? ` ${attChip(at && at.status, od)}` : ''}
        ${admin() ? `<br>${tessBadge(a)} ${certBadge(a)}` : ''}</span>
        ${admin() ? `<button class="btn small danger" data-action="grp-remove" data-tid="${tr.id}" data-m="${month}" data-uid="${uid}" aria-label="${esc(t('remove'))}"><i class="ti ti-user-minus" aria-hidden="true"></i></button>` : ''}</li>`;
    }).join('');
    let add = '';
    if (admin()) {
      const members = (S().members || []).filter(m => !uids.includes(m.uid)).sort((a, b) => personName(a).localeCompare(personName(b)));
      add = `<details class="sub-form" data-keep="grp-${tr.id}" ${keepOpen('grp-' + tr.id)}><summary><i class="ti ti-user-plus" aria-hidden="true"></i> ${esc(t('grpAdd'))}</summary>
        <form class="grid-form" data-form="grp-add" data-tid="${tr.id}" data-m="${month}">
          <label class="span-all">${esc(t('athPerson'))}<select name="uid" required data-change="grp-pick"><option value="">— ${esc(t('chooseUser'))} —</option>
            ${members.map(m => `<option value="${m.uid}">${esc(personName(m))}${athleteOf(m.uid) ? '' : ' ·  ' + esc(t('athNew'))}</option>`).join('')}</select></label>
          <label class="check"><input type="checkbox" name="tess"> ${esc(t('tessLabel', { s: seasonOf(todayStr()) }))}</label>
          <label>${esc(t('certExp'))}<input type="date" name="certExp"></label>
          <div class="form-actions span-all"><button class="btn primary">${esc(t('grpAddBtn'))}</button></div>
        </form></details>`;
    }
    return `<div class="card tr-card" id="tr-${tr.id}">
      <div class="ch-head"><span class="badge lvl-${tr.level}">${esc(t('fpLevel_' + tr.level))}</span> <span class="badge ${full ? 'st-full' : ''}">${uids.length}/${tr.max}</span></div>
      <h3>${esc(trTitle(tr))}</h3>
      <p class="muted cap"><i class="ti ti-calendar-repeat" aria-hidden="true"></i> ${esc(trLabel(tr))}</p>
      <p class="muted small">${tr.coachUid ? `<i class="ti ti-whistle" aria-hidden="true"></i> ${esc(t('trCoach'))}: ${esc(coachName(tr.coachUid))}` : ''}
        ${tr.coachUid && (tr.courts || []).length ? ' · ' : ''}${(tr.courts || []).length ? `<i class="ti ti-layout-grid" aria-hidden="true"></i> ${esc(tr.courts.map(courtName).join(', '))}` : ''}</p>
      <h4>${esc(t('grpTitle', { m: monthLabel(month) }))}</h4>
      ${od && uids.length ? `<p class="muted small"><i class="ti ti-calendar-check" aria-hidden="true"></i> ${esc(t(oc && oc.cancelled ? 'occCancelledOn' : 'attOfDay', { d: longDate(od) }))}</p>` : ''}
      ${uids.length ? `<ul class="reg-list">${rows}</ul>` : `<p class="muted small">${esc(t('grpEmpty'))}</p>`}
      ${add}
      ${admin() ? `<div class="btn-row"><button class="btn small" data-action="tr-edit" data-id="${tr.id}"><i class="ti ti-pencil" aria-hidden="true"></i> ${esc(t('edit'))}</button>
        <button class="btn small danger" data-action="tr-delete" data-id="${tr.id}"><i class="ti ti-trash" aria-hidden="true"></i> ${esc(t('trDelete'))}</button></div>` : ''}
    </div>`;
  }

  function trainingForm(tr) {
    const v = tr || { name: '', dow: 1, from: '19:00', to: '20:15', level: 'inter', max: 8, coachUid: '', courts: [] };
    const coaches = (S().coaches || []).slice().sort((a, b) => coachName(a.id).localeCompare(coachName(b.id)));
    const opt = (sel, list) => list.map(h => `<option ${h === sel ? 'selected' : ''}>${h}</option>`).join('');
    const form = `<form class="grid-form" data-form="tr-save" data-id="${tr ? tr.id : ''}">
        ${tr ? `<h3 class="span-all">${esc(t('trEditTitle'))}</h3>` : ''}
        <label class="span-all">${esc(t('trName'))}<input name="name" maxlength="60" value="${esc(v.name || '')}" placeholder="${esc(t('trNamePh'))}"></label>
        <label>${esc(t('bkDay'))}<select name="dow">${[1, 2, 3, 4, 5, 6, 7].map(n => `<option value="${n}" ${n === v.dow ? 'selected' : ''}>${esc(dayName(n))}</option>`).join('')}</select></label>
        <label>${esc(t('courtFrom'))}<select name="from">${opt(v.from, QUARTERS.slice(0, -1))}</select></label>
        <label>${esc(t('courtTo'))}<select name="to">${opt(v.to, QUARTERS.slice(1))}</select></label>
        <label>${esc(t('trLevel'))}<select name="level">${FP_LEVELS.map(l => `<option value="${l}" ${l === v.level ? 'selected' : ''}>${esc(t('fpLevel_' + l))}</option>`).join('')}</select></label>
        <label>${esc(t('trMax'))}<input type="number" name="max" min="1" max="60" required value="${v.max}" inputmode="numeric"></label>
        <label>${esc(t('trCoach'))}<select name="coachUid"><option value="">—</option>${coaches.map(c => `<option value="${c.id}" ${c.id === v.coachUid ? 'selected' : ''}>${esc(coachName(c.id))}</option>`).join('')}</select>
          ${coaches.length ? '' : `<small class="muted">${esc(t('trNoCoaches'))}</small>`}</label>
        <fieldset class="span-all fp-levels"><legend>${esc(t('trCourts'))}</legend>
          ${(S().courts || []).map(c => `<label class="check"><input type="checkbox" name="court" value="${c.id}" ${(v.courts || []).includes(c.id) ? 'checked' : ''}> ${esc(c.name)}</label>`).join('') || `<span class="muted small">${esc(t('trNoCourts'))}</span>`}
          <small class="muted span-all">${esc(t('trCourtsHelp'))}</small></fieldset>
        <div class="form-actions span-all">${tr ? `<button type="button" class="btn" data-action="tr-edit-cancel">${esc(t('cancel'))}</button>` : ''}
          <button class="btn primary">${esc(t(tr ? 'save' : 'trCreate'))}</button></div>
      </form>`;
    if (tr) return form;
    return `<details class="card sub-form" data-keep="tr-new" ${keepOpen('tr-new')}><summary><i class="ti ti-plus" aria-hidden="true"></i> ${esc(t('trNew'))}</summary>${form}</details>`;
  }

  // L'admin che vuole essere corsista o coach registra il proprio nome da giocatore (scheda utente members/{uid}).
  function selfProfileCard() {
    const me = window.Cloud.adminMember;
    if (me) return `<p class="muted small"><i class="ti ti-user-check" aria-hidden="true"></i> ${esc(t('selfProfileOk', { n: personName(me) }))}</p>`;
    return `<form class="card grid-form" data-form="self-profile" id="self-profile">
      <h2 class="span-all"><i class="ti ti-user-plus" aria-hidden="true"></i> ${esc(t('selfProfileTitle'))}</h2>
      <p class="muted small span-all">${esc(t('selfProfileHelp'))}</p>
      <label>${esc(t('firstName'))}<input name="first" required maxlength="60"></label>
      <label>${esc(t('lastName'))}<input name="last" required maxlength="60"></label>
      <label>${esc(t('gender'))}<select name="gender"><option value="M">${esc(t('male'))}</option><option value="F">${esc(t('female'))}</option></select></label>
      <div class="form-actions span-all"><button class="btn primary">${esc(t('save'))}</button></div>
    </form>`;
  }

  function coachesCard() {
    const list = (S().coaches || []).slice().sort((a, b) => coachName(a.id).localeCompare(coachName(b.id)));
    const others = (S().members || []).filter(m => !coachOf(m.uid)).sort((a, b) => personName(a).localeCompare(personName(b)));
    return `<div class="card" id="coaches">
      <h2><i class="ti ti-whistle" aria-hidden="true"></i> ${esc(t('coachTitle'))}</h2>
      <p class="muted small">${esc(t('coachHelp'))}</p>
      ${list.length ? `<ul class="reg-list coach-list">${list.map(c => `<li><span class="reg-names"><strong>${esc(coachName(c.id))}</strong></span>
        <select data-change="coach-all" data-uid="${c.id}" aria-label="${esc(t('coachSees'))}">
          <option value="0" ${c.all ? '' : 'selected'}>${esc(t('coachOwn'))}</option><option value="1" ${c.all ? 'selected' : ''}>${esc(t('coachAll'))}</option></select>
        <button class="btn small danger" data-action="coach-remove" data-uid="${c.id}"><i class="ti ti-trash" aria-hidden="true"></i></button></li>`).join('')}</ul>` : `<p class="muted">${esc(t('coachNone'))}</p>`}
      <form class="inline-form" data-form="coach-add">
        <select name="uid" required><option value="">— ${esc(t('chooseUser'))} —</option>${others.map(m => `<option value="${m.uid}">${esc(personName(m))}</option>`).join('')}</select>
        <select name="all"><option value="0">${esc(t('coachOwn'))}</option><option value="1">${esc(t('coachAll'))}</option></select>
        <button class="btn primary"><i class="ti ti-plus" aria-hidden="true"></i> ${esc(t('coachAdd'))}</button>
      </form>
    </div>`;
  }

  // ---------- console corsisti (admin) ----------
  function viewAthletes() {
    const month = ui.trMonth || curMonth();
    const q = (ui.athFilter || '').toLowerCase();
    const list = (S().athletes || []).map(a => ({ a, m: memberByUid(a.id) }))
      .filter(x => !q || personName(x.m || { first: x.a.first || '', last: x.a.last || '' }).toLowerCase().includes(q))
      .sort((x, y) => (x.m ? personName(x.m) : '').localeCompare(y.m ? personName(y.m) : ''));
    const noSheet = (S().members || []).filter(m => !athleteOf(m.uid)).sort((a, b) => personName(a).localeCompare(personName(b)));
    const warnN = (S().athletes || []).filter(a => ['expired', 'soon'].includes(certState(a))).length;
    return `
      <div class="page-head row"><h1><i class="ti ti-id-badge-2" aria-hidden="true"></i> ${esc(t('athTitle'))}</h1>
        <a class="btn small" href="#/train"><i class="ti ti-barbell" aria-hidden="true"></i> ${esc(t('navTrain'))} →</a></div>
      ${warnN ? `<p class="note warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> ${esc(t('certWarnCount', { n: warnN }))}</p>` : ''}
      <div class="month-nav card">
        <button class="btn small" data-action="tr-month" data-m="${shiftMonth(month, -1)}" aria-label="${esc(t('prevMonth'))}"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
        <strong>${esc(monthLabel(month))}</strong>
        <button class="btn small" data-action="tr-month" data-m="${shiftMonth(month, 1)}" aria-label="${esc(t('nextMonth'))}"><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
        <input type="search" data-change="ath-filter" placeholder="${esc(t('search'))}" value="${esc(ui.athFilter || '')}">
      </div>
      <details class="card sub-form" data-keep="ath-new" ${keepOpen('ath-new')}><summary><i class="ti ti-plus" aria-hidden="true"></i> ${esc(t('athNewTitle'))}</summary>
        <form class="grid-form" data-form="ath-new" data-m="${month}">
          <label class="span-all">${esc(t('athPerson'))}<select name="uid" required><option value="">— ${esc(t('chooseUser'))} —</option>${noSheet.map(m => `<option value="${m.uid}">${esc(personName(m))}</option>`).join('')}</select></label>
          <label class="check"><input type="checkbox" name="tess"> ${esc(t('tessLabel', { s: seasonOf(todayStr()) }))}</label>
          <label>${esc(t('certExp'))}<input type="date" name="certExp"></label>
          ${trChecks(null, month)}
          <div class="form-actions span-all"><button class="btn primary">${esc(t('athCreate'))}</button></div></form></details>
      ${list.length ? `<div class="ath-list">${list.map(x => athleteCard(x.a, x.m, month)).join('')}</div>` : `<div class="empty"><i class="ti ti-id-badge-2" aria-hidden="true"></i> ${esc(t('athNone'))}</div>`}
      ${pricesCard()}`;
  }

  function athleteCard(a, m, month) {
    const name = m ? personName(m) : `${a.last || ''} ${a.first || ''}`.trim() || '?';
    const p = planOf(a.id, month);
    const editing = ui.athEdit === a.id;
    const planLine = p ? `${esc(t('planN', { n: p.n }))} · ${esc(planDesc(p).join(' / '))}` : esc(t('planNone'));
    const head = `<div class="ath-head"><div><strong>${esc(name)}</strong> ${tessBadge(a)} ${certBadge(a)}
        <br><small class="muted">${planLine}${p ? ` · <b>${esc(euro(p.price))}</b>${p.manual ? ` <span class="badge">${esc(t('priceManual'))}</span>` : ''} ${payBadge(p)}` : ''}</small>
        ${packsOf(a.id).length ? `<br><small class="muted"><i class="ti ti-ticket" aria-hidden="true"></i> ${activePack(a.id) ? esc(t('packLeftShort', { l: packsOf(a.id).reduce((s, k) => s + packLeft(k), 0) })) : esc(t('packNoneLeft'))}</small>` : ''}</div>
        <button class="btn small" data-action="ath-edit" data-uid="${a.id}">${esc(t(editing ? 'close' : 'athOpen'))}</button></div>`;
    if (!editing) return `<div class="card ath-card" id="ath-${a.id}">${head}</div>`;
    const s = seasonOf(todayStr());
    return `<div class="card ath-card" id="ath-${a.id}">${head}
      <form class="grid-form" data-form="ath-save" data-uid="${a.id}">
        <h3 class="span-all">${esc(t('athData'))}</h3>
        <p class="muted small span-all"><i class="ti ti-shield-lock" aria-hidden="true"></i> ${t('athDataNote')}</p>
        <label>${esc(t('athBirthPlace'))}<input name="birthPlace" maxlength="60" value="${esc(a.birthPlace || '')}"></label>
        <label>${esc(t('athBirthDate'))}<input type="date" name="birthDate" value="${esc(a.birthDate || '')}"></label>
        <label>${esc(t('athCity'))}<input name="city" maxlength="60" value="${esc(a.city || '')}"></label>
        <label>${esc(t('athAddress'))}<input name="address" maxlength="100" value="${esc(a.address || '')}" placeholder="${esc(t('athAddressPh'))}"></label>
        <label>${esc(t('athCf'))}<input name="cf" maxlength="16" value="${esc(a.cf || '')}" autocapitalize="characters" pattern="[A-Za-z0-9]{16}"></label>
        <label>${esc(t('certExp'))}<input type="date" name="certExp" value="${esc(a.certExp || '')}"></label>
        <label class="check span-all"><input type="checkbox" name="tess" ${a.tess && a.tess[s] ? 'checked' : ''}> ${esc(t('tessLabel', { s }))}</label>
        <div class="form-actions span-all"><button class="btn primary">${esc(t('save'))}</button></div>
      </form>
      <form class="grid-form" data-form="ath-trs" data-uid="${a.id}" data-m="${month}">${trChecks(a.id, month)}
        <div class="form-actions span-all"><button class="btn primary">${esc(t('athTrainingsSave'))}</button></div></form>
      ${p ? `<form class="grid-form" data-form="plan-price" data-uid="${a.id}" data-m="${month}">
        <h3 class="span-all">${esc(t('planTitle', { m: monthLabel(month) }))}</h3>
        <p class="span-all">${planLine}</p>
        <label>${esc(t('planPrice'))}<input type="number" name="price" min="0" step="0.01" value="${p.price != null ? p.price : ''}" inputmode="decimal"></label>
        <div class="form-actions span-all">${p.manual ? `<button type="button" class="btn" data-action="plan-auto" data-uid="${a.id}" data-m="${month}">${esc(t('planUseList', { p: euro(priceFor(p.n)) }))}</button>` : ''}
          <button class="btn primary">${esc(t('save'))}</button></div>
      </form>${payBox('month', p, a.id, p.price)}` : `<p class="muted small">${esc(t('planHint'))}</p>`}
      ${packCard(a.id)}
    </div>`;
  }
  // Pacchetti del corsista (admin): elenco con allenamenti usati/rimasti e pagamento; nuovo pacchetto.
  function packCard(uid) {
    const ks = packsOf(uid).slice().reverse();
    return `<div class="pack-box"><h3><i class="ti ti-ticket" aria-hidden="true"></i> ${esc(t('packTitle'))}</h3>
      <p class="muted small">${esc(t('packHelp'))}</p>
      ${ks.length ? `<ul class="reg-list">${ks.map(k => `<li><span class="reg-names"><strong>${esc(t('packN', { n: k.n }))}</strong> · ${esc(euro(k.price))}
          <span class="badge ${packLeft(k) ? 'st-done' : 'st-full'}">${esc(t('packLeft', { l: packLeft(k), n: k.n }))}</span><br><small class="muted">${esc(t('packCreatedOn', { d: fmtDate(new Date(k.created || 0).toLocaleDateString('sv')) }))}</small></span>
          ${!(k.used || 0) && !k.paid ? `<button class="btn small danger" data-action="pack-del" data-id="${k.id}">${esc(t('packDel'))}</button>` : ''}
          <div class="pay-wrap">${payBox('pack', k, uid, k.price)}</div></li>`).join('')}</ul>` : ''}
      <form class="inline-form" data-form="pack-new" data-uid="${uid}">
        <label class="small">${esc(t('packNumber'))}<input type="number" name="n" min="1" max="100" step="1" required inputmode="numeric" style="width:5em"></label>
        <label class="small">${esc(t('packPrice'))}<input type="number" name="price" min="0" step="0.01" required inputmode="decimal" style="width:7em"></label>
        <button class="btn small primary"><i class="ti ti-plus" aria-hidden="true"></i> ${esc(t('packNew'))}</button></form></div>`;
  }

  function pricesCard() {
    const p = S().prices || {};
    return `<form class="card grid-form" data-form="prices-save" id="prices">
      <h2 class="span-all"><i class="ti ti-currency-euro" aria-hidden="true"></i> ${esc(t('pricesTitle'))}</h2>
      <p class="muted small span-all">${esc(t('pricesHelp'))}</p>
      ${[1, 2, 3, 4].map(n => `<label>${esc(t('planN', { n }))}<input type="number" name="w${n}" min="0" step="0.01" value="${p['w' + n] != null ? p['w' + n] : ''}" inputmode="decimal"></label>`).join('')}
      ${[1, 2].map(n => `<label>${esc(t('priceQuarter', { n }))}<input type="number" name="q${n}" min="0" step="0.01" value="${p['q' + n] != null ? p['q' + n] : ''}" inputmode="decimal"></label>`).join('')}
      <label>${esc(t('priceSpot'))}<input type="number" name="spot" min="0" step="0.01" value="${p.spot != null ? p.spot : ''}" inputmode="decimal"></label>
      <div class="form-actions span-all"><button class="btn primary">${esc(t('save'))}</button></div>
    </form>`;
  }

  // ---------- corsista: profilo e avvisi ----------
  function myTrainingCard() {
    const m = self();
    if (!m) return '';
    const a = athleteOf(m.uid), month = curMonth(), p = planOf(m.uid, month), pn = planOf(m.uid, shiftMonth(month, 1));
    const next = myNextTrainings();
    const ks = packsOf(m.uid), left = ks.reduce((s, k) => s + packLeft(k), 0);
    if (!a && !p && !pn && !next && !ks.length) return '';
    return `<div class="card" id="my-training">
      <h2><i class="ti ti-barbell" aria-hidden="true"></i> ${esc(t('myTraining'))}</h2>
      ${a ? `<p>${tessBadge(a)} ${certBadge(a)}</p>` : ''}
      ${[[month, p], [shiftMonth(month, 1), pn]].filter(x => x[1]).map(([mo, pl]) => `<h4>${esc(monthLabel(mo))} · ${esc(t('planN', { n: pl.n }))}${pl.price != null ? ` · ${esc(euro(pl.price))}` : ''}</h4>
        <ul class="plain-list">${planDesc(pl).map(d => `<li><i class="ti ti-calendar-repeat" aria-hidden="true"></i> ${esc(d)}</li>`).join('')}</ul>`).join('') || (ks.length ? '' : `<p class="muted small">${esc(t('planNoneMine'))}</p>`)}
      ${ks.length ? `<p class="note ${left ? 'ok' : 'warn'}"><i class="ti ti-ticket" aria-hidden="true"></i> ${esc(left ? t('packMine', { l: left }) : t('packMineEmpty'))}</p>` : ''}
      ${next}
    </div>`;
  }
  // Avviso sul certificato: al corsista (in scadenza entro un mese o scaduto) e all'admin (quanti).
  // admin: a ogni accesso, avviso delle ricevute intestate a non tesserati
  function notTessAlert() {
    const n = notTessReceipts().length;
    return n ? `<div class="msg-alert" role="alert"><div class="msg-head"><strong><span class="tess-star" aria-hidden="true">★</span> ${esc(t('rcNotTessTitle', { n }))}</strong></div>
      <div class="msg-text">${esc(t('rcNotTessHelp'))}</div><a class="btn small" href="#/payments">${esc(t('payAdminTitle'))} →</a></div>` : '';
  }
  function certAlerts() {
    if (admin()) {
      const n = (S().athletes || []).filter(a => ['expired', 'soon'].includes(certState(a))).length;
      return (n ? `<div class="msg-alert" role="alert"><div class="msg-head"><strong><i class="ti ti-heart-exclamation" aria-hidden="true"></i> ${esc(t('certTitle'))}</strong></div>
        <div class="msg-text">${esc(t('certWarnCount', { n }))}</div><a class="btn small" href="#/athletes">${esc(t('athTitle'))} →</a></div>` : '') + notTessAlert();
    }
    const m = member(), a = m && athleteOf(m.uid), st = certState(a);
    if (st !== 'expired' && st !== 'soon') return '';
    return `<div class="msg-alert ${st === 'expired' ? 'danger' : ''}" role="alert"><div class="msg-head"><strong><i class="ti ti-heart-exclamation" aria-hidden="true"></i> ${esc(t('certTitle'))}</strong></div>
      <div class="msg-text">${esc(t(st === 'expired' ? 'certExpiredMsg' : 'certSoonMsg', { d: fmtDate(a.certExp) }))}</div></div>`;
  }

  // ---------- salvataggi ----------
  function trSave(f) {
    const old = f.dataset.id ? trainingById(f.dataset.id) : null;
    const d = { name: f.name.value.trim(), dow: +f.dow.value, from: f.from.value, to: f.to.value, level: f.level.value,
      max: Math.max(1, parseInt(f.max.value, 10) || 1), coachUid: f.coachUid.value, courts: [...f.querySelectorAll('[name=court]:checked')].map(x => x.value) };
    if (d.to <= d.from) return warn('fpTimeErr');
    d.reason = `${t('navTrain')} · ${d.name || t('fpLevel_' + d.level)}${d.coachUid ? ' · ' + coachName(d.coachUid) : ''}`;
    // campi: niente sovrapposizioni con altri blocchi ricorrenti; avviso se ci sono prenotazioni future
    const mineR = new Set((old ? old.courts || [] : []).map(c => `t_${old.id}_${c}`));
    const clash = d.courts.filter(c => (S().recurring || []).some(r => !mineR.has(r.id) && r.courtId === c && r.dow === d.dow && r.from < d.to && d.from < r.to));
    if (clash.length) return warn('trCourtBusy', { c: clash.map(courtName).join(', ') });
    const today = todayStr();
    const busy = (S().bookings || []).filter(b => !b.recurring && d.courts.includes(b.courtId) && b.date >= today && dow(b.date) === d.dow && b.from < d.to && d.from < b.to);
    if (busy.length && !confirmed('trBookingsClash', { n: busy.length })) return;
    const groups = old ? (S().groups || []).filter(g => g.tid === old.id) : [];
    window.Cloud.saveTraining(old, d, groups).then(() => {
      if (old) ui.trEdit = null; else (ui.keep || {})['tr-new'] = false;
      ui.flash = { text: t(old ? 'trSaved' : 'trCreated') };
      render();
    }).catch(e => warn('regError', { code: e.code || e.message }));
  }

  // Aggiunge o toglie un corsista dal gruppo del mese, aggiornando il suo piano (e la scheda).
  function grpChange(tid, month, uid, add, athleteData) {
    const tr = trainingById(tid);
    if (!tr) return;
    const cur = groupOf(tid, month) || { id: `${tid}_${month}`, tid, month, uids: [], names: {} };
    const g = Object.assign({}, cur, { uids: (cur.uids || []).slice(), names: Object.assign({}, cur.names || {}), coachUid: tr.coachUid || '' });
    if (add) { if (!g.uids.includes(uid)) g.uids.push(uid); const m = memberByUid(uid); if (m) g.names[uid] = personName(m); }
    else { g.uids = g.uids.filter(x => x !== uid); delete g.names[uid]; }
    g.updated = Date.now();
    const all = (S().groups || []).filter(x => x.id !== g.id).concat([g]);
    const plan = planFrom(uid, month, all);
    return window.Cloud.saveGroups([g], plan ? [plan] : [], athleteData ? [athleteData] : []);
  }

  // Spunte degli allenamenti del corsista per un mese (scheda corsista: creazione e modifica).
  function trChecks(uid, month) {
    const list = trainings();
    if (!list.length) return `<p class="muted small span-all">${esc(t('trNone'))}</p>`;
    return `<fieldset class="span-all fp-levels tr-checks"><legend>${esc(t('athTrainings', { m: monthLabel(month) }))}</legend>
      ${list.map(tr => { const g = groupOf(tr.id, month), n = g ? (g.uids || []).length : 0, on = !!(uid && g && (g.uids || []).includes(uid));
        return `<label class="check"><input type="checkbox" name="tid" value="${tr.id}" ${on ? 'checked' : ''}> ${esc(trTitle(tr))} · ${esc(trLabel(tr))} <small class="muted">(${n}/${tr.max})</small></label>`; }).join('')}
      <small class="muted span-all">${esc(t('athTrainingsHelp'))}</small></fieldset>`;
  }
  // Mette il corsista esattamente negli allenamenti scelti per il mese (aggiunge e toglie dai gruppi), con il piano.
  function setAthleteTrainings(uid, month, tids, athleteData) {
    const m = memberByUid(uid), changed = [], full = [];
    trainings().forEach(tr => {
      const cur = groupOf(tr.id, month), has = !!(cur && (cur.uids || []).includes(uid)), want = tids.includes(tr.id);
      if (has === want) return;
      const g = Object.assign({ id: `${tr.id}_${month}`, tid: tr.id, month }, cur || {}, { uids: ((cur && cur.uids) || []).slice(), names: Object.assign({}, (cur && cur.names) || {}), coachUid: tr.coachUid || '', updated: Date.now() });
      if (want) { if (g.uids.length >= tr.max) full.push(trTitle(tr)); g.uids.push(uid); if (m) g.names[uid] = personName(m); }
      else { g.uids = g.uids.filter(x => x !== uid); delete g.names[uid]; }
      changed.push(g);
    });
    if (full.length && !confirmed('grpFullConfirmList', { l: full.join(', ') })) return Promise.resolve(false);
    if (!changed.length && !athleteData) return Promise.resolve(true);
    const all = (S().groups || []).filter(x => !changed.some(g => g.id === x.id)).concat(changed);
    const plan = changed.length ? planFrom(uid, month, all) : null;
    return window.Cloud.saveGroups(changed, plan ? [plan] : [], athleteData ? [athleteData] : []).then(() => true);
  }

  // ---------- presenze, spot e recuperi ----------
  // Ogni giorno il corsista del gruppo risponde presente/assente (entro le 12). Posti spot liberi:
  // massimo − presenti − spot confermati − (prima delle 12) chi non ha ancora risposto.
  const occOf = (tid, date) => (S().occ || []).find(o => o.tid === tid && o.date === date);
  const groupSize = (tr, month, date) => { if (date && extraDay(date)) return 0; const n = (tr.sizes || {})[month]; if (n != null) return n; const g = groupOf(tr.id, month); return g ? (g.uids || []).length : 0; };
  const afterNoon = date => date < todayStr() || (date === todayStr() && nowHM() >= '12:00');
  const trStartMs = (tr, date) => new Date(`${date}T${tr.from}`).getTime();
  const spotOpen = (tr, date) => Date.now() < trStartMs(tr, date) - 3600000;   // candidature fino a un'ora prima
  // Posti spot: li decide l'admin giorno per giorno (occ.free); restano quelli non ancora assegnati a spot confermati.
  function spotsFree(tr, date) {
    const o = occOf(tr.id, date) || {};
    if (o.cancelled) return 0;
    // admin: il numero esatto; gli altri sanno solo se ci sono posti (occ.open)
    if (admin()) return Math.max(0, (Number((S().occfree || {})[`${tr.id}_${date}`]) || 0) - (o.s || 0));
    return o.open ? 1 : 0;
  }
  // suggerimento per l'admin (vecchio calcolo): massimo − presenti − spot − chi non ha ancora risposto (prima delle 12)
  function spotsSuggested(tr, date) {
    const o = occOf(tr.id, date) || {};
    const n = groupSize(tr, date.slice(0, 7), date), p = o.p || 0, a = o.a || 0, s = o.s || 0;
    return Math.max(0, (tr.max || 0) - p - s - (afterNoon(date) ? 0 : Math.max(0, n - p - a)));
  }
  // numero dei posti liberi: solo l'admin; gli altri vedono "posti spot disponibili"
  const freeBadge = (tr, date) => `<span class="badge st-done">${esc(admin() ? t('spotFree', { n: spotsFree(tr, date) }) : t('spotAvail'))}</span>`;
  // allenamenti nei giorni [from, from + days)
  const occurrences = (from, days, list) => { const out = []; for (let i = 0; i < days; i++) { const d = addDays(from, i), w = dow(d); (list || trainings()).filter(tr => tr.dow === w).forEach(tr => out.push({ tr, date: d })); } return out; };
  const attOf = (tid, date, uid) => (S().att || []).find(x => x.tid === tid && x.date === date && x.uid === uid);
  const spotOf = (tid, date, uid) => (S().spots || []).find(x => x.tid === tid && x.date === date && x.uid === uid);
  // 5° lunedì/martedì/… del mese (giorno 29, 30 o 31): fuori abbonamento, niente gruppo, tutti i posti sono spot
  const extraDay = date => +date.slice(8, 10) > 28;
  const inMyGroup = (tr, date) => { const m = self(), p = m && planOf(m.uid, date.slice(0, 7)); return !extraDay(date) && !!(p && (p.tids || []).includes(tr.id)); };
  const occLabel = (tr, date) => `${trTitle(tr)} · ${longDate(date)} ${tr.from}–${tr.to}`;
  // stato della presenza: verde confermata, rosso assente, grigio in attesa, arancione no reply (scaduto il termine)
  const attChip = (st, date) => { const k = st === 'in' ? 'in' : st === 'out' ? 'out' : afterNoon(date) ? 'late' : 'wait';
    return `<span class="badge att-chip att-${k}">${esc(t({ in: 'attIn', out: 'attOut', wait: 'attNone', late: 'attNoneAbsent' }[k]))}</span>`; };
  // prossimo allenamento del mese mostrato (da oggi in poi; il 5° giorno del mese è solo spot)
  const nextOcc = (tr, month) => { let d = month === curMonth() ? todayStr() : month > curMonth() ? month + '-01' : null; if (!d) return null;
    for (; d.slice(0, 7) === month; d = addDays(d, 1)) if (dow(d) === tr.dow && !extraDay(d)) return d; return null; };
  const attButtons = (tr, date, cur) => `<div class="btn-row att-btns">
      <button class="btn ${cur === 'in' ? 'primary' : ''}" data-action="att-set" data-tid="${tr.id}" data-date="${date}" data-st="in"><i class="ti ti-check" aria-hidden="true"></i> ${esc(t('attPresent'))}</button>
      <button class="btn ${cur === 'out' ? 'danger' : ''}" data-action="att-set" data-tid="${tr.id}" data-date="${date}" data-st="out"><i class="ti ti-x" aria-hidden="true"></i> ${esc(t('attAbsent'))}</button></div>`;

  // Avvisi in prima pagina per il corsista: conferma di oggi, allenamenti annullati, esito di spot e recuperi.
  function trainingAlerts() {
    const m = self();
    if (!m) return '';
    const today = todayStr(), out = [];
    occurrences(today, 1).filter(o => inMyGroup(o.tr, o.date) && !(occOf(o.tr.id, o.date) || {}).cancelled && !attOf(o.tr.id, o.date, m.uid)).forEach(({ tr, date }) => {
      out.push(`<div class="msg-alert att-alert" role="alert"><div class="msg-head"><strong><i class="ti ti-hand-finger" aria-hidden="true"></i> ${esc(t('attTodayTitle'))}</strong></div>
        <div class="msg-text">${esc(occLabel(tr, date))}${afterNoon(date) ? `<br><small>${esc(t('attLate'))}</small>` : `<br><small>${esc(t('attBy12'))}</small>`}</div>${attButtons(tr, date, '')}</div>`);
    });
    occurrences(today, 2).filter(o => (occOf(o.tr.id, o.date) || {}).cancelled && (inMyGroup(o.tr, o.date) || (spotOf(o.tr.id, o.date, m.uid) || {}).status === 'ok')).forEach(({ tr, date }) => {
      const o = occOf(tr.id, date);
      out.push(`<div class="msg-alert danger" role="alert"><div class="msg-head"><strong><i class="ti ti-calendar-off" aria-hidden="true"></i> ${esc(t('occCancelledTitle'))}</strong></div>
        <div class="msg-text">${esc(occLabel(tr, date))}${o.note ? `<br>${esc(o.note)}` : ''}</div></div>`);
    });
    (S().spots || []).filter(sp => sp.uid === m.uid && sp.status !== 'pending' && !sp.seen).forEach(sp => {
      const tr = trainingById(sp.tid), ok = sp.status === 'ok';
      out.push(`<div class="msg-alert ${ok ? 'ok' : 'danger'}" role="alert"><div class="msg-head"><strong><i class="ti ti-${ok ? 'circle-check' : 'circle-x'}" aria-hidden="true"></i> ${esc(t(ok ? (sp.recovery ? 'recoveryOk' : 'spotOk') : 'spotNo'))}</strong></div>
        <div class="msg-text">${esc(tr ? occLabel(tr, sp.date) : sp.date)}${ok ? `<br>${esc(sp.pack ? t('packUsedMine', { l: (S().packs || []).filter(k => k.uid === m.uid).reduce((s, k) => s + packLeft(k), 0) }) : t('spotPrice', { p: euro(sp.price || 0) }))}` : ''}</div>
        <button class="btn small" data-action="spot-seen" data-id="${sp.id}">${esc(t('chAckRevoke'))}</button></div>`);
    });
    return out.join('');
  }

  // Posti spot disponibili nei prossimi 7 giorni (tutti li vedono; si candidano gli utenti registrati).
  function spotSection(home) {
    const m = self();
    const list = occurrences(todayStr(), 7).filter(({ tr, date }) => spotOpen(tr, date) && !(m && inMyGroup(tr, date))
      && (spotsFree(tr, date) > 0 || (m && spotOf(tr.id, date, m.uid))));
    if (home && !list.length) return '';
    const card = ({ tr, date }) => {
      const free = spotsFree(tr, date), mine = m && spotOf(tr.id, date, m.uid);
      let act = '';
      if (mine) act = mine.status === 'pending' ? `<p class="note">${esc(t('spotPending'))}</p><button class="btn small" data-action="spot-withdraw" data-id="${mine.id}">${esc(t('spotWithdraw'))}</button>`
        : `<p class="note ${mine.status === 'ok' ? 'ok' : 'warn'}">${esc(t(mine.status === 'ok' ? 'spotOk' : 'spotNo'))}</p>`;
      else if (!m) act = admin() ? '' : `<a class="btn small" href="#/settings">${esc(t('loginOrRegister'))}</a>`;
      else if (needsVerify()) act = `<p class="note warn">${esc(t('verifyFirst'))}</p>`;
      else act = `<button class="btn primary" data-action="spot-apply" data-tid="${tr.id}" data-date="${date}"><i class="ti ti-hand-finger" aria-hidden="true"></i> ${esc(t('spotApply'))}</button>`;
      return `<div class="card tr-card spot-card" id="spot-${tr.id}-${date}">
        <div class="ch-head"><span class="badge lvl-${tr.level}">${esc(t('fpLevel_' + tr.level))}</span> ${free > 0 ? freeBadge(tr, date) : ''}</div>
        <h3>${esc(trTitle(tr))}</h3>
        <p class="muted cap"><i class="ti ti-calendar" aria-hidden="true"></i> ${esc(longDate(date))} · ${tr.from}–${tr.to}</p>
        ${tr.coachUid ? `<p class="muted small"><i class="ti ti-whistle" aria-hidden="true"></i> ${esc(coachName(tr.coachUid))}</p>` : ''}
        <p class="muted small">${esc(m && activePack(m.uid) ? t('spotPackInfo') : t('spotPriceInfo', { p: euro((S().prices || {}).spot) }))}</p>
        ${act}</div>`;
    };
    return `<section class="feat-block" id="spots">
      <div class="page-head row"><h2><i class="ti ti-ticket" aria-hidden="true"></i> ${esc(t('spotTitle'))}</h2></div>
      ${list.length ? `<div class="tr-grid">${list.map(card).join('')}</div>` : `<p class="muted">${esc(t('spotNone'))}</p>`}</section>`;
  }

  // I prossimi allenamenti del corsista (7 giorni): stato e risposta.
  function myNextTrainings() {
    const m = self();
    if (!m) return '';
    const list = occurrences(todayStr(), 7).filter(o => inMyGroup(o.tr, o.date) && Date.now() < trStartMs(o.tr, o.date) + 3600000);
    const spots = (S().spots || []).filter(sp => sp.uid === m.uid && sp.date >= todayStr()).sort((a, b) => a.date.localeCompare(b.date));
    if (!list.length && !spots.length) return '';
    return `<h4>${esc(t('myNext7'))}</h4>
      <ul class="reg-list">${list.map(({ tr, date }) => {
        const o = occOf(tr.id, date) || {}, a = attOf(tr.id, date, m.uid);
        return `<li><span class="reg-names"><strong>${esc(occLabel(tr, date))}</strong><br>${o.cancelled ? `<span class="badge st-full">${esc(t('occCancelled'))}</span>` : attChip(a && a.status, date)}</span>
          ${o.cancelled ? '' : attButtons(tr, date, a && a.status)}</li>`;
      }).join('')}
      ${spots.map(sp => { const tr = trainingById(sp.tid); return tr ? `<li><span class="reg-names"><strong>${esc(occLabel(tr, sp.date))}</strong><br>
        <span class="badge ${sp.status === 'ok' ? 'st-done' : sp.status === 'no' ? 'st-full' : ''}">${esc(t(sp.recovery ? 'recoveryBadge' : 'spotBadge'))} · ${esc(t('spotSt_' + sp.status))}</span></span></li>` : ''; }).join('')}</ul>`;
  }

  // ---------- giornata (admin e coach): presenze, spot, recuperi, annullamento ----------
  function trainingDay() {
    const day = ui.trDay || todayStr();
    const list = visibleTrainings().filter(tr => tr.dow === dow(day));
    return `<div class="month-nav card">
        <button class="btn small" data-action="tr-day" data-d="${addDays(day, -1)}" aria-label="${esc(t('prevDay'))}"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
        <strong class="cap">${esc(longDate(day))}</strong>
        <button class="btn small" data-action="tr-day" data-d="${addDays(day, 1)}" aria-label="${esc(t('nextDay'))}"><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
        ${day !== todayStr() ? `<button class="btn small" data-action="tr-day" data-d="${todayStr()}">${esc(t('trToday'))}</button>` : ''}
      </div>
      ${list.length ? `<div class="tr-grid">${list.map(tr => occCard(tr, day)).join('')}</div>` : `<div class="empty"><i class="ti ti-barbell" aria-hidden="true"></i> ${esc(t('trNoneDay'))}</div>`}`;
  }

  function occCard(tr, date) {
    const o = occOf(tr.id, date) || {}, g = groupOf(tr.id, date.slice(0, 7)), uids = (g && g.uids) || [], names = (g && g.names) || {};
    const late = afterNoon(date);
    const rows = uids.map(uid => {
      const a = attOf(tr.id, date, uid), st = a && a.status, key = `${tr.id}_${date}_${uid}`;
      const absent = st === 'out' || (!st && late);
      const rec = (S().spots || []).find(sp => sp.uid === uid && sp.recovery && sp.recovery.tid === tr.id && sp.recovery.date === date);
      return `<li><span class="reg-names"><strong>${esc(names[uid] || coachName(uid))}</strong><br>${attChip(st, date)}${a && a.forced ? ` <small class="muted">${esc(t('attForced'))}</small>` : ''}
          ${rec ? ` <span class="badge">${esc(t('recoveryGiven', { d: fmtDate(rec.date) }))}</span>` : ''}</span>
        ${admin() && !o.cancelled ? `<span class="btn-row">
          ${st !== 'in' ? `<button class="btn small" data-action="att-force" data-tid="${tr.id}" data-date="${date}" data-uid="${uid}" data-st="in">${esc(t('attPresent'))}</button>` : ''}
          ${st !== 'out' ? `<button class="btn small" data-action="att-force" data-tid="${tr.id}" data-date="${date}" data-uid="${uid}" data-st="out">${esc(t('attAbsent'))}</button>` : ''}
          ${absent && !rec ? `<button class="btn small" data-action="rec-open" data-key="${key}"><i class="ti ti-arrow-back-up" aria-hidden="true"></i> ${esc(t('recovery'))}</button>` : ''}</span>` : ''}
        ${admin() && ui.recFor === key ? recoveryForm(tr, date, uid, names[uid] || coachName(uid)) : ''}</li>`;
    }).join('');
    const sps = (S().spots || []).filter(sp => sp.tid === tr.id && sp.date === date);
    const pend = sps.filter(sp => sp.status === 'pending'), oks = sps.filter(sp => sp.status === 'ok');
    const spotPrice = (S().prices || {}).spot;
    const n = groupSize(tr, date.slice(0, 7), date);
    return `<div class="card tr-card occ-card ${o.cancelled ? 'is-cancelled' : ''}" id="occ-${tr.id}-${date}">
      <div class="ch-head"><span class="badge lvl-${tr.level}">${esc(t('fpLevel_' + tr.level))}</span>
        ${o.cancelled ? `<span class="badge st-full">${esc(t('occCancelled'))}</span>` : admin() ? freeBadge(tr, date) : ''}</div>
      <h3>${esc(trTitle(tr))}</h3>
      <p class="muted"><i class="ti ti-clock" aria-hidden="true"></i> ${tr.from}–${tr.to}${tr.coachUid ? ` · ${esc(coachName(tr.coachUid))}` : ''}</p>
      ${o.cancelled && o.note ? `<p class="note warn">${esc(o.note)}</p>` : ''}
      <p class="occ-sum">${esc(t('occSummary', { p: o.p || 0, a: o.a || 0, u: Math.max(0, n - (o.p || 0) - (o.a || 0)), s: o.s || 0, m: tr.max }))}</p>
      ${admin() && !o.cancelled ? `<form class="inline-form occ-free" data-form="occ-free" data-tid="${tr.id}" data-date="${date}">
        <label class="small">${esc(t('occFreeLabel'))}<input type="number" name="free" min="0" max="99" step="1" inputmode="numeric" value="${(S().occfree || {})[`${tr.id}_${date}`] != null ? S().occfree[`${tr.id}_${date}`] : ''}" style="width:5em"></label>
        <button class="btn small primary">${esc(t('save'))}</button>
        <small class="muted">${esc(t('occFreeHint', { v: spotsSuggested(tr, date), s: o.s || 0 }))}</small></form>` : ''}
      ${extraDay(date) ? `<p class="note"><i class="ti ti-ticket" aria-hidden="true"></i> ${esc(t('extraDayNote'))}</p>` : `<h4>${esc(t('grpTitle', { m: monthLabel(date.slice(0, 7)) }))}</h4>
      ${uids.length ? `<ul class="reg-list">${rows}</ul>` : `<p class="muted small">${esc(t('grpEmpty'))}</p>`}`}
      ${oks.length ? `<h4>${esc(t('spotConfirmed'))}</h4><ul class="reg-list">${oks.map(sp => `<li><span class="reg-names"><strong>${esc(sp.name)}</strong>
        ${sp.recovery ? ` <span class="badge">${esc(t('recoveryOf', { d: fmtDate(sp.recovery.date) }))}</span>` : ''}${admin() ? `<br><small class="muted">${esc(euro(sp.price || 0))}</small>` : ''}</span>
        ${admin() && !sp.paid ? `<button class="btn small" data-action="spot-undo" data-id="${sp.id}">${esc(t('spotUndo'))}</button>` : ''}
        ${admin() ? `<div class="pay-wrap">${payBox('spot', sp, sp.uid, sp.price || 0)}</div>` : ''}</li>`).join('')}</ul>` : ''}
      ${pend.length ? `<h4>${esc(t('spotRequests'))} (${pend.length})</h4><ul class="reg-list">${pend.map(sp => `<li><span class="reg-names"><strong>${esc(sp.name)}</strong><br><small class="muted">${esc(fpWhen(sp.at))}</small></span>
        ${admin() ? `<form class="inline-form" data-form="spot-decide" data-id="${sp.id}">${activePack(sp.uid) ? `<label class="check small"><input type="checkbox" name="pack" value="${activePack(sp.uid).id}" checked> ${esc(t('packUseLabel', { l: packsOf(sp.uid).reduce((s, k) => s + packLeft(k), 0) }))}</label>` : ''}<label class="small">${esc(t('spotPriceLabel'))}<input type="number" name="price" min="0" step="0.01" value="${spotPrice != null ? spotPrice : ''}" inputmode="decimal" style="width:6em"></label>
          <button class="btn small primary" data-submit="ok">${esc(t('spotConfirm'))}</button><button class="btn small danger" data-submit="no">${esc(t('spotReject'))}</button></form>` : ''}</li>`).join('')}</ul>` : ''}
      ${admin() ? `<div class="btn-row">${o.cancelled ? `<button class="btn small" data-action="occ-restore" data-tid="${tr.id}" data-date="${date}">${esc(t('occRestore'))}</button>`
        : `<button class="btn small danger" data-action="occ-cancel" data-tid="${tr.id}" data-date="${date}"><i class="ti ti-calendar-off" aria-hidden="true"></i> ${esc(t('occCancel'))}</button>`}</div>` : ''}
    </div>`;
  }

  // Recupero: l'admin sceglie un altro allenamento (prossimi 30 giorni) e il prezzo (anche 0).
  function recoveryForm(tr, date, uid, name) {
    const opts = occurrences(todayStr(), 30).filter(o => !(o.tr.id === tr.id && o.date === date) && !(occOf(o.tr.id, o.date) || {}).cancelled && Date.now() < trStartMs(o.tr, o.date));
    return `<form class="grid-form rec-form" data-form="rec-save" data-tid="${tr.id}" data-date="${date}" data-uid="${uid}" data-name="${esc(name)}">
      <label class="span-all">${esc(t('recWhen'))}<select name="occ" required>${opts.map(o => `<option value="${o.tr.id}|${o.date}">${esc(occLabel(o.tr, o.date))} · ${esc(t('spotFree', { n: spotsFree(o.tr, o.date) }))}</option>`).join('')}</select></label>
      <label>${esc(t('spotPriceLabel'))}<input type="number" name="price" min="0" step="0.01" value="0" inputmode="decimal"></label>
      <div class="form-actions span-all"><button type="button" class="btn" data-action="rec-close">${esc(t('cancel'))}</button><button class="btn primary">${esc(t('recGive'))}</button></div>
    </form>`;
  }

  const trErr = e => warn('regError', { code: e.code || e.message });
  const occActions = {
    'tr-day': el => { ui.trDay = el.dataset.d; render(); },
    'tr-tab': el => { ui.trTab = el.dataset.tab; render(); },
    'att-set': el => {
      const tr = trainingById(el.dataset.tid), date = el.dataset.date, m = self();
      if (!tr || !m) return;
      if (needsVerify()) return warn('verifyFirst');
      if ((occOf(tr.id, date) || {}).cancelled) return warn('occCancelled');
      if (Date.now() > trStartMs(tr, date)) return warn('attStarted');
      const cur = attOf(tr.id, date, m.uid), st = el.dataset.st;
      // dopo le 12 si può tornare presenti solo se c'è ancora posto (altrimenti è andato agli spot)
      // dopo le 12 si torna presenti solo se i posti non sono già andati agli spot
      if (st === 'in' && afterNoon(date) && !(cur && cur.status === 'in') && ((occOf(tr.id, date) || {}).s || 0) > 0 && spotsFree(tr, date) <= 0) return warn('attFullContact');
      window.Cloud.setAttendance(tr.id, date, m.uid, st, { coachUid: tr.coachUid || '' }).then(() => { ui.flash = { text: t(st === 'in' ? 'attSavedIn' : 'attSavedOut') }; render(); })
        .catch(e => (e && e.code === 'permission-denied' ? warn('attDenied') : trErr(e)));
    },
    'att-force': el => {
      const tr = trainingById(el.dataset.tid);
      if (!tr) return;
      window.Cloud.setAttendance(tr.id, el.dataset.date, el.dataset.uid, el.dataset.st, { coachUid: tr.coachUid || '', forced: true }).then(() => render()).catch(trErr);
    },
    'spot-apply': el => {
      const tr = trainingById(el.dataset.tid), date = el.dataset.date, m = self();
      if (!tr || !m) return;
      if (needsVerify()) return warn('verifyFirst');
      if (!spotOpen(tr, date)) return warn('spotClosed');
      const pk = activePack(m.uid);
      if (!confirmed(pk ? 'spotApplyConfirmPack' : 'spotApplyConfirm', { o: occLabel(tr, date), p: euro((S().prices || {}).spot), l: packsOf(m.uid).reduce((s, k) => s + packLeft(k), 0) })) return;
      window.Cloud.applySpot({ tid: tr.id, date, name: personLabel(m), coachUid: tr.coachUid || '', from: tr.from }).then(() => { ui.flash = { text: t('spotApplied') }; render(); }).catch(trErr);
    },
    'spot-withdraw': el => { if (confirmed('spotWithdrawConfirm')) window.Cloud.withdrawSpot(el.dataset.id).then(() => render()).catch(trErr); },
    'spot-seen': el => { window.Cloud.seeSpot(el.dataset.id).then(() => render()).catch(trErr); },
    'spot-undo': el => {
      const sp = (S().spots || []).find(x => x.id === el.dataset.id);
      if (sp && confirmed('spotUndoConfirm', { n: sp.name })) window.Cloud.decideSpot(sp, false).then(() => render()).catch(trErr);
    },
    'occ-cancel': el => {
      const tr = trainingById(el.dataset.tid);
      if (!tr) return;
      const note = prompt(t('occCancelPrompt', { o: occLabel(tr, el.dataset.date) }), '');
      if (note === null) return;
      window.Cloud.setOccCancelled(tr.id, el.dataset.date, true, note.slice(0, 200), occPackSpots(tr.id, el.dataset.date)).then(() => { ui.flash = { text: t('occCancelledDone') }; render(); }).catch(trErr);
    },
    'occ-restore': el => { window.Cloud.setOccCancelled(el.dataset.tid, el.dataset.date, false, '', occPackSpots(el.dataset.tid, el.dataset.date)).then(() => render()).catch(trErr); },
    'rec-open': el => { ui.recFor = el.dataset.key; render(); },
    'rec-close': () => { ui.recFor = null; render(); }
  };
  // spot confermati di un allenamento del giorno scalati da un pacchetto (tornano nel pacchetto se si annulla)
  const occPackSpots = (tid, date) => (S().spots || []).filter(sp => sp.tid === tid && sp.date === date && sp.status === 'ok' && sp.pack);
  const occForms = {
    // posti spot liberi del giorno (admin); vuoto = nessun posto spot
    'occ-free': f => {
      const v = f.free.value === '' ? null : Math.max(0, parseInt(f.free.value, 10) || 0);
      window.Cloud.setOccFree(f.dataset.tid, f.dataset.date, v).then(() => { ui.flash = { text: t('occFreeSaved', { n: v || 0 }) }; render(); }).catch(trErr);
    },
    'spot-decide': f => {
      const sp = (S().spots || []).find(x => x.id === f.dataset.id);
      if (!sp) return;
      const ok = submitMode !== 'no';
      const price = f.price.value === '' ? 0 : Math.round(Number(f.price.value) * 100) / 100;
      const packId = ok && f.pack && f.pack.checked ? f.pack.value : null;
      window.Cloud.decideSpot(sp, ok, price, packId).then(() => { ui.flash = { text: t(!ok ? 'spotRejectedDone' : packId ? 'spotConfirmedPack' : 'spotConfirmedDone', { n: sp.name }) }; render(); })
        .catch(e => (e && e.code === 'pack-empty' ? warn('packEmptyErr') : trErr(e)));
    },
    'rec-save': f => {
      const [tid, date] = f.occ.value.split('|'), tr = trainingById(tid);
      if (!tr) return;
      const price = f.price.value === '' ? 0 : Math.round(Number(f.price.value) * 100) / 100;
      const uid = f.dataset.uid;
      const sp = { id: `${tid}_${date}_${uid}`, tid, date, uid, name: f.dataset.name, coachUid: tr.coachUid || '', from: tr.from, at: Date.now(), recovery: { tid: f.dataset.tid, date: f.dataset.date } };
      window.Cloud.decideSpot(sp, true, price).then(() => { ui.recFor = null; ui.flash = { text: t('recGiven', { n: sp.name, o: occLabel(tr, date) }) }; render(); }).catch(trErr);
    }
  };

  // ---------- pagamenti e ricevute ----------
  // Intestazione delle ricevute (stessi dati di js/legal.js).
  const ASSOC = ['ASD Manofuori Volley Project', 'via Mandrolisai 68A', "Quartu Sant'Elena (CA)", 'CF 92212890922', 'PI 03512620927'];
  const PAY_METHODS = ['cash', 'card', 'transfer'];
  const PAY_IT = { cash: 'contanti', card: 'bancomat', transfer: 'bonifico' };
  const MONTHS_IT = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const itDate = d => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');
  const itMonth = m => { const x = MONTHS_IT[+m.slice(5, 7) - 1]; return `${x.charAt(0).toUpperCase() + x.slice(1)} ${m.slice(0, 4)}`; };
  const euroIt = v => Number(v || 0).toFixed(2).replace('.', ',');
  // importo in lettere: 50 → "cinquanta/00", 121,5 → "centoventuno/50"
  function euroWords(v) {
    const U = ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'];
    const T = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'];
    const w99 = n => { if (n < 20) return U[n]; const u = n % 10; let s = T[Math.floor(n / 10)]; if (u === 1 || u === 8) s = s.slice(0, -1); return u ? s + U[u] : s; };
    const w999 = n => { const h = Math.floor(n / 100), r = n % 100; let s = h ? (h === 1 ? 'cento' : U[h] + 'cento') : ''; if (r) { if (h && (r === 8 || Math.floor(r / 10) === 8)) s = s.slice(0, -1); s += w99(r); } return s; };
    const cents = Math.round(Number(v || 0) * 100), n = Math.floor(cents / 100), c = cents % 100;
    let s = n === 0 ? 'zero' : (n >= 1000 ? (Math.floor(n / 1000) === 1 ? 'mille' : w999(Math.floor(n / 1000)) + 'mila') : '') + (n % 1000 ? w999(n % 1000) : '');
    if (n > 3 && s.endsWith('tre')) s = s.slice(0, -3) + 'tré';
    return `${s}/${String(c).padStart(2, '0')}`;
  }
  const PERSON_FIELDS = ['birthPlace', 'birthDate', 'city', 'address', 'cf'];
  const missingPerson = a => PERSON_FIELDS.filter(k => !(a && a[k]));
  const personOf = (uid, a) => { const m = memberByUid(uid); return { name: m ? `${m.first} ${m.last}` : `${(a && a.first) || ''} ${(a && a.last) || ''}`.trim(), gender: (m && m.gender) || 'M', birthPlace: a.birthPlace, birthDate: a.birthDate, city: a.city, address: a.address, cf: a.cf }; };
  const causaleMonth = m => `Quota sociale allenamenti - mese di ${itMonth(m)}`;
  const causaleSpot = d => `Quota sociale allenamenti - allenamento del ${itDate(d)}`;
  const paidLine = (p, pd) => { pd = pd || (p && p.paid); return pd ? `${esc(t('paidOn', { d: fmtDate(pd.date), m: t('pay_' + pd.method) }))}${pd.quarter ? ` · ${esc(t('payQuarterOf', { a: monthLabel(pd.months[0]), b: monthLabel(pd.months[2]) }))}` : ''}${pd.rn ? ` · ${esc(t('receiptN', { n: rnFmt(pd.rn) }))}` : ''}` : ''; };
  const receiptById = id => (S().receipts || []).find(r => r.id === id);
  // numero della ricevuta con la serie: Q quote sociali, C commerciali (le vecchie, senza serie, sono Q)
  const rSeries = r => r.series || 'Q';
  const rcNum = r => `${r.n}/${rSeries(r)}/${r.year}`;
  const rnFmt = rn => (/^\d+\/\d{4}$/.test(rn || '') ? rn.replace('/', '/Q/') : rn || '');
  // stato del pagamento del mese: pagato, da pagare, in ritardo (dopo il 10 del mese)
  // pagato anche se coperto da un trimestrale (prepagato nella scheda del corsista)
  const prepaidOf = (uid, month) => { const a = athleteOf(uid); return (a && a.prepaid && a.prepaid[month]) || null; };
  const planPaid = p => p.paid || prepaidOf(p.uid, p.month);
  const payState = p => planPaid(p) ? 'paid' : (todayStr() > `${p.month}-10` ? 'late' : 'due');
  const quarterMonths = m => [m, shiftMonth(m, 1), shiftMonth(m, 2)];
  const quarterPrice = n => { const v = (S().prices || {})['q' + n]; return (n === 1 || n === 2) && v != null && v !== '' ? Number(v) : null; };
  const causaleQuarter = m => `Quota sociale allenamenti - trimestre ${itMonth(m)} - ${itMonth(shiftMonth(m, 2))}`;
  const payBadge = p => `<span class="badge pay-${payState(p)}">${esc(t('payState_' + payState(p)))}</span>`;
  // pacchetti di allenamenti: si usa il più vecchio con allenamenti rimasti
  const packsOf = uid => (S().packs || []).filter(k => k.uid === uid).sort((a, b) => (a.created || 0) - (b.created || 0));
  const packLeft = k => Math.max(0, (k.n || 0) - (k.used || 0));
  const activePack = uid => packsOf(uid).find(k => packLeft(k) > 0) || null;
  const causalePack = k => `Quota sociale allenamenti - pacchetto di ${k.n} allenamenti`;
  const packById = id => (S().packs || []).find(k => k.id === id);

  // Modulo di pagamento (admin): data, modalità, importo e, se mancano, i dati per la ricevuta.
  function payForm(kind, ref, uid, amount) {
    const a = athleteOf(uid) || {}, miss = missingPerson(a);
    const plan = kind === 'month' ? (S().plans || []).find(p => p.id === ref) : null;
    const qp = plan ? quarterPrice(plan.n) : null;
    return `<form class="grid-form pay-form" data-form="pay-save" data-kind="${kind}" data-ref="${ref}" data-uid="${uid}">
      <h4 class="span-all">${esc(t('payRecord'))}</h4>
      ${qp != null ? `<label class="span-all">${esc(t('payPeriod'))}<select name="period" data-change="pay-period" data-m="${amount != null ? amount : ''}" data-q="${qp}">
        <option value="month">${esc(t('payMonthly', { p: euro(amount) }))}</option>
        <option value="quarter">${esc(t('payQuarterly', { p: euro(qp), a: monthLabel(plan.month), b: monthLabel(shiftMonth(plan.month, 2)) }))}</option></select></label>` : ''}
      <label>${esc(t('payDate'))}<input type="date" name="payDate" required value="${todayStr()}"></label>
      <label>${esc(t('payMethod'))}<select name="method">${PAY_METHODS.map(x => `<option value="${x}">${esc(t('pay_' + x))}</option>`).join('')}</select></label>
      <label>${esc(t('payAmount'))}<input type="number" name="amount" min="0" step="0.01" required value="${amount != null ? amount : ''}" inputmode="decimal"></label>
      <label class="check span-all"><input type="checkbox" name="receipt"> ${esc(t('caReceiptCash'))}</label>
      ${miss.length ? `<p class="note warn span-all">${esc(t('payNeedData'))} ${t('athDataNote')}</p>
        <label>${esc(t('athBirthPlace'))}<input name="birthPlace" maxlength="60" value="${esc(a.birthPlace || '')}"></label>
        <label>${esc(t('athBirthDate'))}<input type="date" name="birthDate" value="${esc(a.birthDate || '')}"></label>
        <label>${esc(t('athCity'))}<input name="city" maxlength="60" value="${esc(a.city || '')}"></label>
        <label>${esc(t('athAddress'))}<input name="address" maxlength="100" value="${esc(a.address || '')}" placeholder="${esc(t('athAddressPh'))}"></label>
        <label>${esc(t('athCf'))}<input name="cf" maxlength="16" value="${esc(a.cf || '')}" pattern="[A-Za-z0-9]{16}"></label>` : ''}
      <div class="form-actions span-all"><button type="button" class="btn" data-action="pay-close">${esc(t('cancel'))}</button><button class="btn primary"><i class="ti ti-receipt" aria-hidden="true"></i> ${esc(t('paySave'))}</button></div>
    </form>`;
  }
  // Riga di pagamento sotto un piano o uno spot (admin): stato, ricevuta, oppure pulsante per registrare.
  function payBox(kind, obj, uid, amount) {
    if (kind === 'spot' && obj.pack) return `<p class="pay-line"><span class="badge st-done"><i class="ti ti-ticket" aria-hidden="true"></i> ${esc(t(obj.packBack ? 'packReturned' : 'packUsed'))}</span></p>`;
    const pd = kind === 'month' ? planPaid(obj) : obj.paid;
    if (pd) {
      const r = pd.rid && receiptById(pd.rid);
      return `<p class="pay-line"><i class="ti ti-circle-check" aria-hidden="true"></i> ${paidLine(obj, pd)}
        ${r ? ` <button class="btn small" data-action="rc-pdf" data-id="${r.id}"><i class="ti ti-file-type-pdf" aria-hidden="true"></i> ${esc(t('receiptPdf'))}</button>`
          : ` <button class="btn small" data-action="pay-undo" data-kind="${kind}" data-ref="${obj.id}" data-iid="${pd.iid || ''}">${esc(t('payUndo'))}</button>`}</p>`;
    }
    const key = `${kind}:${obj.id}`;
    return ui.payFor === key ? payForm(kind, obj.id, uid, amount)
      : `<p class="pay-line">${kind === 'month' ? payBadge(obj) : `<span class="badge pay-due">${esc(t('payState_due'))}</span>`}
        <button class="btn small primary" data-action="pay-open" data-key="${key}"><i class="ti ti-cash" aria-hidden="true"></i> ${esc(t('payRecord'))}</button></p>`;
  }

  // ---------- PDF della ricevuta (jsPDF, già incluso per i referti) ----------
  let jsPdfPromise = null;
  function loadJsPdf() {
    if (!jsPdfPromise) jsPdfPromise = new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = 'referto/vendor/jspdf.umd.min.js'; sc.onload = () => resolve(window.jspdf.jsPDF); sc.onerror = () => { jsPdfPromise = null; reject(new Error('jspdf')); };
      document.head.appendChild(sc);
    });
    return jsPdfPromise;
  }
  function drawReceipt(pdf, r) {
    const p = r.person || {}, F = p.gender === 'F', L = 22, named = !!p.name, C = rSeries(r) === 'C';
    let y = 22;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14); pdf.text(ASSOC[0], L, y);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10.5);
    ASSOC.slice(1).forEach(l => { y += 5.5; pdf.text(l, L, y); });
    y += 18; pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14);
    pdf.text(`RICEVUTA N. ${rcNum(r)} del ${itDate(r.issued)}`, L, y);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11.5);
    if (C) { pdf.setFontSize(9.5); pdf.text('Ricevuta non fiscale', 188, y, { align: 'right' }); pdf.setFontSize(11.5); }
    y += 13; pdf.text(named ? `Si attesta che ${F ? 'la Sig.ra' : 'il Sig.'}:` : 'Si attesta che il/la Sig./Sig.ra:', L, y);
    const blank = '______________________________';
    const rows = named ? [['Nome e Cognome', p.name], [F ? 'Nata a' : 'Nato a', p.birthPlace || p.birthDate ? `${p.birthPlace || ''} il ${itDate(p.birthDate)}` : ''], ['Residente a', p.city || p.address ? `${p.city || ''}, ${p.address || ''}` : ''], ['Codice Fiscale', p.cf || '']]
      : [['Nome e Cognome', blank], ['Codice Fiscale', blank]];
    rows.forEach(([k, v]) => { y += 8; pdf.text('•', L + 3, y); pdf.setFont('helvetica', 'bold'); pdf.text(`${k}:`, L + 8, y); const w = pdf.getTextWidth(`${k}: `); pdf.setFont('helvetica', 'normal'); pdf.text(String(v || ''), L + 8 + w, y); });
    y += 13; pdf.text(`ha versato in data ${itDate(r.payDate)} la somma complessiva di:`, L, y);
    y += 8; pdf.text('•', L + 3, y); pdf.setFont('helvetica', 'bold'); pdf.text(`Euro ${euroIt(r.amount)}`, L + 8, y); pdf.setFont('helvetica', 'normal');
    y += 8; pdf.text('•', L + 3, y); pdf.text(`(Euro ${euroWords(r.amount)})`, L + 8, y);
    y += 13; pdf.setFont('helvetica', 'bold'); pdf.text('Causale:', L, y); pdf.setFont('helvetica', 'normal');
    y += 7; const cl = pdf.splitTextToSize(`${r.causale}.`, 166); pdf.text(cl, L, y); y += (cl.length - 1) * 5.5;
    if ((r.lines || []).length > 1) r.lines.forEach(l => { y += 6.5; pdf.text(`- ${l.desc}: Euro ${euroIt(l.amount)}`, L + 4, y); });
    y += 11; pdf.setFontSize(10); pdf.text(`Modalità di pagamento: ${PAY_IT[r.method] || r.method}`, L, y);
    // spazio per timbro e firma (verranno aggiunti)
    pdf.setFontSize(10.5);
    pdf.text("Timbro dell'associazione", L, 238); pdf.line(L, 262, L + 70, 262);
    pdf.text('Il Presidente', 128, 238); pdf.line(128, 262, 188, 262);
    if (r.void) { pdf.setTextColor(200, 0, 0); pdf.setFontSize(48); pdf.text('ANNULLATA', 105, 170, { align: 'center', angle: 25 }); pdf.setTextColor(0, 0, 0); }
  }
  const receiptFile = r => `ricevuta_${r.n}_${rSeries(r)}_${r.year}${(r.person || {}).name ? '_' + latinName(r.person.name) : ''}.pdf`;
  async function receiptsPdf(list) {
    const JsPDF = await loadJsPdf();
    const pdf = new JsPDF({ unit: 'mm', format: 'a4' });
    list.forEach((r, i) => { if (i) pdf.addPage(); drawReceipt(pdf, r); });
    return pdf;
  }
  function saveBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  async function downloadReceipts(list, mode, name) {
    if (!list.length) return;
    try {
      if (mode === 'zip') {
        if (!zipPromise) zipPromise = new Promise((resolve, reject) => {
          const sc = document.createElement('script');
          sc.src = 'referto/vendor/jszip.min.js'; sc.onload = () => resolve(window.JSZip); sc.onerror = () => { zipPromise = null; reject(new Error('zip')); };
          document.head.appendChild(sc);
        });
        const JSZip = await zipPromise, zip = new JSZip();
        for (const r of list) zip.file(receiptFile(r), (await receiptsPdf([r])).output('arraybuffer'));
        saveBlob(await zip.generateAsync({ type: 'blob' }), `${name}.zip`);
      } else {
        const pdf = await receiptsPdf(list);
        saveBlob(pdf.output('blob'), list.length === 1 ? receiptFile(list[0]) : `${name}.pdf`);
      }
    } catch (e) { console.error(e); warn('regError', { code: e.message }); }
  }

  // ---------- AMMINISTRAZIONE PAGAMENTI (admin) ----------
  // Ricevute (di qualsiasi mese) intestate a persone non tesserate: si tessera la persona o si cambia l'intestatario.
  function notTessCard() {
    const list = notTessReceipts();
    if (!list.length) return '';
    return `<div class="card warn-card" id="not-tess"><h2><span class="tess-star" aria-hidden="true">★</span> ${esc(t('rcNotTessTitle', { n: list.length }))}</h2>
      <p class="muted small">${esc(t('rcNotTessHelp'))}</p>
      <ul class="reg-list">${list.map(r => `<li><span class="reg-names"><strong>${esc(t('receiptN', { n: rcNum(r) }))} · ${esc(r.person.name)}</strong>${tessStar(r)}<br>
        <small class="muted">${esc(fmtDate(r.issued))} · ${esc(euro(r.amount))} · ${esc(t('rcNotTessTip', { s: seasonOf(r.issued) }))}</small></span>
        <span class="btn-row"><a class="btn small" href="#/athletes" data-action="ath-goto" data-uid="${r.uid}" data-m="${r.issued.slice(0, 7)}">${esc(t('rcTessBtn'))}</a>
        <button class="btn small" data-action="ca-holder-open" data-id="${r.id}">${esc(t('caHolderBtn'))}</button></span>
        ${ui.caHolder === r.id ? caHolderForm(r) : ''}</li>`).join('')}</ul></div>`;
  }
  function viewPayments() {
    const month = ui.payMonth || curMonth();
    const kind = ui.payKind || 'all';
    const rs = (S().receipts || []).filter(r => r.issued.slice(0, 7) === month && (kind === 'all' || r.kind === kind)).sort((a, b) => b.year - a.year || b.n - a.n);
    const valid = rs.filter(r => !r.void);
    const tot = PAY_METHODS.map(m => [m, valid.filter(r => r.method === m).reduce((s, r) => s + r.amount, 0)]);
    const plans = (S().plans || []).filter(p => p.month === month && (p.tids || []).length);
    const due = plans.filter(p => !planPaid(p)).sort((a, b) => coachName(a.uid).localeCompare(coachName(b.uid)));
    const name = r => (r.person || {}).name || coachName(r.uid);
    return `<div class="page-head row"><h1><i class="ti ti-cash-register" aria-hidden="true"></i> ${esc(t('payAdminTitle'))}</h1>
        <span class="btn-row"><a class="btn small" href="#/report"><i class="ti ti-report-analytics" aria-hidden="true"></i> ${esc(t('rpTitle'))} →</a>
        <a class="btn small" href="#/athletes"><i class="ti ti-id-badge-2" aria-hidden="true"></i> ${esc(t('athTitle'))} →</a></span></div>
      <div class="month-nav card">
        <button class="btn small" data-action="pay-month" data-m="${shiftMonth(month, -1)}" aria-label="${esc(t('prevMonth'))}"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
        <strong>${esc(monthLabel(month))}</strong>
        <button class="btn small" data-action="pay-month" data-m="${shiftMonth(month, 1)}" aria-label="${esc(t('nextMonth'))}"><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
        <select data-change="pay-kind" aria-label="${esc(t('payKind'))}">${['all', 'month', 'pack', 'spot', 'cassa'].map(k => `<option value="${k}" ${k === kind ? 'selected' : ''}>${esc(t('payKind_' + k))}</option>`).join('')}</select>
      </div>
      <div class="stats-row">
        <div class="stat"><span>${esc(t('payTotal'))}</span><strong>${esc(euro(valid.reduce((s, r) => s + r.amount, 0)))}</strong><small class="muted">${esc(t('receiptsCount', { n: valid.length }))}</small></div>
        ${tot.map(([m, v]) => `<div class="stat"><span>${esc(t('pay_' + m))}</span><strong>${esc(euro(v))}</strong></div>`).join('')}
      </div>
      <div class="card">
        <h2><i class="ti ti-alert-circle" aria-hidden="true"></i> ${esc(t('payMissing', { m: monthLabel(month) }))} (${due.length})</h2>
        <p class="muted small">${esc(t('payMissingHelp'))}</p>
        ${due.length ? `<ul class="reg-list">${due.map(p => `<li><span class="reg-names"><strong>${esc(coachName(p.uid))}</strong> ${payBadge(p)}<br><small class="muted">${esc(t('planN', { n: p.n }))} · ${esc(euro(p.price))}</small></span>
          <a class="btn small" href="#/athletes" data-action="ath-goto" data-uid="${p.uid}" data-m="${month}">${esc(t('athOpen'))}</a></li>`).join('')}</ul>` : `<p class="muted">${esc(t('payAllPaid'))}</p>`}
      </div>
      ${notTessCard()}
      ${revenueCard(month)}
      <div class="card">
        <h2><i class="ti ti-receipt" aria-hidden="true"></i> ${esc(t('receiptsTitle'))} (${rs.length})</h2>
        ${rs.length ? `<div class="btn-row"><button class="btn" data-action="rc-bulk" data-mode="pdf"><i class="ti ti-file-type-pdf" aria-hidden="true"></i> ${esc(t('receiptsPdfAll'))}</button>
          <button class="btn" data-action="rc-bulk" data-mode="zip"><i class="ti ti-file-zip" aria-hidden="true"></i> ${esc(t('receiptsZip'))}</button></div>
        <ul class="reg-list">${rs.map(r => `<li class="${r.void ? 'is-void' : ''}"><span class="reg-names"><strong>${esc(t('receiptN', { n: rcNum(r) }))} · ${esc((r.person && r.person.name) || t('caNoHolder'))}</strong>${tessStar(r)}
          ${r.void ? ` <span class="badge st-full">${esc(t('receiptVoid'))}</span>` : ''}<br>
          <small class="muted">${esc(fmtDate(r.issued))} · ${esc(euro(r.amount))} · ${esc(t('pay_' + r.method))} · ${esc(r.causale)}</small></span>
          <span class="btn-row"><button class="btn small" data-action="rc-pdf" data-id="${r.id}"><i class="ti ti-download" aria-hidden="true"></i> PDF</button>
          <button class="btn small" data-action="rc-renum" data-id="${r.id}"><i class="ti ti-hash" aria-hidden="true"></i> ${esc(t('receiptRenum'))}</button>
          ${r.void ? '' : `<button class="btn small" data-action="ca-holder-open" data-id="${r.id}">${esc(t('caHolderBtn'))}</button>
          <button class="btn small danger" data-action="rc-void" data-id="${r.id}">${esc(t('receiptVoidBtn'))}</button>`}</span>
          ${ui.caHolder === r.id ? caHolderForm(r) : ''}</li>`).join('')}</ul>`
          : `<p class="muted">${esc(t('receiptsNone'))}</p>`}
      </div>`;
  }

  // Ricevute del corsista (profilo)
  function myReceiptsCard() {
    const m = member();
    const rs = m ? (S().receipts || []).filter(r => r.uid === m.uid && !r.void).sort((a, b) => b.year - a.year || b.n - a.n) : [];
    if (!rs.length) return '';
    return `<div class="card" id="my-receipts"><h2><i class="ti ti-receipt" aria-hidden="true"></i> ${esc(t('myReceipts'))}</h2>
      <ul class="reg-list">${rs.map(r => `<li><span class="reg-names"><strong>${esc(t('receiptN', { n: rcNum(r) }))}</strong> · ${esc(euro(r.amount))}<br><small class="muted">${esc(fmtDate(r.payDate))} · ${esc(r.causale)}</small></span>
        <button class="btn small" data-action="rc-pdf" data-id="${r.id}"><i class="ti ti-download" aria-hidden="true"></i> PDF</button></li>`).join('')}</ul></div>`;
  }

  const payActions = {
    'pay-open': el => { ui.payFor = el.dataset.key; render(); },
    'pay-close': () => { ui.payFor = null; render(); },
    'pay-month': el => { ui.payMonth = el.dataset.m; render(); },
    'pay-undo': el => { if (confirmed('payUndoConfirm')) window.Cloud.unpay(el.dataset.kind, el.dataset.ref, el.dataset.iid).then(() => render()).catch(trErr); },
    'rc-pdf': el => { const r = receiptById(el.dataset.id); if (r) downloadReceipts([r], 'pdf'); },
    // Cambia il numero di una ricevuta: da quella in poi (stesso anno) la numerazione prosegue in ordine.
    'rc-renum': el => {
      const r = receiptById(el.dataset.id);
      if (!r) return;
      const v = prompt(t('receiptRenumPrompt', { n: rcNum(r) }), String(r.n));
      if (v === null) return;
      const x = parseInt(v, 10);
      if (!(x >= 1) || x === r.n) return;
      const year = (S().receipts || []).filter(q => q.year === r.year && rSeries(q) === rSeries(r)).sort((a, b) => a.n - b.n || (a.created || 0) - (b.created || 0));
      const from = year.filter(q => q.n > r.n || q.id === r.id);   // la ricevuta scelta e le successive
      const before = year.filter(q => !from.includes(q));
      const changes = from.map((q, i) => ({ r: q, n: x + i }));
      const clash = changes.filter(c => before.some(q => q.n === c.n)).map(c => c.n);
      if (clash.length && !confirmed('receiptRenumClash', { l: clash.join(', ') })) return;
      if (!confirmed('receiptRenumConfirm', { a: rcNum(r), b: `${x}/${rSeries(r)}/${r.year}`, k: changes.length })) return;
      // dove compare il numero: piani (anche trimestrali), spot, prepagati nella scheda
      const links = [];
      changes.forEach(({ r: q, n }) => {
        const rn = `${n}/${rSeries(q)}/${q.year}`;
        if (q.incasso) links.push({ col: 'incassi', id: q.incasso, field: `receipts.${rSeries(q)}.rn`, rn });
        Object.entries(S().bkpaid || {}).forEach(([gid, bp]) => { if (q.incasso && bp.incasso === q.incasso && rSeries(q) === 'Q') links.push({ col: 'bkpaid', id: gid, field: 'rn', rn }); });
        (S().plans || []).filter(p => p.paid && p.paid.rid === q.id).forEach(p => links.push({ col: 'plans', id: p.id, field: 'paid.rn', rn }));
        (S().spots || []).filter(p => p.paid && p.paid.rid === q.id).forEach(p => links.push({ col: 'spots', id: p.id, field: 'paid.rn', rn }));
        (S().packs || []).filter(p => p.paid && p.paid.rid === q.id).forEach(p => links.push({ col: 'packs', id: p.id, field: 'paid.rn', rn }));
        (S().athletes || []).forEach(a => Object.entries(a.prepaid || {}).forEach(([m, pd]) => { if (pd && pd.rid === q.id) links.push({ col: 'athletes', id: a.id, field: `prepaid.${m}.rn`, rn }); }));
      });
      const last = Math.max(...year.map(q => q.n).filter((n, i) => !from.includes(year[i])), ...changes.map(c => c.n));
      window.Cloud.renumberReceipts(changes.map(c => ({ id: c.r.id, n: c.n })), links, r.year, last, rSeries(r))
        .then(() => { ui.flash = { text: t('receiptRenumDone', { k: changes.length, l: `${last}/${rSeries(r)}/${r.year}` }) }; render(); }).catch(trErr);
    },
    'rc-void': el => {
      const r = receiptById(el.dataset.id);
      if (!r) return;
      // ricevuta della cassa: si annulla l'intero incasso (anche l'eventuale ricevuta dell'altra serie)
      const inc = r.kind === 'cassa' && (S().incassi || []).find(i => i.id === r.incasso);
      if (inc) { if (confirmed('caVoidConfirm', { n: rcNum(r) })) window.Cloud.voidIncasso(inc).then(() => { ui.flash = { text: t('receiptVoided') }; render(); }).catch(trErr); return; }
      if (confirmed('receiptVoidConfirm', { n: rcNum(r) })) window.Cloud.voidReceipt(r, (S().plans || []).filter(x => x.uid === r.uid && (r.months || []).includes(x.month) && x.paid && x.paid.rid === r.id).map(x => x.id)).then(() => { ui.flash = { text: t('receiptVoided') }; render(); }).catch(trErr);
    },
    'rc-bulk': el => {
      const month = ui.payMonth || curMonth(), kind = ui.payKind || 'all';
      const rs = (S().receipts || []).filter(r => r.issued.slice(0, 7) === month && (kind === 'all' || r.kind === kind)).sort((a, b) => a.n - b.n);
      downloadReceipts(rs, el.dataset.mode, `ricevute_${month}${kind === 'all' ? '' : '_' + kind}`);
    },
    'ath-goto': el => { ui.athEdit = el.dataset.uid; ui.trMonth = el.dataset.m; location.hash = '#/athletes'; },
    'pack-del': el => {
      const k = packById(el.dataset.id);
      if (k && confirmed('packDelConfirm', { n: k.n })) window.Cloud.deletePack(k.id).then(() => { ui.flash = { text: t('packDeleted') }; render(); }).catch(trErr);
    }
  };
  const payForms = {
    'pack-new': f => {
      const n = parseInt(f.n.value, 10), price = Math.round(Number(f.price.value || 0) * 100) / 100;
      if (!(n >= 1)) return;
      const m = memberByUid(f.dataset.uid);
      window.Cloud.savePack(null, { uid: f.dataset.uid, name: m ? personName(m) : '', n, price }).then(() => { ui.flash = { text: t('packCreated', { n }) }; render(); }).catch(trErr);
    },
    'pay-save': f => {
      const kind = f.dataset.kind, ref = f.dataset.ref, uid = f.dataset.uid;
      const obj = kind === 'month' ? (S().plans || []).find(p => p.id === ref) : kind === 'pack' ? packById(ref) : (S().spots || []).find(s => s.id === ref);
      if (!obj) return;
      const amount = Math.round(Number(f.amount.value || 0) * 100) / 100;
      const a = Object.assign({}, athleteOf(uid) || {});
      let athlete = null;
      if (f.cf) {   // dati mancanti compilati nel modulo: si salvano anche nella scheda
        athlete = {};
        PERSON_FIELDS.forEach(k => { const v = f[k].value.trim(); if (v) { athlete[k] = k === 'cf' ? v.toUpperCase() : v; a[k] = athlete[k]; } });
        const m = memberByUid(uid);
        if (m) Object.assign(athlete, { first: m.first, last: m.last });
        athlete.updated = Date.now();
        if (!athleteOf(uid)) Object.assign(athlete, { created: Date.now(), tess: {} });
      }
      // ricevuta: sempre per carta e bonifico; per i contanti solo se richiesta
      const receipt = f.method.value !== 'cash' || f.receipt.checked;
      if (amount > 0 && receipt && missingPerson(a).length) return warn('payNeedData');
      const quarter = kind === 'month' && f.period && f.period.value === 'quarter';
      const p = { kind, ref, uid, amount, receipt, method: f.method.value, payDate: f.payDate.value, issued: todayStr(), person: personOf(uid, a), athlete,
        causale: quarter ? causaleQuarter(obj.month) : kind === 'month' ? causaleMonth(obj.month) : kind === 'pack' ? causalePack(obj) : causaleSpot(obj.date), month: obj.month || '', spotDate: obj.date || '' };
      if (quarter) {
        p.quarter = true; p.months = quarterMonths(obj.month);
        p.planIds = (S().plans || []).filter(x => x.uid === uid && p.months.includes(x.month)).map(x => x.id);
        if (p.months.slice(1).some(m => prepaidOf(uid, m) || ((S().plans || []).find(x => x.uid === uid && x.month === m) || {}).paid) && !confirmed('payQuarterOverlap')) return;
      }
      window.Cloud.recordPayment(p).then(() => { ui.payFor = null; ui.flash = { text: t(amount > 0 && receipt ? 'paySavedReceipt' : 'paySaved') }; render(); }).catch(trErr);
    }
  };

  // ---------- CASSA: registro degli incassi, ricevute Q (quote sociali) e C (commerciali) ----------
  // Ogni incasso ha una o più righe; le quote sociali vanno nella ricevuta Q, il commerciale nella ricevuta C
  // (numerazioni autonome per anno). Carta e bonifico: ricevuta sempre; contanti: a scelta.
  const CA_CATS = [['q_train', 'Q'], ['q_court', 'Q'], ['q_tour', 'Q'], ['c_drink', 'C'], ['c_other', 'C']];
  const caSeries = cat => (CA_CATS.find(c => c[0] === cat) || [, 'C'])[1];
  // descrizione della riga sulla ricevuta (in italiano: è un documento contabile)
  const CA_IT = { q_train: 'Quota sociale allenamenti', q_court: 'Quota sociale - prenotazione campo per allenamento', q_tour: 'Quota sociale torneo sociale', c_drink: 'Bevande', c_other: 'Altro' };
  const caLineDesc = (cat, desc) => (cat === 'c_other' && desc ? desc : CA_IT[cat] + (desc ? ` - ${desc}` : ''));
  const caCausale = (series, lines) => (lines.length === 1 ? lines[0].desc : series === 'Q' ? 'Quote sociali (dettaglio)' : 'Vendita (dettaglio)');
  const bkLabel = b => `${fmtDate(b.date)} ${b.from}–${b.to} · ${courtName(b.courtId)}${b.guest ? ' · ' + bkWho(b) : b.userId ? ' · ' + uidName(b.userId) : ''}`;
  const bkItDesc = b => `${itDate(b.date)} ${b.from}-${b.to}, ${courtName(b.courtId)}`;
  // prenotazioni da incassare: da ieri in poi, di un utente, non ancora pagate
  // intestatari: solo i tesserati della stagione (elenco "tesserati" con i soli dati della ricevuta)
  const tessFor = date => { const se = seasonOf(date || todayStr()); return (S().tesserati || []).filter(x => (x.seasons || []).includes(se)).sort((a, b) => a.name.localeCompare(b.name)); };
  const isTess = (uid, date) => tessFor(date).some(x => x.id === uid);
  const caBookings = () => (S().bookings || []).filter(b => b.userId && !b.blocked && !(S().bkpaid || {})[b.id]).sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from));
  // nuovo incasso: qualsiasi utente registrato (i non tesserati vengono segnati con ★ nelle ricevute)
  const caMemberOpts = () => `<option value="">— ${esc(t('caNoHolder'))} —</option>${(S().members || []).slice().sort((a, b) => personName(a).localeCompare(personName(b))).map(m => `<option value="${m.uid}">${esc(personName(m))}${isTess(m.uid) ? '' : ' ★'}</option>`).join('')}`;
  // ricevuta intestata a una persona non tesserata nella stagione della ricevuta
  const rcNotTess = r => !r.void && !!r.uid && !!(r.person && r.person.name) && !isTess(r.uid, r.issued);
  const notTessReceipts = () => (S().receipts || []).filter(rcNotTess).sort((a, b) => (b.issued || '').localeCompare(a.issued || ''));
  const tessStar = r => (rcNotTess(r) ? ` <span class="tess-star" title="${esc(t('rcNotTessTip', { s: seasonOf(r.issued) }))}" aria-label="${esc(t('rcNotTessTip', { s: seasonOf(r.issued) }))}">★</span>` : '');
  const caHolderOpts = (date, sel) => `<option value="">— ${esc(t('caNoHolder'))} —</option>${tessFor(date).map(x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}`;
  function caLineRow() {
    const bks = caBookings();
    return `<div class="ca-line">
      <label class="ca-cat-l">${esc(t('caCat'))}<select name="cat" data-change="ca-cat"><option value="">-</option>${CA_CATS.map(([k, sr]) => `<option value="${k}">${esc(t('caCat_' + k))} (${sr})</option>`).join('')}</select></label>
      <select name="bk" hidden aria-label="${esc(t('caBooking'))}"><option value="">— ${esc(t('caBooking'))} —</option>${bks.map(b => `<option value="${b.id}">${esc(bkLabel(b))}</option>`).join('')}</select>
      <input name="desc" maxlength="120" placeholder="${esc(t('caDesc'))}" aria-label="${esc(t('caDesc'))}">
      <input name="amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="€" aria-label="${esc(t('payAmount'))}">
    </div>`;
  }
  // incassi del mese + ricevute precedenti alla cassa (pagamenti allenamenti), per il resoconto completo
  function caMonthList(month) {
    const inc = (S().incassi || []).filter(i => i.date.slice(0, 7) === month);
    const legacy = (S().receipts || []).filter(r => !r.incasso && r.kind !== 'cassa' && !r.void && (r.payDate || r.issued || '').slice(0, 7) === month)
      .map(r => ({ id: 'r_' + r.id, legacy: true, date: r.payDate || r.issued, method: r.method, lines: [{ cat: 'q_train', series: 'Q', desc: r.causale, amount: r.amount }], totQ: r.amount, totC: 0, total: r.amount,
        receipts: { Q: { id: r.id, rn: rcNum(r) } }, uid: r.uid, name: (r.person || {}).name || '', void: false, at: r.created || 0, by: r.by }));
    return inc.concat(legacy).sort((a, b) => b.date.localeCompare(a.date) || (b.at || 0) - (a.at || 0));
  }
  const round2 = v => Math.round(v * 100) / 100;
  function viewCassa() {
    const month = ui.caMonth || curMonth();
    const list = caMonthList(month), ok = list.filter(i => !i.void);
    const sum = f => round2(ok.reduce((s, i) => s + f(i), 0));
    const byCat = CA_CATS.map(([k, sr]) => [k, sr, round2(ok.reduce((s, i) => s + (i.lines || []).filter(l => l.cat === k).reduce((a, l) => a + l.amount, 0), 0))]);
    const who = uid => (uid ? (memberByUid(uid) ? personName(memberByUid(uid)) : uid === myUid() ? t('caMe') : 'Admin') : '');
    const rcBtns = i => Object.entries(i.receipts || {}).map(([sr, r]) => { const rr = receiptById(r.id); return `<span class="badge rc-${sr}">${esc(rr ? rcNum(rr) : r.rn)}</span>${rr ? tessStar(rr) : ''}
      ${rr ? `<button class="btn small" data-action="rc-pdf" data-id="${rr.id}" aria-label="PDF ${esc(rcNum(rr))}"><i class="ti ti-file-type-pdf" aria-hidden="true"></i></button>` : ''}
      ${rr && admin() && !i.void ? `<button class="btn small" data-action="ca-holder-open" data-id="${rr.id}">${esc(t('caHolderBtn'))}</button>` : ''}`; }).join(' ');
    return `<div class="page-head row"><h1><i class="ti ti-cash-register" aria-hidden="true"></i> ${esc(t('caTitle'))}</h1>
        ${admin() ? `<a class="btn small" href="#/payments"><i class="ti ti-receipt" aria-hidden="true"></i> ${esc(t('payAdminTitle'))} →</a>` : ''}</div>
      <p class="muted small">${esc(t('caIntro'))}</p>
      <form class="card grid-form ca-form" data-form="ca-save" id="ca-form">
        <h2 class="span-all"><i class="ti ti-plus" aria-hidden="true"></i> ${esc(t('caNew'))}</h2>
        <label>${esc(t('payDate'))}<input type="date" name="date" required value="${todayStr()}"></label>
        <label>${esc(t('payMethod'))}<select name="method" data-change="ca-method">${PAY_METHODS.map(x => `<option value="${x}">${esc(t('pay_' + x))}</option>`).join('')}</select></label>
        <div class="span-all ca-lines">${caLineRow()}${caLineRow()}</div>
        <div class="span-all"><button type="button" class="btn small" data-action="ca-addline"><i class="ti ti-plus" aria-hidden="true"></i> ${esc(t('caAddLine'))}</button></div>
        <label class="span-all">${esc(t('caHolder'))}<select name="holder">${caMemberOpts()}</select>
          <small class="muted">${esc(t('caHolderTessOnly', { s: seasonOf(todayStr()) }))}</small></label>
        <label class="check span-all ca-rc"><input type="checkbox" name="receipt"> ${esc(t('caReceiptCash'))}</label>
        <p class="note span-all ca-rc-note" hidden>${esc(t('caReceiptAlways'))}</p>
        ${admin() ? `<details class="span-all"><summary>${esc(t('caInsertTitle'))}</summary><p class="muted small">${esc(t('caInsertHelp'))}</p>
          <label>${esc(t('caInsertN'))}<input type="number" name="insN" min="1" step="1" inputmode="numeric"></label></details>` : ''}
        <div class="form-actions span-all"><button class="btn primary"><i class="ti ti-device-floppy" aria-hidden="true"></i> ${esc(t('caSave'))}</button></div>
      </form>
      <div class="month-nav card">
        <button class="btn small" data-action="ca-month" data-m="${shiftMonth(month, -1)}" aria-label="${esc(t('prevMonth'))}"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
        <strong>${esc(monthLabel(month))}</strong>
        <button class="btn small" data-action="ca-month" data-m="${shiftMonth(month, 1)}" aria-label="${esc(t('nextMonth'))}"><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
        <button class="btn small" data-action="ca-xlsx" data-m="${month}"><i class="ti ti-file-spreadsheet" aria-hidden="true"></i> ${esc(t('caExcel'))}</button>
      </div>
      <div class="stats-row">
        <div class="stat"><span>${esc(t('caTotal'))}</span><strong>${esc(euro(sum(i => i.total)))}</strong><small class="muted">${esc(t('caCount', { n: ok.length }))}</small></div>
        <div class="stat"><span>${esc(t('caTotQ'))}</span><strong>${esc(euro(sum(i => i.totQ || 0)))}</strong></div>
        <div class="stat"><span>${esc(t('caTotC'))}</span><strong>${esc(euro(sum(i => i.totC || 0)))}</strong></div>
        ${PAY_METHODS.map(m => `<div class="stat"><span>${esc(t('pay_' + m))}</span><strong>${esc(euro(sum(i => (i.method === m ? i.total : 0))))}</strong></div>`).join('')}
      </div>
      <div class="card rp-card"><h2><i class="ti ti-chart-pie" aria-hidden="true"></i> ${esc(t('caByCat'))}</h2>
        <div class="table-wrap"><table class="table rp-table"><tbody>${byCat.map(([k, sr, v]) => `<tr><th scope="row">${esc(t('caCat_' + k))} <span class="badge rc-${sr}">${sr}</span></th><td class="num">${esc(euro(v))}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><h2><i class="ti ti-list" aria-hidden="true"></i> ${esc(t('caList'))} (${list.length})</h2>
        ${list.length ? `<ul class="reg-list ca-list">${list.map(i => `<li class="${i.void ? 'is-void' : ''}"><span class="reg-names"><strong>${esc(fmtDate(i.date))} · ${esc(euro(i.total))}</strong> · ${esc(t('pay_' + i.method))}
            ${i.void ? ` <span class="badge st-full">${esc(t('caVoided'))}</span>` : ''}${i.name ? ` · ${esc(i.name)}` : ''}
            <br>${(i.lines || []).map(l => `<small class="muted">${esc(t('caCat_' + l.cat))}: ${esc(l.desc)} · ${esc(euro(l.amount))}</small>`).join('<br>')}
            <br><span class="btn-row">${rcBtns(i) || `<small class="muted">${esc(t('caNoReceipt'))}</small>`}${i.by ? ` <small class="muted">${esc(t('caBy', { n: who(i.by) }))}</small>` : ''}</span></span>
          ${admin() && !i.void && !i.legacy ? `<button class="btn small danger" data-action="ca-void" data-id="${i.id}">${esc(t('caVoidBtn'))}</button>` : ''}
          ${Object.values(i.receipts || {}).some(r => r.id === ui.caHolder) ? caHolderForm(receiptById(ui.caHolder)) : ''}</li>`).join('')}</ul>`
          : `<p class="muted">${esc(t('caNone'))}</p>`}
      </div>`;
  }
  // intestatario della ricevuta (admin): una persona registrata oppure un nome scritto a mano
  function caHolderForm(r) {
    if (!r) return '';
    return `<form class="inline-form ca-holder" data-form="ca-holder" data-id="${r.id}">
      <label class="small">${esc(t('caHolder'))}<select name="holder">${caHolderOpts(r.issued, r.uid)}</select></label>
      <button class="btn small primary">${esc(t('save'))}</button><button type="button" class="btn small" data-action="ca-holder-close">${esc(t('cancel'))}</button>
      ${(r.holderLog || []).length ? `<small class="muted span-all">${esc(t('caHolderLog'))}: ${(r.holderLog || []).map(h => `${fmtDate(new Date(h.at).toLocaleDateString('sv'))} «${h.from || '—'}» → «${h.to || '—'}»`).map(esc).join(' · ')}</small>` : ''}</form>`;
  }
  // persona per la ricevuta: dati del tesserato (nome, nascita, residenza, codice fiscale), altrimenti nome e sesso
  function caPerson(uid) {
    if (!uid) return null;
    const x = (S().tesserati || []).find(y => y.id === uid);
    if (x) return { name: x.name, gender: x.gender || 'M', birthPlace: x.birthPlace || '', birthDate: x.birthDate || '', city: x.city || '', address: x.address || '', cf: x.cf || '' };
    const a = admin() && athleteOf(uid);
    // dati mancanti nella scheda: campi vuoti (il database non accetta valori indefiniti)
    if (a) return Object.fromEntries(Object.entries(personOf(uid, a)).map(([k, v]) => [k, v == null ? '' : v]));
    const m = memberByUid(uid);
    return m ? { name: `${m.first} ${m.last}`, gender: m.gender || 'M' } : null;
  }
  // dove compare il numero di una ricevuta (piani, spot, pacchetti, prepagati, incassi, campi pagati)
  function rnLinks(q, rn) {
    const links = [];
    (S().plans || []).filter(p => p.paid && p.paid.rid === q.id).forEach(p => links.push({ col: 'plans', id: p.id, field: 'paid.rn', rn }));
    (S().spots || []).filter(p => p.paid && p.paid.rid === q.id).forEach(p => links.push({ col: 'spots', id: p.id, field: 'paid.rn', rn }));
    (S().packs || []).filter(p => p.paid && p.paid.rid === q.id).forEach(p => links.push({ col: 'packs', id: p.id, field: 'paid.rn', rn }));
    (S().athletes || []).forEach(a => Object.entries(a.prepaid || {}).forEach(([m, pd]) => { if (pd && pd.rid === q.id) links.push({ col: 'athletes', id: a.id, field: `prepaid.${m}.rn`, rn }); }));
    if (q.incasso) links.push({ col: 'incassi', id: q.incasso, field: `receipts.${rSeries(q)}.rn`, rn });
    if (q.incasso && rSeries(q) === 'Q') Object.entries(S().bkpaid || {}).forEach(([gid, bp]) => { if (bp.incasso === q.incasso) links.push({ col: 'bkpaid', id: gid, field: 'rn', rn }); });
    return links;
  }
  function caSave(f) {
    const rows = [...f.querySelectorAll('.ca-line')].map(row => ({ cat: row.querySelector('[name=cat]').value, bk: row.querySelector('[name=bk]').value,
      desc: row.querySelector('[name=desc]').value.trim(), amount: Math.round(Number(row.querySelector('[name=amount]').value || 0) * 100) / 100 })).filter(x => x.amount > 0 || x.cat);
    if (rows.some(x => !x.cat)) return warn('caNeedType');
    if (rows.some(x => !(x.amount > 0))) return warn('caNeedAmount');
    if (!rows.length) return warn('caNoLines');
    const bkById = id => (S().bookings || []).find(b => b.id === id);
    if (rows.some(x => x.cat === 'q_court' && !x.bk)) return warn('caNeedBooking');
    const lines = rows.map(x => {
      const b = x.cat === 'q_court' ? bkById(x.bk) : null;
      return Object.assign({ cat: x.cat, series: caSeries(x.cat), amount: x.amount, desc: caLineDesc(x.cat, b ? [bkItDesc(b), x.desc].filter(Boolean).join(' - ') : x.desc) }, b ? { ref: { kind: 'booking', id: b.id } } : {});
    });
    const method = f.method.value, date = f.date.value;
    const always = method !== 'cash', want = always || f.receipt.checked;
    // intestatario: un tesserato scelto, oppure chi ha prenotato il campo (se tesserato); altrimenti senza nome
    let uid = f.holder.value;
    if (!uid) { const b = rows.map(x => x.cat === 'q_court' && bkById(x.bk)).find(Boolean); if (b && b.userId) uid = b.userId; }
    const person = caPerson(uid);
    const p = { date, method, lines, uid, person, receipt: { Q: want, C: want }, causale: { Q: caCausale('Q', lines.filter(l => l.series === 'Q')), C: caCausale('C', lines.filter(l => l.series === 'C')) } };
    const tq = round2(lines.filter(l => l.series === 'Q').reduce((s, l) => s + l.amount, 0)), tc = round2(lines.filter(l => l.series === 'C').reduce((s, l) => s + l.amount, 0));
    const insN = f.insN && f.insN.value ? parseInt(f.insN.value, 10) : 0;
    if (insN) {
      // inserimento con numero scelto: una sola serie e ricevuta emessa
      const series = tq && tc ? null : tq ? 'Q' : 'C';
      if (!series) return warn('caInsertOneSeries');
      const year = +date.slice(0, 4);
      const same = (S().receipts || []).filter(r => r.year === year && rSeries(r) === series);
      const shifts = same.filter(r => r.n >= insN).sort((a, b) => b.n - a.n).map(q => ({ id: q.id, n: q.n + 1, links: rnLinks(q, `${q.n + 1}/${series}/${year}`) }));
      const last = Math.max(insN, ...same.map(r => (r.n >= insN ? r.n + 1 : r.n)));
      if (!confirmed('caInsertConfirm', { n: `${insN}/${series}/${year}`, k: shifts.length })) return;
      return window.Cloud.insertIncasso(p, series, insN, shifts, last).then(() => { ui.flash = { text: t('caSaved') }; render(); }).catch(trErr);
    }
    const what = [tq ? t('caConfirmQ', { v: euro(tq) }) : '', tc ? t('caConfirmC', { v: euro(tc) }) : ''].filter(Boolean).join(' + ');
    if (!confirmed(want ? 'caConfirmRc' : 'caConfirmNoRc', { w: what, m: t('pay_' + method), h: (person && person.name) || t('caNoHolder') })) return;
    f.querySelector('button.primary').disabled = true;
    window.Cloud.recordIncasso(p).then(() => { ui.flash = { text: t(want ? 'caSavedRc' : 'caSaved') }; render(); }).catch(e => { f.querySelector('button.primary').disabled = false; trErr(e); });
  }
  // prospetto mensile in Excel: incassi riga per riga, riepilogo per categoria e modalità, ricevute
  async function caXlsx(month) {
    const list = caMonthList(month), ok = list.filter(i => !i.void);
    const who = uid => (memberByUid(uid) ? personName(memberByUid(uid)) : '');
    const rowsI = [['Data', 'Modalità', 'Categoria', 'Serie', 'Descrizione', 'Importo', 'Ricevuta', 'Intestatario', 'Registrato da', 'Annullato']];
    list.slice().reverse().forEach(i => (i.lines || []).forEach(l => rowsI.push([itDate(i.date), PAY_IT[i.method] || i.method, t('caCat_' + l.cat), l.series, l.desc, l.amount,
      ((i.receipts || {})[l.series] || {}).rn || '', i.name || '', who(i.by), i.void ? 'sì' : ''])));
    const rowsS = [['Voce', 'Serie', 'Importo']].concat(CA_CATS.map(([k, sr]) => [t('caCat_' + k), sr, round2(ok.reduce((s, i) => s + (i.lines || []).filter(l => l.cat === k).reduce((a, l) => a + l.amount, 0), 0))]))
      .concat([['Totale quote sociali', 'Q', round2(ok.reduce((s, i) => s + (i.totQ || 0), 0))], ['Totale commerciale', 'C', round2(ok.reduce((s, i) => s + (i.totC || 0), 0))]])
      .concat(PAY_METHODS.map(m => [`Totale ${PAY_IT[m]}`, '', round2(ok.reduce((s, i) => s + (i.method === m ? i.total : 0), 0))]))
      .concat([['Totale', '', round2(ok.reduce((s, i) => s + i.total, 0))]]);
    const rs = (S().receipts || []).filter(r => (r.issued || '').slice(0, 7) === month).sort((a, b) => rSeries(a).localeCompare(rSeries(b)) || a.n - b.n);
    const rowsR = [['Numero', 'Serie', 'Data', 'Intestatario', 'Importo', 'Modalità', 'Causale', 'Annullata']].concat(rs.map(r => [rcNum(r), rSeries(r), itDate(r.issued), (r.person || {}).name || '', r.amount, PAY_IT[r.method] || r.method, r.causale, r.void ? 'sì' : '']));
    saveBlob(await makeXlsx([{ name: 'Incassi', rows: rowsI, money: [5] }, { name: 'Riepilogo', rows: rowsS, money: [2] }, { name: 'Ricevute', rows: rowsR, money: [4] }]), `prospetto_incassi_${month}.xlsx`);
  }
  const cassaActions = {
    'ca-month': el => { ui.caMonth = el.dataset.m; render(); },
    'ca-addline': () => { const box = document.querySelector('#ca-form .ca-lines'); if (box) box.insertAdjacentHTML('beforeend', caLineRow()); },
    'ca-xlsx': el => { caXlsx(el.dataset.m).catch(e => { console.error(e); warn('regError', { code: e.message }); }); },
    'ca-void': el => {
      const i = (S().incassi || []).find(x => x.id === el.dataset.id);
      if (i && confirmed('caVoidConfirm', { n: `${fmtDate(i.date)} · ${euro(i.total)}` })) window.Cloud.voidIncasso(i).then(() => { ui.flash = { text: t('caVoidedDone') }; render(); }).catch(trErr);
    },
    'ca-holder-open': el => { ui.caHolder = el.dataset.id; render(); },
    'ca-holder-close': () => { ui.caHolder = null; render(); }
  };
  const cassaForms = {
    'ca-save': f => caSave(f),
    'ca-holder': f => {
      const r = receiptById(f.dataset.id);
      if (!r) return;
      const uid = f.holder.value, person = caPerson(uid);
      if (uid && !isTess(uid, r.issued)) return warn('caNotTess');
      window.Cloud.setReceiptHolder(r, uid, person).then(() => { ui.caHolder = null; ui.flash = { text: t('caHolderSaved') }; render(); }).catch(trErr);
    }
  };

  // ---------- REPORT PRESENZE, RICAVI PER ALLENAMENTO E BACKUP MENSILE (admin) ----------
  // Presenze, spot e giornate dei periodi passati si leggono dal database solo quando servono (rpCache).
  const rpCache = {};
  function rangeData(from, to) {
    const k = `${from}_${to}`;
    if (rpCache[k] && rpCache[k] !== 'loading') return rpCache[k];
    if (!rpCache[k]) {
      rpCache[k] = 'loading';
      window.Cloud.loadTrainingRange(from, to).then(d => { rpCache[k] = d; render(); }).catch(e => { delete rpCache[k]; trErr(e); });
    }
    return null;
  }
  const monthEnd = m => addDays(shiftMonth(m, 1) + '-01', -1);
  const quarterStart = d => `${d.slice(0, 4)}-${String(Math.floor((+d.slice(5, 7) - 1) / 3) * 3 + 1).padStart(2, '0')}`;
  // periodo del report: settimana (lun–dom), mese, trimestre solare
  function rpPeriod(per, ref) {
    if (per === 'week') { const f = weekStart(ref); return { from: f, to: addDays(f, 6), label: t('weekOf', { a: fmtDate(f), b: fmtDate(addDays(f, 6)) }), prev: addDays(f, -7), next: addDays(f, 7) }; }
    if (per === 'quarter') { const q = quarterStart(ref); return { from: q + '-01', to: monthEnd(shiftMonth(q, 2)), label: `${monthLabel(q)} – ${monthLabel(shiftMonth(q, 2))}`, prev: shiftMonth(q, -3) + '-01', next: shiftMonth(q, 3) + '-01' }; }
    const m = ref.slice(0, 7);
    return { from: m + '-01', to: monthEnd(m), label: monthLabel(m), prev: shiftMonth(m, -1) + '-01', next: shiftMonth(m, 1) + '-01' };
  }
  const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 86400000) + 1;
  // Sessioni svolte nel periodo (già iniziate, non annullate) con i conteggi:
  // gruppo presenti / assenti / senza risposta (contano come assenti), spot e recuperi confermati.
  function rpSessions(from, to, d) {
    const now = Date.now();
    const occ = {}, att = {}, sp = {};
    d.occ.forEach(o => { occ[`${o.tid}_${o.date}`] = o; });
    d.att.forEach(a => { att[`${a.tid}_${a.date}_${a.uid}`] = a.status; });
    d.spots.filter(s => s.status === 'ok').forEach(s => { (sp[`${s.tid}_${s.date}`] = sp[`${s.tid}_${s.date}`] || []).push(s); });
    return occurrences(from, daysBetween(from, to)).filter(({ tr, date }) => trStartMs(tr, date) <= now && !(occ[`${tr.id}_${date}`] || {}).cancelled).map(({ tr, date }) => {
      const g = extraDay(date) ? null : groupOf(tr.id, date.slice(0, 7)), uids = (g && g.uids) || [];
      const st = uids.map(u => att[`${tr.id}_${date}_${u}`]);
      const sps = sp[`${tr.id}_${date}`] || [];
      return { tr, date, enrolled: uids.length, in: st.filter(x => x === 'in').length, out: st.filter(x => x === 'out').length, nr: st.filter(x => !x).length,
        spot: sps.filter(s => !s.recovery).length, rec: sps.filter(s => s.recovery).length };
    });
  }
  // somma per chiave (allenamento, livello, allenatore, giorno)
  function rpGroup(list, keyOf, labelOf) {
    const m = new Map();
    list.forEach(s => {
      const k = keyOf(s);
      const r = m.get(k) || { key: k, label: labelOf(s), n: 0, enrolled: 0, in: 0, out: 0, nr: 0, spot: 0, rec: 0, cap: 0 };
      r.n++; r.enrolled += s.enrolled; r.in += s.in; r.out += s.out; r.nr += s.nr; r.spot += s.spot; r.rec += s.rec; r.cap += s.tr.max || 0;
      m.set(k, r);
    });
    return [...m.values()].map(r => Object.assign(r, { tot: r.in + r.spot + r.rec, avg: r.n ? (r.in + r.spot + r.rec) / r.n : 0,
      pct: r.enrolled ? r.in / r.enrolled : null, fill: r.cap ? (r.in + r.spot + r.rec) / r.cap : null }));
  }
  const pctTxt = v => (v == null ? '—' : `${Math.round(v * 100)}%`);
  const num1 = v => v.toLocaleString(I18n.locale(), { maximumFractionDigits: 1 });
  const RP_COLS = ['rpSessions', 'rpEnrolled', 'rpIn', 'rpOut', 'rpNoReply', 'rpSpot', 'rpRec', 'rpTotal', 'rpAvg', 'rpPct', 'rpFill'];
  const rpCells = r => [r.n, r.enrolled, r.in, r.out, r.nr, r.spot, r.rec, r.tot, num1(r.avg), pctTxt(r.pct), pctTxt(r.fill)];
  function rpTable(title, icon, rows) {
    return `<div class="card rp-card"><h2><i class="ti ti-${icon}" aria-hidden="true"></i> ${esc(title)}</h2>
      ${rows.length ? `<div class="table-wrap"><table class="table rp-table"><thead><tr><th></th>${RP_COLS.map(c => `<th class="num">${esc(t(c))}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr><th scope="row">${esc(r.label)}</th>${rpCells(r).map(v => `<td class="num">${esc(String(v))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      : `<p class="muted">${esc(t('rpNone'))}</p>`}</div>`;
  }
  function rpData() {
    const per = ui.rpPer || 'month', p = rpPeriod(per, ui.rpRef || todayStr());
    const d = rangeData(p.from, p.to);
    if (!d) return { per, p, loading: true };
    const ss = rpSessions(p.from, p.to, d);
    const byTr = rpGroup(ss, s => s.tr.id, s => `${trTitle(s.tr)} · ${trLabel(s.tr)}`);
    const byLvl = rpGroup(ss, s => s.tr.level, s => t('fpLevel_' + s.tr.level)).sort((a, b) => LEVELS.indexOf(a.key) - LEVELS.indexOf(b.key));
    const byCoach = rpGroup(ss, s => s.tr.coachUid || '', s => (s.tr.coachUid ? coachName(s.tr.coachUid) : t('rpNoCoach'))).sort((a, b) => a.label.localeCompare(b.label));
    const byDay = rpGroup(ss, s => s.tr.dow, s => { const x = dayName(s.tr.dow); return x.charAt(0).toUpperCase() + x.slice(1); }).sort((a, b) => a.key - b.key);
    return { per, p, ss, byTr, byLvl, byCoach, byDay, all: rpGroup(ss, () => 'all', () => t('rpAll'))[0] };
  }
  function viewReport() {
    const r = rpData();
    const head = `<div class="page-head row"><h1><i class="ti ti-report-analytics" aria-hidden="true"></i> ${esc(t('rpTitle'))}</h1>
        <a class="btn small" href="#/payments"><i class="ti ti-cash-register" aria-hidden="true"></i> ${esc(t('payAdminTitle'))} →</a></div>
      <div class="month-nav card">
        <div class="segmented" role="group">${['week', 'month', 'quarter'].map(k => `<button class="${r.per === k ? 'active' : ''}" aria-pressed="${r.per === k}" data-action="rp-per" data-p="${k}">${esc(t('rpPer_' + k))}</button>`).join('')}</div>
        <button class="btn small" data-action="rp-ref" data-d="${r.p.prev}" aria-label="${esc(t('prevPeriod'))}"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
        <strong>${esc(r.p.label)}</strong>
        <button class="btn small" data-action="rp-ref" data-d="${r.p.next}" aria-label="${esc(t('nextPeriod'))}"><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
      </div>`;
    if (r.loading) return head + `<div class="empty"><i class="ti ti-loader-2" aria-hidden="true"></i> ${esc(t('rpLoading'))}</div>`;
    const a = r.all || { n: 0, tot: 0, avg: 0, pct: null, fill: null };
    return head + `<p class="muted small">${esc(t('rpHelp'))}</p>
      <div class="stats-row">
        <div class="stat"><span>${esc(t('rpSessions'))}</span><strong>${a.n}</strong></div>
        <div class="stat"><span>${esc(t('rpTotal'))}</span><strong>${a.tot}</strong><small class="muted">${esc(t('rpAvgShort', { v: num1(a.avg) }))}</small></div>
        <div class="stat"><span>${esc(t('rpPct'))}</span><strong>${pctTxt(a.pct)}</strong></div>
        <div class="stat"><span>${esc(t('rpFill'))}</span><strong>${pctTxt(a.fill)}</strong></div>
      </div>
      ${r.ss.length ? `<div class="btn-row"><button class="btn primary" data-action="rp-xlsx"><i class="ti ti-file-spreadsheet" aria-hidden="true"></i> ${esc(t('rpExcel'))}</button></div>
      <div class="charts-2 card">
        ${barChart(t('rpChartDay'), r.byDay.map(x => ({ label: x.label.slice(0, 3), full: x.label, v: x.tot })), t('rpUnit'))}
        ${barChart(t('rpChartLevel'), r.byLvl.map(x => ({ label: x.label, v: x.tot })), t('rpUnit'))}
      </div>` : ''}
      ${rpTable(t('rpByTraining'), 'barbell', r.byTr)}
      ${rpTable(t('rpByLevel'), 'stairs', r.byLvl)}
      ${rpTable(t('rpByCoach'), 'whistle', r.byCoach)}
      ${rpTable(t('rpByDay'), 'calendar-week', r.byDay)}`;
  }

  // Ricavi per allenamento di un mese (ripartizione equa):
  // quota mensile divisa tra gli allenamenti del piano (trimestrale: importo / 3), spot e recuperi all'allenamento,
  // pacchetti: prezzo / numero di allenamenti per ogni allenamento scalato. "Da incassare" = quote e spot non pagati.
  function revenueRows(month, d) {
    const rows = new Map();
    const row = tid => { if (!rows.has(tid)) { const tr = trainingById(tid); rows.set(tid, { tid, label: tr ? `${trTitle(tr)} · ${trLabel(tr)}` : t('rpDeleted'), plans: 0, spot: 0, pack: 0, due: 0 }); } return rows.get(tid); };
    (S().plans || []).filter(p => p.month === month && (p.tids || []).length).forEach(p => {
      const pd = planPaid(p), amount = pd ? (pd.quarter ? (pd.amount || 0) / 3 : (pd.amount != null ? pd.amount : p.price || 0)) : (p.price || 0);
      p.tids.forEach(tid => { const r = row(tid); r.plans += amount / p.tids.length; if (!pd) r.due += amount / p.tids.length; });
    });
    d.spots.filter(s => s.status === 'ok' && s.date.slice(0, 7) === month && !s.packBack).forEach(s => {
      const r = row(s.tid);
      if (s.pack) { const k = packById(s.pack); r.pack += k && k.n ? (k.price || 0) / k.n : 0; }
      else { r.spot += s.price || 0; if (!s.paid && s.price) r.due += s.price; }
    });
    const round = v => Math.round(v * 100) / 100;
    return [...rows.values()].map(r => Object.assign(r, { plans: round(r.plans), spot: round(r.spot), pack: round(r.pack), due: round(r.due), tot: round(r.plans + r.spot + r.pack) }))
      .sort((a, b) => b.tot - a.tot);
  }
  function revenueCard(month) {
    const d = rangeData(month + '-01', monthEnd(month));
    if (!d) return `<div class="card"><h2><i class="ti ti-chart-pie" aria-hidden="true"></i> ${esc(t('revTitle', { m: monthLabel(month) }))}</h2><p class="muted">${esc(t('rpLoading'))}</p></div>`;
    const rows = revenueRows(month, d), sum = k => rows.reduce((s, r) => s + r[k], 0);
    return `<div class="card rp-card" id="revenue"><h2><i class="ti ti-chart-pie" aria-hidden="true"></i> ${esc(t('revTitle', { m: monthLabel(month) }))}</h2>
      <p class="muted small">${esc(t('revHelp'))}</p>
      ${rows.length ? `<div class="table-wrap"><table class="table rp-table"><thead><tr><th></th>${['revPlans', 'revSpot', 'revPack', 'revTotal', 'revDue'].map(c => `<th class="num">${esc(t(c))}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr><th scope="row">${esc(r.label)}</th>${[r.plans, r.spot, r.pack, r.tot, r.due].map(v => `<td class="num">${esc(euro(v))}</td>`).join('')}</tr>`).join('')}</tbody>
        <tfoot><tr><th scope="row">${esc(t('rpAll'))}</th>${['plans', 'spot', 'pack', 'tot', 'due'].map(k => `<td class="num"><b>${esc(euro(sum(k)))}</b></td>`).join('')}</tr></tfoot></table></div>`
        : `<p class="muted">${esc(t('rpNone'))}</p>`}
      <div class="btn-row"><button class="btn primary" data-action="backup-xlsx" data-m="${month}"><i class="ti ti-database-export" aria-hidden="true"></i> ${esc(t('backupBtn', { m: monthLabel(month) }))}</button></div>
      <p class="muted small">${esc(t('trBackupHelp'))}</p></div>`;
  }

  // ---------- file Excel (.xlsx) generato nel browser (JSZip, già incluso per le ricevute) ----------
  let xlZipPromise = null;
  function loadZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (!xlZipPromise) xlZipPromise = new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = 'referto/vendor/jszip.min.js'; sc.onload = () => resolve(window.JSZip); sc.onerror = () => { xlZipPromise = null; reject(new Error('zip')); };
      document.head.appendChild(sc);
    });
    return xlZipPromise;
  }
  const xmlEsc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const colName = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  // sheets = [{ name, rows: [[intestazioni], [valori]…], money: [indici delle colonne in euro] }]
  async function makeXlsx(sheets) {
    const JSZip = await loadZip(), z = new JSZip();
    const names = sheets.map((s, i) => xmlEsc(s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || `Foglio${i + 1}`));
    z.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
    z.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    z.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
    z.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    // stili: 0 normale, 1 intestazione in grassetto, 2 euro (#.##0,00 €)
    z.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00 &quot;€&quot;"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
    sheets.forEach((s, i) => {
      const money = new Set(s.money || []);
      const widths = (s.rows[0] || []).map((_, c) => Math.min(60, Math.max(8, ...s.rows.map(r => String(r[c] == null ? '' : r[c]).length + 2))));
      const body = s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
        const ref = colName(ci) + (ri + 1);
        if (v == null || v === '') return '';
        if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${ri && money.has(ci) ? ' s="2"' : ''}><v>${v}</v></c>`;
        return `<c r="${ref}" t="inlineStr"${ri ? '' : ' s="1"'}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
      }).join('')}</row>`).join('');
      z.file(`xl/worksheets/sheet${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${body}</sheetData></worksheet>`);
    });
    return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  const rpXlRows = list => [['', ...RP_COLS.map(c => t(c))]].concat(list.map(r => [r.label, r.n, r.enrolled, r.in, r.out, r.nr, r.spot, r.rec, r.tot, Math.round(r.avg * 10) / 10,
    r.pct == null ? '' : Math.round(r.pct * 1000) / 10, r.fill == null ? '' : Math.round(r.fill * 1000) / 10]));
  async function reportXlsx() {
    const r = rpData();
    if (r.loading) return;
    const sessions = [['Data', 'Allenamento', 'Livello', 'Allenatore', 'Iscritti', 'Presenti', 'Assenti', 'Senza risposta', 'Spot', 'Recuperi', 'Totale presenti']]
      .concat(r.ss.slice().sort((a, b) => (a.date + a.tr.from).localeCompare(b.date + b.tr.from)).map(s => [itDate(s.date), `${trTitle(s.tr)} ${s.tr.from}–${s.tr.to}`, t('fpLevel_' + s.tr.level),
        s.tr.coachUid ? coachName(s.tr.coachUid) : '', s.enrolled, s.in, s.out, s.nr, s.spot, s.rec, s.in + s.spot + s.rec]));
    const blob = await makeXlsx([
      { name: 'Per allenamento', rows: rpXlRows(r.byTr) }, { name: 'Per livello', rows: rpXlRows(r.byLvl) },
      { name: 'Per allenatore', rows: rpXlRows(r.byCoach) }, { name: 'Per giorno', rows: rpXlRows(r.byDay) }, { name: 'Sessioni', rows: sessions }]);
    saveBlob(blob, `report_presenze_${r.p.from}_${r.p.to}.xlsx`);
  }
  // Backup del mese: allenamenti, gruppi, piani, spot, pacchetti e ricavi per allenamento.
  async function backupXlsx(month) {
    const d = rangeData(month + '-01', monthEnd(month));
    if (!d) return;
    const trs = trainings(), PAYM = { cash: 'contanti', card: 'bancomat', transfer: 'bonifico' };
    const sheetTr = [['Allenamento', 'Giorno', 'Orario', 'Livello', 'Allenatore', 'Max persone', 'Campi', 'Iscritti nel mese']]
      .concat(trs.map(tr => [trTitle(tr), dayName(tr.dow), `${tr.from}–${tr.to}`, t('fpLevel_' + tr.level), tr.coachUid ? coachName(tr.coachUid) : '', tr.max || 0,
        (tr.courts || []).map(courtName).join(', '), ((groupOf(tr.id, month) || {}).uids || []).length]));
    const sheetGr = [['Allenamento', 'Orario', 'Corsista']];
    trs.forEach(tr => { const g = groupOf(tr.id, month); ((g && g.uids) || []).forEach(u => sheetGr.push([trTitle(tr), trLabel(tr), (g.names || {})[u] || coachName(u)])); });
    const plans = (S().plans || []).filter(p => p.month === month).sort((a, b) => coachName(a.uid).localeCompare(coachName(b.uid)));
    const sheetPl = [['Corsista', 'Allenamenti', 'Allenamenti a settimana', 'Prezzo', 'Prezzo manuale', 'Stato', 'Data pagamento', 'Modalità', 'Importo pagato', 'Ricevuta', 'Trimestrale']]
      .concat(plans.map(p => { const pd = planPaid(p); return [coachName(p.uid), planDesc(p).join(' / '), p.n || 0, p.price != null ? Number(p.price) : '', p.manual ? 'sì' : '',
        t('payState_' + payState(p)), pd ? itDate(pd.date) : '', pd ? PAYM[pd.method] || pd.method : '', pd && pd.amount != null ? pd.amount : '', pd && pd.rn ? pd.rn : '', pd && pd.quarter ? 'sì' : '']; }));
    const sps = d.spots.filter(s => s.date.slice(0, 7) === month && s.status === 'ok').sort((a, b) => a.date.localeCompare(b.date));
    const sheetSp = [['Data', 'Allenamento', 'Persona', 'Tipo', 'Prezzo', 'Pagato', 'Ricevuta']]
      .concat(sps.map(s => { const tr = trainingById(s.tid); return [itDate(s.date), tr ? trTitle(tr) : t('rpDeleted'), s.name || coachName(s.uid),
        s.pack ? (s.packBack ? 'pacchetto (restituito)' : 'pacchetto') : s.recovery ? 'recupero' : 'spot', s.pack ? 0 : s.price || 0, s.pack ? '' : s.paid ? 'sì' : 'no', s.paid && s.paid.rn ? s.paid.rn : '']; }));
    const sheetPk = [['Corsista', 'Allenamenti', 'Prezzo', 'Usati', 'Rimasti', 'Creato il', 'Pagato', 'Ricevuta']]
      .concat((S().packs || []).slice().sort((a, b) => (a.created || 0) - (b.created || 0)).map(k => [coachName(k.uid), k.n || 0, k.price || 0, k.used || 0, packLeft(k),
        itDate(new Date(k.created || 0).toLocaleDateString('sv')), k.paid ? 'sì' : 'no', k.paid && k.paid.rn ? k.paid.rn : '']));
    const rev = revenueRows(month, d);
    const sheetRv = [['Allenamento', 'Quote mensili', 'Spot e recuperi', 'Pacchetti', 'Totale', 'Da incassare']]
      .concat(rev.map(r => [r.label, r.plans, r.spot, r.pack, r.tot, r.due]))
      .concat([['Totale', ...['plans', 'spot', 'pack', 'tot', 'due'].map(k => Math.round(rev.reduce((s, r) => s + r[k], 0) * 100) / 100)]]);
    const blob = await makeXlsx([
      { name: 'Allenamenti', rows: sheetTr }, { name: 'Gruppi', rows: sheetGr }, { name: 'Piani', rows: sheetPl, money: [3, 8] },
      { name: 'Spot e recuperi', rows: sheetSp, money: [4] }, { name: 'Pacchetti', rows: sheetPk, money: [2] }, { name: 'Ricavi per allenamento', rows: sheetRv, money: [1, 2, 3, 4, 5] }]);
    saveBlob(blob, `backup_allenamenti_${month}.xlsx`);
  }
  const reportActions = {
    'rp-per': el => { ui.rpPer = el.dataset.p; render(); },
    'rp-ref': el => { ui.rpRef = el.dataset.d; render(); },
    'rp-xlsx': () => { reportXlsx().catch(e => { console.error(e); warn('regError', { code: e.message }); }); },
    'backup-xlsx': el => { backupXlsx(el.dataset.m).catch(e => { console.error(e); warn('regError', { code: e.message }); }); }
  };

  // ---------- profilo: statistiche delle attività (prenotazioni con grafici, allenamenti) ----------
  const dayShort = n => new Date(2024, 0, n).toLocaleDateString(I18n.locale(), { weekday: 'short' });   // 1 gen 2024 = lunedì
  const weekStart = d => addDays(d, 1 - dow(d));
  // Grafico a barre (una sola serie: niente legenda, il titolo dice cosa misura); valore sopra ogni barra,
  // dettaglio al passaggio del mouse e tabella equivalente per chi non vede il grafico.
  function barChart(title, rows, unit) {
    const max = Math.max(1, ...rows.map(r => r.v));
    return `<figure class="bar-fig"><figcaption>${esc(title)}</figcaption>
      <div class="bar-chart" role="img" aria-label="${esc(title + ': ' + rows.map(r => `${r.label} ${r.v}`).join(', '))}">
        ${rows.map(r => `<div class="bar-col" title="${esc(`${r.full || r.label}: ${r.v} ${unit}`)}">
          <span class="bar-val">${r.v || ''}</span><span class="bar" style="height:${Math.round((r.v / max) * 100)}%"></span><span class="bar-lbl">${esc(r.label)}</span></div>`).join('')}
      </div>
      <details class="bar-table"><summary>${esc(t('showTable'))}</summary><table class="table"><tbody>${rows.map(r => `<tr><td>${esc(r.full || r.label)}</td><td class="num">${r.v}</td></tr>`).join('')}</tbody></table></details>
    </figure>`;
  }
  function myStatsCard() {
    const m = member();
    if (!m) return '';
    const bks = (S().bookingsMine || []).filter(b => b.userId === m.uid).sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from));
    const per = ui.stPeriod || 'week', ref = ui.stRef || todayStr();
    const from = per === 'week' ? weekStart(ref) : ref.slice(0, 7) + '-01';
    const to = per === 'week' ? addDays(from, 7) : shiftMonth(ref.slice(0, 7), 1) + '-01';
    const inP = bks.filter(b => b.date >= from && b.date < to);
    const hours = list => list.reduce((s, b) => s + (toMin(b.to) - toMin(b.from)) / 60, 0);
    const byDay = [1, 2, 3, 4, 5, 6, 7].map(n => ({ label: dayShort(n), full: dayName(n), v: inP.filter(b => dow(b.date) === n).length }));
    const months = Array.from({ length: 12 }, (_, i) => shiftMonth(curMonth(), i - 11));
    const byMonth = months.map(mo => ({ label: new Date(mo + '-15T12:00').toLocaleDateString(I18n.locale(), { month: 'short' }), full: monthLabel(mo), v: bks.filter(b => b.date.slice(0, 7) === mo).length }));
    const pLabel = per === 'week' ? t('weekOf', { a: fmtDate(from), b: fmtDate(addDays(from, 6)) }) : monthLabel(ref.slice(0, 7));
    const step = per === 'week' ? 7 : 0;
    const prevRef = per === 'week' ? addDays(ref, -step) : shiftMonth(ref.slice(0, 7), -1) + '-01', nextRef = per === 'week' ? addDays(ref, step) : shiftMonth(ref.slice(0, 7), 1) + '-01';
    // allenamenti: risposte e spot del corsista (stagione in corso)
    const season = seasonOf(todayStr()), sFrom = `${season.slice(0, 4)}-09-01`;
    const att = (S().att || []).filter(x => x.uid === m.uid && x.date >= sFrom && x.date <= todayStr());
    const sp = (S().spots || []).filter(x => x.uid === m.uid && x.status === 'ok' && x.date >= sFrom && x.date <= todayStr());
    const trBlock = att.length || sp.length ? `<h3><i class="ti ti-barbell" aria-hidden="true"></i> ${esc(t('statTraining', { s: season }))}</h3>
      <div class="stats-row">
        <div class="stat"><span>${esc(t('statPresent'))}</span><strong>${att.filter(x => x.status === 'in').length}</strong></div>
        <div class="stat"><span>${esc(t('statAbsent'))}</span><strong>${att.filter(x => x.status === 'out').length}</strong></div>
        <div class="stat"><span>${esc(t('statSpots'))}</span><strong>${sp.filter(x => !x.recovery).length}</strong></div>
        <div class="stat"><span>${esc(t('statRecoveries'))}</span><strong>${sp.filter(x => x.recovery).length}</strong></div>
      </div>` : '';
    if (!bks.length && !trBlock) return '';
    return `<div class="card" id="my-stats">
      <h2><i class="ti ti-chart-bar" aria-hidden="true"></i> ${esc(t('myStats'))}</h2>
      ${bks.length ? `<div class="stats-row">
        <div class="stat"><span>${esc(t('statBookings'))}</span><strong>${bks.length}</strong><small class="muted">${esc(t('statHours', { h: hours(bks).toLocaleString(I18n.locale()) }))}</small></div>
        <div class="stat"><span>${esc(t('statPlayed'))}</span><strong>${bks.filter(b => isPastSlot(b.date, b.to)).length}</strong></div>
      </div>
      <div class="month-nav">
        <div class="segmented" role="group">${['week', 'month'].map(k => `<button class="${per === k ? 'active' : ''}" aria-pressed="${per === k}" data-action="st-period" data-p="${k}">${esc(t('per_' + k))}</button>`).join('')}</div>
        <button class="btn small" data-action="st-ref" data-d="${prevRef}" aria-label="${esc(t('prevPeriod'))}"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
        <strong>${esc(pLabel)}</strong>
        <button class="btn small" data-action="st-ref" data-d="${nextRef}" aria-label="${esc(t('nextPeriod'))}"><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
      </div>
      <div class="charts-2">
        ${barChart(t('chartByDay', { p: pLabel }), byDay, t('statBookingsUnit'))}
        ${barChart(t('chartByMonth'), byMonth, t('statBookingsUnit'))}
      </div>
      <h3>${esc(t('statDetail', { n: inP.length, p: pLabel }))}</h3>
      ${inP.length ? `<ul class="reg-list">${inP.map(b => `<li><span class="reg-names"><strong class="cap">${esc(longDate(b.date))}</strong> · ${b.from}–${b.to}<br><small class="muted">${esc(courtName(b.courtId))}${b.ch ? ` · ${esc(t('navChallenges'))}` : ''}</small></span></li>`).join('')}</ul>`
        : `<p class="muted small">${esc(t('statNone'))}</p>`}` : ''}
      ${trBlock}
    </div>`;
  }
  const statActions = {
    'st-period': el => { ui.stPeriod = el.dataset.p; render(); },
    'st-ref': el => { ui.stRef = el.dataset.d; render(); }
  };

  const trForms = {
    'tr-save': f => trSave(f),
    'self-profile': f => {
      const d = { first: f.first.value.trim(), last: f.last.value.trim(), gender: f.gender.value };
      if (!d.first || !d.last) return warn('errRegFields');
      window.Cloud.saveSelfProfile(d).then(() => { ui.flash = { text: t('selfProfileSaved') }; render(); }).catch(trErr);
    },
    'coach-add': f => {
      const uid = f.uid.value;
      if (!uid) return;
      window.Cloud.setCoach(uid, { all: f.all.value === '1', name: personName(memberByUid(uid)) }).then(() => { ui.flash = { text: t('coachAdded') }; render(); }).catch(e => warn('regError', { code: e.code || e.message }));
    },
    'grp-add': f => {
      const tid = f.dataset.tid, month = f.dataset.m, uid = f.uid.value, tr = trainingById(tid);
      if (!uid || !tr) return;
      const g = groupOf(tid, month);
      if (g && (g.uids || []).length >= tr.max && !confirmed('grpFullConfirm', { n: tr.max })) return;
      const a = athleteOf(uid), m = memberByUid(uid), s = seasonOf(todayStr());
      const ad = { id: uid, first: m.first, last: m.last, tess: Object.assign({}, (a && a.tess) || {}, { [s]: f.tess.checked }), updated: Date.now() };
      if (f.certExp.value) ad.certExp = f.certExp.value;
      if (!a) ad.created = Date.now();
      grpChange(tid, month, uid, true, ad).then(() => { ui.flash = { text: t('grpAdded', { n: personName(m) }) }; render(); }).catch(e => warn('regError', { code: e.code || e.message }));
    },
    'ath-new': f => {
      const m = memberByUid(f.uid.value);
      if (!m) return;
      const ad = { id: m.uid, first: m.first, last: m.last, tess: { [seasonOf(todayStr())]: f.tess.checked }, created: Date.now(), updated: Date.now() };
      if (f.certExp.value) ad.certExp = f.certExp.value;
      const tids = [...f.querySelectorAll('[name=tid]:checked')].map(x => x.value);
      setAthleteTrainings(m.uid, f.dataset.m, tids, ad).then(ok => { if (!ok) return; (ui.keep || {})['ath-new'] = false; ui.athEdit = m.uid; ui.flash = { text: t('athCreated') }; render(); })
        .catch(e => warn('regError', { code: e.code || e.message }));
    },
    'ath-trs': f => {
      const tids = [...f.querySelectorAll('[name=tid]:checked')].map(x => x.value);
      setAthleteTrainings(f.dataset.uid, f.dataset.m, tids, null).then(ok => { if (ok) { ui.flash = { text: t('athTrainingsSaved') }; render(); } })
        .catch(e => warn('regError', { code: e.code || e.message }));
    },
    'ath-save': f => {
      const uid = f.dataset.uid, a = athleteOf(uid) || {}, m = memberByUid(uid), s = seasonOf(todayStr());
      const cf = f.cf.value.trim().toUpperCase();
      const d = { birthPlace: f.birthPlace.value.trim(), birthDate: f.birthDate.value, city: f.city.value.trim(), address: f.address.value.trim(), cf,
        certExp: f.certExp.value, tess: Object.assign({}, a.tess || {}, { [s]: f.tess.checked }), updated: Date.now() };
      if (m) Object.assign(d, { first: m.first, last: m.last });
      window.Cloud.saveAthlete(uid, d).then(() => { ui.flash = { text: t('athSaved') }; render(); }).catch(e => warn('regError', { code: e.code || e.message }));
    },
    'plan-price': f => {
      const p = planOf(f.dataset.uid, f.dataset.m);
      if (!p) return;
      const v = f.price.value === '' ? null : Math.round(Number(f.price.value) * 100) / 100;
      window.Cloud.savePlan(Object.assign({}, p, { price: v, manual: true, updated: Date.now() })).then(() => { ui.flash = { text: t('saved') }; render(); }).catch(e => warn('regError', { code: e.code || e.message }));
    },
    'prices-save': f => {
      const n = x => (f[x].value === '' ? null : Math.round(Number(f[x].value) * 100) / 100);
      S().prices = { w1: n('w1'), w2: n('w2'), w3: n('w3'), w4: n('w4'), q1: n('q1'), q2: n('q2'), spot: n('spot') };
      commit(t('saved'));
    }
  };

  const trActions = {
    'tr-month': el => { ui.trMonth = el.dataset.m; render(); },
    'tr-edit': el => { ui.trEdit = el.dataset.id; render(); },
    'tr-edit-cancel': () => { ui.trEdit = null; render(); },
    'tr-delete': el => {
      const tr = trainingById(el.dataset.id);
      if (!tr || !confirmed('trDeleteConfirm', { n: trTitle(tr) + ' · ' + trLabel(tr) })) return;
      // si tolgono i gruppi da questo mese in poi (lo storico dei mesi passati resta)
      const month = curMonth();
      const gs = (S().groups || []).filter(g => g.tid === tr.id && g.month >= month);
      const rest = (S().groups || []).filter(g => !gs.includes(g));
      const plans = [];
      gs.forEach(g => (g.uids || []).forEach(uid => { const p = planFrom(uid, g.month, rest); if (p) plans.push(p); }));
      window.Cloud.deleteTraining(tr, gs, plans).then(() => { ui.flash = { text: t('trDeleted') }; render(); }).catch(e => warn('regError', { code: e.code || e.message }));
    },
    'tr-copy': el => {
      const month = el.dataset.m, prev = shiftMonth(month, -1);
      const add = trainings().filter(tr => !groupOf(tr.id, month) && groupOf(tr.id, prev)).map(tr => {
        const pg = groupOf(tr.id, prev);
        return { id: `${tr.id}_${month}`, tid: tr.id, month, uids: (pg.uids || []).slice(), names: Object.assign({}, pg.names || {}), coachUid: tr.coachUid || '', updated: Date.now() };
      });
      if (!add.length) return;
      const all = (S().groups || []).concat(add);
      const uids = [...new Set(add.flatMap(g => g.uids))];
      const plans = uids.map(uid => planFrom(uid, month, all)).filter(Boolean);
      window.Cloud.saveGroups(add, plans, []).then(() => { ui.flash = { text: t('trCopied', { n: add.length }) }; render(); }).catch(e => warn('regError', { code: e.code || e.message }));
    },
    'grp-remove': el => {
      const m = memberByUid(el.dataset.uid);
      if (!confirmed('grpRemoveConfirm', { n: m ? personName(m) : '?' })) return;
      grpChange(el.dataset.tid, el.dataset.m, el.dataset.uid, false).then(() => render()).catch(e => warn('regError', { code: e.code || e.message }));
    },
    'coach-remove': el => {
      if (!confirmed('coachRemoveConfirm', { n: coachName(el.dataset.uid) })) return;
      window.Cloud.setCoach(el.dataset.uid, null).then(() => render()).catch(e => warn('regError', { code: e.code || e.message }));
    },
    'ath-edit': el => { ui.athEdit = ui.athEdit === el.dataset.uid ? null : el.dataset.uid; render(); },
    'plan-auto': el => {
      const p = planOf(el.dataset.uid, el.dataset.m);
      if (!p) return;
      window.Cloud.savePlan(Object.assign({}, p, { price: priceFor(p.n), manual: false, updated: Date.now() })).then(() => render()).catch(e => warn('regError', { code: e.code || e.message }));
    }
  };

  // ====================================================================
  // GIOCO LIBERO: sessioni aperte dall'admin; gli utenti registrati partecipano (e possono cancellarsi).
  // Tutti vedono solo quanti uomini e quante donne; i nomi e lo storico li vede solo l'admin.
  // ====================================================================
  const FP_LEVELS = ['start', 'inter', 'high', 'pro'];
  const fpMine = fp => (S().fpreg || []).find(r => r.fid === fp.id && r.uid === myUid());
  const fpRegs = fp => (S().fpreg || []).filter(r => r.fid === fp.id);
  const fpEnded = fp => Date.now() > (fp.endMs || 0);
  // iscrizione e cancellazione fino a un'ora prima dell'inizio
  const fpJoinOpen = fp => Date.now() < (fp.startMs || 0) - 3600000;
  const fpLevelsText = fp => (!fp.levels || !fp.levels.length || fp.levels.includes('all') ? t('fpAll') : fp.levels.map(l => t('fpLevel_' + l)).join(' · '));
  // Blocchi da un'ora dall'inizio alla fine (l'ultimo può essere più corto).
  const fpBlocks = fp => { const out = []; for (let x = fp.from; x < fp.to;) { const y = addMin(x, 60) < fp.to ? addMin(x, 60) : fp.to; out.push({ from: x, to: y }); x = y; } return out; };
  const fpAnons = fp => (S().fpanon || []).filter(a => a.fp === fp.id);
  // "12:00–15:00, 16:00–17:00": blocchi scelti uniti quando sono di seguito
  const fpRangeText = (fp, bl) => {
    const set = new Set(bl || []), parts = [];
    fpBlocks(fp).forEach(b => { if (!set.has(b.from)) return; const last = parts[parts.length - 1]; if (last && last.to === b.from) last.to = b.to; else parts.push(Object.assign({}, b)); });
    return parts.map(p => `${p.from}–${p.to}`).join(', ');
  };
  const fpBlockChecks = (fp, bl) => `<fieldset class="fp-pick"><legend>${esc(t('fpPickBlocks'))}</legend>
      ${fpBlocks(fp).map(b => `<label class="check"><input type="checkbox" name="bl" value="${b.from}" ${(bl || []).includes(b.from) ? 'checked' : ''}> ${b.from}–${b.to}</label>`).join('')}</fieldset>`;
  const fpWhen = ms => (ms ? new Date(ms).toLocaleString(I18n.locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

  // Presenze per blocco: tutti vedono solo quanti uomini e quante donne (dalle presenze anonime).
  function fpBlocksTable(fp) {
    const an = fpAnons(fp);
    const rows = fpBlocks(fp).map(b => {
      const here = an.filter(a => (a.bl || []).includes(b.from)), m = here.filter(a => a.g !== 'F').length, f = here.length - m;
      return `<tr><td>${b.from}–${b.to}</td><td class="num">${m}</td><td class="num">${f}</td><td class="num"><strong>${m + f}</strong></td></tr>`;
    }).join('');
    return `<div class="table-wrap fp-blocks"><table class="table"><thead><tr><th>${esc(t('fpBlockCol'))}</th><th class="num"><i class="ti ti-man" aria-label="${esc(t('fpMen'))}"></i></th><th class="num"><i class="ti ti-woman" aria-label="${esc(t('fpWomen'))}"></i></th><th class="num">${esc(t('fpTotal'))}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function fpCard(fp) {
    const m = member(), mine = fpMine(fp), ended = fpEnded(fp), inNow = !!(mine && mine.status === 'in');
    const counts = `<p class="fp-counts"><span><i class="ti ti-man" aria-hidden="true"></i> <strong>${fp.m || 0}</strong> ${esc(t(fp.m === 1 ? 'fpMan' : 'fpMen'))}</span>
      <span><i class="ti ti-woman" aria-hidden="true"></i> <strong>${fp.f || 0}</strong> ${esc(t(fp.f === 1 ? 'fpWoman' : 'fpWomen'))}</span></p>${fp.blocks ? fpBlocksTable(fp) : ''}`;
    let action = '';
    if (ended) action = `<p class="muted small">${esc(t('fpEnded'))}</p>`;
    else if (m) {
      if (needsVerify()) action = `<p class="note warn">${esc(t('verifyFirst'))}</p>`;
      else if (inNow) action = `<p class="note ok"><i class="ti ti-circle-check" aria-hidden="true"></i> ${esc(t('fpYouIn'))}${mine.level && mine.level !== 'none' ? ` · ${esc(t('fpLevel_' + mine.level))}` : ''}${fp.blocks ? `<br>${esc(t('fpYourBlocks', { b: fpRangeText(fp, mine.bl) || '—' }))}` : ''}</p>
        ${fp.blocks && fpJoinOpen(fp) ? `<details class="sub-form" data-keep="fpbl-${fp.id}" ${keepOpen('fpbl-' + fp.id)}><summary><i class="ti ti-clock-edit" aria-hidden="true"></i> ${esc(t('fpChangeBlocks'))}</summary>
          <form data-form="fp-blocks" data-id="${fp.id}">${fpBlockChecks(fp, mine.bl)}<button class="btn primary">${esc(t('fpSaveBlocks'))}</button></form></details>` : ''}
        ${fpJoinOpen(fp) ? `<button class="btn danger" data-action="fp-leave" data-id="${fp.id}">${esc(t('fpLeave'))}</button>
          <small class="muted">${esc(t('fpLeaveUntil', { d: fpWhen((fp.startMs || 0) - 3600000) }))}</small>` : `<p class="muted small">${esc(t('fpLeaveClosed'))}</p>`}`;
      else if (!fpJoinOpen(fp)) action = `<p class="muted small"><i class="ti ti-lock" aria-hidden="true"></i> ${esc(t('fpJoinClosed'))}</p>`;
      else {
        const opts = (!fp.levels || fp.levels.includes('all') ? FP_LEVELS : fp.levels.filter(l => FP_LEVELS.includes(l)));
        action = `<form class="fp-join" data-form="fp-join" data-id="${fp.id}">
          ${fp.blocks ? fpBlockChecks(fp, []) : ''}
          <label>${esc(t('fpMyLevel'))}<select name="level"><option value="none">-</option>${opts.map(l => `<option value="${l}">${esc(t('fpLevel_' + l))}</option>`).join('')}</select></label>
          <button class="btn primary big"><i class="ti ti-check" aria-hidden="true"></i> ${esc(t('fpJoin'))}</button>
          <small class="muted">${esc(t('fpJoinUntil', { d: fpWhen((fp.startMs || 0) - 3600000) }))}</small></form>`;
      }
    } else if (!admin() && !scorer()) action = `<p class="muted small">${esc(t('fpLoginFirst'))}</p><a class="btn small" href="#/settings">${esc(t('loginOrRegister'))}</a>`;
    let adminBox = '';
    if (admin()) {
      const regs = fpRegs(fp), ins = regs.filter(r => r.status === 'in').sort((a, b) => a.at - b.at), outs = regs.filter(r => r.status === 'out').sort((a, b) => b.outAt - a.outAt);
      const row = r => `<li><span class="reg-names"><strong>${esc(r.name)}</strong> <span class="badge g-${r.gender}">${esc(r.gender)}</span>
        ${r.level && r.level !== 'none' ? `<span class="badge lvl-${r.level}">${esc(t('fpLevel_' + r.level))}</span>` : ''}${fp.blocks && r.status === 'in' ? ` <small><i class="ti ti-clock" aria-hidden="true"></i> ${esc(fpRangeText(fp, r.bl) || '—')}</small>` : ''}<br>
        <small class="muted">${r.status === 'in' ? esc(t('fpJoinedAt', { d: fpWhen(r.at) })) : esc(t('fpLeftAt', { a: fpWhen(r.at), b: fpWhen(r.outAt) }))}${(r.n || 1) > 1 ? ` · ${esc(t('fpTimes', { n: r.n }))}` : ''}</small></span></li>`;
      adminBox = `<details class="sub-form fp-admin" data-keep="fp-${fp.id}" ${keepOpen('fp-' + fp.id)}><summary><i class="ti ti-list-details" aria-hidden="true"></i> ${esc(t('fpReport', { n: ins.length, c: outs.length }))}</summary>
        ${fp.blocks ? `<h4>${esc(t('fpByBlock'))}</h4><ul class="plain-list fp-byblock">${fpBlocks(fp).map(b => { const who = ins.filter(r => (r.bl || []).includes(b.from)); return `<li><b>${b.from}–${b.to}</b> (${who.length}): ${who.length ? who.map(r => esc(r.name)).join(', ') : '—'}</li>`; }).join('')}</ul>` : ''}
        <h4>${esc(t('fpParticipants'))} (${ins.length})</h4>${ins.length ? `<ul class="reg-list">${ins.map(row).join('')}</ul>` : `<p class="muted small">${esc(t('fpNone'))}</p>`}
        <h4>${esc(t('fpCancelled'))} (${outs.length})</h4>${outs.length ? `<ul class="reg-list">${outs.map(row).join('')}</ul>` : `<p class="muted small">${esc(t('fpNone'))}</p>`}
      </details>
      <div class="btn-row fp-admin-actions"><button class="btn small" data-action="fp-edit" data-id="${fp.id}"><i class="ti ti-pencil" aria-hidden="true"></i> ${esc(t('fpEdit'))}</button>
        <button class="btn small danger" data-action="fp-delete" data-id="${fp.id}"><i class="ti ti-trash" aria-hidden="true"></i> ${esc(t('fpDelete'))}</button></div>`;
    }
    return `<div class="card fp-card ${inNow ? 'mine' : ''}" id="fp-${fp.id}">
      <div class="ch-head"><span class="badge">${esc(fpLevelsText(fp))}</span>${ended ? ` <span class="badge">${esc(t('fpEndedBadge'))}</span>` : ''}</div>
      <h3>${esc(fp.name)}</h3>
      <p class="muted cap"><i class="ti ti-calendar" aria-hidden="true"></i> ${esc(longDate(fp.date))} · ${fp.from}–${fp.to}</p>
      ${fp.courts && fp.courts.length ? `<p class="muted small"><i class="ti ti-layout-grid" aria-hidden="true"></i> ${esc(t('fpCourtsLine', { c: fpCourtsText(fp) }))}</p>` : ''}
      ${admin() && ui.fpEdit === fp.id ? fpForm(fp) : `${counts}${action}${adminBox}`}
    </div>`;
  }

  // Modulo di creazione (fp = null) o di modifica di una sessione.
  function fpForm(fp) {
    const nCourts = (S().courts || []).filter(c => c.visible).length;
    const today = todayStr(), v = fp || { name: '', date: today, from: '18:00', to: '21:00', levels: ['all'], nCourts: Math.min(1, nCourts) };
    const lv = v.levels || ['all'], all = lv.includes('all');
    const form = `<form class="grid-form" data-form="fp-save" data-id="${fp ? fp.id : ''}">
        <label class="span-all">${esc(t('fpName'))}<input name="name" required maxlength="80" value="${esc(v.name)}" placeholder="${esc(t('fpNamePh'))}"></label>
        <label>${esc(t('bkDay'))}<input type="date" name="date" required min="${fp ? '' : today}" value="${v.date}"></label>
        <label>${esc(t('courtFrom'))}<select name="from">${HALF_HOURS.slice(0, -1).map(h => `<option ${h === v.from ? 'selected' : ''}>${h}</option>`).join('')}</select></label>
        <label>${esc(t('courtTo'))}<select name="to">${HALF_HOURS.slice(1).map(h => `<option ${h === v.to ? 'selected' : ''}>${h}</option>`).join('')}</select></label>
        <label>${esc(t('fpCourts'))}<input type="number" name="nCourts" min="0" max="${nCourts}" value="${v.nCourts != null ? v.nCourts : 0}" inputmode="numeric">
          <small class="muted">${esc(t('fpCourtsHelp', { n: nCourts }))}</small></label>
        <label class="check span-all"><input type="checkbox" name="blocks" ${v.blocks ? 'checked' : ''}> ${esc(t('fpBlocksOpt'))} <small class="muted">${esc(t('fpBlocksHelp'))}</small></label>
        <fieldset class="span-all fp-levels"><legend>${esc(t('fpLevels'))}</legend>
          <label class="check"><input type="checkbox" name="lv" value="all" ${all ? 'checked' : ''} data-change="fp-all"> ${esc(t('fpAll'))}</label>
          ${FP_LEVELS.map(l => `<label class="check"><input type="checkbox" name="lv" value="${l}" ${!all && lv.includes(l) ? 'checked' : ''} data-change="fp-lv"> ${esc(t('fpLevel_' + l))}</label>`).join('')}
        </fieldset>
        <div class="form-actions span-all">${fp ? `<button type="button" class="btn" data-action="fp-edit-cancel" data-id="${fp.id}">${esc(t('cancel'))}</button>` : ''}
          <button class="btn primary">${esc(t(fp ? 'save' : 'fpCreate'))}</button></div>
      </form>`;
    if (fp) return form;
    return `<details class="card sub-form" data-keep="fp-new" ${keepOpen('fp-new')}><summary><i class="ti ti-plus" aria-hidden="true"></i> ${esc(t('fpNew'))}</summary>${form}</details>`;
  }

  // Campi per la sessione: per ogni campo visibile si prendono le mezz'ore della fascia in cui è aperto e libero
  // (le prenotazioni già fatte restano; i blocchi della sessione stessa contano come liberi).
  // Restituisce i tratti liberi [{ courtId, from, to }] degli n campi con più tempo libero, o null se non bastano.
  function fpFreeCourts(date, from, to, n, own) {
    const mine = new Set((own || []).map(c => c.gid));
    const had = id => ((own || []).some(c => c.courtId === id) ? 1 : 0);
    const cands = (S().courts || []).filter(c => c.visible).map((c, idx) => {
      const h = courtHours(c, date), segs = [];
      if (h) {
        const a = from > h.from ? from : h.from, z = to < h.to ? to : h.to;
        for (let x = a; x < z; x = addMin(x, 30)) {
          const b = bookingAt(c.id, date, x);
          if (b && !mine.has(b.id)) continue;
          const last = segs[segs.length - 1];
          if (last && last.to === x) last.to = addMin(x, 30); else segs.push({ courtId: c.id, from: x, to: addMin(x, 30) });
        }
      }
      return { c, idx, segs, mins: segs.reduce((s, g) => s + toMin(g.to) - toMin(g.from), 0) };
    }).filter(x => x.mins > 0);
    // prima i campi che la sessione aveva già, poi quelli con più tempo libero, poi l'ordine dei campi
    cands.sort((a, b) => had(b.c.id) - had(a.c.id) || b.mins - a.mins || a.idx - b.idx);
    if (cands.length < n) return null;
    return cands.slice(0, n).sort((a, b) => a.idx - b.idx).flatMap(x => x.segs);
  }

  // "Campo 1 (10:30–15:00), Campo 2": tra parentesi solo i tratti diversi dalla fascia della sessione.
  function fpCourtsText(fp) {
    const by = {};
    (fp.courts || []).forEach(c => { (by[c.courtId] = by[c.courtId] || []).push(c); });
    return Object.entries(by).map(([id, segs]) => {
      const full = segs.length === 1 && (segs[0].from || fp.from) === fp.from && (segs[0].to || fp.to) === fp.to;
      return courtName(id) + (full ? '' : ` (${segs.map(g => `${g.from}–${g.to}`).join(', ')})`);
    }).join(', ');
  }

  function fpSave(f) {
    const old = f.dataset.id ? fpById(f.dataset.id) : null;
    const levels = [...f.querySelectorAll('[name=lv]:checked')].map(x => x.value);
    const d = { name: f.name.value.trim(), date: f.date.value, from: f.from.value, to: f.to.value, levels: levels.includes('all') || !levels.length ? ['all'] : levels,
      nCourts: Math.max(0, parseInt(f.nCourts.value, 10) || 0), blocks: f.blocks.checked };
    if (!d.name || !d.date) return warn('errRegFields');
    if (d.to <= d.from) return warn('fpTimeErr');
    d.startMs = new Date(`${d.date}T${d.from}`).getTime();
    d.endMs = new Date(`${d.date}T${d.to === '24:00' ? '23:59' : d.to}`).getTime();
    const own = old && old.date === d.date ? old.courts || [] : [];
    const picked = d.nCourts ? fpFreeCourts(d.date, d.from, d.to, d.nCourts, own) : [];
    if (!picked) return warn('fpNoCourts', { n: d.nCourts });
    // Avviso se qualche campo non è libero per tutta la fascia (chiuso o già prenotato in qualche orario).
    const gaps = [];
    [...new Set(picked.map(g => g.courtId))].forEach(id => {
      const c = courtById(id), h = courtHours(c, d.date), mine = picked.filter(g => g.courtId === id);
      let cur = null;
      for (let x = d.from; x < d.to; x = addMin(x, 30)) {
        const why = mine.some(g => g.from <= x && x < g.to) ? null : h && x >= h.from && x < h.to ? 'fpGapBusy' : 'fpGapClosed';
        if (why && cur && cur.why === why && cur.b === x) cur.b = addMin(x, 30);
        else if (why) gaps.push(cur = { c: c.name, a: x, b: addMin(x, 30), why });
        else cur = null;
      }
    });
    if (gaps.length && !confirmed('fpPartialConfirm', { list: gaps.map(g => '• ' + t(g.why, g)).join('\n') })) return;
    // stesso campo della sessione precedente: si tiene la stessa prenotazione (gid)
    d.courts = picked.map(g => { const o = own.find(x => x.courtId === g.courtId && (x.from || old.from) === g.from && (x.to || old.to) === g.to); return Object.assign({}, g, { gid: o ? o.gid : Store.uid('g') }); });
    window.Cloud.saveFreeplay(old, d).then(() => {
      if (old) ui.fpEdit = null; else (ui.keep || {})['fp-new'] = false;
      ui.flash = { text: t(old ? 'fpSaved' : 'fpCreated') + (d.courts.length ? ' ' + t('fpCourtsTaken', { c: fpCourtsText(d) }) : '') };
      render();
    }).catch(fpErr);
  }

  function viewFreeplay() {
    const list = (S().freeplay || []).slice().sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from));
    const next = list.filter(fp => !fpEnded(fp)), past = admin() ? list.filter(fpEnded).reverse() : [];
    return `${verifyNotice()}
      <div class="page-head"><h1><i class="ti ti-ball-volleyball" aria-hidden="true"></i> ${esc(t('fpTitle'))}</h1><p class="muted">${esc(t('fpIntro'))}</p></div>
      ${admin() ? fpForm(null) : ''}
      ${next.length ? `<div class="ch-grid">${next.map(fpCard).join('')}</div>` : `<div class="empty"><i class="ti ti-ball-volleyball" aria-hidden="true"></i> ${esc(t('fpNoSessions'))}</div>`}
      ${past.length ? `<section class="feat-block"><h2>${esc(t('fpPast'))}</h2><div class="ch-grid">${past.map(fpCard).join('')}</div></section>` : ''}`;
  }

  // Prima pagina: le prossime sessioni di gioco libero (con i contatori).
  function freeplayHome() {
    const next = (S().freeplay || []).filter(fp => !fpEnded(fp)).sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from)).slice(0, 3);
    if (!next.length) return '';
    return `<section class="feat-block">
      <div class="page-head row"><h2><i class="ti ti-ball-volleyball" aria-hidden="true"></i> ${esc(t('fpTitle'))}</h2><a class="btn small" href="#/free">${esc(t('fpAllSessions'))} →</a></div>
      <div class="ch-grid">${next.map(fpCard).join('')}</div></section>`;
  }

  const fpById = id => (S().freeplay || []).find(x => x.id === id);
  const fpErr = e => warn(e && e.code === 'permission-denied' ? 'fpDenied' : 'regError', { code: (e && (e.code || e.message)) || '' });

  // ---------- profilo dell'utente ----------
  function viewProfile() {
    const m = member();
    if (!m) return `<div class="page-head"><h1>${esc(t('profile'))}</h1></div><div class="card"><p>${esc(t('regLoginFirst'))}</p><a class="btn primary" href="#/settings">${esc(t('loginOrRegister'))}</a></div>`;
    const pl = memberPlayer(m);
    const hist = pl ? L.playerHistory(S(), pl.id) : [];
    const total = hist.reduce((s, h) => s + h.pts, 0);
    const played = pl ? playedCount(pl.id) : 0;
    const rw = rewardFor(played);
    const th = S().rewards || {};
    const next = REWARDS.find(([k]) => Number(th[k]) > played);
    const upcoming = (S().registrations || []).filter(x => x.uids && x.uids.includes(m.uid))
      .map(x => ({ x, tour: tourById(x.tid) })).filter(o => o.tour && !o.tour.closed && msOf(o.tour.reg ? o.tour.reg.startAt : o.tour.start) > nowMs() - 86400000 * 3)
      .sort((a, b) => msOf(a.tour.reg && a.tour.reg.startAt) - msOf(b.tour.reg && b.tour.reg.startAt));
    const editing = ui.editProfile;
    const myBk = myBookings(m.uid);
    return `
      ${privacyAlert()}
      ${certAlerts()}
      ${bookingAlerts()}
      ${verifyNotice()}
      ${banNotice('tour')}
      ${banNotice('book')}
      <div class="page-head"><h1><i class="ti ti-user" aria-hidden="true"></i> ${esc(personName(m))}</h1>
        <p class="meta"><span class="badge g-${m.gender}">${esc(t(m.gender === 'F' ? 'female' : 'male'))}</span> <span class="muted">${esc(m.email)}</span></p>
        ${(S().nicks || {})[m.uid] ? `<p class="muted small">${esc(t('nickShownAs', { n: S().nicks[m.uid] }))}</p>` : ''}</div>
      ${editing ? `<form class="card grid-form" data-form="profile-save">
          <h2 class="span-all">${esc(t('editProfile'))}</h2>
          <label>${esc(t('firstName'))}<input name="first" required maxlength="60" value="${esc(m.first)}"></label>
          <label>${esc(t('lastName'))}<input name="last" required maxlength="60" value="${esc(m.last)}"></label>
          <label>${esc(t('gender'))}<select name="gender"><option value="M" ${sel(m.gender, 'M')}>${esc(t('male'))}</option><option value="F" ${sel(m.gender, 'F')}>${esc(t('female'))}</option></select></label>
          <div class="form-actions span-all"><button type="button" class="btn" data-action="profile-cancel">${esc(t('cancel'))}</button><button class="btn primary">${esc(t('save'))}</button></div>
        </form>` : ''}
      <div class="stats-row">
        <div class="stat"><span>${esc(t('tournamentsPlayed'))}</span><strong>${played}</strong></div>
        <div class="stat"><span>${esc(t('totalPoints'))}</span><strong>${fmtPts(total)}</strong></div>
        <div class="stat"><span>${esc(t('reward'))}</span><strong>${rw ? `${rw.icon} ${esc(t('rw_' + rw.key))}` : '—'}</strong>
          ${next ? `<small class="muted">${esc(t('rewardNext', { n: Number(th[next[0]]) - played, r: t('rw_' + next[0]) }))} ${next[1]}</small>` : ''}</div>
        ${bookRewardStat(m.uid)}
      </div>
      ${myStatsCard()}
      ${myTrainingCard()}
      ${myReceiptsCard()}
      ${privacyCard()}
      <div class="card">
        <h2><i class="ti ti-calendar-time" aria-hidden="true"></i> ${esc(t('bkMyNext'))}</h2>
        ${myBk.length ? `<ul class="reg-list">${myBk.map(bookingItem).join('')}</ul>` : `<p class="muted">${esc(t('bkNoMine'))}</p>`}
        <a class="btn" href="#/book">${esc(t('bkGo'))} →</a>
      </div>
      <div class="card">
        <h2><i class="ti ti-calendar-event" aria-hidden="true"></i> ${esc(t('myRegistrations'))}</h2>
        ${upcoming.length ? `<ul class="reg-list">${upcoming.map(({ x, tour }) => {
          const start = msOf(tour.reg ? tour.reg.startAt : tour.start);
          const canCancel = start - nowMs() > 86400000;
          const pos = tour.reg ? regsOf(tour).indexOf(x) : -1;
          return `<li>
            <span class="reg-names"><a href="#/t/${tour.id}"><strong>${esc(tour.name)}</strong></a><br>
              <small class="muted">${esc(fmtDateTime(tour.reg ? tour.reg.startAt : tour.start))} · ${esc(personLabel(x.p1))} · ${esc(personLabel(x.p2))}</small>
              ${tour.reg && pos >= tour.reg.maxTeams ? `<br><span class="badge">${esc(t('waitingList'))}</span>` : `<br><span class="badge st-done">${esc(t('regConfirmedBadge'))}</span>`}</span>
            ${canCancel ? `<button class="btn small danger" data-action="reg-cancel" data-id="${x.id}">${esc(t('regCancel'))}</button>`
              : `<small class="note warn">${esc(t('regCancelLate'))}</small>`}
          </li>`; }).join('')}</ul>` : `<p class="muted">${esc(t('noMyRegs'))} <a href="#/tournaments">${esc(t('tournaments'))} →</a></p>`}
      </div>
      <div class="card">
        <h2><i class="ti ti-trophy" aria-hidden="true"></i> ${esc(t('myHistory'))}</h2>
        ${hist.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>${esc(t('tournament'))}</th><th class="num">${esc(t('place'))}</th><th class="num">${esc(t('points'))}</th></tr></thead>
          <tbody>${hist.map(h => `<tr><td><a href="#/t/${h.t.id}/final">${esc(h.t.name)}</a><br><small class="muted">${esc(fmtDate(h.t.start))} · ${esc(playerFull(player(h.partner)))}</small></td>
            <td class="num">${medal(h.place)}</td><td class="num"><strong>${fmtPts(h.pts)}</strong></td></tr>`).join('')}</tbody>
          <tfoot><tr><td><strong>${esc(t('total'))}</strong></td><td></td><td class="num"><strong>${fmtPts(total)}</strong></td></tr></tfoot>
        </table></div>` : `<p class="muted">${esc(t('noHistory'))}</p>`}
      </div>
      <div class="btn-row">
        ${editing ? '' : `<button class="btn" data-action="profile-edit"><i class="ti ti-pencil" aria-hidden="true"></i> ${esc(t('editProfile'))}</button>`}
        <button class="btn" data-action="logout">${esc(t('logout'))}</button>
      </div>`;
  }

  // ---------- messaggi dell'admin ----------
  const unreadMessages = () => {
    const m = member();
    if (!m) return [];
    const read = new Set(S().inbox || []);
    return (S().messages || []).filter(x => !read.has(x.id) && (x.all || (x.to || []).includes(m.uid)));
  };

  function messageAlerts() {
    return unreadMessages().map(x => `<div class="msg-alert" role="alert">
      <div class="msg-head"><strong><i class="ti ti-bell-ringing" aria-hidden="true"></i> ${esc(x.title || t('msgAlert'))}</strong>
        <small>${esc(new Date(x.created).toLocaleString(I18n.locale(), { dateStyle: 'medium', timeStyle: 'short' }))}</small></div>
      <div class="msg-text">${richText(x.text || '')}</div>
      <button class="btn small" data-action="msg-read" data-id="${x.id}"><i class="ti ti-check" aria-hidden="true"></i> ${esc(t('msgRead'))}</button>
    </div>`).join('');
  }

  function viewMessages() {
    const mem = (S().members || []).slice().sort((a, b) => personName(a).localeCompare(personName(b)));
    const tours = S().tournaments.filter(tr => tr.reg).sort((a, b) => (b.start || '').localeCompare(a.start || ''));
    const target = ui.msgTarget || 'users';
    const f = L.norm(ui.msgFilter || '');
    const sent = S().messages || [];
    const who = x => x.all ? t('msgToAll') : x.tid ? t('msgToTour', { t: (tourById(x.tid) || {}).name || '?', n: (x.to || []).length }) : t('msgToN', { n: (x.to || []).length });
    return `
      <div class="page-head"><a class="back" href="#/settings">← ${esc(t('settings'))}</a><h1><i class="ti ti-mail" aria-hidden="true"></i> ${esc(t('messages'))}</h1>
        <p class="muted">${esc(t('messagesIntro'))}</p></div>
      <form class="card grid-form" data-form="msg-send">
        <h2 class="span-all">${esc(t('msgNew'))}</h2>
        <div class="segmented wrap span-all" role="group">
          ${[['users', 'msgTargetUsers'], ['all', 'msgTargetAll'], ['tour', 'msgTargetTour']].map(([v, k]) => `<button type="button" data-action="msg-target" data-v="${v}" aria-pressed="${target === v}">${esc(t(k))}</button>`).join('')}
        </div>
        ${target === 'users' ? `<label class="span-all">${esc(t('search'))}<input type="search" value="${esc(ui.msgFilter || '')}" data-change="msg-filter"></label>
          <div class="msg-users span-all">${mem.filter(x => !f || L.norm(personName(x)).includes(f)).map(x => `<label class="check"><input type="checkbox" name="to" value="${x.uid}" ${(ui.msgTo || []).includes(x.uid) ? 'checked' : ''} data-change="msg-to"> ${esc(personName(x))}</label>`).join('') || `<p class="muted">${esc(t('noMembers'))}</p>`}</div>` : ''}
        ${target === 'all' ? `<p class="note span-all">${esc(t('msgAllNote', { n: mem.length }))}</p>` : ''}
        ${target === 'tour' ? `<label class="span-all">${esc(t('tournament'))}<select name="tid">${tours.map(tr => `<option value="${tr.id}">${esc(tr.name)} (${regsOf(tr).length})</option>`).join('')}</select></label>` : ''}
        <label class="span-all">${esc(t('edTitle'))}<input name="title" maxlength="120"></label>
        <label class="span-all">${esc(t('edText'))}<textarea name="text" rows="5" maxlength="4000" required></textarea></label>
        <div class="form-actions span-all"><button class="btn primary"><i class="ti ti-send" aria-hidden="true"></i> ${esc(t('msgSend'))}</button></div>
      </form>
      <div class="card">
        <h2>${esc(t('msgSent'))} (${sent.length})</h2>
        ${sent.length ? `<ul class="reg-list">${sent.map(x => `<li><span class="reg-names"><strong>${esc(x.title || t('msgAlert'))}</strong> <small class="muted">· ${esc(who(x))} · ${esc(new Date(x.created).toLocaleString(I18n.locale(), { dateStyle: 'short', timeStyle: 'short' }))}</small><br><small>${esc((x.text || '').slice(0, 140))}</small></span>
          <button class="icon-btn" data-action="msg-delete" data-id="${x.id}" title="${esc(t('remove'))}" aria-label="${esc(t('remove'))}">✕</button></li>`).join('')}</ul>` : `<p class="muted">${esc(t('msgNone'))}</p>`}
      </div>`;
  }

  function sendMessageForm(f) {
    const target = ui.msgTarget || 'users';
    const msg = { title: f.title.value.trim(), text: f.text.value.trim(), all: false, to: [] };
    if (!msg.text) return warn('errMsgText');
    if (target === 'all') msg.all = true;
    else if (target === 'tour') {
      const tour = tourById(f.tid.value);
      if (!tour) return warn('errMsgTo');
      msg.tid = tour.id;
      const uids = new Set(regsOf(tour).flatMap(x => x.uids || []));
      tour.entries.forEach(e => [e.p1, e.p2].forEach(id => { const p = player(id); if (p && p.uid) uids.add(p.uid); }));
      msg.to = [...uids];
    } else msg.to = (ui.msgTo || []).slice();
    if (!msg.all && !msg.to.length) return warn('errMsgTo');
    const btn = f.querySelector('button.primary'); btn.disabled = true;
    window.Cloud.sendMessage(msg).then(() => { ui.msgTo = []; ui.flash = { text: t('msgSentOk', { n: msg.all ? t('msgToAll') : msg.to.length }) }; render(); })
      .catch(e => { btn.disabled = false; warn('regError', { code: e.code || e.message }); });
  }

  // ---------- giocatori ----------
  function viewPlayers() {
    const ed = ui.editingPlayer ? player(ui.editingPlayer) : null;
    const f = L.norm(ui.playerFilter);
    const list = S().players
      .filter(p => !f || L.norm(`${p.first} ${p.last} ${p.club || ''}`).includes(f))
      .sort((a, b) => a.last.localeCompare(b.last) || a.first.localeCompare(b.first));
    return `
      <div class="page-head"><h1>${esc(t('players'))}</h1></div>
      <div class="card">
        <h2>${esc(t('initialRanking'))}</h2>
        <p class="muted">${esc(t('initialRankingHelp'))}</p>
        <div class="btn-row">
          <button class="btn primary" data-action="import-ranking"><i class="ti ti-upload" aria-hidden="true"></i> ${esc(t('importExcel'))}</button>
          <button class="btn" data-action="template-ranking"><i class="ti ti-download" aria-hidden="true"></i> ${esc(t('downloadTemplate'))}</button>
        </div>
      </div>
      ${mergeCard()}
      <form class="card grid-form" data-form="player-save">
        <h2 class="span-all">${esc(ed ? t('editPlayer') : t('addPlayer'))}</h2>
        <label>${esc(t('lastName'))}<input name="last" required maxlength="40" value="${esc(ed ? ed.last : '')}"></label>
        <label>${esc(t('firstName'))}<input name="first" required maxlength="40" value="${esc(ed ? ed.first : '')}"></label>
        <label>${esc(t('gender'))}<select name="gender">
          <option value="M" ${ed && ed.gender === 'M' ? 'selected' : ''}>${esc(t('male'))}</option>
          <option value="F" ${ed && ed.gender === 'F' ? 'selected' : ''}>${esc(t('female'))}</option></select></label>
        <label>${esc(t('club'))}<input name="club" maxlength="60" value="${esc(ed ? ed.club : '')}"></label>
        <label>${esc(t('basePoints'))}<input name="base" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(ed ? ed.base || 0 : 0)}"></label>
        <div class="form-actions">
          ${ed ? `<button type="button" class="btn" data-action="cancel-edit-player">${esc(t('cancel'))}</button>` : ''}
          <button class="btn primary">${esc(ed ? t('save') : t('add'))}</button>
        </div>
      </form>
      <div class="card">
        <div class="card-head">
          <h2>${esc(t('players'))} (${S().players.length})</h2>
          <input type="search" class="search" placeholder="${esc(t('search'))}" value="${esc(ui.playerFilter)}" data-change="player-filter" aria-label="${esc(t('search'))}">
        </div>
        ${list.length ? `<ul class="player-list">${list.map(p => `
          <li>
            <span class="badge g-${p.gender}">${p.gender === 'F' ? '♀' : '♂'}</span>
            <span class="pl-name"><a href="#/p/${p.id}">${nameHtml(p)}</a> ${rewardBadge(playedCount(p.id))}${p.club ? `<small class="muted"> · ${esc(p.club)}</small>` : ''}</span>
            <span class="muted small nowrap">${esc(t('basePointsShort'))} ${fmtPts(p.base)}</span>
            <button class="icon-btn" data-action="edit-player" data-id="${p.id}" title="${esc(t('edit'))}" aria-label="${esc(t('edit'))}"><i class="ti ti-pencil" aria-hidden="true"></i></button>
            <button class="icon-btn" data-action="delete-player" data-id="${p.id}" title="${esc(t('delete'))}" aria-label="${esc(t('delete'))}">✕</button>
          </li>`).join('')}</ul>` : `<p class="muted">${esc(t('noPlayers'))}</p>`}
      </div>`;
  }

  // Numero minimo di lettere da cambiare per passare da una parola all'altra.
  function editDistance(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return d[a.length][b.length];
  }

  // Possibili doppioni: stesso genere, stesso cognome (anche in alfabeti diversi) e nome simile.
  function duplicateSuggestions() {
    const out = [];
    const list = S().players.map(p => ({ p, last: L.nameSkeleton(p.last), first: L.nameSkeleton(p.first) }));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.p.gender !== b.p.gender || a.last !== b.last) continue;
        if (editDistance(a.first, b.first) <= Math.max(2, Math.floor(Math.min(a.first.length, b.first.length) / 2))) out.push([a.p, b.p]);
      }
    }
    return out.slice(0, 30);
  }

  function playerOption(p, selected) {
    return `<option value="${p.id}" ${selected ? 'selected' : ''}>${esc(playerFull(p))} (${p.gender})${p.club ? ' — ' + esc(p.club) : ''}</option>`;
  }

  function mergeCard() {
    const players = S().players.slice().sort((a, b) => a.last.localeCompare(b.last) || a.first.localeCompare(b.first));
    if (players.length < 2) return '';
    const sugg = duplicateSuggestions();
    return `
      <details class="card form-card">
        <summary><i class="ti ti-users-group" aria-hidden="true"></i> ${esc(t('mergePlayers'))}${sugg.length ? ` <span class="badge wc">${sugg.length}</span>` : ''}</summary>
        <p class="muted">${esc(t('mergeHelp'))}</p>
        ${sugg.length ? `<h3>${esc(t('mergeSuggestions'))}</h3>
          <ul class="player-list">${sugg.map(([a, b]) => `<li>
            <span class="pl-name"><strong>${esc(playerFull(a))}</strong> ↔ <strong>${esc(playerFull(b))}</strong></span>
            <button class="btn small" data-action="merge-pair" data-keep="${a.id}" data-dup="${b.id}">${esc(t('merge'))}</button></li>`).join('')}</ul>` : ''}
        <form class="grid-form" data-form="merge-players">
          <label>${esc(t('keepPlayer'))}<select name="keep" required>${players.map(p => playerOption(p)).join('')}</select></label>
          <label>${esc(t('duplicatePlayer'))}<select name="dup" required>${players.map((p, i) => playerOption(p, i === 1)).join('')}</select></label>
          <div class="form-actions"><button class="btn primary">${esc(t('merge'))}</button></div>
        </form>
      </details>`;
  }

  // Unisce il doppione nel giocatore da mantenere: iscrizioni, punti iniziali e grafie del nome.
  function mergePlayers(keepId, dupId) {
    const keep = player(keepId), dup = player(dupId);
    if (!keep || !dup || keep.id === dup.id) return warn('errMergeSame');
    if (keep.gender !== dup.gender) return warn('errMergeGender');
    const both = S().tournaments.find(tr => [keep.id, dup.id].every(id => tr.entries.some(e => e.p1 === id || e.p2 === id)));
    if (both) return warn('errMergeConflict', { t: both.name });
    if (!confirmed('confirmMerge', { dup: playerFull(dup), keep: playerFull(keep) })) return;
    S().tournaments.forEach(tr => tr.entries.forEach(e => {
      if (e.p1 === dup.id) e.p1 = keep.id;
      if (e.p2 === dup.id) e.p2 = keep.id;
    }));
    keep.base = Math.max(Number(keep.base) || 0, Number(dup.base) || 0);
    if (!keep.club) keep.club = dup.club;
    keep.aliases = (keep.aliases || []).concat([{ last: dup.last, first: dup.first }], dup.aliases || []);
    S().players = S().players.filter(p => p.id !== dup.id);
    commit(t('merged', { keep: playerFull(keep) }));
  }

  // Scheda pubblica di un giocatore: solo tornei giocati, piazzamenti e punti conquistati.
  function viewPlayerPublic(p) {
    const hist = L.playerHistory(S(), p.id);
    const won = hist.reduce((x, h) => x + h.pts, 0);
    return `
      <div class="page-head">
        <a class="back" href="#/ranking">← ${esc(t('ranking'))}</a>
        <h1>${esc(playerFull(p))}</h1>
      </div>
      <div class="card">
        <h2><i class="ti ti-trophy" aria-hidden="true"></i> ${esc(t('tournamentsPlayed'))} (${hist.length})</h2>
        ${hist.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>${esc(t('tournament'))}</th><th class="num">${esc(t('finalPlace'))}</th><th class="num">${esc(t('pointsWon'))}</th></tr></thead>
          <tbody>${hist.map(h => `<tr><td><a href="#/t/${h.t.id}/final">${esc(h.t.name)}</a><div class="muted small">${esc(fmtDate(h.t.start))}</div></td>
            <td class="num">${medal(h.place)}</td><td class="num"><strong>${fmtPts(h.pts)}</strong></td></tr>`).join('')}</tbody>
          <tfoot><tr><td><strong>${esc(t('total'))}</strong></td><td></td><td class="num"><strong>${fmtPts(won)}</strong></td></tr></tfoot>
        </table></div>` : `<p class="muted">${esc(t('noTournamentsYet'))}</p>`}
      </div>`;
  }

  function viewPlayer(p) {
    if (!tourAdmin()) return viewPlayerPublic(p);
    const hist = L.playerHistory(S(), p.id);
    const r = L.ranking(S(), p.gender, null);
    const pos = r.findIndex(x => x.id === p.id);
    const me = r[pos];
    const base = Number(p.base) || 0;
    const won = hist.reduce((s, h) => s + h.pts, 0);
    // Tornei non ancora chiusi a cui il giocatore è iscritto: compaiono come "in corso", senza punti.
    const ongoing = S().tournaments.filter(tr => !tr.closed && tr.entries.some(e => e.p1 === p.id || e.p2 === p.id))
      .sort((a, b) => (b.start || '').localeCompare(a.start || ''));
    const partnerIn = tr => { const e = tr.entries.find(x => x.p1 === p.id || x.p2 === p.id); return e.p1 === p.id ? e.p2 : e.p1; };
    const catLabel = tr => { const c = catById(tr.categoryId); return [c ? c.name : '', '×' + fmtPts(tr.coefficient)].filter(Boolean).join(' '); };
    return `
      <div class="page-head">
        <a class="back" href="#/ranking">← ${esc(t('ranking'))}</a>
        <h1>${nameHtml(p)} ${rewardBadge(playedCount(p.id))}</h1>
        <p class="meta"><span class="badge g-${p.gender}">${esc(genderLabel(p.gender))}</span>${p.club ? `<span class="muted">${esc(p.club)}</span>` : ''}
          <span class="muted">${esc(t('tournamentsPlayedN', { n: playedCount(p.id) }))}</span></p>
        ${p.aliases && p.aliases.length ? `<p class="muted small">${esc(t('otherSpellings'))}: ${esc(p.aliases.map(a => `${a.last} ${a.first}`).join(', '))}</p>` : ''}
      </div>
      <div class="stats-row">
        <div class="stat"><span>${esc(t('rankPosition'))}</span><strong>${me && me.total ? medal(pos + 1) : '—'}</strong></div>
        <div class="stat"><span>${esc(t('totalPoints'))}</span><strong>${fmtPts(me ? me.total : base)}</strong></div>
        <div class="stat"><span>${esc(t('eventsPlayed'))}</span><strong>${hist.length + ongoing.length}</strong></div>
      </div>
      <div class="card">
        <h2><i class="ti ti-flag" aria-hidden="true"></i> ${esc(t('startingPoints'))}</h2>
        <p class="big-num">${fmtPts(base)} <small class="muted">${esc(t('points'))}</small></p>
        <p class="muted small">${esc(t('startingPointsHelp'))}</p>
      </div>
      <div class="card">
        <h2><i class="ti ti-trophy" aria-hidden="true"></i> ${esc(t('tournamentsPlayed'))} (${hist.length + ongoing.length})</h2>
        ${hist.length || ongoing.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>${esc(t('tournament'))}</th><th class="hide-sm">${esc(t('partner'))}</th><th class="num">${esc(t('finalPlace'))}</th><th class="num">${esc(t('pointsWon'))}</th></tr></thead>
          <tbody>
            ${ongoing.map(tr => `<tr><td><a href="#/t/${tr.id}/info">${esc(tr.name)}</a><div class="muted small">${esc(fmtDate(tr.start))} · ${esc(catLabel(tr))}</div>
                <div class="muted small show-sm">${esc(t('partner'))}: ${esc(playerFull(player(partnerIn(tr))))}</div></td>
              <td class="hide-sm">${esc(playerFull(player(partnerIn(tr))))}</td>
              <td class="num"><span class="badge st-main">${esc(t('inProgress'))}</span></td><td class="num muted">—</td></tr>`).join('')}
            ${hist.map(h => `<tr><td><a href="#/t/${h.t.id}/final">${esc(h.t.name)}</a><div class="muted small">${esc(fmtDate(h.t.start))} · ${esc(catLabel(h.t))}</div>
                <div class="muted small show-sm">${esc(t('partner'))}: ${esc(playerFull(player(h.partner)))}</div></td>
              <td class="hide-sm">${esc(playerFull(player(h.partner)))}</td><td class="num">${medal(h.place)}</td><td class="num"><strong>${fmtPts(h.pts)}</strong></td></tr>`).join('')}
          </tbody>
        </table></div>` : `<p class="muted">${esc(t('noTournamentsYet'))}</p>`}
      </div>
      <div class="card sum-card">
        <div class="kv"><span>${esc(t('startingPoints'))}</span><strong>${fmtPts(base)}</strong></div>
        <div class="kv"><span>${esc(t('pointsFromTournaments', { n: hist.length }))}</span><strong>+ ${fmtPts(won)}</strong></div>
        <div class="kv total"><span>${esc(t('totalPoints'))}</span><strong>${fmtPts(base + won)}</strong></div>
      </div>`;
  }

  // ---------- categorie ----------
  function tableRowInputs(place, pts) {
    return `<div class="pt-row">
      <input type="number" min="1" inputmode="numeric" name="place" value="${place}" aria-label="${esc(t('place'))}" required>
      <input type="number" min="0" step="0.01" inputmode="decimal" name="pts" value="${pts}" aria-label="${esc(t('points'))}" required>
      <button type="button" class="icon-btn" data-action="del-row" aria-label="${esc(t('remove'))}">✕</button>
    </div>`;
  }

  function pointsTable(rows) {
    const sorted = rows.slice().sort((a, b) => a[0] - b[0]);
    return `<div class="table-wrap"><table class="table narrow">
      <thead><tr><th>${esc(t('place'))}</th><th class="num">${esc(t('basePts'))}</th></tr></thead>
      <tbody>${sorted.map((r, i) => {
        const next = sorted[i + 1];
        const range = next && next[0] - 1 > r[0] ? `${r[0]}°–${next[0] - 1}°` : `${r[0]}°${next ? '' : '+'}`;
        return `<tr><td>${range}</td><td class="num"><strong>${fmtPts(r[1])}</strong></td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  function viewCategories() {
    if (!tourAdmin()) {
      return `
        <div class="page-head"><h1>${esc(t('categories'))}</h1><p class="muted">${esc(t('categoriesPublicIntro'))}</p></div>
        ${S().categories.length ? `<div class="pools-grid">${S().categories.map(c => `<div class="card"><h2>${esc(c.name)}</h2>${pointsTable(c.rows)}</div>`).join('')}</div>`
          : `<div class="empty">${esc(t('noCategories'))}</div>`}`;
    }
    const used = id => S().tournaments.some(x => x.categoryId === id);
    return `
      <div class="page-head"><h1>${esc(t('categories'))}</h1><p class="muted">${esc(t('categoriesIntro'))}</p></div>
      <div class="toolbar"><button class="btn primary" data-action="new-category"><i class="ti ti-plus" aria-hidden="true"></i> ${esc(t('newCategory'))}</button></div>
      ${S().categories.map(c => `
      <details class="card table-card" ${ui.openCat === c.id ? 'open' : ''} data-cat="${c.id}">
        <summary><strong>${esc(c.name)}</strong> <span class="muted small">${c.rows.slice(0, 4).map(r => `${r[0]}°: ${fmtPts(r[1])}`).join(' · ')}${c.rows.length > 4 ? ' …' : ''}</span></summary>
        <form data-form="category-save" data-id="${c.id}">
          <label>${esc(t('categoryName'))}<input name="name" required maxlength="40" value="${esc(c.name)}"></label>
          <div class="pt-head"><span>${esc(t('fromPlace'))}</span><span>${esc(t('basePts'))}</span><span></span></div>
          <div class="pt-rows">${c.rows.map(r => tableRowInputs(r[0], r[1])).join('')}</div>
          <p class="muted small">${esc(t('tableHelp'))}</p>
          <div class="form-actions">
            <button type="button" class="btn small" data-action="add-row"><i class="ti ti-plus" aria-hidden="true"></i> ${esc(t('addRow'))}</button>
            ${used(c.id) ? '' : `<button type="button" class="btn small danger" data-action="delete-category" data-id="${c.id}">${esc(t('delete'))}</button>`}
            <button class="btn primary">${esc(t('save'))}</button>
          </div>
        </form>
      </details>`).join('') || `<div class="empty">${esc(t('noCategories'))}</div>`}`;
  }

  // ---------- ranking ----------
  function viewRanking() {
    const g = ui.rankGender, cat = ui.rankCat;
    // "Tutti": uomini e donne insieme, con lo stesso ordine (punti, poi miglior piazzamento).
    const rows = (g === 'A' ? L.ranking(S(), 'M', cat || null).concat(L.ranking(S(), 'F', cat || null))
      .sort((x, y) => y.total - x.total || (x.best || 999) - (y.best || 999)) : L.ranking(S(), g, cat || null))
      .filter(r => r.total > 0 || r.events > 0);
    return `
      <div class="page-head"><h1>${esc(t('ranking'))}</h1>
        <p class="muted">${esc(t('rankingIntro'))}</p></div>
      <div class="toolbar">
        <div class="segmented" role="group">
          <button data-action="rank-gender" data-g="M" aria-pressed="${g === 'M'}">${esc(t('catMen'))}</button>
          <button data-action="rank-gender" data-g="F" aria-pressed="${g === 'F'}">${esc(t('catWomen'))}</button>
          <button data-action="rank-gender" data-g="A" aria-pressed="${g === 'A'}">${esc(t('rankAll'))}</button>
        </div>
        <select data-change="rank-cat" aria-label="${esc(t('category'))}">
          <option value="">${esc(t('allCategories'))}</option>
          ${S().categories.map(c => `<option value="${c.id}" ${sel(cat, c.id)}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="card">
        ${rows.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th class="num">#</th><th>${esc(t('player'))}</th><th class="hide-sm">${esc(t('club'))}</th><th class="num">${esc(t('eventsShort'))}</th><th class="num">${esc(t('points'))}</th></tr></thead>
          <tbody>${rows.map((r, i) => { const p = player(r.id); return `<tr class="${i < 3 ? 'podium' : ''}">
            <td class="num">${medal(i + 1)}</td><td><a href="#/p/${p.id}">${nameHtml(p)}</a>${g === 'A' ? ` <span class="badge g-${p.gender}">${esc(p.gender)}</span>` : ''} ${rewardBadge(playedCount(p.id))}</td>
            <td class="hide-sm muted">${esc(p.club || '')}</td><td class="num">${r.events}</td>
            <td class="num"><strong>${fmtPts(r.total)}</strong></td></tr>`; }).join('')}</tbody>
        </table></div>` : `<p class="muted">${esc(t('noRankingYet'))}</p>`}
      </div>`;
  }

  // ---------- stili grafici (salvati solo su questo dispositivo) ----------
  // [id, colore principale, sfondo, colore accento]
  // Tavolozze di colori: [id, primario, sfondo, accento]. Per ora solo il tema neutro (colori in :root di css/style.css).
  const THEMES = [
    ['logo', '#2f4a6d', '#f4f5f7', '#d9822b']
  ];
  const THEME_KEY = 'pcm-theme';

  function currentTheme() {
    return ui.theme || Consent.read(THEME_KEY) || 'logo';   // senza consenso: solo per questa visita
  }

  function applyTheme(id) {
    const th = THEMES.find(x => x[0] === id) || THEMES[0];
    if (th[0] === 'logo') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', th[0]);
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || th[2]);
  }

  function setTheme(id) {
    ui.theme = id; Consent.write(THEME_KEY, id);
    applyTheme(id);
    render();
  }

  // Temi grafici: [id, file dei caratteri in assets/fonts, stile dell'anteprima, stile del pulsante]. Per ora solo il tema base.
  const DESIGNS = [
    ['classico', '', 'font-family:Inter;border-radius:14px;box-shadow:0 4px 12px rgba(0,0,0,.08)', 'border-radius:8px']
  ];
  const DESIGN_KEY = 'pcm-design';

  function currentDesign() {
    // Tema predefinito di Manofuori Cup: base neutro.
    return ui.design || Consent.read(DESIGN_KEY) || 'classico';
  }

  // caratteri del tema: file dentro l'app (nessuna richiesta a Google Fonts)
  function loadFonts(query, id) {
    if (!query || document.getElementById('font-' + id)) return;
    const l = document.createElement('link');
    l.id = 'font-' + id; l.rel = 'stylesheet';
    l.href = `assets/fonts/${id}.css`;
    document.head.appendChild(l);
  }

  function applyDesign(id) {
    const d = DESIGNS.find(x => x[0] === id) || DESIGNS[0];
    if (d[0] === 'classico') document.documentElement.removeAttribute('data-design');
    else document.documentElement.setAttribute('data-design', d[0]);
    loadFonts(d[1], d[0]);
  }

  function setDesign(id) {
    ui.design = id; Consent.write(DESIGN_KEY, id);
    applyDesign(id);
    render();
  }

  function designCard() {
    if (DESIGNS.length < 2) return '';   // un solo tema: niente da scegliere
    const cur = currentDesign();
    DESIGNS.forEach(d => loadFonts(d[1], d[0]));
    return `<div class="card" id="design">
      <h2><i class="ti ti-layout-dashboard" aria-hidden="true"></i> ${esc(t('designTitle'))}</h2>
      <p class="muted small">${esc(t('designHelp'))}</p>
      <div class="theme-grid">${DESIGNS.map(([id, , pv, pb]) => `
        <button class="design-opt" data-action="set-design" data-design-id="${id}" aria-pressed="${cur === id}">
          <span class="pv" style='${pv}'><b>Manofuori Cup</b><span class="pb" style='${pb}'>21-18</span></span>
          <span class="nm">${esc(t('design_' + id))}</span>
          <span class="ds">${esc(t('designDesc_' + id))}</span>
        </button>`).join('')}</div>
    </div>`;
  }

  function themeCard() {
    if (THEMES.length < 2) return '';
    const cur = currentTheme();
    return `<div class="card" id="theme">
      <h2><i class="ti ti-palette" aria-hidden="true"></i> ${esc(t('themeTitle'))}</h2>
      <p class="muted small">${esc(t('themeHelp'))}</p>
      <div class="theme-grid">${THEMES.map(([id, p, bg, a]) => `
        <button class="theme-opt" data-action="set-theme" data-theme-id="${id}" aria-pressed="${cur === id}">
          <span class="sw"><span style="background:${bg}"></span><span style="background:${p}"></span><span style="background:${a}"></span></span>
          ${esc(t('theme_' + id))}
        </button>`).join('')}</div>
    </div>`;
  }

  // ---------- account dei campi (E-scorer) ----------
  function scorersCard() {
    if (!ui.scorers && !ui.scorersLoading && window.Cloud && window.Cloud.listScorers) {
      ui.scorersLoading = true;
      window.Cloud.listScorers().then(list => { ui.scorers = list; }).catch(() => { ui.scorers = []; })
        .finally(() => { ui.scorersLoading = false; refresh(); });
    }
    const list = (ui.scorers || []).slice().sort((a, b) => String(a.court).localeCompare(String(b.court), undefined, { numeric: true }));
    return `<div class="card" id="scorers">
      <h2><i class="ti ti-device-mobile" aria-hidden="true"></i> ${esc(t('scorersTitle'))}</h2>
      <p class="muted small">${esc(t('scorersHelp'))}</p>
      ${!ui.scorers ? `<p class="muted"><i class="ti ti-loader-2" aria-hidden="true"></i> ${esc(t('loading'))}</p>`
        : list.length ? `<ul class="scorer-list">${list.map(x => `<li><span class="badge cat">${esc(t('court'))} ${esc(x.court)}</span> <span>${esc(x.email)}</span>
            <select data-change="scorer-tour" data-email="${esc(x.email)}" aria-label="${esc(t('scorerTour'))}">${tourOptions(x.tid)}</select>
            <button class="btn small" data-action="scorer-remove" data-email="${esc(x.email)}"><i class="ti ti-user-off" aria-hidden="true"></i> ${esc(t('scorerRemove'))}</button></li>`).join('')}</ul>`
        : `<p class="muted">${esc(t('scorersNone'))}</p>`}
      <form class="grid-form scorer-form" data-form="scorer-add" autocomplete="off">
        <label>${esc(t('court'))}<input name="court" required maxlength="10" placeholder="1"></label>
        <label>Email<input name="email" type="email" required autocapitalize="off" spellcheck="false" placeholder="campo1@…"></label>
        <label>${esc(t('scorerPassword'))}<input name="password" type="text" required minlength="6" autocapitalize="off" spellcheck="false"></label>
        <label class="span-all">${esc(t('scorerTour'))}<select name="tid">${tourOptions('')}</select></label>
        <div class="form-actions"><button class="btn primary"><i class="ti ti-user-plus" aria-hidden="true"></i> ${esc(t('scorerAdd'))}</button></div>
      </form>
    </div>`;
  }

  // Tornei tra cui scegliere per un account del campo: non chiusi, dal più vicino.
  function tourOptions(sel) {
    const list = S().tournaments.filter(x => !x.closed || x.id === sel).slice().sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
    const o = (v, l) => `<option value="${esc(v)}" ${String(sel || '') === v ? 'selected' : ''}>${esc(l)}</option>`;
    return o('', t('scorerAllTours')) + list.map(x => o(x.id, `${x.name}${x.start ? ' · ' + fmtRange(x.start, x.end) : ''}`)).join('');
  }

  // ---------- account del campo: le mie gare ----------
  // Tornei in corso e futuri; per ogni gara con le due squadre note il pulsante E-scoresheet.
  function mineTours() {
    const today = todayStr();
    const sc = scorer();
    return S().tournaments.filter(x => !x.closed && (x.end || x.start || '9999') >= today && (x.start || '') <= today + 'z')
      .filter(x => x.pools || x.bracket || x.qual)
      .filter(x => !sc || !sc.tid || x.id === sc.tid);
  }

  function viewMine() {
    const sc = scorer();
    if (!sc) return `<div class="card"><p class="muted">${esc(t('loginHelp'))}</p><a class="btn primary" href="#/settings">${esc(t('login'))}</a></div>`;
    const all = !!ui.mineAll;
    const tours = mineTours();
    const blocks = tours.map(tour => {
      const ms = L.plannedMatches(tour).filter(m => !m.bye && L.real(m.a) && L.real(m.b))
        .filter(m => all || sameCourt((tour.schedule[m.key] || {}).court, sc.court));
      const key = m => { const x = tour.schedule[m.key] || {}; return `${x.date || '9999'} ${x.time || '99:99'} ${gNo(tour, m).padStart(5, '0')}`; };
      ms.sort((a, b) => key(a).localeCompare(key(b)));
      if (!ms.length) return '';
      return `<div class="card"><div class="card-head"><h2><i class="ti ti-trophy" aria-hidden="true"></i> ${esc(tour.name)}</h2>
        <a class="btn small" href="#/t/${tour.id}/referti"><i class="ti ti-folder" aria-hidden="true"></i> ${esc(t('archive'))}</a></div>
        <ul class="cal-list">${ms.map(m => calRow(tour, m)).join('')}</ul></div>`;
    }).join('');
    const bound = sc.tid && tourById(sc.tid);
    return `<div class="page-head"><h1><i class="ti ti-device-mobile" aria-hidden="true"></i> ${esc(t('mineTitle', { c: sc.court }))}</h1>
        ${bound ? `<p><span class="badge cat"><i class="ti ti-trophy" aria-hidden="true"></i> ${esc(bound.name)}</span></p>` : ''}
        <p class="muted">${esc(t('scorerNotice'))}</p></div>
      <div class="toolbar"><div class="segmented" role="group">
        <button data-action="mine-all" aria-pressed="${!all}">${esc(t('courtMine', { c: sc.court }))}</button>
        <button data-action="mine-all" aria-pressed="${all}">${esc(t('courtAll'))}</button>
      </div></div>
      ${blocks || `<div class="card"><p class="muted">${esc(t('mineEmpty'))}</p></div>`}`;
  }

  // ---------- cartella referti del torneo (admin e account dei campi) ----------
  // Stessa "versione" calcolata dal referto: il PDF archiviato è aggiornato se coincide.
  function pdfVersion(status, approvedAt, json) {
    let h = 2166136261;
    for (let i = 0; i < json.length; i++) { h ^= json.charCodeAt(i); h = Math.imul(h, 16777619); }
    return `${status}:${approvedAt || ''}:${(h >>> 0).toString(36)}:${json.length}`;
  }
  const refVersion = r => pdfVersion(r.status, r.status === 'approved' ? r.approvedAt : null, r.json || '');
  const refNum = r => { const n = String((r.info || {}).matchNo || ''); return (n[0] === 'Q' ? 0 : 1e6) + (parseInt(n.replace(/\D/g, ''), 10) || 0); };
  const refFile = r => { const i = r.info || {}; return `${i.matchNo || r.key} – ${(i.A || {}).name || 'A'} vs ${(i.B || {}).name || 'B'}`; };
  const refStatus = st => st === 'approved' ? `<span class="badge st-done">${esc(t('escoreSt_approved'))}</span>`
    : st === 'finished' ? `<span class="pending-badge"><i class="ti ti-hourglass" aria-hidden="true"></i> ${esc(t('pendingBadge'))}</span>`
    : st === 'live' ? `<span class="live-badge"><i class="dot" aria-hidden="true"></i>${esc(t('liveBadge'))}</span>`
    : `<span class="badge">${esc(t('escoreSt_ready'))}</span>`;
  const fmtStamp = ms => (ms ? new Date(ms).toLocaleString(I18n.locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '');

  function tabReferti(tour) {
    if (!S().refLoaded || !S().pdfLoaded) return `<div class="card"><p class="muted"><i class="ti ti-loader-2" aria-hidden="true"></i> ${esc(t('loading'))}</p></div>`;
    const refs = Object.entries(S().referti).map(([id, r]) => Object.assign({ id }, r)).filter(r => r.tid === tour.id).sort((a, b) => refNum(a) - refNum(b));
    const pdfOf = r => S().refPdf[r.id];
    const fresh = r => pdfOf(r) && pdfOf(r).version === refVersion(r);
    const stale = refs.filter(r => r.json && !fresh(r));
    const pdfs = refs.filter(r => pdfOf(r));
    // PDF mancanti o non aggiornati: si creano in automatico (una volta per ogni nuova versione dei referti).
    ui.refAuto = ui.refAuto || {};
    const staleKey = stale.map(r => r.id + '@' + refVersion(r)).join(',');
    if (stale.length && !ui.refBuild && ui.refAuto[tour.id] !== staleKey) { ui.refAuto[tour.id] = staleKey; setTimeout(() => buildPdfs(tour.id), 0); }
    const b = ui.refBuild && ui.refBuild.tid === tour.id ? ui.refBuild : null;
    const openHref = r => esc(refertoUrl('g=' + encodeURIComponent(r.id)));
    return `
      <div class="card folder">
        <div class="card-head"><h2><i class="ti ti-folder" aria-hidden="true"></i> referti <span class="muted small">(${refs.length})</span></h2></div>
        <p class="muted small">${esc(t('refFolderHelp'))}</p>
        ${refs.length ? `<ul class="file-list">${refs.map(r => `<li>
            <i class="ti ti-file-text file-ic" aria-hidden="true"></i>
            <div class="file-main">
              <strong>${esc(refFile(r))}</strong>
              <small class="muted">${esc([(r.info || {}).phase, r.court ? `${t('court')} ${r.court}` : '', r.updatedBy || r.createdBy || '', fmtStamp(r.updated)].filter(Boolean).join(' · '))}</small>
              <span class="file-state">${refStatus(r.status)} ${esc((r.sets || []).map(x => `${x.a}-${x.b}`).join('  '))}</span>
            </div>
            <div class="file-actions">
              ${fresh(r) ? `<button class="btn small" data-action="pdf-view" data-id="${esc(r.id)}"><i class="ti ti-file-type-pdf" aria-hidden="true"></i> PDF</button>` : ''}
              <a class="btn small" href="${openHref(r)}" ${tourAdmin() ? 'target="_blank" rel="noopener"' : ''}><i class="ti ti-external-link" aria-hidden="true"></i> ${esc(t('refOpen'))}</a>
            </div>
          </li>`).join('')}</ul>` : `<p class="muted">${esc(t('refEmpty'))}</p>`}
      </div>
      <div class="card folder">
        <div class="card-head"><h2><i class="ti ti-folder" aria-hidden="true"></i> referti / pdf <span class="muted small">(${pdfs.length})</span></h2>
          <div class="btn-row">
            ${stale.length && !b ? `<button class="btn small" data-action="pdf-build" data-tid="${tour.id}"><i class="ti ti-refresh" aria-hidden="true"></i> ${esc(t('pdfBuild', { n: stale.length }))}</button>` : ''}
            <button class="btn small primary" data-action="pdf-zip" data-tid="${tour.id}" ${pdfs.length && !b ? '' : 'disabled'}><i class="ti ti-file-zip" aria-hidden="true"></i> ${esc(t('pdfZip'))}</button>
          </div></div>
        ${b ? `<p class="note"><i class="ti ti-loader-2" aria-hidden="true"></i> ${esc(b.text || t('pdfBuilding', { n: b.progress || 0, t: b.total || '…' }))}</p>` : ''}
        ${pdfs.length ? `<ul class="file-list">${pdfs.map(r => { const p = pdfOf(r); return `<li>
            <i class="ti ti-file-type-pdf file-ic pdf" aria-hidden="true"></i>
            <button class="file-main as-link" data-action="pdf-view" data-id="${esc(r.id)}">
              <strong>${esc(p.name)}</strong>
              <small class="muted">${esc(t('pdfSt_' + (p.status === 'approved' ? 'approved' : 'draft')))} · ${esc(fmtStamp(p.updated))}${fresh(r) ? '' : ` · ${t('pdfOld')}`}</small>
            </button>
          </li>`; }).join('')}</ul>` : `<p class="muted">${esc(t('pdfEmpty'))}</p>`}
      </div>`;
  }

  // PDF creati dal referto stesso, aperto di nascosto (usa gli stessi dati e la stessa grafica).
  function buildPdfs(tid) {
    if (ui.refBuild) return;
    ui.refBuild = { tid, progress: 0, total: 0 };
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.src = refertoUrl(`archivio=${encodeURIComponent(tid)}&build=1`);
    const done = () => { window.removeEventListener('message', onMsg); clearTimeout(timer); frame.remove(); ui.refBuild = null; refresh(); };
    const onMsg = e => {
      if (e.origin !== location.origin || !e.data || e.data.source !== 'referto-build' || e.data.tid !== tid) return;
      if (e.data.done) { if (e.data.error) ui.flash = { type: 'warn', text: t('escoreError', { code: e.data.error }) }; done(); return; }
      ui.refBuild.progress = e.data.progress; ui.refBuild.total = e.data.total;
      if (!isTyping()) render();
    };
    const timer = setTimeout(done, 5 * 60 * 1000);
    window.addEventListener('message', onMsg);
    document.body.appendChild(frame);
    render();
  }

  const b64Blob = b64 => new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: 'application/pdf' });
  let viewerUrl = null;
  async function viewPdf(id) {
    const meta = S().refPdf[id];
    if (!meta) return;
    $dialog.innerHTML = `<div class="pdf-viewer"><div class="pv-bar"><strong>${esc(meta.name)}</strong></div><p class="muted"><i class="ti ti-loader-2" aria-hidden="true"></i> ${esc(t('loading'))}</p></div>`;
    $dialog.classList.add('wide-dialog');
    if (!$dialog.open) $dialog.showModal();
    const pdf = await window.Cloud.loadPdf(id).catch(() => null);
    if (!pdf) { $dialog.querySelector('p').textContent = t('pdfMissing'); return; }
    if (viewerUrl) URL.revokeObjectURL(viewerUrl);
    viewerUrl = URL.createObjectURL(b64Blob(pdf.data));
    $dialog.innerHTML = `<div class="pdf-viewer">
      <div class="pv-bar"><strong>${esc(pdf.name)}</strong>
        <div class="btn-row">
          <a class="btn small" href="${viewerUrl}" download="${esc(pdf.name)}"><i class="ti ti-download" aria-hidden="true"></i> ${esc(t('pdfDownload'))}</a>
          <a class="btn small" href="${viewerUrl}" target="_blank" rel="noopener"><i class="ti ti-external-link" aria-hidden="true"></i> ${esc(t('pdfNewTab'))}</a>
          <button class="btn small primary" data-action="close-dialog">${esc(t('close'))}</button>
        </div></div>
      <div class="pv-pages" id="pvPages"><p class="muted"><i class="ti ti-loader-2" aria-hidden="true"></i> ${esc(t('loading'))}</p></div>
    </div>`;
    // Pagine disegnate con pdf.js: si vedono su tutti i dispositivi (anche dove il browser non mostra i PDF).
    try {
      const pdfjs = await loadPdfJs();
      const docPdf = await pdfjs.getDocument({ data: Uint8Array.from(atob(pdf.data), c => c.charCodeAt(0)) }).promise;
      const box = document.getElementById('pvPages');
      if (!box) return;
      box.innerHTML = '';
      for (let n = 1; n <= docPdf.numPages; n++) {
        const page = await docPdf.getPage(n);
        const vp = page.getViewport({ scale: 2 });
        const cv = document.createElement('canvas');
        cv.width = vp.width; cv.height = vp.height;
        box.appendChild(cv);
        await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      }
    } catch (err) {
      console.warn(err);
      const box = document.getElementById('pvPages');
      if (box) box.innerHTML = `<iframe class="pv-frame" src="${viewerUrl}" title="${esc(pdf.name)}"></iframe>`;
    }
  }

  let pdfJsPromise = null;
  function loadPdfJs() {
    const base = 'vendor/pdfjs/';
    if (!pdfJsPromise) pdfJsPromise = new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = base + 'pdf.min.js';
      sc.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js'; resolve(window.pdfjsLib); };
      sc.onerror = () => { pdfJsPromise = null; reject(new Error('pdfjs')); };
      document.head.appendChild(sc);
    });
    return pdfJsPromise;
  }
  $dialog.addEventListener('close', () => $dialog.classList.remove('wide-dialog'));

  // Nome di file con sole lettere latine (il greco viene traslitterato).
  const GR = { α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o' };
  const latinName = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ου/gi, m => (m[0] === 'Ο' ? 'Ou' : 'ou'))
    .replace(/[\u0370-\u03ff]/g, c => { const l = GR[c.toLowerCase()] || ''; return c === c.toLowerCase() ? l : l.charAt(0).toUpperCase() + l.slice(1); })
    .replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '');

  let zipPromise = null;
  async function zipPdfs(tid) {
    const tour = tourById(tid);
    const ids = Object.keys(S().refPdf).filter(id => S().refPdf[id].tid === tid);
    if (!ids.length) return;
    ui.refBuild = { tid, text: t('pdfZipping', { n: 0, t: ids.length }) }; render();
    try {
      if (!zipPromise) zipPromise = new Promise((resolve, reject) => {
        const sc = document.createElement('script');
        sc.src = 'referto/vendor/jszip.min.js'; sc.onload = () => resolve(window.JSZip); sc.onerror = () => { zipPromise = null; reject(new Error('zip')); };
        document.head.appendChild(sc);
      });
      const JSZip = await zipPromise;
      const zip = new JSZip();
      const dir = zip.folder('referti').folder('pdf');
      for (let i = 0; i < ids.length; i++) {
        ui.refBuild.text = t('pdfZipping', { n: i + 1, t: ids.length }); render();
        const pdf = await window.Cloud.loadPdf(ids[i]);
        if (pdf) dir.file(pdf.name, pdf.data, { base64: true });
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `referti_${latinName(tour.name) || tid}.zip`;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    } catch (err) {
      console.error(err);
      ui.flash = { type: 'warn', text: t('escoreError', { code: err.code || err.message }) };
    }
    ui.refBuild = null;
    render();
  }

  // ---------- impostazioni ----------
  function viewSettings() {
    const user = window.Cloud && window.Cloud.user;
    let account;
    if (user && admin()) {
      account = `<p><i class="ti ti-circle-check" aria-hidden="true"></i> ${esc(t('loggedInAs', { email: user.email }))}</p>
        <button class="btn" data-action="logout">${esc(t('logout'))}</button>`;
    } else if (user && scorer()) {
      account = `<p><i class="ti ti-circle-check" aria-hidden="true"></i> ${esc(t('scorerBadge', { c: scorer().court }))} · ${esc(user.email)}</p>
        <div class="btn-row"><a class="btn primary" href="#/mine"><i class="ti ti-device-mobile" aria-hidden="true"></i> ${esc(t('navMine'))}</a>
        <button class="btn" data-action="logout">${esc(t('logout'))}</button></div>`;
    } else if (user && member()) {
      account = `<p><i class="ti ti-circle-check" aria-hidden="true"></i> ${esc(t('loggedInAs', { email: `${personName(member())} · ${user.email}` }))}</p>
        <div class="btn-row"><a class="btn primary" href="#/me"><i class="ti ti-user" aria-hidden="true"></i> ${esc(t('profile'))}</a>
        <button class="btn" data-action="logout">${esc(t('logout'))}</button></div>`;
    } else if (user) {
      account = `<p class="note warn">${esc(t('notAdmin', { email: user.email }))}</p>
        <p class="muted small">UID: <code>${esc(user.uid)}</code></p>
        <button class="btn" data-action="logout">${esc(t('logout'))}</button>`;
    } else {
      account = `<p class="muted">${esc(t('loginHelp'))}</p>
        <form class="grid-form" data-form="login">
          <label>Email<input name="email" type="email" autocomplete="username" autocapitalize="off" spellcheck="false" required></label>
          <label>${esc(t('password'))}<input name="password" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" required></label>
          <div class="form-actions">
            <button type="button" class="btn small" data-action="reset-password">${esc(t('forgotPassword'))}</button>
            <button class="btn primary">${esc(t('login'))}</button>
          </div>
        </form>
        <details class="sub-form" data-keep="register" ${ui.showRegister || keepOpen('register') ? 'open' : ''}><summary><i class="ti ti-user-plus" aria-hidden="true"></i> ${esc(t('registerTitle'))}</summary>
          <p class="muted small">${esc(t('registerHelp'))}</p>
          <form class="grid-form" data-form="register">
            <label>${esc(t('firstName'))}<input name="first" required maxlength="60" autocomplete="given-name"></label>
            <label>${esc(t('lastName'))}<input name="last" required maxlength="60" autocomplete="family-name"></label>
            <label>${esc(t('gender'))}<select name="gender" required><option value="">—</option><option value="M">${esc(t('male'))}</option><option value="F">${esc(t('female'))}</option></select></label>
            <label>Email<input name="email" type="email" required autocomplete="email" autocapitalize="off" spellcheck="false"></label>
            <label>${esc(t('password'))}<input name="password" type="password" required minlength="6" autocomplete="new-password"></label>
            <label class="check span-all legal-check"><input type="checkbox" name="privacy" required> <span>${t('registerPrivacy')}</span></label>
            <div class="form-actions"><button class="btn primary">${esc(t('registerBtn'))}</button></div>
          </form>
        </details>`;
    }
    return `
      <div class="page-head"><h1>${esc(t('settings'))}</h1></div>
      <div class="card admin-card" id="login">
        <h2><i class="ti ti-key" aria-hidden="true"></i> ${esc(t(member() ? 'myAccount' : user ? 'adminArea' : 'loginOrRegister'))}</h2>
        ${account}
      </div>
      ${admin() ? `<div class="card"><h2><i class="ti ti-mail" aria-hidden="true"></i> ${esc(t('messages'))}</h2>
        <p class="muted small">${esc(t('messagesIntro'))}</p><a class="btn primary" href="#/messages">${esc(t('messagesOpen'))} →</a></div>` : ''}
      ${admin() ? `<div class="card"><h2><i class="ti ti-users" aria-hidden="true"></i> ${esc(t('usersTitle'))} (${(S().members || []).length})</h2>
        ${homonymPending().length ? `<p class="note warn">${esc(t('homonymWarn'))}</p>` : `<p class="muted small">${esc(t('usersIntro'))}</p>`}
        <a class="btn primary" href="#/users">${esc(t('usersOpen'))} →</a></div>` : ''}
      ${cashier() ? `<div class="card"><h2><i class="ti ti-cash-register" aria-hidden="true"></i> ${esc(t('caTitle'))}</h2>
        <p class="muted small">${esc(t('caIntroShort'))}</p><a class="btn primary" href="#/cassa">${esc(t('caTitle'))} →</a></div>` : ''}
      ${admin() ? `<div class="card"><h2><i class="ti ti-report-analytics" aria-hidden="true"></i> ${esc(t('rpTitle'))}</h2>
        <p class="muted small">${esc(t('rpIntro'))}</p><a class="btn primary" href="#/report">${esc(t('rpTitle'))} →</a></div>` : ''}
      ${admin() ? `<div class="card"><h2><i class="ti ti-cash-register" aria-hidden="true"></i> ${esc(t('payAdminTitle'))}</h2>
        <p class="muted small">${esc(t('payAdminIntro'))}</p><a class="btn primary" href="#/payments">${esc(t('payAdminTitle'))} →</a></div>` : ''}
      ${admin() ? `<div class="card"><h2><i class="ti ti-layout-grid" aria-hidden="true"></i> ${esc(t('courtsManage'))} (${(S().courts || []).length})</h2>
        <p class="muted small">${esc(t('courtsIntro'))}</p><a class="btn primary" href="#/courts">${esc(t('courtsManage'))} →</a></div>` : ''}
      ${tourAdmin() ? rewardsCard() : ''}
      ${tourAdmin() ? scorersCard() : ''}
      ${admin() ? `
      <div class="card">
        <h2>${esc(t('backup'))}</h2>
        <p class="muted">${esc(t('backupHelp'))}</p>
        <div class="btn-row">
          <button class="btn" data-action="export"><i class="ti ti-download" aria-hidden="true"></i> ${esc(t('exportData'))}</button>
          <button class="btn" data-action="import-backup"><i class="ti ti-upload" aria-hidden="true"></i> ${esc(t('importData'))}</button>
        </div>
      </div>` : ''}
      <div class="card">
        <h2>${esc(t('language'))}</h2>
        <div class="segmented wrap" role="group">
          ${[['it', 'Italiano'], ['sc', 'Sardu'], ['el', 'Ελληνικά'], ['en', 'English']].map(([c, n]) => `<button data-action="set-lang" data-lang="${c}" aria-pressed="${I18n.lang === c}">${n}</button>`).join('')}
        </div>
      </div>
      ${designCard()}
      ${themeCard()}
      ${isOwner() ? `<div class="card danger-zone">
        <h2>${esc(t('dangerZone'))}</h2>
        <p class="muted">${esc(t('deleteAllHelp'))}</p>
        <button class="btn danger" data-action="delete-all">${esc(t('deleteAll'))}</button>
      </div>` : ''}`;
  }

  // ---------- finestra partita: calendario, risultato, gara chiusa ----------
  function openMatch(tid, key) {
    const tour = tourById(tid);
    const m = L.plannedMatches(tour).find(x => x.key === key);
    if (!m || m.bye) return;
    const known = L.real(m.a) && L.real(m.b);
    let res = tour.results[key];
    if (res && (res.a !== m.a || res.b !== m.b)) res = null;
    res = res || { sets: [], outcome: null, closed: false };
    // Referto elettronico: il risultato inviato dal refertista precompila i set.
    const lv = liveFor(tour, m);
    if (lv && !res.sets.length && !res.outcome) res = { sets: lv.sets || [], outcome: lv.outcome || null, closed: false };
    const raw = rawLive(tour, m);
    const sch = tour.schedule[key] || {};
    // Data proposta: giorno d'inizio della fase (qualifiche o tabellone principale), altrimenti inizio torneo.
    const phaseStart = ((m.stage === 'qual' ? tour.qualStart : tour.mainStart) || '').slice(0, 10);
    const defDate = sch.date || phaseStart || tour.start || '';
    const c = tour.config, nSets = 2 * c.setsToWin - 1;
    const o = res.outcome;
    const oVal = o ? o.type + o.team.toUpperCase() : 'normal';
    ui.matchCtx = { tid, key, a: m.a, b: m.b };
    const nameA = slotName(tour, m, 0), nameB = slotName(tour, m, 1);
    const setRows = Array.from({ length: nSets }, (_, i) => `
      <div class="set-row">
        <span class="set-label">${esc(t('set'))} ${i + 1} <small class="muted">(${L.setTarget(c, i)})</small></span>
        <input type="number" min="0" max="99" inputmode="numeric" name="a${i}" value="${res.sets[i] ? res.sets[i][0] : ''}" aria-label="${esc(t('set'))} ${i + 1} A">
        <span>–</span>
        <input type="number" min="0" max="99" inputmode="numeric" name="b${i}" value="${res.sets[i] ? res.sets[i][1] : ''}" aria-label="${esc(t('set'))} ${i + 1} B">
      </div>`).join('');
    $dialog.innerHTML = `
      <form data-form="match" method="dialog">
        <h2>${gNo(tour, m) ? `<b class="gno">${gNo(tour, m)}</b> ` : ''}${esc(phaseLabel(tour, m))} ${res.closed ?`<span class="badge st-done">${esc(t('matchClosed'))}</span>` : ''}</h2>
        <div class="md-teams"><span>${nameA}</span><span class="vs">vs</span><span>${nameB}</span></div>
        ${lv ? `<p class="escore-note">${liveTag(lv)} ${esc(t(lv.status === 'finished' ? 'escorePendingNote' : 'escoreLiveNote', { r: liveSummary(lv) }))}</p>` : ''}
        <fieldset>
          <legend>${esc(t('schedule'))}</legend>
          <div class="grid-form tight three">
            <label>${esc(t('date'))} *<input name="date" type="date" required value="${esc(defDate)}"></label>
            <label>${esc(t('time'))}<input name="time" type="time" value="${esc(sch.time || '')}"></label>
            <label>${esc(t('court'))}<input name="court" maxlength="10" value="${esc(sch.court || '')}"></label>
            ${gsNoEditable(tour, m) ? `<label>${esc(t('matchNo'))}<input name="gno" type="number" min="1" max="${gCount(tour)}" inputmode="numeric" value="${gNo(tour, m).slice(1)}"></label>` : ''}
          </div>
          ${gsNoEditable(tour, m) ? `<p class="muted small">${esc(t('matchNoHelp'))}</p>` : ''}
          <label class="check"><input type="checkbox" name="follow" ${sch.follow ? 'checked' : ''}> ${esc(t('toFollow'))}</label>
          <label class="check vis-check"><input type="checkbox" name="visible" ${tour.visible[key] ? 'checked' : ''}> <i class="ti ti-eye" aria-hidden="true"></i> ${esc(t('visibleToPublic'))}</label>
        </fieldset>
        ${known ? `
        <fieldset>
          <legend>${esc(t('result'))}</legend>
          <label class="outcome">${esc(t('outcome'))}
            <select name="outcome" data-change="outcome">
              <option value="normal" ${sel(oVal, 'normal')}>${esc(t('outcomeNormal'))}</option>
              <option value="injA" ${sel(oVal, 'injA')}>INJ/DSQ — ${nameA}</option>
              <option value="injB" ${sel(oVal, 'injB')}>INJ/DSQ — ${nameB}</option>
              <option value="dsqA" ${sel(oVal, 'dsqA')}>DSQ (${esc(t('forfeit'))}) — ${nameA}</option>
              <option value="dsqB" ${sel(oVal, 'dsqB')}>DSQ (${esc(t('forfeit'))}) — ${nameB}</option>
            </select>
          </label>
          <p class="muted small" data-outcome-help></p>
          <div class="sets">${setRows}</div>
        </fieldset>` : `<p class="muted small">${esc(t('teamsNotKnown'))}</p>`}
        <p class="error" id="mdErr" role="alert"></p>
        ${known && (!res.closed || (raw && raw.status !== 'ready')) ? `<div class="btn-row escore-row">
          ${!res.closed ? `<button type="button" class="btn small escore-btn" data-action="escore-open" data-tid="${tid}" data-key="${key}"><i class="ti ti-device-mobile" aria-hidden="true"></i> ${esc(t('escoreBtn'))}</button>` : ''}
          ${raw ? `<button type="button" class="btn small" data-action="escore-reset" data-tid="${tid}" data-key="${key}"><i class="ti ti-trash" aria-hidden="true"></i> ${esc(t('escoreReset'))}</button>` : ''}
          ${lv && lv.status === 'finished' ? `<button type="button" class="btn small primary" data-action="escore-approve" data-tid="${tid}" data-key="${key}"><i class="ti ti-rosette-discount-check" aria-hidden="true"></i> ${esc(t('approveResult'))}</button>` : ''}
          ${raw && (raw.status === 'finished' || raw.status === 'approved') ? `<button type="button" class="btn small" data-action="escore-reopen" data-tid="${tid}" data-key="${key}"><i class="ti ti-lock-open" aria-hidden="true"></i> ${esc(t('reopenScorer'))}</button>` : ''}
        </div>` : ''}
        <div class="form-actions">
          <button type="button" class="btn" data-action="close-dialog">${esc(t('cancel'))}</button>
          ${known && (res.sets.length || res.outcome) ? `<button type="button" class="btn danger" data-action="match-clear">${esc(t('clearResult'))}</button>` : ''}
          ${known && res.closed ? `<button type="button" class="btn" data-action="match-reopen">${esc(t('reopenMatch'))}</button>` : ''}
          <button class="btn" data-submit="save">${esc(res.closed ? t('saveChanges') : t('save'))}</button>
          ${known && !res.closed ? `<button class="btn primary" data-submit="close"><i class="ti ti-check" aria-hidden="true"></i> ${esc(t('closeMatch'))}</button>` : ''}
        </div>
      </form>`;
    const f = $dialog.querySelector('form');
    if (known) syncOutcome(f);
    $dialog.showModal();
  }

  function syncOutcome(f) {
    const v = f.outcome.value;
    f.querySelector('[data-outcome-help]').textContent = v === 'normal' ? '' : t(v.startsWith('inj') ? 'injHelp' : 'dsqHelp');
    f.querySelector('.sets').hidden = v.startsWith('dsq');
  }

  // mode: 'save' | 'close' | 'reopen' | 'clear'
  function saveMatch(f, mode) {
    const ctx = ui.matchCtx, tour = tourById(ctx.tid);
    const c = tour.config, nSets = 2 * c.setsToWin - 1;
    const err = document.getElementById('mdErr');
    if (mode !== 'clear' && !f.date.value) { err.textContent = t('errDateRequired'); f.date.focus(); return; }
    if (f.gno && f.gno.value.trim() && 'G' + parseInt(f.gno.value, 10) !== nums(tour)[ctx.key]) {
      if (!L.setMatchNo(tour, ctx.key, parseInt(f.gno.value, 10))) { err.textContent = t('errMatchNo', { n: gCount(tour) }); f.gno.focus(); return; }
      numCache = {};
    }
    tour.schedule[ctx.key] = { date: f.date.value, time: f.time.value, court: f.court.value.trim(), follow: f.follow.checked };
    setVisible(tour, [ctx.key], f.visible.checked);
    const prev = tour.results[ctx.key] && tour.results[ctx.key].a === ctx.a && tour.results[ctx.key].b === ctx.b ? tour.results[ctx.key] : null;
    if (f.outcome && mode !== 'clear') {
      const v = f.outcome.value;
      const outcome = v === 'normal' ? null : { type: v.slice(0, 3), team: v.slice(3).toLowerCase() };
      const sets = [];
      if (!outcome || outcome.type === 'inj') {
        for (let i = 0; i < nSets; i++) {
          const va = f.elements['a' + i].value.trim(), vb = f.elements['b' + i].value.trim();
          if (va === '' && vb === '') continue;
          if (va === '' || vb === '') { err.textContent = t('errInvalidSet', { set: i + 1, target: L.setTarget(c, i) }); return; }
          sets.push([parseInt(va, 10), parseInt(vb, 10)]);
        }
      }
      const closed = mode === 'close' || (mode === 'save' && !!(prev && prev.closed));
      const hasResult = sets.length || outcome;
      if (closed && !hasResult) { err.textContent = t('errNoResult'); return; }
      if (closed || (hasResult && mode === 'save')) {
        const e = L.validateResult(sets, outcome, c);
        if (e && closed) { err.textContent = t(e.key, e); return; }
      }
      if (mode === 'reopen') {
        if (prev) prev.closed = false;
      } else if (hasResult) {
        tour.results[ctx.key] = { a: ctx.a, b: ctx.b, sets, outcome, closed };
      } else {
        delete tour.results[ctx.key];
      }
    } else if (mode === 'clear') {
      delete tour.results[ctx.key];
    }
    $dialog.close();
    const raw = S().live && S().live[liveId(tour, ctx.key)];
    if (raw && raw.a === ctx.a && raw.b === ctx.b && window.Cloud) {
      if (mode === 'close' && raw.status !== 'approved') window.Cloud.setLiveStatus(liveId(tour, ctx.key), 'approved');
      if (mode === 'reopen' && raw.status === 'approved') window.Cloud.setLiveStatus(liveId(tour, ctx.key), 'finished');
    }
    commit(t({ save: 'saved', close: 'matchClosedMsg', reopen: 'matchReopened', clear: 'resultCleared' }[mode]));
  }

  // ---------- E-scoresheet: link del refertista ----------
  // Dati della gara che il referto elettronico riceve già compilati.
  function escoreInfo(tour, m) {
    const sch = tour.schedule[m.key] || {};
    const c = tour.config;
    const team = id => {
      const e = entryById(tour, id);
      return { name: teamText(tour, id), players: [e.p1, e.p2].map(pid => { const p = player(pid); return p ? (nickOf(p) || `${p.first || ''} ${p.last || ''}`.trim()) : ''; }) };
    };
    return {
      competition: tour.name || '', location: tour.location || '', matchNo: gNo(tour, m), phase: phaseLabel(tour, m), gender: tour.gender,
      date: sch.date || '', time: sch.follow ? t('toFollow') : sch.time || '', court: sch.court || '',
      A: team(m.a), B: team(m.b),
      settings: { bestOf: 2 * c.setsToWin - 1, points: c.setPoints, tiePoints: c.tiebreakPoints }
    };
  }

  const refertoUrl = (params) => new URL(`referto/?${params}`, location.href.split('#')[0]).href;

  // Apre il referto elettronico della gara: lo crea nella raccolta "referti" se non esiste ancora.
  async function openReferto(tid, key) {
    const tour = tourById(tid);
    const m = tour && L.plannedMatches(tour).find(x => x.key === key);
    if (!m || m.bye || !L.real(m.a) || !L.real(m.b) || !window.Cloud) return;
    if ($dialog.open) $dialog.close();
    // L'admin lo apre in una nuova scheda (la finestra va aperta subito, prima dell'attesa del database).
    const win = tourAdmin() ? window.open('', '_blank') : null;
    ui.flash = { text: t('escoreLoading') }; render();
    try {
      const sch = tour.schedule[key] || {};
      const id = await window.Cloud.openReferto(tid, key, m.a, m.b, sch.court || '', escoreInfo(tour, m));
      const url = refertoUrl(`g=${encodeURIComponent(id)}`);
      if (win) { win.location.href = url; render(); } else location.href = url;
    } catch (err) {
      if (win) win.close();
      console.error(err);
      warn(err.code === 'stale' ? 'escoreStale' : 'escoreError', { code: err.code || err.message });
    }
  }

  function approveEscore(tid, key) {
    const tour = tourById(tid);
    const m = L.plannedMatches(tour).find(x => x.key === key);
    const lv = m && liveFor(tour, m);
    if (!lv || lv.status !== 'finished') return;
    const outcome = lv.outcome || null;
    const sets = outcome && outcome.type === 'dsq' ? [] : (lv.sets || []).map(x => [+x[0], +x[1]]);
    const e = L.validateResult(sets, outcome, tour.config);
    if (e) {
      // Risultato non valido per la formula del torneo: si corregge a mano nella finestra della gara.
      openMatch(tid, key);
      document.getElementById('mdErr').textContent = t(e.key, e);
      return;
    }
    tour.results[key] = { a: m.a, b: m.b, sets, outcome, closed: true };
    if ($dialog.open) $dialog.close();
    window.Cloud.setLiveStatus(liveId(tour, key), 'approved');
    commit(t('approvedMsg'));
  }

  async function resetEscore(tid, key) {
    const tour = tourById(tid);
    if (!confirmed('escoreResetConfirm')) return;
    if ($dialog.open) $dialog.close();
    try { await window.Cloud.resetReferto(liveId(tour, key)); ui.flash = { text: t('escoreResetDone') }; }
    catch (err) { ui.flash = { type: 'warn', text: t('escoreError', { code: err.code || err.message }) }; }
    render();
  }

  function reopenEscore(tid, key) {
    const tour = tourById(tid);
    const m = L.plannedMatches(tour).find(x => x.key === key);
    if (!m || !rawLive(tour, m)) return;
    const res = tour.results[key];
    if (res && res.a === m.a && res.b === m.b) res.closed = false;
    if ($dialog.open) $dialog.close();
    window.Cloud.setLiveStatus(liveId(tour, key), 'live');
    commit(t('reopenScorerMsg'));
  }

  // ---------- Excel ----------
  let xlsxPromise = null;
  function loadXlsx() {
    if (!xlsxPromise) {
      xlsxPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'vendor/xlsx/xlsx.full.min.js';
        s.onload = () => resolve(window.XLSX);
        s.onerror = () => { xlsxPromise = null; reject(new Error('xlsx')); };
        document.head.appendChild(s);
      });
    }
    return xlsxPromise;
  }

  function pickFile(accept) {
    return new Promise(resolve => {
      const i = document.createElement('input');
      i.type = 'file'; i.accept = accept;
      i.onchange = () => resolve(i.files[0] || null);
      i.click();
    });
  }

  async function readRows(file) {
    const XLSX = await loadXlsx();
    const wb = XLSX.read(await file.arrayBuffer());
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })
      .map(r => r.map(c => String(c).trim()))
      .filter(r => r.some(Boolean));
    if (rows.length && rows[0].some(c => /cognome|nome|surname|name|επώνυμο|όνομα|genere|punti/i.test(c))) rows.shift();
    return rows;
  }

  async function downloadTemplate(name, header, example) {
    const XLSX = await loadXlsx();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, example]), 'Foglio1');
    XLSX.writeFile(wb, name);
  }

  // ---------- EOPE UPDATE: rapporto Excel dei risultati per la federazione ----------
  function teamFullText(tour, id) {
    if (id === L.BYE) return 'BYE';
    const e = id && entryById(tour, id);
    if (!e) return '';
    const a = player(e.p1), b = player(e.p2);
    return `${playerFull(a)} / ${playerFull(b)}`;
  }

  function slotText(tour, m, side) {
    const id = side ? m.b : m.a;
    if (id) return teamFullText(tour, id);
    const ph = L.placeholder(tour, m, side, nums(tour));
    return ph ? (ph.text || t(ph.kind, { g: ph.no || '?' })) : t('tbd');
  }

  function eopeMatchRow(tour, m) {
    const s = tour.schedule[m.key] || {};
    const st = m.stats;
    const status = m.bye ? 'BYE' : st ? t('matchClosed') : m.draft ? t('notClosed') : t('toBePlayed');
    const res = st ? m.res : null;
    return [
      gNo(tour, m), phaseLabel(tour, m), s.date ? fmtDate(s.date) : '', s.follow ? t('toFollow') : (s.time || ''), s.court || '',
      slotText(tour, m, 0), slotText(tour, m, 1),
      st ? st.a.sw : '', st ? st.b.sw : '', res ? res.sets.map(([a, b]) => `${a}-${b}`).join(' ') : '',
      st ? teamFullText(tour, m.winner) : '', st ? (st.tag || t('outcomeNormal')) : '', status
    ];
  }

  async function buildEope(tour) {
    const XLSX = await loadXlsx();
    const wb = XLSX.utils.book_new();
    const add = (name, rows, widths) => {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      if (widths) ws['!cols'] = widths.map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    };
    const now = new Date();
    const cat = catById(tour.categoryId);
    add(t('sheetInfo'), [
      ['EOPE UPDATE', tour.name],
      [t('generatedAt'), now.toLocaleString(I18n.locale())],
      [t('category'), cat ? cat.name : ''], [t('gender'), genderLabel(tour.gender)], [t('coefficient'), tour.coefficient],
      [t('location'), tour.location || ''], [t('tournamentDates'), fmtRange(tour.start, tour.end)],
      [t('inquiry'), fmtDateTime(tour.inquiry)], [t('format'), formatSummary(tour)], [t('statusLabel'), t('st_' + L.status(tour))]
    ], [28, 60]);
    const head = [t('colNo'), t('colPhase'), t('date'), t('time'), t('court'), t('colTeamA'), t('colTeamB'), t('colSetsA'), t('colSetsB'), t('colScores'), t('colWinner'), t('outcome'), t('colStatus')];
    const widths = [8, 26, 14, 10, 8, 40, 40, 7, 7, 18, 40, 12, 14];
    const noOf = m => parseInt(String(gNo(tour, m)).slice(1), 10) || 9999;
    const planned = L.plannedMatches(tour).sort((x, y) => noOf(x) - noOf(y));
    const qual = planned.filter(m => m.stage === 'qual');
    const main = planned.filter(m => m.stage !== 'qual');
    if (qual.length) add(t('sheetQual'), [head, ...qual.map(m => eopeMatchRow(tour, m))], widths);
    if (main.length) add(t('sheetMain'), [head, ...main.map(m => eopeMatchRow(tour, m))], widths);
    if (tour.pools) {
      const rows = [[t('pool'), t('place'), t('team'), t('winsShort'), t('lossesShort'), t('ptsShort'), t('setsShort'), t('pointsRatio')]];
      tour.pools.forEach((p, pi) => L.poolStandings(tour, pi).forEach((r, i) => rows.push([
        p.name || t('singlePool'), i + 1, teamFullText(tour, r.id), r.w, r.l, r.mp, `${r.sw}:${r.sl}`, r.pl ? +(r.pw / r.pl).toFixed(3) : ''
      ])));
      add(t('sheetPools'), rows, [10, 6, 44, 5, 5, 6, 8, 8]);
    }
    const pl = L.placements(tour);
    if (pl) {
      const rows = [[t('place'), t('team'), t('teamPts'), t('perPlayer')]];
      tour.entries.filter(e => pl[e.id] != null).sort((a, b) => pl[a.id] - pl[b.id]).forEach(e => {
        const tp = L.teamPoints(S(), tour, pl[e.id]);
        rows.push([pl[e.id], teamFullText(tour, e.id), tp, tp / 2]);
      });
      add(t('sheetFinal'), rows, [6, 50, 12, 12]);
    }
    const map = rankMap(tour.gender);
    const where = id => {
      const sp = tour.split;
      if (!sp) return '';
      if (sp.wc.includes(id)) return 'WC';
      if ((sp.qualWc || []).includes(id)) return 'WC-Q';
      if (sp.main.includes(id)) return t('entryMain');
      if (sp.qual.includes(id)) return t('entryQual');
      return t('reserves');
    };
    add(t('sheetEntries'), [['#', t('player1'), t('points'), t('player2'), t('points'), t('total'), t('entry')],
      ...tour.entries.map((e, i) => { const [a, b] = L.entryPts(tour, e, map); return [i + 1, playerFull(player(e.p1)), a, playerFull(player(e.p2)), b, L.round2(a + b), where(e.id)]; })],
      [5, 32, 9, 32, 9, 9, 14]);
    const stamp = now.toLocaleDateString('sv').replace(/-/g, '') + '_' + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
    const filename = `EOPE_UPDATE_${tour.name.replace(/[^\p{L}\p{N}]+/gu, '_')}_${stamp}.xlsx`;
    return { XLSX, wb, filename };
  }

  async function eopeDownload(tour) {
    try {
      const { XLSX, wb, filename } = await buildEope(tour);
      XLSX.writeFile(wb, filename);
      ui.flash = { text: t('eopeGenerated', { f: filename }) };
      render();
    } catch (e) { warn('excelError'); }
  }

  function eopeCard(tour) {
    return `<div class="card eope-card">
      <h2><i class="ti ti-file-spreadsheet" aria-hidden="true"></i> EOPE UPDATE</h2>
      <p class="muted small">${esc(t('eopeHelp'))}</p>
      <div class="btn-row">
        <button class="btn primary" data-action="eope-download" data-tid="${tour.id}"><i class="ti ti-download" aria-hidden="true"></i> ${esc(t('eopeDownload'))}</button>
        <button class="btn" data-action="eope-send" data-tid="${tour.id}"><i class="ti ti-mail-forward" aria-hidden="true"></i> ${esc(t('eopeSend'))}</button>
      </div>
    </div>`;
  }

  const validEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

  function openEopeSend(tour) {
    const list = S().eopeRecipients || [];
    ui.eopeTid = tour.id;
    loadXlsx().catch(() => {});   // pronto in anticipo: la condivisione deve partire subito dopo il tocco
    $dialog.innerHTML = `
      <form data-form="eope-send" method="dialog">
        <h2><i class="ti ti-mail-forward" aria-hidden="true"></i> EOPE UPDATE · ${esc(tour.name)}</h2>
        <fieldset><legend>${esc(t('eopeRecipients'))}</legend>
          ${list.length ? `<div class="rcpt-list">${list.map((r, i) => `<div class="rcpt">
              <label class="check"><input type="checkbox" name="to" value="${esc(r.email)}" ${r.default !== false ? 'checked' : ''}> ${esc(r.name ? `${r.name} <${r.email}>` : r.email)}</label>
              <button type="button" class="icon-btn" data-action="eope-remove" data-idx="${i}" aria-label="${esc(t('remove'))}"><i class="ti ti-x" aria-hidden="true"></i></button>
            </div>`).join('')}</div>` : `<p class="muted small">${esc(t('eopeNoRecipients'))}</p>`}
          <div class="rcpt-add">
            <input name="newName" placeholder="${esc(t('eopeName'))}" maxlength="60">
            <input name="newEmail" type="email" placeholder="nome@esempio.gr" autocapitalize="off" spellcheck="false">
            <button type="button" class="btn small" data-action="eope-add"><i class="ti ti-plus" aria-hidden="true"></i> ${esc(t('add'))}</button>
          </div>
        </fieldset>
        <p class="muted small">${esc(t('eopeSendHelp'))}</p>
        <p class="error" id="mdErr" role="alert"></p>
        <div class="form-actions">
          <button type="button" class="btn" data-action="close-dialog">${esc(t('cancel'))}</button>
          <button class="btn primary"><i class="ti ti-send" aria-hidden="true"></i> ${esc(t('eopeSendBtn'))}</button>
        </div>
      </form>`;
    if (!$dialog.open) $dialog.showModal();
  }

  async function eopeSend(f) {
    const tour = tourById(ui.eopeTid);
    const to = [...f.querySelectorAll('input[name=to]:checked')].map(i => i.value);
    const err = document.getElementById('mdErr');
    if (!to.length) { err.textContent = t('errNoRecipient'); return; }
    let built;
    try { built = await buildEope(tour); } catch (e) { err.textContent = t('excelError'); return; }
    const { XLSX, wb, filename } = built;
    const subject = t('eopeSubject', { t: tour.name });
    const body = t('eopeBody', { t: tour.name });
    const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const file = new File([data], filename, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    $dialog.close();
    // Telefono: condivisione con il file già allegato (gli indirizzi vanno negli appunti, la condivisione non li accetta).
    // PC: scarica il file e apre la posta con destinatari e oggetto già compilati.
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
    if (mobile && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        try { await navigator.clipboard.writeText(to.join(', ')); } catch (e) { /* appunti non disponibili */ }
        await navigator.share({ files: [file], title: subject, text: body });
        ui.flash = { text: t('eopeShared') }; render();
        return;
      } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    XLSX.writeFile(wb, filename);
    location.href = `mailto:${to.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body + '\n\n' + t('eopeAttachNote', { f: filename }))}`;
    ui.flash = { text: t('eopeMailOpened', { f: filename }) }; render();
  }

  function findOrCreatePlayer(last, first, gender, created) {
    const key = L.nameKey(last, first);
    // Riconosce anche le grafie memorizzate quando due giocatori sono stati uniti.
    let p = S().players.find(x => x.gender === gender &&
      [{ last: x.last, first: x.first }].concat(x.aliases || []).some(n => L.nameKey(n.last, n.first) === key));
    if (!p) {
      p = { id: Store.uid('p'), first, last, gender, club: '', base: 0 };
      S().players.push(p);
      created.n++;
    }
    return p;
  }

  // Colonna WC del file: "Q" / "WC-Q" / "qualifiche" = wild card qualifiche; "x", "sì", "WC", "M" = wild card main draw.
  const parseWc = v => {
    const s = String(v).trim();
    if (/^(q|wc-?q|qual.*|προκρ.*)$/i.test(s)) return 'qual';
    return /^(x|s|si|sì|y|yes|1|wc|m|main.*|ναι|true|v)$/i.test(s) ? 'main' : false;
  };
  const parseNum = v => { const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return isNaN(n) ? null : n; };

  async function importEntries(tour) {
    const file = await pickFile('.xlsx,.xls,.csv');
    if (!file) return;
    let rows;
    try { rows = await readRows(file); } catch (e) { return warn('excelError'); }
    if (tour.entries.length && !confirm(t('confirmReplaceEntries'))) return;
    applyEntryRows(tour, rows);
  }

  function applyEntryRows(tour, rows) {
    const created = { n: 0 }, entries = [], used = new Set();
    let skipped = 0;
    rows.forEach(r => {
      const [l1, f1, l2, f2, wc] = r;
      if (!l1 || !f1 || !l2 || !f2) { skipped++; return; }
      const [g1, g2] = teamGenders(tour);
      const p1 = findOrCreatePlayer(l1, f1, g1, created);
      const p2 = findOrCreatePlayer(l2, f2, g2, created);
      if (p1.id === p2.id || used.has(p1.id) || used.has(p2.id)) { skipped++; return; }
      used.add(p1.id); used.add(p2.id);
      entries.push({ id: Store.uid('e'), p1: p1.id, p2: p2.id, man1: null, man2: null, wc: parseWc(wc) });
    });
    // Le wild card già assegnate restano: si segnano nella nuova lista o vi vengono aggiunte.
    tour.entries.filter(e => e.wc).forEach(w => {
      const same = entries.find(e => [e.p1, e.p2].sort().join() === [w.p1, w.p2].sort().join());
      if (same) same.wc = w.wc;
      else if (!used.has(w.p1) && !used.has(w.p2)) entries.push(w);
    });
    tour.entries = entries;
    rankCache = {};
    L.sortEntries(tour, rankMap(tour.gender));
    commit({ text: t('entriesImported', { n: entries.length, c: created.n, s: skipped }), type: skipped ? 'warn' : 'ok' });
  }

  async function importRanking() {
    const file = await pickFile('.xlsx,.xls,.csv');
    if (!file) return;
    let rows;
    try { rows = await readRows(file); } catch (e) { return warn('excelError'); }
    applyRankingRows(rows);
  }

  function applyRankingRows(rows) {
    const created = { n: 0 };
    let updated = 0, skipped = 0;
    rows.forEach(r => {
      const [last, first, g, pts, club] = r;
      const gender = /^(m|u|uomo|maschile|male|a|α|άνδρας|ανδρ)/i.test(g) ? 'M' : /^(f|d|donna|femminile|female|γ|γυν)/i.test(g) ? 'F' : null;
      const n = parseNum(pts);
      if (!last || !first || !gender || n == null) { skipped++; return; }
      const p = findOrCreatePlayer(last, first, gender, created);
      p.base = n;
      if (club) p.club = club;
      updated++;
    });
    commit({ text: t('rankingImported', { n: updated, c: created.n, s: skipped }), type: skipped ? 'warn' : 'ok' });
  }

  // Assegna o toglie la wild card (kind: '' | 'main' | 'qual'), rispettando il numero previsto.
  function setWc(tour, id, kind) {
    const e = entryById(tour, id);
    if (kind && e.wc !== kind && tour.entries.filter(x => x.wc === kind).length >= wcLimit(tour, kind)) {
      return warn('errWcFull', { n: wcLimit(tour, kind) });
    }
    e.wc = kind || false;
    commit();
  }

  function setNotice(scope, text) {
    if (scope === 'home') { S().notice = text; if (!text) S().noticeUntil = ''; }
    else { const tour = tourById(scope); if (tour) tour.notice = text; }
    ui.editNotice = null;
    commit(t(text ? 'noticeSaved' : 'noticeRemoved'));
  }

  const compositionOk = c =>c.directSpots + c.qualSpots + c.wcSpots === c.mainSize;
  const compositionParams = c => ({ n: c.mainSize, s: c.directSpots + c.qualSpots + c.wcSpots });

  // ---------- azioni ----------
  const confirmed =(key, p) => confirm(t(key, p));
  const tourOf = el => tourById(el.dataset.tid);

  function move(list, id, dir) {
    const i = list.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
  }

  const actions = Object.assign({}, trActions, occActions, payActions, statActions, privacyActions, reportActions, cassaActions, {
    'fp-leave': el => {
      const fp = fpById(el.dataset.id), m = member();
      if (!fp || !m) return;
      if (!fpJoinOpen(fp)) return warn('fpLeaveClosed');
      if (!confirmed('fpLeaveConfirm', { n: fp.name })) return;
      window.Cloud.setFreeplay(fp.id, { name: personLabel(m), gender: m.gender }, false).then(() => { ui.flash = { text: t('fpLeft') }; render(); }).catch(fpErr);
    },
    'fp-edit': el => { ui.fpEdit = el.dataset.id; render(); },
    'fp-edit-cancel': () => { ui.fpEdit = null; render(); },
    'fp-delete': el => {
      const fp = fpById(el.dataset.id);
      if (!fp || !confirmed('fpDeleteConfirm', { n: fp.name })) return;
      window.Cloud.deleteFreeplay(fp, fpRegs(fp), fpAnons(fp)).then(() => { ui.flash = { text: t('fpDeleted') }; render(); }).catch(fpErr);
    },
    'user-delete': el => {
      const m = memberByUid(el.dataset.uid);
      if (!m) return;
      const email = (S().accounts || {})[m.uid] || '';
      if (!confirmed('userDeleteConfirm', { n: personName(m), e: email })) return;
      // tolto da tutti i gruppi degli allenamenti; piani eliminati; poi scheda, profilo, email, conferme, lista nera, coach
      const groups = (S().groups || []).filter(g => (g.uids || []).includes(m.uid)).map(g => {
        const names = Object.assign({}, g.names || {}); delete names[m.uid];
        const data = Object.assign({}, g, { uids: g.uids.filter(x => x !== m.uid), names, updated: Date.now() }); delete data.id;
        return { id: g.id, data, tr: !!trainingById(g.tid) };   // allenamento ancora esistente: si aggiorna il numero del gruppo
      });
      const planIds = (S().plans || []).filter(p => p.uid === m.uid).map(p => p.id);
      const packIds = (S().packs || []).filter(k => k.uid === m.uid).map(k => k.id);
      window.Cloud.deleteUser(m.uid, groups, planIds, packIds).then(() => {
        alert(t('userDeletedAlert', { n: personName(m), e: email || '—' }));
        ui.flash = { text: t('userDeleted', { n: personName(m) }) }; render();
      }).catch(e => warn('regError', { code: e.code || e.message }));
    },
    'ver-manual': el => {
      const on = el.dataset.on === '1', m = memberByUid(el.dataset.uid);
      if (!confirmed(on ? 'verConfirmAsk' : 'verUndoAsk', { n: m ? personName(m) : '' })) return;
      window.Cloud.setManualVerified(el.dataset.uid, on).then(() => { ui.flash = { text: t('saved') }; render(); }).catch(e => warn('regError', { code: e.code || e.message }));
    },
    'ps-accept': el => {
      const a = pappById(el.dataset.id), sr = a && psById(a.sid);
      if (!a || !sr) return;
      const others = psApps(sr.id).filter(x => x.id !== a.id);
      if (others.some(x => x.status === 'pending') && !confirmed('psAcceptConfirm', { n: `${a.last} ${a.first}` })) return;
      window.Cloud.acceptPartner(sr, a, others).then(() => { ui.flash = { text: t('psAcceptedOk') }; render(); }).catch(psErr);
    },
    'ps-decline': el => {
      const a = pappById(el.dataset.id), sr = a && psById(a.sid);
      if (!a || !sr) return;
      const act = psApps(sr.id).filter(x => x.id !== a.id && (x.status === 'pending' || x.status === 'accepted')).length;
      window.Cloud.declinePartner(a, sr, act).then(() => render()).catch(psErr);
    },
    'ps-revoke': el => {
      const a = pappById(el.dataset.id);
      if (!a || !confirmed('psRevokeConfirm')) return;
      window.Cloud.revokePartner(a, psById(a.sid)).then(() => { ui.flash = { text: t('chRevokedOk') }; render(); }).catch(psErr);
    },
    'ps-close': el => {
      const sr = psById(el.dataset.id);
      if (!sr || !confirmed('psCloseConfirm')) return;
      window.Cloud.closeSearch(sr.id, psApps(sr.id)).then(() => { ui.flash = { text: t('psClosed') }; render(); }).catch(psErr);
    },
    'ps-register': el => { const sr = psById(el.dataset.id); if (sr) psRegister(sr); },
    'ch-apply': el => {
      const c = chById(el.dataset.id), m = member();
      if (!c || !m) return;
      if (!canPlay()) return warn(banOf(m.uid).book ? 'banBookMsg' : 'verifyFirst');
      if (chMissing(c, m.gender) < 1) return warn('chNoSpot');
      window.Cloud.applyChallenge(c, personLabel(m), m.gender).then(() => { ui.flash = { text: t('chApplied') }; render(); }).catch(chErr);
    },
    'ch-app': el => {
      const a = (S().chapps || []).find(x => x.id === el.dataset.id), c = a && chById(a.cid);
      if (!a || !c) return;
      if (el.dataset.v === 'accepted' && chMissing(c, a.gender) < 1) return warn('chNoSpotFor', { g: t(a.gender === 'F' ? 'female' : 'male').toLowerCase() });
      if (el.dataset.v === 'declined' && a.status === 'accepted' && !confirmed('chRemoveConfirm', { n: a.name })) return;
      window.Cloud.setAppStatus(a.id, el.dataset.v).then(() => render()).catch(chErr);
    },
    'ch-revoke': el => {
      const a = (S().chapps || []).find(x => x.id === el.dataset.id), c = a && chById(a.cid);
      if (!a || !c || !confirmed('chRevokeConfirm')) return;
      window.Cloud.revokeApp(a, c, c.status === 'started' && a.status === 'accepted').then(() => { ui.flash = { text: t('chRevokedOk') }; render(); }).catch(chErr);
    },
    'ch-ack': el => window.Cloud.deleteApp(el.dataset.id).then(() => render()).catch(chErr),
    'ch-keep': el => {
      const c = chById(el.dataset.id);
      if (!c) return;
      window.Cloud.updateChallenge(c.id, { holdUntil: 0 }).then(() => Promise.all(chApps(c).filter(a => a.status === 'revoked').map(a => window.Cloud.deleteApp(a.id))))
        .then(() => { ui.flash = { text: t('chKept') }; render(); }).catch(chErr);
    },
    'ch-release': el => {
      const c = chById(el.dataset.id);
      if (!c || !confirmed('chReleaseConfirm')) return;
      window.Cloud.releaseChallenge(c).then(() => Promise.all(chApps(c).filter(a => a.status === 'revoked').map(a => window.Cloud.deleteApp(a.id))))
        .then(() => { ui.flash = { text: t('chReleased') }; render(); }).catch(chErr);
    },
    'ch-start': el => { const c = chById(el.dataset.id); if (c) chStart(c); },
    'ch-alt-ok': el => {
      const c = chById(el.dataset.id);
      if (!c || !c.alt) return;
      window.Cloud.updateChallenge(c.id, { alt: Object.assign({}, c.alt, { ok: [...new Set((c.alt.ok || []).concat(myUid()))] }) }).then(() => { ui.flash = { text: t('chAltConfirmed') }; render(); }).catch(chErr);
    },
    'ch-alt-book': el => { const c = chById(el.dataset.id); if (c) chBookAlt(c); },
    'ch-alt-cancel': el => window.Cloud.updateChallenge(el.dataset.id, { alt: null }).then(() => render()).catch(chErr),
    'ch-delete': el => {
      const c = chById(el.dataset.id);
      if (!c || !confirmed('chDeleteConfirm')) return;
      window.Cloud.deleteChallenge(c, chApps(c)).then(() => { ui.flash = { text: t('chDeleted') }; render(); }).catch(chErr);
    },
    'ch-guest-del': el => {
      const c = chById(el.dataset.id);
      if (!c) return;
      const guests = (c.guests || []).filter((g, i) => i !== Number(el.dataset.i));
      window.Cloud.updateChallenge(c.id, { guests }).then(() => render()).catch(chErr);
    },
    'verify-resend': () => {
      // al massimo un invio al minuto (Firebase blocca gli invii troppo ravvicinati)
      if (Date.now() < (ui.verifyWait || 0)) return warn('verifyWait', { s: Math.ceil((ui.verifyWait - Date.now()) / 1000) });
      ui.verifyWait = Date.now() + 60000;
      window.Cloud.resendVerification().then(() => { ui.flash = { text: t('verifySent', { e: window.Cloud.user.email }) }; render(); })
        .catch(e => warn(e.code === 'auth/too-many-requests' ? 'verifyTooMany' : 'verifyMailFail', { code: e.code || e.message }));
    },
    'verify-check': () => window.Cloud.checkVerified().then(ok => { if (ok) { ui.flash = { text: t('verifyOk') }; render(); } else warn('verifyNotYet'); }),
    'bk-day': el => { ui.bookDate = addDays(ui.bookDate || todayStr(), Number(el.dataset.delta)); render(); },
    'bk-band': el => { ui.bookBand = el.dataset.band; render(); },
    'bk-slot': el => {
      if (!(member() || admin())) { location.hash = '#/settings'; return warn('bkLoginFirst'); }
      slotClick(el.dataset.court, el.dataset.t);
    },
    'bk-clear': () => { ui.bkSel = null; render(); },
    'bk-shorter': () => { const x = ui.bkSel; if (x && toMin(x.to) - toMin(x.from) - 30 >= minBook()) { x.to = addMin(x.to, -30); render(); } },
    'bk-longer': () => { const x = ui.bkSel; if (x && selFree(x.courtId, x.date, x.from, addMin(x.to, 30), x.editId)) { x.to = addMin(x.to, 30); render(); } },
    'booking-open': el => {
      const b = (S().bookings || []).find(x => x.id === el.dataset.id);
      if (!b || !(admin() || b.userId === myUid())) return;
      ui.bkSel = { courtId: b.courtId, date: b.date, from: b.from, to: b.to, editId: b.id, userId: b.guest ? null : b.userId, blocked: b.blocked || '', guest: b.guest || '' };
      ui.bookDate = b.date;
      if (!location.hash.startsWith('#/book')) location.hash = '#/book'; else render();
      setTimeout(() => { const x = document.querySelector('.book-summary'); if (x) x.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 80);
    },
    'booking-confirm': () => confirmBooking(),
    'booking-delete': el => removeBooking(el.dataset.id),
    'notice-dismiss': el => { S().notices = (S().notices || []).filter(n => n.id !== el.dataset.id); window.Cloud.dismissNotice(el.dataset.id); render(); },
    'court-add': () => { S().courts = (S().courts || []).concat(Store.normCourt({ id: Store.uid('c'), name: `${t('bkCourt')} ${(S().courts || []).length + 1}` })); commit(); },
    'court-delete': el => {
      if (!confirmed('courtDeleteConfirm')) return;
      S().courts = (S().courts || []).filter(c => c.id !== el.dataset.id);
      (S().recurring || []).filter(r => r.courtId === el.dataset.id).forEach(r => window.Cloud.deleteRecurring(r).catch(() => {}));
      commit(t('saved'));
    },
    'recurring-delete': el => {
      const r = (S().recurring || []).find(x => x.id === el.dataset.id);
      if (!r || !confirmed('recurringDeleteConfirm', { c: courtName(r.courtId), d: dayName(r.dow), a: r.from, b: r.to })) return;
      window.Cloud.deleteRecurring(r).then(() => { ui.flash = { text: t('saved') }; render(); }).catch(e => warn('regError', { code: e.code || e.message }));
    },
    'court-copy': el => {
      const f = el.closest('form');
      [2, 3, 4, 5, 6, 7].forEach(n => {
        f.elements['open' + n].checked = f.elements.open1.checked;
        f.elements['from' + n].value = f.elements.from1.value;
        f.elements['to' + n].value = f.elements.to1.value;
      });
      // senza ridisegnare la pagina (gli orari copiati vanno ancora salvati)
      if (!f.querySelector('.flash')) { const fl = document.createElement('div'); fl.className = 'flash ok'; fl.textContent = t('courtCopied'); f.prepend(fl); }
    },
    'set-lang': el => { I18n.set(el.dataset.lang); render(); },
    'set-theme': el => setTheme(el.dataset.themeId),
    'set-design': el => setDesign(el.dataset.designId),
    'cal-view': el => { ui.calView = el.dataset.view; render(); },
    'eope-download': el => eopeDownload(tourOf(el)),
    'eope-send': el => openEopeSend(tourOf(el)),
    'eope-add': el => {
      const f = el.closest('form'), email = f.newEmail.value.trim(), name = f.newName.value.trim();
      const err = document.getElementById('mdErr');
      if (!validEmail(email)) { err.textContent = t('errEmail'); return; }
      const list = S().eopeRecipients = S().eopeRecipients || [];
      if (!list.some(r => r.email.toLowerCase() === email.toLowerCase())) list.push({ email, name });
      Store.save();
      openEopeSend(tourById(ui.eopeTid));
    },
    'eope-remove': el => {
      S().eopeRecipients.splice(+el.dataset.idx, 1);
      Store.save();
      openEopeSend(tourById(ui.eopeTid));
    },
    'toggle-visible': el => {
      const tour = tourOf(el), key = el.dataset.key, vis = !tour.visible[key];
      setVisible(tour, [key], vis);
      commit(t(vis ? 'matchPublished' : 'matchHiddenMsg'));
    },
    'vis-group': el => {
      const tour = tourOf(el), keys = el.dataset.keys.split(',').filter(Boolean), v = el.dataset.value === '1';
      setVisible(tour, keys, v);
      commit(t(v ? 'matchesPublished' : 'matchesHidden', { n: keys.length }));
    },
    'vis-all': el => {
      const tour = tourOf(el), v = el.dataset.value === '1';
      const keys = L.plannedMatches(tour).filter(m => !(m.bye && m.a === L.BYE && m.b === L.BYE)).map(m => m.key);
      setVisible(tour, keys, v);
      commit(t(v ? 'matchesPublished' : 'matchesHidden', { n: keys.length }));
    },
    'gs-nums-reset': el => {
      if (!confirmed('confirmGsNumsReset')) return;
      tourOf(el).gsNums = null;
      commit(t('saved'));
    },
    'toggle-past': () =>{ ui.showPast = !ui.showPast; if (ui.showPast) needPast(); render(); },
    'notice-edit': el => { ui.editNotice = el.dataset.scope; render(); },
    // iscrizioni online
    'reg-import': el => {
      const tour = tourOf(el);
      if ((regPhase(tour) === 'open' || regPhase(tour) === 'soon') && !confirmed('confirmRegImportEarly')) return;
      importRegistrations(tour);
      commit(t('regImported', { n: tour.entries.length }));
    },
    'reg-reopen': el => {
      const tour = tourOf(el);
      if (!confirmed('confirmRegReopen')) return;
      tour.entries = tour.entries.filter(e => !e.regId);
      tour.reg.closed = false; tour.reg.waitlist = [];
      commit();
    },
    'reg-state': el => { const tour = tourOf(el); tour.reg.status = el.dataset.v; commit(t('saved')); },
    'reg-confirm': el => { const tour = tourOf(el); if (!confirmed('confirmRegConfirm')) return; tour.reg.confirmed = true; ui.editEntry = null; commit(t('regConfirmedMsg')); },
    'reg-open-start': el => { ui.openRegFor = el.dataset.tid; render(); },
    'reg-unconfirm': el => { tourOf(el).reg.confirmed = false; commit(); },
    'reg-remove': el => {
      if (!confirmed('confirmRegRemove')) return;
      window.Cloud.removeRegistration(el.dataset.id).catch(e => warn('regError', { code: e.code || e.message }));
    },
    'reg-wait-add': el => {
      const tour = tourOf(el), w = tour.reg.waitlist[+el.dataset.idx];
      if (!w) return;
      const created = { n: 0 };
      const a = personToPlayer(w.p1, created), b = personToPlayer(w.p2, created);
      if (tour.entries.some(e => [e.p1, e.p2].some(id => id === a.id || id === b.id))) return warn('errAlreadyEntered');
      tour.entries.push({ id: Store.uid('e'), p1: a.id, p2: b.id, man1: null, man2: null, wc: false, regId: w.regId });
      tour.reg.waitlist.splice(+el.dataset.idx, 1);
      commit(t('teamAdded'));
    },
    'entry-edit-open': el => { ui.editEntry = el.dataset.id; render(); },
    'entry-edit-cancel': () => { ui.editEntry = null; render(); },
    'reg-cancel': el => {
      const x = (S().registrations || []).find(r => r.id === el.dataset.id);
      const tour = x && tourById(x.tid);
      if (!x || !tour) return;
      if (msOf(tour.reg ? tour.reg.startAt : tour.start) - nowMs() <= 86400000) return warn('regCancelLate');
      if (!confirmed('confirmRegCancel', { t: tour.name })) return;
      window.Cloud.removeRegistration(x.id).then(() => { ui.flash = { text: t('regCancelled') }; render(); })
        .catch(e => warn(e.code === 'permission-denied' ? 'regCancelLate' : 'regError', { code: e.code || e.message }));
    },
    'profile-edit': () => { ui.editProfile = true; render(); },
    'profile-cancel': () => { ui.editProfile = false; render(); },
    'msg-read': el => { window.Cloud.markRead(el.dataset.id); S().inbox = (S().inbox || []).concat(el.dataset.id); render(); },
    'msg-target': el => { ui.msgTarget = el.dataset.v; render(); },
    'msg-delete': el => { if (!confirmed('confirmMsgDelete')) return; window.Cloud.deleteMessage(el.dataset.id).catch(e => warn('regError', { code: e.code || e.message })); },
    'editorial-edit': el => { ui.editEditorial = +el.dataset.idx; render(); },
    'editorial-cancel': () => { ui.editEditorial = null; render(); },
    'editorial-clear': el => {
      if (!confirmed('confirmEdClear')) return;
      const i = +el.dataset.idx;
      S().editorial = (S().editorial || [null, null]).slice(); S().editorial[i] = null;
      ui.editEditorial = null;
      if (window.Cloud && window.Cloud.saveEditorial) window.Cloud.saveEditorial(i, null).catch(e => App.error(e.code || e.message));
      render();
    },
    'notice-cancel': () => { ui.editNotice = null; render(); },
    'notice-clear': el => {
      if (!confirmed('confirmNoticeClear')) return;
      setNotice(el.dataset.scope, '');
    },
    'logout': () => { window.Cloud.logout(); location.hash = '#/settings'; },
    'reset-password': el => {
      const email = el.closest('form').email.value.trim();
      if (!email) return warn('enterEmailFirst');
      window.Cloud.resetPassword(email)
        .then(() => { ui.flash = { text: t('resetSent') }; render(); })
        .catch(() => warn('resetFailed'));
    },
    'rank-gender': el => { ui.rankGender = el.dataset.g; render(); },
    'close-dialog': () => $dialog.close(),

    // lista d'ingresso
    'import-entries': el => importEntries(tourOf(el)),
    'template-entries': el => {
      const mixed = (tourOf(el) || {}).gender === 'X';
      downloadTemplate(mixed ? 'modello-iscritti-misto.xlsx' : 'modello-iscritti.xlsx',
        mixed ? ['Cognome uomo', 'Nome uomo', 'Cognome donna', 'Nome donna', 'WC (M = main draw, Q = qualifiche)'] : ['Cognome 1', 'Nome 1', 'Cognome 2', 'Nome 2', 'WC (M = main draw, Q = qualifiche)'],
        mixed ? ['Papadopoulos', 'Giorgos', 'Georgiou', 'Maria', ''] : ['Papadopoulos', 'Giorgos', 'Georgiou', 'Nikos', '']).catch(() => warn('excelError'));
    },
    'sort-entries': el => { const tour = tourOf(el); L.sortEntries(tour, rankMap(tour.gender)); commit(t('sorted')); },
    'entry-move': el => {
      const tour = tourOf(el);
      const ids = tour.entries.map(e => e.id);
      move(ids, el.dataset.id, +el.dataset.dir);
      tour.entries = ids.map(id => entryById(tour, id));
      commit();
    },
    'set-wc': el => setWc(tourOf(el), el.dataset.id, el.dataset.kind),
    'remove-entry': el => {
      const tour = tourOf(el);
      tour.entries = tour.entries.filter(e => e.id !== el.dataset.id);
      commit();
    },
    'lock-entries': el => {
      const tour = tourOf(el), c = tour.config;
      if (!compositionOk(c)) return warn('errComposition', compositionParams(c));
      L.lockEntries(tour, rankMap(tour.gender));
      commit(t('listLockedMsg'));
    },
    'unlock-entries': el => { L.unlockEntries(tourOf(el)); commit(); },
    'gen-qual': el => { L.generateQual(tourOf(el)); location.hash = `#/t/${el.dataset.tid}/calendar`; commit(t('qualGenerated')); },
    'skip-qual': el => { L.closeQual(tourOf(el)); commit(); },
    'reset-qual': el => { if (!confirmed('confirmResetQual')) return; L.resetQual(tourOf(el)); commit(); },
    'close-qual': el => { L.closeQual(tourOf(el)); commit(t('qualClosedMsg')); },
    'reopen-qual': el => { if (!confirmed('confirmReopenQual')) return; L.reopenQual(tourOf(el)); commit(); },

    // lista del tabellone principale
    'main-move': el => { move(tourOf(el).mainList, el.dataset.id, +el.dataset.dir); commit(); },
    'sort-main': el => {
      const tour = tourOf(el);
      const total = id => L.entryTotal(tour, entryById(tour, id));
      tour.mainList.sort((x, y) => total(y) - total(x));
      commit(t('sorted'));
    },
    'lock-main': el => { tourOf(el).mainLocked = true; commit(t('listLockedMsg')); },
    'unlock-main': el => { tourOf(el).mainLocked = false; commit(); },
    'start-main': el => {
      const tour = tourOf(el);
      L.startMainDraw(tour);
      location.hash = `#/t/${tour.id}/${tour.pools ? 'pools' : 'bracket'}`;
      commit(t('mainGenerated'));
    },
    'gen-bracket': el => {
      const tour = tourOf(el);
      L.generateBracket(tour);
      location.hash = `#/t/${tour.id}/bracket`;
      commit(t(tour.bracket.manual ? 'bracketGeneratedManual' : 'bracketGenerated'));
    },
    'auto-fill-bracket': el => {
      const tour = tourOf(el);
      if (tour.bracket.slots.some(Boolean) && !confirmed('confirmAutoFill')) return;
      L.autoFillBracket(tour);
      commit(t('bracketAutoFilled'));
    },
    'clear-bracket-slots': el => {
      const tour = tourOf(el);
      if (!confirmed('confirmClearSlots')) return;
      tour.bracket.slots = tour.bracket.slots.map(() => null);
      commit();
    },
    'reset-main': el => { if (!confirmed('confirmResetMain')) return; L.resetMain(tourOf(el)); commit(); },
    'close-tournament': el => {
      if (!confirmed('confirmCloseTournament')) return;
      tourOf(el).closed = true;
      location.hash = `#/t/${el.dataset.tid}/final`;
      commit(t('tournamentClosedMsg'));
    },
    'reopen-tournament': el => { if (!confirmed('confirmReopenTournament')) return; tourOf(el).closed = false; commit(t('tournamentReopenedMsg')); },
    'delete-tournament': el => {
      if (!confirmed('confirmDeleteTournament')) return;
      S().tournaments = S().tournaments.filter(x => x.id !== el.dataset.tid);
      location.hash = '#/tournaments';
      commit(t('tournamentDeleted'));
    },

    // partite
    'edit-match': el => openMatch(el.dataset.tid, el.dataset.key),
    'escore-open': el => openReferto(el.dataset.tid, el.dataset.key),
    'escore-reset': el => resetEscore(el.dataset.tid, el.dataset.key),
    'mine-all': () => { ui.mineAll = !ui.mineAll; render(); },
    'pdf-view': el => viewPdf(el.dataset.id),
    'pdf-build': el => buildPdfs(el.dataset.tid),
    'pdf-zip': el => zipPdfs(el.dataset.tid),
    'scorer-remove': el => {
      if (!confirmed('scorerRemoveConfirm', { e: el.dataset.email })) return;
      window.Cloud.removeScorer(el.dataset.email).then(() => { ui.scorers = null; ui.flash = { text: t('scorerRemoved') }; render(); })
        .catch(err => warn('scorerErr', { code: err.code || err.message }));
    },
    'escore-approve': el => approveEscore(el.dataset.tid, el.dataset.key),
    'escore-reopen': el => reopenEscore(el.dataset.tid, el.dataset.key),
    'match-clear': el => { if (confirmed('confirmClearResult')) saveMatch(el.closest('form'), 'clear'); },
    'match-reopen': el => saveMatch(el.closest('form'), 'reopen'),

    // giocatori
    'import-ranking': () => importRanking(),
    'template-ranking': () => downloadTemplate('modello-ranking.xlsx', ['Cognome', 'Nome', 'Genere (M/F)', 'Punti', 'Società'], ['Papadopoulos', 'Giorgos', 'M', '250', '']).catch(() => warn('excelError')),
    'merge-pair': el => mergePlayers(el.dataset.keep, el.dataset.dup),
    'edit-player': el => { ui.editingPlayer = el.dataset.id; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    'cancel-edit-player': () => { ui.editingPlayer = null; render(); },
    'delete-player': el => {
      const id = el.dataset.id;
      if (S().tournaments.some(x => x.entries.some(e => e.p1 === id || e.p2 === id))) return warn('playerInUse');
      if (!confirmed('confirmDeletePlayer')) return;
      S().players = S().players.filter(p => p.id !== id);
      if (ui.editingPlayer === id) ui.editingPlayer = null;
      commit();
    },

    // categorie
    'new-category': () => {
      const c = { id: Store.uid('cat'), name: t('newCategory'), rows: [[1, 100], [2, 90], [3, 80], [4, 70], [5, 60], [9, 45], [13, 35], [17, 25]] };
      S().categories.push(c);
      ui.openCat = c.id;
      commit();
    },
    'delete-category': el => {
      if (!confirmed('confirmDeleteCategory')) return;
      S().categories = S().categories.filter(x => x.id !== el.dataset.id);
      commit();
    },
    'add-row': el => {
      const rows = el.closest('form').querySelector('.pt-rows');
      const last = rows.lastElementChild;
      const next = last ? (parseInt(last.querySelector('[name=place]').value, 10) || 0) + 1 : 1;
      rows.insertAdjacentHTML('beforeend', tableRowInputs(next, 0));
      rows.lastElementChild.querySelector('[name=place]').focus();
    },
    'del-row': el => el.closest('.pt-row').remove(),
    'gs-add-row': el => {
      const which = el.dataset.which;
      const rows = el.closest('.gs-table').querySelector('.pt-rows');
      const last = rows.lastElementChild;
      const next = last ? (parseInt(last.querySelector(`[name=${which}Place]`).value, 10) || 0) + 1 : 1;
      rows.insertAdjacentHTML('beforeend', gsRowInputs(which, next, 0));
      rows.lastElementChild.querySelector(`[name=${which}Place]`).focus();
    },

    // dati
    'export': () => {
      const blob = new Blob([JSON.stringify(Object.assign({}, S(), { live: undefined, referti: undefined, refPdf: undefined, refLoaded: undefined, pdfLoaded: undefined }), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `manofuori-cup-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    'import-backup': async () => {
      const file = await pickFile('application/json,.json');
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!Store.isValid(data)) throw new Error('invalid');
        if (!confirmed('confirmImport')) return;
        Store.replace(data);
        location.hash = '#/';
        commit(t('importDone'));
      } catch (e) { warn('importError'); }
    },
    'delete-all': () => {
      if (!isOwner()) return;
      if (!confirmed('confirmDeleteAll')) return;
      const word = prompt(t('typeDelete'));
      if (!word || word.trim().toUpperCase() !== t('deleteWord').toUpperCase()) return warn('deleteAborted');
      Store.replace(Store.empty());
      location.hash = '#/';
      commit(t('allDeleted'));
    }
  });

  const forms = Object.assign({}, trForms, occForms, payForms, cassaForms, {
    'fp-save': f => fpSave(f),
    'fp-join': f => {
      const fp = fpById(f.dataset.id), m = member();
      if (!fp || !m) return;
      if (needsVerify()) return warn('verifyFirst');
      if (!fpJoinOpen(fp)) return warn('fpJoinClosed');
      const bl = [...f.querySelectorAll('[name=bl]:checked')].map(x => x.value);
      if (fp.blocks && !bl.length) return warn('fpPickBlock');
      window.Cloud.setFreeplay(fp.id, { name: personLabel(m), gender: m.gender, level: f.level.value, bl }, true).then(() => { ui.flash = { text: t('fpJoined') }; render(); }).catch(fpErr);
    },
    'fp-blocks': f => {
      const fp = fpById(f.dataset.id);
      if (!fp) return;
      if (!fpJoinOpen(fp)) return warn('fpLeaveClosed');
      const bl = [...f.querySelectorAll('[name=bl]:checked')].map(x => x.value);
      if (!bl.length) return warn('fpPickBlock');
      window.Cloud.setFreeplayBlocks(fp.id, bl).then(() => { (ui.keep || {})['fpbl-' + fp.id] = false; ui.flash = { text: t('fpBlocksSaved') }; render(); }).catch(fpErr);
    },
    'user-create': f => {
      const d = { first: f.first.value.trim(), last: f.last.value.trim(), gender: f.gender.value, email: f.email.value.trim(), password: f.password.value };
      if (!d.first || !d.last || !d.gender) return warn('errRegFields');
      const btn = f.querySelector('button.primary'); btn.disabled = true;
      window.Cloud.adminCreateUser(d).then(() => { (ui.keep || {})['user-create'] = false; ui.flash = { text: t('userCreated', { e: d.email }) }; render(); })
        .catch(e => { btn.disabled = false; warn(e.code === 'auth/email-already-in-use' ? 'userCreateExists' : e.code === 'auth/weak-password' ? 'registerWeak' : 'regError', { code: e.code || e.message }); });
    },
    'ps-open': f => {
      const tour = tourById(f.dataset.tid), m = member();
      if (!tour || !m || regPhase(tour) !== 'open') return warn('regClosedMsg');
      if (needsVerify()) return warn('verifyFirst');
      window.Cloud.openSearch({ tid: tour.id, name: personLabel(m), gender: m.gender, pg: psPartnerGender(tour, m.gender), level: f.level.value, role: f.role.value })
        .then(() => { ui.flash = { text: t('psOpened') }; render(); }).catch(psErr);
    },
    'ps-apply': f => {
      const sr = psById(f.dataset.id), m = member();
      if (!sr) return;
      const d = m ? { first: m.first, last: m.last, gender: m.gender, contact: '' }
        : { first: f.first.value.trim(), last: f.last.value.trim(), gender: sr.pg, contact: f.contact.value.trim() };
      if (!d.first || !d.last) return warn('errRegFields');
      if (m && needsVerify()) return warn('verifyFirst');
      Object.assign(d, { level: f.level.value, role: f.role.value });
      const btn = f.querySelector('button.primary'); btn.disabled = true;
      window.Cloud.applyPartner(sr.id, d).then(() => { (ui.keep || {})['psa-' + sr.id] = false; ui.flash = { text: t(m ? 'psAppliedMember' : 'psAppliedGuest') }; render(); })
        .catch(e => { btn.disabled = false; psErr(e); });
    },
    'ch-create': f => chCreate(f),
    'ch-guest': f => {
      const c = chById(f.dataset.id);
      if (!c) return;
      const g = { first: f.first.value.trim(), last: f.last.value.trim(), gender: f.gender.value };
      if (!g.first || !g.last || !g.gender) return warn('errRegFields');
      if (chMissing(c, g.gender) < 1) return warn('chNoSpotFor', { g: t(g.gender === 'F' ? 'female' : 'male').toLowerCase() });
      window.Cloud.updateChallenge(c.id, { guests: (c.guests || []).concat(g) }).then(() => { ui.flash = { text: t('chGuestAdded') }; render(); }).catch(chErr);
    },
    'court-save': f => {
      const c = courtById(f.id.value);
      if (!c) return;
      const hours = {};
      for (let n = 1; n <= 7; n++) {
        const o = { open: f.elements['open' + n].checked, from: f.elements['from' + n].value, to: f.elements['to' + n].value };
        if (o.open && o.to <= o.from) return warn('courtHoursErr', { d: dayName(n) });
        hours[n] = o;
      }
      Object.assign(c, { name: f.name.value.trim() || c.name, visible: f.visible.checked, hours });
      commit(t('saved'));
    },
    'recurring-add': f => addRecurringForm(f),
    'booking-settings': f => {
      if (Number(f.minHours.value) > Number(f.maxHours.value)) return warn('bkMinMax');
      S().booking = { minHours: Number(f.minHours.value) || 0.5, maxHours: Number(f.maxHours.value) || 2, maxPerDay: Math.max(1, parseInt(f.maxPerDay.value, 10) || 1), daysAhead: Math.max(1, parseInt(f.daysAhead.value, 10) || 7) };
      commit(t('saved'));
    },
    'book-rewards-save': f => {
      const th = {};
      REWARDS.forEach(([k]) => { const v = parseInt(f[k].value, 10); if (v > 0) th[k] = v; });
      S().bookRewards = th;
      commit(t('saved'));
    },
    'tour-create': f => {
      const d = readRegForm(f);
      if (d.err) return warn(d.err);
      const tour = L.normalize({ id: Store.uid('t'), name: d.name, gender: d.gender || 'M', start: d.startAt.slice(0, 10), end: '', categoryId: null, coefficient: 1,
        format: 'single_elim', entries: [], reg: { startAt: d.startAt, deadline: d.deadline, maxTeams: d.maxTeams, status: d.status, closed: false, confirmed: false, formulaSet: false } });
      S().tournaments.push(tour);
      location.hash = `#/t/${tour.id}/manage`;
      commit(t('tournamentCreated'));
    },
    'tour-reg-edit': f => {
      const tour = tourById(f.dataset.tid), d = readRegForm(f);
      if (d.err) return warn(d.err);
      tour.name = d.name; if (d.gender) tour.gender = d.gender;
      tour.start = d.startAt.slice(0, 10);
      Object.assign(tour.reg, { startAt: d.startAt, deadline: d.deadline, maxTeams: d.maxTeams, status: d.status });
      commit(t('saved'));
    },
    'entry-edit': f => {
      const tour = tourById(f.dataset.tid), e = entryById(tour, f.dataset.id);
      const created = { n: 0 }, [g1, g2] = teamGenders(tour);
      const p1 = findOrCreatePlayer(f.l1.value.trim(), f.f1.value.trim(), g1, created);
      const p2 = findOrCreatePlayer(f.l2.value.trim(), f.f2.value.trim(), g2, created);
      if (p1.id === p2.id) return warn('errSamePlayer');
      if (tour.entries.some(x => x.id !== e.id && [x.p1, x.p2].some(id => id === p1.id || id === p2.id))) return warn('errAlreadyEntered');
      Object.assign(e, { p1: p1.id, p2: p2.id, man1: null, man2: null });
      ui.editEntry = null;
      commit(t('saved'));
    },
    'rewards-save': f => {
      const r = {};
      REWARDS.forEach(([k]) => { const v = parseInt(f[k].value, 10); r[k] = v > 0 ? v : null; });
      S().rewards = r;
      commit(t('saved'));
    },
    'msg-send': f => sendMessageForm(f),
    'nick-save': f => {
      const uid = f.dataset.uid, nick = f.nick.value.trim();
      const taken = Object.entries(S().nicks || {}).find(([u, n]) => u !== uid && n && n.toLowerCase() === nick.toLowerCase());
      if (nick && taken) return warn('nickTaken');
      S().nicks = Object.assign({}, S().nicks || {});
      if (nick) S().nicks[uid] = nick; else delete S().nicks[uid];
      if (f.link) {
        S().players.forEach(p => { if (p.uid === uid && p.id !== f.link.value) delete p.uid; });
        const p = player(f.link.value);
        if (p) p.uid = uid;
      }
      commit(t('saved'));
    },
    'reg-open-legacy': f => {
      const tour = tourById(f.dataset.tid);
      const d = { startAt: f.startAt.value, deadline: f.deadline.value, maxTeams: Math.max(2, parseInt(f.maxTeams.value, 10) || 2), status: f.status.value };
      if (!d.startAt || !d.deadline) return warn('errRegFields');
      if (msOf(d.deadline) >= msOf(d.startAt)) return warn('errRegDeadline');
      tour.reg = Object.assign(d, { closed: false, confirmed: false, formulaSet: true });
      tour.start = d.startAt.slice(0, 10);
      ui.openRegFor = null;
      commit(t('regOpenedMsg'));
    },
    'tournament-new': f => {
      const data = readTournamentForm(f, null);
      if (!compositionOk(data.config)) return warn('errComposition', compositionParams(data.config));
      if (data.format === 'gold_silver' && (!data.goldRows.length || !data.silverRows.length)) return warn('errGsTables');
      const tour =L.normalize(Object.assign({ id: Store.uid('t'), entries: [] }, data));
      S().tournaments.push(tour);
      location.hash = `#/t/${tour.id}/manage`;
      commit(t('tournamentCreated'));
    },
    'tournament-edit': f => {
      const tour = tourById(f.dataset.tid);
      const data = readTournamentForm(f, tour);
      if (!compositionOk(data.config)) return warn('errComposition', compositionParams(data.config));
      if ((data.format || tour.format) === 'gold_silver' && (!data.goldRows.length || !data.silverRows.length)) return warn('errGsTables');
      Object.assign(tour, data);
      if (tour.format === 'gold_silver') L.normalize(tour);
      if (tour.reg && tour.reg.confirmed && !tour.reg.formulaSet) { tour.reg.formulaSet = true; location.hash = `#/t/${tour.id}/manage`; }
      commit(t('saved'));
    },
    'entry-add': f => {
      const tour = tourById(f.dataset.tid);
      const created = { n: 0 };
      const [g1, g2] = teamGenders(tour);
      const p1 = findOrCreatePlayer(f.l1.value.trim(), f.f1.value.trim(), g1, created);
      const p2 = findOrCreatePlayer(f.l2.value.trim(), f.f2.value.trim(), g2, created);
      if (p1.id === p2.id) return warn('errSamePlayer');
      if (tour.entries.some(e => [e.p1, e.p2].some(id => id === p1.id || id === p2.id))) return warn('errAlreadyEntered');
      const kind = f.wc.value;
      if (kind && tour.entries.filter(x => x.wc === kind).length >= wcLimit(tour, kind)) return warn('errWcFull', { n: wcLimit(tour, kind) });
      tour.entries.push({ id: Store.uid('e'), p1: p1.id, p2: p2.id, man1: null, man2: null, wc: kind || false });
      commit(t('teamAdded'));
    },
    'editorial-save': f => { saveEditorialForm(f); },
    'notice-save': f => {
      if (f.dataset.scope === 'home') S().noticeUntil = f.until ? f.until.value : '';
      setNotice(f.dataset.scope, f.text.value.trim());
    },
    'wc-add': f => {
      const tour = tourById(f.dataset.tid), kind = f.dataset.kind;
      if (tour.entries.filter(x => x.wc === kind).length >= wcLimit(tour, kind)) return warn('errWcFull', { n: wcLimit(tour, kind) });
      const created = { n: 0 };
      const [g1, g2] = teamGenders(tour);
      const p1 = findOrCreatePlayer(f.l1.value.trim(), f.f1.value.trim(), g1, created);
      const p2 = findOrCreatePlayer(f.l2.value.trim(), f.f2.value.trim(), g2, created);
      if (p1.id === p2.id) return warn('errSamePlayer');
      // Squadra già iscritta: diventa wild card. Altrimenti viene aggiunta alla lista come wild card.
      const same = tour.entries.find(e => (e.p1 === p1.id && e.p2 === p2.id) || (e.p1 === p2.id && e.p2 === p1.id));
      if (same) {
        same.wc = kind;
      } else {
        if (tour.entries.some(e => [e.p1, e.p2].some(id => id === p1.id || id === p2.id))) return warn('errAlreadyEntered');
        tour.entries.push({ id: Store.uid('e'), p1: p1.id, p2: p2.id, man1: null, man2: null, wc: kind });
      }
      commit(t('wcAdded'));
    },
    'player-save': f => {
      const data = { first: f.first.value.trim(), last: f.last.value.trim(), gender: f.gender.value, club: f.club.value.trim(), base: parseNum(f.base.value) || 0 };
      if (ui.editingPlayer) {
        const p = player(ui.editingPlayer);
        const inUse = S().tournaments.some(x => x.entries.some(e => e.p1 === p.id || e.p2 === p.id));
        if (inUse && data.gender !== p.gender) return warn('playerInUse');
        Object.assign(p, data);
        ui.editingPlayer = null;
      } else {
        S().players.push(Object.assign({ id: Store.uid('p') }, data));
      }
      commit(t('saved'));
    },
    'merge-players': f => mergePlayers(f.keep.value, f.dup.value),
    'category-save': f => {
      const c = catById(f.dataset.id);
      const places = [...f.querySelectorAll('[name=place]')].map(x => parseInt(x.value, 10));
      const pts = [...f.querySelectorAll('[name=pts]')].map(x => parseNum(x.value));
      const rows = places.map((p, i) => [p, pts[i]]).filter(r => r[0] > 0 && r[1] != null && r[1] >= 0);
      if (!rows.length) return warn('errTableEmpty');
      if (new Set(rows.map(r => r[0])).size !== rows.length) return warn('errTableDup');
      c.name = f.name.value.trim();
      c.rows = rows.sort((x, y) => x[0] - y[0]);
      ui.openCat = c.id;
      commit(t('saved'));
    },
    'scorer-add': f => {
      const btn = f.querySelector('button.primary');
      btn.disabled = true;
      const email = f.email.value.trim();
      window.Cloud.addScorer(email, f.password.value, f.court.value, f.tid.value)
        .then(r => { ui.scorers = null; ui.flash = { text: t(r.existed ? 'scorerExists' : 'scorerAdded', { e: email }) }; render(); })
        .catch(err => { btn.disabled = false; warn('scorerErr', { code: err.code || err.message }); });
    },
    'register': f => {
      const btn = f.querySelector('button.primary');
      const d = { first: f.first.value.trim(), last: f.last.value.trim(), gender: f.gender.value, email: f.email.value.trim(), password: f.password.value };
      if (!d.first || !d.last || !d.gender) return warn('errRegFields');
      if (!f.privacy.checked) return warn('registerPrivacyNeeded');
      // contro i tentativi automatici: almeno 20 secondi tra un tentativo e l'altro (oltre ai limiti di Firebase)
      if (Date.now() < (ui.regWait || 0)) return warn('tooManyTries');
      ui.regWait = Date.now() + 20000;
      d.privacyVer = Legal.VERSION;
      btn.disabled = true;
      window.Cloud.register(d).then(res => {
        ui.verifyWait = Date.now() + 60000;
        if (res && res.mailErr) warn('verifyMailFail', { code: res.mailErr }); else ui.flash = { text: t('registerOkMail', { e: d.email }) };
        location.hash = '#/me'; render();
      })
        .catch(e => { btn.disabled = false; ui.showRegister = true; warn(e.code === 'auth/email-already-in-use' ? 'registerExists' : e.code === 'auth/weak-password' ? 'registerWeak' : e.code === 'auth/too-many-requests' ? 'tooManyTries' : 'registerErr', { code: e.code || e.message }); });
    },
    'reg-signup': f => submitSignup(f),
    'profile-save': f => {
      const d = { first: f.first.value.trim(), last: f.last.value.trim(), gender: f.gender.value };
      if (!d.first || !d.last) return warn('errRegFields');
      window.Cloud.updateProfile(d).then(() => { ui.editProfile = false; ui.flash = { text: t('saved') }; render(); })
        .catch(e => warn('regError', { code: e.code || e.message }));
    },
    'login': f => {
      const btn = f.querySelector('button.primary');
      btn.disabled = true;
      ui.afterLogin = true;
      // si esce dal campo della password (e su telefono si chiude la tastiera): la pagina si aggiorna subito
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      window.Cloud.login(f.email.value.trim(), f.password.value)
        .then(() => new Promise(resolve => {
          // si aspetta che il profilo sia caricato (connessione lenta: fino a 10 secondi), poi conferma e prima pagina
          const t0 = Date.now();
          (function wait() { if (member() || admin() || scorer() || Date.now() - t0 > 10000) resolve(); else setTimeout(wait, 150); })();
        }))
        .then(() => {
          ui.flash = { text: t('loginOk') };
          if (member() && location.hash.startsWith('#/settings')) location.hash = '#/';
          render();
        })
        .catch(() => { btn.disabled = false; warn('loginFailed'); });
    }
  });

  // Azioni consentite a tutti; le altre solo agli amministratori.
  const PUBLIC_ACTIONS = new Set(['set-lang', 'set-theme', 'set-design', 'cal-view', 'toggle-past', 'rank-gender', 'logout', 'reset-password', 'close-dialog', 'bk-day', 'bk-band', 'bk-slot', 'bk-clear', 'bk-shorter', 'bk-longer']);
  // admin tornei: solo le azioni dei tornei (categorie, giocatori, iscrizioni, tabelloni, referti, refertisti)
  const TOUR_ACTIONS = new Set(['eope-download', 'eope-send', 'eope-add', 'eope-remove', 'toggle-visible', 'vis-group', 'vis-all', 'gs-nums-reset', 'notice-edit', 'notice-cancel', 'notice-clear', 'reg-import', 'reg-reopen', 'reg-state', 'reg-confirm', 'reg-open-start', 'reg-unconfirm', 'reg-remove', 'reg-wait-add', 'entry-edit-open', 'entry-edit-cancel', 'import-entries', 'template-entries', 'sort-entries', 'entry-move', 'set-wc', 'remove-entry', 'lock-entries', 'unlock-entries', 'gen-qual', 'skip-qual', 'reset-qual', 'close-qual', 'reopen-qual', 'main-move', 'sort-main', 'lock-main', 'unlock-main', 'start-main', 'gen-bracket', 'auto-fill-bracket', 'clear-bracket-slots', 'reset-main', 'close-tournament', 'reopen-tournament', 'delete-tournament', 'edit-match', 'escore-open', 'escore-reset', 'mine-all', 'pdf-view', 'pdf-build', 'pdf-zip', 'scorer-remove', 'escore-approve', 'escore-reopen', 'match-clear', 'match-reopen', 'import-ranking', 'template-ranking', 'merge-pair', 'edit-player', 'cancel-edit-player', 'delete-player', 'new-category', 'delete-category', 'add-row', 'del-row', 'gs-add-row']);
  const TOUR_FORMS = new Set(['tour-create', 'tour-reg-edit', 'reg-open-legacy', 'tournament-new', 'tournament-edit', 'entry-edit', 'entry-add', 'wc-add', 'player-save', 'merge-players', 'category-save', 'scorer-add', 'rewards-save', 'notice-save']);
  // cassa: registra incassi, scarica ricevute e prospetto
  const CASH_ACTIONS = new Set(['ca-month', 'ca-addline', 'ca-xlsx', 'rc-pdf']);
  const CASH_FORMS = new Set(['ca-save']);
  const SCORER_ACTIONS = new Set(['escore-open', 'mine-all', 'pdf-view', 'pdf-build', 'pdf-zip']);
  const PUBLIC_FORMS = new Set(['login', 'register', 'ps-apply']);
  const MEMBER_ACTIONS = new Set(['reg-cancel', 'profile-edit', 'profile-cancel', 'msg-read', 'verify-resend', 'verify-check', 'booking-open', 'booking-confirm', 'booking-delete', 'notice-dismiss', 'ch-apply', 'ch-app', 'ch-revoke', 'ch-ack', 'ch-keep', 'ch-release', 'ch-start', 'ch-alt-ok', 'ch-alt-book', 'ch-alt-cancel', 'ch-delete', 'ch-guest-del', 'ps-accept', 'ps-decline', 'ps-revoke', 'ps-close', 'ps-register', 'fp-leave', 'tr-month', 'tr-day', 'tr-tab', 'att-set', 'spot-apply', 'spot-withdraw', 'spot-seen', 'rc-pdf', 'st-period', 'st-ref', 'privacy-accept', 'my-data', 'delete-request']);
  const MEMBER_FORMS = new Set(['reg-signup', 'profile-save', 'ch-create', 'ch-guest', 'ps-open', 'fp-join', 'fp-blocks']);
  let submitMode = 'save';

  // reminder delle prenotazioni: la prima pagina si aggiorna ogni minuto (compaiono e spariscono da soli)
  setInterval(() => { const h = location.hash || '#/'; if (h === '#/' || h === '#') refresh(); }, 60000);
  // tornando nell'app dopo aver aperto il link dell'email, la conferma si controlla da sola
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && needsVerify()) window.Cloud.checkVerified().then(ok => { if (ok) { ui.flash = { text: t('verifyOk') }; render(); } }).catch(() => {});
  });
  document.addEventListener('click', e => {
    const sub = e.target.closest('[data-submit]');
    if (sub) submitMode = sub.dataset.submit;
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    if (!admin() && !PUBLIC_ACTIONS.has(el.dataset.action) && !(tourAdmin() && TOUR_ACTIONS.has(el.dataset.action)) && !(cashier() && CASH_ACTIONS.has(el.dataset.action)) && !(scorer() && SCORER_ACTIONS.has(el.dataset.action)) && !(member() && MEMBER_ACTIONS.has(el.dataset.action))) return;
    fn(el);
  });

  document.addEventListener('submit', e => {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    if (f.dataset.form === 'match') { if (tourAdmin()) saveMatch(f, submitMode); submitMode = 'save'; return; }
    if (f.dataset.form === 'eope-send') { if (tourAdmin()) eopeSend(f); return; }
    const fn = forms[f.dataset.form];
    if (fn && (admin() || (tourAdmin() && TOUR_FORMS.has(f.dataset.form)) || (cashier() && CASH_FORMS.has(f.dataset.form)) || PUBLIC_FORMS.has(f.dataset.form) || (member() && MEMBER_FORMS.has(f.dataset.form)))) fn(f);
    submitMode = 'save';
  });

  document.addEventListener('change', e => {
    const el = e.target;
    const form = el.closest('form[data-form^="tournament-"]');
    if (form) syncTournamentForm(form);
    switch (el.dataset.change) {
      case 'reg-search': onRegSearch(el); break;
      case 'grp-pick': {   // scheda già esistente: precompila tesseramento e certificato
        const a = athleteOf(el.value), f = el.form;
        f.tess.checked = !!(a && a.tess && a.tess[seasonOf(todayStr())]); f.certExp.value = (a && a.certExp) || '';
        break;
      }
      case 'coach-all': if (admin()) { const c = coachOf(el.dataset.uid); window.Cloud.setCoach(el.dataset.uid, { all: el.value === '1', name: (c && c.name) || coachName(el.dataset.uid) }).then(() => { ui.flash = { text: t('saved') }; render(); }).catch(e => warn('regError', { code: e.code || e.message })); } break;
      case 'ath-filter': ui.athFilter = el.value; render(); break;
      case 'pay-kind': ui.payKind = el.value; render(); break;
      case 'pay-period': el.form.amount.value = el.value === 'quarter' ? el.dataset.q : el.dataset.m; break;
      case 'fp-all': if (el.checked) el.form.querySelectorAll('[name=lv]:not([value=all])').forEach(x => { x.checked = false; }); break;
      case 'fp-lv': { const any = [...el.form.querySelectorAll('[name=lv]:not([value=all])')].some(x => x.checked); el.form.querySelector('[name=lv][value=all]').checked = !any; break; }
      case 'ch-type': ui.chType = el.value; ui.chFormOpen = true; render(); break;
      case 'bk-date': if (el.value) { ui.bookDate = el.value; render(); } break;
      case 'bk-np': if (ui.bkSel) { ui.bkSel.np = +el.value; ui.bkSel.players = (ui.bkSel.players || []).slice(0, ui.bkSel.np); render(); } break;
      case 'bk-pl': if (ui.bkSel) { (ui.bkSel.players = ui.bkSel.players || [])[+el.dataset.i] = el.value; render(); } break;
      case 'bk-rem': if (ui.bkSel) { ui.bkSel.remind = +el.value; render(); } break;
      case 'bk-user': if (ui.bkSel) { ui.bkSel.userId = el.value || null; if (el.value) { ui.bkSel.blocked = ''; ui.bkSel.guest = ''; } render(); } break;
      case 'bk-guest': if (ui.bkSel) { ui.bkSel.guest = el.value.trim(); if (ui.bkSel.guest) { ui.bkSel.userId = null; ui.bkSel.blocked = ''; } render(); } break;
      case 'bk-blocked': if (ui.bkSel) { ui.bkSel.blocked = el.value.trim(); if (ui.bkSel.blocked) { ui.bkSel.userId = null; ui.bkSel.guest = ''; } render(); } break;
      // cassa: ricevuta a scelta solo per i contanti; prenotazione da scegliere per la quota del campo
      case 'ca-method': {
        const fm = el.form, cash = el.value === 'cash';
        fm.querySelector('.ca-rc').hidden = !cash; fm.querySelector('.ca-rc-note').hidden = cash;
        break;
      }
      case 'ca-cat': {
        const bk = el.closest('.ca-line').querySelector('[name=bk]');
        if (bk) bk.hidden = el.value !== 'q_court';
        break;
      }
      case 'role': {
        if (!admin()) return;
        const m = memberByUid(el.dataset.uid);
        window.Cloud.setRole(el.dataset.uid, el.dataset.role, el.checked, m ? personName(m) : '')
          .then(() => { ui.flash = { text: t(el.checked ? 'roleGiven' : 'roleRemoved', { r: t('role_' + el.dataset.role), n: m ? personName(m) : '' }) }; render(); })
          .catch(err => warn('regError', { code: err.code || err.message }));
        break;
      }
      case 'ban': {
        if (!admin()) return;
        const cur = Object.assign({ tour: false, book: false }, banOf(el.dataset.uid));
        cur[el.dataset.what] = el.checked;
        window.Cloud.setBan(el.dataset.uid, cur).then(() => { ui.flash = { text: t('saved') }; render(); }).catch(err => warn('regError', { code: err.code || err.message }));
        break;
      }
      case 'msg-filter': ui.msgFilter = el.value; render(); break;
      case 'user-filter': ui.userFilter = el.value; render(); break;
      case 'msg-to': {
        const set = new Set(ui.msgTo || []);
        if (el.checked) set.add(el.value); else set.delete(el.value);
        ui.msgTo = [...set];
        break;
      }
      case 'main-pos': {
        if (!tourAdmin()) return;
        const tour = tourById(el.dataset.tid), list = tour.mainList;
        if (!list || tour.mainLocked) return;
        const from = list.indexOf(el.dataset.id), to = Math.max(0, Math.min(list.length - 1, (parseInt(el.value, 10) || from + 1) - 1));
        if (from < 0 || from === to) { render(); return; }
        list.splice(to, 0, list.splice(from, 1)[0]);
        commit();
        break;
      }
      case 'slot-assign': {
        if (!tourAdmin()) return;
        const tour = tourById(el.dataset.tid), br = tour.bracket, idx = +el.dataset.idx, v = el.value || null;
        if (v && v !== L.BYE && br.slots.some((id, i) => id === v && i !== idx)) { warn('errTeamPlaced'); return; }
        if (v === L.BYE && br.slots.filter((id, i) => id === L.BYE && i !== idx).length >= br.size - br.qualified) {
          warn('errTooManyByes', { n: br.size - br.qualified }); return;
        }
        br.slots[idx] = v;
        commit();
        break;
      }
      case 'entry-wc':
        if (tourAdmin()) setWc(tourById(el.dataset.tid), el.dataset.id, el.value);
        break;
      case 'entry-pts': {
        if (!tourAdmin()) return;
        const entry = entryById(tourById(el.dataset.tid), el.dataset.id);
        const v = parseNum(el.value);
        entry['man' + el.dataset.which] = v;
        commit();
        break;
      }
      case 'rank-cat': ui.rankCat = el.value; render(); break;
      case 'scorer-tour':
        if (!tourAdmin()) return;
        window.Cloud.setScorerTournament(el.dataset.email, el.value)
          .then(() => { ui.scorers = null; ui.flash = { text: t('saved') }; render(); })
          .catch(err => warn('scorerErr', { code: err.code || err.message }));
        break;
      case 'outcome': syncOutcome(el.form); break;
    }
  });

  document.addEventListener('toggle', e => {
    const d = e.target;
    if (d.dataset && d.dataset.cat && d.open) ui.openCat = d.dataset.cat;
    if (d.dataset && d.dataset.keep) { ui.keep = ui.keep || {}; ui.keep[d.dataset.keep] = d.open; }
  }, true);

  document.addEventListener('input', e => {
    const el = e.target;
    const tf = el.closest('form[data-form^="tournament-"]');
    if (tf) syncTournamentForm(tf);
    if (el.dataset.change === 'player-filter') {
      ui.playerFilter = el.value;
      const pos = el.selectionStart;
      render();
      const s = document.querySelector('[data-change=player-filter]');
      s.focus(); s.setSelectionRange(pos, pos);
    }
  });

  window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
  applyTheme(currentTheme());
  applyDesign(currentDesign());

  window.App = {
    refresh,
    readRows, applyEntryRows, applyRankingRows,
    error(code) {
      ui.flash = { type: 'warn', text: t(code === 'permission-denied' ? 'errPermission' : 'errCloud', { code }) };
      render();
    }
  };
  render();
})();
