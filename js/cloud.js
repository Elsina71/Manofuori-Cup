// Collegamento a Firebase: database condiviso (lettura pubblica) e login amministratori.
import { initializeApp } from '../vendor/firebase/firebase-app.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, onSnapshot, writeBatch, getDoc, getDocs, setDoc, addDoc, deleteDoc, query, where, connectFirestoreEmulator, arrayUnion, updateDoc, runTransaction, deleteField
} from '../vendor/firebase/firebase-firestore.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, connectAuthEmulator,
  createUserWithEmailAndPassword, sendEmailVerification
} from '../vendor/firebase/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
let db;
try {
  // Cache locale: l'app funziona anche con connessione debole e invia le modifiche appena torna la rete.
  // Si salva nel browser solo con il consenso alle preferenze; altrimenti resta in memoria durante la visita.
  if (!(window.Consent && Consent.prefs())) throw new Error('no-consent');
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch (e) {
  db = initializeFirestore(app, {});
}
const auth = getAuth(app);
// Solo per le prove in locale con l'emulatore Firebase (localStorage "pcm-emulator" = "1").
try {
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && localStorage.getItem('pcm-emulator') === '1') {
    connectFirestoreEmulator(db, location.hostname, 8080);
    connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
  }
} catch (e) { /* ignore */ }

// Ultimo contenuto noto di ogni documento, per scrivere solo ciò che cambia.
const last = { settings: null, tour: null };
const loaded = { settings: false, tour: false };
let user = null, isAdmin = false, scorer = null, teamCap = null, member = null, coach = null, adminMember = null;
let roles = {};   // ruoli dati dagli admin generali: { tour: admin tornei, cash: cassa }
const canTour = () => isAdmin || !!roles.tour;
const canRefs = () => canTour() || !!roles.refs;   // responsabile arbitri (o admin tornei)

const refresh = () => window.App && window.App.refresh();

function markLoaded(part) {
  loaded[part] = true;
  if (loaded.settings && loaded.tour) Store.setReady();
  refresh();
}

function onError(err) {
  console.error(err);
  if (window.App) window.App.error(err.code || err.message);
}

onSnapshot(doc(db, 'data', 'settings'), snap => {
  if (snap.exists() && typeof snap.data().json === 'string') {
    const json = snap.data().json;
    if (json !== last.settings) {
      last.settings = json;
      Store.applyRemote('settings', JSON.parse(json));
    }
  }
  markLoaded('settings');
}, onError);

// Livelli delle squadre in un documento a parte (data/tour), che scrive l'admin tornei.
const tourJson = st => JSON.stringify({ levels: st.levels || null });
onSnapshot(doc(db, 'data', 'tour'), snap => {
  if (snap.exists() && typeof snap.data().json === 'string') {
    const json = snap.data().json;
    if (json !== last.tour) { last.tour = json; Store.applyRemote('tour', JSON.parse(json)); }
  }
  markLoaded('tour');
}, onError);

// Spazi editoriali della prima pagina: data/editorial1 e data/editorial2 (foto, titolo, testo).
['editorial1', 'editorial2'].forEach((id, i) => onSnapshot(doc(db, 'data', id), snap => {
  Store.applyRemote('editorial', { i, data: snap.exists() ? snap.data() : null });
  refresh();
}, onError));

function saveEditorial(i, data) {
  const ref = doc(db, 'data', 'editorial' + (i + 1));
  return data ? setDoc(ref, Object.assign({}, data, { updated: Date.now() })) : deleteDoc(ref);
}

// Ruoli (admin generale): elenco di chi è admin tornei o cassa; assegnazione e revoca.
let rolesUnsub = null;
function listenRoles() {
  if (rolesUnsub) { rolesUnsub(); rolesUnsub = null; }
  Store.applyRemote('roles', {});
  Store.applyRemote('admins', {});
  if (!isAdmin) {
    if (user && member) rolesUnsub = onSnapshot(doc(db, 'roles', user.uid), snap => { roles = snap.exists() ? snap.data() : {}; refresh(); }, () => {});
    return;
  }
  const u1 = onSnapshot(collection(db, 'roles'), snap => {
    Store.applyRemote('roles', Object.fromEntries(snap.docs.map(d => [d.id, d.data()])));
    refresh();
  }, onError);
  // altri admin generali (raccolta admins)
  const u2 = onSnapshot(collection(db, 'admins'), snap => {
    Store.applyRemote('admins', Object.fromEntries(snap.docs.map(d => [d.id, d.data()])));
    refresh();
  }, onError);
  rolesUnsub = () => { u1(); u2(); };
}
// Solo admin generale: nomina o toglie un altro admin generale (non se stesso).
function setAdmin(uid, on, name) {
  return on ? setDoc(doc(db, 'admins', uid), { name: name || '', by: user.uid, at: Date.now() }) : deleteDoc(doc(db, 'admins', uid));
}
function setRole(uid, role, on, name) {
  return setDoc(doc(db, 'roles', uid), { [role]: !!on, name: name || '', updated: Date.now(), by: user.uid }, { merge: true });
}

// Admin: solo le regole del database lo sanno (admins/probe è leggibile soltanto da un admin).
async function adminCheck() {
  try { await getDoc(doc(db, 'admins', 'probe')); return true; } catch (e) { return false; }
}

onAuthStateChanged(auth, async u => {
  user = u;
  isAdmin = false;
  roles = {};
  scorer = null;
  teamCap = null;
  coach = null;
  adminMember = null;
  if (u) {
    // email appena confermata: il token di accesso può avere ancora "non confermata" (le regole leggono quello)
    try { if (u.emailVerified && !(await u.getIdTokenResult()).claims.email_verified) await u.getIdToken(true); } catch (e) { /* offline */ }
    isAdmin = await adminCheck();
    if (!isAdmin) { try { const r = await getDoc(doc(db, 'roles', u.uid)); roles = r.exists() ? r.data() : {}; } catch (e) { roles = {}; } }
    // Admin che è anche giocatore (corsista o coach): la sua scheda utente, se esiste.
    if (isAdmin) {
      try { const m = await getDoc(doc(db, 'members', u.uid)); adminMember = m.exists() ? Object.assign({ uid: u.uid, email: u.email || '' }, m.data()) : null; } catch (e) { adminMember = null; }
      // email dell'admin nella lista utenti
      if (adminMember && u.email) setDoc(doc(db, 'accounts', u.uid), { email: u.email.toLowerCase(), verified: !!u.emailVerified }).catch(() => {});
    }
    // Account di un campo (refertista): può solo compilare i referti elettronici.
    if (!isAdmin && u.email) {
      try {
        const sc = await getDoc(doc(db, 'scorers', u.email.toLowerCase()));
        if (sc.exists()) scorer = Object.assign({ email: u.email.toLowerCase() }, sc.data());
      } catch (e) { scorer = null; }
    }
    // Account del codice capitano di una squadra: entra solo nella scheda della sua squadra
    teamCap = null;
    if (!isAdmin && u.email && u.email.toLowerCase().endsWith('@' + CODE_DOMAIN)) {
      const c = normCode(u.email.split('@')[0]);
      try { const d = await getDoc(doc(db, 'teamCodes', c)); teamCap = { code: c, teamId: d.exists() && d.data().uid === u.uid ? d.data().teamId : '' }; }
      catch (e) { teamCap = { code: c, teamId: '' }; }
      member = null;
    }
    // Utente registrato (giocatore): profilo in members/{uid}.
    if (!isAdmin && !scorer && !teamCap) {
      try {
        const m = await getDoc(doc(db, 'members', u.uid));
        member = m.exists() ? Object.assign({ uid: u.uid, email: u.email || '' }, m.data()) : null;
        // Coach: utente registrato indicato dall'admin (coaches/{uid}: all = vede tutti gli allenamenti).
        coach = null;
        if (member) { try { const c = await getDoc(doc(db, 'coaches', u.uid)); coach = c.exists() ? c.data() : null; } catch (e) { coach = null; } }
        // email dell'account (visibile solo all'utente e all'admin), salvata anche per gli account precedenti
        if (member && u.email) setDoc(doc(db, 'accounts', u.uid), { email: u.email.toLowerCase(), verified: !!u.emailVerified }).catch(() => {});
      } catch (e) { member = null; }
    }
  }
  listenRoles();
  listenAccount();
  listenRefNotices();
  listenVerified();
  listenFreeplay();
  listenRosters();
  listenTraining();
  listenAttendance();
  listenOccFree();
  listenReceipts();
  refresh();
});

// ---------- utenti registrati, messaggi ----------
// members/{uid}: nome, cognome, sesso (leggibile dagli utenti collegati: capitani e rose).
// messages/{id}: messaggi dell'admin; ognuno legge solo quelli a lui destinati (regole del database).
// inbox/{uid}: messaggi già letti dall'utente.
let memUnsub = null, accUnsub = null, msgUnsubs = [], inboxUnsub = null, banUnsub = null, noteUnsubs = [];
const msgParts = {};

function listenAccount() {
  if (memUnsub) { memUnsub(); memUnsub = null; }
  if (accUnsub) { accUnsub(); accUnsub = null; }
  Store.applyRemote('accounts', {});
  msgUnsubs.forEach(f => f()); msgUnsubs = [];
  if (inboxUnsub) { inboxUnsub(); inboxUnsub = null; }
  if (banUnsub) { banUnsub(); banUnsub = null; }
  noteUnsubs.forEach(f => f()); noteUnsubs = [];
  Store.applyRemote('bans', {});
  Store.applyRemote('notices', []);
  Object.keys(msgParts).forEach(k => delete msgParts[k]);
  Store.applyRemote('members', []);
  Store.applyRemote('messages', []);
  Store.applyRemote('inbox', []);
  if (!user || !(isAdmin || member)) return;
  memUnsub = onSnapshot(collection(db, 'members'), snap => {
    Store.applyRemote('members', snap.docs.map(d => Object.assign({ uid: d.id }, d.data())));
    refresh();
  }, onError);
  // Solo l'admin vede le email di tutti gli account.
  if (isAdmin) {
    accUnsub = onSnapshot(collection(db, 'accounts'), snap => {
      const map = {}, ver = {};
      snap.docs.forEach(d => { map[d.id] = d.data().email || ''; ver[d.id] = !!d.data().verified; });
      Store.applyRemote('accounts', map);
      Store.applyRemote('emailVerified', ver);
      refresh();
    }, onError);
  }
  const merge = () => {
    const all = {};
    Object.values(msgParts).forEach(list => list.forEach(m => { all[m.id] = m; }));
    Store.applyRemote('messages', Object.values(all).sort((a, b) => b.created - a.created));
    refresh();
  };
  const sources = isAdmin ? { all: collection(db, 'messages') }
    : { mine: query(collection(db, 'messages'), where('to', 'array-contains', user.uid)), every: query(collection(db, 'messages'), where('all', '==', true)) };
  Object.entries(sources).forEach(([k, src]) => msgUnsubs.push(onSnapshot(src, snap => {
    msgParts[k] = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    merge();
  }, onError)));
  if (member) {
    inboxUnsub = onSnapshot(doc(db, 'inbox', user.uid), snap => {
      Store.applyRemote('inbox', snap.exists() ? snap.data().read || [] : []);
      refresh();
    }, onError);
  }
  // Lista nera: l'admin vede tutti i blocchi, l'utente solo il proprio.
  const banSrc = isAdmin ? collection(db, 'bans') : doc(db, 'bans', user.uid);
  banUnsub = onSnapshot(banSrc, snap => {
    const map = {};
    if (isAdmin) snap.docs.forEach(d => { map[d.id] = d.data(); });
    else if (snap.exists()) map[user.uid] = snap.data();
    Store.applyRemote('bans', map);
    refresh();
  }, onError);
  // Avvisi delle prenotazioni (modificate o cancellate): all'utente i suoi, all'admin quelli per "admins".
  const noteParts = {};
  const notes = isAdmin ? { a: query(collection(db, 'notices'), where('to', '==', 'admins')) } : { u: query(collection(db, 'notices'), where('to', '==', user.uid)) };
  // responsabile arbitri: anche gli avvisi delle conferme degli arbitri
  if (!isAdmin && roles.refs) notes.r = query(collection(db, 'notices'), where('to', '==', 'refs'));
  Object.entries(notes).forEach(([k, src]) => noteUnsubs.push(onSnapshot(src, snap => {
    noteParts[k] = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    Store.applyRemote('notices', Object.values(noteParts).flat().sort((a, b) => (b.at || 0) - (a.at || 0)));
    refresh();
  }, onError)));
}

