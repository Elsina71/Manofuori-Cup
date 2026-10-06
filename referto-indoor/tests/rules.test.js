// Test del motore delle regole: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/rules.js');

const T = '2026-01-01T10:00:00.000Z';
const LA = [1, 2, 3, 4, 5, 6];
const LB = [11, 12, 13, 14, 15, 16];
const start = (serving, left, lineup) => ({ type: 'setStart', serving, left, lineup: lineup || { A: LA, B: LB }, time: T });
const pts = seq => seq.split('').map(team => ({ type: 'point', team, time: T }));
const sub = (team, out, inn, exceptional) => ({ type: 'sub', team, out, in: inn, exceptional, time: T });
const match = (events, settings) => ({ settings: settings || {}, events });

test('serve il giocatore in posizione I; chi riceve ruota quando conquista il servizio', () => {
  let st = R.replay(match([start('A', 'A')]));
  assert.equal(st.cur.turn.player, 1);
  assert.deepEqual(R.courtOf(st.cur, 'B'), LB);
  st = R.replay(match([start('A', 'A'), ...pts('B')]));
  // B conquista il servizio: ruota, il giocatore in II (12) va al servizio
  assert.equal(st.cur.serving, 'B');
  assert.equal(st.cur.turn.player, 12);
  assert.deepEqual(R.courtOf(st.cur, 'B'), [12, 13, 14, 15, 16, 11]);
  // A non ruota finché non riconquista il servizio
  assert.deepEqual(R.courtOf(st.cur, 'A'), LA);
  st = R.replay(match([start('A', 'A'), ...pts('BA')]));
  assert.equal(st.cur.turn.player, 2);
});

test('il servizio resta allo stesso giocatore finché la squadra vince l\'azione', () => {
  const st = R.replay(match([start('A', 'A'), ...pts('AAAB')]));
  assert.equal(st.cur.turns[0].player, 1);
  assert.equal(st.cur.turns[0].end, 3);
  assert.deepEqual(st.cur.score, { A: 3, B: 1 });
});

test('dopo 6 cambi palla vinti la squadra torna alla formazione iniziale', () => {
  const st = R.replay(match([start('B', 'A'), ...pts('ABABABABABAB')]));
  assert.deepEqual(R.courtOf(st.cur, 'A'), LA);
  assert.equal(st.cur.turns.filter(t => t.team === 'A').map(t => t.player).join(','), '2,3,4,5,6,1');
});

test('set a 25 con 2 punti di scarto', () => {
  let st = R.replay(match([start('A', 'A'), ...pts('A'.repeat(24) + 'B'.repeat(24) + 'A')]));
  assert.equal(st.phase, 'play');
  st = R.replay(match([start('A', 'A'), ...pts('A'.repeat(24) + 'B'.repeat(24) + 'AA')]));
  assert.equal(st.phase, 'setEnd');
  assert.deepEqual(st.sets[0].score, { A: 26, B: 24 });
  assert.equal(st.setsWon.A, 1);
});

test('al meglio dei 5: fine gara a 3 set, quinto set a 15 con cambio campo a 8', () => {
  const ev = [];
  ['A', 'B', 'A', 'B'].forEach((w, i) => ev.push(start(i % 2 ? 'B' : 'A', i % 2 ? 'B' : 'A'), ...pts(w.repeat(25))));
  ev.push(start('A', 'A'), ...pts('A'.repeat(7) + 'B'.repeat(7) + 'A'));
  let st = R.replay(match(ev));
  assert.equal(st.sets[4].target, 15);
  assert.equal(st.cur.switched, true);
  assert.deepEqual(st.cur.switchScore, { A: 8, B: 7 });
  assert.equal(st.cur.left, 'B');
  st = R.replay(match([...ev, ...pts('A'.repeat(7))]));
  assert.equal(st.phase, 'matchEnd');
  assert.equal(st.winner, 'A');
  assert.deepEqual(st.setsWon, { A: 3, B: 2 });
});

test('al meglio dei 3 con terzo set a 15', () => {
  const S = { sets: 3 };
  const ev = [start('A', 'A'), ...pts('A'.repeat(25)), start('B', 'B'), ...pts('A'.repeat(25))];
  const st = R.replay(match(ev, S));
  assert.equal(st.phase, 'matchEnd');
  assert.equal(st.sets.length, 2);
  assert.equal(R.targetOf(R.settingsOf(match([], S)), 2), 15);
});

test('set fissi: si giocano tutti i set, anche con pareggio', () => {
  const S = { mode: 'fixed', sets: 2, lastPoints: 25 };
  let st = R.replay(match([start('A', 'A'), ...pts('A'.repeat(25)), start('B', 'B'), ...pts('B'.repeat(25))], S));
  assert.equal(st.phase, 'matchEnd');
  assert.equal(st.winner, null);
  assert.equal(st.draw, true);
  st = R.replay(match([start('A', 'A'), ...pts('A'.repeat(25)), start('B', 'B'), ...pts('A'.repeat(25))], S));
  assert.equal(st.winner, 'A');
});

