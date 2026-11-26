// Avviso "gara senza arbitro": se manca un giorno (24 ore o meno) a una gara e non c'è ancora un arbitro designato,
// manda un avviso agli admin e ai responsabili arbitri (raccolta "notices", come gli altri avvisi dell'app).
// Lo lancia ogni ora il workflow .github/workflows/avvisi-arbitri.yml con l'account di servizio del progetto.
// Ogni gara riceve un solo avviso (segnato in alertsSent/noref-<id>, illeggibile dall'app); se poi un arbitro viene
// designato il segno si toglie, così se la designazione viene revocata l'avviso riparte.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT = process.argv[2];
const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT });
const db = getFirestore(app);
const PROVA = process.env.PROVA_ORA ? Number(process.env.PROVA_ORA) : Date.now(); // solo per le prove

// data e ora "da orologio" di Roma, in minuti: così il confronto con data e orario della gara (ora italiana) è diretto
const romeMinutes = ms => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) / 60000;
};
const matchMinutes = m => {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(m.date || ''); if (!d) return null;
  const t = /^(\d{1,2})[:.](\d{2})/.exec(m.time || '') || [0, 0, 0];
  return Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]) / 60000;
};
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const giorno = d => { const x = /^(\d{4})-(\d{2})-(\d{2})/.exec(d); return x ? `${+x[3]} ${MESI[+x[2] - 1]} ${x[1]}` : d; };

const now = romeMinutes(PROVA);
const [tours, teams, matches] = await Promise.all(['vtours', 'teams', 'vmatches'].map(c => db.collection(c).get()));
const tourById = Object.fromEntries(tours.docs.map(d => [d.id, d.data()]));
const teamName = Object.fromEntries(teams.docs.map(d => [d.id, d.data().name]));
let sent = 0, cleared = 0;
for (const d of matches.docs) {
  const m = d.data(), tour = tourById[m.tid], mark = db.doc(`alertsSent/noref-${d.id}`);
  if (m.referee) { const s = await mark.get(); if (s.exists) { await mark.delete(); cleared++; } continue; }
  if (!tour || tour.status === 'done' || m.status === 'done' || m.status === 'live' || !m.home || !m.away) continue;
  const start = matchMinutes(m);
  if (start == null || start - now > 24 * 60 || start - now < 0) continue;
  const name = id => teamName[id] || (tour.teamNames || {})[id] || '?';
  const text = `Attenzione: gara senza arbitro tra meno di 24 ore. ${name(m.home)} – ${name(m.away)} · ${tour.name} · ${giorno(m.date)} ${m.time || ''} · ${m.place || '—'}. Convoca un arbitro dalla pagina Arbitri.`.slice(0, 400);
  try {
    await db.runTransaction(async tx => {
      if ((await tx.get(mark)).exists) throw new Error('già avvisato');
      const at = Date.now();
      tx.create(mark, { at, match: d.id });
      for (const to of ['admins', 'refs']) tx.create(db.collection('notices').doc(), { to, text, at, by: 'sistema' });
    });
    sent++;
    console.log('avviso:', d.id);
  } catch (e) { if (e.message !== 'già avvisato') throw e; }
}
console.log(`gare controllate: ${matches.size}, nuovi avvisi: ${sent}, segni tolti: ${cleared}`);
