// Test delle regole delle squadre (teams, rosters) nell'emulatore Firestore.
// Uso (dalla cartella principale): npm i --no-save @firebase/rules-unit-testing@4 firebase@11, poi
//   npx firebase-tools emulators:exec --only firestore --project demo-teams "node tests/teams.rules.test.mjs"
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, query, collection, where, writeBatch } from 'firebase/firestore';
import fs from 'fs';
const env = await initializeTestEnvironment({ projectId: 'demo-teams', firestore: { rules: fs.readFileSync(process.argv[2] || 'firestore.rules', 'utf8'), host: '127.0.0.1', port: 8089 } });
await env.withSecurityRulesDisabled(async c => {
  const db = c.firestore();
  for (const u of ['cap', 'other']) await setDoc(doc(db, 'members', u), { first: 'A', last: 'B', gender: 'M' });
  await setDoc(doc(db, 'roles', 'org'), { tour: true });
  await setDoc(doc(db, 'roles', 'cap'), { captain: true });
});
const cap = env.authenticatedContext('cap', { email_verified: true }).firestore();
const other = env.authenticatedContext('other', { email_verified: true }).firestore();
const org = env.authenticatedContext('org', { email_verified: true }).firestore();
const anon = env.unauthenticatedContext().firestore();
const team = { name: 'Fenicotteri', level: 'MASTER', kind: 'X', captainUid: 'cap', captainName: 'B A', status: 'pending', created: 1, updated: 1 };
let ok = 0, ko = 0;
const t = async (name, p) => { try { await p; ok++; console.log('✔', name); } catch (e) { ko++; console.log('✘', name, e.message.slice(0, 120)); } };
const batchSave = (db, id, tm, players, upd) => { const b = writeBatch(db); upd ? b.update(doc(db, 'teams', id), tm) : b.set(doc(db, 'teams', id), tm); b.set(doc(db, 'rosters', id), { captainUid: 'cap', players, updated: 2 }); return b.commit(); };
await t('capitano crea squadra in attesa con rosa', assertSucceeds(batchSave(cap, 't1', team, [{ num: 7, last: 'R', first: 'M', g: 'M' }])));
await t('utente registrato non abilitato come capitano: niente iscrizione', assertFails(setDoc(doc(other, 'teams', 't6'), { ...team, captainUid: 'other' })));
await t('capitano non crea squadra già ammessa', assertFails(setDoc(doc(cap, 'teams', 't2'), { ...team, status: 'ok' })));
await t('non si crea squadra per un altro capitano', assertFails(setDoc(doc(other, 'teams', 't3'), team)));
await t('email non confermata: niente iscrizione', assertFails(setDoc(doc(env.authenticatedContext('other', { email_verified: false }).firestore(), 'teams', 't4'), { ...team, captainUid: 'other' })));
await t('tutti leggono le squadre', assertSucceeds(getDoc(doc(anon, 'teams', 't1'))));
await t('altri non leggono la rosa', assertFails(getDoc(doc(other, 'rosters', 't1'))));
await t('anonimo non legge la rosa', assertFails(getDoc(doc(anon, 'rosters', 't1'))));
await t('capitano legge le sue rose (query)', assertSucceeds(getDocs(query(collection(cap, 'rosters'), where('captainUid', '==', 'cap')))));
await t('capitano cambia livello in attesa', assertSucceeds(updateDoc(doc(cap, 'teams', 't1'), { level: 'DINOS', updated: 3 })));
await t('capitano non si auto-ammette', assertFails(updateDoc(doc(cap, 'teams', 't1'), { status: 'ok' })));
await t('altri non modificano la rosa', assertFails(setDoc(doc(other, 'rosters', 't1'), { captainUid: 'other', players: [], updated: 3 })));
await t('admin tornei ammette la squadra', assertSucceeds(updateDoc(doc(org, 'teams', 't1'), { status: 'ok', updated: 4 })));
await t('admin tornei legge la rosa', assertSucceeds(getDoc(doc(org, 'rosters', 't1'))));
await t('ammessa: capitano non cambia livello', assertFails(updateDoc(doc(cap, 'teams', 't1'), { level: 'SUPER 10', updated: 5 })));
await t('ammessa: capitano cambia nome e rosa', assertSucceeds(batchSave(cap, 't1', { name: 'Fenicotteri Rosa', level: 'DINOS', kind: 'X', captainUid: 'cap', updated: 6 }, [{ num: 1, last: 'X', first: 'Y', g: 'F' }], true)));
await t('ammessa: capitano non la ritira', assertFails(deleteDoc(doc(cap, 'teams', 't1'))));
await t('admin tornei elimina squadra e rosa', assertSucceeds((() => { const b = writeBatch(org); b.delete(doc(org, 'rosters', 't1')); b.delete(doc(org, 'teams', 't1')); return b.commit(); })()));
await t('capitano crea e ritira in attesa', assertSucceeds((async () => { await batchSave(cap, 't5', team, []); const b = writeBatch(cap); b.delete(doc(cap, 'rosters', 't5')); b.delete(doc(cap, 'teams', 't5')); await b.commit(); })()));
console.log(`\n${ok} ok, ${ko} falliti`);
await env.cleanup();
process.exit(ko ? 1 : 0);
