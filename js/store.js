// Stato dell'app. I dati arrivano dal database online (cloud.js) e le modifiche vi vengono inviate.
const Store = (() => {
  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function empty() {
    return { version: 3, players: [], categories: [], tournaments: [], notice: '', editorial: [null, null], registrations: [], members: [], messages: [], inbox: [], rewards: null, nicks: {}, accounts: {}, courts: [], booking: null, bookRewards: null, bookings: [], bookingsMine: [], weekly: [], recurring: [], challenges: [], chapps: [], psearch: [], papps: [], manualVerified: {}, emailVerified: {}, freeplay: [], fpreg: [], fpanon: [], trainings: [], coaches: [], athletes: [], groups: [], plans: [], packs: [], occ: [], att: [], spots: [], receipts: [], roles: {}, incassi: [], bkpaid: {}, tesserati: [], occfree: {}, bkplayers: [], prices: null, bans: {}, notices: [], live: {}, referti: {}, refPdf: {}, refLoaded: false };
  }

  function isValid(s) {
    return !!s && Array.isArray(s.players) && Array.isArray(s.tournaments) && Array.isArray(s.categories);
  }

  // Versioni precedenti: tabelle punti separate dalle categorie.
  function migrateSettings(v) {
    const tables = v.tables || [];
    const cats = (v.categories || []).map(c => ({
      id: c.id, name: c.name,
      rows: c.rows || ((tables.find(tb => tb.id === c.tableId) || {}).rows || [[1, 100]])
    }));
    return cats;
  }

  // Campo: nome, visibile (prenotabile) e orari di apertura per giorno della settimana (1 = lunedì … 7 = domenica).
  function defaultHours() {
    return Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(d => [d, { open: true, from: '08:00', to: '23:00' }]));
  }
  function normCourt(c) {
    const hours = defaultHours();
    Object.keys(c.hours || {}).forEach(d => { hours[d] = Object.assign(hours[d], c.hours[d]); });
    return { id: c.id, name: c.name || 'Campo', visible: c.visible !== false, hours };
  }

  let state = empty();
  let ready = false;
  let tourLoaded = false;   // categorie, premi ed EOPE arrivano dal documento dei tornei (data/tour)

  function save() {
    if (window.Cloud) window.Cloud.push(state);
  }

  function applyRemote(kind, value) {
    if (kind === 'players') state.players = value.map(p => Object.assign({ club: '', base: 0 }, p));
    else if (kind === 'settings') {
      if (!tourLoaded) { state.categories = migrateSettings(value); state.eopeRecipients = value.eopeRecipients || []; state.rewards = value.rewards || null; }
      state.notice = value.notice || ''; state.noticeUntil = value.noticeUntil || '';
      state.nicks = value.nicks || {};
      state.courts = (value.courts || []).map(normCourt);
      state.booking = value.booking || null;
      state.bookRewards = value.bookRewards || null;
      state.prices = value.prices || null;
    }
    else if (kind === 'tour') {
      tourLoaded = true;
      state.categories = migrateSettings(value); state.eopeRecipients = value.eopeRecipients || []; state.rewards = value.rewards || null;
    }
    else if (kind === 'roles') state.roles = value;
    else if (kind === 'incassi') state.incassi = value;
    else if (kind === 'tesserati') state.tesserati = value;
    else if (kind === 'occfree') state.occfree = value;
    else if (kind === 'bkplayers') state.bkplayers = value;
    else if (kind === 'bkpaid') state.bkpaid = value;
    else if (kind === 'bookings') state.bookings = value;
    else if (kind === 'bookingsMine') state.bookingsMine = value;
    else if (kind === 'weekly') state.weekly = value;
    else if (kind === 'recurring') state.recurring = value;
    else if (kind === 'challenges') state.challenges = value;
    else if (kind === 'chapps') state.chapps = value;
    else if (kind === 'psearch') state.psearch = value;
    else if (kind === 'papps') state.papps = value;
    else if (kind === 'manualVerified') state.manualVerified = value;
    else if (kind === 'emailVerified') state.emailVerified = value;
    else if (kind === 'freeplay') state.freeplay = value;
    else if (kind === 'fpreg') state.fpreg = value;
    else if (kind === 'fpanon') state.fpanon = value;
    else if (['trainings', 'coaches', 'athletes', 'groups', 'plans', 'packs', 'occ', 'att', 'spots', 'receipts'].includes(kind)) state[kind] = value;
    else if (kind === 'bans') state.bans = value;
    else if (kind === 'notices') state.notices = value;
    else if (kind === 'registrations') state.registrations = value;
    else if (kind === 'members') state.members = value;
    else if (kind === 'messages') state.messages = value;
    else if (kind === 'inbox') state.inbox = value;
    else if (kind === 'accounts') state.accounts = value;
    else if (kind === 'tournament') {
      const t = Logic.normalize(value);
      const i = state.tournaments.findIndex(x => x.id === t.id);
      if (i < 0) state.tournaments.push(t); else state.tournaments[i] = t;
    } else if (kind === 'live') {
      // I set arrivano come { a, b } (il database non accetta liste annidate): qui diventano [a, b].
      const d = Object.assign({}, value.data);
      d.sets = (d.sets || []).map(x => [x.a, x.b]);
      state.live[value.id] = d;
    } else if (kind === 'live-removed') {
      delete state.live[value.id];
    } else if (kind === 'live-reset') {
      state.live = {};
    } else if (kind === 'ref') {
      state.referti[value.id] = value.data;
    } else if (kind === 'ref-removed') {
      delete state.referti[value.id];
    } else if (kind === 'ref-loaded') {
      state.refLoaded = true;
    } else if (kind === 'pdf-loaded') {
      state.pdfLoaded = true;
    } else if (kind === 'pdf') {
      state.refPdf[value.data.ref] = value.data;
    } else if (kind === 'pdf-removed') {
      Object.keys(state.refPdf).forEach(k => { if (k === value.id) delete state.refPdf[k]; });
    } else if (kind === 'ref-reset') {
      state.referti = {}; state.refPdf = {}; state.refLoaded = false; state.pdfLoaded = false;
    } else if (kind === 'editorial') {
      state.editorial = (state.editorial || [null, null]).slice();
      state.editorial[value.i] = value.data;
    } else if (kind === 'tournament-removed') {
      state.tournaments = state.tournaments.filter(t => t.id !== value);
    }
  }

  return {
    get state() { return state; },
    get ready() { return ready; },
    setReady() { ready = true; },
    save,
    uid,
    isValid,
    empty,
    applyRemote,
    normCourt,
    replace(s) {
      state = { live: state.live || {}, referti: state.referti || {}, refPdf: state.refPdf || {}, refLoaded: state.refLoaded, editorial: state.editorial || [null, null], registrations: state.registrations || [], members: state.members || [], messages: state.messages || [], inbox: state.inbox || [], rewards: s.rewards || state.rewards || null, nicks: s.nicks || state.nicks || {}, courts: (s.courts || state.courts || []).map(normCourt), booking: s.booking || state.booking || null, bookRewards: s.bookRewards || state.bookRewards || null, bookings: state.bookings || [], bookingsMine: state.bookingsMine || [], weekly: state.weekly || [], recurring: state.recurring || [], challenges: state.challenges || [], chapps: state.chapps || [], psearch: state.psearch || [], papps: state.papps || [], manualVerified: state.manualVerified || {}, emailVerified: state.emailVerified || {}, freeplay: state.freeplay || [], fpreg: state.fpreg || [], fpanon: state.fpanon || [], trainings: state.trainings || [], coaches: state.coaches || [], athletes: state.athletes || [], groups: state.groups || [], plans: state.plans || [], packs: state.packs || [], occ: state.occ || [], att: state.att || [], spots: state.spots || [], receipts: state.receipts || [], roles: state.roles || {}, incassi: state.incassi || [], bkpaid: state.bkpaid || {}, tesserati: state.tesserati || [], occfree: state.occfree || {}, bkplayers: state.bkplayers || [], prices: s.prices || state.prices || null, bans: state.bans || {}, notices: state.notices || [], accounts: state.accounts || {}, version: 3, players: s.players, categories: migrateSettings(s), tournaments: s.tournaments.map(Logic.normalize), notice: s.notice || '', noticeUntil: s.noticeUntil || '', eopeRecipients: s.eopeRecipients || [] };
      save();
    }
  };
})();