// Registrazione di un nuovo utente (giocatore).
async function register(data) {
  const cred = await createUserWithEmailAndPassword(auth, data.email.trim(), data.password);
  // accettazione dell'informativa privacy e dei termini (versione dei testi)
  const prof = { first: data.first, last: data.last, gender: data.gender, created: Date.now(), privacyAt: Date.now(), privacyVer: data.privacyVer || '' };
  await setDoc(doc(db, 'members', cred.user.uid), prof);
  await setDoc(doc(db, 'accounts', cred.user.uid), { email: (cred.user.email || '').toLowerCase(), verified: false });
  member = Object.assign({ uid: cred.user.uid, email: cred.user.email || '' }, prof);
  // Email di conferma: senza conferma non ci si iscrive ai tornei e non si prenotano i campi.
  let mailErr = '';
  try { await sendVerifyMail(cred.user); } catch (e) { console.error(e); mailErr = e.code || e.message || 'error'; }
  listenAccount();
  listenVerified();
  listenFreeplay();
  listenRosters();
  listenRoles();
  refresh();
  return { mailErr };
}

// Email di conferma nella lingua dell'app (il sardo usa il modello italiano), con il pulsante
// "Continua" che riporta al profilo nell'app. Se l'indirizzo di ritorno non fosse autorizzato, si invia senza.
async function sendVerifyMail(u) {
  const l = (window.I18n && I18n.lang) || 'it';
  auth.languageCode = l === 'sc' ? 'it' : l;
  try { await sendEmailVerification(u, { url: location.origin + location.pathname + '#/me' }); }
  catch (e) {
    if (e && /continue-uri|invalid-continue|missing-continue/.test(e.code || '')) await sendEmailVerification(u);
    else throw e;
  }
}
async function resendVerification() {
  if (user) await sendVerifyMail(user);
}

// Dopo aver aperto il link ricevuto: si aggiorna lo stato dell'account e il permesso nel database.
async function checkVerified() {
  if (!user) return false;
  await user.reload();
  if (user.emailVerified) {
    await user.getIdToken(true);
    if ((member || adminMember) && user.email) setDoc(doc(db, 'accounts', user.uid), { email: user.email.toLowerCase(), verified: true }).catch(() => {});
    // admin principale per email: diventa admin solo con l'email confermata → si ricarica l'app
    if (!isAdmin && await adminCheck()) { location.reload(); return true; }
  }
  refresh();
  return user.emailVerified || manualOk;
}

// ---------- conferma a mano da parte dell'admin ----------
// verified/{uid}: l'admin conferma un utente che non riceve l'email (vale come email confermata, anche nelle regole).
let manualOk = false, verUnsub = null;
function listenVerified() {
  if (verUnsub) { verUnsub(); verUnsub = null; }
  manualOk = false;
  Store.applyRemote('manualVerified', {});
  if (!user || !(isAdmin || member)) return;
  verUnsub = isAdmin
    ? onSnapshot(collection(db, 'verified'), snap => { const m = {}; snap.docs.forEach(d => { m[d.id] = d.data(); }); Store.applyRemote('manualVerified', m); refresh(); }, onError)
    : onSnapshot(doc(db, 'verified', user.uid), snap => { manualOk = snap.exists(); refresh(); }, onError);
}
function setManualVerified(uid, on) {
  if (!isAdmin) return Promise.resolve();
  return on ? setDoc(doc(db, 'verified', uid), { by: user.email || '', at: Date.now() }) : deleteDoc(doc(db, 'verified', uid));
}

// Registrazione di un utente fatta dall'admin: account creato con un'app Firebase separata (l'admin resta collegato),
// profilo, email e conferma a mano.
async function adminCreateUser(d) {
  if (!isAdmin) throw Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
  const auth2 = secondAuth();
  const cred = await createUserWithEmailAndPassword(auth2, d.email.trim(), d.password);
  const uid = cred.user.uid, email = (cred.user.email || d.email).toLowerCase();
  await signOut(auth2);
  const batch = writeBatch(db);
  batch.set(doc(db, 'members', uid), { first: d.first, last: d.last, gender: d.gender, created: Date.now() });
  batch.set(doc(db, 'accounts', uid), { email, verified: false });
  batch.set(doc(db, 'verified', uid), { by: user.email || '', at: Date.now() });
  await batch.commit();
  return uid;
}

// Solo admin: corregge nome, cognome e sesso di un utente. Il nome compare anche, copiato, come capitano delle sue
// squadre e nei gruppi degli allenamenti: si aggiorna anche lì.
function adminUpdateMember(uid, d, teamIds, groupIds) {
  const batch = writeBatch(db), now = Date.now(), name = `${d.first} ${d.last}`;
  batch.update(doc(db, 'members', uid), { first: d.first, last: d.last, gender: d.gender });
  teamIds.forEach(id => batch.update(doc(db, 'teams', id), { captainName: name, updated: now }));
  groupIds.forEach(id => batch.update(doc(db, 'groups', id), { [`names.${uid}`]: name, updated: now }));
  return batch.commit();
}

function updateProfile(data) {
  if (!member) return Promise.resolve();
  const prof = { first: data.first, last: data.last, gender: data.gender, created: member.created || Date.now() };
  ['privacyAt', 'privacyVer', 'deleteReq'].forEach(k => { if (member[k] != null) prof[k] = member[k]; });
  Object.assign(member, prof);
  return setDoc(doc(db, 'members', member.uid), prof);
}
// Presa visione dell'informativa e accettazione dei termini (versione dei testi).
function acceptPrivacy(ver) {
  if (!member) return Promise.resolve();
  const d = { privacyAt: Date.now(), privacyVer: ver };
  Object.assign(member, d);
  return updateDoc(doc(db, 'members', member.uid), d).then(() => refresh());
}
// Richiesta di cancellazione dell'account (art. 17 GDPR): avviso agli admin e data della richiesta nel profilo.
async function requestDeletion(text) {
  if (!member) return;
  member.deleteReq = Date.now();
  await updateDoc(doc(db, 'members', member.uid), { deleteReq: member.deleteReq });
  await addDoc(collection(db, 'notices'), { to: 'admins', text: String(text).slice(0, 400), at: Date.now(), by: user.uid });
  refresh();
}

function sendMessage(msg) {
  if (!isAdmin) return Promise.reject(Object.assign(new Error('permission-denied'), { code: 'permission-denied' }));
  return addDoc(collection(db, 'messages'), Object.assign({}, msg, { created: Date.now(), by: user.email || '' }));
}
function deleteMessage(id) { return isAdmin ? deleteDoc(doc(db, 'messages', id)) : Promise.resolve(); }
function markRead(id) {
  if (!member) return Promise.resolve();
  return setDoc(doc(db, 'inbox', user.uid), { read: arrayUnion(id) }, { merge: true });
}

// ---------- lista nera (solo admin) ----------
function setBan(uid, data) {
  if (!isAdmin) return Promise.resolve();
  const ref = doc(db, 'bans', uid);
  return data.tour || data.book ? setDoc(ref, { tour: !!data.tour, book: !!data.book, updated: Date.now() }) : deleteDoc(ref);
}

// Data di ieri (AAAA-MM-GG, ora locale): si leggono solo i documenti da ieri in poi.
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('sv'); };

