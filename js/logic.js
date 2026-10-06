// Regole del torneo: liste d'ingresso, qualifiche, formule, gironi, tabelloni, piazzamenti e ranking.
const Logic = (() => {

  const BYE = '~bye';
  const FORMATS = ['pools_ko', 'fivb_pools', 'gold_silver', 'double_elim', 'single_elim', 'round_robin'];
  const real = id => !!id && id !== BYE;

  const hasPools = f => f === 'pools_ko' || f === 'fivb_pools' || f === 'round_robin' || f === 'gold_silver';
  const hasBracket = f => f !== 'round_robin';
  const round2 = x => Math.round(x * 100) / 100;

  function defaultConfig() {
    return {
      setsToWin: 2, setPoints: 21, tiebreakPoints: 15,
      poolSize: 4, qualify: 2, thirdPlace: true,
      mainSize: 16, directSpots: 12, qualSpots: 4, wcSpots: 0, qualWcSpots: 0, qualMax: 0
    };
  }

  const MAIN_SIZES = [32, 24, 16, 12, 8, 4];

  // Solo per il formato Gold & Silver (gli altri formati non hanno questi campi):
  // numero di gironi, dimensioni (3–5) e formula di ogni girone ('rr' | 'fivb'),
  // squadre che vanno nel Gold (le altre giocano il Silver), finale 3°/4° del Silver.
  const GS_DEFAULTS = { poolCount: 4, poolSizes: [], poolModes: [], goldSpots: 8, silverThird: false };

  // Completa i campi mancanti (tornei creati con versioni precedenti dell'app).
  function normalize(t) {
    const hadDirect = t.config && t.config.directSpots != null;
    t.config = Object.assign(defaultConfig(), t.config || {});
    if (!hadDirect) t.config.directSpots = Math.max(0, t.config.mainSize - t.config.qualSpots - t.config.wcSpots);
    if (!t.entries) {
      t.entries = (t.teams || []).map(x => ({ id: x.id, p1: x.p1, p2: x.p2, man1: null, man2: null, wc: !!x.wc }));
      Object.assign(t, { qual: null, mainIds: null, pools: null, bracket: null, results: {} });
    }
    delete t.teams;
    // wc: false | 'main' (wild card main draw) | 'qual' (wild card qualifiche)
    t.entries.forEach(e => { if (e.wc === true) e.wc = 'main'; if (!e.wc) e.wc = false; });
    // visible: gare pubblicate ai visitatori (chiave -> true). Le gare nuove sono nascoste.
    ['results', 'schedule', 'matchNo', 'visible'].forEach(k => { if (!t[k]) t[k] = {}; });
    ['qual', 'split', 'entryPts', 'mainList', 'mainIds', 'pools', 'bracket'].forEach(k => { if (t[k] === undefined) t[k] = null; });
    if (t.format === 'gold_silver') {
      t.config = Object.assign({}, GS_DEFAULTS, t.config);
      if (t.silver === undefined) t.silver = null;
      // tabelle punti del torneo (piazzamento nel Gold / nel Silver → punti)
      ['goldRows', 'silverRows'].forEach(k => { if (!Array.isArray(t[k])) t[k] = []; });
    }
    ['entryLocked', 'qualClosed', 'mainLocked', 'closed'].forEach(k => { t[k] = !!t[k]; });
    if (!t.start && t.date) t.start = t.date;
    if (t.coefficient == null) t.coefficient = 1;
    return t;
  }

  // ---------- formula di gioco ----------

  function setTarget(cfg, i) {
    return cfg.setsToWin > 1 && i === 2 * cfg.setsToWin - 2 ? cfg.tiebreakPoints : cfg.setPoints;
  }

  function isCompleteSet(x, y, target) {
    const hi = Math.max(x, y), lo = Math.min(x, y);
    return hi >= target && hi - lo >= 2 && (hi === target || hi - lo === 2);
  }

  // outcome: null | { type: 'inj' | 'dsq', team: 'a' | 'b' } (team = squadra che si ritira / è squalificata)
  function validateResult(sets, outcome, cfg) {
    const need = cfg.setsToWin;
    if (outcome && outcome.type === 'dsq') return null;
    if (sets.length > 2 * need - 1) return { key: 'errTooManySets' };
    let wa = 0, wb = 0;
    for (let i = 0; i < sets.length; i++) {
      const [a, b] = sets[i];
      const target = setTarget(cfg, i);
      if (wa === need || wb === need) return { key: 'errTooManySets' };
      if (!isCompleteSet(a, b, target)) {
        const hi = Math.max(a, b), lo = Math.min(a, b);
        const partialOk = outcome && i === sets.length - 1 && (hi < target || hi - lo <= 1);
        if (partialOk) continue;
        return { key: 'errInvalidSet', set: i + 1, target };
      }
      if (a > b) wa++; else wb++;
    }
    if (!outcome && wa !== need && wb !== need) return { key: 'errIncomplete' };
    if (outcome && (wa === need || wb === need)) return { key: 'errAlreadyDecided' };
    return null;
  }

  const emptyLine = () => ({ sw: 0, sl: 0, pw: 0, pl: 0, mp: 0 });

  // Statistiche della partita per ciascuna squadra, secondo il regolamento (INJ/DSQ e DSQ inclusi).
  function matchStats(res, cfg) {
    if (!res) return null;
    const A = emptyLine(), B = emptyLine();
    const o = res.outcome;
    const sets = res.sets || [];
    if (!o) {
      if (!sets.length) return null;
      sets.forEach(([x, y]) => {
        A.pw += x; A.pl += y; B.pw += y; B.pl += x;
        if (x > y) { A.sw++; B.sl++; } else { B.sw++; A.sl++; }
      });
      if (A.sw === B.sw) return null;
      const winner = A.sw > B.sw ? 'a' : 'b';
      (winner === 'a' ? A : B).mp = 2;
      (winner === 'a' ? B : A).mp = 1;
      return { winner, a: A, b: B, tag: '' };
    }
    const loserSide = o.team, winner = loserSide === 'a' ? 'b' : 'a';
    const L = loserSide === 'a' ? A : B, W = loserSide === 'a' ? B : A;
    const need = cfg.setsToWin;
    if (o.type === 'dsq') {
      for (let i = 0; i < need; i++) { L.pl += setTarget(cfg, i); W.sw++; L.sl++; }
      W.mp = 2; L.mp = 0;
      return { winner, a: A, b: B, tag: 'DSQ' };
    }
    let wWon = 0;
    sets.forEach(([x, y], i) => {
      const lp = loserSide === 'a' ? x : y, wp = loserSide === 'a' ? y : x;
      const target = setTarget(cfg, i);
      if (isCompleteSet(x, y, target)) {
        L.pw += lp; L.pl += wp; W.pw += wp; W.pl += lp;
        if (lp > wp) { L.sw++; W.sl++; } else { W.sw++; L.sl++; wWon++; }
      } else {
        L.pw += lp; L.pl += target; W.pw += wp; W.pl += lp;
        W.sw++; L.sl++; wWon++;
      }
    });
    for (let i = sets.length; wWon < need; i++) {
      L.pl += setTarget(cfg, i); W.sw++; L.sl++; wWon++;
    }
    W.mp = 2; L.mp = 1;
    return { winner, a: A, b: B, tag: 'INJ/DSQ' };
  }

  // ---------- utilità ----------

  function seedOrder(n) {
    let o = [1];
    while (o.length < n) {
      const m = o.length * 2;
      o = o.flatMap(s => [s, m + 1 - s]);
    }
    return o;
  }

  function snake(ids, groups) {
    const out = Array.from({ length: groups }, () => []);
    ids.forEach((id, i) => {
      const row = Math.floor(i / groups), col = i % groups;
      out[row % 2 === 0 ? col : groups - 1 - col].push(id);
    });
    return out;
  }

  // Gironi tutti contro tutti con calendario fisso [squadra, squadra, turno]:
  // da 3: 1° turno 1-3, 2° turno 2-3, 3° turno 1-2; da 4: 1° turno 1-4, 2-3; 2° turno 1-3, 2-4; 3° turno 3-4, 1-2.
  const RR_FIXED = { 3: [[0, 2, 1], [1, 2, 2], [0, 1, 3]], 4: [[0, 3, 1], [1, 2, 1], [0, 2, 2], [1, 3, 2], [2, 3, 3], [0, 1, 3]] };
  function roundRobin(ids) {
    if (RR_FIXED[ids.length]) return RR_FIXED[ids.length].map(([a, b, round]) => ({ a: ids[a], b: ids[b], round }));
    const list = ids.slice();
    if (list.length % 2) list.push(null);
    const n = list.length, out = [];
    for (let r = 0; r < n - 1; r++) {
      for (let i = 0; i < n / 2; i++) {
        const a = list[i], b = list[n - 1 - i];
        if (a !== null && b !== null) out.push({ a: r % 2 ? b : a, b: r % 2 ? a : b, round: r + 1 });
      }
      list.splice(1, 0, list.pop());
    }
    return out;
  }

  // Gironi da 3 e da 4 tutti contro tutti creati con il calendario precedente: gare rimesse nell'ordine e nei turni
  // del calendario fisso (RR_FIXED). Ogni gara tiene la sua chiave (risultati, orari, referti restano collegati); l'ordine
  // delle squadre (chi è scritta per prima) si corregge solo nelle gare senza risultato né referto (keep(key) = false).
  function fixRR4(t, keep) {
    if (!t.pools) return false;
    let changed = false;
    t.pools.forEach((pool, pi) => {
      const plan = RR_FIXED[pool.teamIds.length];
      if (isFivbPool(t, pi) || !plan || !pool.matches || pool.matches.length !== plan.length) return;
      const ids = pool.teamIds, used = new Set();
      const next = plan.map(([x, y, round]) => {
        const m = pool.matches.find(k => !used.has(k.key) && ((k.a === ids[x] && k.b === ids[y]) || (k.a === ids[y] && k.b === ids[x])));
        if (!m) return null;
        used.add(m.key);
        return keep(m.key) ? { key: m.key, a: m.a, b: m.b, round } : { key: m.key, a: ids[x], b: ids[y], round };
      });
      if (next.some(x => !x)) return;
      if (JSON.stringify(next) !== JSON.stringify(pool.matches.map(m => ({ key: m.key, a: m.a, b: m.b, round: m.round })))) {
        pool.matches = next;
        changed = true;
      }
    });
    return changed;
  }

  function ratio(pw, pl) {
    return pl === 0 ? (pw > 0 ? Infinity : 0) : pw / pl;
  }

  function cmpRatio(x, y) {
    const d = ratio(y.pw, y.pl) - ratio(x.pw, x.pl);
    return isNaN(d) ? 0 : d;
  }

  // Risolve una partita: squadre note, bye automatici. Conta solo il risultato di una GARA CHIUSA.
  function decide(t, key, a, b) {
    const m = { key, a, b, winner: null, loser: null, res: null, draft: null, stats: null, bye: false };
    if (a === BYE || b === BYE) {
      if (a == null || b == null) return m;
      m.bye = true;
      m.winner = a === BYE ? b : a;
      m.loser = BYE;
      return m;
    }
    if (real(a) && real(b)) {
      const res = t.results[key];
      if (res && res.a === a && res.b === b) {
        if (!res.closed) { m.draft = res; return m; }
        m.res = res;
        m.stats = matchStats(res, t.config);
        if (m.stats) {
          m.winner = m.stats.winner === 'a' ? a : b;
          m.loser = m.stats.winner === 'a' ? b : a;
        }
      }
    }
    return m;
  }

  function singleRounds(t, slots, nRounds, prefix) {
    const rounds = [];
    let cur = slots;
    for (let r = 0; r < nRounds; r++) {
      const round = [];
      for (let i = 0; i < cur.length / 2; i++) {
        const m = decide(t, `${prefix}${r}-${i}`, cur[2 * i], cur[2 * i + 1]);
        m.round = r;
        round.push(m);
      }
      rounds.push(round);
      cur = round.map(m => m.winner);
    }
    return rounds;
  }

  // ---------- categorie, punti e ranking ----------

  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ς/g, 'σ').replace(/\s+/g, ' ').trim();
  }

  // Chiave "fonetica" di un nome: il greco viene traslitterato e le grafie latine più comuni
  // vengono uniformate, così "Papadopoulos" e "Παπαδόπουλος" risultano la stessa persona.
  const GREEK_DIGRAPHS = [['ου', 'u'], ['αι', 'e'], ['ει', 'i'], ['οι', 'i'], ['υι', 'i'], ['αυ', 'av'], ['ευ', 'ev'],
    ['μπ', 'b'], ['ντ', 'd'], ['γγ', 'g'], ['γκ', 'g'], ['γχ', 'gh'], ['τσ', 'ts'], ['τζ', 'tz']];
  const GREEK_LETTERS = {
    α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x',
    ο: 'o', π: 'p', ρ: 'r', σ: 's', τ: 't', υ: 'i', φ: 'f', χ: 'h', ψ: 'ps', ω: 'o'
  };
  const LATIN_RULES = [[/ou/g, 'u'], [/ph/g, 'f'], [/kh|ch/g, 'h'], [/ck|c|q/g, 'k'], [/w/g, 'o'], [/y/g, 'i'],
    [/ai/g, 'e'], [/ei|oi/g, 'i'], [/mp/g, 'b'], [/nt/g, 'd'], [/ng|gk/g, 'g'], [/ks/g, 'x'], [/g(?=i[aeou])/g, ''],
    [/[^a-z]/g, ''], [/(.)\1+/g, '$1']];

  function nameSkeleton(s) {
    let x = norm(s);
    GREEK_DIGRAPHS.forEach(([g, l]) => { x = x.split(g).join(l); });
    x = x.replace(/[α-ω]/g, c => GREEK_LETTERS[c] || '');
    LATIN_RULES.forEach(([re, r]) => { x = x.replace(re, r); });
    return x;
  }

  const nameKey = (last, first) => nameSkeleton(last) + '|' + nameSkeleton(first);

  function tablePoints(place, rows) {
    let pts = 0;
    (rows || []).slice().sort((x, y) => x[0] - y[0]).forEach(([p, v]) => { if (place >= p) pts = v; });
    return pts;
  }

  // Punti della squadra per un piazzamento: tabella della categoria × coefficiente del torneo.
  // Gold & Silver: tabella Gold per i piazzamenti nel Gold, tabella Silver (dal 1° del Silver) per gli altri.
  function teamPoints(state, t, place) {
    if (t.format === 'gold_silver') {
      const g = goldCount(t);
      const pts = place <= g ? tablePoints(place, t.goldRows) : tablePoints(place - g, t.silverRows);
      return round2(pts * (Number(t.coefficient) || 0));
    }
    const cat = state.categories.find(c => c.id === t.categoryId);
    return round2(tablePoints(place, cat && cat.rows) * (Number(t.coefficient) || 0));
  }

  // Ogni giocatore riceve metà dei punti della squadra.
  function playerPoints(state, t, place) {
    return round2(teamPoints(state, t, place) / 2);
  }

  // Classifica generale: punti iniziali (importati) + metà dei punti di squadra di ogni torneo chiuso.
  // I tornei misti (gender 'X') danno i punti a ciascun giocatore nella classifica del proprio genere.
  function ranking(state, gender, categoryId) {
    const rows = {};
    state.players.filter(p => p.gender === gender).forEach(p => {
      rows[p.id] = { id: p.id, base: categoryId ? 0 : (Number(p.base) || 0), fromEvents: 0, total: 0, events: 0, best: null };
    });
    state.tournaments
      .filter(t => t.closed && (t.gender === gender || t.gender === 'X') && (!categoryId || t.categoryId === categoryId))
      .forEach(t => {
        const pl = placements(t);
        if (!pl) return;
        t.entries.forEach(e => {
          const place = pl[e.id];
          if (place == null) return;
          const pts = playerPoints(state, t, place);
          [e.p1, e.p2].forEach(pid => {
            const r = rows[pid];
            if (!r) return;
            r.fromEvents += pts; r.events++;
            r.best = r.best == null ? place : Math.min(r.best, place);
          });
        });
      });
    const list = Object.values(rows);
    list.forEach(r => { r.total = round2(r.base + r.fromEvents); });
    return list.sort((x, y) => y.total - x.total || (x.best || 999) - (y.best || 999));
  }

  // Storico dei tornei chiusi di un giocatore.
  function playerHistory(state, pid) {
    const out = [];
    state.tournaments.filter(t => t.closed).forEach(t => {
      const pl = placements(t);
      if (!pl) return;
      const e = t.entries.find(x => x.p1 === pid || x.p2 === pid);
      if (!e || pl[e.id] == null) return;
      out.push({ t, place: pl[e.id], partner: e.p1 === pid ? e.p2 : e.p1, pts: playerPoints(state, t, pl[e.id]) });
    });
    return out.sort((a, b) => (b.t.start || '').localeCompare(a.t.start || ''));
  }

  // ---------- lista d'ingresso ----------

  // Punti dei due giocatori: fotografati al blocco della lista, altrimenti manuali o dal ranking.
  function entryPts(t, e, rankMap) {
    if (t.entryPts && t.entryPts[e.id]) return t.entryPts[e.id];
    const auto = id => (rankMap && rankMap[id]) || 0;
    return [e.man1 != null ? e.man1 : auto(e.p1), e.man2 != null ? e.man2 : auto(e.p2)];
  }

  const entryTotal = (t, e, rankMap) => round2(entryPts(t, e, rankMap).reduce((a, b) => a + b, 0));

  function sortEntries(t, rankMap) {
    const idx = new Map(t.entries.map((e, i) => [e.id, i]));
    t.entries.sort((x, y) => entryTotal(t, y, rankMap) - entryTotal(t, x, rankMap) || idx.get(x.id) - idx.get(y.id));
  }

  // Suddivisione: wild card main draw + dirette nel tabellone principale; poi qualifiche
  // (wild card qualifiche + migliori per punti, fino al massimo); il resto sono riserve.
  // Le wild card non assegnate vanno alle squadre successive in lista.
  function computeSplit(t) {
    const c = t.config;
    const list = t.entries.map(e => e.id);
    const wc = t.entries.filter(e => e.wc === 'main').slice(0, c.wcSpots).map(e => e.id);
    const others = list.filter(id => !wc.includes(id));
    const direct = Math.max(0, c.mainSize - c.qualSpots - wc.length);
    const main = list.filter(id => wc.includes(id) || others.indexOf(id) > -1 && others.indexOf(id) < direct);
    const rest = others.slice(direct);
    let qual = [], reserve = rest, qualWc = [];
    if (c.qualSpots > 0) {
      if (c.qualMax > 0) {
        qualWc = t.entries.filter(e => e.wc === 'qual' && rest.includes(e.id)).slice(0, c.qualWcSpots || 0).map(e => e.id);
        const free = rest.filter(id => !qualWc.includes(id));
        const picked = new Set(qualWc.concat(free.slice(0, Math.max(0, c.qualMax - qualWc.length))));
        qual = rest.filter(id => picked.has(id));
        reserve = rest.filter(id => !picked.has(id));
      } else {
        qualWc = t.entries.filter(e => e.wc === 'qual' && rest.includes(e.id)).slice(0, c.qualWcSpots || 0).map(e => e.id);
        qual = rest;
        reserve = [];
      }
    }
    return { main, qual, reserve, wc, qualWc };
  }

  function lockEntries(t, rankMap) {
    t.entryPts = {};
    t.entries.forEach(e => { t.entryPts[e.id] = entryPts(t, e, rankMap); });
    t.split = computeSplit(t);
    t.entryLocked = true;
  }

  function unlockEntries(t) {
    t.entryLocked = false; t.entryPts = null; t.split = null;
  }

  const qualNeeded = t => !!t.split && t.split.qual.length > t.config.qualSpots;

  function generateQual(t) {
    const ids = t.split.qual, spots = t.config.qualSpots;
    let k = 1;
    while (spots * 2 ** k < ids.length) k++;
    const size = 2 ** k, order = seedOrder(size), slots = [];
    snake(ids, spots).forEach(sec => order.forEach(s => slots.push(s <= sec.length ? sec[s - 1] : BYE)));
    t.qual = { rounds: k, slots };
  }

  function computeQual(t) {
    return t.qual ? singleRounds(t, t.qual.slots, t.qual.rounds, 'Q') : null;
  }

  function qualWinners(t) {
    const rounds = computeQual(t);
    if (!rounds) return null;
    const w = rounds[rounds.length - 1].map(m => m.winner);
    return w.every(real) ? w : null;
  }

  // Chiude le qualifiche: lista del tabellone principale = ammesse + qualificate, ordinata per punti.
  function closeQual(t) {
    const winners = t.qual ? qualWinners(t) : t.split.qual.slice();
    const ids = t.split.main.concat(winners);
    const total = id => entryTotal(t, t.entries.find(e => e.id === id));
    const pos = new Map(ids.map((id, i) => [id, i]));
    t.mainList = ids.sort((x, y) => total(y) - total(x) || pos.get(x) - pos.get(y));
    t.qualClosed = true;
    t.mainLocked = false;
  }

  function reopenQual(t) {
    t.qualClosed = false; t.mainList = null; t.mainLocked = false;
  }

  // ---------- tabellone principale ----------

  function mainDrawCheck(t) {
    const n = (t.mainList || []).length, c = t.config;
    switch (t.format) {
      case 'pools_ko': {
        const P = Math.ceil(n / c.poolSize);
        if (n < 3 || Math.floor(n / P) < 2) return { key: 'needTeams', min: 3 };
        if (Math.floor(n / P) < c.qualify) return { key: 'errQualifyTooHigh' };
        if (c.qualify * P < 2) return { key: 'errQualifyTooLow' };
        return null;
      }
      case 'fivb_pools':
        if (n < 8 || n % 4) return { key: 'needMultiple4' };
        if (c.qualify > 4 || c.qualify < 1) return { key: 'errQualifyTooHigh' };
        return null;
      case 'gold_silver': {
        if (n < 6) return { key: 'needTeams', min: 6 };
        const sizes = gsSizes(t, n);
        if (sizes.some(x => x < 3 || x > 5)) return { key: 'errPoolSizes' };
        if (c.goldSpots < 2 || c.goldSpots > Math.min(16, n)) return { key: 'errGoldSpots', max: Math.min(16, n) };
        return null;
      }
      case 'double_elim': return n < 4 ? { key: 'needTeams', min: 4 } : null;
      case 'round_robin': return n < 3 ? { key: 'needTeams', min: 3 } : null;
      default: return n < 2 ? { key: 'needTeams', min: 2 } : null;
    }
  }

  function startMainDraw(t) {
    t.mainIds = t.mainList.slice();
    const ids = t.mainIds, f = t.format;
    if (!hasPools(f)) { generateBracket(t); return; }
    let groups;
    if (f === 'gold_silver') {
      const sizes = gsSizes(t, ids.length);
      groups = snakeSizes(ids, sizes);
      t.pools = groups.map((teamIds, pi) => {
        const mode = teamIds.length === 4 && (t.config.poolModes || [])[pi] === 'fivb' ? 'fivb' : 'rr';
        return {
          name: String.fromCharCode(65 + pi), teamIds, mode,
          matches: mode === 'fivb' ? [] : roundRobin(teamIds).map((m, n) => ({ key: `P${pi}-${n}`, a: m.a, b: m.b, round: m.round }))
        };
      });
      return;
    }
    if (f === 'round_robin') groups = [ids.slice()];
    else if (f === 'fivb_pools') groups = snake(ids, ids.length / 4);
    else groups = snake(ids, Math.ceil(ids.length / t.config.poolSize));
    t.pools = groups.map((teamIds, pi) => ({
      name: f === 'round_robin' ? '' : String.fromCharCode(65 + pi),
      teamIds,
      matches: f === 'fivb_pools' ? [] : roundRobin(teamIds).map((m, n) => ({ key: `P${pi}-${n}`, a: m.a, b: m.b, round: m.round }))
    }));
  }

  // ---------- Gold & Silver ----------
  // Dimensioni dei gironi: quelle scelte dall'admin se tornano con il numero di squadre,
  // altrimenti distribuzione automatica nei gironi previsti (differenze di al massimo 1).
  function gsSizes(t, n) {
    const c = t.config;
    const set = (c.poolSizes || []).map(Number).filter(x => x > 0);
    if (set.length && set.reduce((a, b) => a + b, 0) === n) return set;
    const P = Math.max(1, Math.min(Math.round(c.poolCount) || 1, Math.floor(n / 3) || 1));
    return Array.from({ length: P }, (_, i) => Math.floor(n / P) + (i < n % P ? 1 : 0));
  }

  // Serpentina per ranking con gironi di dimensioni diverse (i gironi pieni vengono saltati).
  function snakeSizes(ids, sizes) {
    const out = sizes.map(() => []);
    const order = sizes.map((_, i) => i);
    let k = 0, row = 0;
    while (k < ids.length) {
      const dir = row % 2 === 0 ? order : order.slice().reverse();
      dir.forEach(pi => { if (k < ids.length && out[pi].length < sizes[pi]) out[pi].push(ids[k++]); });
      row++;
    }
    return out;
  }

  const isFivbPool = (t, pi) => t.format === 'fivb_pools' || !!(t.pools && t.pools[pi] && t.pools[pi].mode === 'fivb');

  // Squadre del Gold e del Silver dai gironi: prima tutte le 1ª, poi le 2ª, ecc.; dentro ogni posizione
  // (e per scegliere le migliori terze) conta il quoziente punti nel girone.
  function gsSplit(t) {
    const st = t.pools.map((_, i) => poolStandings(t, i));
    const levels = [];
    const maxLen = Math.max(...st.map(s => s.length));
    for (let r = 0; r < maxLen; r++) {
      const lv = [];
      st.forEach((s, pi) => { if (s[r]) lv.push({ id: s[r].id, rank: r + 1, pool: t.pools[pi].name, row: s[r] }); });
      lv.sort((x, y) => cmpRatio(x.row, y.row) || seedOf(t, x.id) - seedOf(t, y.id));
      levels.push(lv);
    }
    const all = levels.flat();
    const g = Math.min(t.config.goldSpots, all.length);
    return { gold: all.slice(0, g), silver: all.slice(g) };
  }

  const goldCount = t => (t.bracket ? t.bracket.qualified : Math.min(t.config.goldSpots, t.config.mainSize));
  const bracketSize = n => { let size = 16; while (size < n) size *= 2; return size; };

  function seedOf(t, id) {
    const i = (t.mainIds || []).indexOf(id);
    return i < 0 ? 1e9 : i + 1;
  }

  function poolMatches(t, pi) {
    const pool = t.pools[pi];
    if (!isFivbPool(t, pi)) {
      return pool.matches.map(m => Object.assign(decide(t, m.key, m.a, m.b), { round: m.round }));
    }
    const ids = pool.teamIds;
    const m1 = decide(t, `P${pi}-M1`, ids[0], ids[3]);
    const m2 = decide(t, `P${pi}-M2`, ids[1], ids[2]);
    const m3 = decide(t, `P${pi}-M3`, m1.winner, m2.winner);
    const m4 = decide(t, `P${pi}-M4`, m1.loser, m2.loser);
    [m1, m2, m3, m4].forEach((m, i) => { m.round = i < 2 ? 1 : 2; m.label = 'M' + (i + 1); });
    m3.label = 'W'; m4.label = 'L';
    return [m1, m2, m3, m4];
  }

  function poolStandings(t, pi) {
    const pool = t.pools[pi];
    const matches = poolMatches(t, pi);
    const rows = pool.teamIds.map(id => Object.assign({ id, played: 0, w: 0, l: 0 }, emptyLine()));
    const by = Object.fromEntries(rows.map(r => [r.id, r]));
    matches.forEach(m => {
      if (!m.stats) return;
      [['a', m.a], ['b', m.b]].forEach(([side, id]) => {
        const r = by[id], s = m.stats[side];
        r.played++; r.sw += s.sw; r.sl += s.sl; r.pw += s.pw; r.pl += s.pl; r.mp += s.mp;
        if (m.stats.winner === side) r.w++; else r.l++;
      });
    });
    const seed = r => seedOf(t, r.id);

    if (isFivbPool(t, pi)) {
      const [, , m3, m4] = matches;
      if (real(m3.winner) && real(m4.winner)) return [m3.winner, m3.loser, m4.winner, m4.loser].map(id => by[id]);
      return rows.sort((x, y) => y.mp - x.mp || seed(x) - seed(y));
    }

    const h2h = (x, y) => {
      const m = matches.find(mm => mm.stats && ((mm.a === x.id && mm.b === y.id) || (mm.a === y.id && mm.b === x.id)));
      if (!m) return 0;
      return m.winner === x.id ? -1 : 1;
    };
    const sorted = rows.slice().sort((x, y) => y.mp - x.mp);
    const out = [];
    for (let i = 0; i < sorted.length;) {
      let j = i;
      while (j < sorted.length && sorted[j].mp === sorted[i].mp) j++;
      const g = sorted.slice(i, j);
      if (g.length === 2) {
        g.sort((x, y) => cmpRatio(x, y) || h2h(x, y) || seed(x) - seed(y));
      } else if (g.length > 2) {
        const ids = new Set(g.map(r => r.id));
        const mini = Object.fromEntries(g.map(r => [r.id, { pw: 0, pl: 0 }]));
        matches.forEach(m => {
          if (!m.stats || !ids.has(m.a) || !ids.has(m.b)) return;
          mini[m.a].pw += m.stats.a.pw; mini[m.a].pl += m.stats.a.pl;
          mini[m.b].pw += m.stats.b.pw; mini[m.b].pl += m.stats.b.pl;
        });
        g.sort((x, y) => cmpRatio(mini[x.id], mini[y.id]) || cmpRatio(x, y) || seed(x) - seed(y));
      }
      out.push(...g);
      i = j;
    }
    return out;
  }

  function poolsComplete(t) {
    return !!t.pools && t.pools.every((_, pi) => poolMatches(t, pi).every(m => m.stats));
  }

  function poolQualifiers(t) {
    if (t.format === 'gold_silver') return gsSplit(t).gold.map(x => x.id);
    const st = t.pools.map((_, i) => poolStandings(t, i));
    const q = [];
    for (let r = 0; r < t.config.qualify; r++) st.forEach(s => { if (s[r]) q.push(s[r].id); });
    return q;
  }

  function avoidSamePool(t, slots) {
    const poolOf = {};
    t.pools.forEach((p, pi) => p.teamIds.forEach(id => { poolOf[id] = pi; }));
    const clash = i => real(slots[2 * i]) && real(slots[2 * i + 1]) && poolOf[slots[2 * i]] === poolOf[slots[2 * i + 1]];
    const n = slots.length / 2;
    for (let i = 0; i < n; i++) {
      if (!clash(i)) continue;
      for (let j = n - 1; j >= 0; j--) {
        if (j === i || !real(slots[2 * j + 1])) continue;
        [slots[2 * i + 1], slots[2 * j + 1]] = [slots[2 * j + 1], slots[2 * i + 1]];
        if (!clash(i) && !clash(j)) break;
        [slots[2 * i + 1], slots[2 * j + 1]] = [slots[2 * j + 1], slots[2 * i + 1]];
      }
    }
  }

  // Tabellone: per i formati a gironi le posizioni restano vuote e le assegna l'admin
  // (oppure con autoFillBracket); negli altri formati si riempie per teste di serie.
  function generateBracket(t) {
    if (t.format === 'gold_silver') {
      const sp = gsSplit(t);
      t.bracket = { size: bracketSize(sp.gold.length), slots: [], qualified: sp.gold.length, manual: true };
      autoFillBracket(t);
      t.silver = sp.silver.length >= 2 ? { size: bracketSize(sp.silver.length), slots: [], qualified: sp.silver.length } : null;
      if (t.silver) autoFillSilver(t);
      return;
    }
    const ids = hasPools(t.format) ? poolQualifiers(t) : t.mainIds;
    let size = 2;
    while (size < ids.length) size *= 2;
    if (t.format === 'double_elim' && size < 4) size = 4;
    t.bracket = { size, slots: new Array(size).fill(null), qualified: ids.length, manual: hasPools(t.format) };
    if (!t.bracket.manual) autoFillBracket(t);
  }

  // Ordine delle teste di serie (e dei bye) nei tabelloni Gold e Silver: prima tutte le 1ª, poi le 2ª, ecc.;
  // dentro ogni posizione contano i punti nel girone (2 vittoria, 1 sconfitta; nei gironi FIVB quelli del
  // percorso vincenti/perdenti), poi il quoziente punti.
  function gsSeedSort(t, list) {
    return list.slice().sort((x, y) => x.rank - y.rank || y.row.mp - x.row.mp || cmpRatio(x.row, y.row) || seedOf(t, x.id) - seedOf(t, y.id));
  }

  const gsPoolOf = t => {
    const poolOf = {};
    t.pools.forEach((p, pi) => p.teamIds.forEach(id => { poolOf[id] = pi; }));
    return poolOf;
  };

  // Tabellone per teste di serie senza squadre dello stesso girone nello stesso blocco di 4 posizioni
  // (quindi mai contro nei primi due turni). Se una testa di serie non può stare al suo posto, prende
  // quello libero più vicino, prima nella stessa fascia (1, 2, 3-4, 5-8, 9-16…).
  function gsPlaceSeeds(t, ids, size) {
    const poolOf = gsPoolOf(t), n = ids.length;
    const order = seedOrder(size);
    const tier = s => (s <= 2 ? s : 2 ** Math.ceil(Math.log2(s)));
    // Chi gioca il 1° turno resta su una posizione con avversario; chi ha il bye resta con il bye
    // (anche spostandosi in una coppia di posizioni vuota).
    const vsTeam = s => s <= n && size + 1 - s <= n;
    const same = (k, s) => (vsTeam(k) ? vsTeam(s) : (s <= n && !vsTeam(s)) || (s > n && size + 1 - s > n));
    const candidates = strict => [null].concat(Array.from({ length: n }, (_, i) => {
      const k = i + 1;
      const ok = order.map((s, slot) => ({ s, slot })).filter(x => !strict || same(k, x.s));
      ok.sort((x, y) => (!same(k, x.s)) - (!same(k, y.s)) || (tier(x.s) !== tier(k)) - (tier(y.s) !== tier(k)) ||
        Math.abs(x.s - k) - Math.abs(y.s - k) || x.s - y.s);
      return ok.map(x => x.slot);
    }));
    // Prima si rispettano i bye; solo se è impossibile una squadra può scambiarsi con una che ha il bye.
    // Se lo stesso girone non si può separare del tutto, si accetta il minimo di incroci, sempre rispettando prima i bye.
    // Ordine di ricerca: per testa di serie; se non basta, prima chi gioca il 1° turno (ha meno posti possibili).
    const strictCand = candidates(true), freeCand = candidates(false);
    const bySeed = Array.from({ length: n }, (_, i) => i + 1);
    const playFirst = bySeed.filter(k => vsTeam(k)).concat(bySeed.filter(k => !vsTeam(k)));
    const passes = [];
    for (let a = 0; a <= n; a++) {
      [strictCand, freeCand].forEach(cand => { passes.push([cand, a, bySeed, 20000], [cand, a, playFirst, 200000]); });
    }
    let best = null;
    for (const [cand, allowed, seq, limit] of passes) {
      if (best) break;
      const used = new Array(size).fill(false), blocks = {}, res = [];
      let nodes = 0;
      const strict = cand === strictCand;
      const rem = {}, free = new Array(size / 4).fill(4);
      ids.forEach(id => { rem[poolOf[id]] = (rem[poolOf[id]] || 0) + 1; });
      // Ogni girone deve ancora trovare abbastanza blocchi liberi in cui non è presente.
      const room = () => Object.keys(rem).every(p => {
        if (!rem[p]) return true;
        let c = 0;
        free.forEach((f, b) => { if (f && !(blocks[b] || []).includes(+p)) c++; });
        return c >= rem[p];
      });
      const open = (slot, pool) => !used[slot] && !(strict && used[slot ^ 1] && order[slot] > n) && !(blocks[slot >> 2] || []).includes(pool);
      // Ogni squadra ancora da sistemare deve avere almeno un posto libero senza il suo girone.
      const ahead = from => {
        for (let j = from; j < n; j++) {
          const k = seq[j], pool = poolOf[ids[k - 1]];
          if (!cand[k].some(slot => open(slot, pool))) return false;
        }
        return true;
      };
      const dfs = (j, left) => {
        if (j >= n) return true;
        if (++nodes > limit) return false;
        const k = seq[j], pool = poolOf[ids[k - 1]];
        for (const slot of cand[k]) {
          if (used[slot] || strict && used[slot ^ 1] && order[slot] > n) continue;
          const b = slot >> 2, list = blocks[b] || (blocks[b] = []);
          const c = list.includes(pool) ? 1 : 0;
          if (c > left) continue;
          used[slot] = true; list.push(pool); res[k] = slot; free[b]--; rem[pool]--;
          if ((left - c > 0 || room() && ahead(j + 1)) && dfs(j + 1, left - c)) return true;
          used[slot] = false; list.pop(); free[b]++; rem[pool]++;
        }
        return false;
      };
      if (dfs(0, allowed)) best = res;
    }
    const slots = new Array(size).fill(BYE);
    ids.forEach((id, i) => { slots[best ? best[i + 1] : order.indexOf(i + 1)] = id; });
    return slots;
  }

  // Blocchi di 4 posizioni con due squadre dello stesso girone (per avvisare l'admin).
  function gsClashes(t, slots) {
    const poolOf = gsPoolOf(t), out = [];
    for (let b = 0; b * 4 < slots.length; b++) {
      const seen = {};
      slots.slice(b * 4, b * 4 + 4).filter(real).forEach(id => {
        const p = poolOf[id];
        if (p == null) return;
        if (seen[p]) out.push({ block: b, a: seen[p], b: id, pool: t.pools[p].name });
        else seen[p] = id;
      });
    }
    return out;
  }

  function autoFillSilver(t) {
    const ids = gsSeedSort(t, gsSplit(t).silver).map(x => x.id);
    t.silver.slots = gsPlaceSeeds(t, ids, t.silver.size);
  }

  function autoFillBracket(t) {
    if (t.format === 'gold_silver') {
      t.bracket.slots = gsPlaceSeeds(t, gsSeedSort(t, gsSplit(t).gold).map(x => x.id), t.bracket.size);
      return;
    }
    const ids = hasPools(t.format) ? poolQualifiers(t) : t.mainIds;
    const slots = seedOrder(t.bracket.size).map(s => (s <= ids.length ? ids[s - 1] : BYE));
    if (hasPools(t.format)) avoidSamePool(t, slots);
    t.bracket.slots = slots;
  }

  // Squadre qualificate dai gironi, con la posizione (es. 1° girone A) per il menu a tendina.
  function bracketCandidates(t) {
    if (!t.pools) return [];
    if (t.format === 'gold_silver') return gsSeedSort(t, gsSplit(t).gold).map(x => ({ id: x.id, rank: x.rank, pool: x.pool, mp: x.row.mp }));
    const out = [];
    for (let r = 0; r < t.config.qualify; r++) {
      t.pools.forEach((p, pi) => {
        const row = poolStandings(t, pi)[r];
        if (row) out.push({ id: row.id, rank: r + 1, pool: p.name });
      });
    }
    return out;
  }

  // ---------- schema delle gare e numerazione ----------
  // Lo schema del tabellone principale è noto già alla creazione del torneo (schema, formula, gironi):
  // le gare hanno subito numero e chiave, e le squadre le riempiono man mano.

  function fivbPoolMatches(pi) {
    return [
      { key: `P${pi}-M1`, round: 1, a: 0, b: 3, label: 'M1' }, { key: `P${pi}-M2`, round: 1, a: 1, b: 2, label: 'M2' },
      { key: `P${pi}-M3`, round: 2, label: 'W', from: ['W', `P${pi}-M1`, `P${pi}-M2`] },
      { key: `P${pi}-M4`, round: 2, label: 'L', from: ['L', `P${pi}-M1`, `P${pi}-M2`] }
    ];
  }

  // Gironi previsti: quelli reali se generati, altrimenti ricavati dalle impostazioni.
  function poolPlan(t) {
    if (!hasPools(t.format)) return [];
    if (t.pools) {
      return t.pools.map((p, pi) => ({ name: p.name, size: p.teamIds.length, matches: isFivbPool(t, pi) ? fivbPoolMatches(pi) : p.matches.map(m => ({ key: m.key, round: m.round, a: p.teamIds.indexOf(m.a), b: p.teamIds.indexOf(m.b) })) }));
    }
    const c = t.config, n = c.mainSize, f = t.format;
    let sizes;
    if (f === 'gold_silver') {
      return gsSizes(t, n).map((size, pi) => ({
        name: String.fromCharCode(65 + pi), size,
        matches: size === 4 && (c.poolModes || [])[pi] === 'fivb' ? fivbPoolMatches(pi)
          : roundRobin(Array.from({ length: size }, (_, i) => i)).map((m, k) => ({ key: `P${pi}-${k}`, round: m.round, a: m.a, b: m.b }))
      }));
    }
    if (f === 'round_robin') sizes = [n];
    else if (f === 'fivb_pools') sizes = new Array(Math.max(1, Math.floor(n / 4))).fill(4);
    else sizes = snake(Array.from({ length: n }, (_, i) => i), Math.ceil(n / c.poolSize)).map(g => g.length);
    return sizes.map((size, pi) => ({
      name: f === 'round_robin' ? '' : String.fromCharCode(65 + pi), size,
      matches: f === 'fivb_pools' ? fivbPoolMatches(pi)
        : roundRobin(Array.from({ length: size }, (_, i) => i)).map((m, k) => ({ key: `P${pi}-${k}`, round: m.round, a: m.a, b: m.b }))
    }));
  }

  function bracketSizeFor(t) {
    if (t.bracket) return t.bracket.size;
    if (!hasBracket(t.format)) return 0;
    if (t.format === 'gold_silver') return bracketSize(goldCount(t));
    const n = hasPools(t.format) ? poolPlan(t).length * t.config.qualify : (t.mainIds ? t.mainIds.length : t.config.mainSize);
    let size = 2;
    while (size < n) size *= 2;
    return t.format === 'double_elim' ? Math.max(4, size) : size;
  }

  // Silver: squadre non qualificate al Gold (tabellone da 16, più grande solo se servono più posti).
  function silverSizeFor(t) {
    if (t.format !== 'gold_silver') return 0;
    if (t.silver) return t.silver.size;
    if (t.bracket) return 0;
    const n = t.config.mainSize - goldCount(t);
    return n >= 2 ? bracketSize(n) : 0;
  }

  function silverPlan(t) {
    const size = silverSizeFor(t);
    if (!size) return [];
    const k = Math.round(Math.log2(size)), out = [];
    const round = r => { for (let i = 0; i < size / 2 ** (r + 1); i++) out.push({ key: `S${r}-${i}`, stage: 'silver', round: r, i, rounds: k, size }); };
    for (let r = 0; r < k - 1; r++) round(r);
    if (t.config.silverThird && k >= 2) out.push({ key: 'S3rd', stage: 'silver3', size });
    round(k - 1);
    return out;
  }

  // Chiavi delle gare del tabellone nell'ordine di numerazione (turno per turno, dall'alto; 3°/4° prima della finale).
  function bracketPlan(t) {
    const size = bracketSizeFor(t);
    if (!size) return [];
    const k = Math.round(Math.log2(size)), out = [];
    const wb = r => { for (let i = 0; i < size / 2 ** (r + 1); i++) out.push({ key: `W${r}-${i}`, stage: t.format === 'double_elim' ? 'wb' : 'ko', round: r, i, rounds: k, size }); };
    if (t.format !== 'double_elim') {
      for (let r = 0; r < k - 1; r++) wb(r);
      if (t.config.thirdPlace && k >= 2) out.push({ key: '3rd', stage: 'third', size });
      wb(k - 1);
      return t.format === 'gold_silver' ? out.concat(silverPlan(t)) : out;
    }
    for (let r = 0; r < k; r++) wb(r);
    const counts = [size / 4];
    for (let r = 1; r < k; r++) { counts.push(counts[counts.length - 1]); if (r < k - 1) counts.push(counts[counts.length - 1] / 2); }
    counts.forEach((n, r) => { for (let i = 0; i < n; i++) out.push({ key: `L${r}-${i}`, stage: 'lb', round: r, i, rounds: counts.length, size }); });
    out.push({ key: 'GF', stage: 'gf', size });
    return out;
  }

  // Numeri di gara: G1, G2... per il tabellone principale (gironi turno per turno, poi fase finale), Q1, Q2... per le qualifiche.
  function numbering(t) {
    const nums = {};
    const poolItems = [];
    poolPlan(t).forEach((p, pi) => p.matches.forEach((m, idx) => poolItems.push({ key: m.key, round: m.round, pi, idx })));
    poolItems.sort((x, y) => x.round - y.round || x.pi - y.pi || x.idx - y.idx);
    let n = 0;
    poolItems.forEach(x => { nums[x.key] = 'G' + (++n); });
    bracketPlan(t).forEach(x => { nums[x.key] = 'G' + (++n); });
    if (t.qual) {
      let q = 0;
      for (let r = 0; r < t.qual.rounds; r++) {
        const count = t.qual.slots.length / 2 ** (r + 1);
        for (let i = 0; i < count; i++) nums[`Q${r}-${i}`] = 'Q' + (++q);
      }
    }
    return applyGsNums(t, nums);
  }

  // Solo Gold & Silver: numeri di gara scelti dall'admin (t.gsNums = { chiave: numero }). Valgono solo se,
  // insieme agli altri, danno ancora tutti i numeri G1…Gn una volta sola; altrimenti resta la numerazione standard.
  function applyGsNums(t, nums) {
    if (t.format !== 'gold_silver' || !t.gsNums) return nums;
    const keys = Object.keys(nums).filter(k => nums[k][0] === 'G');
    const cur = {};
    keys.forEach(k => { cur[k] = t.gsNums[k] != null ? 'G' + t.gsNums[k] : nums[k]; });
    const std = keys.map(k => nums[k]).sort().join(), mine = keys.map(k => cur[k]).sort().join();
    return std === mine ? Object.assign(nums, cur) : nums;
  }

  // Cambia il numero di una gara: la gara che aveva quel numero prende il vecchio numero (scambio).
  function setMatchNo(t, key, n) {
    if (t.format !== 'gold_silver') return false;
    const nums = numbering(t), from = nums[key], other = Object.keys(nums).find(k => nums[k] === 'G' + n);
    if (!from || from[0] !== 'G' || !other) return false;
    if (other === key) return true;
    const std = numbering(Object.assign({}, t, { gsNums: null }));
    const o = {};
    Object.keys(t.gsNums || {}).forEach(k => { if (std[k]) o[k] = t.gsNums[k]; });
    o[key] = n; o[other] = +from.slice(1);
    Object.keys(o).forEach(k => { if (std[k] === 'G' + o[k]) delete o[k]; });
    t.gsNums = Object.keys(o).length ? o : null;
    return true;
  }

  // Tutte le gare previste, anche quelle delle fasi non ancora generate (senza squadre, con segnaposto).
  function plannedMatches(t) {
    const actual = allMatches(t);
    const out = actual.filter(m => m.stage === 'qual');
    if (t.pools) out.push(...actual.filter(m => m.stage === 'pool'));
    else poolPlan(t).forEach((p, pi) => p.matches.forEach(m => out.push({
      key: m.key, stage: 'pool', pool: pi, poolName: p.name, round: m.round, label: m.label, a: null, b: null, planned: true,
      ph: m.from ? null : [`${p.name}${m.a + 1}`, `${p.name}${m.b + 1}`], from: m.from
    })));
    if (t.bracket) out.push(...actual.filter(m => m.stage !== 'qual' && m.stage !== 'pool'));
    else bracketPlan(t).forEach(x => out.push(Object.assign({ a: null, b: null, planned: true }, x)));
    return out;
  }

  // Segnaposto per una squadra non ancora nota: "Vincente G19", "Perdente G20", "A1"...
  function placeholder(t, m, side, nums) {
    if (m.ph) return { text: m.ph[side] };
    if (m.from) return { kind: m.from[0] === 'W' ? 'winnerOf' : 'loserOf', no: nums[m.from[side + 1]] };
    const w = /^W(\d+)-(\d+)$/.exec(m.key);
    if (w && +w[1] > 0) return { kind: 'winnerOf', no: nums[`W${+w[1] - 1}-${2 * +w[2] + side}`] };
    if (m.key === '3rd') {
      const k = Math.round(Math.log2(bracketSizeFor(t)));
      return { kind: 'loserOf', no: nums[`W${k - 2}-${side}`] };
    }
    const sv = /^S(\d+)-(\d+)$/.exec(m.key);
    if (sv && +sv[1] > 0) return { kind: 'winnerOf', no: nums[`S${+sv[1] - 1}-${2 * +sv[2] + side}`] };
    if (m.key === 'S3rd') {
      const k = Math.round(Math.log2(silverSizeFor(t)));
      return { kind: 'loserOf', no: nums[`S${k - 2}-${side}`] };
    }
    const fv = /^P(\d+)-M([34])$/.exec(m.key);
    if (fv) return { kind: fv[2] === '3' ? 'winnerOf' : 'loserOf', no: nums[`P${fv[1]}-M${side + 1}`] };
    return null;
  }

  function computeMain(t) {
    const br = t.bracket;
    if (!br) return null;
    const k = Math.round(Math.log2(br.size));
    if (t.format !== 'double_elim') {
      const rounds = singleRounds(t, br.slots, k, 'W');
      let third = null;
      if (t.config.thirdPlace && k >= 2) {
        const sf = rounds[k - 2];
        third = decide(t, '3rd', sf[0].loser, sf[1].loser);
      }
      const champ = rounds[k - 1][0].winner;
      const out = { type: 'single', rounds, third, champion: real(champ) ? champ : null };
      if (t.format === 'gold_silver') out.silver = computeSilver(t);
      return out;
    }
    const wb = singleRounds(t, br.slots, k, 'W');
    const lb = [];
    const pair = (list, r) => {
      const round = [];
      for (let i = 0; i < list.length / 2; i++) {
        const m = decide(t, `L${r}-${i}`, list[2 * i], list[2 * i + 1]);
        m.round = r; round.push(m);
      }
      return round;
    };
    lb.push(pair(wb[0].map(m => m.loser), 0));
    for (let r = 1; r < k; r++) {
      let drops = wb[r].map(m => m.loser);
      if (r % 2 === 1) drops = drops.slice().reverse();
      const prev = lb[lb.length - 1].map(m => m.winner);
      const idx = lb.length, round = [];
      prev.forEach((w, i) => {
        const m = decide(t, `L${idx}-${i}`, w, drops[i]);
        m.round = idx; round.push(m);
      });
      lb.push(round);
      if (r < k - 1) lb.push(pair(round.map(m => m.winner), lb.length));
    }
    const gf = decide(t, 'GF', wb[k - 1][0].winner, lb[lb.length - 1][0].winner);
    return { type: 'double', wb, lb, gf, champion: real(gf.winner) ? gf.winner : null };
  }

  function computeSilver(t) {
    const sb = t.silver;
    if (!sb) return null;
    const k = Math.round(Math.log2(sb.size));
    const rounds = singleRounds(t, sb.slots, k, 'S');
    let third = null;
    if (t.config.silverThird && k >= 2) {
      const sf = rounds[k - 2];
      third = decide(t, 'S3rd', sf[0].loser, sf[1].loser);
    }
    const champ = rounds[k - 1][0].winner;
    return { rounds, third, champion: real(champ) ? champ : null };
  }

  // ---------- piazzamenti ----------

  function placements(t) {
    const pl = {};
    let better;
    const addLosers = rounds => {
      for (let r = rounds.length - 1; r >= 0; r--) {
        const losers = rounds[r].map(m => m.loser).filter(real);
        losers.forEach(id => { pl[id] = better + 1; });
        better += losers.length;
      }
    };
    if (!t.mainIds) return null;
    if (t.format === 'round_robin') {
      if (!poolsComplete(t)) return null;
      poolStandings(t, 0).forEach((r, i) => { pl[r.id] = i + 1; });
    } else {
      const cm = computeMain(t);
      if (!cm || !cm.champion) return null;
      pl[cm.champion] = 1;
      if (cm.type === 'single') {
        if (cm.third && !cm.third.winner) return null;
        better = 1;
        addLosers(cm.rounds);
        if (cm.third && real(cm.third.winner)) {
          pl[cm.third.winner] = 3;
          if (real(cm.third.loser)) pl[cm.third.loser] = 4;
        }
      } else {
        pl[cm.gf.loser] = 2;
        better = 2;
        addLosers(cm.lb);
      }
      if (t.format === 'gold_silver') {
        // Silver: piazzamenti dopo tutte le squadre del Gold
        better = Object.keys(pl).length;
        const sv = cm.silver;
        if (sv) {
          if (!sv.champion || (sv.third && !sv.third.winner)) return null;
          const base = better;
          pl[sv.champion] = base + 1;
          better = base + 1;
          addLosers(sv.rounds);
          if (sv.third && real(sv.third.winner)) {
            pl[sv.third.winner] = base + 3;
            if (real(sv.third.loser)) pl[sv.third.loser] = base + 4;
          }
        }
        // squadre rimaste (es. una sola squadra fuori dal Gold)
        t.mainIds.filter(id => pl[id] == null).forEach(id => { pl[id] = ++better; });
      } else if (hasPools(t.format)) {
        better = Object.keys(pl).length;
        const st = t.pools.map((_, i) => poolStandings(t, i));
        const maxLen = Math.max(...st.map(s => s.length));
        for (let r = t.config.qualify; r < maxLen; r++) {
          const ids = st.map(s => s[r] && s[r].id).filter(Boolean);
          ids.forEach(id => { pl[id] = better + 1; });
          better += ids.length;
        }
      }
    }
    if (t.qual) {
      better = Object.keys(pl).length;
      addLosers(computeQual(t));
    }
    return pl;
  }

  function status(t) {
    if (t.closed) return 'done';
    if (t.mainIds) return 'main';
    if (t.qual && !t.qualClosed) return 'qualification';
    return 'registration';
  }

  // Tutte le partite del torneo, nell'ordine delle fasi.
  function allMatches(t) {
    const out = [];
    const qr = computeQual(t);
    if (qr) qr.forEach((round, r) => round.forEach(m => out.push(Object.assign(m, { stage: 'qual', round: r, rounds: qr.length }))));
    if (t.pools) t.pools.forEach((_, pi) => poolMatches(t, pi).forEach(m => out.push(Object.assign(m, { stage: 'pool', pool: pi }))));
    const cm = computeMain(t);
    if (cm && cm.type === 'single') {
      cm.rounds.flat().forEach(m => out.push(Object.assign(m, { stage: 'ko' })));
      if (cm.third) out.push(Object.assign(cm.third, { stage: 'third' }));
      if (cm.silver) {
        cm.silver.rounds.flat().forEach(m => out.push(Object.assign(m, { stage: 'silver', rounds: cm.silver.rounds.length, size: t.silver.size })));
        if (cm.silver.third) out.push(Object.assign(cm.silver.third, { stage: 'silver3' }));
      }
    } else if (cm) {
      cm.wb.flat().forEach(m => out.push(Object.assign(m, { stage: 'wb', rounds: cm.wb.length })));
      cm.lb.flat().forEach(m => out.push(Object.assign(m, { stage: 'lb', rounds: cm.lb.length })));
      out.push(Object.assign(cm.gf, { stage: 'gf' }));
    }
    return out;
  }

  function clearKeys(t, prefixes) {
    ['results', 'schedule', 'matchNo'].forEach(k => {
      Object.keys(t[k]).forEach(key => { if (prefixes.some(p => key.startsWith(p))) delete t[k][key]; });
    });
  }

  function resetQual(t) {
    t.qual = null;
    reopenQual(t);
    resetMain(t);
    clearKeys(t, ['Q']);
  }

  function resetMain(t) {
    t.mainIds = null; t.pools = null; t.bracket = null; t.closed = false;
    clearKeys(t, ['P', 'W', 'L', 'GF', '3rd']);
    if (t.format === 'gold_silver') { t.silver = null; clearKeys(t, ['S']); }
  }

  function resetBracket(t) {
    t.bracket = null;
    clearKeys(t, ['W', 'L', 'GF', '3rd']);
    if (t.format === 'gold_silver') { t.silver = null; clearKeys(t, ['S']); }
  }

  return {
    BYE, FORMATS, MAIN_SIZES, real, hasPools, hasBracket, round2, defaultConfig, normalize,
    setTarget, validateResult, matchStats, norm, nameKey, nameSkeleton, tablePoints, teamPoints, playerPoints, ranking, playerHistory,
    entryPts, entryTotal, sortEntries, computeSplit, lockEntries, unlockEntries, qualNeeded,
    generateQual, computeQual, qualWinners, closeQual, reopenQual,
    mainDrawCheck, startMainDraw, poolMatches, poolStandings, poolsComplete, generateBracket, computeMain,
    autoFillBracket, autoFillSilver, bracketCandidates, setMatchNo, gsSizes, snakeSizes, gsSeedSort, gsPlaceSeeds, gsClashes, gsSplit, goldCount, GS_DEFAULTS, fixRR4, numbering, plannedMatches, placeholder,
    placements, status, allMatches, resetQual, resetMain, resetBracket
  };
})();