test('punteggio massimo (cap)', () => {
  const st = R.replay(match([start('A', 'A'), ...pts('A'.repeat(24) + 'B'.repeat(24) + 'ABABA')], { cap: 27 }));
  assert.equal(st.phase, 'setEnd');
  assert.deepEqual(st.sets[0].score, { A: 27, B: 26 });
});

test('set successivo: serve chi ha ricevuto per primo e si cambia campo', () => {
  const m = match([start('A', 'A'), ...pts('A'.repeat(25))]);
  const d = R.nextSetDefaults(m, R.replay(m));
  assert.equal(d.needsToss, false);
  assert.equal(d.serving, 'B');
  assert.equal(d.left, 'B');
  assert.deepEqual(d.lineup, { A: LA, B: LB });
});

test('set decisivo: nuovo sorteggio', () => {
  const S = { sets: 3 };
  const m = match([start('A', 'A'), ...pts('A'.repeat(25)), start('B', 'B'), ...pts('B'.repeat(25))], S);
  assert.equal(R.nextSetDefaults(m, R.replay(m)).needsToss, true);
});

test('chi serve in base alle scelte del sorteggio', () => {
  assert.equal(R.servingFromChoice('A', 'serve'), 'A');
  assert.equal(R.servingFromChoice('A', 'receive'), 'B');
  assert.equal(R.servingFromChoice('A', 'side', null), null);
  assert.equal(R.servingFromChoice('A', 'side', 'serve'), 'B');
});

test('sostituzione regolare: il titolare rientra solo al posto del suo sostituto', () => {
  const ev = [start('A', 'A'), sub('A', 3, 7)];
  let st = R.replay(match(ev));
  assert.deepEqual(R.courtOf(st.cur, 'A'), [1, 2, 7, 4, 5, 6]);
  assert.equal(st.cur.regSubs.A, 1);
  // 7 può essere sostituito solo da 3
  assert.deepEqual(R.subOptions(st, 'A', 7, [1, 2, 3, 4, 5, 6, 7, 8, 9]).regular, [3]);
  st = R.replay(match([...ev, sub('A', 7, 8)]));
  assert.deepEqual(st.rejected, [2]);
  st = R.replay(match([...ev, sub('A', 7, 3)]));
  assert.deepEqual(R.courtOf(st.cur, 'A'), LA);
  // il titolare rientrato non può più uscire con una sostituzione regolare, né 7 rientrare
  assert.deepEqual(R.subOptions(st, 'A', 3, [1, 2, 3, 4, 5, 6, 7, 8, 9]).regular, []);
  assert.deepEqual(R.subOptions(st, 'A', 4, [1, 2, 3, 4, 5, 6, 7, 8, 9]).regular, [8, 9]);
});

test('la sostituzione segue la rotazione: il giocatore resta nella colonna del titolare', () => {
  const st = R.replay(match([start('B', 'A'), sub('A', 3, 7), ...pts('A')]));
  assert.deepEqual(R.courtOf(st.cur, 'A'), [2, 7, 4, 5, 6, 1]);
  assert.equal(R.positionOf(st.cur, 'A', 7), 1);
});

test('massimo 6 sostituzioni regolari per set', () => {
  const ev = [start('A', 'A'), sub('A', 1, 7), sub('A', 2, 8), sub('A', 3, 9), sub('A', 7, 1), sub('A', 8, 2), sub('A', 9, 3), sub('A', 4, 10)];
  const st = R.replay(match(ev));
  assert.equal(st.cur.regSubs.A, 6);
  assert.deepEqual(st.rejected, [7]);
});

test('sostituzione eccezionale: non conta e chi esce non rientra più nella gara', () => {
  const st = R.replay(match([start('A', 'A'), sub('A', 2, 9, true)]));
  assert.equal(st.cur.regSubs.A, 0);
  assert.equal(st.barredMatch.A[2], true);
  const st2 = R.replay(match([start('A', 'A'), sub('A', 2, 9, true), sub('A', 9, 2, true)]));
  assert.deepEqual(st2.rejected, [2]);
});

test('penalizzazione: punto e servizio agli avversari, che ruotano', () => {
  const st = R.replay(match([start('A', 'A'), { type: 'sanction', team: 'A', player: 1, kind: 'P', time: T }]));
  assert.deepEqual(st.cur.score, { A: 0, B: 1 });
  assert.equal(st.cur.serving, 'B');
  assert.equal(st.cur.turn.player, 12);
});

test('espulsione di un giocatore in campo: va sostituito e non può rientrare nel set', () => {
  let st = R.replay(match([start('A', 'A'), { type: 'sanction', team: 'A', player: 4, kind: 'E', time: T }]));
  assert.deepEqual(st.alerts, [{ type: 'mustSub', team: 'A', player: 4 }]);
  st = R.replay(match([start('A', 'A'), { type: 'sanction', team: 'A', player: 4, kind: 'E', time: T }, sub('A', 4, 8)]));
  assert.deepEqual(R.courtOf(st.cur, 'A'), [1, 2, 3, 8, 5, 6]);
  assert.deepEqual(R.subOptions(st, 'A', 8, [1, 2, 3, 4, 5, 6, 7, 8]).regular, []);
});