// ---------- allenamenti ----------
// trainings/{id}: allenamento settimanale (pubblico): giorno (dow 1 = lunedì), orari, coach, livello, massimo, luogo.
// coaches/{uid}: coach (utente registrato) con all = vede tutti gli allenamenti, altrimenti solo i suoi.
// athletes/{uid}: scheda corsista (anagrafica, tesseramento, certificato): la leggono solo l'admin e l'interessato.
// groups/{tid_YYYY-MM}: gruppo del mese di un allenamento (nomi): solo admin e coach.
// plans/{uid_YYYY-MM}: piano del mese del corsista (allenamenti, quanti a settimana, prezzo): solo admin e interessato.
onSnapshot(collection(db, 'trainings'), snap => {
  Store.applyRemote('trainings', snap.docs.map(d => Object.assign({ id: d.id }, d.data())));
  refresh();
}, onError);
let trUnsubs = [];
function listenTraining() {
  trUnsubs.forEach(f => f()); trUnsubs = [];
  ['coaches', 'athletes', 'groups', 'plans', 'packs'].forEach(k => Store.applyRemote(k, []));
  if (!user) return;
  const on = (src, kind) => trUnsubs.push(onSnapshot(src, snap => {
    Store.applyRemote(kind, snap.docs.map(d => Object.assign({ id: d.id }, d.data())));
    refresh();
  }, onError));
  if (isAdmin || roles.cash) {
    // elenco dei tesserati (solo i dati per la ricevuta): lo leggono admin e cassa, lo aggiorna l'admin
    trUnsubs.push(onSnapshot(collection(db, 'tesserati'), snap => {
      tessDocs = Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
      Store.applyRemote('tesserati', snap.docs.map(d => Object.assign({ id: d.id }, d.data())));
      syncTess(); refresh();
    }, onError));
  }
  if (isAdmin) {
    ['coaches', 'groups', 'plans', 'packs'].forEach(k => on(collection(db, k), k));
    trUnsubs.push(onSnapshot(collection(db, 'athletes'), snap => {
      Store.applyRemote('athletes', snap.docs.map(d => Object.assign({ id: d.id }, d.data())));
      athLoaded = true; syncTess(); refresh();
    }, onError));
    return;
  }
  if (!member) return;
  trUnsubs.push(onSnapshot(doc(db, 'athletes', user.uid), d => {
    Store.applyRemote('athletes', d.exists() ? [Object.assign({ id: d.id }, d.data())] : []);
    refresh();
  }, onError));
  on(query(collection(db, 'plans'), where('uid', '==', user.uid)), 'plans');
  on(query(collection(db, 'packs'), where('uid', '==', user.uid)), 'packs');
  if (coach) on(coach.all ? collection(db, 'groups') : query(collection(db, 'groups'), where('coachUid', '==', user.uid)), 'groups');
}
// Tesserati: copia ridotta delle schede (nome, sesso, nascita, residenza, codice fiscale, stagioni di tesseramento),
// senza certificato né pagamenti, per gli intestatari delle ricevute. L'admin la tiene allineata alle schede.
let tessDocs = null, athLoaded = false, tessSyncing = false;
function tessMirror(a) {
  const m = (Store.state.members || []).find(x => x.uid === a.id);
  const seasons = Object.keys(a.tess || {}).filter(k => a.tess[k]).sort();
  if (!seasons.length) return null;
  const x = { name: m ? `${m.first} ${m.last}` : `${a.first || ''} ${a.last || ''}`.trim(), gender: (m && m.gender) || a.gender || 'M', birthPlace: a.birthPlace || '', birthDate: a.birthDate || '',
    city: a.city || '', address: a.address || '', cf: a.cf || '', seasons };
  // minorenne: dati del genitore a cui si intesta la ricevuta
  if (a.minor) Object.assign(x, { minor: true, parentFirst: a.parentFirst || '', parentLast: a.parentLast || '', parentGender: a.parentGender || '',
    parentAddress: a.parentAddress || '', parentCity: a.parentCity || '', parentCf: a.parentCf || '' });
  return x;
}
function syncTess() {
  if (!isAdmin || !athLoaded || !tessDocs || tessSyncing) return;
  const want = {};
  (Store.state.athletes || []).forEach(a => { const x = tessMirror(a); if (x) want[a.id] = x; });
  const batch = writeBatch(db);
  let n = 0;
  const same = (x, y) => !!y && Object.keys(x).length === Object.keys(y).length && Object.keys(x).every(k => JSON.stringify(x[k]) === JSON.stringify(y[k]));
  Object.entries(want).forEach(([id, x]) => { if (!same(x, tessDocs[id])) { batch.set(doc(db, 'tesserati', id), x); n++; } });
  Object.keys(tessDocs).forEach(id => { if (!want[id]) { batch.delete(doc(db, 'tesserati', id)); n++; } });
  if (!n) return;
  tessSyncing = true;
  batch.commit().catch(onError).finally(() => { tessSyncing = false; });
}

// Crea o modifica un allenamento; groups = gruppi dell'allenamento (se cambia il coach si aggiorna coachUid).
function saveTraining(old, d, groups) {
  const ref = old ? doc(db, 'trainings', old.id) : doc(collection(db, 'trainings'));
  const batch = writeBatch(db);
  if (old) batch.update(ref, d); else batch.set(ref, Object.assign({}, d, { created: Date.now() }));
  if (old && old.coachUid !== d.coachUid) (groups || []).forEach(g => batch.update(doc(db, 'groups', g.id), { coachUid: d.coachUid || '' }));
  return batch.commit().then(() => ref.id);
}
// Elimina un allenamento: gruppi tolti, piani ricalcolati (plans = piani aggiornati da scrivere).
function deleteTraining(tr, groups, plans) {
  const batch = writeBatch(db);
  groups.forEach(g => batch.delete(doc(db, 'groups', g.id)));
  plans.forEach(p => batch.set(doc(db, 'plans', p.id), stripId(p)));
  batch.delete(doc(db, 'trainings', tr.id));
  return batch.commit();
}
const stripId = o => { const c = Object.assign({}, o); delete c.id; return c; };
// Salva gruppi del mese e piani dei corsisti coinvolti in un unico invio; athletes = schede da creare o aggiornare.
function saveGroups(groups, plans, athletes) {
  const batch = writeBatch(db);
  (groups || []).forEach(g => {
    batch.set(doc(db, 'groups', g.id), stripId(g));
    // numero di persone del gruppo nel mese, pubblico (serve per calcolare i posti spot)
    batch.update(doc(db, 'trainings', g.tid), { ['sizes.' + g.month]: (g.uids || []).length });
  });
  (plans || []).forEach(p => p.del ? batch.delete(doc(db, 'plans', p.id)) : batch.set(doc(db, 'plans', p.id), stripId(p)));
  (athletes || []).forEach(a => batch.set(doc(db, 'athletes', a.id), stripId(a), { merge: true }));
  return batch.commit();
}
// ---------- presenze e spot ----------
// occ/{tid_data}: allenamento di un giorno (pubblico): p = presenti, a = assenti, s = spot confermati, cancelled.
// att/{tid_data_uid}: risposta del corsista (in/out, forced se l'ha messa l'admin): admin, interessato e coach.
// spots/{tid_data_uid}: candidatura spot o recupero (pending/ok/no, prezzo): admin, interessato e coach.
// I contatori di occ cambiano nello stesso invio della risposta (regole del database).
let ocUnsubs = [];
onSnapshot(query(collection(db, 'occ'), where('date', '>=', yesterday())), snap => {
  Store.applyRemote('occ', snap.docs.map(d => Object.assign({ id: d.id }, d.data())));
  refresh();
}, onError);
// numero dei posti spot liberi (solo admin)
let freeUnsub = null;
function listenOccFree() {
  if (freeUnsub) { freeUnsub(); freeUnsub = null; }
  Store.applyRemote('occfree', {});
  if (!isAdmin) return;
  freeUnsub = onSnapshot(query(collection(db, 'occfree'), where('date', '>=', yesterday())), snap => {
    Store.applyRemote('occfree', Object.fromEntries(snap.docs.map(d => [d.id, d.data().free])));
    refresh();
  }, onError);
}
function listenAttendance() {
  ocUnsubs.forEach(f => f()); ocUnsubs = [];
  Store.applyRemote('att', []); Store.applyRemote('spots', []);
  if (!user || !(isAdmin || member)) return;
  const on = (src, kind) => ocUnsubs.push(onSnapshot(src, snap => {
    Store.applyRemote(kind, snap.docs.map(d => Object.assign({ id: d.id }, d.data())));
    refresh();
  }, onError));
  ['att', 'spots'].forEach(k => {
    if (isAdmin) return on(query(collection(db, k), where('date', '>=', monthAgo())), k);
    if (coach) {
      // il coach vede le risposte e gli spot dei suoi allenamenti (o di tutti); più le proprie candidature
      const parts = {};
      const merge = () => { const all = {}; Object.values(parts).forEach(l => l.forEach(x => { all[x.id] = x; })); Store.applyRemote(k, Object.values(all)); refresh(); };
      const add = (key, src) => ocUnsubs.push(onSnapshot(src, snap => { parts[key] = snap.docs.map(d => Object.assign({ id: d.id }, d.data())); merge(); }, onError));
      add('c', coach.all ? query(collection(db, k), where('date', '>=', monthAgo())) : query(collection(db, k), where('coachUid', '==', user.uid)));
      add('m', query(collection(db, k), where('uid', '==', user.uid)));
      return;
    }
    on(query(collection(db, k), where('uid', '==', user.uid)), k);
  });
}
// Report e backup (admin): presenze, spot e giornate di un periodo qualsiasi, letti una volta dal database.
async function loadTrainingRange(from, to) {
  const get = k => getDocs(query(collection(db, k), where('date', '>=', from), where('date', '<=', to))).then(s => s.docs.map(d => Object.assign({ id: d.id }, d.data())));
  const [att, spots, occ] = await Promise.all(['att', 'spots', 'occ'].map(get));
  return { att, spots, occ };
}
const monthAgo = () => { const d = new Date(); d.setDate(d.getDate() - 31); return d.toLocaleDateString('sv'); };
const occBase = (tid, date) => ({ tid, date, p: 0, a: 0, s: 0, cancelled: false });
// Risposta presente/assente (status 'in'/'out', null = togli la risposta: solo admin). by = admin che la forza.
// Se il database rifiuta per un token di accesso non aggiornato, si rinnova e si riprova una volta.
async function withFreshToken(fn) {
  try { return await fn(); }
  catch (e) {
    if (e && e.code === 'permission-denied' && user) { await user.reload().catch(() => {}); await user.getIdToken(true); return fn(); }
    throw e;
  }
}
function setAttendance(tid, date, uid, status, extra) {
  return withFreshToken(() => setAttendanceTx(tid, date, uid, status, extra));
}
function setAttendanceTx(tid, date, uid, status, extra) {
  return runTransaction(db, async tr => {
    const oid = `${tid}_${date}`, oref = doc(db, 'occ', oid), aref = doc(db, 'att', `${oid}_${uid}`);
    const [os, as] = await Promise.all([tr.get(oref), tr.get(aref)]);
    const o = os.exists() ? os.data() : occBase(tid, date), before = as.exists() ? as.data().status : 'none';
    if (before === (status || 'none') && !(extra && extra.forced)) return;
    const after = status || 'none';
    const p = (o.p || 0) + (after === 'in' ? 1 : 0) - (before === 'in' ? 1 : 0);
    const a = (o.a || 0) + (after === 'out' ? 1 : 0) - (before === 'out' ? 1 : 0);
    if (os.exists()) tr.update(oref, { p, a }); else tr.set(oref, Object.assign(occBase(tid, date), { p, a }));
    if (status) tr.set(aref, Object.assign({ tid, date, uid, status, at: Date.now(), coachUid: (extra && extra.coachUid) || '' }, extra && extra.forced ? { forced: true, by: user.uid } : {}));
    else tr.delete(aref);
  });
}
// Candidatura a un posto spot (utente registrato).
function applySpot(d) { return withFreshToken(() => applySpotNow(d)); }
function applySpotNow(d) { return setDoc(doc(db, 'spots', `${d.tid}_${d.date}_${user.uid}`), Object.assign({ uid: user.uid, status: 'pending', at: Date.now(), seen: false }, d)); }
function withdrawSpot(id) { return deleteDoc(doc(db, 'spots', id)); }
function seeSpot(id) { return updateDoc(doc(db, 'spots', id), { seen: true }); }
// Admin: conferma o rifiuta (aggiorna il contatore degli spot confermati), oppure assegna un recupero.
// packId: lo spot confermato si scala dal pacchetto (prezzo 0); se lo spot torna rifiutato, l'allenamento si restituisce.
function decideSpot(sp, ok, price, packId) {
  return runTransaction(db, async tr => {
    const oref = doc(db, 'occ', `${sp.tid}_${sp.date}`), sref = doc(db, 'spots', sp.id), fref = doc(db, 'occfree', `${sp.tid}_${sp.date}`);
    const [os, ss, fs] = await Promise.all([tr.get(oref), tr.get(sref), tr.get(fref)]);
    const prev = ss.exists() ? ss.data() : {};
    const was = prev.status === 'ok';
    const use = ok && packId ? packId : null, back = was && prev.pack && !prev.packBack ? prev.pack : null;
    const pks = {};
    for (const id of new Set([use, back].filter(Boolean))) pks[id] = await tr.get(doc(db, 'packs', id));
    if (use) {
      const pk = pks[use].exists() ? pks[use].data() : null;
      const left = pk ? pk.n - (pk.used || 0) + (back === use ? 1 : 0) : 0;
      if (left <= 0) throw Object.assign(new Error('pack-empty'), { code: 'pack-empty' });
    }
    const o = os.exists() ? os.data() : occBase(sp.tid, sp.date);
    const s = (o.s || 0) + (ok ? 1 : 0) - (was ? 1 : 0);
    const open = (fs.exists() ? Number(fs.data().free) || 0 : 0) - s > 0;   // ci sono ancora posti spot (senza il numero)
    if (os.exists()) tr.update(oref, { s, open }); else tr.set(oref, Object.assign(occBase(sp.tid, sp.date), { s, open }));
    const delta = {};
    if (use) delta[use] = (delta[use] || 0) + 1;
    if (back) delta[back] = (delta[back] || 0) - 1;
    Object.entries(delta).forEach(([id, d]) => { if (d && pks[id].exists()) tr.update(doc(db, 'packs', id), { used: Math.max(0, (pks[id].data().used || 0) + d) }); });
    const data = { status: ok ? 'ok' : 'no', decidedAt: Date.now(), seen: false };
    if (ok) data.price = use ? 0 : price;
    if (use) data.pack = use;
    if (ss.exists()) tr.update(sref, Object.assign({ pack: deleteField(), packBack: deleteField() }, data));
    else tr.set(sref, Object.assign(stripId(sp), data));
  });
}
// Posti spot liberi del giorno, decisi dall'admin (null = nessuno). Il numero sta in occfree/{tid_data}, leggibile
// solo dall'admin; nella giornata pubblica (occ) resta solo "open": ci sono ancora posti spot sì/no.
function setOccFree(tid, date, free) {
  return runTransaction(db, async tr => {
    const id = `${tid}_${date}`, oref = doc(db, 'occ', id), fref = doc(db, 'occfree', id);
    const os = await tr.get(oref);
    const open = free != null && free - ((os.exists() && os.data().s) || 0) > 0;
    if (free == null) tr.delete(fref); else tr.set(fref, { tid, date, free, updated: Date.now() });
    if (os.exists()) tr.update(oref, { open }); else tr.set(oref, Object.assign(occBase(tid, date), { open }));
  });
}
// Annulla o ripristina un allenamento del giorno. packSpots = spot confermati scalati da un pacchetto:
// con l'annullamento l'allenamento torna nel pacchetto (packBack), con il ripristino si scala di nuovo.
function setOccCancelled(tid, date, cancelled, note, packSpots) {
  return runTransaction(db, async tr => {
    const oref = doc(db, 'occ', `${tid}_${date}`), os = await tr.get(oref);
    const list = (packSpots || []).filter(sp => sp.pack && !!sp.packBack !== cancelled);
    const ids = [...new Set(list.map(sp => sp.pack))];
    const pks = {};
    for (const id of ids) pks[id] = await tr.get(doc(db, 'packs', id));
    if (os.exists()) tr.update(oref, { cancelled, note: note || '' });
    else tr.set(oref, Object.assign(occBase(tid, date), { cancelled, note: note || '' }));
    ids.forEach(id => {
      if (!pks[id].exists()) return;
      const k = list.filter(sp => sp.pack === id).length;
      tr.update(doc(db, 'packs', id), { used: Math.max(0, (pks[id].data().used || 0) + (cancelled ? -k : k)) });
    });
    list.forEach(sp => tr.update(doc(db, 'spots', sp.id), { packBack: cancelled ? true : deleteField() }));
  });
}

