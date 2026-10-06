// Motore dei tornei a squadre (pallavolo) della Manofuori Cup: calendario, risultati, classifiche, playoff.
// Funzioni pure, senza accesso al database: le usa l'app (window.Volley) e i test (node --test tests/).
//
// Regole:
// - Gironi all'italiana con andata e ritorno ("ar") o sola andata ("a"). Si giocano sempre 3 set a 25 punti;
//   ogni set vinto vale 1 punto in classifica.
// - Parità in classifica: 1) gare vinte, 2) quoziente set, 3) quoziente punti, 4) incontri diretti.
// - Playoff a eliminazione diretta (anche Gold e Silver): per ogni turno l'admin sceglie 3 set fissi ("3")
//   o al meglio dei 5 ("bo5", quinto set a 15), andata e ritorno o gara secca; la finale è sempre gara secca.
//   Andata e ritorno: passa chi vince più set nelle due gare; a parità di set conta il quoziente punti; a parità
//   perfetta si gioca un golden set ai punti decisi dall'admin. C'è anche la finale per il 3° e 4° posto.
const Volley = (() => {
  // ---------- set e gare ----------
  // Set valido: chi vince arriva almeno a "to" punti con due di scarto (oltre "to" lo scarto è esattamente 2).
  function setOk(h, a, to) {
    if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0 || h === a) return false;
    const w = Math.max(h, a), l = Math.min(h, a);
    return w === to ? l <= to - 2 : w > to && w - l === 2;
  }

  // Controlla i set di una gara. mode "3" = 3 set fissi a 25; "bo5" = al meglio dei 5 (si chiude a 3 set vinti,
  // quinto set a 15). Restituisce null se va bene, altrimenti il codice dell'errore.
  function checkSets(sets, mode) {
    if (!Array.isArray(sets) || !sets.length) return 'vNoSets';
    if (mode === 'bo5') {
      let h = 0, a = 0;
      for (let i = 0; i < sets.length; i++) {
        if (h === 3 || a === 3) return 'vTooManySets';
        const s = sets[i];
        if (!setOk(s[0], s[1], i === 4 ? 15 : 25)) return i === 4 ? 'vBadSet15' : 'vBadSet';
        if (s[0] > s[1]) h++; else a++;
      }
      return h === 3 || a === 3 ? null : 'vNotFinished';
    }
    if (sets.length !== 3) return 'vThreeSets';
    return sets.every(s => setOk(s[0], s[1], 25)) ? null : 'vBadSet';
  }

  // Riepilogo di una gara giocata: set e punti di casa (h) e ospiti (a), vincitore ('h' | 'a').
  function tally(sets) {
    const r = { sh: 0, sa: 0, ph: 0, pa: 0, winner: null };
    (sets || []).forEach(([h, a]) => { r.ph += h; r.pa += a; if (h > a) r.sh++; else if (a > h) r.sa++; });
    r.winner = r.sh > r.sa ? 'h' : r.sa > r.sh ? 'a' : null;
    return r;
  }
  const played = m => !!(m && m.sets && m.sets.length && m.status === 'done');

  // ---------- calendario all'italiana (metodo di Berger) ----------
  // teams: id delle squadre. Con un numero dispari una squadra riposa a ogni giornata.
  // Restituisce le gare [{ day, leg, home, away }]; con "ar" il ritorno ripete l'andata a campi invertiti.
  function roundRobin(teams, kind) {
    let arr = teams.slice();
    if (arr.length < 2) return [];
    if (arr.length % 2) arr.push(null);
    const n = arr.length, days = n - 1, out = [];
    for (let d = 0; d < days; d++) {
      for (let i = 0; i < n / 2; i++) {
        let h = arr[i], a = arr[n - 1 - i];
        if (i === 0 && d % 2 === 1) [h, a] = [a, h];   // l'ultima squadra (fissa) alterna casa e trasferta
        if (h != null && a != null) out.push({ day: d + 1, leg: 1, home: h, away: a });
      }
      // rotazione di Berger: l'ultima resta ferma, le altre scorrono di n/2 posizioni
      const last = arr[n - 1], rest = arr.slice(0, n - 1), k = n / 2;
      arr = rest.slice(k).concat(rest.slice(0, k), [last]);
    }
    if (kind === 'ar') out.slice().forEach(m => out.push({ day: m.day + days, leg: 2, home: m.away, away: m.home }));
    return out;
  }


  // ---------- classifica del girone ----------
  const ratio = (a, b) => (b ? a / b : a ? Infinity : 0);
  function emptyRow(id) { return { id, pts: 0, g: 0, w: 0, l: 0, sw: 0, sl: 0, pw: 0, pl: 0 }; }
  function addMatch(rows, m) {
    const r = tally(m.sets), H = rows[m.home], A = rows[m.away];
    if (!H || !A) return;
    H.g++; A.g++;
    H.pts += r.sh; A.pts += r.sa;
    H.sw += r.sh; H.sl += r.sa; A.sw += r.sa; A.sl += r.sh;
    H.pw += r.ph; H.pl += r.pa; A.pw += r.pa; A.pl += r.ph;
    if (r.winner === 'h') { H.w++; A.l++; } else if (r.winner === 'a') { A.w++; H.l++; }
  }
  function table(teamIds, matches) {
    const rows = {};
    teamIds.forEach(id => { rows[id] = emptyRow(id); });
    matches.filter(played).forEach(m => addMatch(rows, m));
    return rows;
  }
  // 1° punti, 2° gare vinte, 3° quoziente set, 4° quoziente punti
  function cmpBase(x, y) {
    return y.pts - x.pts || y.w - x.w || ratio(y.sw, y.sl) - ratio(x.sw, x.sl) || ratio(y.pw, y.pl) - ratio(x.pw, x.pl);
  }
  // teamIds: squadre del girone; matches: gare del girone. names: id → nome (solo per l'ordine alfabetico finale).
  function standings(teamIds, matches, names) {
    const rows = table(teamIds, matches);
    const list = Object.values(rows).sort(cmpBase);
    // 5° incontri diretti: tra le squadre ancora pari si rifà la classifica con le sole gare tra loro
    const out = [];
    for (let i = 0; i < list.length;) {
      let j = i + 1;
      while (j < list.length && cmpBase(list[i], list[j]) === 0) j++;
      const tied = list.slice(i, j);
      if (tied.length > 1) {
        const ids = new Set(tied.map(r => r.id));
        const h2h = table([...ids], matches.filter(m => ids.has(m.home) && ids.has(m.away)));
        tied.sort((x, y) => cmpBase(h2h[x.id], h2h[y.id]) || String((names || {})[x.id] || x.id).localeCompare(String((names || {})[y.id] || y.id)));
      }
      out.push(...tied);
      i = j;
    }
    return out.map((r, i) => Object.assign(r, { pos: i + 1, qs: ratio(r.sw, r.sl), qp: ratio(r.pw, r.pl) }));
  }

  // ---------- playoff ----------
  // Posizioni nel tabellone (1 contro N, 2 contro N-1, …) per un tabellone da "size" (potenza di 2).
  function seedOrder(size) {
    let order = [1];
    while (order.length < size) {
      const n = order.length * 2;
      order = order.flatMap(s => [s, n + 1 - s]);
    }
    return order;
  }
  const bracketSize = n => { let s = 1; while (s < n) s *= 2; return Math.max(2, s); };
  const roundName = (teamsInRound) => (teamsInRound === 2 ? 'final' : teamsInRound === 4 ? 'semi' : teamsInRound === 8 ? 'quarter' : 'r' + teamsInRound);

  // Testa di serie per chi arriva da gironi diversi: prima la posizione nel girone, poi punti per gara,
  // quoziente set e quoziente punti. rows: righe di classifica con "group".
  function crossSeed(rows) {
    return rows.slice().sort((x, y) => x.pos - y.pos || (y.g ? y.pts / y.g : 0) - (x.g ? x.pts / x.g : 0)
      || ratio(y.sw, y.sl) - ratio(x.sw, x.sl) || ratio(y.pw, y.pl) - ratio(x.pw, x.pl));
  }

  // Esito di un confronto (una o due gare). tie = { a, b } con a testa di serie migliore; ms = gare del confronto.
  // Restituisce { winner, golden }: golden = true quando l'andata e ritorno finisce in parità perfetta (stessi set
  // e stesso quoziente punti) e serve il golden set, salvato nella gara di ritorno come { h, a } (h = squadra di casa
  // del ritorno), a "goldenTo" punti decisi dall'admin.
  function tieState(tie, ms, legs, goldenTo) {
    if (!tie.a || !tie.b) return { winner: tie.a || tie.b || null, golden: false };   // bye
    const done = ms.filter(played);
    if (done.length < legs) return { winner: null, golden: false };
    if (legs === 1) {
      // gara secca: vince chi ha vinto la gara
      const r = tally(done[0].sets);
      return { winner: (r.winner === 'h') === (done[0].home === tie.a) ? tie.a : tie.b, golden: false };
    }
    let sa = 0, sb = 0, pa = 0, pb = 0;
    done.forEach(m => {
      const r = tally(m.sets);
      if (m.home === tie.a) { sa += r.sh; sb += r.sa; pa += r.ph; pb += r.pa; } else { sa += r.sa; sb += r.sh; pa += r.pa; pb += r.ph; }
    });
    if (sa !== sb) return { winner: sa > sb ? tie.a : tie.b, golden: false };
    const qa = ratio(pa, pb), qb = ratio(pb, pa);
    if (qa !== qb) return { winner: qa > qb ? tie.a : tie.b, golden: false };
    // parità perfetta: golden set
    const back = done.find(m => m.leg === 2) || done[done.length - 1];
    const g = back.golden;
    if (g && setOk(Number(g.h), Number(g.a), goldenTo || 15)) {
      const homeWon = Number(g.h) > Number(g.a);
      return { winner: homeWon === (back.home === tie.a) ? tie.a : tie.b, golden: true };
    }
    return { winner: null, golden: true };
  }
  const tieWinner = (tie, ms, legs, goldenTo) => tieState(tie, ms, legs, goldenTo).winner;

  // Tabellone: br = { id, seeds: [teamId…] (in ordine di testa di serie), rounds: [{ mode, legs }] }.
  // matches: tutte le gare del tabellone (key "p-<id>-r<r>-s<slot>-l<leg>").
  // Restituisce i turni con i confronti: { r, name, mode, legs, ties: [{ slot, a, b, winner, matches }] }.
  function bracket(br, matches) {
    const size = bracketSize(br.seeds.length), nRounds = Math.log2(size);
    const bySlot = {};
    matches.filter(m => m.bracket === br.id).forEach(m => { (bySlot[`${m.round}-${m.slot}`] = bySlot[`${m.round}-${m.slot}`] || []).push(m); });
    const out = [];
    let prev = seedOrder(size).map(s => br.seeds[s - 1] || null);   // squadre al primo turno (null = bye)
    for (let r = 0; r < nRounds; r++) {
      const cfg = (br.rounds || [])[r] || {};
      const last = r === nRounds - 1;
      const legs = last ? 1 : (cfg.legs === 2 ? 2 : 1);
      const mode = cfg.mode === 'bo5' ? 'bo5' : '3';
      const ties = [];
      for (let s = 0; s < prev.length / 2; s++) {
        let a = prev[2 * s], b = prev[2 * s + 1];
        // ready: entrambe le squadre note (undefined = vincitore di un confronto non ancora deciso; null = bye)
        const ready = a !== undefined && b !== undefined;
        // "a" è la testa di serie migliore (posizione più bassa tra le teste di serie)
        if (a && b && br.seeds.indexOf(b) < br.seeds.indexOf(a)) [a, b] = [b, a];
        const ms = (bySlot[`${r}-${s}`] || []).slice().sort((x, y) => x.leg - y.leg);
        const goldenTo = Number(cfg.goldenTo) || 15;
        const st = !ready || (a == null && b == null) ? { winner: null, golden: false } : tieState({ a, b }, ms, legs, goldenTo);
        ties.push({ slot: s, a: a === undefined ? null : a, b: b === undefined ? null : b, ready, bye: ready && (a == null) !== (b == null), matches: ms, winner: st.winner, golden: st.golden, goldenTo });
      }
      const rd = { r, name: roundName(prev.length), mode, legs, ties };
      // finale per il 3° e 4° posto (gara secca tra le perdenti delle semifinali, con la stessa formula della finale)
      if (last && out.length) {
        const semis = out[out.length - 1].ties;
        const losers = semis.map(tt => (tt.bye || (tt.ready && (tt.a == null || tt.b == null)) ? null : tt.winner ? (tt.winner === tt.a ? tt.b : tt.a) : undefined));
        if (losers.length === 2 && losers.every(x => x !== null)) {
          let a3 = losers[0], b3 = losers[1];
          const ready3 = a3 !== undefined && b3 !== undefined;
          if (ready3 && br.seeds.indexOf(b3) < br.seeds.indexOf(a3)) [a3, b3] = [b3, a3];
          const ms3 = (bySlot[`${r}-1`] || []).slice().sort((x, y) => x.leg - y.leg);
          const st3 = ready3 ? tieState({ a: a3, b: b3 }, ms3, 1, 15) : { winner: null, golden: false };
          rd.third = { slot: 1, third: true, a: ready3 ? a3 : (a3 || null), b: ready3 ? b3 : (b3 || null), ready: ready3, bye: false, matches: ms3, winner: st3.winner, golden: false };
        }
      }
      out.push(rd);
      // al turno dopo vanno i vincitori; undefined = confronto non ancora deciso
      prev = ties.map(tt => (tt.ready && tt.a == null && tt.b == null ? null : tt.winner == null ? undefined : tt.winner));
    }
    return out;
  }

  // Gare da creare per il turno r (confronti con entrambe le squadre note e senza gare). Andata in casa della
  // testa di serie peggiore, ritorno in casa della migliore.
  function roundMatches(br, rounds, r) {
    const rd = rounds[r];
    const out = [];
    rd.ties.forEach(tt => {
      if (!tt.a || !tt.b || tt.matches.length) return;
      if (rd.legs === 2) {
        out.push({ bracket: br.id, round: r, slot: tt.slot, leg: 1, home: tt.b, away: tt.a, mode: rd.mode });
        out.push({ bracket: br.id, round: r, slot: tt.slot, leg: 2, home: tt.a, away: tt.b, mode: rd.mode });
      } else out.push({ bracket: br.id, round: r, slot: tt.slot, leg: 1, home: tt.a, away: tt.b, mode: rd.mode });
    });
    const t3 = rd.third;
    if (t3 && t3.ready && !t3.matches.length) out.push({ bracket: br.id, round: r, slot: 1, leg: 1, home: t3.a, away: t3.b, mode: rd.mode });
    return out;
  }
  const playoffKey = m => `p-${m.bracket}-r${m.round}-s${m.slot}-l${m.leg}`;
  const groupKey = (g, m, i) => `g-${g}-d${m.day}-${i}`;

  return { setOk, checkSets, tally, played, roundRobin, standings, seedOrder, bracketSize, crossSeed, tieState, tieWinner, bracket, roundMatches, playoffKey, groupKey, ratio };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Volley;
