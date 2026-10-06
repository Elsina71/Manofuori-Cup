/*
 * Motore delle regole della pallavolo indoor 6 contro 6 (regole FIVB).
 * Lo stato della gara non si modifica mai a mano: si ricostruisce riapplicando
 * in ordine la lista degli eventi (inizio set, punto, time-out, sostituzione,
 * sanzione, squadra incompleta, ritiro). Così "Annulla" = togliere l'ultimo evento.
 *
 * Rotazioni: ogni squadra ha 6 "colonne" (0–5) = le posizioni I–VI della formazione
 * iniziale del set. rot[team][p] è la colonna che occupa la posizione p (0 = posto I,
 * al servizio). Una sostituzione cambia il giocatore della colonna, non la colonna:
 * così il titolare rientra sempre nella sua posizione (regola 15.6.1).
 */
(function (root) {
  'use strict';

  const DEFAULT_SETTINGS = {
    mode: 'best',       // 'best' = al meglio di N set; 'fixed' = si giocano sempre N set
    sets: 5,            // numero di set (al meglio dei 5, dei 3, set unico… oppure set fissi)
    points: 25,         // punti dei set
    lastPoints: 15,     // punti dell'ultimo set (set decisivo)
    cap: 0,             // punteggio massimo: chi lo raggiunge vince il set anche con 1 punto di scarto (0 = nessuno)
    timeoutsPerSet: 2,
    subsPerSet: 6,
    minWomen: 2         // pallavolo mista: numero minimo di donne in campo (Manofuori Cup: 2; 0 = nessun controllo);
                        // anche per squadra: { A: 2, B: 0 } (es. una squadra mista contro una maschile)
  };

  // point = punto (e servizio) agli avversari; le etichette sono in app.js
  const SANCTIONS = {
    DW: { point: false }, // avvertimento per ritardo
    DP: { point: true },  // penalizzazione per ritardo
    W: { point: false },  // avvertimento (cartellino giallo)
    P: { point: true },   // penalizzazione (rosso)
    E: { point: false },  // espulsione (fuori per il resto del set)
    D: { point: false }   // squalifica (fuori per il resto della gara)
  };

  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  const other = t => (t === 'A' ? 'B' : 'A');
  const both = f => ({ A: f('A'), B: f('B') });

  function settingsOf(match) {
    const S = Object.assign({}, DEFAULT_SETTINGS, match.settings || {});
    S.sets = Math.max(1, S.sets | 0);
    return S;
  }
  function minWomenOf(S, team) { const v = S.minWomen; return Math.max(0, (v && typeof v === 'object' ? v[team] : v) | 0); }
  function setsToWin(S) { return Math.floor(S.sets / 2) + 1; }
  function isDeciding(S, idx) { return S.sets > 1 && idx === S.sets - 1; }
  function targetOf(S, idx) { return isDeciding(S, idx) ? S.lastPoints : S.points; }
  // nel set decisivo si cambia campo quando una squadra arriva a metà dei punti (8 su 15)
  function midSwitchOf(S, idx) { return isDeciding(S, idx) ? Math.ceil(targetOf(S, idx) / 2) : 0; }
  // sorteggio: primo set e set decisivo (solo "al meglio di")
  function needsToss(S, idx) { return idx === 0 || (S.mode !== 'fixed' && isDeciding(S, idx)); }

  function snapshot(set) { return { A: set.score.A, B: set.score.B }; }

  // ---------- campo ----------
  function columnOf(set, team, no) { return set.occ[team].indexOf(no); }
  function onCourt(set, team, no) { return columnOf(set, team, no) >= 0; }
  function positionOf(set, team, no) {
    const c = columnOf(set, team, no);
    return c < 0 ? -1 : set.rot[team].indexOf(c);
  }
  // giocatori della rotazione per posizione: [posto I, II, …, VI] (senza il libero)
  function courtOf(set, team) { return set.rot[team].map(c => set.occ[team][c]); }
  // giocatori davvero in campo: come courtOf, ma con il libero al posto di chi ha sostituito
  function visibleCourt(set, team) {
    const lib = set.libero && set.libero[team];
    return set.rot[team].map(c => (lib && lib.col === c ? lib.no : set.occ[team][c]));
  }

  // ---------- libero ----------
  // Il libero sostituisce un giocatore di seconda linea (posti I, V, VI), non può servire
  // e quando la rotazione lo porterebbe in prima linea (posto IV) esce: rientra il giocatore sostituito.
  // I suoi ingressi non contano come sostituzioni.
  const BACK_ROW = [0, 4, 5];
  function liberoExit(st, set, team, reason) {
    const lib = set.libero[team];
    if (!lib) return;
    set.libero[team] = null;
    set.liberoLog[team].push({ type: 'out', no: lib.no, back: set.occ[team][lib.col], score: snapshot(set), reason });
    st.alerts.push({ type: 'liberoOut', team, libero: lib.no, back: set.occ[team][lib.col], reason });
  }

  function newSet(S, idx, e) {
    const set = {
      index: idx,
      target: targetOf(S, idx),
      deciding: isDeciding(S, idx),
      midSwitch: midSwitchOf(S, idx),
      switched: false,
      toss: e.toss || null,
      firstServing: e.serving,
      startLeft: e.left,
      left: e.left,
      lineup: both(t => e.lineup[t].slice()),
      rot: both(() => [0, 1, 2, 3, 4, 5]),
      occ: both(t => e.lineup[t].slice()),
      colState: both(() => [0, 0, 0, 0, 0, 0]), // 0 titolare, 1 sostituto in campo, 2 titolare rientrato, 3 sostituzione eccezionale
      colSub: both(() => [null, null, null, null, null, null]),
      regSubs: { A: 0, B: 0 },
      subs: { A: [], B: [] },            // {out, in, col, exceptional, score, time}
      barred: { A: {}, B: {} },          // espulsi: fuori per il resto del set
      libero: { A: null, B: null },      // libero in campo: {no, col} (col = colonna del giocatore sostituito)
      liberoLog: { A: [], B: [] },       // entrate e uscite del libero
      score: { A: 0, B: 0 },
      serving: e.serving,
      turns: [],                         // turni di servizio: {team, col, player, start, end}
      turn: null,
      points: { A: [], B: [] },          // {n, by: 'rally'|'penalty'|'awarded', time}
      timeouts: { A: [], B: [] },
      sanctions: [],
      rallies: [],
      switchScore: null,
      startTime: e.time,
      endTime: null,
      winner: null,
      awarded: false
    };
    beginTurn(set, e.serving);
    return set;
  }

  function beginTurn(set, team) {
    const col = set.rot[team][0];
    set.serving = team;
    set.turn = { team, col, player: set.occ[team][col], start: snapshot(set), end: null };
    set.turns.push(set.turn);
  }

  // la squadra che conquista il servizio ruota in senso orario: il giocatore in II va in I
  function rotate(st, set, team) {
    const r = set.rot[team];
    set.rot[team] = r.slice(1).concat(r[0]);
    const lib = set.libero[team];
    if (lib && set.rot[team].indexOf(lib.col) === 3) liberoExit(st, set, team, 'front');
  }

  function checkSetEnd(st, S, set, time) {
    const a = set.score.A, b = set.score.B;
    const hi = Math.max(a, b);
    if ((hi >= set.target && Math.abs(a - b) >= 2) || (S.cap && hi >= S.cap && a !== b)) {
      closeSet(st, S, set, a > b ? 'A' : 'B', time);
      return true;
    }
    return false;
  }

  function closeSet(st, S, set, winner, time) {
    set.winner = winner;
    set.endTime = time;
    if (set.turn && set.turn.end == null) set.turn.end = set.score[set.turn.team];
    st.setsWon[winner]++;
    st.alerts.push({ type: 'setEnd', set: set.index, winner });
    const done = S.mode === 'fixed' ? st.sets.length >= S.sets : st.setsWon[winner] >= setsToWin(S);
    if (done) {
      st.winner = st.setsWon.A === st.setsWon.B ? null : (st.setsWon.A > st.setsWon.B ? 'A' : 'B');
      st.draw = !st.winner;
      st.phase = 'matchEnd';
      st.alerts.push({ type: 'matchEnd', winner: st.winner });
    } else {
      st.phase = 'setEnd';
    }
  }

  // Punto alla squadra W (azione vinta o punto di penalizzazione)
  function addPoint(st, S, set, W, by, time) {
    const sideOut = set.serving !== W;
    const server = { team: set.turn.team, player: set.turn.player };
    if (sideOut) set.turn.end = set.score[set.turn.team];
    set.score[W]++;
    set.points[W].push({ n: set.score[W], by, time });
    if (sideOut) { rotate(st, set, W); beginTurn(set, W); }
    set.rallies.push({ winner: W, by, score: snapshot(set), server, sideOut, time });
    if (checkSetEnd(st, S, set, time)) return;
    if (set.midSwitch && !set.switched && Math.max(set.score.A, set.score.B) === set.midSwitch) {
      set.switched = true;
      set.switchScore = snapshot(set);
      set.left = other(set.left);
      st.alerts.push({ type: 'switch', score: snapshot(set) });
    }
  }

  // La squadra "loser" perde il set: agli avversari i punti che servono per vincerlo (regola 6.4.3)
  function awardSet(st, S, set, loser, time) {
    const W = other(loser);
    let need = Math.max(set.target, set.score[loser] + 2);
    if (S.cap) need = Math.max(Math.min(need, S.cap), set.score[loser] + 1);
    while (set.score[W] < need) {
      set.score[W]++;
      set.points[W].push({ n: set.score[W], by: 'awarded', time });
    }
    set.awarded = true;
    closeSet(st, S, set, W, time);
  }

  function emptySet(S, idx, time) {
    return {
      index: idx, target: targetOf(S, idx), deciding: isDeciding(S, idx), midSwitch: 0, switched: false,
      toss: null, firstServing: null, startLeft: null, left: null, lineup: null, rot: null, occ: null,
      colState: null, colSub: null, regSubs: { A: 0, B: 0 }, subs: { A: [], B: [] }, barred: { A: {}, B: {} },
      libero: { A: null, B: null }, liberoLog: { A: [], B: [] },
      score: { A: 0, B: 0 }, serving: null, turns: [], turn: null, points: { A: [], B: [] },
      timeouts: { A: [], B: [] }, sanctions: [], rallies: [], switchScore: null,
      startTime: null, endTime: time, winner: null, awarded: true
    };
  }

  // Gara persa (rinuncia, ritiro, squalifica): i set mancanti vanno agli avversari
  function awardMatch(st, S, loser, time, reason) {
    st.forfeit = { team: loser, reason, time };
    if (st.cur && !st.cur.winner && st.phase === 'play') awardSet(st, S, st.cur, loser, time);
    const W = other(loser);
    const enough = () => (S.mode === 'fixed' ? st.sets.length >= S.sets : st.setsWon[W] >= setsToWin(S));
    while (!enough() && st.sets.length < S.sets) {
      const set = emptySet(S, st.sets.length, time);
      st.sets.push(set);
      st.cur = set;
      awardSet(st, S, set, loser, time);
    }
    st.winner = W;
    st.draw = false;
    st.phase = 'matchEnd';
    st.alerts.push({ type: 'matchEnd', winner: W });
  }

  // ---------- sostituzioni ----------
  function isBarred(st, set, team, no) { return !!(st.barredMatch[team][no] || set.barred[team][no]); }

  // Sostituzione regolare possibile per il giocatore "out"?
  // → { free: true } chiunque idoneo dalla panchina; { only: n } solo il titolare n; null = non consentita
  function regularSubRule(st, S, set, team, out) {
    const col = columnOf(set, team, out);
    if (col < 0) return null;
    if (set.regSubs[team] >= S.subsPerSet) return null;
    const state = set.colState[team][col];
    if (state === 0) return { free: true, col };
    if (state === 1 && set.colSub[team][col] === out) return { only: set.lineup[team][col], col };
    return null;
  }

  // un giocatore della panchina può entrare con una sostituzione regolare al posto di un titolare?
  function canEnterFree(st, set, team, no) {
    if (onCourt(set, team, no) || isBarred(st, set, team, no)) return false;
    if (set.lineup[team].includes(no)) return false;           // un titolare rientra solo nella sua colonna
    if (set.colSub[team].includes(no)) return false;           // un sostituto entra una sola volta per set
    return true;
  }

  // il giocatore sostituito dal libero è fuori dal campo: non si può sostituire finché il libero non esce
  function hiddenByLibero(set, team, no) { const lib = set.libero[team]; return !!lib && set.occ[team][lib.col] === no; }

  function validSub(st, S, set, e) {
    const team = e.team;
    if (e.out === e.in || !onCourt(set, team, e.out) || hiddenByLibero(set, team, e.out) || onCourt(set, team, e.in) || isBarred(st, set, team, e.in)) return false;
    if (set.libero[team] && set.libero[team].no === e.in) return false;
    if (e.exceptional) return true;
    const rule = regularSubRule(st, S, set, team, e.out);
    if (!rule) return false;
    if (rule.only != null) return rule.only === e.in;
    return canEnterFree(st, set, team, e.in);
  }

  function applySub(st, S, set, e) {
    const team = e.team;
    const col = columnOf(set, team, e.out);
    set.occ[team][col] = e.in;
    if (e.exceptional) {
      set.colState[team][col] = 3;
      st.barredMatch[team][e.out] = true;   // chi esce con sostituzione eccezionale non rientra più (15.7)
    } else {
      set.regSubs[team]++;
      if (set.colState[team][col] === 0) { set.colState[team][col] = 1; set.colSub[team][col] = e.in; }
      else set.colState[team][col] = 2;
    }
    set.subs[team].push({ out: e.out, in: e.in, col, exceptional: !!e.exceptional, n: e.exceptional ? null : set.regSubs[team], score: snapshot(set), time: e.time });
    // il giocatore al servizio sostituito: il turno prosegue con chi entra
    if (set.turn && set.turn.team === team && set.turn.col === col && set.turn.start.A === set.score.A && set.turn.start.B === set.score.B) set.turn.player = e.in;
  }

  // ---------- ricostruzione ----------
  function replay(match) {
    const S = settingsOf(match);
    const st = {
      settings: S,
      sets: [],
      cur: null,
      setsWon: { A: 0, B: 0 },
      winner: null,
      draw: false,
      forfeit: null,
      phase: 'toss',        // toss | play | setEnd | matchEnd
      sanctions: [],
      barredMatch: { A: {}, B: {} },  // squalificati e sostituiti in modo eccezionale
      alerts: [],           // avvisi generati dall'ULTIMO evento
      rejected: [],         // indici degli eventi non validi (ignorati)
      startTime: null,
      endTime: null
    };
    const events = match.events || [];
    events.forEach((e, i) => {
      st.alerts = [];
      if (applyEvent(st, S, e) === false) st.rejected.push(i);
    });
    const played = st.sets.filter(s => s.startTime);
    st.startTime = played.length ? played[0].startTime : null;
    st.endTime = st.phase === 'matchEnd' && events.length ? events[events.length - 1].time : null;
    return st;
  }

  function validLineup(st, lineup) {
    return ['A', 'B'].every(t => {
      const l = lineup && lineup[t];
      return Array.isArray(l) && l.length === 6 && new Set(l).size === 6 && l.every(n => n != null && n !== '' && !st.barredMatch[t][n]);
    });
  }

  function applyEvent(st, S, e) {
    const set = st.cur;
    const playing = st.phase === 'play';
    switch (e.type) {
      case 'setStart': {
        if ((st.phase !== 'toss' && st.phase !== 'setEnd') || !validLineup(st, e.lineup) || !e.serving || !e.left) return false;
        const s = newSet(S, st.sets.length, e);
        st.sets.push(s);
        st.cur = s;
        st.phase = 'play';
        return true;
      }
      case 'point':
        if (!playing) return false;
        addPoint(st, S, set, e.team, 'rally', e.time);
        return true;
      case 'timeout':
        if (!playing || set.timeouts[e.team].length >= S.timeoutsPerSet) return false;
        set.timeouts[e.team].push({ score: snapshot(set), time: e.time });
        st.alerts.push({ type: 'timeout', team: e.team });
        return true;
      case 'sub':
        if (!playing || !validSub(st, S, set, e)) return false;
        applySub(st, S, set, e);
        return true;
      case 'liberoIn': {     // {team, libero, out}: out = giocatore di seconda linea, oppure l'altro libero (cambio tra liberi)
        if (!playing) return false;
        const t = e.team, lib = set.libero[t];
        if (isBarred(st, set, t, e.libero) || onCourt(set, t, e.libero)) return false;
        if (lib) {
          if (e.out !== lib.no || e.libero === lib.no) return false;
          set.libero[t] = { no: e.libero, col: lib.col };
          set.liberoLog[t].push({ type: 'swap', no: e.libero, out: lib.no, score: snapshot(set) });
          return true;
        }
        const col = columnOf(set, t, e.out);
        const p = col < 0 ? -1 : set.rot[t].indexOf(col);
        if (!BACK_ROW.includes(p) || (p === 0 && set.serving === t)) return false;
        set.libero[t] = { no: e.libero, col };
        set.liberoLog[t].push({ type: 'in', no: e.libero, out: e.out, score: snapshot(set) });
        return true;
      }
      case 'liberoOut':
        if (!playing || !set.libero[e.team]) return false;
        liberoExit(st, set, e.team, 'manual');
        return true;
      case 'sanction': {
        if (!playing) return false;
        const rec = { team: e.team, player: e.player, kind: e.kind, set: set.index, score: snapshot(set), time: e.time };
        set.sanctions.push(rec);
        st.sanctions.push(rec);
        const info = SANCTIONS[e.kind];
        if (info && info.point) addPoint(st, S, set, other(e.team), 'penalty', e.time);
        const isPlayer = typeof e.player === 'number';
        if (isPlayer && e.kind === 'E') set.barred[e.team][e.player] = true;
        if (isPlayer && e.kind === 'D') st.barredMatch[e.team][e.player] = true;
        if (isPlayer && (e.kind === 'E' || e.kind === 'D') && st.phase === 'play') {
          const lib = set.libero[e.team];
          if (lib && lib.no === e.player) liberoExit(st, set, e.team, 'sanction');   // rientra il giocatore sostituito
          else if (onCourt(set, e.team, e.player) && !hiddenByLibero(set, e.team, e.player)) st.alerts.push({ type: 'mustSub', team: e.team, player: e.player });
        }
        return true;
      }
      case 'incomplete':     // squadra che non può più schierare 6 giocatori: perde il set (7.4.3)
        if (!playing) return false;
        awardSet(st, S, set, e.team, e.time);
        return true;
      case 'forfeit':
        if (st.phase === 'matchEnd') return false;
        awardMatch(st, S, e.team, e.time, e.reason || 'RIT');
        return true;
      default:
        return false;
    }
  }

  // ---------- proposte per il set successivo ----------
  // Primo set e set decisivo: sorteggio. Negli altri set serve per prima la squadra che
  // ha ricevuto per prima nel set precedente e le squadre cambiano campo.
  function nextSetDefaults(match, st) {
    const S = st.settings;
    const idx = st.sets.length;
    const prev = st.sets[idx - 1];
    const toss = needsToss(S, idx);
    const lineup = prev && prev.lineup ? both(t => prev.lineup[t].filter(n => !st.barredMatch[t][n])) : { A: [], B: [] };
    return {
      index: idx,
      needsToss: toss,
      serving: !toss && prev && prev.firstServing ? other(prev.firstServing) : null,
      left: !toss && prev && prev.startLeft ? other(prev.startLeft) : null,
      lineup
    };
  }

  // Chi serve in base alle scelte del sorteggio: chi vince sceglie servizio, ricezione o campo;
  // se sceglie il campo, l'altra squadra sceglie tra servizio e ricezione.
  function servingFromChoice(winner, choice, otherChoice) {
    if (!winner || !choice) return null;
    if (choice === 'serve') return winner;
    if (choice === 'receive') return other(winner);
    if (otherChoice === 'serve') return other(winner);
    if (otherChoice === 'receive') return winner;
    return null;
  }

  // Giocatori che possono entrare al posto di "out" (numeri presi dall'elenco "roster")
  function subOptions(st, team, out, roster) {
    const set = st.cur;
    if (!set || st.phase !== 'play' || !onCourt(set, team, out) || hiddenByLibero(set, team, out)) return { regular: [], exceptional: [], rule: null };
    const rule = regularSubRule(st, st.settings, set, team, out);
    const lib = set.libero[team];
    const bench = roster.filter(n => !onCourt(set, team, n) && !isBarred(st, set, team, n) && !(lib && lib.no === n));
    let regular = [];
    if (rule && rule.only != null) regular = bench.includes(rule.only) ? [rule.only] : [];
    else if (rule) regular = bench.filter(n => canEnterFree(st, set, team, n));
    return { regular, exceptional: bench, rule };
  }

  const api = {
    DEFAULT_SETTINGS, SANCTIONS, ROMAN, replay, nextSetDefaults, servingFromChoice, subOptions,
    other, settingsOf, minWomenOf, setsToWin, targetOf, isDeciding, needsToss, courtOf, visibleCourt, positionOf, onCourt, BACK_ROW
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Rules = api;
})(typeof window !== 'undefined' ? window : globalThis);