// ---------- pagamenti e ricevute ----------
// receipts/{id}: ricevuta (numero progressivo per anno, dati del socio, importo, modalità, causale): admin e interessato.
// counters/receipts-AAAA: ultimo numero usato nell'anno (solo admin).
let rcUnsub = null;
function listenReceipts() {
  if (rcUnsub) { rcUnsub(); rcUnsub = null; }
  Store.applyRemote('receipts', []);
  if (caUnsubs.length) { caUnsubs.forEach(f => f()); caUnsubs = []; }
  Store.applyRemote('incassi', []);
  const cash = isAdmin || !!roles.cash;
  if (!user || !(cash || member)) return;
  rcUnsub = onSnapshot(cash ? collection(db, 'receipts') : query(collection(db, 'receipts'), where('uid', '==', user.uid)), snap => {
    Store.applyRemote('receipts', snap.docs.map(d => Object.assign({ id: d.id }, d.data())));
    refresh();
  }, onError);
  if (!cash) return;
  caUnsubs.push(onSnapshot(collection(db, 'incassi'), snap => {
    Store.applyRemote('incassi', snap.docs.map(d => Object.assign({ id: d.id }, d.data())));
    refresh();
  }, onError));
}
let caUnsubs = [];

// ---------- CASSA: incassi e ricevute Q (quote sociali) / C (commerciali) ----------
// incassi/{id}: ogni incasso (data, modalità, righe con categoria e importo, ricevute emesse): cassa e admin.
// Ricevute: serie Q e C con numerazione autonoma per anno (counters/receipts-AAAA per Q, receiptsC-AAAA per C).
const ctrRef = (series, year) => doc(db, 'counters', (series === 'C' ? 'receiptsC-' : 'receipts-') + year);
const rnOf = (series, n, year) => `${n}/${series}/${year}`;
// p = { date, method, lines: [{ cat, series, desc, amount, ref? }], receipt: { Q, C } (quali ricevute emettere),
//   uid, person (intestatario, può mancare), causale: { Q, C } }
const cleanPerson = x => (x ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v == null ? '' : v && typeof v === 'object' ? cleanPerson(v) : v])) : null);

// Timbro e firma per le ricevute (private/receiptSign): li leggono gli utenti collegati, li carica l'admin.
let signPromise = null;
function receiptSign() {
  if (!user) return Promise.resolve(null);
  if (!signPromise) signPromise = getDoc(doc(db, 'private', 'receiptSign')).then(d => (d.exists() ? d.data() : null)).catch(e => { signPromise = null; throw e; });
  return signPromise;
}
function saveReceiptSign(k, url) {
  signPromise = null;
  return setDoc(doc(db, 'private', 'receiptSign'), { [k]: url, updated: Date.now(), by: user.uid }, { merge: true });
}
function recordIncasso(p) {
  p = Object.assign({}, p, { person: cleanPerson(p.person) });
  const year = p.date.slice(0, 4);
  return runTransaction(db, async tr => {
    const want = ['Q', 'C'].filter(s => p.receipt[s] && p.lines.some(l => l.series === s));
    const ctr = {};
    for (const s of want) { const cs = await tr.get(ctrRef(s, year)); ctr[s] = cs.exists() ? cs.data().last || 0 : 0; }
    const iref = doc(collection(db, 'incassi'));
    const rec = {};
    want.forEach(s => {
      const lines = p.lines.filter(l => l.series === s), amount = Math.round(lines.reduce((a, l) => a + l.amount, 0) * 100) / 100;
      const n = ctr[s] + 1, rref = doc(collection(db, 'receipts'));
      tr.set(ctrRef(s, year), { last: n, updated: Date.now() });
      tr.set(rref, { year: +year, n, series: s, issued: p.date, payDate: p.date, amount, method: p.method, kind: 'cassa', ref: iref.id, incasso: iref.id,
        uid: p.uid || '', person: p.person || null, causale: p.causale[s], lines: lines.map(l => ({ cat: l.cat, desc: l.desc, amount: l.amount })), void: false, created: Date.now(), by: user.uid });
      rec[s] = { id: rref.id, rn: rnOf(s, n, year) };
    });
    tr.set(iref, incassoDoc(p, rec));
  });
}
const sumOf = (lines, s) => Math.round(lines.filter(l => !s || l.series === s).reduce((a, l) => a + l.amount, 0) * 100) / 100;
const incassoDoc = (p, rec) => ({ date: p.date, method: p.method, lines: p.lines.map(l => Object.assign({ cat: l.cat, series: l.series, desc: l.desc, amount: l.amount }, l.ref ? { ref: l.ref } : {})),
  totQ: sumOf(p.lines, 'Q'), totC: sumOf(p.lines, 'C'), total: sumOf(p.lines), receipts: rec, uid: p.uid || '', name: (p.person && p.person.name) || '', void: false, at: Date.now(), by: user.uid });
