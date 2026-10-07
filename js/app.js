// Interfaccia: routing, viste ed eventi.
(function () {
  'use strict';

  const S = () => Store.state;
  // testo senza accenti e maiuscole, per cercare e confrontare i nomi
  const norm = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const t = (k, p) => I18n.t(k, p);
  const $app = document.getElementById('app');
  const $dialog = document.getElementById('matchDialog');

  const ui = { flash: null, busy: false };
  const admin = () => !!(window.Cloud && window.Cloud.isAdmin);
  // admin tornei (o generale): tornei, categorie e punti, giocatori, iscrizioni, referti e refertisti
  const tourAdmin = () => !!(window.Cloud && window.Cloud.tourAdmin);
  // cassa (o admin generale): incassi e ricevute
  const cashier = () => !!(window.Cloud && window.Cloud.cashier);
  // capitano: utente registrato abilitato dall'admin a iscrivere squadre (roles/{uid}.captain)
  const captainRole = () => !!(window.Cloud && !window.Cloud.isAdmin && window.Cloud.member && (window.Cloud.roles || {}).captain);
  const canNotice = scope => (scope === 'home' ? admin() : tourAdmin());
  // Account di un campo (refertista): vede "Le mie gare" e apre i referti elettronici.
  const scorer = () => (window.Cloud && !window.Cloud.isAdmin && window.Cloud.scorer) || null;
  let pendingRender = false;

  // ---------- helper ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sel = (a, b) => (String(a) === String(b) ? 'selected' : '');

  function fmtDate(d) {
    if (!d) return '';
    const dt = new Date(d.slice(0, 10) + 'T12:00:00');
    return isNaN(dt) ? d : dt.toLocaleDateString(I18n.locale(), { day: 'numeric', month: 'short', year: 'numeric' });
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

  // ---------- routing ----------
  function route() {
    return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  }

  function render() {
    pendingRender = false;
    if (!Store.ready) {
      $app.innerHTML = flashHtml() + `<div class="empty"><i class="ti ti-loader-2" aria-hidden="true"></i> ${esc(t('loading'))}</div>`;
      updateChrome('tournaments');
      return;
    }
    const r = route();
    if (window.Cloud && window.Cloud.watchLive) {
      window.Cloud.watchLive(r[0] === 'vt' && vtById(r[1]) ? r[1] : r[0] === 'mine' && scorer() ? liveTourIds() : r[0] === 'gare' || r[0] === 'me' ? myTourIds() : null);
      window.Cloud.watchReferti(r[0] === 'vt' && vtById(r[1]) && r[2] === 'referti' ? r[1] : null);
    }
    const adminOnly = r[0] === 'messages' || r[0] === 'users' || r[0] === 'athletes' || r[0] === 'payments';
    if (adminOnly && !admin()) { location.hash = '#/'; return; }
    let nav = 'tournaments', html;
    if (r[0] === 'settings') { nav = 'settings'; html = viewSettings(); }
    else if (r[0] === 'mine') { nav = 'mine'; html = viewMineVolley(); }
    else if (r[0] === 'me') { nav = 'me'; html = viewProfile(); }
    else if (r[0] === 'teams') { nav = 'teams'; html = viewTeams(); }
    else if (r[0] === 'tema') { nav = 'settings'; html = viewTheme(); }
    else if (r[0] === 'livelli' && tourAdmin()) { nav = 'settings'; html = viewLevels(); }
    else if (r[0] === 'gare') { nav = 'gare'; html = viewMyMatches(); }
    else if (r[0] === 'tornei' || r[0] === 'tournaments') { html = viewVTours(); }
    else if (r[0] === 'vt' && vtById(r[1])) { html = viewVTour(vtById(r[1]), r[2]); }
    else if (r[0] === 'free') { nav = 'free'; html = viewFreeplay(); }
    else if (r[0] === 'train') { nav = 'train'; html = viewTraining(); }
    else if (r[0] === 'privacy' || r[0] === 'cookie' || r[0] === 'termini') { nav = 'settings'; html = viewLegal(r[0]); }
    else if (r[0] === 'athletes' && admin()) { nav = 'train'; html = viewAthletes(); }
    else if (r[0] === 'payments' && admin()) { nav = 'settings'; html = viewPayments(); }
    else if (r[0] === 'report' && admin()) { nav = 'train'; html = viewReport(); }
    else if (r[0] === 'cassa' && cashier()) { nav = 'cassa'; html = viewCassa(); }
    else if (r[0] === 'messages' && admin()) { nav = 'settings'; html = viewMessages(); }
    else if (r[0] === 'users' && admin()) { nav = 'settings'; html = viewUsers(); }
    else if (r[0] === 'a' && (r[1] === '1' || r[1] === '2')) { nav = 'home'; html = viewArticle(+r[1] - 1); }
    else { nav = 'home'; html = viewFeatured(); }
    $app.innerHTML = flashHtml() + html;
    updateChrome(nav);
    fitEditorial();
  }

  function updateChrome(nav) {
    document.documentElement.lang = I18n.lang;
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === nav));
    document.querySelectorAll('[data-admin-only]').forEach(el => { el.hidden = !admin(); });
    document.querySelectorAll('[data-tour-only]').forEach(el => { el.hidden = !tourAdmin(); });
    document.querySelectorAll('[data-cash-only]').forEach(el => { el.hidden = !cashier(); });
    document.querySelectorAll('[data-staff-badge]').forEach(el => { el.hidden = !(admin() || tourAdmin() || cashier()); const l = el.querySelector('.lbl'); if (l) l.textContent = ' ' + (admin() ? 'Admin' : [tourAdmin() ? t('roleTourShort') : '', cashier() ? t('roleCashShort') : ''].filter(Boolean).join(' · ')); });
    document.querySelectorAll('[data-guest-only]').forEach(el => { el.hidden = admin() || !!scorer() || !!member(); });
    document.querySelectorAll('[data-member-only]').forEach(el => { el.hidden = !member(); });
    document.querySelectorAll('[data-team-only]').forEach(el => { el.hidden = !(member() && myTeams().length); });
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
    if (prefs) { if (ui.theme) Consent.write(THEME_KEY, ui.theme); if (ui.design) Consent.write(DESIGN_KEY, ui.design); }
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

  function refresh() {
    if (ui.afterLogin && scorer()) { ui.afterLogin = false; if (location.hash !== '#/mine') { location.hash = '#/mine'; return; } }
    if (isTyping()) { pendingRender = true; return; }
    render();
  }

  document.addEventListener('focusout', () => {
    setTimeout(() => { if (pendingRender && !isTyping()) render(); }, 400);
  });
  $dialog.addEventListener('close', () => { if (pendingRender) render(); });

  // ---------- avvisi per i visitatori (prima pagina) ----------
  function richText(s) {
    return esc(s)
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
      .replace(/\n/g, '<br>');
  }

  const todayStr = () => new Date().toLocaleDateString('sv');   // AAAA-MM-GG, ora locale

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

  function viewFeatured() {
    const active = (S().vtours || []).filter(x => x.status === 'live' || (tourAdmin() && x.status !== 'done')).sort((a, b) => (teamLevels().indexOf(a.level) + 1 || 99) - (teamLevels().indexOf(b.level) + 1 || 99));
    return `
      ${admin() && homonymPending().length ? `<div class="msg-alert" role="alert"><div class="msg-head"><strong><i class="ti ti-users" aria-hidden="true"></i> ${esc(t('homonym'))}</strong></div>
        <div class="msg-text">${esc(t('homonymWarn'))}</div><a class="btn small" href="#/users">${esc(t('usersOpen'))} →</a></div>` : ''}
      ${privacyAlert()}
      ${messageAlerts()}
      ${trainingAlerts()}
      ${certAlerts()}
      ${noticeAlerts()}
      ${verifyNotice()}
      ${noticeBox('home', S().notice, S().noticeUntil)}
      <div class="theme-hero" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <h1 class="sr-only">${esc(t('navHome'))}</h1>
      ${editorialSection()}
      ${spotSection(true)}
      <section class="feat-block">
        <div class="page-head row"><h2><i class="ti ti-trophy" aria-hidden="true"></i> ${esc(t('activeTournaments'))}</h2>
          <a class="btn small" href="#/tornei">${esc(t('allTournaments'))} →</a></div>
        ${active.length ? `<div class="cards">${active.map(vtCard).join('')}</div>`
          : `<div class="empty">${esc(t(admin() ? 'noTournamentsAdmin' : 'noUpcomingTournaments'))}</div>`}
      </section>
      ${freeplayHome()}`;
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




  // ====================================================================
  // UTENTI REGISTRATI, PROFILO, MESSAGGI
  // ====================================================================
  const member = () => (window.Cloud && !window.Cloud.isAdmin && !window.Cloud.scorer && window.Cloud.member) || null;
  const personName = p => `${p.last} ${p.first}`;
  // Nome mostrato agli altri: alias dell'admin se l'utente ne ha uno.
  const personLabel = p => (p && p.uid && (S().nicks || {})[p.uid]) || personName(p);

  // ---------- omonimi (utenti registrati con stesso nome, cognome e sesso) ----------
  const nameKeyOf = p => `${p.gender}|${norm(`${p.last} ${p.first}`)}`;
  function homonymGroups() {
    const g = {};
    (S().members || []).forEach(m => { (g[nameKeyOf(m)] = g[nameKeyOf(m)] || []).push(m); });
    return Object.values(g).filter(list => list.length > 1);
  }
  // Gruppi di omonimi ancora da distinguere con un alias (due o più persone mostrate con lo stesso nome).
  const homonymPending = () => homonymGroups().filter(list => new Set(list.map(m => personLabel(m).toLowerCase())).size < list.length);

  // ---------- utenti registrati (solo admin): email, alias, ruoli ----------
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
        ${row('crown', t('role_general'), t('roleHelp_general'), OWNER_EMAILS.map(e => `${e} (${t('adminOwner')})`).concat(Object.entries(S().admins || {}).map(([uid, v]) => { const m = memberByUid(uid); return m ? personName(m) : v.name || uid; }).sort()))}
        ${row('shirt-sport', t('role_captain'), t('roleHelp_captain'), who('captain'))}
        ${row('trophy', t('role_tour'), t('roleHelp_tour'), who('tour'))}
        ${row('cash-register', t('role_cash'), t('roleHelp_cash'), who('cash'))}
        ${row('whistle', t('role_coach'), t('roleHelp_coach'), coaches)}
        ${row('device-mobile', t('role_scorer'), t('roleHelp_scorer'), [])}
      </ul></div>`;
  }
  function viewUsers() {
    const f = norm(ui.userFilter || '');
    const acc = S().accounts || {};
    const pend = new Set(homonymPending().flat().map(m => m.uid));
    const homs = new Set(homonymGroups().flat().map(m => m.uid));
    const list = (S().members || []).filter(m => !f || norm(`${m.first} ${m.last} ${acc[m.uid] || ''} ${(S().nicks || {})[m.uid] || ''}`).includes(f))
      .sort((a, b) => personName(a).localeCompare(personName(b)));
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
          <label class="check span-all"><input type="checkbox" name="captain"> ${esc(t('userCreateCaptain'))}</label>
          <div class="form-actions"><button class="btn primary">${esc(t('userCreateBtn'))}</button></div>
        </form></details>
      <div class="toolbar"><input type="search" class="search" placeholder="${esc(t('search'))}" value="${esc(ui.userFilter || '')}" data-change="user-filter" aria-label="${esc(t('search'))}"></div>
      <div class="card"><ul class="reg-list users-list">${list.map(m => {
        return `<li class="${pend.has(m.uid) ? 'homonym' : ''} ${banOf(m.uid).tour ? 'banned' : ''}">
          <span class="reg-names">${ui.userEdit === m.uid ? userEditForm(m) : `<strong>${esc(personName(m))}</strong> <span class="badge g-${m.gender}">${esc(m.gender)}</span>
            <button class="btn small" data-action="user-edit" data-uid="${m.uid}"><i class="ti ti-pencil" aria-hidden="true"></i> ${esc(t('userEditName'))}</button>`}
            ${homs.has(m.uid) ? `<span class="badge warn-b">${esc(t('homonym'))}</span>` : ''}<br>
            <small class="muted">${esc(acc[m.uid] || '—')}</small>
            <button class="btn small danger" data-action="user-delete" data-uid="${m.uid}"><i class="ti ti-user-x" aria-hidden="true"></i> ${esc(t('userDelete'))}</button>
            <span class="ban-row">${verifyBadge(m.uid)} ${m.privacyAt ? `<span class="badge st-done" title="${esc(t('privacyAcceptedOn', { d: fmtDate(new Date(m.privacyAt).toLocaleDateString('sv')) }))}"><i class="ti ti-shield-check" aria-hidden="true"></i> ${esc(t('privacyOkBadge'))}</span>` : `<span class="badge tess-no">${esc(t('privacyNoBadge'))}</span>`}${m.deleteReq ? ` <span class="badge st-full">${esc(t('deleteRequested', { d: fmtDate(new Date(m.deleteReq).toLocaleDateString('sv')) }))}</span>` : ''}</span>
            <span class="ban-row"><i class="ti ti-key" aria-hidden="true"></i> ${esc(t('rolesTitle'))}:
              ${generalAdminBox(m)}
              ${['captain', 'tour', 'cash'].map(r => `<label class="check"><input type="checkbox" data-change="role" data-uid="${m.uid}" data-role="${r}" ${((S().roles || {})[m.uid] || {})[r] ? 'checked' : ''}> ${esc(t('role_' + r))}</label>`).join('')}
              ${coachOf(m.uid) ? `<span class="badge">${esc(t('role_coach'))}</span>` : ''}</span>
            <span class="ban-row"><i class="ti ti-ban" aria-hidden="true"></i> ${esc(t('banTitle'))}:
              <label class="check"><input type="checkbox" data-change="ban" data-uid="${m.uid}" data-what="tour" ${banOf(m.uid).tour ? 'checked' : ''}> ${esc(t('banTour'))}</label></span></span>
          <form class="nick-form" data-form="nick-save" data-uid="${m.uid}">
            <input name="nick" maxlength="40" value="${esc((S().nicks || {})[m.uid] || '')}" placeholder="${esc(t('nickPh'))}" aria-label="${esc(t('nick'))}">
            <button class="btn small">${esc(t('save'))}</button>
          </form>
        </li>`; }).join('') || `<li class="muted">${esc(t('noMembers'))}</li>`}</ul></div>`;
  }

  // Casella "Admin generale" nella scheda dell'utente. Gli admin principali non si toccano; un admin non cambia se stesso;
  // nominare può ogni admin generale, togliere il ruolo solo un admin principale (lo controllano anche le regole).
  const OWNER_EMAILS = ['manofuori@gmail.com', 'pierpaolomurgioni@gmail.com'];
  const isOwnerEmail = e => OWNER_EMAILS.includes(String(e || '').toLowerCase());
  const iAmOwner = () => !!(window.Cloud && window.Cloud.user && isOwnerEmail(window.Cloud.user.email));
  function generalAdminBox(m) {
    const owner = isOwnerEmail((S().accounts || {})[m.uid]);
    const on = owner || !!(S().admins || {})[m.uid] || (m.uid === myUid() && admin());
    const locked = owner || m.uid === myUid() || (on && !iAmOwner());
    const why = owner ? 'adminOwnerFixed' : m.uid === myUid() ? 'adminSelfFixed' : 'adminOnlyOwnerRevokes';
    return `<label class="check" ${locked ? `title="${esc(t(why))}"` : ''}><input type="checkbox" data-change="admin-role" data-uid="${m.uid}" ${on ? 'checked' : ''} ${locked ? 'disabled' : ''}> <strong>${esc(t('role_general'))}</strong>${owner ? ` <span class="badge">${esc(t('adminOwner'))}</span>` : ''}</label>`;
  }

  // Correzione di nome, cognome e sesso di un utente (solo admin generale).
  function userEditForm(m) {
    return `<form class="grid-form user-edit" data-form="user-edit-save" data-uid="${m.uid}">
      <label>${esc(t('firstName'))}<input name="first" required maxlength="60" value="${esc(m.first || '')}"></label>
      <label>${esc(t('lastName'))}<input name="last" required maxlength="60" value="${esc(m.last || '')}"></label>
      <label>${esc(t('gender'))}<select name="gender" required><option value="M" ${sel(m.gender, 'M')}>${esc(t('male'))}</option><option value="F" ${sel(m.gender, 'F')}>${esc(t('female'))}</option></select></label>
      <div class="form-actions"><button type="button" class="btn small" data-action="user-edit" data-uid="">${esc(t('cancel'))}</button><button class="btn small primary">${esc(t('save'))}</button></div>
    </form>`;
  }

  // ====================================================================
  // ORARI E DATE, CONFERMA EMAIL, LISTA NERA
  // ====================================================================
  const toMin = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
  const fromMin = n => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  const addMin = (hm, n) => fromMin(toMin(hm) + n);
  const addDays = (d, n) => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('sv'); };
  const dow = d => { const x = new Date(d + 'T12:00').getDay(); return x === 0 ? 7 : x; };
  const nowHM = () => { const d = new Date(); return fromMin(d.getHours() * 60 + d.getMinutes()); };
  const dayName = n => new Date(2024, 0, n).toLocaleDateString(I18n.locale(), { weekday: 'long' });   // 1 gen 2024 = lunedì
  const longDate = d => new Date(d + 'T12:00').toLocaleDateString(I18n.locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  const HALF_HOURS = Array.from({ length: 37 }, (_, i) => fromMin(360 + i * 30));   // 06:00 – 24:00
  const myUid = () => (window.Cloud && window.Cloud.user && window.Cloud.user.uid) || null;
  const memberByUid = uid => (S().members || []).find(m => m.uid === uid);
  const banOf = uid => (S().bans || {})[uid] || {};

  // Conferma dell'email: senza conferma non si iscrive una squadra né si partecipa al gioco libero.
  const needsVerify = () => !!member() && !!window.Cloud && !window.Cloud.verified;
  function verifyNotice() {
    if (!needsVerify()) return '';
    return `<div class="msg-alert verify-alert" role="alert">
      <div class="msg-head"><strong><i class="ti ti-mail" aria-hidden="true"></i> ${esc(t('verifyTitle'))}</strong></div>
      <div class="msg-text">${esc(t('verifyText', { e: window.Cloud.user.email }))}</div>
      <div class="btn-row"><button class="btn small primary" data-action="verify-check">${esc(t('verifyCheck'))}</button>
        <button class="btn small" data-action="verify-resend">${esc(t('verifyResend'))}</button></div></div>`;
  }
  // Avvisi per l'utente o per gli amministratori (es. richiesta di cancellazione dell'account):
  // ALERT in cima alla pagina, finché non si preme "Ho letto".
  function noticeAlerts() {
    if (!(member() || admin())) return '';
    return (S().notices || []).map(n => `<div class="msg-alert" role="alert">
      <div class="msg-head"><strong><i class="ti ti-bell" aria-hidden="true"></i> ${esc(t(n.to === 'admins' ? 'noticeAdmins' : 'noticeUser'))}</strong>
        <small>${esc(new Date(n.at).toLocaleString(I18n.locale(), { dateStyle: 'medium', timeStyle: 'short' }))}</small></div>
      <div class="msg-text">${esc(n.text)}</div>
      <button class="btn small" data-action="notice-dismiss" data-id="${n.id}"><i class="ti ti-check" aria-hidden="true"></i> ${esc(t('msgRead'))}</button>
    </div>`).join('');
  }
  // Lista nera: avviso all'utente bloccato dai tornei.
  function banNotice(what) {
    const m = member();
    if (!m || !banOf(m.uid)[what]) return '';
    return `<p class="note warn"><i class="ti ti-ban" aria-hidden="true"></i> ${esc(t('banTourMsg'))}</p>`;
  }

  // per conto di chi è la prenotazione: utente registrato o nome scritto dall'admin (giocatore non registrato)

  // Conferma (nuova prenotazione o modifica) con tutti i controlli; avvisi a titolare e amministratori.

  // Livelli degli allenamenti (ordine nel report presenze).
  const LEVELS = ['start', 'inter', 'high', 'pro'];
  // Moduli a scomparsa che restano aperti anche se la pagina si ridisegna (aggiornamenti dal database).
  const keepOpen = key => ((ui.keep || {})[key] ? 'open' : '');

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
        ${tr.coachUid && tr.place ? ' · ' : ''}${tr.place ? `<i class="ti ti-map-pin" aria-hidden="true"></i> ${esc(tr.place)}` : ''}</p>
      <h4>${esc(t('grpTitle', { m: monthLabel(month) }))}</h4>
      ${od && uids.length ? `<p class="muted small"><i class="ti ti-calendar-check" aria-hidden="true"></i> ${esc(t(oc && oc.cancelled ? 'occCancelledOn' : 'attOfDay', { d: longDate(od) }))}</p>` : ''}
      ${uids.length ? `<ul class="reg-list">${rows}</ul>` : `<p class="muted small">${esc(t('grpEmpty'))}</p>`}
      ${add}
      ${admin() ? `<div class="btn-row"><button class="btn small" data-action="tr-edit" data-id="${tr.id}"><i class="ti ti-pencil" aria-hidden="true"></i> ${esc(t('edit'))}</button>
        <button class="btn small danger" data-action="tr-delete" data-id="${tr.id}"><i class="ti ti-trash" aria-hidden="true"></i> ${esc(t('trDelete'))}</button></div>` : ''}
    </div>`;
  }

  function trainingForm(tr) {
    const v = tr || { name: '', dow: 1, from: '19:00', to: '20:15', level: 'inter', max: 8, coachUid: '', place: '' };
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
        <label class="span-all">${esc(t('placeLabel'))}<input name="place" maxlength="80" value="${esc(v.place || '')}" placeholder="${esc(t('placePh'))}"></label>
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
          <label>${esc(t('athCf'))}<input name="cf" maxlength="16" autocapitalize="characters" pattern="[A-Za-z0-9]{16}" placeholder="RSSMRA80A01B354X"></label>
          <label class="check"><input type="checkbox" name="tess"> ${esc(t('tessLabel', { s: seasonOf(todayStr()) }))}</label>
          <label>${esc(t('certExp'))}<input type="date" name="certExp"></label>
          ${trChecks(null, month)}
          <div class="form-actions span-all"><button class="btn primary">${esc(t('athCreate'))}</button></div></form></details>
      ${list.length ? `<div class="ath-list">${list.map(x => athleteCard(x.a, x.m, month)).join('')}</div>` : `<div class="empty"><i class="ti ti-id-badge-2" aria-hidden="true"></i> ${esc(t('athNone'))}</div>`}
      ${pricesCard()}`;
  }

  // dati del genitore responsabile (corsista minorenne): la ricevuta è intestata a lui o a lei
  function parentInputs(a, hidden) {
    return `<fieldset class="span-all grid-form parent-box" ${hidden ? 'hidden' : ''}><legend>${esc(t('athParent'))}</legend>
      <p class="muted small span-all">${esc(t('athParentHelp'))}</p>
      <label>${esc(t('firstName'))}<input name="parentFirst" maxlength="60" value="${esc(a.parentFirst || '')}"></label>
      <label>${esc(t('lastName'))}<input name="parentLast" maxlength="60" value="${esc(a.parentLast || '')}"></label>
      <label>${esc(t('caManualTitle'))}<select name="parentGender"><option value="">${esc(t('caManualTitleAny'))}</option>
        <option value="M" ${a.parentGender === 'M' ? 'selected' : ''}>${esc(t('caManualMr'))}</option><option value="F" ${a.parentGender === 'F' ? 'selected' : ''}>${esc(t('caManualMrs'))}</option></select></label>
      <label>${esc(t('athParentAddress'))}<input name="parentAddress" maxlength="100" value="${esc(a.parentAddress || '')}" placeholder="${esc(t('athAddressPh'))}"></label>
      <label>${esc(t('athCity'))}<input name="parentCity" maxlength="60" value="${esc(a.parentCity || '')}"></label>
      <label>${esc(t('athParentCf'))}<input name="parentCf" maxlength="16" value="${esc(a.parentCf || '')}" autocapitalize="characters" pattern="[A-Za-z0-9]{16}"></label>
    </fieldset>`;
  }
  const readParent = f => ({ parentFirst: f.parentFirst.value.trim(), parentLast: f.parentLast.value.trim(), parentGender: f.parentGender.value,
    parentAddress: f.parentAddress.value.trim(), parentCity: f.parentCity.value.trim(), parentCf: f.parentCf.value.trim().toUpperCase() });

  function athleteCard(a, m, month) {
    const name = m ? personName(m) : `${a.last || ''} ${a.first || ''}`.trim() || '?';
    const p = planOf(a.id, month);
    const editing = ui.athEdit === a.id;
    const planLine = p ? `${esc(t('planN', { n: p.n }))} · ${esc(planDesc(p).join(' / '))}` : esc(t('planNone'));
    const head = `<div class="ath-head"><div><strong>${esc(name)}</strong> ${a.minor ? `<span class="badge">${esc(t('athMinorBadge'))}</span>` : ''} ${a.cf ? `<span class="badge cf-badge" title="${esc(t('athCf'))}">${esc(t('cfShort'))} ${esc(a.cf)}</span>` : `<span class="badge tess-no">${esc(t('cfMissing'))}</span>`}
        ${a.minor ? `<br><small class="muted">${esc(t('athParentShort'))}: ${esc(`${a.parentFirst || ''} ${a.parentLast || ''}`.trim() || '—')}${a.parentCf ? ` · ${esc(t('cfShort'))} ${esc(a.parentCf)}` : ` · <span class="badge tess-no">${esc(t('cfMissing'))}</span>`}</small>` : ''} ${tessBadge(a)} ${certBadge(a)}
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
        <label>${esc(t('athBirthDate'))}<input type="date" name="birthDate" data-change="ath-birth" value="${esc(a.birthDate || '')}"></label>
        <label>${esc(t('athCity'))}<input name="city" maxlength="60" value="${esc(a.city || '')}"></label>
        <label>${esc(t('athAddress'))}<input name="address" maxlength="100" value="${esc(a.address || '')}" placeholder="${esc(t('athAddressPh'))}"></label>
        <label>${esc(t('athCf'))}<input name="cf" maxlength="16" value="${esc(a.cf || '')}" autocapitalize="characters" pattern="[A-Za-z0-9]{16}"></label>
        <label>${esc(t('certExp'))}<input type="date" name="certExp" value="${esc(a.certExp || '')}"></label>
        <label class="check span-all"><input type="checkbox" name="minor" data-change="ath-minor" ${a.minor ? 'checked' : ''}> <strong>${esc(t('athMinor'))}</strong></label>
        ${parentInputs(a, !a.minor)}
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
      max: Math.max(1, parseInt(f.max.value, 10) || 1), coachUid: f.coachUid.value, place: f.place.value.trim() };
    if (d.to <= d.from) return warn('fpTimeErr');
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
  // corsista minorenne: la ricevuta è intestata al genitore (nome, cognome, residenza, codice fiscale);
  // del minore servono luogo e data di nascita e codice fiscale
  const PARENT_FIELDS = ['parentFirst', 'parentLast', 'parentAddress', 'parentCity', 'parentCf'];
  const MINOR_FIELDS = ['birthPlace', 'birthDate', 'cf'].concat(PARENT_FIELDS);
  const fieldsFor = a => (a && a.minor ? MINOR_FIELDS : PERSON_FIELDS);
  const missingPerson = a => fieldsFor(a).filter(k => !(a && a[k]));
  const isUnder18 = d => { if (!d) return false; const b = new Date(d + 'T12:00:00'), n = new Date(); let y = n.getFullYear() - b.getFullYear(); if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) y--; return y < 18; };
  // persona per la ricevuta da una scheda (o dalla sua copia per la cassa): name e gender del corsista
  function personFrom(name, gender, a) {
    a = a || {};
    if (a.minor) return { name: `${a.parentFirst || ''} ${a.parentLast || ''}`.trim(), gender: a.parentGender || '', birthPlace: '', birthDate: '',
      city: a.parentCity || '', address: a.parentAddress || '', cf: a.parentCf || '',
      minor: { name, gender: gender || '', birthPlace: a.birthPlace || '', birthDate: a.birthDate || '', cf: a.cf || '' } };
    return { name, gender: gender || 'M', birthPlace: a.birthPlace || '', birthDate: a.birthDate || '', city: a.city || '', address: a.address || '', cf: a.cf || '' };
  }
  const personOf = (uid, a) => { const m = memberByUid(uid); return personFrom(m ? `${m.first} ${m.last}` : `${(a && a.first) || ''} ${(a && a.last) || ''}`.trim(), (m && m.gender) || 'M', a); };
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
      ${miss.length ? `<p class="note warn span-all">${esc(t(a.minor ? 'payNeedDataMinor' : 'payNeedData'))} ${t('athDataNote')}</p>
        <label>${esc(t('athBirthPlace'))}<input name="birthPlace" maxlength="60" value="${esc(a.birthPlace || '')}"></label>
        <label>${esc(t('athBirthDate'))}<input type="date" name="birthDate" value="${esc(a.birthDate || '')}"></label>
        ${a.minor ? '' : `<label>${esc(t('athCity'))}<input name="city" maxlength="60" value="${esc(a.city || '')}"></label>
        <label>${esc(t('athAddress'))}<input name="address" maxlength="100" value="${esc(a.address || '')}" placeholder="${esc(t('athAddressPh'))}"></label>`}
        <label>${esc(t('athCf'))}<input name="cf" maxlength="16" value="${esc(a.cf || '')}" pattern="[A-Za-z0-9]{16}"></label>
        ${a.minor ? parentInputs(a, false) : ''}` : ''}
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

  // ---------- PDF della ricevuta (jsPDF in vendor/jspdf) ----------
  let jsPdfPromise = null;
  function loadJsPdf() {
    if (!jsPdfPromise) jsPdfPromise = new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = 'vendor/jspdf/jspdf.umd.min.js'; sc.onload = () => resolve(window.jspdf.jsPDF); sc.onerror = () => { jsPdfPromise = null; reject(new Error('jspdf')); };
      document.head.appendChild(sc);
    });
    return jsPdfPromise;
  }
  // Testo per le detrazioni fiscali (ricevute per minori)
  const DETRAZIONE = "L'importo corrisposto dà diritto a una detrazione d'imposta IRPEF pari al 19% dell'importo pagato fino a un massimo di 210,00 euro su base annua e complessivo per ciascuna persona che effettui il pagamento, come disposto dall'art. 15, I comma, lettera i-quinquies del T.U.I.R. e relativo decreto di attuazione del 28/03/2007.";
  function drawReceipt(pdf, r, sign) {
    const p = r.person || {}, F = p.gender === 'F', L = 22, named = !!p.name, C = rSeries(r) === 'C', mn = named && p.minor && p.minor.name ? p.minor : null;
    let y = 22;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14); pdf.text(ASSOC[0], L, y);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10.5);
    ASSOC.slice(1).forEach(l => { y += 5.5; pdf.text(l, L, y); });
    y += 18; pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14);
    pdf.text(`RICEVUTA N. ${rcNum(r)} del ${itDate(r.issued)}`, L, y);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11.5);
    if (C) { pdf.setFontSize(9.5); pdf.text('Ricevuta non fiscale', 188, y, { align: 'right' }); pdf.setFontSize(11.5); }
    y += 13; pdf.text(named && p.gender ? `Si attesta che ${F ? 'la Sig.ra' : 'il Sig.'}:` : 'Si attesta che il/la Sig./Sig.ra:', L, y);
    const blank = '______________________________';
    const residence = p.city || p.address ? `${p.city || ''}, ${p.address || ''}` : '';
    const rows = mn ? [['Nome e Cognome', p.name], ['Residente a', residence], ['Codice Fiscale', p.cf || '']]
      : named ? [['Nome e Cognome', p.name], [!p.gender ? 'Nato/a a' : F ? 'Nata a' : 'Nato a', p.birthPlace || p.birthDate ? `${p.birthPlace || ''} il ${itDate(p.birthDate)}` : ''], ['Residente a', residence], ['Codice Fiscale', p.cf || '']]
      : [['Nome e Cognome', blank], ['Codice Fiscale', blank]];
    const bullets = list => list.forEach(([k, v]) => { y += 8; pdf.text('•', L + 3, y); pdf.setFont('helvetica', 'bold'); pdf.text(`${k}:`, L + 8, y); const w = pdf.getTextWidth(`${k}: `); pdf.setFont('helvetica', 'normal'); pdf.text(String(v || ''), L + 8 + w, y); });
    bullets(rows);
    const son = mn && mn.gender === 'F' ? 'della figlia' : mn && mn.gender === 'M' ? 'del figlio' : 'del figlio/della figlia';
    if (mn) {
      y += 11; pdf.text(`genitore ${mn.gender === 'F' ? 'della minore' : mn.gender === 'M' ? 'del minore' : 'del/della minore'}:`, L, y);
      bullets([['Nome e Cognome', mn.name], [mn.gender === 'F' ? 'Nata a' : mn.gender === 'M' ? 'Nato a' : 'Nato/a a', mn.birthPlace || mn.birthDate ? `${mn.birthPlace || ''} il ${itDate(mn.birthDate)}` : ''], ['Codice Fiscale', mn.cf || '']]);
    }
    y += 13; pdf.text(mn ? `ha versato in data ${itDate(r.payDate)}, per conto ${son}, la somma complessiva di:` : `ha versato in data ${itDate(r.payDate)} la somma complessiva di:`, L, y);
    y += 8; pdf.text('•', L + 3, y); pdf.setFont('helvetica', 'bold'); pdf.text(`Euro ${euroIt(r.amount)}`, L + 8, y); pdf.setFont('helvetica', 'normal');
    y += 8; pdf.text('•', L + 3, y); pdf.text(`(Euro ${euroWords(r.amount)})`, L + 8, y);
    y += 13; pdf.setFont('helvetica', 'bold'); pdf.text('Causale:', L, y); pdf.setFont('helvetica', 'normal');
    y += 7; const cl = pdf.splitTextToSize(`${r.causale}.`, 166); pdf.text(cl, L, y); y += (cl.length - 1) * 5.5;
    if ((r.lines || []).length > 1) r.lines.forEach(l => { y += 6.5; pdf.text(`- ${l.desc}: Euro ${euroIt(l.amount)}`, L + 4, y); });
    y += 11; pdf.setFontSize(10); pdf.text(`Modalità di pagamento: ${PAY_IT[r.method] || r.method}`, L, y);
    // ricevute per minori: testo per le detrazioni fiscali
    if (mn) { y += 9; pdf.setFontSize(8.5); const dl = pdf.splitTextToSize(DETRAZIONE, 166); pdf.text(dl, L, y); y += dl.length * 3.8; }
    // timbro dell'associazione e firma del Presidente (immagini caricate dall'admin), sotto il testo
    const top = Math.max(232, y + 8);
    pdf.setFontSize(10.5);
    pdf.text("Timbro dell'associazione", L, top); pdf.line(L, top + 26, L + 70, top + 26);
    pdf.text('Il Presidente', 128, top); pdf.line(128, top + 26, 188, top + 26);
    const img = (src, x, yy, maxW, maxH) => { try { const pr = pdf.getImageProperties(src), k = Math.min(maxW / pr.width, maxH / pr.height); pdf.addImage(src, 'PNG', x + (maxW - pr.width * k) / 2, yy + (maxH - pr.height * k) / 2, pr.width * k, pr.height * k); } catch (e) { console.warn(e); } };
    if (sign && sign.stamp) img(sign.stamp, L, top + 2, 70, 22);
    if (sign && sign.signature) img(sign.signature, 128, top + 2, 60, 23);
    if (r.void) { pdf.setTextColor(200, 0, 0); pdf.setFontSize(48); pdf.text('ANNULLATA', 105, 170, { align: 'center', angle: 25 }); pdf.setTextColor(0, 0, 0); }
  }
  const receiptFile = r => `ricevuta_${r.n}_${rSeries(r)}_${r.year}${(r.person || {}).name ? '_' + latinName(r.person.name) : ''}.pdf`;
  async function receiptsPdf(list) {
    const JsPDF = await loadJsPdf();
    const pdf = new JsPDF({ unit: 'mm', format: 'a4' });
    // timbro e firma: se il database non risponde (es. senza rete) la ricevuta si crea lo stesso, senza immagini
    const sign = await Promise.race([window.Cloud.receiptSign ? window.Cloud.receiptSign().catch(() => null) : null, new Promise(res => setTimeout(() => res(null), 4000))]);
    list.forEach((r, i) => { if (i) pdf.addPage(); drawReceipt(pdf, r, sign); });
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
          sc.src = 'vendor/jszip/jszip.min.js'; sc.onload = () => resolve(window.JSZip); sc.onerror = () => { zipPromise = null; reject(new Error('zip')); };
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
        PERSON_FIELDS.concat(PARENT_FIELDS, ['parentGender']).forEach(k => { if (!f[k]) return; const v = f[k].value.trim(); if (v) { athlete[k] = /cf$/i.test(k) ? v.toUpperCase() : v; a[k] = athlete[k]; } });
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
  const CA_CATS = [['q_train', 'Q'], ['q_tour', 'Q'], ['c_drink', 'C'], ['c_other', 'C']];
  const caSeries = cat => (CA_CATS.find(c => c[0] === cat) || [, 'C'])[1];
  // descrizione della riga sulla ricevuta (in italiano: è un documento contabile)
  const CA_IT = { q_train: 'Quota sociale allenamenti', q_tour: 'Quota sociale torneo sociale', c_drink: 'Bevande', c_other: 'Altro' };
  const caLineDesc = (cat, desc) => (cat === 'c_other' && desc ? desc : CA_IT[cat] + (desc ? ` - ${desc}` : ''));
  const caCausale = (series, lines) => (lines.length === 1 ? lines[0].desc : series === 'Q' ? 'Quote sociali (dettaglio)' : 'Vendita (dettaglio)');
  // intestatari: solo i tesserati della stagione (elenco "tesserati" con i soli dati della ricevuta)
  const tessFor = date => { const se = seasonOf(date || todayStr()); return (S().tesserati || []).filter(x => (x.seasons || []).includes(se)).sort((a, b) => a.name.localeCompare(b.name)); };
  const isTess = (uid, date) => tessFor(date).some(x => x.id === uid);
  // nuovo incasso: qualsiasi utente registrato (i non tesserati vengono segnati con ★ nelle ricevute)
  const CA_MANUAL = '__manual';
  // intestatario scritto a mano (nome e cognome, Sig./Sig.ra) e codice fiscale (anche per una persona scelta dall'elenco)
  const caManualFields = (p, manual) => `<div class="span-all grid-form ca-manual-box">
      <label class="ca-manual" ${manual ? '' : 'hidden'}>${esc(t('caManualName'))}<input name="mName" maxlength="80" value="${esc((manual && p && p.name) || '')}"></label>
      <label class="ca-manual" ${manual ? '' : 'hidden'}>${esc(t('caManualTitle'))}<select name="mGender"><option value="">${esc(t('caManualTitleAny'))}</option>
        <option value="M" ${manual && p && p.gender === 'M' ? 'selected' : ''}>${esc(t('caManualMr'))}</option><option value="F" ${manual && p && p.gender === 'F' ? 'selected' : ''}>${esc(t('caManualMrs'))}</option></select></label>
      <label>${esc(t('athCf'))}<input name="mCf" maxlength="16" autocapitalize="characters" value="${esc((p && p.cf) || '')}" placeholder="${esc(t('caCfPh'))}"></label>
    </div>`;
  // persona per la ricevuta dal modulo: persona scelta (con il codice fiscale scritto, se c'è) o nome scritto a mano
  function caFormPerson(f) {
    const cf = f.mCf.value.trim().toUpperCase().replace(/\s+/g, '');
    if (cf && !/^([A-Z0-9]{16}|[0-9]{11})$/.test(cf)) return { err: 'caCfBad' };
    if (f.holder.value === CA_MANUAL) {
      const name = f.mName.value.trim().replace(/\s+/g, ' ');
      if (!name) return { err: 'caManualNeedName' };
      return { uid: '', person: { name, gender: f.mGender.value, cf } };
    }
    const uid = f.holder.value, person = caPerson(uid);
    if (person && cf) person.cf = cf;
    return { uid, person };
  }
  const caMemberOpts = () => `<option value="">— ${esc(t('caNoHolder'))} —</option><option value="${CA_MANUAL}">${esc(t('caManualOpt'))}</option>${(S().members || []).slice().sort((a, b) => personName(a).localeCompare(personName(b))).map(m => `<option value="${m.uid}">${esc(personName(m))}${isTess(m.uid) ? '' : ' ★'}</option>`).join('')}`;
  // ricevuta intestata a una persona non tesserata nella stagione della ricevuta
  const rcNotTess = r => !r.void && !!r.uid && !!(r.person && r.person.name) && !isTess(r.uid, r.issued);
  const notTessReceipts = () => (S().receipts || []).filter(rcNotTess).sort((a, b) => (b.issued || '').localeCompare(a.issued || ''));
  const tessStar = r => (rcNotTess(r) ? ` <span class="tess-star" title="${esc(t('rcNotTessTip', { s: seasonOf(r.issued) }))}" aria-label="${esc(t('rcNotTessTip', { s: seasonOf(r.issued) }))}">★</span>` : '');
  const caHolderOpts = (date, sel, manual) => `<option value="">— ${esc(t('caNoHolder'))} —</option><option value="${CA_MANUAL}" ${manual ? 'selected' : ''}>${esc(t('caManualOpt'))}</option>${tessFor(date).map(x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}`;
  function caLineRow() {
    return `<div class="ca-line">
      <label class="ca-cat-l">${esc(t('caCat'))}<select name="cat"><option value="">-</option>${CA_CATS.map(([k, sr]) => `<option value="${k}">${esc(t('caCat_' + k))} (${sr})</option>`).join('')}</select></label>
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
      ${rr && admin() ? `<button class="btn small" data-action="rc-renum" data-id="${rr.id}" title="${esc(t('receiptRenum'))}"><i class="ti ti-hash" aria-hidden="true"></i> ${esc(t('receiptRenum'))}</button>` : ''}
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
        <label class="span-all">${esc(t('caHolder'))}<select name="holder" data-change="ca-holder-sel">${caMemberOpts()}</select>
          <small class="muted">${esc(t('caHolderTessOnly', { s: seasonOf(todayStr()) }))}</small></label>
        ${caManualFields()}
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
      <label class="small">${esc(t('caHolder'))}<select name="holder" data-change="ca-holder-sel">${caHolderOpts(r.issued, r.uid, !r.uid && !!(r.person && r.person.name))}</select></label>
      ${caManualFields(r.person, !r.uid && !!(r.person && r.person.name))}
      <button class="btn small primary">${esc(t('save'))}</button><button type="button" class="btn small" data-action="ca-holder-close">${esc(t('cancel'))}</button>
      ${(r.holderLog || []).length ? `<small class="muted span-all">${esc(t('caHolderLog'))}: ${(r.holderLog || []).map(h => `${fmtDate(new Date(h.at).toLocaleDateString('sv'))} «${h.from || '—'}» → «${h.to || '—'}»`).map(esc).join(' · ')}</small>` : ''}</form>`;
  }
  // persona per la ricevuta: dati del tesserato (nome, nascita, residenza, codice fiscale), altrimenti nome e sesso
  function caPerson(uid) {
    if (!uid) return null;
    const x = (S().tesserati || []).find(y => y.id === uid);
    if (x) return personFrom(x.name, x.gender || 'M', x);
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
    return links;
  }
  function caSave(f) {
    const rows = [...f.querySelectorAll('.ca-line')].map(row => ({ cat: row.querySelector('[name=cat]').value,
      desc: row.querySelector('[name=desc]').value.trim(), amount: Math.round(Number(row.querySelector('[name=amount]').value || 0) * 100) / 100 })).filter(x => x.amount > 0 || x.cat);
    if (rows.some(x => !x.cat)) return warn('caNeedType');
    if (rows.some(x => !(x.amount > 0))) return warn('caNeedAmount');
    if (!rows.length) return warn('caNoLines');
    const lines = rows.map(x => ({ cat: x.cat, series: caSeries(x.cat), amount: x.amount, desc: caLineDesc(x.cat, x.desc) }));
    const method = f.method.value, date = f.date.value;
    const always = method !== 'cash', want = always || f.receipt.checked;
    // intestatario: una persona scelta, un nome scritto a mano oppure nessuno
    const hp = caFormPerson(f);
    if (hp.err) return warn(hp.err);
    const uid = hp.uid, person = hp.person;
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
      const hp = caFormPerson(f);
      if (hp.err) return warn(hp.err);
      const uid = hp.uid, person = hp.person;
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

  // ---------- file Excel (.xlsx) generato nel browser (JSZip in vendor/jszip) ----------
  let xlZipPromise = null;
  function loadZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (!xlZipPromise) xlZipPromise = new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = 'vendor/jszip/jszip.min.js'; sc.onload = () => resolve(window.JSZip); sc.onerror = () => { xlZipPromise = null; reject(new Error('zip')); };
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
    const sheetTr = [['Allenamento', 'Giorno', 'Orario', 'Livello', 'Allenatore', 'Max persone', 'Luogo', 'Iscritti nel mese']]
      .concat(trs.map(tr => [trTitle(tr), dayName(tr.dow), `${tr.from}–${tr.to}`, t('fpLevel_' + tr.level), tr.coachUid ? coachName(tr.coachUid) : '', tr.max || 0,
        tr.place || '', ((groupOf(tr.id, month) || {}).uids || []).length]));
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

  // ---------- profilo: statistiche degli allenamenti; grafici a barre (usati anche nel report) ----------
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
  }  function myStatsCard() {
    const m = member();
    if (!m) return '';
    // allenamenti: risposte e spot del corsista (stagione in corso)
    const season = seasonOf(todayStr()), sFrom = `${season.slice(0, 4)}-09-01`;
    const att = (S().att || []).filter(x => x.uid === m.uid && x.date >= sFrom && x.date <= todayStr());
    const sp = (S().spots || []).filter(x => x.uid === m.uid && x.status === 'ok' && x.date >= sFrom && x.date <= todayStr());
    if (!att.length && !sp.length) return '';
    return `<div class="card" id="my-stats">
      <h2><i class="ti ti-chart-bar" aria-hidden="true"></i> ${esc(t('myStats'))}</h2>
      <h3><i class="ti ti-barbell" aria-hidden="true"></i> ${esc(t('statTraining', { s: season }))}</h3>
      <div class="stats-row">
        <div class="stat"><span>${esc(t('statPresent'))}</span><strong>${att.filter(x => x.status === 'in').length}</strong></div>
        <div class="stat"><span>${esc(t('statAbsent'))}</span><strong>${att.filter(x => x.status === 'out').length}</strong></div>
        <div class="stat"><span>${esc(t('statSpots'))}</span><strong>${sp.filter(x => !x.recovery).length}</strong></div>
        <div class="stat"><span>${esc(t('statRecoveries'))}</span><strong>${sp.filter(x => x.recovery).length}</strong></div>
      </div>
    </div>`;
  }

  const trForms = {
    'tr-save': f => trSave(f),
    'complete-profile': f => {
      const d = { first: f.first.value.trim(), last: f.last.value.trim(), gender: f.gender.value, privacyVer: Legal.VERSION };
      if (!d.first || !d.last || !['M', 'F'].includes(d.gender) || !f.privacy.checked) return warn('errRegFields');
      window.Cloud.completeProfile(d).then(() => { ui.flash = { text: t('noProfileSaved') }; render(); }).catch(e => warn('regError', { code: e.code || e.message }));
    },
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
      if (f.cf.value.trim()) ad.cf = f.cf.value.trim().toUpperCase();
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
      const d = Object.assign({ birthPlace: f.birthPlace.value.trim(), birthDate: f.birthDate.value, city: f.city.value.trim(), address: f.address.value.trim(), cf,
        certExp: f.certExp.value, tess: Object.assign({}, a.tess || {}, { [s]: f.tess.checked }), updated: Date.now(), minor: f.minor.checked }, readParent(f));
      if (d.minor && !(d.parentFirst && d.parentLast)) return warn('athParentNeed');
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
      ${fp.place ? `<p class="muted small"><i class="ti ti-map-pin" aria-hidden="true"></i> ${esc(fp.place)}</p>` : ''}
      ${admin() && ui.fpEdit === fp.id ? fpForm(fp) : `${counts}${action}${adminBox}`}
    </div>`;
  }

  // Modulo di creazione (fp = null) o di modifica di una sessione.
  function fpForm(fp) {
    const today = todayStr(), v = fp || { name: '', date: today, from: '18:00', to: '21:00', levels: ['all'], place: '' };
    const lv = v.levels || ['all'], all = lv.includes('all');
    const form = `<form class="grid-form" data-form="fp-save" data-id="${fp ? fp.id : ''}">
        <label class="span-all">${esc(t('fpName'))}<input name="name" required maxlength="80" value="${esc(v.name)}" placeholder="${esc(t('fpNamePh'))}"></label>
        <label>${esc(t('bkDay'))}<input type="date" name="date" required min="${fp ? '' : today}" value="${v.date}"></label>
        <label>${esc(t('courtFrom'))}<select name="from">${HALF_HOURS.slice(0, -1).map(h => `<option ${h === v.from ? 'selected' : ''}>${h}</option>`).join('')}</select></label>
        <label>${esc(t('courtTo'))}<select name="to">${HALF_HOURS.slice(1).map(h => `<option ${h === v.to ? 'selected' : ''}>${h}</option>`).join('')}</select></label>
        <label>${esc(t('placeLabel'))}<input name="place" maxlength="80" value="${esc(v.place || '')}" placeholder="${esc(t('placePh'))}"></label>
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

  function fpSave(f) {
    const old = f.dataset.id ? fpById(f.dataset.id) : null;
    const levels = [...f.querySelectorAll('[name=lv]:checked')].map(x => x.value);
    const d = { name: f.name.value.trim(), date: f.date.value, from: f.from.value, to: f.to.value, levels: levels.includes('all') || !levels.length ? ['all'] : levels,
      place: f.place.value.trim(), blocks: f.blocks.checked };
    if (!d.name || !d.date) return warn('errRegFields');
    if (d.to <= d.from) return warn('fpTimeErr');
    d.startMs = new Date(`${d.date}T${d.from}`).getTime();
    d.endMs = new Date(`${d.date}T${d.to === '24:00' ? '23:59' : d.to}`).getTime();
    window.Cloud.saveFreeplay(old, d).then(() => {
      if (old) ui.fpEdit = null; else (ui.keep || {})['fp-new'] = false;
      ui.flash = { text: t(old ? 'fpSaved' : 'fpCreated') };
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
    const editing = ui.editProfile;
    return `
      ${privacyAlert()}
      ${certAlerts()}
      ${noticeAlerts()}
      ${verifyNotice()}
      ${banNotice('tour')}
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
      ${myTeams().length ? `<section class="feat-block"><h2>${esc(t('navMyMatches'))}</h2>${myMatchesBlocks(5)}</section>` : ''}
      ${myStatsCard()}
      ${myTrainingCard()}
      ${myReceiptsCard()}
      ${privacyCard()}
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
    const tours = (S().vtours || []).filter(x => x.status !== 'done').sort((a, b) => a.name.localeCompare(b.name));
    const target = ui.msgTarget || 'users';
    const f = norm(ui.msgFilter || '');
    const sent = S().messages || [];
    const who = x => x.all ? t('msgToAll') : x.tid ? t('msgToTour', { t: (vtById(x.tid) || {}).name || '?', n: (x.to || []).length }) : t('msgToN', { n: (x.to || []).length });
    return `
      <div class="page-head"><a class="back" href="#/settings">← ${esc(t('settings'))}</a><h1><i class="ti ti-mail" aria-hidden="true"></i> ${esc(t('messages'))}</h1>
        <p class="muted">${esc(t('messagesIntro'))}</p></div>
      <form class="card grid-form" data-form="msg-send">
        <h2 class="span-all">${esc(t('msgNew'))}</h2>
        <div class="segmented wrap span-all" role="group">
          ${[['users', 'msgTargetUsers'], ['all', 'msgTargetAll'], ['tour', 'msgTargetTour']].map(([v, k]) => `<button type="button" data-action="msg-target" data-v="${v}" aria-pressed="${target === v}">${esc(t(k))}</button>`).join('')}
        </div>
        ${target === 'users' ? `<label class="span-all">${esc(t('search'))}<input type="search" value="${esc(ui.msgFilter || '')}" data-change="msg-filter"></label>
          <div class="msg-users span-all">${mem.filter(x => !f || norm(personName(x)).includes(f)).map(x => `<label class="check"><input type="checkbox" name="to" value="${x.uid}" ${(ui.msgTo || []).includes(x.uid) ? 'checked' : ''} data-change="msg-to"> ${esc(personName(x))}</label>`).join('') || `<p class="muted">${esc(t('noMembers'))}</p>`}</div>` : ''}
        ${target === 'all' ? `<p class="note span-all">${esc(t('msgAllNote', { n: mem.length }))}</p>` : ''}
        ${target === 'tour' ? `<label class="span-all">${esc(t('tournament'))}<select name="tid">${tours.map(tr => `<option value="${tr.id}">${esc(tr.name)} (${tourUids(tr).length})</option>`).join('')}</select></label>` : ''}
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

  // destinatari di un torneo: capitani e giocatori collegati (account app) delle squadre del torneo
  const tourUids = tour => [...new Set((tour.groups || []).flatMap(g => g.teams).map(teamById).filter(Boolean).flatMap(tm => [tm.captainUid].concat(tm.memberUids || [])).filter(Boolean))];
  function sendMessageForm(f) {
    const target = ui.msgTarget || 'users';
    const msg = { title: f.title.value.trim(), text: f.text.value.trim(), all: false, to: [] };
    if (!msg.text) return warn('errMsgText');
    if (target === 'all') msg.all = true;
    else if (target === 'tour') {
      const tour = vtById(f.tid.value);
      if (!tour) return warn('errMsgTo');
      msg.tid = tour.id;
      msg.to = tourUids(tour);
    } else msg.to = (ui.msgTo || []).slice();
    if (!msg.all && !msg.to.length) return warn('errMsgTo');
    const btn = f.querySelector('button.primary'); btn.disabled = true;
    window.Cloud.sendMessage(msg).then(() => { ui.msgTo = []; ui.flash = { text: t('msgSentOk', { n: msg.all ? t('msgToAll') : msg.to.length }) }; render(); })
      .catch(e => { btn.disabled = false; warn('regError', { code: e.code || e.message }); });
  }

  // ====================================================================
  // TORNEI A SQUADRE (Manofuori Cup): un torneo per livello, uno o più gironi all'italiana (andata e ritorno o
  // sola andata), eventuali playoff (anche Gold e Silver). Motore in js/volley.js; gare in vmatches/{torneo_gara}.
  // I risultati li inseriscono l'admin tornei o lo scorer (account del campo legato al torneo o a tutti).
  // ====================================================================
  const VL = Volley;
  const GROUP_IDS = 'ABCDEFGH'.split('');
  const vtById = id => (S().vtours || []).find(x => x.id === id);
  const vtMatches = tid => (S().vmatches || []).filter(m => m.tid === tid);
  const vmById = id => (S().vmatches || []).find(m => m.id === id);
  // set salvati come { h, a } (Firestore non accetta liste di liste); il motore li usa come [h, a]
  const vSets = m => (m.sets || []).map(s => [Number(s.h), Number(s.a)]);
  const vEngine = m => Object.assign({}, m, { sets: vSets(m) });
  const vTeamName = (tour, id) => { const tm = teamById(id); return tm ? tm.name : (tour.teamNames || {})[id] || '?'; };
  const vGroupMatches = (tour, g) => vtMatches(tour.id).filter(m => m.stage === 'g' && m.group === g).map(vEngine);
  const vStandings = (tour, g) => {
    const grp = (tour.groups || []).find(x => x.id === g);
    const names = Object.fromEntries((grp ? grp.teams : []).map(id => [id, vTeamName(tour, id)]));
    return VL.standings(grp ? grp.teams : [], vGroupMatches(tour, g), names);
  };
  const vCanScore = tour => tourAdmin() || (!!scorer() && tour.status !== 'done' && (!scorer().tid || scorer().tid === tour.id));
  const vStarted = tour => vtMatches(tour.id).some(m => m.status === 'done');
  const fmtQ = q => (q === Infinity ? '∞' : q.toFixed(3).replace('.', ','));
  const vResult = m => { const r = VL.tally(vSets(m)); return `${r.sh}-${r.sa}`; };
  const vSetsText = m => vSets(m).map(([h, a]) => `${h}-${a}`).join(', ');
  const vWhen = m => [m.date ? fmtDate(m.date) : '', m.time || ''].filter(Boolean).join(' ');

  function vtCard(tour) {
    const ms = vtMatches(tour.id), done = ms.filter(m => m.status === 'done').length;
    return `<a class="card tour-card" href="#/vt/${tour.id}">
      <div class="tour-card-top"><span class="badge cat">${esc(tour.level)}</span>
        <span class="badge ${tour.status === 'live' ? 'st-main' : ''}">${esc(t('vtSt_' + (tour.status || 'draft')))}</span></div>
      <h3>${esc(tour.name)}</h3>
      <p class="muted small">${esc(t(tour.rr === 'a' ? 'vtRr_a' : 'vtRr_ar'))}${tour.playoff ? ' + ' + esc(t('vtPlayoff')) : ''} · ${esc(t('vtGroupsN', { n: (tour.groups || []).length }))}</p>
      ${ms.length ? `<p class="muted small">${esc(t('vtPlayedOf', { d: done, n: ms.length }))}</p>` : ''}
    </a>`;
  }

  function viewVTours() {
    const list = (S().vtours || []).slice().sort((a, b) => (teamLevels().indexOf(a.level) + 1 || 99) - (teamLevels().indexOf(b.level) + 1 || 99) || a.name.localeCompare(b.name));
    const shown = tourAdmin() ? list : list.filter(x => x.status !== 'draft');
    const levels = teamLevels().concat([...new Set(shown.map(x => x.level))].filter(l => !teamLevels().includes(l)));
    const form = tourAdmin() ? `<details class="card sub-form" data-keep="vt-new" ${keepOpen('vt-new')}><summary><i class="ti ti-plus" aria-hidden="true"></i> ${esc(t('vtNew'))}</summary>
      <form class="grid-form" data-form="vt-create">
        <label>${esc(t('tmLevel'))}<select name="level" required><option value="">—</option>${teamLevels().map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join('')}</select></label>
        <label>${esc(t('vtName'))}<input name="name" maxlength="80" placeholder="${esc(t('vtNamePh'))}"></label>
        <label>${esc(t('vtRr'))}<select name="rr"><option value="ar">${esc(t('vtRr_ar'))}</option><option value="a">${esc(t('vtRr_a'))}</option></select></label>
        <label>${esc(t('vtGroupsCount'))}<input type="number" name="nGroups" min="1" max="8" value="1" inputmode="numeric"></label>
        <label class="check span-all"><input type="checkbox" name="playoff"> ${esc(t('vtPlayoffOpt'))}</label>
        <div class="form-actions span-all"><button class="btn primary">${esc(t('vtCreate'))}</button></div>
      </form></details>` : '';
    const open = shown.filter(x => x.status !== 'done'), closed = shown.filter(x => x.status === 'done');
    const blocks = levels.map(l => ({ l, ts: open.filter(x => x.level === l) })).filter(b => b.ts.length)
      .map(b => `<section class="feat-block"><h2>${esc(b.l)}</h2><div class="cards">${b.ts.map(vtCard).join('')}</div></section>`).join('')
      + (closed.length ? `<section class="feat-block"><h2>${esc(t('vtClosedList'))}</h2><div class="cards past">${closed.map(vtCard).join('')}</div></section>` : '');
    return `<div class="page-head"><h1><i class="ti ti-trophy" aria-hidden="true"></i> ${esc(t('navTournaments'))}</h1><p class="muted">${esc(t('vtIntro'))}</p></div>
      ${form}
      ${blocks || `<div class="empty"><i class="ti ti-trophy" aria-hidden="true"></i> ${esc(t(tourAdmin() ? 'vtNoneAdmin' : 'vtNone'))}</div>`}`;
  }

  function viewVTour(tour, tab) {
    const tabs = ['groups', 'calendar', 'standings'].concat(tour.playoff ? ['playoff'] : [], vCanReferti(tour) ? ['referti'] : []);
    if (!tabs.includes(tab)) tab = (tour.groups || []).some(g => g.teams.length) && vtMatches(tour.id).length ? 'calendar' : 'groups';
    const body = tab === 'calendar' ? vtCalendar(tour) : tab === 'standings' ? vtStandingsTab(tour) : tab === 'playoff' ? vtPlayoff(tour) : tab === 'referti' ? vtRefertiTab(tour) : vtGroupsTab(tour);
    return `<div class="page-head">
        <a class="back" href="#/tornei">← ${esc(t('navTournaments'))}</a>
        <h1>${esc(tour.name)}</h1>
        <p class="meta"><span class="badge cat">${esc(tour.level)}</span> <span class="badge ${tour.status === 'live' ? 'st-main' : ''}">${esc(t('vtSt_' + (tour.status || 'draft')))}</span>
          <span class="muted">${esc(t(tour.rr === 'a' ? 'vtRr_a' : 'vtRr_ar'))}${tour.playoff ? ' + ' + esc(t('vtPlayoff')) : ''}</span></p>
      </div>
      <nav class="tabs" aria-label="${esc(t('sections'))}">${tabs.map(k => `<a href="#/vt/${tour.id}/${k}" class="${k === tab ? 'active' : ''}">${esc(t('vtTab_' + k))}</a>`).join('')}</nav>
      <section class="tab-body">${body}</section>`;
  }

  // ---------- referti e presenze (admin tornei e account dei campi del torneo) ----------
  // I referti (referti/{torneo}_{gara}) li leggono solo admin e account dei campi: per ogni gara stato, risultato,
  // apertura del referto e PDF archiviato. Le presenze contano, per ogni giocatore, le gare concluse con il referto
  // in cui è entrato davvero in campo (sestetto iniziale, sostituzione o libero); l'admin fissa il minimo di gare
  // giocate per i playoff (vtours.minPlayed) e la tabella segnala chi non lo raggiunge.
  const vCanReferti = tour => tourAdmin() || (!!scorer() && vCanScore(tour));
  let refRulesPromise = null;
  function loadRefRules() {
    if (window.Rules) return Promise.resolve(window.Rules);
    if (!refRulesPromise) refRulesPromise = new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = 'referto-indoor/js/rules.js';
      sc.onload = () => resolve(window.Rules); sc.onerror = () => { refRulesPromise = null; reject(new Error('rules')); };
      document.head.appendChild(sc);
    });
    return refRulesPromise;
  }
  const vRefKey = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  // { teamId: { matches, players: { key: { no, name, n } } } } dalle gare concluse con il referto
  function vPresence(tour, refs) {
    const R = window.Rules, out = {};
    const teamOf = id => (out[id] = out[id] || { matches: 0, players: {} });
    refs.forEach(r => {
      if (!r.json) return;
      let m, st;
      try { m = JSON.parse(r.json); st = R.replay(m); } catch (e) { return; }
      if (st.phase !== 'matchEnd') return;
      [['A', r.a], ['B', r.b]].forEach(([side, id]) => {
        const T = teamOf(id), seen = new Set();
        T.matches++;
        st.sets.forEach(s => {
          if (!s.lineup) return;
          s.lineup[side].forEach(n => seen.add(+n));
          s.subs[side].forEach(x => seen.add(+x.in));
          (s.liberoLog ? s.liberoLog[side] : []).filter(x => x.type !== 'out').forEach(x => seen.add(+x.no));
        });
        const roster = (m.teams && m.teams[side] && m.teams[side].players) || [];
        seen.forEach(no => {
          const p = roster.find(x => +x.no === no) || {};
          const key = p.name ? vRefKey(p.name) : '#' + no;
          const row = T.players[key] = T.players[key] || { no, name: p.name || '', n: 0 };
          row.n++; row.no = no;
        });
      });
    });
    return out;
  }
  function vtRefertiTab(tour) {
    if (!S().refLoaded || !S().pdfLoaded) return `<div class="card"><p class="muted"><i class="ti ti-loader-2" aria-hidden="true"></i> ${esc(t('loading'))}</p></div>`;
    const refs = Object.entries(S().referti || {}).map(([id, r]) => Object.assign({ id }, r)).filter(r => r.tid === tour.id);
    const ms = vtMatches(tour.id).slice().sort((a, b) => (a.stage === 'p') - (b.stage === 'p') || (a.day || 0) - (b.day || 0) || byWhen(a, b));
    const refOf = m => refs.find(r => r.id === m.id && r.a === m.home && r.b === m.away);
    const pdfOf = id => (S().refPdf || {})[id];
    const rows = ms.map(m => ({ m, r: refOf(m) })).filter(x => x.r);
    const score = r => { const sw = r.setsWon || {}; const sets = (r.sets || []).map(x => `${x.a}-${x.b}`).join(', '); return `${sw.a || 0}-${sw.b || 0}${sets ? ` (${sets})` : ''}`; };
    const b = ui.refBuild && ui.refBuild.tid === tour.id ? ui.refBuild : null;
    const list = `<div class="card folder">
      <div class="card-head"><h2><i class="ti ti-folder" aria-hidden="true"></i> ${esc(t('vtRefTitle'))} <span class="muted small">(${rows.length})</span></h2>
        ${rows.some(x => pdfOf(x.r.id)) ? `<button class="btn small" data-action="pdf-zip" data-tid="${tour.id}" ${b ? 'disabled' : ''}><i class="ti ti-file-zip" aria-hidden="true"></i> ${esc(t('vtRefZip'))}</button>` : ''}</div>
      ${b ? `<p class="muted small"><i class="ti ti-loader-2" aria-hidden="true"></i> ${esc(b.text)}</p>` : ''}
      ${rows.length ? `<ul class="vm-list">${rows.map(({ m, r }) => `<li class="vm-row ref-row">
        <div class="vm-teams">${esc(vTeamName(tour, m.home))} <span class="muted">–</span> ${esc(vTeamName(tour, m.away))}</div>
        <div class="vm-score">${vRefBadge(m, r)} <strong>${esc(score(r))}</strong></div>
        <div class="vm-when muted small">${esc(vPhaseText(tour, m))}${m.date || m.time ? ` · ${esc(vWhen(m))}` : ''}${r.updatedBy ? ` · ${esc(r.updatedBy)}` : ''}</div>
        <div class="btn-row vm-actions">
          <a class="btn small" href="referto-indoor/?g=${encodeURIComponent(r.id)}" target="_blank" rel="noopener"><i class="ti ti-device-tablet" aria-hidden="true"></i> ${esc(t('vtRefOpen'))}</a>
          ${pdfOf(r.id) ? `<button class="btn small" data-action="pdf-view" data-id="${r.id}"><i class="ti ti-file-type-pdf" aria-hidden="true"></i> PDF</button>` : ''}</div>
      </li>`).join('')}</ul>` : `<p class="muted">${esc(t('vtRefNone'))}</p>`}
    </div>`;
    // presenze: servono le regole del referto per rileggere le gare
    if (!window.Rules) { loadRefRules().then(() => render()).catch(() => {}); return list + `<div class="card"><p class="muted"><i class="ti ti-loader-2" aria-hidden="true"></i> ${esc(t('loading'))}</p></div>`; }
    const pres = vPresence(tour, rows.map(x => x.r));
    const min = Number(tour.minPlayed) || 0;
    const teamIds = [...new Set((tour.groups || []).flatMap(g => g.teams))];
    const teamCard = id => {
      const T = pres[id] || { matches: 0, players: {} };
      const list = Object.values(T.players);
      // giocatori della rosa senza presenze (rosa visibile all'admin tornei)
      rosterOf(id).forEach(p => {
        const name = `${p.first} ${p.last}`.trim();
        if (!list.some(x => vRefKey(x.name) === vRefKey(name) || (!x.name && +x.no === +p.num))) list.push({ no: p.num === '' ? '' : Number(p.num), name, n: 0 });
      });
      list.sort((a, b) => b.n - a.n || (a.no === '' ? 999 : a.no) - (b.no === '' ? 999 : b.no));
      const under = min ? list.filter(x => x.n < min).length : 0;
      return `<div class="card"><h3>${esc(vTeamName(tour, id))} <span class="muted small">· ${esc(t('vtPresMatches', { n: T.matches }))}</span>
          ${min ? (under ? `<span class="badge warn-b">${esc(t('vtPresUnder', { n: under }))}</span>` : `<span class="badge st-done">${esc(t('vtPresAllOk'))}</span>`) : ''}</h3>
        ${list.length ? `<table class="table pres-table"><thead><tr><th class="num">${esc(t('tmNumShort'))}</th><th>${esc(t('player'))}</th><th class="num">${esc(t('vtPresPlayed'))}</th></tr></thead><tbody>
          ${list.map(x => `<tr class="${min && x.n < min ? 'pres-under' : ''}"><td class="num">${esc(x.no)}</td><td>${esc(x.name || '—')}</td><td class="num"><strong>${x.n}</strong>${min && x.n < min ? ` <span class="muted small">/ ${min}</span>` : ''}</td></tr>`).join('')}
        </tbody></table>` : `<p class="muted small">${esc(t('vtPresNone'))}</p>`}</div>`;
    };
    return list + `<div class="card"><h2><i class="ti ti-users" aria-hidden="true"></i> ${esc(t('vtPresTitle'))}</h2>
        <p class="muted small">${esc(t('vtPresHelp'))}</p>
        ${tourAdmin() ? `<form class="pres-min" data-form="vt-minplayed" data-id="${tour.id}">
          <label>${esc(t('vtPresMin'))} <input type="number" name="min" min="0" max="99" inputmode="numeric" value="${min || ''}" placeholder="0"></label>
          <button class="btn small primary">${esc(t('save'))}</button></form>` : min ? `<p><strong>${esc(t('vtPresMin'))}: ${min}</strong></p>` : ''}
      </div>
      <div class="cards pres-cards">${teamIds.map(teamCard).join('')}</div>`;
  }
  // stato del referto per i tornei a squadre (niente omologa: il risultato si riporta nella gara)
  function vRefBadge(m, r) {
    if (m.status === 'done') return `<span class="badge st-done">${esc(t('vtRefReported'))}</span>`;
    if (r.status === 'live') return `<span class="live-badge"><i class="dot" aria-hidden="true"></i>${esc(t('liveBadge'))}</span>`;
    if (r.status === 'finished' || r.status === 'approved') return `<span class="badge warn-b">${esc(t('vmRefDone'))}</span>`;
    return `<span class="badge">${esc(t('escoreSt_ready'))}</span>`;
  }
  function vPhaseText(tour, m) {
    return m.stage === 'g' ? `${t('vtGroup', { g: m.group })} · ${t('vmDay', { n: m.day })}`
      : `${((tour.brackets || []).find(b => b.id === m.bracket) || {}).name || t('vtTab_playoff')} · ${t('vmLeg', { n: m.leg })}`;
  }

  // ---------- squadre e gironi ----------
  function vtGroupsTab(tour) {
    const groups = tour.groups || [];
    const hasMatches = vtMatches(tour.id).some(m => m.stage === 'g');
    const groupsView = groups.map(g => `<div class="card"><h2>${esc(t('vtGroup', { g: g.id }))} <small class="muted">(${g.teams.length})</small></h2>
      ${g.teams.length ? `<ol class="plain-list vt-teams">${g.teams.map(id => `<li>${esc(vTeamName(tour, id))}</li>`).join('')}</ol>` : `<p class="muted small">${esc(t('vtGroupEmpty'))}</p>`}</div>`).join('');
    if (!tourAdmin()) return `<div class="pools-grid">${groupsView}</div>`;
    if (hasMatches) {
      return `<div class="pools-grid">${groupsView}</div>
        <div class="card"><p class="muted small">${esc(t(vStarted(tour) ? 'vtLockedPlayed' : 'vtLockedCal'))}</p>
          ${vStarted(tour) ? '' : `<button class="btn danger small" data-action="vt-cal-reset" data-id="${tour.id}"><i class="ti ti-refresh" aria-hidden="true"></i> ${esc(t('vtCalReset'))}</button>`}</div>
        ${vtAdminBox(tour)}`;
    }
    const inGroup = Object.fromEntries(groups.flatMap(g => g.teams.map(id => [id, g.id])));
    const teams = (S().teams || []).filter(x => x.level === tour.level && x.status === 'ok').concat(Object.keys(inGroup).filter(id => !teamById(id)).map(id => ({ id, name: vTeamName(tour, id) })))
      .sort((a, b) => a.name.localeCompare(b.name));
    return `<form class="card" data-form="vt-groups" data-id="${tour.id}">
        <h2><i class="ti ti-users-group" aria-hidden="true"></i> ${esc(t('vtAssign'))}</h2>
        <p class="muted small">${esc(t('vtAssignHelp', { l: tour.level }))}</p>
        ${teams.length ? `<ul class="plain-list vt-assign">${teams.map(tm => `<li><span>${esc(tm.name)}</span>
          <select name="g_${tm.id}" aria-label="${esc(t('vtGroupCol'))}"><option value="">${esc(t('vtOut'))}</option>${groups.map(g => `<option value="${g.id}" ${inGroup[tm.id] === g.id ? 'selected' : ''}>${esc(t('vtGroup', { g: g.id }))}</option>`).join('')}</select></li>`).join('')}</ul>`
          : `<p class="note warn">${esc(t('vtNoTeams', { l: tour.level }))}</p>`}
        <div class="form-actions">
          <button type="button" class="btn" data-action="vt-draw" data-id="${tour.id}"><i class="ti ti-arrows-shuffle" aria-hidden="true"></i> ${esc(t('vtDraw'))}</button>
          <button class="btn primary">${esc(t('vtSaveGroups'))}</button></div>
      </form>
      <div class="pools-grid">${groupsView}</div>
      <div class="card"><h2><i class="ti ti-calendar-plus" aria-hidden="true"></i> ${esc(t('vtCalTitle'))}</h2><p class="muted small">${esc(t('vtCalHelp'))}</p>
        <button class="btn primary" data-action="vt-cal" data-id="${tour.id}" ${groups.some(g => g.teams.length >= 2) ? '' : 'disabled'}>${esc(t('vtCalMake'))}</button></div>
      ${vtAdminBox(tour)}`;
  }

  // impostazioni del torneo (admin): nome, gironi, formula, eliminazione
  function vtAdminBox(tour) {
    const locked = vtMatches(tour.id).length > 0;
    return `<details class="card sub-form"><summary><i class="ti ti-settings" aria-hidden="true"></i> ${esc(t('vtSettings'))}</summary>
      <form class="grid-form" data-form="vt-edit" data-id="${tour.id}">
        <label class="span-all">${esc(t('vtName'))}<input name="name" required maxlength="80" value="${esc(tour.name)}"></label>
        <label>${esc(t('vtRr'))}<select name="rr" ${locked ? 'disabled' : ''}><option value="ar" ${sel(tour.rr, 'ar')}>${esc(t('vtRr_ar'))}</option><option value="a" ${sel(tour.rr, 'a')}>${esc(t('vtRr_a'))}</option></select></label>
        <label>${esc(t('vtGroupsCount'))}<input type="number" name="nGroups" min="1" max="8" value="${(tour.groups || []).length || 1}" inputmode="numeric" ${locked ? 'disabled' : ''}></label>
        <label class="check span-all"><input type="checkbox" name="playoff" ${tour.playoff ? 'checked' : ''}> ${esc(t('vtPlayoffOpt'))}</label>
        <div class="form-actions span-all">
          ${tour.status === 'done' ? `<button type="button" class="btn" data-action="vt-reopen" data-id="${tour.id}"><i class="ti ti-lock-open" aria-hidden="true"></i> ${esc(t('vtReopen'))}</button>`
            : tour.status === 'live' ? `<button type="button" class="btn" data-action="vt-close" data-id="${tour.id}"><i class="ti ti-flag-check" aria-hidden="true"></i> ${esc(t('vtClose'))}</button>` : ''}
          <button type="button" class="btn danger" data-action="vt-delete" data-id="${tour.id}"><i class="ti ti-trash" aria-hidden="true"></i> ${esc(t('vtDelete'))}</button>
          <button class="btn primary">${esc(t('save'))}</button></div>
      </form></details>`;
  }

  // ---------- calendario e risultati ----------
  // Referto elettronico (referto-indoor/): stesso id della gara, punteggio pubblico in live/{id}.
  const vLive = m => (S().live || {})[m.id] || null;
  const vCanEscore = tour => (tourAdmin() || (!!scorer() && vCanScore(tour))) && tour.status !== 'done';
  function vLiveText(lv) {
    // il referto mette in "sets" anche il set in corso (che è anche "cur"): qui contano solo i set finiti
    const sets = (lv.sets || []).slice(0, lv.cur && lv.cur.set ? lv.cur.set - 1 : undefined).map(([a, b]) => `${a}-${b}`);
    if (lv.cur) sets.push(`${lv.cur.a}-${lv.cur.b}`);
    return `${(lv.setsWon || {}).a || 0}-${(lv.setsWon || {}).b || 0}${sets.length ? ` (${sets.join(', ')})` : ''}`;
  }
  function vmRow(tour, m) {
    const done = m.status === 'done';
    const r = done ? VL.tally(vSets(m)) : null;
    const editing = ui.vmEdit === m.id && vCanScore(tour);
    const lv = vLive(m);
    const liveNow = !done && lv && lv.status === 'live' && ((lv.sets || []).length || lv.cur);
    const refDone = !done && lv && lv.status === 'finished' && (lv.sets || []).length;
    const name = (id, w) => `<span class="${w ? 'vm-win' : ''}">${esc(vTeamName(tour, id))}</span>`;
    return `<li class="vm-row ${done ? 'done' : ''}" id="vm-${m.id}">
      <div class="vm-teams">${name(m.home, r && r.winner === 'h')} <span class="muted">–</span> ${name(m.away, r && r.winner === 'a')}</div>
      <div class="vm-score">${done ? `<strong>${vResult(m)}</strong> <small class="muted">(${esc(vSetsText(m))})</small>`
        : liveNow ? `<span class="badge live-b">${esc(t('vmLive'))}</span> <strong>${esc(vLiveText(lv))}</strong>`
        : refDone ? `<span class="badge warn-b">${esc(t('vmRefDone'))}</span> <strong>${esc(vLiveText(lv))}</strong>`
        : `<span class="muted small">${esc(t('vmToPlay'))}</span>`}</div>
      <div class="vm-when muted small">${m.date || m.time ? `<i class="ti ti-calendar" aria-hidden="true"></i> ${esc(vWhen(m))}` : esc(t('vmNoDate'))}${m.place ? ` · <i class="ti ti-map-pin" aria-hidden="true"></i> ${esc(m.place)}` : ''}${m.mode === 'bo5' ? ` · ${esc(t('vmBo5'))}` : ''}</div>
      ${vCanScore(tour) && !editing ? `<div class="btn-row vm-actions">
        ${refDone ? `<button class="btn small primary" data-action="vm-fromref" data-id="${m.id}"><i class="ti ti-check" aria-hidden="true"></i> ${esc(t('vmFromRef'))}</button>` : ''}
        ${vCanEscore(tour) && !done ? `<button class="btn small" data-action="vm-escore" data-id="${m.id}"><i class="ti ti-device-tablet" aria-hidden="true"></i> E-scoresheet</button>` : ''}
        <button class="btn small" data-action="vm-edit" data-id="${m.id}"><i class="ti ti-pencil" aria-hidden="true"></i> ${esc(t(tourAdmin() ? 'vmEdit' : 'vmResult'))}</button></div>` : ''}
      ${editing ? vmForm(tour, m) : ''}
    </li>`;
  }

  function vmForm(tour, m) {
    const bo5 = m.mode === 'bo5', n = bo5 ? 5 : 3, cur = vSets(m);
    const rows = Array.from({ length: n }, (_, i) => `<div class="vm-set"><span>${esc(t('vmSetN', { n: i + 1 }))}${bo5 && i === 4 ? ` <small class="muted">(15)</small>` : ''}</span>
      <input type="number" name="h${i}" min="0" max="99" inputmode="numeric" value="${cur[i] ? cur[i][0] : ''}" aria-label="${esc(vTeamName(tour, m.home))} · ${esc(t('vmSetN', { n: i + 1 }))}">
      <input type="number" name="a${i}" min="0" max="99" inputmode="numeric" value="${cur[i] ? cur[i][1] : ''}" aria-label="${esc(vTeamName(tour, m.away))} · ${esc(t('vmSetN', { n: i + 1 }))}"></div>`).join('');
    return `<form class="vm-form" data-form="vm-save" data-id="${m.id}">
      ${tourAdmin() ? `<div class="grid-form vm-meta">
        <label>${esc(t('date'))}<input type="date" name="date" value="${esc(m.date || '')}"></label>
        <label>${esc(t('vmTime'))}<input type="time" name="time" value="${esc(m.time || '')}"></label>
        <label class="span-all">${esc(t('placeLabel'))}<input name="place" maxlength="80" value="${esc(m.place || '')}" placeholder="${esc(t('placePh'))}"></label></div>` : ''}
      <div class="vm-sets"><div class="vm-set vm-set-head"><span></span><span>${esc(vTeamName(tour, m.home))}</span><span>${esc(vTeamName(tour, m.away))}</span></div>${rows}</div>
      <p class="muted small">${esc(t(bo5 ? 'vmHelpBo5' : 'vmHelp3'))}</p>
      <div class="form-actions">
        <button type="button" class="btn" data-action="vm-edit" data-id="">${esc(t('cancel'))}</button>
        ${m.status === 'done' ? `<button type="button" class="btn danger" data-action="vm-clear" data-id="${m.id}">${esc(t('vmClear'))}</button>` : ''}
        <button class="btn primary">${esc(t('save'))}</button></div>
    </form>`;
  }

  function vtCalendar(tour) {
    const ms = vtMatches(tour.id).filter(m => m.stage === 'g');
    if (!ms.length) return `<div class="empty">${esc(t('vtNoCalendar'))}</div>`;
    const groups = (tour.groups || []).filter(g => ms.some(m => m.group === g.id));
    const gSel = groups.some(g => g.id === ui.vtGroup) ? ui.vtGroup : (groups.length > 1 ? '' : groups[0].id);
    const pick = groups.length > 1 ? `<div class="segmented wrap" role="group">
      <button data-action="vt-group" data-g="" aria-pressed="${!gSel}">${esc(t('vtAllGroups'))}</button>
      ${groups.map(g => `<button data-action="vt-group" data-g="${g.id}" aria-pressed="${gSel === g.id}">${esc(t('vtGroup', { g: g.id }))}</button>`).join('')}</div>` : '';
    const blocks = groups.filter(g => !gSel || g.id === gSel).map(g => {
      const gm = ms.filter(m => m.group === g.id);
      const days = [...new Set(gm.map(m => m.day))].sort((a, b) => a - b);
      return `<div class="card"><h2>${esc(t('vtGroup', { g: g.id }))}</h2>
        ${days.map(d => {
          const dm = gm.filter(m => m.day === d).sort((a, b) => (a.date || '9').localeCompare(b.date || '9') || (a.time || '').localeCompare(b.time || ''));
          return `<div class="vm-day"><h3>${esc(t('vmDay', { n: d }))}${dm[0].leg === 2 ? ` <small class="muted">· ${esc(t('vmReturn'))}</small>` : ''}</h3>
            ${tourAdmin() ? `<form class="vm-dayform" data-form="vm-day" data-tid="${tour.id}" data-g="${g.id}" data-d="${d}">
              <input type="date" name="date" aria-label="${esc(t('vmDayDate'))}"><input name="place" maxlength="80" placeholder="${esc(t('placeLabel'))}" aria-label="${esc(t('placeLabel'))}">
              <button class="btn small">${esc(t('vmDayApply'))}</button></form>` : ''}
            <ul class="vm-list">${dm.map(m => vmRow(tour, m)).join('')}</ul></div>`;
        }).join('')}</div>`;
    }).join('');
    return `${pick}${blocks}`;
  }

  function vtStandingsTab(tour) {
    const groups = (tour.groups || []).filter(g => g.teams.length);
    if (!groups.length) return `<div class="empty">${esc(t('vtNoTeamsYet'))}</div>`;
    const qual = tour.playoff ? (tour.po || {}) : {};
    return groups.map(g => {
      const st = vStandings(tour, g.id);
      return `<div class="card"><h2>${esc(t('vtGroup', { g: g.id }))}</h2><div class="table-wrap"><table class="table vt-table">
        <thead><tr><th class="num">#</th><th>${esc(t('vtTeam'))}</th><th class="num" title="${esc(t('vtColPtsT'))}">${esc(t('vtColPts'))}</th><th class="num" title="${esc(t('vtColGT'))}">${esc(t('vtColG'))}</th><th class="num" title="${esc(t('vtColWT'))}">${esc(t('vtColW'))}</th><th class="num" title="${esc(t('vtColLT'))}">${esc(t('vtColL'))}</th>
          <th class="num hide-sm">${esc(t('vtColSW'))}</th><th class="num hide-sm">${esc(t('vtColSL'))}</th><th class="num" title="${esc(t('vtColQST'))}">${esc(t('vtColQS'))}</th><th class="num hide-sm">${esc(t('vtColPW'))}</th><th class="num hide-sm">${esc(t('vtColPL'))}</th><th class="num" title="${esc(t('vtColQPT'))}">${esc(t('vtColQP'))}</th></tr></thead>
        <tbody>${st.map(r => `<tr class="${qual.goldPer && r.pos <= qual.goldPer ? 'qualified' : qual.silverPer && r.pos <= (qual.goldPer || 0) + qual.silverPer ? 'qualified-silver' : ''}">
          <td class="num">${r.pos}</td><td>${esc(vTeamName(tour, r.id))}</td><td class="num"><strong>${r.pts}</strong></td><td class="num">${r.g}</td><td class="num">${r.w}</td><td class="num">${r.l}</td>
          <td class="num hide-sm">${r.sw}</td><td class="num hide-sm">${r.sl}</td><td class="num">${fmtQ(r.qs)}</td><td class="num hide-sm">${r.pw}</td><td class="num hide-sm">${r.pl}</td><td class="num">${fmtQ(r.qp)}</td></tr>`).join('')}</tbody>
      </table></div><p class="muted small">${esc(t('vtTiebreak'))}</p></div>`;
    }).join('');
  }

  // ---------- playoff ----------
  const BRACKET_NAMES = { gold: 'Gold', silver: 'Silver', main: 'Playoff' };
  function vtPlayoff(tour) {
    const brs = tour.brackets || [];
    const ms = vtMatches(tour.id).filter(m => m.stage === 'p').map(vEngine);
    let setup = '';
    if (tourAdmin() && !ms.length) {
      const po = tour.po || {};
      const groupDone = vtMatches(tour.id).filter(m => m.stage === 'g').every(m => m.status === 'done');
      setup = `<form class="card grid-form" data-form="vt-po" data-id="${tour.id}">
        <h2 class="span-all"><i class="ti ti-tournament" aria-hidden="true"></i> ${esc(t('vtPoSetup'))}</h2>
        <p class="muted small span-all">${esc(t('vtPoHelp'))}</p>
        <label>${esc(t('vtPoGold'))}<input type="number" name="goldPer" min="1" max="16" required value="${po.goldPer || 2}" inputmode="numeric"></label>
        <label>${esc(t('vtPoSilver'))}<input type="number" name="silverPer" min="0" max="16" value="${po.silverPer || 0}" inputmode="numeric"><small class="muted">${esc(t('vtPoSilverHelp'))}</small></label>
        ${groupDone ? '' : `<p class="note warn span-all">${esc(t('vtPoNotDone'))}</p>`}
        <div class="form-actions span-all"><button class="btn primary">${esc(t(brs.length ? 'vtPoRemake' : 'vtPoMake'))}</button></div>
      </form>`;
    }
    if (!brs.length) return setup || `<div class="empty">${esc(t('vtPoNone'))}</div>`;
    return setup + brs.map(br => vtBracket(tour, br, ms)).join('');
  }

  function vtBracket(tour, br, ms) {
    const rounds = VL.bracket(br, ms);
    const started = ms.some(m => m.bracket === br.id);
    const seeds = `<details class="sub-form" ${!started && tourAdmin() ? 'open' : ''}><summary>${esc(t('vtSeeds', { n: br.seeds.length }))}</summary>
      <ol class="plain-list vt-seeds">${br.seeds.map((id, i) => `<li><span>${i + 1}. ${esc(vTeamName(tour, id))}</span>
        ${tourAdmin() && !started ? `<span class="btn-row"><button class="icon-btn" data-action="vt-seed" data-id="${tour.id}" data-b="${br.id}" data-i="${i}" data-d="-1" ${i ? '' : 'disabled'} aria-label="${esc(t('vtSeedUp'))}"><i class="ti ti-arrow-up" aria-hidden="true"></i></button>
          <button class="icon-btn" data-action="vt-seed" data-id="${tour.id}" data-b="${br.id}" data-i="${i}" data-d="1" ${i < br.seeds.length - 1 ? '' : 'disabled'} aria-label="${esc(t('vtSeedDown'))}"><i class="ti ti-arrow-down" aria-hidden="true"></i></button></span>` : ''}</li>`).join('')}</ol></details>`;
    const body = rounds.map(rd => {
      const created = rd.ties.some(tt => tt.matches.length);
      const pending = rd.ties.concat(rd.third ? [rd.third] : []).filter(tt => tt.ready && tt.a && tt.b && !tt.matches.length);
      const last = rd.r === rounds.length - 1;
      const cfg = tourAdmin() && pending.length ? `<form class="vt-roundform" data-form="vt-round" data-id="${tour.id}" data-b="${br.id}" data-r="${rd.r}">
          <select name="mode" aria-label="${esc(t('vtRoundMode'))}"><option value="3" ${sel(rd.mode, '3')}>${esc(t('vtMode_3'))}</option><option value="bo5" ${sel(rd.mode, 'bo5')}>${esc(t('vtMode_bo5'))}</option></select>
          ${last && rd.third ? `<label class="vt-golden-to">${esc(t('vtThirdMode'))} <select name="thirdMode"><option value="3" ${sel(rd.thirdMode, '3')}>${esc(t('vtMode_3'))}</option><option value="bo5" ${sel(rd.thirdMode, 'bo5')}>${esc(t('vtMode_bo5'))}</option></select></label>` : ''}
          ${last ? `<span class="muted small">${esc(t(rd.third ? 'vtFinalSingle3' : 'vtFinalSingle'))}</span>` : `<select name="legs" aria-label="${esc(t('vtRoundLegs'))}"><option value="1" ${rd.legs === 1 ? 'selected' : ''}>${esc(t('vtLegs_1'))}</option><option value="2" ${rd.legs === 2 ? 'selected' : ''}>${esc(t('vtLegs_2'))}</option></select>
          <label class="vt-golden-to">${esc(t('vtGoldenTo'))} <input type="number" name="goldenTo" min="5" max="25" value="${(br.rounds[rd.r] || {}).goldenTo || 15}" inputmode="numeric"></label>`}
          <button class="btn small primary">${esc(t('vtRoundMake', { n: pending.length }))}</button></form>` : '';
      return `<div class="vt-round"><h3>${esc(t('vtRound_' + (rd.name.startsWith('r') ? 'n' : rd.name), { n: rd.name.slice(1) }))}
          ${created || !pending.length ? `<small class="muted">· ${esc(t('vtMode_' + rd.mode))}${last ? '' : ' · ' + esc(t('vtLegs_' + rd.legs))}</small>` : ''}</h3>
        ${cfg}
        <ul class="vt-ties">${rd.ties.filter(tt => tt.ready ? (tt.a || tt.b) : true).map(tt => vtTie(tour, tt)).join('')}</ul>
        ${rd.third ? `<h3 class="vt-third-title">${esc(t('vtThird'))}${rd.third.matches.length ? ` <small class="muted">· ${esc(t('vtMode_' + (rd.third.matches[0].mode === 'bo5' ? 'bo5' : '3')))}</small>` : ''}</h3><ul class="vt-ties">${vtTie(tour, rd.third)}</ul>` : ''}</div>`;
    }).join('');
    const fin = rounds.length ? rounds[rounds.length - 1] : null, ft = fin && fin.ties[0];
    const podium = [ft && ft.winner, ft && ft.winner ? (ft.winner === ft.a ? ft.b : ft.a) : null, fin && fin.third && fin.third.winner,
      fin && fin.third && fin.third.winner ? (fin.third.winner === fin.third.a ? fin.third.b : fin.third.a) : null];
    return `<div class="card vt-bracket"><h2><i class="ti ti-tournament" aria-hidden="true"></i> ${esc(br.name)}</h2>
      ${podium[0] ? `<ol class="vt-podium">${podium.map((id, i) => (id ? `<li class="p${i + 1}"><span>${['🥇', '🥈', '🥉', '4°'][i]}</span> ${esc(vTeamName(tour, id))}</li>` : '')).join('')}</ol>` : ''}
      ${seeds}${body}</div>`;
  }

  // Un confronto del tabellone: squadre, chi passa, gare e (se serve) il golden set.
  function vtTie(tour, tt) {
    const nm = id => (id ? esc(vTeamName(tour, id)) : `<span class="muted">${esc(t('vtTbd'))}</span>`);
    if (tt.bye) return `<li class="vt-tie bye">${nm(tt.a || tt.b)} <span class="muted small">· ${esc(t('vtBye'))}</span></li>`;
    const back = tt.matches.find(m => m.leg === 2);
    const g = back && back.golden;
    let golden = '';
    if (tt.golden && tt.winner && g) golden = `<p class="muted small">${esc(t('vtGoldenDone', { h: vTeamName(tour, back.home), x: g.h, y: g.a, a: vTeamName(tour, back.away) }))}</p>`;
    else if (tt.golden && back) {
      golden = `<div class="note warn">${esc(t('vtGoldenNeed', { n: tt.goldenTo }))}
        ${vCanScore(tour) ? `<form class="vt-goldenform" data-form="vt-golden" data-id="${back.id}" data-to="${tt.goldenTo}">
          <label>${esc(vTeamName(tour, back.home))}<input type="number" name="h" min="0" max="99" inputmode="numeric" value="${g ? esc(g.h) : ''}"></label>
          <label>${esc(vTeamName(tour, back.away))}<input type="number" name="a" min="0" max="99" inputmode="numeric" value="${g ? esc(g.a) : ''}"></label>
          <button class="btn small primary">${esc(t('vtGoldenSave'))}</button></form>` : ''}</div>`;
    }
    return `<li class="vt-tie"><div class="vt-tie-head"><span class="${tt.winner && tt.winner === tt.a ? 'vm-win' : ''}">${nm(tt.a)}</span> <span class="muted">–</span> <span class="${tt.winner && tt.winner === tt.b ? 'vm-win' : ''}">${nm(tt.b)}</span>
      ${tt.winner ? `<span class="badge st-done">${esc(t(tt.third ? 'vtThirdWin' : 'vtPasses', { n: vTeamName(tour, tt.winner) }))}</span>` : ''}</div>
      ${tt.matches.length ? `<ul class="vm-list">${tt.matches.map(m => vmRow(tour, vmById(m.id) || m)).join('')}</ul>` : ''}
      ${golden}</li>`;
  }

  // ---------- azioni e moduli (admin tornei; risultati anche dallo scorer) ----------
  const vErr = e => warn('regError', { code: (e && (e.code || e.message)) || '' });
  function vtSaveGroupsFrom(tour, f) {
    const groups = (tour.groups || []).map(g => ({ id: g.id, teams: [] }));
    const names = Object.assign({}, tour.teamNames || {});
    [...f.querySelectorAll('select[name^="g_"]')].forEach(s => {
      const id = s.name.slice(2), g = groups.find(x => x.id === s.value);
      if (g) { g.teams.push(id); names[id] = vTeamName(tour, id); }
    });
    return { groups, teamNames: names };
  }
  function vtMakeCalendar(tour) {
    const set = {};
    (tour.groups || []).forEach(g => {
      VL.roundRobin(g.teams, tour.rr === 'a' ? 'a' : 'ar').forEach((m, i) => {
        const key = VL.groupKey(g.id, m, i);
        set[`${tour.id}_${key}`] = { tid: tour.id, key, stage: 'g', group: g.id, day: m.day, leg: m.leg, home: m.home, away: m.away, mode: '3', date: '', time: '', place: '', sets: [], status: 'sched', by: '', updated: Date.now() };
      });
    });
    return set;
  }
  // Avviso in prima pagina a capitani e giocatori (account app) delle due squadre quando cambiano data, ora o
  // palestra di una gara che li aveva già. changes = [[gara, { date, time, place } nuovi]].
  function vNotifyChanges(tour, changes) {
    const byUser = {};
    changes.forEach(([m, d]) => {
      const was = [m.date, m.time, m.place].some(Boolean);
      const diff = ['date', 'time', 'place'].some(k => k in d && (d[k] || '') !== (m[k] || ''));
      if (!was || !diff) return;
      const nm = Object.assign({}, m, d);
      const line = t('vmChanged', { h: vTeamName(tour, m.home), a: vTeamName(tour, m.away), w: vWhen(nm) || t('vmNoDate'), p: nm.place || '—' });
      [m.home, m.away].forEach(id => {
        const tm = teamById(id);
        if (!tm) return;
        [tm.captainUid].concat(tm.memberUids || []).filter(Boolean).forEach(uid => { (byUser[uid] = byUser[uid] || new Set()).add(line); });
      });
    });
    Object.entries(byUser).forEach(([uid, lines]) => window.Cloud.notify(uid, `${tour.name}: ${[...lines].join(' · ')}`));
    return Object.keys(byUser).length;
  }
  const vtActions = {
    'vt-close': el => {
      const tour = vtById(el.dataset.id);
      if (!tour || !confirmed('vtCloseConfirm', { n: tour.name })) return;
      window.Cloud.saveVTour(tour.id, { status: 'done' }).then(() => { ui.flash = { text: t('vtClosed') }; render(); }).catch(vErr);
    },
    'vt-reopen': el => window.Cloud.saveVTour(el.dataset.id, { status: 'live' }).then(() => { ui.flash = { text: t('vtReopened') }; render(); }).catch(vErr),
    'vt-group': el => { ui.vtGroup = el.dataset.g; render(); },
    'vt-draw': el => {
      // sorteggio: le squadre selezionate (o tutte quelle del livello) distribuite a caso nei gironi
      const f = el.closest('form'), sels = [...f.querySelectorAll('select[name^="g_"]')];
      const tour = vtById(el.dataset.id), gs = (tour.groups || []).map(g => g.id);
      if (!gs.length || !sels.length) return;
      const pick = sels.some(s => s.value) ? sels.filter(s => s.value) : sels;
      pick.map(s => [Math.random(), s]).sort((a, b) => a[0] - b[0]).forEach(([, s], i) => { s.value = gs[i % gs.length]; });
    },
    'vt-cal': el => {
      const tour = vtById(el.dataset.id);
      if (!tour || !confirmed('vtCalConfirm')) return;
      if ((tour.groups || []).some(g => g.teams.length === 1)) return warn('vtGroupOne');
      window.Cloud.writeVMatches(vtMakeCalendar(tour), []).then(() => window.Cloud.saveVTour(tour.id, { status: 'live' }))
        .then(() => { ui.flash = { text: t('vtCalDone') }; location.hash = `#/vt/${tour.id}/calendar`; render(); }).catch(vErr);
    },
    'vt-cal-reset': el => {
      const tour = vtById(el.dataset.id);
      if (!tour || vStarted(tour) || !confirmed('vtCalResetConfirm')) return;
      window.Cloud.writeVMatches({}, vtMatches(tour.id).map(m => m.id)).then(() => window.Cloud.saveVTour(tour.id, { status: 'draft', brackets: [] }))
        .then(() => { ui.flash = { text: t('saved') }; render(); }).catch(vErr);
    },
    'vt-delete': el => {
      const tour = vtById(el.dataset.id);
      if (!tour || !confirmed('vtDeleteConfirm', { n: tour.name })) return;
      window.Cloud.deleteVTour(tour.id, vtMatches(tour.id).map(m => m.id)).then(() => { ui.flash = { text: t('vtDeleted') }; location.hash = '#/tornei'; render(); }).catch(vErr);
    },
    'vt-seed': el => {
      const tour = vtById(el.dataset.id), i = Number(el.dataset.i), j = i + Number(el.dataset.d);
      const brs = (tour.brackets || []).map(b => Object.assign({}, b, { seeds: b.seeds.slice() }));
      const br = brs.find(b => b.id === el.dataset.b);
      if (!br || j < 0 || j >= br.seeds.length) return;
      [br.seeds[i], br.seeds[j]] = [br.seeds[j], br.seeds[i]];
      window.Cloud.saveVTour(tour.id, { brackets: brs }).then(() => render()).catch(vErr);
    },
    'vm-edit': el => { ui.vmEdit = el.dataset.id || null; render(); },
    'vm-escore': el => vEscoreOpen(el.dataset.id),
    'vm-fromref': el => {
      const m = vmById(el.dataset.id), tour = m && vtById(m.tid), lv = m && vLive(m);
      if (!m || !vCanScore(tour) || !lv || lv.status !== 'finished') return;
      const sets = (lv.sets || []).map(([a, b]) => [Number(a), Number(b)]);
      const err = VL.checkSets(sets, m.mode === 'bo5' ? 'bo5' : '3');
      if (err) return warn('vmRefBad', { e: t(err) });
      window.Cloud.updateVMatch(m.id, { sets: sets.map(([h, a]) => ({ h, a })), status: 'done', by: (window.Cloud.user.email || '').toLowerCase() })
        .then(() => { ui.flash = { text: t('vmFromRefDone') }; render(); }).catch(vErr);
    },
    'vm-clear': el => {
      const m = vmById(el.dataset.id), tour = m && vtById(m.tid);
      if (!m || !vCanScore(tour) || !confirmed('vmClearConfirm')) return;
      if (m.stage === 'p' && vtMatches(tour.id).some(x => x.stage === 'p' && x.bracket === m.bracket && x.round > m.round)) return warn('vmNextRound');
      window.Cloud.updateVMatch(m.id, Object.assign({ sets: [], status: 'sched', by: (window.Cloud.user.email || '').toLowerCase() }, m.stage === 'p' ? { golden: null } : {})).then(() => { ui.vmEdit = null; render(); }).catch(vErr);
    }
  };
  const vtForms = {
    'vt-create': f => {
      const level = f.level.value, n = Math.min(8, Math.max(1, parseInt(f.nGroups.value, 10) || 1));
      if (!level) return warn('errRegFields');
      const d = { name: f.name.value.trim() || `Manofuori Cup ${level}`, level, rr: f.rr.value === 'a' ? 'a' : 'ar', playoff: f.playoff.checked,
        groups: GROUP_IDS.slice(0, n).map(id => ({ id, teams: [] })), teamNames: {}, status: 'draft', po: { goldPer: 2, silverPer: 0 }, brackets: [] };
      window.Cloud.saveVTour(null, d).then(id => { (ui.keep || {})['vt-new'] = false; location.hash = `#/vt/${id}/groups`; }).catch(vErr);
    },
    'vt-edit': f => {
      const tour = vtById(f.dataset.id);
      if (!tour) return;
      const d = { name: f.name.value.trim() || tour.name, playoff: f.playoff.checked };
      if (!vtMatches(tour.id).length) {
        const n = Math.min(8, Math.max(1, parseInt(f.nGroups.value, 10) || 1));
        d.rr = f.rr.value === 'a' ? 'a' : 'ar';
        // gironi: si tengono le squadre di quelli che restano
        d.groups = GROUP_IDS.slice(0, n).map(id => (tour.groups || []).find(g => g.id === id) || { id, teams: [] });
      }
      window.Cloud.saveVTour(tour.id, d).then(() => { ui.flash = { text: t('saved') }; render(); }).catch(vErr);
    },
    'vt-groups': f => {
      const tour = vtById(f.dataset.id);
      if (!tour) return;
      window.Cloud.saveVTour(tour.id, vtSaveGroupsFrom(tour, f)).then(() => { ui.flash = { text: t('saved') }; render(); }).catch(vErr);
    },
    'vt-po': f => {
      const tour = vtById(f.dataset.id);
      if (!tour) return;
      const goldPer = Math.max(1, parseInt(f.goldPer.value, 10) || 1), silverPer = Math.max(0, parseInt(f.silverPer.value, 10) || 0);
      const groupDone = vtMatches(tour.id).filter(m => m.stage === 'g').every(m => m.status === 'done');
      if (!groupDone && !confirmed('vtPoEarlyConfirm')) return;
      const st = (tour.groups || []).filter(g => g.teams.length).map(g => vStandings(tour, g.id));
      const take = (from, n) => VL.crossSeed(st.flatMap(rows => rows.filter(r => r.pos > from && r.pos <= from + n))).map(r => r.id);
      const brackets = [];
      const gold = take(0, goldPer);
      if (gold.length < 2) return warn('vtPoFew');
      brackets.push({ id: silverPer ? 'gold' : 'main', name: silverPer ? BRACKET_NAMES.gold : BRACKET_NAMES.main, seeds: gold, rounds: [] });
      if (silverPer) {
        const silver = take(goldPer, silverPer);
        if (silver.length >= 2) brackets.push({ id: 'silver', name: BRACKET_NAMES.silver, seeds: silver, rounds: [] });
      }
      window.Cloud.saveVTour(tour.id, { po: { goldPer, silverPer }, brackets }).then(() => { ui.flash = { text: t('vtPoMade') }; render(); }).catch(vErr);
    },
    'vt-round': f => {
      const tour = vtById(f.dataset.id), r = Number(f.dataset.r);
      const brs = (tour.brackets || []).map(b => Object.assign({}, b, { rounds: (b.rounds || []).slice() }));
      const br = brs.find(b => b.id === f.dataset.b);
      if (!br) return;
      while (br.rounds.length <= r) br.rounds.push({ mode: '3', legs: 1 });
      br.rounds[r] = { mode: f.mode.value === 'bo5' ? 'bo5' : '3', legs: f.legs && f.legs.value === '2' ? 2 : 1, goldenTo: f.goldenTo ? Math.min(25, Math.max(5, parseInt(f.goldenTo.value, 10) || 15)) : 15,
        thirdMode: f.thirdMode ? (f.thirdMode.value === 'bo5' ? 'bo5' : '3') : undefined };
      if (!br.rounds[r].thirdMode) delete br.rounds[r].thirdMode;
      const ms = vtMatches(tour.id).filter(m => m.stage === 'p').map(vEngine);
      const list = VL.roundMatches(br, VL.bracket(br, ms), r);
      const set = {};
      list.forEach(m => { const key = VL.playoffKey(m); set[`${tour.id}_${key}`] = Object.assign({ tid: tour.id, key, stage: 'p', date: '', time: '', place: '', sets: [], status: 'sched', by: '', updated: Date.now() }, m); });
      window.Cloud.saveVTour(tour.id, { brackets: brs }).then(() => window.Cloud.writeVMatches(set, []))
        .then(() => { ui.flash = { text: t('vtRoundMade', { n: list.length }) }; render(); }).catch(vErr);
    },
    'vm-day': f => {
      // data e palestra per tutte le gare della giornata (solo i campi compilati)
      const d = {};
      if (f.date.value) d.date = f.date.value;
      if (f.place.value.trim()) d.place = f.place.value.trim();
      if (!Object.keys(d).length) return warn('errRegFields');
      const list = vtMatches(f.dataset.tid).filter(m => m.stage === 'g' && m.group === f.dataset.g && m.day === Number(f.dataset.d));
      const n = vNotifyChanges(vtById(f.dataset.tid), list.map(m => [m, d]));
      Promise.all(list.map(m => window.Cloud.updateVMatch(m.id, d))).then(() => { ui.flash = { text: t('saved') + (n ? ' ' + t('vmNotified', { n }) : '') }; render(); }).catch(vErr);
    },
    'vm-save': f => {
      const m = vmById(f.dataset.id), tour = m && vtById(m.tid);
      if (!m || !vCanScore(tour)) return;
      const n = m.mode === 'bo5' ? 5 : 3, sets = [];
      for (let i = 0; i < n; i++) {
        const h = f['h' + i].value, a = f['a' + i].value;
        if (h === '' && a === '') continue;
        sets.push([parseInt(h, 10), parseInt(a, 10)]);
      }
      const patch = {};
      if (tourAdmin()) Object.assign(patch, { date: f.date.value, time: f.time.value, place: f.place.value.trim() });
      if (sets.length) {
        const err = VL.checkSets(sets, m.mode === 'bo5' ? 'bo5' : '3');
        if (err) return warn(err);
        Object.assign(patch, { sets: sets.map(([h, a]) => ({ h, a })), status: 'done', by: (window.Cloud.user.email || '').toLowerCase() });
      } else if (!tourAdmin()) return warn('vNoSets');
      if (m.stage === 'p' && sets.length) patch.golden = null;
      const notified = tourAdmin() ? vNotifyChanges(tour, [[m, { date: patch.date, time: patch.time, place: patch.place }]]) : 0;
      const twin = m.stage === 'p' && m.leg === 1 ? vtMatches(tour.id).find(x => x.stage === 'p' && x.bracket === m.bracket && x.round === m.round && x.slot === m.slot && x.leg === 2 && x.golden) : null;
      window.Cloud.updateVMatch(m.id, patch).then(() => (twin ? window.Cloud.updateVMatch(twin.id, { golden: null, by: patch.by || (window.Cloud.user.email || '').toLowerCase() }) : null))
        .then(() => { ui.vmEdit = null; ui.flash = { text: t('saved') + (notified ? ' ' + t('vmNotified', { n: notified }) : '') }; render(); }).catch(vErr);
    },
    'vt-minplayed': f => {
      const tour = vtById(f.dataset.id);
      if (!tour || !tourAdmin()) return;
      const n = Math.max(0, Math.min(99, parseInt(f.min.value, 10) || 0));
      window.Cloud.saveVTour(tour.id, { minPlayed: n }).then(() => { ui.flash = { text: t('saved') }; render(); }).catch(vErr);
    },
    'vt-golden': f => {
      const m = vmById(f.dataset.id), tour = m && vtById(m.tid);
      if (!m || !vCanScore(tour)) return;
      const h = parseInt(f.h.value, 10), a = parseInt(f.a.value, 10), to = Number(f.dataset.to) || 15;
      if (!VL.setOk(h, a, to)) return warn('vGoldenBad', { n: to });
      window.Cloud.updateVMatch(m.id, { golden: { h, a }, by: (window.Cloud.user.email || '').toLowerCase() }).then(() => { ui.flash = { text: t('saved') }; render(); }).catch(vErr);
    }
  };

  // Apre il referto elettronico della gara (lo crea la prima volta con squadre, rose e formula).
  // Squadra A = squadra di casa. Formula: gironi 3 set fissi a 25; playoff come scelto per il turno.
  const vMixed = id => { const tm = teamById(id); return !tm || tm.kind === 'X'; };
  function vEscoreInfo(tour, m) {
    const team = id => ({ name: vTeamName(tour, id), players: rosterOf(id).slice().sort(byShirt)
      .map(x => ({ no: x.num === '' ? '' : Number(x.num), name: `${x.first} ${x.last}`, gender: x.g === 'F' ? 'F' : 'M', libero: false, captain: false })) });
    const phase = m.stage === 'g' ? `${t('vtGroup', { g: m.group })} · ${t('vmDay', { n: m.day })}`
      : `${((tour.brackets || []).find(b => b.id === m.bracket) || {}).name || t('vtTab_playoff')} · ${t('vmLeg', { n: m.leg })}`;
    return { competition: tour.name, phase, matchNo: m.key, date: m.date || '', time: m.time || '', venue: m.place || '', court: (scorer() && scorer().court) || '',
      // almeno 2 donne in campo (libero compreso) solo per le squadre miste
      settings: Object.assign(m.mode === 'bo5' ? { mode: 'best', sets: 5, points: 25, lastPoints: 15 } : { mode: 'fixed', sets: 3, points: 25, lastPoints: 25 }, { minWomen: { A: vMixed(m.home) ? 2 : 0, B: vMixed(m.away) ? 2 : 0 } }),
      // alla chiusura il referto scrive il risultato nella gara (vmatches); stage "p" = playoff
      vmatch: true, stage: m.stage, A: team(m.home), B: team(m.away) };
  }
  async function vEscoreOpen(id) {
    const m = vmById(id), tour = m && vtById(m.tid);
    if (!m || !vCanEscore(tour) || !window.Cloud) return;
    // l'admin (generale o tornei) lo apre in una nuova scheda (aperta subito, prima dell'attesa del database); lo scorer nella stessa
    const win = tourAdmin() ? window.open('', '_blank') : null;
    ui.flash = { text: t('escoreLoading') }; render();
    try {
      const rid = await window.Cloud.openReferto(tour.id, m.key, m.home, m.away, (scorer() && scorer().court) || '', vEscoreInfo(tour, m));
      const url = `referto-indoor/?g=${encodeURIComponent(rid)}`;
      if (win) { win.location.href = url; render(); } else location.href = url;
    } catch (err) {
      if (win) win.close();
      console.error(err);
      warn(err.code === 'stale' ? 'escoreStale' : 'escoreError', { code: err.code || err.message });
    }
  }

  // ---------- le mie gare (capitano e giocatori della squadra registrati nell'app) ----------
  const myTeams = () => { const uid = myUid(); return uid ? (S().teams || []).filter(x => x.captainUid === uid || (x.memberUids || []).includes(uid)) : []; };
  const teamTours = id => (S().vtours || []).filter(x => (x.groups || []).some(g => g.teams.includes(id)) || (x.brackets || []).some(b => b.seeds.includes(id)));
  const myTourIds = () => [...new Set(myTeams().flatMap(tm => teamTours(tm.id).map(x => x.id)))];
  const liveTourIds = () => { const sc = scorer(); return (S().vtours || []).filter(x => x.status === 'live' && (!sc || !sc.tid || sc.tid === x.id)).map(x => x.id); };
  const byWhen = (a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.time || '99').localeCompare(b.time || '99') || (a.day || 0) - (b.day || 0);
  // gare di una squadra: prima quelle da giocare (dalla più vicina), poi i risultati (dal più recente)
  function teamMatches(id) {
    const ms = (S().vmatches || []).filter(m => (m.home === id || m.away === id) && vtById(m.tid));
    return ms.filter(m => m.status !== 'done').sort(byWhen).concat(ms.filter(m => m.status === 'done').sort(byWhen).reverse());
  }
  function myMatchesBlocks(limit) {
    return myTeams().map(tm => {
      const ms = teamMatches(tm.id), list = limit ? ms.filter(m => m.status !== 'done').slice(0, limit) : ms;
      const byTour = {};
      list.forEach(m => { (byTour[m.tid] = byTour[m.tid] || []).push(m); });
      return `<div class="card"><h2><i class="ti ti-shirt-sport" aria-hidden="true"></i> ${esc(tm.name)} <small class="muted">· ${esc(tm.level)}${tm.captainUid === myUid() ? ' · ' + esc(t('tmCaptain')) : ''}</small></h2>
        ${Object.entries(byTour).map(([tid, arr]) => `<h3><a href="#/vt/${tid}/calendar">${esc(vtById(tid).name)}</a></h3><ul class="vm-list">${arr.map(m => vmRow(vtById(tid), m)).join('')}</ul>`).join('')
          || `<p class="muted small">${esc(t(limit ? 'mgNoneNext' : 'mgNone'))}</p>`}
        ${limit ? `<a class="btn small" href="#/gare">${esc(t('mgAll'))} →</a>` : ''}</div>`;
    }).join('');
  }
  function viewMyMatches() {
    const blocks = myMatchesBlocks(0);
    return `<div class="page-head"><h1><i class="ti ti-calendar-event" aria-hidden="true"></i> ${esc(t('navMyMatches'))}</h1><p class="muted">${esc(t('mgIntro'))}</p></div>
      ${blocks || `<div class="empty">${esc(t('mgNoTeam'))}</div>`}`;
  }

  // ---------- account del campo (scorer): le gare dei tornei a squadre ----------
  function viewMineVolley() {
    const sc = scorer();
    if (!sc) return `<div class="card"><p class="muted">${esc(t('loginHelp'))}</p><a class="btn primary" href="#/settings">${esc(t('login'))}</a></div>`;
    const tours = (S().vtours || []).filter(x => x.status === 'live' && (!sc.tid || sc.tid === x.id));
    const blocks = tours.map(tour => {
      const ms = vtMatches(tour.id).slice().sort((a, b) => (a.status === 'done') - (b.status === 'done') || (a.date || '9999').localeCompare(b.date || '9999') || (a.time || '').localeCompare(b.time || ''));
      if (!ms.length) return '';
      return `<div class="card"><h2><i class="ti ti-trophy" aria-hidden="true"></i> <a href="#/vt/${tour.id}/calendar">${esc(tour.name)}</a></h2>
        <ul class="vm-list">${ms.map(m => vmRow(tour, m)).join('')}</ul></div>`;
    }).join('');
    return `<div class="page-head"><h1><i class="ti ti-device-mobile" aria-hidden="true"></i> ${esc(t('navMine'))}</h1><p class="muted">${esc(t('vmScorerHelp'))}</p></div>
      ${blocks || `<div class="card"><p class="muted">${esc(t('mineEmpty'))}</p></div>`}`;
  }

  // ====================================================================
  // SQUADRE: il capitano (utente registrato) iscrive la squadra con livello, tipo (mista, maschile, femminile)
  // e rosa con numero di maglia; può cambiare la rosa in qualsiasi momento. L'organizzatore (admin tornei)
  // conferma l'ammissione al livello. teams/{id} è pubblico; la rosa (rosters/{id}) la vedono solo capitano e admin.
  // ====================================================================
  const LEVELS_DEFAULT = ['DINOS', 'MASTER', 'SUPER MASTER', 'SUPER 10'];   // dal meno al più forte
  const teamLevels = () => (S().levels && S().levels.length ? S().levels : LEVELS_DEFAULT);
  const TEAM_KINDS = ['X', 'M', 'F'];
  const ROSTER_TIP = 12;   // numero di giocatori consigliato (non c'è un massimo)
  const teamById = id => (S().teams || []).find(x => x.id === id);
  const rosterOf = id => ((S().rosters || []).find(x => x.id === id) || {}).players || [];
  const isCaptain = tm => !!member() && tm.captainUid === myUid();
  const canEditTeam = tm => tourAdmin() || isCaptain(tm);
  const byLevel = (a, b) => (teamLevels().indexOf(a.level) + 1 || 99) - (teamLevels().indexOf(b.level) + 1 || 99) || a.name.localeCompare(b.name);
  const byShirt = (a, b) => (a.num === '' ? 999 : Number(a.num)) - (b.num === '' ? 999 : Number(b.num)) || `${a.last} ${a.first}`.localeCompare(`${b.last} ${b.first}`);

  // Giocatore della rosa collegato (facoltativo) all'account dell'app: vede le gare della squadra nel profilo.
  // Senza collegamento scelto, si propone l'utente registrato con lo stesso nome e cognome.
  const sameMember = (a, b) => `${a.first}|${a.last}`.trim().toLowerCase() === `${b.first}|${b.last}`.trim().toLowerCase();
  function rosterUidOpts(v) {
    const ms = (S().members || []).slice().sort((a, b) => personName(a).localeCompare(personName(b)));
    const cur = v.uid || ((v.first || v.last) && v.uid !== '' && (ms.find(m => sameMember(m, v)) || {}).uid) || '';
    return `<option value="">${esc(t('tmNoAccount'))}</option>${ms.map(m => `<option value="${m.uid}" ${m.uid === cur ? 'selected' : ''}>${esc(personName(m))}</option>`).join('')}`;
  }
  function rosterRow(pl) {
    const v = pl || { num: '', last: '', first: '', g: 'M' };
    return `<div class="roster-row">
      <input name="num" type="number" min="0" max="99" inputmode="numeric" value="${esc(v.num)}" placeholder="${esc(t('tmNumShort'))}" aria-label="${esc(t('tmNum'))}">
      <input name="last" maxlength="60" value="${esc(v.last)}" placeholder="${esc(t('lastName'))}" aria-label="${esc(t('lastName'))}">
      <input name="first" maxlength="60" value="${esc(v.first)}" placeholder="${esc(t('firstName'))}" aria-label="${esc(t('firstName'))}">
      <select name="g" aria-label="${esc(t('gender'))}"><option value="M" ${sel(v.g, 'M')}>M</option><option value="F" ${sel(v.g, 'F')}>F</option></select>
      <select name="uid" aria-label="${esc(t('tmAccount'))}">${rosterUidOpts(v)}</select>
      <button type="button" class="icon-btn" data-action="tm-delrow" aria-label="${esc(t('remove'))}">✕</button>
    </div>`;
  }

  // Modulo di iscrizione (tm = null) o di modifica di una squadra.
  function teamForm(tm) {
    const v = tm || { name: '', level: '', kind: 'X', captainUid: '' };
    const players = tm ? rosterOf(tm.id).slice().sort(byShirt) : [];
    const lvLocked = !!tm && tm.status === 'ok' && !tourAdmin();
    const levels = teamLevels().concat(v.level && !teamLevels().includes(v.level) ? [v.level] : []);
    const members = tourAdmin() ? (S().members || []).slice().sort((a, b) => personName(a).localeCompare(personName(b))) : [];
    return `<form class="grid-form team-form" data-form="team-save" data-id="${tm ? tm.id : ''}" autocomplete="off">
      <label class="span-all">${esc(t('tmName'))}<input name="name" required maxlength="60" value="${esc(v.name)}"></label>
      <label>${esc(t('tmLevel'))}<select name="level" required ${lvLocked ? 'disabled' : ''}><option value="">—</option>${levels.map(l => `<option value="${esc(l)}" ${sel(v.level, l)}>${esc(l)}</option>`).join('')}</select>
        <small class="muted">${esc(t(lvLocked ? 'tmLevelLocked' : 'tmLevelHelp'))}</small></label>
      <label>${esc(t('tmKind'))}<select name="kind">${TEAM_KINDS.map(k => `<option value="${k}" ${sel(v.kind, k)}>${esc(t('tmKind_' + k))}</option>`).join('')}</select></label>
      ${tourAdmin() ? `<label>${esc(t('tmCaptain'))}<select name="captainUid"><option value="">—</option>${members.map(m => `<option value="${m.uid}" ${sel(v.captainUid, m.uid)}>${esc(personName(m))}</option>`).join('')}</select>
        <small class="muted">${esc(t('tmCaptainHelp'))}</small></label>
      <label>${esc(t('tmCaptainName'))}<input name="captainName" maxlength="130" value="${esc(v.captainUid ? '' : v.captainName || '')}"></label>` : ''}
      <fieldset class="span-all roster-edit"><legend>${esc(t('tmRoster'))}</legend>
        <div class="roster-head" aria-hidden="true"><span>${esc(t('tmNumShort'))}</span><span>${esc(t('lastName'))}</span><span>${esc(t('firstName'))}</span><span>${esc(t('gender'))}</span><span>${esc(t('tmAccount'))}</span><span></span></div>
        <div class="roster-rows">${(players.length ? players : [null]).map(rosterRow).join('')}</div>
        <div class="btn-row"><button type="button" class="btn small" data-action="tm-addrow"><i class="ti ti-user-plus" aria-hidden="true"></i> ${esc(t('tmAddPlayer'))}</button></div>
        <small class="muted">${esc(t('tmRosterHelp', { n: ROSTER_TIP }))}</small>
      </fieldset>
      <div class="form-actions span-all">${tm ? `<button type="button" class="btn" data-action="tm-edit" data-id="">${esc(t('cancel'))}</button>` : ''}
        <button class="btn primary">${esc(t(tm ? 'save' : 'tmCreate'))}</button></div>
    </form>`;
  }

  function teamStatusBadge(tm) {
    return tm.status === 'ok' ? `<span class="badge st-done">${esc(t('tmStatus_ok'))}</span>` : `<span class="badge warn-b">${esc(t('tmStatus_pending'))}</span>`;
  }

  function teamCard(tm) {
    if (ui.tmEdit === tm.id && canEditTeam(tm)) return `<div class="card team-card editing" id="tm-${tm.id}"><h3>${esc(tm.name)}</h3>${teamForm(tm)}</div>`;
    const seeRoster = canEditTeam(tm);
    const players = seeRoster ? rosterOf(tm.id).slice().sort(byShirt) : [];
    const nM = players.filter(x => x.g === 'M').length, nF = players.length - nM;
    const dupNums = [...new Set(players.map(x => x.num).filter((n, i, a) => n !== '' && a.indexOf(n) !== i))];
    return `<div class="card team-card ${isCaptain(tm) ? 'mine' : ''}" id="tm-${tm.id}">
      <div class="ch-head"><span class="badge">${esc(tm.level)}</span> <span class="badge">${esc(t('tmKind_' + tm.kind))}</span> ${teamStatusBadge(tm)}</div>
      <h3>${esc(tm.name)}</h3>
      <p class="muted small">${esc(t('tmCaptain'))}: ${esc(tm.captainName || '—')}</p>
      ${seeRoster ? `<details class="sub-form" data-keep="tmr-${tm.id}" ${keepOpen('tmr-' + tm.id)}>
        <summary><i class="ti ti-users" aria-hidden="true"></i> ${esc(t('tmRosterCount', { n: players.length, m: nM, f: nF }))}</summary>
        ${players.length ? `<table class="table roster-table"><thead><tr><th class="num">${esc(t('tmNumShort'))}</th><th>${esc(t('player'))}</th><th>${esc(t('gender'))}</th></tr></thead>
          <tbody>${players.map(x => `<tr><td class="num"><strong>${esc(x.num)}</strong></td><td>${esc(x.last)} ${esc(x.first)}</td><td>${esc(x.g)}</td></tr>`).join('')}</tbody></table>`
          : `<p class="muted small">${esc(t('tmNoPlayers'))}</p>`}
        ${dupNums.length ? `<p class="note warn">${esc(t('tmDupNums', { n: dupNums.join(', ') }))}</p>` : ''}
        ${players.length && players.length < ROSTER_TIP ? `<p class="muted small">${esc(t('tmTip', { n: ROSTER_TIP }))}</p>` : ''}
      </details>` : ''}
      ${canEditTeam(tm) ? `<div class="btn-row">
        <button class="btn small" data-action="tm-edit" data-id="${tm.id}"><i class="ti ti-pencil" aria-hidden="true"></i> ${esc(t('tmEdit'))}</button>
        ${tourAdmin() ? (tm.status === 'ok'
          ? `<button class="btn small" data-action="tm-status" data-id="${tm.id}" data-v="pending">${esc(t('tmUnconfirm'))}</button>`
          : `<button class="btn small primary" data-action="tm-status" data-id="${tm.id}" data-v="ok"><i class="ti ti-check" aria-hidden="true"></i> ${esc(t('tmConfirm'))}</button>`) : ''}
        ${tourAdmin() || tm.status !== 'ok' ? `<button class="btn small danger" data-action="tm-delete" data-id="${tm.id}"><i class="ti ti-trash" aria-hidden="true"></i> ${esc(t(tourAdmin() ? 'delete' : 'tmWithdraw'))}</button>` : ''}
      </div>` : ''}
    </div>`;
  }

  function viewTeams() {
    const m = member(), all = (S().teams || []).slice().sort(byLevel);
    const mine = m ? all.filter(isCaptain) : [];
    let create = '';
    // l'admin (generale o tornei) iscrive le squadre anche senza essere capitano: entrano già ammesse
    if (tourAdmin()) create = `<details class="card sub-form" data-keep="tm-new" ${keepOpen('tm-new')}><summary><i class="ti ti-plus" aria-hidden="true"></i> ${esc(t('tmNewAdmin'))}</summary>${teamForm(null)}</details>`;
    else if (m) {
      if (!captainRole()) create = mine.length ? '' : `<div class="card"><p class="muted"><i class="ti ti-lock" aria-hidden="true"></i> ${esc(t('tmNotCaptain'))}</p></div>`;
      else if (needsVerify()) create = `<p class="note warn">${esc(t('verifyFirst'))}</p>`;
      else if (banOf(m.uid).tour) create = banNotice('tour');
      else create = `<details class="card sub-form" data-keep="tm-new" ${keepOpen('tm-new')}><summary><i class="ti ti-plus" aria-hidden="true"></i> ${esc(t('tmNew'))}</summary>${teamForm(null)}</details>`;
    } else if (!scorer()) create = `<div class="card"><p class="muted">${esc(t('tmLoginFirst'))}</p><a class="btn" href="#/settings">${esc(t('login'))}</a></div>`;
    // elenco per livello: tutti vedono le squadre ammesse; l'admin anche quelle in attesa
    const shown = all.filter(x => tourAdmin() || x.status === 'ok');
    const pending = tourAdmin() ? all.filter(x => x.status !== 'ok').length : 0;
    const groups = teamLevels().concat([...new Set(shown.map(x => x.level))].filter(l => !teamLevels().includes(l)))
      .map(l => ({ l, list: shown.filter(x => x.level === l) })).filter(g => g.list.length);
    return `${verifyNotice()}
      <div class="page-head"><h1><i class="ti ti-shirt-sport" aria-hidden="true"></i> ${esc(t('navTeams'))}</h1><p class="muted">${esc(t('tmIntro'))}</p></div>
      ${mine.length ? `<section class="feat-block"><h2>${esc(t('tmMine'))}</h2><div class="ch-grid">${mine.map(teamCard).join('')}</div></section>` : ''}
      ${create}
      ${pending ? `<p class="note warn"><i class="ti ti-clock" aria-hidden="true"></i> ${esc(t('tmPendingAdmin', { n: pending }))}</p>` : ''}
      ${groups.length ? groups.map(g => `<section class="feat-block"><h2>${esc(g.l)} <small class="muted">(${g.list.length})</small></h2>
        <div class="ch-grid">${g.list.map(teamCard).join('')}</div></section>`).join('')
        : `<div class="empty"><i class="ti ti-shirt-sport" aria-hidden="true"></i> ${esc(t('tmNone'))}</div>`}`;
  }

  // Timbro dell'associazione e firma del Presidente per le ricevute (solo admin). Non sono file pubblici del sito:
  // stanno nel database (private/receiptSign) e li leggono solo gli utenti collegati, per stampare le ricevute.
  function signCard() {
    const sg = ui.signCache;
    if (sg === undefined && window.Cloud.receiptSign) { ui.signCache = null; window.Cloud.receiptSign().then(x => { ui.signCache = x || {}; render(); }).catch(() => { ui.signCache = {}; render(); }); }
    const prev = (k, lab) => `<div class="sign-prev"><strong>${esc(t(lab))}</strong>${sg && sg[k] ? `<img src="${sg[k]}" alt="${esc(t(lab))}">` : `<p class="muted small">${esc(t('signNone'))}</p>`}
        <label class="btn small"><i class="ti ti-upload" aria-hidden="true"></i> ${esc(t('signUpload'))}<input type="file" accept="image/*" data-change="sign-file" data-k="${k}" hidden></label></div>`;
    return `<div class="card" id="sign"><h2><i class="ti ti-signature" aria-hidden="true"></i> ${esc(t('signTitle'))}</h2>
      <p class="muted small">${esc(t('signHelp'))}</p>
      <div class="sign-grid">${prev('stamp', 'signStamp')}${prev('signature', 'signSignature')}</div></div>`;
  }
  // immagine caricata: ridotta, sfondo bianco reso trasparente, PNG
  function signImage(file) {
    return new Promise((resolve, reject) => {
      const rd = new FileReader();
      rd.onerror = reject;
      rd.onload = () => {
        const im = new Image();
        im.onerror = reject;
        im.onload = () => {
          const k = Math.min(1, 700 / im.width), c = document.createElement('canvas');
          c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
          const g = c.getContext('2d'); g.drawImage(im, 0, 0, c.width, c.height);
          const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
          for (let i = 0; i < px.length; i += 4) { const l = (px[i] + px[i + 1] + px[i + 2]) / 3; if (l > 215) px[i + 3] = 0; else if (l > 160) px[i + 3] = Math.round(255 * (215 - l) / 55); }
          g.putImageData(d, 0, 0);
          resolve(c.toDataURL('image/png'));
        };
        im.src = rd.result;
      };
      rd.readAsDataURL(file);
    });
  }

  // Pagina dei livelli (#/livelli): solo admin generale e admin tornei.
  function viewLevels() {
    return `<div class="page-head"><a class="back" href="#/settings">← ${esc(t('settings'))}</a>
      <h1><i class="ti ti-stairs-up" aria-hidden="true"></i> ${esc(t('tmLevelsTitle'))}</h1></div>${levelsCard()}`;
  }

  // Livelli (admin tornei): uno per riga, dal meno al più forte.
  function levelsCard() {
    return `<form class="card" data-form="levels-save" id="levels">
      <p class="muted small">${esc(t('tmLevelsHelp'))}</p>
      <textarea name="levels" rows="5">${esc(teamLevels().join('\n'))}</textarea>
      <div class="form-actions"><button class="btn primary">${esc(t('save'))}</button></div>
    </form>`;
  }

  function teamSave(f) {
    const old = f.dataset.id ? teamById(f.dataset.id) : null;
    const me = member();
    const players = [...f.querySelectorAll('.roster-row')].map(r => ({
      num: r.querySelector('[name=num]').value.trim(), last: r.querySelector('[name=last]').value.trim(),
      first: r.querySelector('[name=first]').value.trim(), g: r.querySelector('[name=g]').value, uid: r.querySelector('[name=uid]').value
    })).filter(x => x.last || x.first || x.num);
    if (players.some(x => !x.last || !x.first)) return warn('tmPlayerIncomplete');
    if (players.some(x => x.num !== '' && !(Number(x.num) >= 0 && Number(x.num) <= 99))) return warn('tmNumErr');
    const team = { name: f.name.value.trim(), level: old && f.level.disabled ? old.level : f.level.value, kind: f.kind.value };
    if (!team.name || !team.level) return warn('errRegFields');
    if (tourAdmin()) {
      const cu = f.captainUid ? f.captainUid.value : (old ? old.captainUid : '');
      const cm = cu ? memberByUid(cu) : null;
      Object.assign(team, { captainUid: cu || '', captainName: cm ? personName(cm) : (f.captainName ? f.captainName.value.trim() : (old && old.captainName) || '') });
      if (!old) team.status = 'ok';
    } else if (old) team.captainUid = old.captainUid;
    else Object.assign(team, { captainUid: me.uid, captainName: personName(me) });
    const roster = players.map(x => ({ num: x.num === '' ? '' : Number(x.num), last: x.last, first: x.first, g: x.g === 'F' ? 'F' : 'M', uid: x.uid || '' }));
    // utenti dell'app nella squadra: vedono le gare della squadra (solo gli id, la rosa resta privata)
    team.memberUids = [...new Set(roster.map(x => x.uid).filter(Boolean))];
    const send = old && !tourAdmin() ? { name: team.name, level: team.level, kind: team.kind, captainUid: old.captainUid, memberUids: team.memberUids } : team;
    window.Cloud.saveTeam(old ? old.id : null, send, roster).then(() => {
      if (old) ui.tmEdit = null; else (ui.keep || {})['tm-new'] = false;
      ui.flash = { text: t(old ? 'tmSaved' : 'tmCreated') };
      render();
    }).catch(e => warn('regError', { code: e.code || e.message }));
  }

  const teamActions = {
    'tm-addrow': el => {
      const rows = el.closest('form').querySelector('.roster-rows');
      rows.insertAdjacentHTML('beforeend', rosterRow(null));
      rows.lastElementChild.querySelector('[name=num]').focus();
    },
    'tm-delrow': el => {
      const rows = el.closest('.roster-rows');
      el.closest('.roster-row').remove();
      if (!rows.children.length) rows.insertAdjacentHTML('beforeend', rosterRow(null));
    },
    'tm-edit': el => { ui.tmEdit = el.dataset.id || null; render(); },
    'tm-status': el => {
      if (!tourAdmin()) return;
      window.Cloud.setTeamStatus(el.dataset.id, el.dataset.v).then(() => { ui.flash = { text: t(el.dataset.v === 'ok' ? 'tmConfirmed' : 'saved') }; render(); })
        .catch(e => warn('regError', { code: e.code || e.message }));
    },
    'tm-delete': el => {
      const tm = teamById(el.dataset.id);
      if (!tm || !confirmed(tourAdmin() ? 'tmDeleteConfirm' : 'tmWithdrawConfirm', { n: tm.name })) return;
      window.Cloud.deleteTeam(tm.id).then(() => { ui.flash = { text: t('tmDeleted') }; render(); }).catch(e => warn('regError', { code: e.code || e.message }));
    }
  };
  const teamForms = {
    'team-save': f => teamSave(f),
    'levels-save': f => {
      const list = [...new Set(f.levels.value.split('\n').map(x => x.trim()).filter(Boolean))];
      if (!list.length) return warn('errRegFields');
      S().levels = list;
      commit(t('saved'));
    }
  };

  // ---------- stili grafici (salvati solo su questo dispositivo) ----------
  // [id, colore principale, sfondo, colore accento]
  // Tavolozze di colori: [id, primario, sfondo, accento]. Per ora solo il tema neutro (colori in :root di css/style.css).
  const THEMES = [
    ['logo', '#2f4a6d', '#f4f5f7', '#d9822b'],
    ['palestra', '#0b5563', '#e9b77b', '#e36414'],
    ['gialloblu', '#0a3fa8', '#f3f6fb', '#ffcc00'],
    ['notte', '#38d0ff', '#0a0f1e', '#ffe14d'],
    ['fenicottero', '#d6336c', '#fff6f7', '#12a4a0'],
    ['azzurri', '#0057b8', '#f1f5fb', '#009246'],
    ['tramonto', '#c2410c', '#fdf4e7', '#7c3aed'],
    ['fumetto', '#e63946', '#fff8e1', '#ffd60a'],
    ['lavagna', '#ffe08a', '#24443a', '#ff9fb2'],
    ['pallapazza', '#7b2ff7', '#e6f4ff', '#ff7a00']
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

  // Pagina del tema (#/tema), dall'icona della tavolozza nella testata: per tutti, anche senza account.
  function viewTheme() {
    return `<div class="page-head"><a class="back" href="#/">← ${esc(t('navHome'))}</a>
      <h1><i class="ti ti-palette" aria-hidden="true"></i> ${esc(t('themeTitle'))}</h1></div>${themeCard(true)}`;
  }

  function themeCard(page) {
    if (THEMES.length < 2) return '';
    const cur = currentTheme();
    return `<div class="card" id="theme">
      ${page ? '' : `<h2><i class="ti ti-palette" aria-hidden="true"></i> ${esc(t('themeTitle'))}</h2>`}
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
    const list = (S().vtours || []).filter(x => x.status !== 'done' || x.id === sel).slice().sort((a, b) => a.name.localeCompare(b.name));
    const o = (v, l) => `<option value="${esc(v)}" ${String(sel || '') === v ? 'selected' : ''}>${esc(l)}</option>`;
    return o('', t('scorerAllTours')) + list.map(x => o(x.id, `${x.name} · ${x.level}`)).join('');
  }

  // ---------- nomi di file e archivi ZIP ----------

  $dialog.addEventListener('close', () => $dialog.classList.remove('wide-dialog'));

  // Nome di file con sole lettere latine (il greco viene traslitterato).
  const GR = { α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o' };
  const latinName = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ου/gi, m => (m[0] === 'Ο' ? 'Ou' : 'ou'))
    .replace(/[\u0370-\u03ff]/g, c => { const l = GR[c.toLowerCase()] || ''; return c === c.toLowerCase() ? l : l.charAt(0).toUpperCase() + l.slice(1); })
    .replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '');

  // PDF archiviato di un referto: anteprima, download o apertura in una nuova scheda.
  let pdfUrl = null;
  async function viewPdf(id) {
    const meta = (S().refPdf || {})[id];
    if (!meta) return;
    $dialog.innerHTML = `<div class="pdf-viewer"><div class="pv-bar"><strong>${esc(meta.name)}</strong></div><p class="muted"><i class="ti ti-loader-2" aria-hidden="true"></i> ${esc(t('loading'))}</p></div>`;
    $dialog.classList.add('wide-dialog');
    if (!$dialog.open) $dialog.showModal();
    const pdf = await window.Cloud.loadPdf(id).catch(() => null);
    if (!pdf) { $dialog.querySelector('p').textContent = t('pdfMissing'); return; }
    const bin = atob(pdf.data), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    pdfUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    $dialog.innerHTML = `<div class="pdf-viewer">
      <div class="pv-bar"><strong>${esc(pdf.name)}</strong>
        <div class="btn-row">
          <a class="btn small" href="${pdfUrl}" download="${esc(pdf.name)}"><i class="ti ti-download" aria-hidden="true"></i> ${esc(t('pdfDownload'))}</a>
          <a class="btn small" href="${pdfUrl}" target="_blank" rel="noopener"><i class="ti ti-external-link" aria-hidden="true"></i> ${esc(t('pdfNewTab'))}</a>
          <button class="btn small primary" data-action="close-dialog">${esc(t('close'))}</button>
        </div></div>
      <iframe class="pv-frame" src="${pdfUrl}" title="${esc(pdf.name)}"></iframe>
    </div>`;
  }

  let zipPromise = null;
  async function zipPdfs(tid) {
    const tour = vtById(tid);
    const ids = Object.keys(S().refPdf).filter(id => S().refPdf[id].tid === tid);
    if (!ids.length) return;
    ui.refBuild = { tid, text: t('pdfZipping', { n: 0, t: ids.length }) }; render();
    try {
      if (!zipPromise) zipPromise = new Promise((resolve, reject) => {
        const sc = document.createElement('script');
        sc.src = 'vendor/jszip/jszip.min.js'; sc.onload = () => resolve(window.JSZip); sc.onerror = () => { zipPromise = null; reject(new Error('zip')); };
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
        <button class="btn" data-action="logout">${esc(t('logout'))}</button>
        ${window.Cloud.adminMember ? '' : `<p class="note warn">${esc(t('adminNoProfile'))}</p>${selfProfileCard()}`}`;
    } else if (user && scorer()) {
      account = `<p><i class="ti ti-circle-check" aria-hidden="true"></i> ${esc(t('scorerBadge', { c: scorer().court }))} · ${esc(user.email)}</p>
        <div class="btn-row"><a class="btn primary" href="#/mine"><i class="ti ti-device-mobile" aria-hidden="true"></i> ${esc(t('navMine'))}</a>
        <button class="btn" data-action="logout">${esc(t('logout'))}</button></div>`;
    } else if (user && member()) {
      account = `<p><i class="ti ti-circle-check" aria-hidden="true"></i> ${esc(t('loggedInAs', { email: `${personName(member())} · ${user.email}` }))}</p>
        <div class="btn-row"><a class="btn primary" href="#/me"><i class="ti ti-user" aria-hidden="true"></i> ${esc(t('profile'))}</a>
        <button class="btn" data-action="logout">${esc(t('logout'))}</button></div>`;
    } else if (user) {
      // account senza scheda utente (creato fuori dall'app): conferma dell'email e completamento del profilo
      const ver = window.Cloud.verified;
      account = `<p class="note warn">${esc(t('notAdmin', { email: user.email }))}</p>
        ${ver ? '' : `<p class="muted small">${esc(t('noProfileVerify', { e: user.email }))}</p>
          <div class="btn-row"><button class="btn small primary" data-action="verify-check">${esc(t('verifyCheck'))}</button>
          <button class="btn small" data-action="verify-resend">${esc(t('verifyResend'))}</button></div>`}
        <form class="grid-form" data-form="complete-profile">
          <p class="muted small span-all">${esc(t('noProfileHelp'))}</p>
          <label>${esc(t('firstName'))}<input name="first" required maxlength="60"></label>
          <label>${esc(t('lastName'))}<input name="last" required maxlength="60"></label>
          <label>${esc(t('gender'))}<select name="gender" required><option value="">—</option><option value="M">${esc(t('male'))}</option><option value="F">${esc(t('female'))}</option></select></label>
          <label class="check span-all legal-check"><input type="checkbox" name="privacy" required> <span>${t('registerPrivacy')}</span></label>
          <div class="form-actions span-all"><button class="btn primary">${esc(t('noProfileSave'))}</button></div>
        </form>
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
      ${tourAdmin() ? `<div class="card"><h2><i class="ti ti-stairs-up" aria-hidden="true"></i> ${esc(t('tmLevelsTitle'))}</h2>
        <p class="muted small">${esc(teamLevels().join(' · '))}</p><a class="btn primary" href="#/livelli">${esc(t('levelsOpen'))} →</a></div>` : ''}
      ${admin() ? signCard() : ''}
      ${tourAdmin() ? scorersCard() : ''}
      ${designCard()}
      ${themeCard()}`;
  }

  // ---------- avviso della prima pagina ----------

  function setNotice(scope, text) {
    if (scope === 'home') { S().notice = text; if (!text) S().noticeUntil = ''; }
    ui.editNotice = null;
    commit(t(text ? 'noticeSaved' : 'noticeRemoved'));
  }

  // ---------- azioni ----------
  const confirmed =(key, p) => confirm(t(key, p));

  const actions = Object.assign({}, vtActions, teamActions, trActions, occActions, payActions, privacyActions, reportActions, cassaActions, {
    'pdf-view': el => viewPdf(el.dataset.id),
    'pdf-zip': el => zipPdfs(el.dataset.tid),
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
    'user-edit': el => { ui.userEdit = el.dataset.uid || null; render(); },
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
    'verify-resend': () => {
      // al massimo un invio al minuto (Firebase blocca gli invii troppo ravvicinati)
      if (Date.now() < (ui.verifyWait || 0)) return warn('verifyWait', { s: Math.ceil((ui.verifyWait - Date.now()) / 1000) });
      ui.verifyWait = Date.now() + 60000;
      window.Cloud.resendVerification().then(() => { ui.flash = { text: t('verifySent', { e: window.Cloud.user.email }) }; render(); })
        .catch(e => warn(e.code === 'auth/too-many-requests' ? 'verifyTooMany' : 'verifyMailFail', { code: e.code || e.message }));
    },
    'verify-check': () => window.Cloud.checkVerified().then(ok => { if (ok) { ui.flash = { text: t('verifyOk') }; render(); } else warn('verifyNotYet'); }),
    'notice-dismiss': el => { S().notices = (S().notices || []).filter(n => n.id !== el.dataset.id); window.Cloud.dismissNotice(el.dataset.id); render(); },
    'set-theme': el => setTheme(el.dataset.themeId),
    'set-design': el => setDesign(el.dataset.designId),
    'notice-edit': el => { ui.editNotice = el.dataset.scope; render(); },
    // iscrizioni online
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
    'close-dialog': () => $dialog.close(),

    // lista d'ingresso
    'scorer-remove': el => {
      if (!confirmed('scorerRemoveConfirm', { e: el.dataset.email })) return;
      window.Cloud.removeScorer(el.dataset.email).then(() => { ui.scorers = null; ui.flash = { text: t('scorerRemoved') }; render(); })
        .catch(err => warn('scorerErr', { code: err.code || err.message }));
    },
  });

  const forms = Object.assign({}, vtForms, teamForms, trForms, occForms, payForms, cassaForms, {
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
      const cap = f.captain && f.captain.checked;
      window.Cloud.adminCreateUser(d).then(uid => (cap ? window.Cloud.setRole(uid, 'captain', true, `${d.last} ${d.first}`) : null))
        .then(() => { (ui.keep || {})['user-create'] = false; ui.flash = { text: t(cap ? 'userCreatedCaptain' : 'userCreated', { e: d.email }) }; render(); })
        .catch(e => { btn.disabled = false; warn(e.code === 'auth/email-already-in-use' ? 'userCreateExists' : e.code === 'auth/weak-password' ? 'registerWeak' : 'regError', { code: e.code || e.message }); });
    },
    'msg-send': f => sendMessageForm(f),
    'user-edit-save': f => {
      const uid = f.dataset.uid, d = { first: f.first.value.trim(), last: f.last.value.trim(), gender: f.gender.value };
      if (!d.first || !d.last || !['M', 'F'].includes(d.gender)) return warn('errRegFields');
      const teamIds = (S().teams || []).filter(x => x.captainUid === uid).map(x => x.id);
      const groupIds = (S().groups || []).filter(g => (g.uids || []).includes(uid)).map(g => g.id);
      window.Cloud.adminUpdateMember(uid, d, teamIds, groupIds).then(() => { ui.userEdit = null; ui.flash = { text: t('saved') }; render(); })
        .catch(e => warn('regError', { code: e.code || e.message }));
    },
    'nick-save': f => {
      const uid = f.dataset.uid, nick = f.nick.value.trim();
      const taken = Object.entries(S().nicks || {}).find(([u, n]) => u !== uid && n && n.toLowerCase() === nick.toLowerCase());
      if (nick && taken) return warn('nickTaken');
      S().nicks = Object.assign({}, S().nicks || {});
      if (nick) S().nicks[uid] = nick; else delete S().nicks[uid];
      commit(t('saved'));
    },
    'editorial-save': f => { saveEditorialForm(f); },
    'notice-save': f => {
      if (f.dataset.scope === 'home') S().noticeUntil = f.until ? f.until.value : '';
      setNotice(f.dataset.scope, f.text.value.trim());
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
  const PUBLIC_ACTIONS = new Set(['set-theme', 'set-design', 'logout', 'reset-password', 'close-dialog', 'vt-group', 'verify-check', 'verify-resend']);
  // admin tornei: solo le azioni dei tornei (categorie, giocatori, iscrizioni, tabelloni, referti, refertisti)
  const TOUR_ACTIONS = new Set(['notice-edit', 'notice-cancel', 'notice-clear', 'scorer-remove', 'tm-addrow', 'tm-delrow', 'tm-edit', 'tm-delete', 'tm-status', 'vt-draw', 'vt-cal', 'vt-cal-reset', 'vt-delete', 'vt-seed', 'vm-edit', 'vm-clear', 'vm-escore', 'vm-fromref', 'vt-close', 'vt-reopen', 'pdf-view', 'pdf-zip']);
  const TOUR_FORMS = new Set(['scorer-add', 'notice-save', 'team-save', 'levels-save', 'vt-create', 'vt-edit', 'vt-groups', 'vt-po', 'vt-round', 'vm-day', 'vm-save', 'vt-golden', 'vt-minplayed']);
  // cassa: registra incassi, scarica ricevute e prospetto
  const CASH_ACTIONS = new Set(['ca-month', 'ca-addline', 'ca-xlsx', 'rc-pdf']);
  const CASH_FORMS = new Set(['ca-save']);
  const SCORER_ACTIONS = new Set(['vm-edit', 'vm-clear', 'vm-escore', 'vm-fromref', 'pdf-view', 'pdf-zip']);
  const PUBLIC_FORMS = new Set(['login', 'register', 'complete-profile']);
  const SCORER_FORMS = new Set(['vm-save', 'vt-golden']);
  const MEMBER_ACTIONS = new Set(['profile-edit', 'profile-cancel', 'msg-read', 'verify-resend', 'verify-check', 'notice-dismiss', 'fp-leave', 'tr-month', 'tr-day', 'tr-tab', 'att-set', 'spot-apply', 'spot-withdraw', 'spot-seen', 'rc-pdf', 'privacy-accept', 'my-data', 'delete-request', 'tm-addrow', 'tm-delrow', 'tm-edit', 'tm-delete']);
  const MEMBER_FORMS = new Set(['profile-save', 'fp-join', 'fp-blocks', 'team-save']);
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
    const fn = forms[f.dataset.form];
    if (fn && (admin() || (tourAdmin() && TOUR_FORMS.has(f.dataset.form)) || (cashier() && CASH_FORMS.has(f.dataset.form)) || PUBLIC_FORMS.has(f.dataset.form) || (scorer() && SCORER_FORMS.has(f.dataset.form)) || (member() && MEMBER_FORMS.has(f.dataset.form)))) fn(f);
    submitMode = 'save';
  });

  document.addEventListener('change', e => {
    const el = e.target;
    switch (el.dataset.change) {
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
      case 'ath-birth': {   // meno di 18 anni: corsista minorenne (si può togliere a mano)
        const mi = el.form.querySelector('[name=minor]');
        if (mi && isUnder18(el.value) && !mi.checked) { mi.checked = true; const box = el.form.querySelector('.parent-box'); if (box) box.hidden = false; }
        break;
      }
      case 'ath-minor': {
        const box = el.form.querySelector('.parent-box');
        if (box) box.hidden = !el.checked;
        break;
      }
      case 'sign-file': {
        if (!admin() || !el.files || !el.files[0]) return;
        signImage(el.files[0]).then(url => {
          if (url.length > 450000) return warn('signTooBig');
          return window.Cloud.saveReceiptSign(el.dataset.k, url).then(() => { ui.signCache = Object.assign({}, ui.signCache || {}, { [el.dataset.k]: url }); ui.flash = { text: t('signSaved') }; render(); });
        }).catch(e => warn('regError', { code: e.code || e.message }));
        break;
      }
      case 'ca-holder-sel': {
        const manual = el.value === CA_MANUAL;
        el.form.querySelectorAll('.ca-manual').forEach(x => { x.hidden = !manual; });
        // persona scelta: il suo codice fiscale (se c'è) nel campo
        const cfIn = el.form.querySelector('[name=mCf]');
        if (cfIn && !manual) { const p = caPerson(el.value); cfIn.value = (p && p.cf) || ''; }
        break;
      }
      case 'ca-method': {
        const fm = el.form, cash = el.value === 'cash';
        fm.querySelector('.ca-rc').hidden = !cash; fm.querySelector('.ca-rc-note').hidden = cash;
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
      case 'admin-role': {
        if (!admin()) return;
        const m = memberByUid(el.dataset.uid), n = m ? personName(m) : '';
        if (!confirmed(el.checked ? 'adminGrantConfirm' : 'adminRevokeConfirm', { n })) { el.checked = !el.checked; return; }
        window.Cloud.setAdmin(el.dataset.uid, el.checked, n)
          .then(() => { ui.flash = { text: t(el.checked ? 'roleGiven' : 'roleRemoved', { r: t('role_general'), n }) }; render(); })
          .catch(err => { el.checked = !el.checked; warn('regError', { code: err.code || err.message }); });
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
      case 'scorer-tour':
        if (!tourAdmin()) return;
        window.Cloud.setScorerTournament(el.dataset.email, el.value)
          .then(() => { ui.scorers = null; ui.flash = { text: t('saved') }; render(); })
          .catch(err => warn('scorerErr', { code: err.code || err.message }));
        break;
    }
  });

  document.addEventListener('toggle', e => {
    const d = e.target;
    if (d.dataset && d.dataset.keep) { ui.keep = ui.keep || {}; ui.keep[d.dataset.keep] = d.open; }
  }, true);

  window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
  applyTheme(currentTheme());
  applyDesign(currentDesign());

  window.App = {
    refresh,
    error(code) {
      ui.flash = { type: 'warn', text: t(code === 'permission-denied' ? 'errPermission' : 'errCloud', { code }) };
      render();
    }
  };
  render();
})();
