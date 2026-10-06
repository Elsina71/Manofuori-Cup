// Test del motore delle regole: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/rules.js');

const T = '2026-01-01T10:00:00.000Z';
const start = (serving, left, order) => ({ type: 'setStart', serving, left, order: order || { A: [0, 1], B: [0, 1] }, time: T });
const pts = seq => seq.split('').map(team => ({ type: 'point', team, time: T }));
const match = events => ({ settings: {}, events });

test('rotazione del servizio: I, II, III, IV', () => {
  // A serve per prima con il giocatore 2 (indice 1), B con il giocatore 1
  const st = R.replay(match([start('A', 'A', { A: [1, 0], B: [0, 1] }), ...pts('ABABA')]));
  const turns = st.cur.turns.map(t => `${t.team}${t.player + 1}${t.pos}`);
  assert.deepEqual(turns, ['A2I', 'B1II', 'A1III', 'B2IV', 'A2I']);
  // il punto conquistato in cambio palla appartiene al nuovo turno
  assert.deepEqual(st.cur.turns.map(t => t.end), [1, 1, 2, 2, null]);
});

test('il servizio resta al giocatore finché la squadra vince', () => {
  const st = R.replay(match([start('B', 'A'), ...pts('BBBA')]));
  assert.equal(st.cur.score.B, 3);
  assert.equal(st.cur.turns[0].end, 3);
  assert.equal(st.cur.serving, 'A');
  assert.equal(st.cur.turn.pos, 'II');
});

test('cambio campo ogni 7 punti e fine set a 21 con 2 di scarto', () => {
  const st = R.replay(match([start('A', 'A'), ...pts('A'.repeat(20) + 'B'.repeat(20))]));
  assert.equal(st.phase, 'play');
  assert.deepEqual(st.cur.switches.map(s => s.A + s.B), [7, 14, 21, 28, 35]);
  assert.equal(st.cur.left, 'B'); // 5 cambi
  const st2 = R.replay(match([start('A', 'A'), ...pts('A'.repeat(20) + 'B'.repeat(20) + 'AB' + 'AA')]));
  assert.equal(st2.phase, 'setEnd');
  assert.equal(st2.sets[0].winner, 'A');
  assert.deepEqual(st2.sets[0].score, { A: 23, B: 21 });
  assert.equal(st2.setsWon.A, 1);
});

test('gara al meglio di 3, set decisivo a 15 con cambi ogni 5', () => {
  const ev = [start('A', 'A'), ...pts('A'.repeat(21)), start('B', 'B'), ...pts('B'.repeat(21)), start('A', 'A'), ...pts('A'.repeat(14) + 'B')];
  let st = R.replay(match(ev));
  assert.equal(st.sets[2].target, 15);
  assert.deepEqual(st.sets[2].switches.map(s => s.A + s.B), [5, 10, 15]);
  st = R.replay(match([...ev, ...pts('A')]));
  assert.equal(st.phase, 'matchEnd');
  assert.equal(st.winner, 'A');
  assert.deepEqual(st.setsWon, { A: 2, B: 1 });
});

test('set 2: sceglie la squadra che ha perso il sorteggio del set 1', () => {
  const e = start('A', 'B', { A: [1, 0], B: [0, 1] });
  e.toss = { chooser: 'B', choice: 'receive', otherChoice: null, draw: true };
  const m = match([e, ...pts('A'.repeat(21))]);
  const d = R.nextSetDefaults(m, R.replay(m));
  assert.equal(d.needsToss, false);
  assert.equal(d.chooser, 'A');
  assert.deepEqual(d.order, { A: [1, 0], B: [0, 1] });
});

test('set decisivo: nuovo sorteggio', () => {
  const m = match([start('A', 'A'), ...pts('A'.repeat(21)), start('B', 'B'), ...pts('B'.repeat(21))]);
  assert.equal(R.nextSetDefaults(m, R.replay(m)).needsToss, true);
});

test('chi serve in base alle scelte', () => {
  assert.equal(R.servingFromChoice('A', 'serve'), 'A');
  assert.equal(R.servingFromChoice('A', 'receive'), 'B');
  assert.equal(R.servingFromChoice('A', 'side', null), null);
  assert.equal(R.servingFromChoice('A', 'side', 'serve'), 'B');
  assert.equal(R.servingFromChoice('A', 'side', 'receive'), 'A');
});

test('tempo tecnico attivo di default', () => {
  assert.equal(R.DEFAULT_SETTINGS.tto, true);
});

test('penalizzazione: punto e servizio agli avversari', () => {
  const st = R.replay(match([start('A', 'A'), { type: 'sanction', team: 'A', player: 0, kind: 'P', time: T }]));
  assert.deepEqual(st.cur.score, { A: 0, B: 1 });
  assert.equal(st.cur.serving, 'B');
  assert.equal(st.cur.points.B[0].by, 'penalty');
  assert.equal(st.sanctions.length, 1);
});

test('tempo tecnico a 21 punti totali', () => {
  const m = { settings: { tto: true }, events: [start('A', 'A'), ...pts('AB'.repeat(10) + 'A')] };
  const st = R.replay(m);
  assert.deepEqual(st.cur.tto, { A: 11, B: 10 });
  assert.deepEqual(st.alerts.map(a => a.type), ['switch', 'tto']);
});

test('ritiro: set in corso e set rimanenti assegnati', () => {
  const st = R.replay(match([start('A', 'A'), ...pts('AAB'), { type: 'forfeit', team: 'A', reason: 'INJ', time: T }]));
  assert.equal(st.phase, 'matchEnd');
  assert.equal(st.winner, 'B');
  assert.deepEqual(st.sets.map(s => [s.score.A, s.score.B]), [[2, 21], [0, 21]]);
});

test('espulsione: set perso, la gara continua', () => {
  const st = R.replay(match([start('A', 'A'), ...pts('A'.repeat(20) + 'B'.repeat(19)), { type: 'sanction', team: 'A', player: 1, kind: 'E', time: T }]));
  assert.deepEqual(st.sets[0].score, { A: 20, B: 22 });
  assert.equal(st.phase, 'setEnd');
});

test('set unico', () => {
  const st = R.replay({ settings: { bestOf: 1, points: 21 }, events: [start('A', 'A'), ...pts('A'.repeat(21))] });
  assert.equal(st.phase, 'matchEnd');
});

test('al meglio dei 5: 3 set per vincere, decisivo al quinto', () => {
  const S = { bestOf: 5, points: 21, tiePoints: 15 };
  const ev = [];
  ['A', 'B', 'A', 'B'].forEach((w, i) => { ev.push(start(i % 2 ? 'B' : 'A', 'A'), ...pts(w.repeat(21))); });
  let st = R.replay({ settings: S, events: ev });
  assert.equal(st.phase, 'setEnd');
  assert.equal(R.nextSetDefaults({}, st).needsToss, true);
  st = R.replay({ settings: S, events: [...ev, start('A', 'A'), ...pts('A'.repeat(15))] });
  assert.equal(st.phase, 'matchEnd');
  assert.deepEqual(st.setsWon, { A: 3, B: 2 });
});

test('le scelte si alternano nei set senza sorteggio', () => {
  const e1 = start('A', 'A'); e1.toss = { chooser: 'B', choice: 'receive', draw: true };
  const e2 = start('B', 'B'); e2.toss = { chooser: 'A', choice: 'receive', draw: false };
  const S = { bestOf: 5 };
  const st = R.replay({ settings: S, events: [e1, ...pts('A'.repeat(21)), e2, ...pts('A'.repeat(21))] });
  assert.equal(R.nextSetDefaults({}, st).chooser, 'B');
});
