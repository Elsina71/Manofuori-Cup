// Stato dell'app. I dati arrivano dal database online (cloud.js) e le modifiche vi vengono inviate.
const Store = (() => {
  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function empty() {
    return { version: 4, notice: '', noticeUntil: '', editorial: [null, null], members: [], messages: [], inbox: [], nicks: {}, accounts: {}, manualVerified: {}, emailVerified: {}, vtours: [], vmatches: [], teams: [], rosters: [], levels: null, freeplay: [], fpreg: [], fpanon: [], trainings: [], coaches: [], athletes: [], groups: [], plans: [], packs: [], occ: [], att: [], spots: [], receipts: [], roles: {}, admins: {}, incassi: [], tesserati: [], occfree: {}, prices: null, bans: {}, notices: [], live: {} };
  }

  let state = empty();
  let ready = false;

  function save() {
    if (window.Cloud) window.Cloud.push(state);
  }

  // Raccolte copiate così come arrivano dal database.
  const PLAIN = ['roles', 'admins', 'vtours', 'vmatches', 'teams', 'rosters', 'incassi', 'tesserati', 'occfree', 'manualVerified', 'emailVerified', 'freeplay', 'fpreg', 'fpanon',
    'trainings', 'coaches', 'athletes', 'groups', 'plans', 'packs', 'occ', 'att', 'spots', 'receipts', 'bans', 'notices', 'members', 'messages', 'inbox', 'accounts'];

  function applyRemote(kind, value) {
    if (PLAIN.includes(kind)) state[kind] = value;
    else if (kind === 'settings') {
      state.notice = value.notice || ''; state.noticeUntil = value.noticeUntil || '';
      state.nicks = value.nicks || {};
      state.prices = value.prices || null;
    } else if (kind === 'tour') {
      state.levels = value.levels || null;
    } else if (kind === 'live') {
      // I set arrivano come { a, b } (il database non accetta liste annidate): qui diventano [a, b].
      const d = Object.assign({}, value.data);
      d.sets = (d.sets || []).map(x => [x.a, x.b]);
      state.live[value.id] = d;
    } else if (kind === 'live-removed') {
      delete state.live[value.id];
    } else if (kind === 'live-reset') {
      state.live = {};
    // referti e PDF archiviati del torneo aperto nella scheda Referti (solo admin tornei e account dei campi)
    } else if (kind === 'ref') {
      state.referti = Object.assign({}, state.referti, { [value.id]: value.data });
    } else if (kind === 'ref-removed') {
      if (state.referti) delete state.referti[value.id];
    } else if (kind === 'ref-loaded') {
      state.refLoaded = true;
    } else if (kind === 'pdf') {
      state.refPdf = Object.assign({}, state.refPdf, { [value.data.ref]: value.data });
    } else if (kind === 'pdf-removed') {
      if (state.refPdf) delete state.refPdf[value.id];
    } else if (kind === 'pdf-loaded') {
      state.pdfLoaded = true;
    } else if (kind === 'ref-reset') {
      state.referti = {}; state.refPdf = {}; state.refLoaded = false; state.pdfLoaded = false;
    } else if (kind === 'editorial') {
      state.editorial = (state.editorial || [null, null]).slice();
      state.editorial[value.i] = value.data;
    }
  }

  return {
    get state() { return state; },
    get ready() { return ready; },
    setReady() { ready = true; },
    save,
    uid,
    empty,
    applyRemote
  };
})();