// Inserimento di una ricevuta con numero e data scelti (admin): le ricevute della stessa serie e anno con numero
// uguale o maggiore scalano di uno (shifts = [{ id, n, links }]), il contatore va all'ultimo numero.
function insertIncasso(p, series, n, shifts, last) {
  p = Object.assign({}, p, { person: cleanPerson(p.person) });
  const year = p.date.slice(0, 4), batch = writeBatch(db);
  shifts.forEach(x => {
    batch.update(doc(db, 'receipts', x.id), { n: x.n, renumbered: Date.now() });
    (x.links || []).forEach(l => batch.update(doc(db, l.col, l.id), { [l.field]: l.rn }));
  });
  const iref = doc(collection(db, 'incassi')), rref = doc(collection(db, 'receipts'));
  const lines = p.lines.filter(l => l.series === series);
  batch.set(rref, { year: +year, n, series, issued: p.date, payDate: p.date, amount: sumOf(lines), method: p.method, kind: 'cassa', ref: iref.id, incasso: iref.id,
    uid: p.uid || '', person: p.person || null, causale: p.causale[series], lines: lines.map(l => ({ cat: l.cat, desc: l.desc, amount: l.amount })), void: false, created: Date.now(), by: user.uid, inserted: true });
  const rec = { [series]: { id: rref.id, rn: rnOf(series, n, year) } };
  batch.set(iref, incassoDoc(p, rec));
  batch.set(ctrRef(series, year), { last, updated: Date.now() });
  return batch.commit();
}
// Annulla un incasso: le sue ricevute restano come ANNULLATE; prenotazioni, piani, spot e pacchetti tornano da pagare.
function voidIncasso(inc) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'incassi', inc.id), { void: true, voidAt: Date.now(), voidBy: user.uid });
  Object.values(inc.receipts || {}).forEach(r => batch.update(doc(db, 'receipts', r.id), { void: true, voidAt: Date.now() }));
  (inc.lines || []).forEach(l => {
    if (!l.ref) return;
    if (l.ref.kind === 'quarter') {
      (l.ref.planIds || []).forEach(id => batch.update(doc(db, 'plans', id), { paid: deleteField() }));
      batch.update(doc(db, 'athletes', l.ref.uid), Object.fromEntries((l.ref.months || []).map(m => [`prepaid.${m}`, deleteField()])));
    } else batch.update(doc(db, payCol(l.ref.kind), l.ref.id), { paid: deleteField() });
  });
  return batch.commit();
}
// Intestatario della ricevuta (anche dopo l'emissione): si registra chi l'ha cambiato e quando.
function setReceiptHolder(r, uid, person) {
  person = cleanPerson(person);
  const log = (r.holderLog || []).concat([{ at: Date.now(), by: user.uid, from: (r.person && r.person.name) || '', to: (person && person.name) || '' }]);
  const batch = writeBatch(db);
  batch.update(doc(db, 'receipts', r.id), { uid: uid || '', person: person || null, holderLog: log });
  if (r.incasso) batch.update(doc(db, 'incassi', r.incasso), { uid: uid || '', name: (person && person.name) || '' });
  return batch.commit();
}
// Registra un pagamento: ricevuta numerata (se importo > 0), "paid" sul piano o sullo spot, scheda aggiornata.
// p = { kind: 'month'|'spot'|'pack', ref (id piano o spot), uid, amount, method, payDate, issued, causale, month|spotDate, person, athlete }
function recordPayment(p) {
  p = Object.assign({}, p, { person: cleanPerson(p.person) });
  const year = p.issued.slice(0, 4);
  return runTransaction(db, async tr => {
    const cref = ctrRef('Q', year);
    const cs = await tr.get(cref);
    const paid = { date: p.payDate, method: p.method, amount: p.amount, at: Date.now() };
    // ogni pagamento è anche un incasso della cassa (quote sociali – corsi di allenamento)
    const iref = doc(collection(db, 'incassi')), rec = {};
    if (p.amount > 0 && p.receipt !== false) {
      const n = (cs.exists() ? cs.data().last || 0 : 0) + 1;
      const rref = doc(collection(db, 'receipts'));
      tr.set(cref, { last: n, updated: Date.now() });
      tr.set(rref, { year: +year, n, series: 'Q', issued: p.issued, payDate: p.payDate, amount: p.amount, method: p.method, kind: p.kind, ref: p.ref, incasso: iref.id,
        uid: p.uid, person: p.person, causale: p.causale, month: p.month || '', months: p.months || [], quarter: !!p.quarter, spotDate: p.spotDate || '', void: false, created: Date.now(), by: user.uid });
      Object.assign(paid, { rid: rref.id, rn: rnOf('Q', n, year) });
      rec.Q = { id: rref.id, rn: paid.rn };
    }
    if (p.amount > 0) {
      paid.iid = iref.id;
      const ref = p.quarter ? { kind: 'quarter', planIds: p.planIds || [], uid: p.uid, months: p.months } : { kind: p.kind, id: p.ref };
      tr.set(iref, incassoDoc({ date: p.payDate, method: p.method, uid: p.uid, person: p.person, lines: [{ cat: 'q_train', series: 'Q', desc: p.causale, amount: p.amount, ref }] }, rec));
    }
    if (p.quarter) {
      // trimestrale: pagati il mese e i due successivi; i piani già creati si segnano subito,
      // per gli altri mesi resta il "prepagato" nella scheda (vale quando si compone il gruppo)
      Object.assign(paid, { quarter: true, months: p.months });
      (p.planIds || []).forEach(id => tr.update(doc(db, 'plans', id), { paid }));
      const athlete = Object.assign({}, p.athlete || {}, { prepaid: Object.fromEntries(p.months.map(m => [m, paid])) });
      tr.set(doc(db, 'athletes', p.uid), athlete, { merge: true });
      return;
    }
    tr.update(doc(db, payCol(p.kind), p.ref), { paid });
    if (p.athlete) tr.set(doc(db, 'athletes', p.uid), p.athlete, { merge: true });
  });
}
// Annulla una ricevuta (resta in archivio come ANNULLATA; il piano o lo spot torna da pagare).
// planIds = piani esistenti dei mesi coperti (per il trimestrale).
function voidReceipt(r, planIds) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'receipts', r.id), { void: true, voidAt: Date.now() });
  if (r.incasso) batch.update(doc(db, 'incassi', r.incasso), { void: true, voidAt: Date.now(), voidBy: user.uid });
  if (r.quarter) {
    (planIds || []).forEach(id => batch.update(doc(db, 'plans', id), { paid: deleteField() }));
    batch.update(doc(db, 'athletes', r.uid), Object.fromEntries((r.months || []).map(m => [`prepaid.${m}`, deleteField()])));
  } else batch.update(doc(db, payCol(r.kind), r.ref), { paid: deleteField() });
  return batch.commit();
}
// Rinumera le ricevute (admin): nuovi numeri, numero mostrato su piani/spot/prepagati, ultimo numero dell'anno.
function renumberReceipts(changes, links, year, last, series) {
  const batch = writeBatch(db);
  changes.forEach(c => batch.update(doc(db, 'receipts', c.id), { n: c.n, renumbered: Date.now() }));
  links.forEach(l => batch.update(doc(db, l.col, l.id), { [l.field]: l.rn }));
  batch.set(ctrRef(series || 'Q', year), { last, updated: Date.now() });
  return batch.commit();
}
// Toglie un pagamento registrato senza ricevuta (l'incasso collegato si annulla).
function unpay(kind, ref, iid) {
  const batch = writeBatch(db);
  batch.update(doc(db, payCol(kind), ref), { paid: deleteField() });
  if (iid) batch.update(doc(db, 'incassi', iid), { void: true, voidAt: Date.now(), voidBy: user.uid });
  return batch.commit();
}
const payCol = kind => ({ month: 'plans', spot: 'spots', pack: 'packs' })[kind];
// Pacchetti (admin): crea, modifica numero/prezzo, elimina (solo se non usato e non pagato).
function savePack(id, data) { return id ? updateDoc(doc(db, 'packs', id), data) : addDoc(collection(db, 'packs'), Object.assign({ used: 0, created: Date.now(), by: user.uid }, data)); }
function deletePack(id) { return deleteDoc(doc(db, 'packs', id)); }

function saveAthlete(uid, data) { return setDoc(doc(db, 'athletes', uid), data, { merge: true }); }
function savePlan(p) { return setDoc(doc(db, 'plans', p.id), stripId(p)); }
// L'admin registra il proprio nome da giocatore (per essere inserito nei gruppi o come coach).
async function saveSelfProfile(d) {
  const prof = { first: d.first, last: d.last, gender: d.gender, created: Date.now() };
  await setDoc(doc(db, 'members', user.uid), prof);
  if (user.email) setDoc(doc(db, 'accounts', user.uid), { email: user.email.toLowerCase(), verified: !!user.emailVerified }).catch(() => {});
  adminMember = Object.assign({ uid: user.uid, email: user.email || '' }, prof);
  refresh();
}
// Account senza scheda utente (creato fuori dall'app): completa nome, cognome e sesso e accetta privacy e termini.
// Da qui in poi compare nella lista degli utenti, come chi si registra dall'app.
async function completeProfile(d) {
  const prof = { first: d.first, last: d.last, gender: d.gender, created: Date.now(), privacyAt: Date.now(), privacyVer: d.privacyVer || '' };
  await setDoc(doc(db, 'members', user.uid), prof);
  if (user.email) await setDoc(doc(db, 'accounts', user.uid), { email: user.email.toLowerCase(), verified: !!user.emailVerified });
  member = Object.assign({ uid: user.uid, email: user.email || '' }, prof);
  listenAccount();
  listenVerified();
  listenFreeplay();
  listenRosters();
  listenRoles();
  refresh();
}
// Elimina un utente dall'app (admin): gruppi degli allenamenti, piani, scheda e profilo.
// Le ricevute restano (obbligo fiscale). L'account di accesso si elimina dalla console Firebase.
function deleteUser(uid, groups, planIds, packIds) {
  const batch = writeBatch(db);
  groups.forEach(g => batch.set(doc(db, 'groups', g.id), g.data));
  groups.filter(g => g.tr).forEach(g => batch.update(doc(db, 'trainings', g.data.tid), { ['sizes.' + g.data.month]: (g.data.uids || []).length }));
  planIds.forEach(id => batch.delete(doc(db, 'plans', id)));
  (packIds || []).forEach(id => batch.delete(doc(db, 'packs', id)));
  ['members', 'accounts', 'athletes', 'tesserati', 'verified', 'bans', 'coaches'].forEach(c => batch.delete(doc(db, c, uid)));
  return batch.commit();
}
function setCoach(uid, data) { return data ? setDoc(doc(db, 'coaches', uid), data) : deleteDoc(doc(db, 'coaches', uid)); }

