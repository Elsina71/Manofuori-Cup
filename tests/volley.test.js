// Test del motore dei tornei a squadre: node --test tests/volley.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../js/volley.js');

const done = (home, away, sets, extra) => Object.assign({ home, away, sets, status: 'done' }, extra || {});

test('set valido: 25 con due di scarto, oltre il 25 scarto esatto di 2', () => {
  assert.ok(V.setOk(25, 23, 25));
  assert.ok(V.setOk(10, 25, 25));
  assert.ok(V.setOk(27, 25, 25));
  assert.ok(!V.setOk(25, 24, 25));
  assert.ok(!V.setOk(28, 25, 25));
  assert.ok(!V.setOk(24, 20, 25));
  assert.ok(V.setOk(15, 13, 15));
  assert.ok(!V.setOk(15, 14, 15));
});

test('gara dei gironi: sempre 3 set; al meglio dei 5 si chiude a 3 set con il quinto a 15', () => {
  assert.equal(V.checkSets([[25, 20], [25, 20], [20, 25]], '3'), null);
  assert.equal(V.checkSets([[25, 20], [25, 20], [25, 20]], '3'), null);   // anche 3-0: si gioca il terzo set
  assert.equal(V.checkSets([[25, 20], [25, 20]], '3'), 'vThreeSets');
  assert.equal(V.checkSets([[25, 20], [25, 20], [25, 24]], '3'), 'vBadSet');
  assert.equal(V.checkSets([[25, 20], [20, 25], [25, 20], [20, 25], [15, 12]], 'bo5'), null);
  assert.equal(V.checkSets([[25, 20], [25, 20], [25, 20]], 'bo5'), null);
  assert.equal(V.checkSets([[25, 20], [25, 20], [25, 20], [25, 20]], 'bo5'), 'vTooManySets');
  assert.equal(V.checkSets([[25, 20], [20, 25], [25, 20], [20, 25], [15, 14]], 'bo5'), 'vBadSet15');
  assert.equal(V.checkSets([[25, 20], [20, 25], [25, 20], [20, 25], [17, 15]], 'bo5'), null);   // quinto set ai vantaggi
  assert.equal(V.checkSets([[25, 20], [20, 25]], 'bo5'), 'vNotFinished');
});

test('calendario: tutti contro tutti, andata e ritorno a campi invertiti', () => {
  const teams = ['a', 'b', 'c', 'd', 'e'];
  const one = V.roundRobin(teams, 'a');
  assert.equal(one.length, 10);
  assert.equal(new Set(one.map(m => m.day)).size, 5);   // 5 squadre: 5 giornate, una squadra riposa
  const pairs = new Set(one.map(m => [m.home, m.away].sort().join('-')));
  assert.equal(pairs.size, 10);
  // nessuna squadra gioca due volte nella stessa giornata
  for (let d = 1; d <= 5; d++) {
    const ids = one.filter(m => m.day === d).flatMap(m => [m.home, m.away]);
    assert.equal(ids.length, new Set(ids).size);
  }
  const ar = V.roundRobin(['a', 'b', 'c', 'd'], 'ar');
  assert.equal(ar.length, 12);
  assert.equal(Math.max(...ar.map(m => m.day)), 6);
  ar.filter(m => m.leg === 1).forEach(m => assert.ok(ar.some(x => x.leg === 2 && x.home === m.away && x.away === m.home)));
  // casa e trasferta equilibrate: al massimo una gara in casa di differenza, mai più di 2 di fila in casa o fuori
  for (let n = 3; n <= 14; n++) {
    const ids = [...Array(n).keys()].map(String), m = V.roundRobin(ids, 'a');
    const hs = ids.map(i => m.filter(x => x.home === i).length);
    assert.ok(Math.max(...hs) - Math.min(...hs) <= 1, `squadre ${n}`);
    ids.forEach(i => {
      const seq = m.filter(x => x.home === i || x.away === i).sort((a, b) => a.day - b.day).map(x => (x.home === i ? 'H' : 'A')).join('');
      assert.ok(!/HHH|AAA/.test(seq), `squadre ${n}, squadra ${i}: ${seq}`);
    });
  }
});

