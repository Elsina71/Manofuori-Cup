// Test delle regole dei tornei a squadre (vtours, vmatches) nell'emulatore Firestore.
// Uso (dalla cartella principale): npm i --no-save @firebase/rules-unit-testing@4 firebase@11, poi
//   npx firebase-tools emulators:exec --only firestore --project demo-vtour "node tests/vtour.rules.test.mjs"
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, writeBatch } from 'firebase/firestore';
import fs from 'fs';
const env = await initializeTestEnvironment({ projectId: 'demo-vtour', firestore: { rules: fs.readFileSync(process.argv[2] || 'firestore.rules', 'utf8'), host: '127.0.0.1', port: 8089 } });
await env.withSecurityRulesDisabled(async c => {
  const db = c.firestore();
  await setDoc(doc(db, 'roles', 'org'), { tour: true });
  await setDoc(doc(db, 'members', 'u1'), { first: 'A', last: 'B', gender: 'M' });
  await setDoc(doc(db, 'scorers', 'campo1@x.it'), { court: '1', tid: 'T1' });
  await setDoc(doc(db, 'scorers', 'campo2@x.it'), { court: '2', tid: 'T2' });
  await setDoc(doc(db, 'scorers', 'tutti@x.it'), { court: '3', tid: '' });
  await setDoc(doc(db, 'vmatches', 'T1_g-A-d1-0'), { tid: 'T1', key: 'g-A-d1-0', home: 'a', away: 'b', sets: [], status: 'sched', date: '2026-11-01' });
});
const org = env.authenticatedContext('org', { email: 'org@x.it', email_verified: true }).firestore();
const user = env.authenticatedContext('u1', { email: 'u1@x.it', email_verified: true }).firestore();
const sc1 = env.authenticatedContext('s1', { email: 'campo1@x.it' }).firestore();
const sc2 = env.authenticatedContext('s2', { email: 'campo2@x.it' }).firestore();
const scAll = env.authenticatedContext('s3', { email: 'tutti@x.it' }).firestore();
const anon = env.unauthenticatedContext().firestore();
const sets = [{ h: 25, a: 20 }, { h: 25, a: 20 }, { h: 20, a: 25 }];
let ok = 0, ko = 0;
const t = async (name, p) => { try { await p; ok++; console.log('✔', name); } catch (e) { ko++; console.log('✘', name, e.message.slice(0, 120)); } };
await t('admin tornei crea il torneo', assertSucceeds(setDoc(doc(org, 'vtours', 'T1'), { name: 'Manofuori Cup MASTER', level: 'MASTER' })));
await t('utente non crea tornei', assertFails(setDoc(doc(user, 'vtours', 'T9'), { name: 'x' })));
await t('tutti leggono tornei e gare', assertSucceeds(getDoc(doc(anon, 'vmatches', 'T1_g-A-d1-0'))));
await t('scorer del torneo inserisce i set', assertSucceeds(updateDoc(doc(sc1, 'vmatches', 'T1_g-A-d1-0'), { sets, status: 'done', by: 'campo1@x.it', updated: 1 })));
await t('scorer di un altro torneo no', assertFails(updateDoc(doc(sc2, 'vmatches', 'T1_g-A-d1-0'), { sets, status: 'done', by: 'campo2@x.it', updated: 2 })));
await t('scorer di tutti i tornei sì', assertSucceeds(updateDoc(doc(scAll, 'vmatches', 'T1_g-A-d1-0'), { sets, status: 'done', by: 'tutti@x.it', updated: 3 })));
await t('scorer inserisce il golden set', assertSucceeds(updateDoc(doc(sc1, 'vmatches', 'T1_g-A-d1-0'), { golden: { h: 15, a: 13 }, by: 'campo1@x.it', updated: 31 })));
await t('scorer non cambia squadre o data', assertFails(updateDoc(doc(sc1, 'vmatches', 'T1_g-A-d1-0'), { home: 'z', by: 'campo1@x.it', updated: 4 })));
await t('scorer non firma a nome di altri', assertFails(updateDoc(doc(sc1, 'vmatches', 'T1_g-A-d1-0'), { sets, status: 'done', by: 'org@x.it', updated: 5 })));
await t('utente registrato non inserisce risultati', assertFails(updateDoc(doc(user, 'vmatches', 'T1_g-A-d1-0'), { sets, status: 'done', by: 'u1@x.it', updated: 6 })));
await t('admin tornei corregge data e palestra', assertSucceeds(updateDoc(doc(org, 'vmatches', 'T1_g-A-d1-0'), { date: '2026-11-08', place: 'Palestra', updated: 7 })));
// referto elettronico: lo scorer del torneo crea referti/live e aggiorna il punteggio (stessi campi di referto-indoor)
const EMPTY = { status: 'ready', sets: [], setsWon: { a: 0, b: 0 }, cur: null, serving: null, winner: null, outcome: null, approvedAt: null };
const openRef = (db, tid, email) => { const b = writeBatch(db), id = `${tid}_g-A-d1-0`;
  b.set(doc(db, 'referti', id), Object.assign({ tid, key: 'g-A-d1-0', a: 'a', b: 'b', court: '1', info: { competition: 'Cup' }, json: '', createdBy: email, createdAt: 1, updated: 1, updatedBy: email, closedAt: null }, EMPTY));
  b.set(doc(db, 'live', id), Object.assign({ tid, key: 'g-A-d1-0', a: 'a', b: 'b', updated: 1 }, EMPTY));
  return b.commit(); };
await t('scorer del torneo apre il referto', assertSucceeds(openRef(sc1, 'T1', 'campo1@x.it')));
await t('scorer di un altro torneo non apre il referto', assertFails(openRef(sc2, 'T1', 'campo2@x.it')));
await t('scorer aggiorna punteggio in diretta e referto', assertSucceeds((() => { const b = writeBatch(sc1), id = 'T1_g-A-d1-0', live = { status: 'live', sets: [{ a: 25, b: 20 }], setsWon: { a: 1, b: 0 }, cur: { a: 3, b: 1 }, serving: 'a', winner: null, outcome: null };
  b.set(doc(sc1, 'live', id), Object.assign({}, live, { updated: 2 }), { merge: true });
  b.set(doc(sc1, 'referti', id), Object.assign({}, live, { json: '{}', updated: 2, updatedBy: 'campo1@x.it' }), { merge: true });
  return b.commit(); })()));
await t('admin tornei legge il proprio ruolo (serve al referto)', assertSucceeds(getDoc(doc(org, 'roles', 'org'))));
await t('admin tornei apre il referto', assertSucceeds(openRef(org, 'T2', 'org@x.it')));
await t('admin tornei legge il referto', assertSucceeds(getDoc(doc(org, 'referti', 'T2_g-A-d1-0'))));
await t('tutti leggono il punteggio in diretta', assertSucceeds(getDoc(doc(anon, 'live', 'T1_g-A-d1-0'))));
await t('il referto completo non è pubblico', assertFails(getDoc(doc(anon, 'referti', 'T1_g-A-d1-0'))));
console.log(`\n${ok} ok, ${ko} falliti`);
await env.cleanup();
process.exit(ko ? 1 : 0);