// ---------- tornei a squadre (pallavolo) ----------
// vtours/{id}: torneo (nome, livello, girone all'italiana "ar"/"a", gironi, playoff, stato) — pubblico.
// vmatches/{tid_key}: gare (squadre, giornata, data, ora, palestra, set {h, a}, stato sched/done) — pubbliche.
onSnapshot(collection(db, 'vtours'), snap => {
  Store.applyRemote('vtours', snap.docs.map(d => Object.assign({ id: d.id }, d.data())));
  refresh();
}, onError);
onSnapshot(collection(db, 'vmatches'), snap => {
  Store.applyRemote('vmatches', snap.docs.map(d => Object.assign({ id: d.id }, d.data())));
  refresh();
}, onError);
function saveVTour(id, data) {
  const ref = id ? doc(db, 'vtours', id) : doc(collection(db, 'vtours'));
  return (id ? updateDoc(ref, Object.assign({}, data, { updated: Date.now() })) : setDoc(ref, Object.assign({ created: Date.now(), updated: Date.now() }, data))).then(() => ref.id);
}
// Importazione di tornei completi (squadre, tornei, gare): liste di [id, dati], scritte in un unico invio.
function importTournaments(teams, tours, matches) {
  const b = writeBatch(db);
  teams.forEach(([id, d]) => b.set(doc(db, 'teams', id), d));
  tours.forEach(([id, d]) => b.set(doc(db, 'vtours', id), d));
  matches.forEach(([id, d]) => b.set(doc(db, 'vmatches', id), d));
  return b.commit();
}
// Scritture a blocchi (al massimo 450 per invio): set = { id: dati } da scrivere, del = id da cancellare.
async function writeVMatches(set, del) {
  const ops = Object.entries(set || {}).map(([id, d]) => b => b.set(doc(db, 'vmatches', id), d))
    .concat((del || []).map(id => b => b.delete(doc(db, 'vmatches', id))));
  for (let i = 0; i < ops.length; i += 450) {
    const b = writeBatch(db);
    ops.slice(i, i + 450).forEach(f => f(b));
    await b.commit();
  }
}
function updateVMatch(id, patch) { return updateDoc(doc(db, 'vmatches', id), Object.assign({}, patch, { updated: Date.now() })); }
// ---------- cestino dei tornei ----------
// trash/{id}: copia completa di un torneo tolto dalle pagine (torneo, gare con i risultati, squadre e rose scelte):
// archiviato (senza scadenza) oppure nel cestino per 7 giorni. Si ripristina in ogni momento; scaduti i 7 giorni la
// copia del cestino si cancella da sola alla prima apertura di un admin tornei.
// ---------- codici dei capitani (teamCodes/{codice} = { teamId }) ----------
let codesUnsub = null;
function listenTeamCodes() {
  if (codesUnsub) { codesUnsub(); codesUnsub = null; }
  Store.applyRemote('teamCodes', []);
  if (!user || !canTour()) return;
  codesUnsub = onSnapshot(collection(db, 'teamCodes'), snap => {
    Store.applyRemote('teamCodes', snap.docs.map(d => Object.assign({ id: d.id }, d.data())));
    refresh();
  }, onError);
}
// codice di 8 caratteri senza lettere e cifre che si confondono (0/O, 1/I/L), es. K7QM-3XPA
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCode() {
  const r = crypto.getRandomValues(new Uint32Array(8));
  const s = Array.from(r, x => CODE_CHARS[x % CODE_CHARS.length]).join('');
  return s.slice(0, 4) + '-' + s.slice(4);
}
const normCode = c => { const s = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return s.length === 8 ? s.slice(0, 4) + '-' + s.slice(4) : ''; };
// Nuovo codice per una o più squadre: quelli vecchi delle stesse squadre smettono di valere
async function makeTeamCodes(teamIds) {
  const old = await getDocs(collection(db, 'teamCodes'));
  const out = {}, now = Date.now();
  secondAuth();
  for (const id of teamIds) {
    const c = newCode();
    const cred = await createUserWithEmailAndPassword(second, codeEmail(c), codePass(c));
    await signOut(second);
    // il codice vecchio della squadra smette di valere: la squadra riconosce solo l'account del codice nuovo
    const batch = writeBatch(db);
    old.docs.filter(d => d.data().teamId === id).forEach(d => batch.delete(d.ref));
    batch.set(doc(db, 'teamCodes', c), { teamId: id, uid: cred.user.uid, created: now, by: user.email || '' });
    batch.update(doc(db, 'teams', id), { codeUid: cred.user.uid, updated: now });
    await batch.commit();
    out[id] = c;
  }
  return out;
}
// Liste dei giocatori importate da un file (admin dei tornei): una lista per squadra; il capitano scritto nel file
// va nella squadra solo se non ha già un capitano nell'app
function importContacts(list) {
  if (!canTour() || !list.length) return Promise.resolve();
  const batch = writeBatch(db), now = Date.now();
  list.forEach(x => batch.set(doc(db, 'teamContacts', x.id), { name: x.name || '', phone: x.phone || '', updated: now }));
  return batch.commit();
}
async function importRosters(entries) {
  const now = Date.now();
  for (let i = 0; i < entries.length; i += 200) {
    const batch = writeBatch(db);
    entries.slice(i, i + 200).forEach(x => {
      batch.set(doc(db, 'rosters', x.id), { captainUid: x.captainUid || '', players: x.players, updated: now });
      if (x.captainName) batch.update(doc(db, 'teams', x.id), { captainName: x.captainName, updated: now });
    });
    await batch.commit();
  }
}

// Accesso con il codice: ogni squadra ha un account suo (email interna, nessuna posta), creato dall'admin con un'app
// Firebase separata. Il capitano entra quando vuole, da qualsiasi dispositivo, scrivendo solo il codice.
const CODE_DOMAIN = 'squadre.manofuori.it';
const codeEmail = c => `${c.replace('-', '').toLowerCase()}@${CODE_DOMAIN}`;
const codePass = c => `Mf!${c}#squadra`;
// Codice dell'arbitro: stesso sistema, con un dominio interno diverso (nessuna posta)
const REF_DOMAIN = 'arbitri.manofuori.it';
const refEmail = c => `${c.replace('-', '').toLowerCase()}@${REF_DOMAIN}`;
// Un solo campo per entrare con un codice: prima come squadra, poi come arbitro
async function codeLogin(code) {
  const c = normCode(code);
  if (!c) throw Object.assign(new Error('bad-code'), { code: 'bad-code' });
  for (const [email, kind] of [[codeEmail(c), 'team'], [refEmail(c), 'ref']]) {
    try { await signInWithEmailAndPassword(auth, email, codePass(c)); return { code: c, kind }; }
    catch (e) { if (e.code === 'auth/too-many-requests') throw Object.assign(new Error('too-many'), { code: 'too-many' }); }
  }
  throw Object.assign(new Error('bad-code'), { code: 'bad-code' });
}

const TRASH_DAYS = 7;
let trashUnsub = null;
function listenTrash() {
  if (trashUnsub) { trashUnsub(); trashUnsub = null; }
  Store.applyRemote('trash', []);
  if (!user || !canTour()) return;
  trashUnsub = onSnapshot(collection(db, 'trash'), snap => {
    const now = Date.now(), list = [];
    // archiviati: expiresAt null (nessuna scadenza); nel cestino: cancellati alla scadenza
    snap.docs.forEach(d => { const x = Object.assign({ id: d.id }, d.data()); if (x.expiresAt && x.expiresAt < now) deleteDoc(d.ref).catch(() => {}); else list.push(x); });
    Store.applyRemote('trash', list.sort((a, b) => b.deletedAt - a.deletedAt));
    refresh();
  }, onError);
}
const noId = o => { const x = Object.assign({}, o); delete x.id; return x; };
async function trashVTour(tour, matches, teams, keep) {
  const rosters = [];
  for (const tm of teams) { try { const r = await getDoc(doc(db, 'rosters', tm.id)); if (r.exists()) rosters.push(Object.assign({ id: r.id }, r.data())); } catch (e) { /* senza rosa */ } }
  const now = Date.now();
  await setDoc(doc(db, 'trash', `vt_${tour.id}_${now}`), { kind: 'vtour', tid: tour.id, name: tour.name, level: tour.level || '',
    tour: JSON.stringify(tour), matches: JSON.stringify(matches), teams: JSON.stringify(teams), rosters: JSON.stringify(rosters),
    nMatches: matches.length, nDone: matches.filter(m => m.status === 'done').length, nTeams: teams.length,
    deletedAt: now, expiresAt: keep ? null : now + TRASH_DAYS * 864e5, archived: !!keep, by: user.uid });
  // solo dopo la copia: si cancellano gare, torneo, squadre e rose
  await writeVMatches({}, matches.map(m => m.id));
  const b = writeBatch(db);
  b.delete(doc(db, 'vtours', tour.id));
  teams.forEach(tm => { b.delete(doc(db, 'teams', tm.id)); b.delete(doc(db, 'rosters', tm.id)); });
  await b.commit();
}
async function restoreVTour(trashId) {
  const snap = await getDoc(doc(db, 'trash', trashId));
  if (!snap.exists()) throw Object.assign(new Error('not-found'), { code: 'not-found' });
  const x = snap.data(), tour = JSON.parse(x.tour), matches = JSON.parse(x.matches), teams = JSON.parse(x.teams || '[]'), rosters = JSON.parse(x.rosters || '[]');
  const b = writeBatch(db);
  teams.forEach(tm => b.set(doc(db, 'teams', tm.id), noId(tm)));
  rosters.forEach(r => b.set(doc(db, 'rosters', r.id), noId(r)));
  b.set(doc(db, 'vtours', tour.id), noId(tour));
  await b.commit();
  await writeVMatches(Object.fromEntries(matches.map(m => [m.id, noId(m)])), []);
  await deleteDoc(doc(db, 'trash', trashId));
  return tour.id;
}
function purgeTrash(trashId) { return deleteDoc(doc(db, 'trash', trashId)); }

async function deleteVTour(id, matchIds) {
  await writeVMatches({}, matchIds);
  await deleteDoc(doc(db, 'vtours', id));
}

// ---------- squadre ----------
// teams/{id}: pubblico (nome, livello, tipo X/M/F, capitano, stato pending/ok). Lo crea il capitano (utente
//   registrato) in attesa; l'ammissione al livello (stato ok) la decide l'admin tornei.
// rosters/{id}: rosa della squadra (cognome, nome, sesso, numero di maglia): la leggono solo il capitano e l'admin.
onSnapshot(collection(db, 'teams'), snap => {
  Store.applyRemote('teams', snap.docs.map(d => Object.assign({ id: d.id }, d.data())));
  refresh();
}, onError);
let rosterUnsub = null;
// telefoni dei responsabili delle squadre (solo admin generali e admin dei tornei)
let contactsUnsub = null;
function listenTeamContacts() {
  if (contactsUnsub) { contactsUnsub(); contactsUnsub = null; }
  Store.applyRemote('teamContacts', []);
  if (!user || !canTour()) return;
  contactsUnsub = onSnapshot(collection(db, 'teamContacts'), snap => {
    Store.applyRemote('teamContacts', snap.docs.map(d => Object.assign({ id: d.id }, d.data())));
    refresh();
  }, onError);
}
function listenRosters() {
  listenTrash();
  listenTeamContacts();
  listenTeamCodes();
  if (rosterUnsub) { rosterUnsub(); rosterUnsub = null; }
  Store.applyRemote('rosters', []);
  if (user && teamCap && teamCap.teamId) {
    // account del codice: la lista della sua squadra (letta per id)
    rosterUnsub = onSnapshot(doc(db, 'rosters', teamCap.teamId), d => {
      Store.applyRemote('rosters', d.exists() ? [Object.assign({ id: d.id }, d.data())] : []);
      refresh();
    }, onError);
    return;
  }
  if (!user || !(canTour() || member || scorer || roles.refs)) return;
  // admin tornei, responsabile arbitri e scorer (per il referto) leggono tutte le rose; il capitano solo le sue
  const src = canRefs() || scorer ? collection(db, 'rosters') : query(collection(db, 'rosters'), where('captainUid', '==', user.uid));
  rosterUnsub = onSnapshot(src, snap => {
    Store.applyRemote('rosters', snap.docs.map(d => Object.assign({ id: d.id }, d.data())));
    refresh();
  }, onError);
}
// Crea (id = null) o modifica una squadra: dati pubblici e rosa nello stesso invio.
function saveTeam(id, team, players) {
  const ref = id ? doc(db, 'teams', id) : doc(collection(db, 'teams'));
  const batch = writeBatch(db), now = Date.now();
  if (id) batch.update(ref, Object.assign({}, team, { updated: now }));
  else batch.set(ref, Object.assign({ status: 'pending', created: now }, team, { updated: now }));
  batch.set(doc(db, 'rosters', ref.id), { captainUid: team.captainUid, players, updated: now });
  return batch.commit().then(() => ref.id);
}
// Omologazione di una gara (admin tornei): blocca il risultato per gli account dei campi e gli arbitri, anche nel referto
async function approveVMatch(id, on) {
  if (!canTour()) return;
  const now = Date.now(), by = (user.email || '').toLowerCase();
  await updateDoc(doc(db, 'vmatches', id), on ? { approvedAt: now, approvedBy: by, updated: now } : { approvedAt: null, approvedBy: '', updated: now });
  const r = await getDoc(doc(db, 'referti', id)).catch(() => null);
  if (r && r.exists() && r.data().status !== 'ready' && r.data().status !== 'live') await updateDoc(doc(db, 'referti', id), on ? { status: 'approved', approvedAt: now, updated: now, updatedBy: by } : { status: 'finished', approvedAt: null, updated: now, updatedBy: by });
}
function setTeamStatus(id, status) { return updateDoc(doc(db, 'teams', id), { status, updated: Date.now() }); }
function deleteTeam(id) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'rosters', id));
  batch.delete(doc(db, 'teams', id));
  return batch.commit();
}