test('classifica: 1 punto per set vinto; parità decisa da gare vinte, quoziente set, quoziente punti, incontri diretti', () => {
  const ms = [
    done('a', 'b', [[25, 20], [25, 20], [20, 25]]),   // a 2 set, b 1
    done('c', 'd', [[25, 10], [25, 10], [25, 10]]),   // c 3, d 0
    done('a', 'c', [[20, 25], [20, 25], [25, 20]]),   // a 1, c 2
    done('b', 'd', [[25, 20], [25, 20], [25, 20]])    // b 3, d 0
  ];
  const st = V.standings(['a', 'b', 'c', 'd'], ms);
  assert.deepEqual(st.map(r => [r.id, r.pts]), [['c', 5], ['b', 4], ['a', 3], ['d', 0]]);
  // b e a: b ha 4 punti, a 3 → nessuna parità. Parità di punti decisa dalle gare vinte:
  const ms2 = [
    done('x', 'y', [[25, 20], [25, 20], [20, 25]]),   // x 2 (vince), y 1
    done('y', 'z', [[25, 20], [25, 20], [25, 20]]),   // y 3 (vince), z 0
    done('z', 'x', [[25, 20], [25, 20], [25, 20]])    // z 3 (vince), x 0
  ];
  // punti: x 2, y 4, z 3 → y, z, x
  assert.deepEqual(V.standings(['x', 'y', 'z'], ms2).map(r => r.id), ['y', 'z', 'x']);
  // stessi punti e stesse vittorie: decide il quoziente punti (set uguali)
  const ms3 = [
    done('p', 'q', [[25, 10], [25, 10], [10, 25]]),   // p 2 set, 60-45
    done('q', 'p', [[25, 23], [25, 23], [23, 25]])    // q 2 set, 73-71
  ];
  const s3 = V.standings(['p', 'q'], ms3);
  // punti 3-3, vinte 1-1, set 3-3; punti p 60+71=131 a 45+73=118 → p avanti
  assert.deepEqual(s3.map(r => r.id), ['p', 'q']);
});

test('classifica: incontri diretti quando tutto il resto è pari', () => {
  // r e s: 5 punti, 2 vinte, 4 set vinti e 2 persi (tutti i set 25-20, quindi stesso quoziente punti); r ha battuto s
  const S = (h, a, x) => done(h, a, x === 2 ? [[25, 20], [25, 20], [20, 25]] : [[20, 25], [20, 25], [25, 20]]);
  const ms = [S('r', 's', 2), S('r', 'u', 2), S('r', 'v', 1), S('s', 'u', 2), S('s', 'v', 2), S('u', 'v', 2)];
  const st = V.standings(['s', 'r', 'u', 'v'], ms);
  const r = st.find(x => x.id === 'r'), s = st.find(x => x.id === 's');
  assert.deepEqual([r.pts, r.w, r.sw, r.sl], [s.pts, s.w, s.sw, s.sl]);
  assert.deepEqual(st.map(x => x.id).slice(0, 2), ['r', 's']);
});