test('time-out: massimo 2 per set', () => {
  const to = { type: 'timeout', team: 'B', time: T };
  const st = R.replay(match([start('A', 'A'), to, to, to]));
  assert.equal(st.cur.timeouts.B.length, 2);
  assert.deepEqual(st.rejected, [3]);
});

test('squadra incompleta: perde il set', () => {
  const st = R.replay(match([start('A', 'A'), ...pts('AAB'), { type: 'incomplete', team: 'B', time: T }]));
  assert.deepEqual(st.sets[0].score, { A: 25, B: 1 });
  assert.equal(st.sets[0].winner, 'A');
});

test('rinuncia: gara agli avversari con i set mancanti assegnati', () => {
  const st = R.replay(match([start('A', 'A'), ...pts('BBB'), { type: 'forfeit', team: 'A', time: T }], { sets: 3 }));
  assert.equal(st.phase, 'matchEnd');
  assert.equal(st.winner, 'B');
  assert.deepEqual(st.sets.map(s => [s.score.A, s.score.B]), [[0, 25], [0, 25]]);
});

test('formazione non valida: il set non parte', () => {
  const st = R.replay(match([start('A', 'A', { A: [1, 2, 3, 4, 5, 5], B: LB })]));
  assert.equal(st.phase, 'toss');
  assert.deepEqual(st.rejected, [0]);
});

test('pallavolo mista: almeno 2 donne in campo di default', () => {
  assert.equal(R.DEFAULT_SETTINGS.minWomen, 2);
});

const libIn = (team, libero, out) => ({ type: 'liberoIn', team, libero, out, time: T });

test('libero: entra in seconda linea al posto del giocatore, che esce dal campo', () => {
  // B riceve: il libero 20 entra al posto del 15 (posto V)
  const st = R.replay(match([start('A', 'A'), libIn('B', 20, 15)]));
  assert.deepEqual(R.visibleCourt(st.cur, 'B'), [11, 12, 13, 14, 20, 16]);
  assert.deepEqual(R.courtOf(st.cur, 'B'), LB);  // la rotazione resta quella dei 6
  // il giocatore sostituito dal libero non si può sostituire
  assert.deepEqual(R.subOptions(st, 'B', 15, [11, 12, 13, 14, 15, 16, 17]).regular, []);
});

test('libero: non in prima linea e non al servizio', () => {
  let st = R.replay(match([start('A', 'A'), libIn('A', 20, 2)]));      // posto II
  assert.deepEqual(st.rejected, [1]);
  st = R.replay(match([start('A', 'A'), libIn('A', 20, 1)]));          // posto I, ma A serve
  assert.deepEqual(st.rejected, [1]);
  st = R.replay(match([start('A', 'A'), libIn('B', 20, 11)]));         // posto I, B riceve: consentito
  assert.deepEqual(st.rejected, []);
});

test('libero: esce da solo quando la rotazione lo porta in prima linea', () => {
  // il libero entra al posto del 15 (V); al primo cambio palla vinto da B va in IV ed esce
  let st = R.replay(match([start('A', 'A'), libIn('B', 20, 15)]));
  st = R.replay(match([start('A', 'A'), libIn('B', 20, 15), ...pts('B')]));
  assert.equal(st.cur.libero.B, null);
  assert.deepEqual(st.alerts, [{ type: 'liberoOut', team: 'B', libero: 20, back: 15, reason: 'front' }]);
  assert.deepEqual(R.visibleCourt(st.cur, 'B'), [12, 13, 14, 15, 16, 11]);
  // al posto I quando la squadra riceve: dopo il cambio palla va in VI e resta
  st = R.replay(match([start('A', 'A'), libIn('B', 20, 11), ...pts('B')]));
  assert.deepEqual(R.visibleCourt(st.cur, 'B'), [12, 13, 14, 15, 16, 20]);
});

test('libero: uscita a mano e cambio tra i due liberi', () => {
  let st = R.replay(match([start('A', 'A'), libIn('B', 20, 16), libIn('B', 21, 20)]));
  assert.deepEqual(R.visibleCourt(st.cur, 'B'), [11, 12, 13, 14, 15, 21]);
  st = R.replay(match([start('A', 'A'), libIn('B', 20, 16), { type: 'liberoOut', team: 'B', time: T }]));
  assert.deepEqual(R.visibleCourt(st.cur, 'B'), LB);
  // un solo libero in campo alla volta
  st = R.replay(match([start('A', 'A'), libIn('B', 20, 16), libIn('B', 21, 15)]));
  assert.deepEqual(st.rejected, [2]);
});

test('libero espulso: esce e rientra il giocatore sostituito', () => {
  const st = R.replay(match([start('A', 'A'), libIn('B', 20, 16), { type: 'sanction', team: 'B', player: 20, kind: 'E', time: T }]));
  assert.equal(st.cur.libero.B, null);
  assert.deepEqual(R.visibleCourt(st.cur, 'B'), LB);
  assert.deepEqual(st.alerts.map(a => a.type), ['liberoOut']);
});
