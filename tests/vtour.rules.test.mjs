// Test delle regole dei tornei a squadre (vtours, vmatches) nell'emulatore Firestore.
// Uso (dalla cartella principale): npm i --no-save @firebase/rules-unit-testing@4 firebase@11, poi
//   npx firebase-tools emulators:exec --only firestore --project demo-vtour "node tests/vtour.rules.test.mjs"
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc } from 'firebase/firestore';
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
await t('referto elettronico: lo scorer scrive il risultato alla chiusura (anche golden azzerato)', assertSucceeds(updateDoc(doc(sc1, 'vmatches', 'T1_g-A-d1-0'), { sets, status: 'done', by: 'campo1@x.it', updated: 32, golden: null })));
await t('scorer non cambia squadre o data', assertFails(updateDoc(doc(sc1, 'vmatches', 'T1_g-A-d1-0'), { home: 'z', by: 'campo1@x.it', updated: 4 })));
await t('scorer non firma a nome di altri', assertFails(updateDoc(doc(sc1, 'vmatches', 'T1_g-A-d1-0'), { sets, status: 'done', by: 'org@x.it', updated: 5 })));
await t('utente registrato non inserisce risultati', assertFails(updateDoc(doc(user, 'vmatches', 'T1_g-A-d1-0'), { sets, status: 'done', by: 'u1@x.it', updated: 6 })));
await t('admin tornei corregge data e palestra', assertSucceeds(updateDoc(doc(org, 'vmatches', 'T1_g-A-d1-0'), { date: '2026-11-08', place: 'Palestra', updated: 7 })));
console.log(`\n${ok} ok, ${ko} falliti`);
await env.cleanup();
process.exit(ko ? 1 : 0);