// ---------- gioco libero ----------
// freeplay/{id}: sessione dell'admin (pubblica: nome, data, orari, livelli, contatori m/f dei partecipanti).
// fpreg/{id_uid}: partecipazione dell'utente (nome, sesso, livello, stato in/out, orari): la leggono solo
// l'utente e l'admin. Contatore e partecipazione cambiano sempre insieme (transazione).
onSnapshot(query(collection(db, 'freeplay'), where('date', '>=', yesterday())), snap => {
  Store.applyRemote('freeplay', snap.docs.map(d => Object.assign({ id: d.id }, d.data())));
  refresh();
}, onError);
// fpanon/{id}: presenza anonima nei blocchi orari (solo sesso e blocchi, senza nome né uid): la vedono tutti.
onSnapshot(query(collection(db, 'fpanon'), where('date', '>=', yesterday())), snap => {
  Store.applyRemote('fpanon', snap.docs.map(d => Object.assign({ id: d.id }, d.data())));
  refresh();
}, onError);
let fpUnsub = null;
function listenFreeplay() {
  if (fpUnsub) { fpUnsub(); fpUnsub = null; }
  Store.applyRemote('fpreg', []);
  if (!user || !(isAdmin || member)) return;
  const src = isAdmin ? collection(db, 'fpreg') : query(collection(db, 'fpreg'), where('uid', '==', user.uid));
  fpUnsub = onSnapshot(src, snap => {
    Store.applyRemote('fpreg', snap.docs.map(d => Object.assign({ id: d.id }, d.data())));
    refresh();
  }, onError);
}
// Crea o modifica una sessione (solo admin).
function saveFreeplay(old, d) {
  const ref = old ? doc(db, 'freeplay', old.id) : doc(collection(db, 'freeplay'));
  return (old ? updateDoc(ref, d) : setDoc(ref, Object.assign({}, d, { m: 0, f: 0, by: user.uid, created: Date.now() }))).then(() => ref.id);
}
function deleteFreeplay(fp, regs, anons) {
  const batch = writeBatch(db);
  regs.forEach(r => batch.delete(doc(db, 'fpreg', r.id)));
  (anons || []).forEach(a => batch.delete(doc(db, 'fpanon', a.id)));
  batch.delete(doc(db, 'freeplay', fp.id));
  return batch.commit();
}
// Partecipa (in) o si cancella (out): contatore pubblico del proprio sesso +1 / -1 insieme alla partecipazione.
// Con i blocchi orari (sessione con blocks) si scrive anche la presenza anonima fpanon: nuova a ogni ingresso,
// cancellata all'uscita. bl = blocchi scelti (orari di inizio, es. ['12:00', '13:00']).
function setFreeplay(fpId, data, on) {
  return runTransaction(db, async tr => {
    const fref = doc(db, 'freeplay', fpId), rref = doc(db, 'fpreg', `${fpId}_${user.uid}`);
    const [fs, rs] = await Promise.all([tr.get(fref), tr.get(rref)]);
    if (!fs.exists()) throw Object.assign(new Error('gone'), { code: 'not-found' });
    const prev = rs.exists() ? rs.data() : null;
    const was = !!(prev && prev.status === 'in');
    if (was === on) return;
    const fp = fs.data(), g = data.gender === 'F' ? 'f' : 'm';
    tr.update(fref, { [g]: (fp[g] || 0) + (on ? 1 : -1) });
    if (on) {
      const reg = { fid: fpId, uid: user.uid, name: data.name, gender: data.gender, level: data.level || 'none', status: 'in', at: Date.now(), outAt: prev ? prev.outAt || 0 : 0, n: (prev ? prev.n || 0 : 0) + 1 };
      if (fp.blocks) {
        const aref = doc(collection(db, 'fpanon'));
        Object.assign(reg, { bl: data.bl || [], anon: aref.id });
        tr.set(rref, reg);
        tr.set(aref, { fp: fpId, g: data.gender, bl: reg.bl, date: fp.date });
      } else tr.set(rref, reg);
    } else {
      tr.set(rref, Object.assign({}, prev, { status: 'out', outAt: Date.now() }));
      if (prev.anon) tr.delete(doc(db, 'fpanon', prev.anon));
    }
  });
}
// Cambia i blocchi di chi partecipa già (partecipazione e presenza anonima insieme).
function setFreeplayBlocks(fpId, bl) {
  return runTransaction(db, async tr => {
    const rref = doc(db, 'fpreg', `${fpId}_${user.uid}`);
    const [rs, fs] = await Promise.all([tr.get(rref), tr.get(doc(db, 'freeplay', fpId))]);   // prima tutte le letture
    if (!rs.exists() || rs.data().status !== 'in' || !fs.exists()) throw Object.assign(new Error('gone'), { code: 'not-found' });
    const r = rs.data();
    tr.update(rref, { bl });
    if (r.anon) tr.set(doc(db, 'fpanon', r.anon), { fp: fpId, g: r.gender, bl, date: fs.data().date });
  });
}

// Avviso per un utente (solo l'admin) o per gli amministratori ("admins").
function notify(to, text) {
  if (!user || !to) return;
  addDoc(collection(db, 'notices'), { to, text: String(text).slice(0, 400), at: Date.now(), by: user.uid }).catch(onError);
}
function dismissNotice(id) { return deleteDoc(doc(db, 'notices', id)).catch(onError); }

// Salva ciò che è cambiato: livelli delle squadre (admin tornei) e impostazioni (solo admin generale).
function push(state) {
  if (!canTour()) return;
  const batch = writeBatch(db);
  let n = 0;
  const tj = tourJson(state);
  if (tj !== last.tour) {
    batch.set(doc(db, 'data', 'tour'), { json: tj, updated: Date.now() });
    last.tour = tj; n++;
  }
  const settings = !isAdmin ? last.settings : JSON.stringify({ notice: state.notice || '', noticeUntil: state.noticeUntil || '', nicks: state.nicks || {}, prices: state.prices || null });
  if (settings !== last.settings) {
    batch.set(doc(db, 'data', 'settings'), { json: settings, updated: Date.now() });
    last.settings = settings; n++;
  }
  if (n) batch.commit().catch(onError);
}

// ---------- referto elettronico (E-scoresheet) ----------
// live/{tid}_{key}: punteggio in diretta di una gara, pubblico. Si ascoltano solo i tornei aperti
// (uno, o più nella pagina "Le mie gare" degli account dei campi).
let liveUnsub = null, liveKey = null;
function watchLive(tids) {
  const list = (Array.isArray(tids) ? tids : [tids]).filter(Boolean).slice(0, 30);
  const k = list.slice().sort().join(',');
  if (k === liveKey) return;
  if (liveUnsub) { liveUnsub(); liveUnsub = null; }
  liveKey = k;
  Store.applyRemote('live-reset');
  if (!list.length) return;
  const q = list.length === 1 ? where('tid', '==', list[0]) : where('tid', 'in', list);
  liveUnsub = onSnapshot(query(collection(db, 'live'), q), snap => {
    snap.docChanges().forEach(ch => Store.applyRemote(ch.type === 'removed' ? 'live-removed' : 'live', { id: ch.doc.id, data: ch.doc.data() }));
    refresh();
  }, onError);
}

// referti/{torneo}_{gara}: un documento per gara (dati completi del referto, solo staff);
// live/{torneo}_{gara}: punteggio pubblico. Li crea chi apre il referto (admin o account del campo).
const EMPTY = { status: 'ready', sets: [], setsWon: { a: 0, b: 0 }, cur: null, serving: null, winner: null, outcome: null, approvedAt: null };

async function openReferto(tid, key, a, b, court, info) {
  if (!canTour() && !scorer) throw Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
  const id = `${tid}_${key}`;
  const ref = await getDoc(doc(db, 'referti', id));
  const now = Date.now();
  if (ref.exists()) {
    const r = ref.data();
    // Referto di un sorteggio precedente (squadre diverse): lo azzera solo l'admin (generale o tornei).
    if (r.a !== a || r.b !== b) {
      if (!canTour()) throw Object.assign(new Error('stale'), { code: 'stale' });
      await resetReferto(id);
    } else {
      // dati della gara aggiornati (orario, campo...) finché non è omologata
      if (r.status !== 'approved') await setDoc(doc(db, 'referti', id), { info, court: court || '', updated: now, updatedBy: user.email || '' }, { merge: true });
      return id;
    }
  }
  const batch = writeBatch(db);
  batch.set(doc(db, 'referti', id), Object.assign({ tid, key, a, b, court: court || '', info, json: '', createdBy: user.email || '', createdAt: now, updated: now, updatedBy: user.email || '', closedAt: null }, EMPTY));
  batch.set(doc(db, 'live', id), Object.assign({ tid, key, a, b, updated: now }, EMPTY));
  await batch.commit();
  return id;
}

