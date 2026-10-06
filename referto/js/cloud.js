// Collegamento del referto al torneo: account dei campi (E-scorer) o amministratori.
// referti/{torneo}_{gara}: un documento per gara con tutti i dati del referto;
// refertiPdf/{torneo}_{gara}: archivio dei PDF; live/{torneo}_{gara}: punteggio pubblico.
import { initializeApp } from '../../vendor/firebase/firebase-app.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, getDocs, writeBatch,
  onSnapshot, collection, query, where, connectFirestoreEmulator
} from '../../vendor/firebase/firebase-firestore.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, connectAuthEmulator
} from '../../vendor/firebase/firebase-auth.js';
import { firebaseConfig } from '../../js/firebase-config.js';

// Stessa app (e stesso accesso) del Championship Manager.
const app = initializeApp(firebaseConfig);
let db;
// Modalità di servizio (creazione dei PDF dentro il Championship Manager): cache solo in memoria,
// così non dipende dalla cache condivisa gestita dalla scheda principale.
const service = new URLSearchParams(location.search).get('build') === '1';
try {
  // Le modifiche fatte senza rete restano in coda e partono appena torna la connessione.
  db = service ? initializeFirestore(app, {}) : initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch (e) {
  db = initializeFirestore(app, {});
}
const auth = getAuth(app);
try {
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && localStorage.getItem('pcm-emulator') === '1') {
    connectFirestoreEmulator(db, location.hostname, 8080);
    connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
  }
} catch (e) { /* ignore */ }

// Chi è collegato: { email, role: 'admin' | 'scorer' | null, court }
let who = null;
async function resolveUser(u) {
  if (!u) return { email: null, role: null };
  const email = (u.email || '').toLowerCase();
  // admin: lo decide il database (admins/probe è leggibile soltanto da un admin)
  let admin = false;
  try { await getDoc(doc(db, 'admins', 'probe')); admin = true; } catch (e) { admin = false; }
  if (admin) return { email, role: 'admin' };
  try {
    const sc = await getDoc(doc(db, 'scorers', email));
    if (sc.exists()) return { email, role: 'scorer', court: sc.data().court };
  } catch (e) { /* senza rete e senza cache */ }
  return { email, role: null };
}
let firstAuth;
const authReady = new Promise(resolve => { firstAuth = resolve; });
onAuthStateChanged(auth, async u => { who = await resolveUser(u); firstAuth(); });

async function whoami() { await authReady; return who; }
async function login(email, password) {
  await signInWithEmailAndPassword(auth, email.trim(), password);
  who = await resolveUser(auth.currentUser);
  return who;
}
const logout = () => signOut(auth);

async function load(id) {
  const snap = await getDoc(doc(db, 'referti', id));
  if (!snap.exists()) throw Object.assign(new Error('not-found'), { code: 'not-found' });
  return snap.data();
}

// Salva il referto (dati completi) e il punteggio pubblico insieme.
function push(id, live, ref) {
  const now = Date.now();
  const batch = writeBatch(db);
  batch.set(doc(db, 'live', id), Object.assign({}, live, { updated: now }), { merge: true });
  batch.set(doc(db, 'referti', id), Object.assign({}, live, ref, { updated: now, updatedBy: who && who.email || '' }), { merge: true });
  return batch.commit();
}

function watch(id, cb) {
  return onSnapshot(doc(db, 'referti', id), snap => cb(snap.exists() ? snap.data() : null), () => {});
}

async function list(tid) {
  const snap = await getDocs(query(collection(db, 'referti'), where('tid', '==', tid)));
  return snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
}

// PDF in base64: refertiPdf/{id} contiene solo i dati del file (nome, versione, stato),
// il contenuto è in refertiPdf/{id}_1, _2… (parti da ~700 kB, limite di 1 MB per documento).
const PART = 700000;
function savePdf(id, meta, b64) {
  const parts = Math.max(1, Math.ceil(b64.length / PART));
  const common = { tid: meta.tid, key: meta.key, ref: id, status: meta.status, version: meta.version, name: meta.name, parts, updated: Date.now() };
  const batch = writeBatch(db);
  batch.set(doc(db, 'refertiPdf', id), Object.assign({ part: 0, data: '' }, common));
  for (let i = 1; i <= parts; i++) {
    batch.set(doc(db, 'refertiPdf', `${id}_${i}`), Object.assign({}, common, { part: i, data: b64.slice((i - 1) * PART, i * PART) }));
  }
  return batch.commit();
}

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
  return { name: f.name, version: f.version, status: f.status, data };
}

// Elenco dei PDF archiviati di un torneo (solo i dati dei file, senza contenuto).
async function listPdf(tid) {
  const snap = await getDocs(query(collection(db, 'refertiPdf'), where('tid', '==', tid), where('part', '==', 0)));
  return snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
}

window.RefCloud = { whoami, login, logout, load, push, watch, list, savePdf, loadPdf, listPdf };
window.dispatchEvent(new Event('refcloud-ready'));
