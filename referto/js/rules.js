/*
 * Motore delle regole del beach volley (FIVB).
 * Lo stato della gara non viene mai modificato a mano: si ricostruisce
 * riapplicando in ordine la lista degli eventi (inizio set, punto, time-out,
 * sanzione, ritiro). Così "Annulla" = togliere l'ultimo evento.
 */
(function (root) {
  'use strict';

  const DEFAULT_SETTINGS = {
    bestOf: 3,          // numero massimo di set (dispari): 3 = al meglio dei 3, 1 = set unico, 5 = al meglio dei 5
    points: 21,         // punti dei set 1 e 2
    tiePoints: 15,      // punti del set decisivo
    switchEvery: 7,     // cambio campo nei set 1 e 2
    tieSwitchEvery: 5,  // cambio campo nel set decisivo
    tto: true,          // tempo tecnico a 21 punti totali (set 1 e 2)
    timeoutsPerSet: 1
  };

  // point = punto agli avversari; le etichette sono nelle traduzioni (san_XX / sanShort_XX)
  const SANCTIONS = {
    DW: { point: false },
    DP: { point: true },
    W: { point: false },
    P: { point: true },
    E: { point: false },
    D: { point: false }
  };

  const other = t => (t === 'A' ? 'B' : 'A');

  function settingsOf(match) {
    return Object.assign({}, DEFAULT_SETTINGS, match.settings || {});
  }
  function maxSets(S) { return Math.max(1, S.bestOf | 0); }
  function setsToWin(S) { return (maxSets(S) + 1) / 2; }
  function isDeciding(S, idx) { return maxSets(S) > 1 && idx === maxSets(S) - 1; }
  function targetOf(S, idx) { return isDeciding(S, idx) ? S.tiePoints : S.points; }
  function switchOf(S, idx) { return isDeciding(S, idx) ? S.tieSwitchEvery : S.switchEvery; }

  // Posizione nell'ordine di servizio: chi serve per primo nel set ha I e III, l'altra squadra II e IV
  function positionLabel(set, team, idx) {
    if (team === set.firstServing) return idx === 0 ? 'I' : 'III';
    return idx === 0 ? 'II' : 'IV';
  }

  function newSet(S, idx, e) {
    const set = {
      index: idx,
      target: targetOf(S, idx),
      switchEvery: switchOf(S, idx),
      deciding: isDeciding(S, idx),
      toss: e.toss || null,
      firstServing: e.serving,
      startLeft: e.left,
      left: e.left,
      order: { A: e.order.A.slice(), B: e.order.B.slice() },
      score: { A: 0, B: 0 },
      serving: e.serving,
      turnsBegun: { A: 0, B: 0 },
      turns: [],          // turni di servizio: {team, player, pos, start:{A,B}, end, final}
      turn: null,
      points: { A: [], B: [] }, // {n, by:'rally'|'penalty'|'awarded', time}
      timeouts: { A: [], B: [] },
      switches: [],
      tto: null,
      sanctions: [],
      rallies: [],        // storico per l'interfaccia
      startTime: e.time,
      endTime: null,
      winner: null,
      awarded: false
    };
    beginTurn(set, e.serving);
    return set;
  }

  function beginTurn(set, team) {
    set.turnsBegun[team]++;
    const idx = (set.turnsBegun[team] - 1) % 2;
    const player = set.order[team][idx];
    set.serving = team;
    set.turn = { team, player, pos: positionLabel(set, team, idx), start: { A: set.score.A, B: set.score.B }, end: null, final: false };
    set.turns.push(set.turn);
  }

  function snapshot(set) { return { A: set.score.A, B: set.score.B }; }

  function checkSetEnd(st, S, set, time) {
    const a = set.score.A, b = set.score.B;
    const hi = Math.max(a, b);
    if (hi >= set.target && Math.abs(a - b) >= 2) {
      closeSet(st, S, set, a > b ? 'A' : 'B', time);
      return true;
    }
    return false;
  }

  function closeSet(st, S, set, winner, time) {
    set.winner = winner;
    set.endTime = time;
    if (set.turn) { set.turn.end = set.score[set.turn.team]; set.turn.final = true; }
    st.setsWon[winner]++;
    st.alerts.push({ type: 'setEnd', set: set.index, winner });
    if (st.setsWon[winner] >= setsToWin(S)) {
      st.winner = winner;
      st.phase = 'matchEnd';
      st.alerts.push({ type: 'matchEnd', winner });
    } else {
      st.phase = 'setEnd';
    }
  }

  // Punto alla squadra W (azione vinta o punto di penalizzazione)
  function addPoint(st, S, set, W, by, time) {
    const sideOut = set.serving !== W;
    if (sideOut) set.turn.end = set.score[set.turn.team];
    set.score[W]++;
    set.points[W].push({ n: set.score[W], by, time });
    const serverBefore = set.turn;
    if (sideOut) beginTurn(set, W);
    set.rallies.push({ winner: W, by, score: snapshot(set), server: { team: serverBefore.team, player: serverBefore.player, pos: serverBefore.pos }, sideOut, time });
    if (checkSetEnd(st, S, set, time)) return;
    const total = set.score.A + set.score.B;
    if (total % set.switchEvery === 0) {
      set.switches.push(snapshot(set));
      set.left = other(set.left);
      st.alerts.push({ type: 'switch', score: snapshot(set) });
    }
    if (S.tto && !set.deciding && S.bestOf !== 1 && total === 21 && !set.tto) {
      set.tto = snapshot(set);
      st.alerts.push({ type: 'tto', score: snapshot(set) });
    }
  }

  // La squadra "loser" perde il set: all'avversaria i punti necessari per vincerlo (regola 6.4.3)
  function awardSet(st, S, set, loser, time) {
    const W = other(loser);
    const need = Math.max(set.target, set.score[loser] + 2);
    while (set.score[W] < need) {
      set.score[W]++;
      set.points[W].push({ n: set.score[W], by: 'awarded', time });
    }
    set.awarded = true;
    if (set.turn) set.turn.end = set.score[set.turn.team];
    closeSet(st, S, set, W, time);
  }

  function awardMatch(st, S, loser, time, reason) {
    st.forfeit = { team: loser, reason, time };
    if (st.cur && !st.cur.winner) awardSet(st, S, st.cur, loser, time);
    while (!st.winner && st.sets.length < maxSets(S)) {
      const idx = st.sets.length;
      const set = {
        index: idx, target: targetOf(S, idx), switchEvery: switchOf(S, idx), deciding: isDeciding(S, idx),
        toss: null, firstServing: null, startLeft: null, left: null, order: null,
        score: { A: 0, B: 0 }, serving: null, turnsBegun: { A: 0, B: 0 }, turns: [], turn: null,
        points: { A: [], B: [] }, timeouts: { A: [], B: [] }, switches: [], tto: null, sanctions: [], rallies: [],
        startTime: null, endTime: time, winner: null, awarded: true
      };
      st.sets.push(set);
      st.cur = set;
      awardSet(st, S, set, loser, time);
    }
  }

  function replay(match) {
    const S = settingsOf(match);
    const st = {
      settings: S,
      sets: [],
      cur: null,
      setsWon: { A: 0, B: 0 },
      winner: null,
      forfeit: null,
      phase: 'toss',      // toss | play | setEnd | matchEnd
      sanctions: [],      // tutte le sanzioni della gara
      alerts: [],         // avvisi generati dall'ULTIMO evento
      startTime: null,
      endTime: null
    };
    const events = match.events || [];
    events.forEach((e, i) => {
      st.alerts = [];
      applyEvent(st, S, e, i);
    });
    const played = st.sets.filter(s => s.startTime);
    st.startTime = played.length ? played[0].startTime : null;
    st.endTime = st.phase === 'matchEnd' ? (events.length ? events[events.length - 1].time : null) : null;
    return st;
  }

  function applyEvent(st, S, e) {
    const set = st.cur;
    switch (e.type) {
      case 'setStart': {
        if (st.phase !== 'toss' && st.phase !== 'setEnd') return;
        const s = newSet(S, st.sets.length, e);
        st.sets.push(s);
        st.cur = s;
        st.phase = 'play';
        return;
      }
      case 'point':
        if (st.phase !== 'play') return;
        addPoint(st, S, set, e.team, 'rally', e.time);
        return;
      case 'timeout':
        if (st.phase !== 'play') return;
        set.timeouts[e.team].push({ score: snapshot(set), time: e.time });
        st.alerts.push({ type: 'timeout', team: e.team });
        return;
      case 'sanction': {
        if (st.phase !== 'play') return;
        const rec = { team: e.team, player: e.player, kind: e.kind, set: set.index, score: snapshot(set), time: e.time };
        set.sanctions.push(rec);
        st.sanctions.push(rec);
        const info = SANCTIONS[e.kind];
        if (info && info.point) addPoint(st, S, set, other(e.team), 'penalty', e.time);
        else if (e.kind === 'E') awardSet(st, S, set, e.team, e.time);
        else if (e.kind === 'D') awardMatch(st, S, e.team, e.time, 'D');
        return;
      }
      case 'forfeit':
        if (st.phase === 'matchEnd') return;
        awardMatch(st, S, e.team, e.time, e.reason || 'RIT');
        return;
      default:
    }
  }

  // Chi serve in base alle scelte: chooser sceglie servizio/ricezione/campo;
  // se sceglie il campo, l'altra squadra sceglie servizio o ricezione.
  function servingFromChoice(chooser, choice, otherChoice) {
    if (!chooser || !choice) return null;
    if (choice === 'serve') return chooser;
    if (choice === 'receive') return other(chooser);
    if (otherChoice === 'serve') return other(chooser);
    if (otherChoice === 'receive') return chooser;
    return null;
  }

  function tossChooser(toss) { return toss ? (toss.chooser || toss.winner || null) : null; }

  // Valori proposti per il set successivo.
  // Primo set e set decisivo: sorteggio, sceglie chi lo vince.
  // Negli altri set sceglie la squadra che non ha scelto nel set precedente
  // (nel set 2: quella che ha perso il sorteggio del set 1).
  function nextSetDefaults(match, st) {
    const idx = st.sets.length;
    const prev = st.sets[idx - 1];
    const needsToss = idx === 0 || isDeciding(st.settings, idx);
    const order = prev && prev.order ? prev.order : { A: [0, 1], B: [0, 1] };
    const c = prev && tossChooser(prev.toss);
    return { index: idx, needsToss, chooser: !needsToss && c ? other(c) : null, order };
  }

  function nextServer(set) {
    // chi servirà quando l'altra squadra conquisterà il servizio
    const t = other(set.serving);
    const idx = set.turnsBegun[t] % 2;
    return { team: t, player: set.order[t][idx], pos: positionLabel(set, t, idx) };
  }

  const api = { DEFAULT_SETTINGS, SANCTIONS, replay, nextSetDefaults, servingFromChoice, tossChooser, nextServer, other, settingsOf, maxSets, setsToWin, targetOf, isDeciding };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Rules = api;
})(typeof window !== 'undefined' ? window : globalThis);