// Solo admin (generale o dei tornei): cancella referto, punteggio pubblico e PDF archiviati di una gara.
async function resetReferto(id) {
  if (!canTour()) return;
  const pdfs = await getDocs(query(collection(db, 'refertiPdf'), where('ref', '==', id)));
  const batch = writeBatch(db);
  batch.delete(doc(db, 'referti', id));
  batch.delete(doc(db, 'live', id));
  pdfs.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

// ---------- cartella referti di un torneo (solo admin e account dei campi) ----------
// referti: un documento per gara; refertiPdf (part 0): i file PDF archiviati, senza contenuto.
let refUnsub = [], refTid = null;
function watchReferti(tid) {
  if (!(canTour() || scorer)) tid = null;
  if (tid === refTid) return;
  refUnsub.forEach(u => u()); refUnsub = [];
  refTid = tid;
  Store.applyRemote('ref-reset');
  if (!tid) return;
  refUnsub.push(onSnapshot(query(collection(db, 'referti'), where('tid', '==', tid)), snap => {
    snap.docChanges().forEach(ch => Store.applyRemote(ch.type === 'removed' ? 'ref-removed' : 'ref', { id: ch.doc.id, data: ch.doc.data() }));
    Store.applyRemote('ref-loaded');
    refresh();
  }, onError));
  refUnsub.push(onSnapshot(query(collection(db, 'refertiPdf'), where('tid', '==', tid), where('part', '==', 0)), snap => {
    snap.docChanges().forEach(ch => Store.applyRemote(ch.type === 'removed' ? 'pdf-removed' : 'pdf', { id: ch.doc.id, data: ch.doc.data() }));
    Store.applyRemote('pdf-loaded');
    refresh();
  }, onError));
}

// Contenuto di un PDF archiviato (base64), ricomposto dalle sue parti.
async function loadPdf(id) {
  const first = await getDoc(doc(db, 'refertiPdf', id));
  if (!first.exists()) return null;
  const f = first.data();
  let data = '';
  for (let i = 1; i <= f.parts; i++) {
    const p = await getDoc(doc(db, 'refertiPdf', `${id}_${i}`));
    if (!p.exists() || p.data().version !== f.version) return null;
    data += p.data().data;
  }
  return { name: f.name, version: f.version, data };
}

// ---------- account dei campi (solo admin) ----------
async function listScorers() {
  const snap = await getDocs(collection(db, 'scorers'));
  return snap.docs.map(d => Object.assign({ email: d.id }, d.data()));
}

// L'utente si crea con un'app Firebase separata, così l'admin resta collegato.
let second = null;
function secondAuth() {
  if (!second) {
    const app2 = initializeApp(firebaseConfig, 'scorer-admin');
    second = getAuth(app2);
    try {
      if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && localStorage.getItem('pcm-emulator') === '1') connectAuthEmulator(second, `http://${location.hostname}:9099`, { disableWarnings: true });
    } catch (e) { /* ignore */ }
  }
  return second;
}
async function addScorer(email, password, court, tid) {
  if (!isAdmin) throw Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
  email = email.trim().toLowerCase();
  secondAuth();
  let existed = false;
  try {
    await createUserWithEmailAndPassword(second, email, password);
    await signOut(second);
  } catch (err) {
    if (err.code !== 'auth/email-already-in-use') throw err;
    existed = true;
  }
  await setDoc(doc(db, 'scorers', email), { court: String(court).trim(), tid: tid || '', created: Date.now() });
  return { existed };
}

// ---------- arbitri (admin tornei) ----------
// L'arbitro è un account come quelli dei campi (scorers/{email}, kind 'ref') ma compila il referto solo delle gare
// a cui è assegnato (vmatches.referee = suo uid). Account creato con l'app separata, così l'admin resta collegato.
async function addReferee(name, email, password) {
  if (!canRefs()) throw Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
  // senza email: accesso con il codice (account interno creato qui, l'arbitro non si registra)
  let code = '';
  if (!String(email || '').trim()) { code = newCode(); email = refEmail(code); password = codePass(code); }
  email = email.trim().toLowerCase();
  secondAuth();
  let uid;
  try {
    uid = (await createUserWithEmailAndPassword(second, email, password)).user.uid;
  } catch (err) {
    if (err.code !== 'auth/email-already-in-use') throw err;
    // account già esistente: va bene solo con la sua password e se non è un giocatore registrato
    try { uid = (await signInWithEmailAndPassword(second, email, password)).user.uid; }
    catch (e) { throw Object.assign(new Error('ref-exists'), { code: 'ref-exists' }); }
    const m = await getDoc(doc(db, 'members', uid)).catch(() => null);
    if (m && m.exists()) { await signOut(second); throw Object.assign(new Error('ref-member'), { code: 'ref-member' }); }
  }
  await signOut(second);
  await setDoc(doc(db, 'scorers', email), Object.assign({ kind: 'ref', name: name.trim(), uid, court: '', tid: '', created: Date.now() }, code ? { code } : {}));
  return { uid, code, email };
}
// Nuovo codice per un arbitro: nuovo accesso, le gare designate passano al nuovo, il codice vecchio non entra più
async function renewRefereeCode(oldEmail, oldUid, name) {
  if (!canRefs()) return null;
  const r = await addReferee(name, '', '');
  const batch = writeBatch(db);
  if (oldUid) (await getDocs(query(collection(db, 'vmatches'), where('referee', '==', oldUid)))).docs.forEach(d => batch.update(d.ref, { referee: r.uid, updated: Date.now() }));
  batch.delete(doc(db, 'scorers', oldEmail));
  await batch.commit();
  return r;
}
// Toglie l'arbitro (l'account resta ma non può più fare nulla) e lo toglie dalle gare assegnate
async function removeReferee(email, uid) {
  if (!canRefs()) return;
  const batch = writeBatch(db);
  batch.delete(doc(db, 'scorers', email));
  if (uid) (await getDocs(query(collection(db, 'vmatches'), where('referee', '==', uid)))).docs.forEach(d => batch.update(d.ref, { referee: '', refereeName: '', refConfirmedAt: null, updated: Date.now() }));
  await batch.commit();
}
// Designa, cambia o revoca l'arbitro; restituisce la gara com'era (dal database), per avvisare l'arbitro di prima
async function assignReferee(matchId, uid, name) {
  if (!canRefs()) return null;
  const ref = doc(db, 'vmatches', matchId);
  const before = await getDoc(ref);
  // nuova designazione: la conferma va data di nuovo
  await updateDoc(ref, { referee: uid || '', refereeName: uid ? name || '' : '', refConfirmedAt: null, refDeclinedAt: null, updated: Date.now() });
  return before.exists() ? Object.assign({ id: matchId }, before.data()) : null;
}
// L'arbitro comunica che non può arbitrare la gara: avviso agli admin e ai responsabili arbitri
async function declineReferee(matchId, text) {
  const now = Date.now();
  const batch = writeBatch(db);
  batch.update(doc(db, 'vmatches', matchId), { refDeclinedAt: now, refConfirmedAt: null });
  ['admins', 'refs'].forEach(to => batch.set(doc(collection(db, 'notices')), { to, text: String(text).slice(0, 400), at: now, by: user.uid }));
  await batch.commit();
}
// Gara cambiata (giorno, orario, palestra) dopo la designazione: l'arbitro deve confermare di nuovo
function resetRefereeConfirm(matchId) {
  if (!canRefs()) return Promise.resolve();
  return updateDoc(doc(db, 'vmatches', matchId), { refConfirmedAt: null, refDeclinedAt: null });
}
// Avvisi per l'arbitro (account del campo con kind 'ref'): li riceve anche senza scheda utente
let refNoteUnsub = null;
function listenRefNotices() {
  if (refNoteUnsub) { refNoteUnsub(); refNoteUnsub = null; }
  if (!user || !scorer || scorer.kind !== 'ref') return;
  refNoteUnsub = onSnapshot(query(collection(db, 'notices'), where('to', '==', user.uid)), snap => {
    Store.applyRemote('notices', snap.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => (b.at || 0) - (a.at || 0)));
    refresh();
  }, onError);
}
// L'arbitro conferma la designazione: avviso agli admin e ai responsabili arbitri
async function confirmReferee(matchId, text) {
  const now = Date.now();
  const batch = writeBatch(db);
  batch.update(doc(db, 'vmatches', matchId), { refConfirmedAt: now, refDeclinedAt: null });
  ['admins', 'refs'].forEach(to => batch.set(doc(collection(db, 'notices')), { to, text: String(text).slice(0, 400), at: now, by: user.uid }));
  await batch.commit();
}
// L'arbitro corregge i numeri di maglia di una lista: a parte (nums), la lista dei giocatori non cambia
function saveRosterNums(teamId, nums) {
  return updateDoc(doc(db, 'rosters', teamId), { nums, updated: Date.now() });
}

// Cambia il torneo a cui è legato l'account ('' = tutti i tornei in corso).
function setScorerTournament(email, tid) {
  if (!isAdmin) return Promise.resolve();
  return setDoc(doc(db, 'scorers', email), { tid: tid || '' }, { merge: true });
}

function removeScorer(email) {
  if (!isAdmin) return Promise.resolve();
  return deleteDoc(doc(db, 'scorers', email));
}

window.Cloud = {
  watchLive,
  watchReferti,
  loadPdf,
  openReferto,
  listScorers,
  addReferee,
  renewRefereeCode,
  removeReferee,
  assignReferee,
  confirmReferee,
  declineReferee,
  resetRefereeConfirm,
  saveRosterNums,
  addScorer,
  setScorerTournament,
  removeScorer,
  saveEditorial,
  register,
  updateProfile,
  receiptSign,
  saveReceiptSign,
  completeProfile,
  adminUpdateMember,
  sendMessage,
  deleteMessage,
  markRead,
  setBan,
  saveVTour,
  writeVMatches,
  updateVMatch,
  deleteVTour,
  trashVTour,
  makeTeamCodes,
  codeLogin,
  importRosters,
  approveVMatch,
  importContacts,
  restoreVTour,
  purgeTrash,
  saveTeam,
  importTournaments,
  setTeamStatus,
  deleteTeam,
  saveFreeplay,
  deleteFreeplay,
  setFreeplay,
  setFreeplayBlocks,
  notify,
  dismissNotice,
  resendVerification,
  checkVerified,
  get verified() { return !!(user && (user.emailVerified || manualOk)); },
  setManualVerified,
  adminCreateUser,
  get member() { return member; },
  get scorer() { return scorer; },
  get teamCap() { return teamCap; },
  get coach() { return coach; },
  acceptPrivacy,
  requestDeletion,
  get adminMember() { return adminMember; },
  saveSelfProfile,
  deleteUser,
  saveTraining,
  deleteTraining,
  saveGroups,
  saveAthlete,
  savePlan,
  setAttendance,
  applySpot,
  withdrawSpot,
  seeSpot,
  decideSpot,
  setOccCancelled,
  setOccFree,
  recordPayment,
  voidReceipt,
  renumberReceipts,
  unpay,
  savePack,
  recordIncasso,
  insertIncasso,
  voidIncasso,
  setReceiptHolder,
  loadTrainingRange,
  deletePack,
  setCoach,
  get user() { return user; },
  get isAdmin() { return isAdmin; },
  get roles() { return roles; },
  get tourAdmin() { return canTour(); },
  get refBoss() { return canRefs(); },
  get cashier() { return isAdmin || !!roles.cash; },
  setRole,
  setAdmin,
  push,
  login: (email, password) => signInWithEmailAndPassword(auth, email, password),
  logout: () => { member = null; return signOut(auth); },
  resetPassword: email => sendPasswordResetEmail(auth, email)
};
refresh();