test('playoff: tabellone con bye, gara secca e andata/ritorno con quoziente punti', () => {
  const br = { id: 'gold', seeds: ['s1', 's2', 's3', 's4', 's5', 's6'], rounds: [{ mode: '3', legs: 2 }, { mode: 'bo5', legs: 2 }, { mode: 'bo5', legs: 2 }] };
  let rounds = V.bracket(br, []);
  assert.equal(rounds.length, 3);
  assert.equal(rounds[2].legs, 1);   // la finale è sempre gara secca
  // primo turno: s1 e s2 passano per bye
  assert.equal(rounds[0].ties.filter(t => t.bye).length, 2);
  const first = V.roundMatches(br, rounds, 0);
  assert.equal(first.length, 4);   // 2 confronti andata e ritorno
  // andata in casa della testa di serie peggiore
  const t45 = first.filter(m => [m.home, m.away].sort().join() === 's4,s5');
  assert.equal(t45[0].home, 's5');
  assert.equal(t45[1].home, 's4');
  // s4-s5: 3 set a 3 (stesse vittorie di set), quoziente punti a favore di s5
  const ms = [
    Object.assign({}, t45[0], { status: 'done', sets: [[25, 10], [25, 10], [10, 25]] }),   // s5 2 set
    Object.assign({}, t45[1], { status: 'done', sets: [[25, 23], [25, 23], [23, 25]] }),   // s4 2 set
    ...first.filter(m => [m.home, m.away].sort().join() === 's3,s6').map(m => Object.assign({}, m, { status: 'done', sets: m.home === 's3' ? [[25, 1], [25, 1], [25, 1]] : [[1, 25], [1, 25], [1, 25]] }))
  ];
  rounds = V.bracket(br, ms);
  const win = rounds[0].ties.map(t => t.winner).filter(Boolean).sort();
  assert.deepEqual(win, ['s1', 's2', 's3', 's5']);
  const semis = V.roundMatches(br, rounds, 1);
  assert.equal(semis.length, 4);
  assert.ok(semis.every(m => m.mode === 'bo5'));
  // semifinali: s1 contro s5 (vincitore di 4-5), s2 contro s3
  assert.deepEqual(rounds[1].ties.map(t => [t.a, t.b]), [['s1', 's5'], ['s2', 's3']]);
});

test('playoff: parità perfetta in andata e ritorno → golden set ai punti decisi dall’admin', () => {
  const br = { id: 'g', seeds: ['a', 'b', 'c', 'd'], rounds: [{ mode: '3', legs: 2, goldenTo: 15 }] };
  let rounds = V.bracket(br, []);
  const legs = V.roundMatches(br, rounds, 0).filter(m => [m.home, m.away].includes('a'));   // a contro d
  const same = [[25, 20], [20, 25], [25, 20]];
  const ms = legs.map(m => Object.assign({}, m, { status: 'done', sets: same }));   // 2-1 ciascuna, stessi punti
  rounds = V.bracket(br, ms);
  let tie = rounds[0].ties.find(t => t.a === 'a');
  assert.equal(tie.winner, null);
  assert.equal(tie.golden, true);
  // golden set non valido (15-14) e poi valido (13-15): vince la squadra in trasferta nel ritorno (d)
  const back = ms.find(m => m.leg === 2);
  back.golden = { h: 15, a: 14 };
  assert.equal(V.bracket(br, ms)[0].ties.find(t => t.a === 'a').winner, null);
  back.golden = { h: 13, a: 15 };
  tie = V.bracket(br, ms)[0].ties.find(t => t.a === 'a');
  assert.equal(back.home, 'a');
  assert.equal(tie.winner, 'd');
});

test('playoff: finale per il 3° e 4° posto tra le perdenti delle semifinali', () => {
  const br = { id: 'g', seeds: ['a', 'b', 'c', 'd'], rounds: [{ mode: '3', legs: 1 }, { mode: 'bo5', legs: 1 }] };
  let rounds = V.bracket(br, []);
  assert.ok(rounds[1].third && !rounds[1].third.ready);
  const semis = V.roundMatches(br, rounds, 0).map(m => Object.assign({}, m, { status: 'done', sets: [[25, 20], [25, 20], [25, 20]] }));   // vince chi gioca in casa (a, b)
  rounds = V.bracket(br, semis);
  assert.deepEqual([rounds[1].ties[0].a, rounds[1].ties[0].b], ['a', 'b']);
  assert.deepEqual([rounds[1].third.a, rounds[1].third.b], ['c', 'd']);
  const finals = V.roundMatches(br, rounds, 1);
  assert.equal(finals.length, 2);   // finale e finale 3°/4°
  assert.ok(finals.every(m => m.leg === 1 && m.mode === 'bo5'));
  const ms = semis.concat(finals.map(m => Object.assign({}, m, { status: 'done', sets: [[20, 25], [20, 25], [20, 25]] })));
  rounds = V.bracket(br, ms);
  assert.equal(rounds[1].ties[0].winner, 'b');
  assert.equal(rounds[1].third.winner, 'd');
  // con 3 squadre (una semifinale è un bye) non c'è la finale per il 3° posto
  assert.equal(V.bracket({ id: 'x', seeds: ['a', 'b', 'c'], rounds: [] }, [])[1].third, undefined);
});
