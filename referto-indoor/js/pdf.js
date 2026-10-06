/* PDF del referto di pallavolo indoor (jsPDF caricato solo quando serve) */
(function () {
  'use strict';

  const INK = [19, 34, 46];
  const GREY = [110, 125, 136];
  const LIGHT = [236, 241, 244];
  const BLUE = [11, 110, 153];
  const WOMAN = [194, 37, 92];
  const POS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
  let libPromise = null;
  let fontCache = null;

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('script ' + src));
      document.head.appendChild(s);
    });
  }
  function loadLib() {
    if (window.jspdf) return Promise.resolve();
    if (!libPromise) libPromise = loadScript('vendor/jspdf.umd.min.js');
    return libPromise;
  }
  function toBase64(buf) {
    let s = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  // Roboto per le lettere accentate; se non disponibile (file aperto da disco) si usa Helvetica.
  function loadFonts() {
    if (fontCache) return Promise.resolve(fontCache);
    return Promise.all(['fonts/Roboto-Regular.ttf', 'fonts/Roboto-Bold.ttf'].map(u => fetch(u).then(r => { if (!r.ok) throw new Error(u); return r.arrayBuffer(); })))
      .then(([reg, bold]) => (fontCache = { reg: toBase64(reg), bold: toBase64(bold) }))
      .catch(() => null);
  }

  const hhmm = iso => (iso ? new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '—');
  const fmtDate = s => { if (!s) return ''; const [y, mo, d] = s.split('-'); return d ? `${d}/${mo}/${y}` : s; };
  const mins = (a, b) => (a && b ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000)) : null);
  const other = tm => (tm === 'A' ? 'B' : 'A');
  const hexRgb = h => { h = String(h || '').replace('#', ''); if (h.length === 3) h = h.replace(/./g, c => c + c); const n = parseInt(h, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const safe = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '');
  const SAN = { DW: 'Avvertimento per ritardo', DP: 'Penalizzazione per ritardo', W: 'Avvertimento', P: 'Penalizzazione', E: 'Espulsione', D: 'Squalifica' };

  // opts: { draft, teamName(tm) }
  function generate(m, st, opts) {
    opts = opts || {};
    return Promise.all([loadLib(), loadFonts()]).then(([, fonts]) => build(m, st, opts, fonts));
  }

  function build(m, st, opts, fonts) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    let FONT = 'helvetica';
    if (fonts) {
      doc.addFileToVFS('Roboto-Regular.ttf', fonts.reg); doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
      doc.addFileToVFS('Roboto-Bold.ttf', fonts.bold); doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
      FONT = 'Roboto';
    }
    const clean = s => { s = String(s == null ? '' : s); return fonts ? s : s.replace(/[^\x20-\xFF]/g, '?'); };
    const tn = tm => clean(opts.teamName ? opts.teamName(tm) : m.teams[tm].name || 'Squadra ' + tm);
    const roster = tm => m.teams[tm].players.filter(p => p.no !== '' && p.no != null).sort((a, b) => a.no - b.no);
    const colOf = tm => hexRgb(m.teams[tm].color || (tm === 'A' ? '#1f63d1' : '#d9480f'));
    const inkOn = c => ((0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255 > 0.62 ? INK : [255, 255, 255]);

    const W = 297, H = 210, M = 8, CW = W - 2 * M;
    let y = 0;
    const font = (size, style, color) => { doc.setFont(FONT, style || 'normal'); doc.setFontSize(size); doc.setTextColor(...(color || INK)); };
    const fit = (str, x, yy, maxW, size, style, color, align) => {
      str = clean(str);
      let s = size;
      font(s, style, color);
      while (s > 5 && doc.getTextWidth(str) > maxW) { s -= 0.5; doc.setFontSize(s); }
      doc.text(str, x, yy, align ? { align } : undefined);
    };
    const box = (x, yy, w, h, fill) => {
      doc.setLineWidth(0.2); doc.setDrawColor(...GREY);
      if (fill) { doc.setFillColor(...fill); doc.rect(x, yy, w, h, 'FD'); } else doc.rect(x, yy, w, h, 'S');
    };
    const labeled = (label, value, x, yy, w, h) => {
      box(x, yy, w, h);
      font(5.5, 'normal', GREY); doc.text(clean(label).toUpperCase(), x + 1.2, yy + 2.6);
      fit(value || '', x + 1.2, yy + h - 1.5, w - 2.4, 8.5, 'bold');
    };
    const header = () => {
      doc.setFillColor(...BLUE); doc.rect(0, 0, W, 12, 'F');
      font(12.5, 'bold', [255, 255, 255]); doc.text(clean('Referto di gara — Pallavolo'), M, 8.2);
      font(9.5, 'bold', [255, 255, 255]);
      doc.text(clean(`${tn('A')} – ${tn('B')}${m.header.matchNo ? '   ·   Gara n. ' + m.header.matchNo : ''}`), W - M, 8.2, { align: 'right' });
      if (opts.draft) {
        font(70, 'bold', [235, 235, 235]);
        doc.text('BOZZA', W / 2, H / 2 + 20, { align: 'center', angle: 20 });
      }
      y = 15;
    };
    const need = h => { if (y + h > H - M) { doc.addPage(); header(); } };

    header();
    // ---- dati gara ----
    const h1 = 8.5;
    labeled('Torneo / competizione', m.header.competition, M, y, CW * 0.32, h1);
    labeled('Fase', m.header.phase, M + CW * 0.32, y, CW * 0.16, h1);
    labeled('Palestra / luogo', m.header.venue, M + CW * 0.48, y, CW * 0.22, h1);
    labeled('Campo', m.header.court, M + CW * 0.70, y, CW * 0.08, h1);
    labeled('Data', fmtDate(m.header.date), M + CW * 0.78, y, CW * 0.12, h1);
    labeled('Ora', m.header.time, M + CW * 0.90, y, CW * 0.10, h1);
    y += h1;
    const q = CW / 6;
    const S = st.settings;
    const formula = `${S.mode === 'fixed' ? `${S.sets} set fissi` : `al meglio di ${S.sets}`} · ${S.points}${S.sets > 1 ? `/${S.lastPoints}` : ''}${S.cap ? ` (max ${S.cap})` : ''}`;
    labeled('Formula', formula, M, y, q * 1.5, h1);
    labeled('Inizio gara', hhmm(st.startTime), M + q * 1.5, y, q * 0.75, h1);
    labeled('Fine gara', hhmm(st.endTime), M + q * 2.25, y, q * 0.75, h1);
    const dur = mins(st.startTime, st.endTime);
    labeled('Durata', dur != null ? `${dur}′` : '', M + q * 3, y, q * 0.75, h1);
    const s0 = st.sets[0];
    const toss = s0 && s0.toss && s0.toss.winner ? `vince ${tn(s0.toss.winner)}` : '';
    labeled('Sorteggio set 1', toss, M + q * 3.75, y, q * 1.25, h1);
    const mwA = window.Rules.minWomenOf(S, 'A'), mwB = window.Rules.minWomenOf(S, 'B');
    labeled('Donne in campo (min.)', mwA === mwB ? (mwA ? String(mwA) : '—') : `${tn('A')}: ${mwA || '—'} · ${tn('B')}: ${mwB || '—'}`, M + q * 5, y, q, h1);
    y += h1 + 2.5;

    // ---- squadre ----
    const half = (CW - 3) / 2;
    const rows = Math.max(roster('A').length, roster('B').length);
    const rh = 4.1;
    need(7 + rows * rh + 6);
    ['A', 'B'].forEach((tm, k) => {
      const x = M + k * (half + 3);
      const c = colOf(tm);
      doc.setFillColor(...c); doc.rect(x, y, half, 6, 'F');
      fit(`${tm} · ${tn(tm)}`, x + 2, y + 4.3, half - 4, 9.5, 'bold', inkOn(c));
      let yy = y + 6;
      font(6, 'normal', GREY);
      doc.text('N.', x + 2, yy + 3); doc.text('NOME', x + 12, yy + 3); doc.text('D/U', x + half - 22, yy + 3); doc.text('RUOLO', x + half - 12, yy + 3);
      yy += 4;
      roster(tm).forEach((p, i) => {
        if (i % 2 === 0) { doc.setFillColor(...LIGHT); doc.rect(x, yy - 0.2, half, rh, 'F'); }
        const col = p.gender === 'F' ? WOMAN : INK;
        font(8.5, 'bold', col); doc.text(clean(String(p.no)), x + 2, yy + 3);
        fit(p.name || '', x + 12, yy + 3, half - 36, 8.5, 'normal', INK);
        font(8, 'bold', col); doc.text(p.gender === 'F' ? 'D' : p.gender === 'M' ? 'U' : '', x + half - 21, yy + 3);
        font(8, 'bold', INK); doc.text(clean([p.libero ? 'L' : '', p.captain ? 'K' : ''].filter(Boolean).join(' ')), x + half - 12, yy + 3);
        yy += rh;
      });
      yy = y + 10 + rows * rh;
      fit(`Allenatore: ${m.teams[tm].coach || '—'}`, x + 2, yy + 3.5, half - 4, 8, 'normal', GREY);
      doc.setDrawColor(...GREY); doc.setLineWidth(0.2); doc.rect(x, y, half, yy + 5 - y, 'S');
    });
    y += 10 + rows * rh + 5 + 3;

    // ---- set ----
    font(6.5, 'normal', GREY);
    need(8);
    doc.text(clean('In ogni posto: n. del titolare, sostituzioni (esce > entra, al punteggio) e punteggio della squadra alla fine di ogni turno di servizio. S = al servizio per primi, R = in ricezione.'), M, y + 2);
    y += 4.5;
    const nameW = 40, toW = 22, ptW = 16;
    const cellW = (CW - nameW - toW - ptW) / 6;
    st.sets.forEach(s => {
      if (!s.lineup) {
        need(8);
        fit(`Set ${s.index + 1} — non giocato: assegnato ${s.score.A}–${s.score.B} a ${tn(s.winner)}`, M, y + 4, CW, 9, 'bold');
        y += 7;
        return;
      }
      const lines = tm => [0, 1, 2, 3, 4, 5].map(c => {
        const out = [];
        s.subs[tm].filter(x => x.col === c).forEach(x => out.push({ t: `${x.out} > ${x.in}  (${x.score[tm]}:${x.score[other(tm)]})${x.exceptional ? ' ecc.' : ''}`, sub: true }));
        font(7, 'normal');
        const turns = s.turns.filter(t => t.team === tm && t.col === c && t.end != null).map(t => t.end).join(' ');
        if (turns) doc.splitTextToSize(clean(turns), cellW - 3).forEach(l => out.push({ t: l }));
        return out;
      });
      const L = { A: lines('A'), B: lines('B') };
      const rowH = tm => Math.max(9, 5.5 + Math.max(0, ...L[tm].map(a => a.length)) * 3.1 + 1);
      const libLine = ['A', 'B'].filter(tm => s.liberoLog[tm].length).map(tm => `Libero ${tn(tm)}: ` + s.liberoLog[tm].map(x => `${x.type === 'out' ? `${x.no} esce (rientra ${x.back})` : `${x.no} per ${x.out}`} ${x.score[tm]}:${x.score[other(tm)]}`).join(' · '));
      const blockH = 6 + 5 + rowH('A') + rowH('B') + libLine.length * 3.6 + 3;
      need(blockH);
      // titolo del set
      doc.setFillColor(...LIGHT); doc.rect(M, y, CW, 6, 'F');
      const d = mins(s.startTime, s.endTime);
      font(9.5, 'bold'); doc.text(clean(`Set ${s.index + 1}`), M + 2, y + 4.3);
      fit(`${hhmm(s.startTime)}–${hhmm(s.endTime)}${d != null ? ` (${d}′)` : ''}  ·  vince ${s.winner ? tn(s.winner) : '—'}${s.switchScore ? `  ·  cambio campo ${s.switchScore.A}:${s.switchScore.B}` : ''}${s.awarded ? '  ·  assegnato' : ''}`, M + 18, y + 4.3, CW - 20, 8.5, 'normal', INK);
      y += 6;
      // intestazione colonne
      font(6.5, 'bold', GREY);
      POS.forEach((p, i) => doc.text(p, M + nameW + i * cellW + cellW / 2, y + 3.6, { align: 'center' }));
      doc.text('TIME-OUT', M + nameW + 6 * cellW + toW / 2, y + 3.6, { align: 'center' });
      doc.text('PUNTI', M + nameW + 6 * cellW + toW + ptW / 2, y + 3.6, { align: 'center' });
      y += 5;
      ['A', 'B'].forEach(tm => {
        const h = rowH(tm);
        const c = colOf(tm);
        doc.setFillColor(...c); doc.rect(M, y, nameW, h, 'F');
        fit(tn(tm), M + 1.5, y + 4.2, nameW - 3, 8.5, 'bold', inkOn(c));
        font(7, 'normal', inkOn(c)); doc.text(s.firstServing === tm ? 'S' : 'R', M + 1.5, y + 8);
        for (let i = 0; i < 6; i++) {
          const x = M + nameW + i * cellW;
          box(x, y, cellW, h);
          const no = s.lineup[tm][i];
          const p = m.teams[tm].players.find(pp => +pp.no === +no);
          font(10, 'bold', p && p.gender === 'F' ? WOMAN : INK); doc.text(clean(String(no)), x + 1.5, y + 4.3);
          let ly = y + 7.4;
          L[tm][i].forEach(l => { font(7, l.sub ? 'bold' : 'normal', l.sub ? INK : GREY); doc.text(clean(l.t), x + 1.5, ly); ly += 3.1; });
        }
        const xt = M + nameW + 6 * cellW;
        box(xt, y, toW, h);
        font(8, 'normal'); s.timeouts[tm].forEach((x, i) => doc.text(clean(`${x.score[tm]}:${x.score[other(tm)]}`), xt + toW / 2, y + 4 + i * 3.4, { align: 'center' }));
        box(xt + toW, y, ptW, h, s.winner === tm ? [220, 239, 225] : null);
        font(14, 'bold'); doc.text(String(s.score[tm]), xt + toW + ptW / 2, y + h / 2 + 2.2, { align: 'center' });
        y += h;
      });
      libLine.forEach(l => { y += 3.4; fit(l, M, y, CW, 7, 'normal', GREY); });
      y += 3;
    });

    // ---- sanzioni ----
    if (st.sanctions.length) {
      need(10 + st.sanctions.length * 4);
      font(9, 'bold'); doc.text('Sanzioni', M, y + 4); y += 6;
      st.sanctions.forEach(x => {
        const who = x.player === 'C' ? 'Allenatore' : x.player === 'T' ? 'Squadra' : `n. ${x.player}`;
        fit(`${SAN[x.kind] || x.kind} — ${tn(x.team)}, ${who} — set ${x.set + 1} al punteggio ${x.score[x.team]}:${x.score[other(x.team)]}`, M + 2, y + 3, CW - 4, 8, 'normal');
        y += 4;
      });
      y += 2;
    }

    // ---- risultato, osservazioni, firme ----
    const remarks = m.remarks ? doc.splitTextToSize(clean(m.remarks), CW - 4) : [];
    need(14 + remarks.length * 3.6 + 24);
    doc.setFillColor(...BLUE); doc.rect(M, y, CW, 8, 'F');
    const res = st.phase === 'matchEnd'
      ? (st.winner ? `Vince ${tn(st.winner)} ${st.setsWon[st.winner]}–${st.setsWon[other(st.winner)]}` : `Pareggio ${st.setsWon.A}–${st.setsWon.B}`)
      : `Gara in corso: ${st.setsWon.A}–${st.setsWon.B}`;
    fit(`${res}${st.forfeit ? ` (rinuncia di ${tn(st.forfeit.team)})` : ''}   ·   set: ${st.sets.map(s => `${s.score.A}–${s.score.B}`).join(', ')}`, M + 2, y + 5.6, CW - 4, 10.5, 'bold', [255, 255, 255]);
    y += 10;
    if (remarks.length) {
      font(8, 'bold'); doc.text('Osservazioni', M, y + 3); y += 4.5;
      font(8, 'normal'); remarks.forEach(l => { doc.text(l, M + 2, y + 2.5); y += 3.6; });
      y += 1;
    }
    const sig = [['1° arbitro', m.officials.ref1], ['2° arbitro', m.officials.ref2], ['Segnapunti', m.officials.scorer], [`Capitano ${tn('A')}`, ''], [`Capitano ${tn('B')}`, '']];
    const sw = (CW - 4 * 3) / 5;
    sig.forEach(([l, v], i) => {
      const x = M + i * (sw + 3);
      box(x, y, sw, 16);
      font(6, 'normal', GREY); doc.text(clean(l).toUpperCase(), x + 1.5, y + 3);
      if (v) fit(v, x + 1.5, y + 7, sw - 3, 8, 'bold');
    });
    y += 18;
    font(6.5, 'normal', GREY);
    doc.text(clean(m.closedAt ? `Gara chiusa il ${new Date(m.closedAt).toLocaleString('it-IT')}` : 'BOZZA — gara non ancora chiusa'), M, Math.min(y + 2, H - 4));

    // numeri di pagina
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); font(6.5, 'normal', GREY); doc.text(`${i}/${n}`, W - M, H - 4, { align: 'right' }); }

    const name = `referto_${m.header.matchNo ? 'gara' + safe(m.header.matchNo) + '_' : ''}${safe(tn('A'))}-${safe(tn('B'))}${opts.draft ? '_bozza' : ''}.pdf`;
    return { blob: doc.output('blob'), name };
  }

  window.ScoresheetPDF = { generate };
})();
