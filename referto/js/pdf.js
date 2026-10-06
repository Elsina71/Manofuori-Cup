/* Generazione del PDF del referto (jsPDF caricato solo quando serve) */
(function () {
  'use strict';

  const A_COL = [31, 99, 209];
  const B_COL = [217, 72, 15];
  const INK = [19, 34, 46];
  const GREY = [110, 125, 136];
  const LIGHT = [225, 232, 237];
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
  // Roboto: supporta anche lettere greche e accentate. Se non disponibile (es. file aperto da disco) si usa Helvetica.
  function loadFonts() {
    if (fontCache) return Promise.resolve(fontCache);
    return Promise.all(['fonts/Roboto-Regular.ttf', 'fonts/Roboto-Bold.ttf'].map(u => fetch(u).then(r => { if (!r.ok) throw new Error(u); return r.arrayBuffer(); })))
      .then(([reg, bold]) => (fontCache = { reg: toBase64(reg), bold: toBase64(bold) }))
      .catch(() => null);
  }

  const t = (k, p) => I18n.t(k, p);
  const hhmm = iso => (iso ? new Date(iso).toLocaleTimeString(I18n.locale(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '');
  const fmtDate = s => { if (!s) return ''; const [y, mo, d] = s.split('-'); return d ? `${d}/${mo}/${y}` : s; };
  const mins = (a, b) => (a && b ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000)) : null);
  const other = tm => (tm === 'A' ? 'B' : 'A');
  const hexRgb = h => { h = String(h || '').replace('#', ''); if (h.length === 3) h = h.replace(/./g, c => c + c); const n = parseInt(h, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

  // nome file solo con caratteri latini (il greco viene traslitterato)
  const GR = { α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o' };
  const safe = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ου/gi, m => (m[0] === 'Ο' ? 'Ou' : 'ou'))
    .replace(/[\u0370-\u03ff]/g, c => { const l = GR[c.toLowerCase()] || ''; return c === c.toLowerCase() ? l : l.charAt(0).toUpperCase() + l.slice(1); })
    .replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '');

  function generate(m, st, opts) {
    opts = opts || {};
    return Promise.all([loadLib(), loadFonts()]).then(([, fonts]) => build(m, st, opts, fonts));
  }

  function build(m, st, opts, fonts) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    let FONT = 'helvetica';
    if (fonts) {
      doc.addFileToVFS('Roboto-Regular.ttf', fonts.reg);
      doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
      doc.addFileToVFS('Roboto-Bold.ttf', fonts.bold);
      doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
      FONT = 'Roboto';
    }
    // con Helvetica i caratteri non latini non sono stampabili
    const clean = s => { s = String(s == null ? '' : s); return fonts ? s : s.replace(/[^\x20-\xFF]/g, '?'); };
    const tn = tm => clean(opts.teamName ? opts.teamName(tm) : m.teams[tm].name || tm);
    const pl = (tm, i) => { const p = m.teams[tm].players[i]; return clean(`${p.no}  ${p.name || ''}`); };

    const W = 297, H = 210, M = 8;
    const font = (size, style, color) => { doc.setFont(FONT, style || 'normal'); doc.setFontSize(size); doc.setTextColor(...(color || INK)); };
    const fit = (str, x, y, maxW, size, style, color, align) => {
      str = clean(str);
      let s = size;
      font(s, style, color);
      while (s > 5 && doc.getTextWidth(str) > maxW) { s -= 0.5; doc.setFontSize(s); }
      doc.text(str, x, y, align ? { align } : undefined);
    };
    const box = (x, y, w, h, fill) => {
      doc.setLineWidth(0.2); doc.setDrawColor(...GREY);
      if (fill) { doc.setFillColor(...fill); doc.rect(x, y, w, h, 'FD'); } else doc.rect(x, y, w, h, 'S');
    };
    const labeled = (label, value, x, y, w, h) => {
      box(x, y, w, h);
      font(5.5, 'normal', GREY); doc.text(label.toUpperCase(), x + 1.2, y + 2.6);
      fit(value || '', x + 1.2, y + h - 1.5, w - 2.4, 8.5, 'bold');
    };

    // ---- intestazione ----
    doc.setFillColor(11, 110, 153); doc.rect(0, 0, W, 13, 'F');
    font(13, 'bold', [255, 255, 255]); doc.text(clean(t('pdfTitle')), M, 8.7);
    font(10, 'bold', [255, 255, 255]);
    doc.text(clean(t('pdfMatchCourt', { m: m.header.matchNo || '—', c: m.header.court || '—' })), W - M, 8.7, { align: 'right' });

    let y = 16;
    const h1 = 8.5;
    const cw = (W - 2 * M);
    labeled(t('competition'), m.header.competition, M, y, cw * 0.36, h1);
    labeled(t('location'), m.header.location, M + cw * 0.36, y, cw * 0.22, h1);
    labeled(t('phase'), m.header.phase, M + cw * 0.58, y, cw * 0.16, h1);
    labeled(t('category'), m.header.gender ? t('g_' + m.header.gender) : '', M + cw * 0.74, y, cw * 0.12, h1);
    labeled(t('date'), fmtDate(m.header.date), M + cw * 0.86, y, cw * 0.14, h1);
    y += h1;
    const dur = mins(st.startTime, st.endTime);
    const q = cw / 6;
    labeled(t('pdfScheduled'), m.header.time, M, y, q, h1);
    labeled(t('pdfActualStart'), hhmm(st.startTime), M + q, y, q, h1);
    labeled(t('pdfMatchEnd'), hhmm(st.endTime), M + 2 * q, y, q, h1);
    labeled(t('pdfDuration'), dur != null ? t('min', { n: dur }) : '', M + 3 * q, y, q, h1);
    const tossBox = (i, x) => {
      const s = st.sets[i], c = s && window.Rules.tossChooser(s.toss);
      labeled(t('pdfToss', { n: i + 1 }), c ? t('pdfTossWon', { t: tn(c) }) : '', x, y, q, h1);
    };
    tossBox(0, M + 4 * q);
    tossBox(2, M + 5 * q);
    y += h1 + 2;

    // ---- squadre ----
    const half = (cw - 3) / 2;
    ['A', 'B'].forEach((tm, k) => {
      const x = M + k * (half + 3);
      const col = tm === 'A' ? A_COL : B_COL;
      doc.setFillColor(...col); doc.rect(x, y, half, 6, 'F');
      font(9, 'bold', [255, 255, 255]); doc.text(tm, x + 2, y + 4.3);
      // colore della maglia: riquadro colorato e nome, a destra nella barra della squadra
      const jc = m.teams[tm].color;
      const jn = jc && opts.jersey ? opts.jersey(tm) : '';
      let nameW = half - 9;
      if (jc) {
        const label = clean(t('pdfJersey', { c: jn }));
        font(8, 'bold', [255, 255, 255]);
        const lw = doc.getTextWidth(label);
        const sx = x + half - 7;
        doc.setFillColor(...hexRgb(jc)); doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.5);
        doc.rect(sx, y + 1, 5, 4, 'FD');
        doc.text(label, sx - 1.5, y + 4.2, { align: 'right' });
        nameW = half - 9 - lw - 9;
      }
      fit(tn(tm), x + 7, y + 4.3, nameW, 10, 'bold', [255, 255, 255]);
      const rowY = y + 6;
      const c1 = half * 0.37, c3 = half - 2 * c1;
      labeled(t('playerNo', { n: 1 }), m.teams[tm].players[0].name, x, rowY, c1, h1);
      labeled(t('playerNo', { n: 2 }), m.teams[tm].players[1].name, x + c1, rowY, c1, h1);
      labeled(t('coach'), m.teams[tm].coach, x + 2 * c1, rowY, c3, h1);
    });
    y += 6 + h1 + 2;
    const o = cw / 4;
    labeled(t('ref1'), m.officials.ref1, M, y, o, h1);
    labeled(t('ref2'), m.officials.ref2, M + o, y, o, h1);
    labeled(t('scorer'), m.officials.scorer, M + 2 * o, y, o, h1);
    labeled(t('assistant'), m.officials.assistant, M + 3 * o, y, o, h1);
    y += h1 + 3;

    // ---- set ----
    const nSets = Math.max(window.Rules.maxSets(st.settings), st.sets.length);
    const gap = 3;
    const sw = (cw - gap * (nSets - 1)) / nSets;
    let maxY = y;
    for (let i = 0; i < nSets; i++) {
      const endY = drawSet(st.sets[i], i, M + i * (sw + gap), y, sw);
      maxY = Math.max(maxY, endY);
    }
    y = maxY + 3;

    function drawSet(set, idx, x, y0, w) {
      const target = set ? set.target : window.Rules.targetOf(st.settings, idx);
      let yy = y0;
      doc.setFillColor(...INK); doc.rect(x, yy, w, 6, 'F');
      font(9.5, 'bold', [255, 255, 255]); doc.text(clean(t('setN', { n: idx + 1 }).toUpperCase()), x + 2, yy + 4.3);
      font(7, 'normal', [255, 255, 255]);
      if (set && set.startTime) doc.text(clean(t('pdfStartEnd', { a: hhmm(set.startTime), b: hhmm(set.endTime), n: target })), x + w - 2, yy + 4.2, { align: 'right' });
      else if (set && set.awarded) doc.text(clean(t('pdfSetAwarded')), x + w - 2, yy + 4.2, { align: 'right' });
      else doc.text(clean(t('pdfPoints', { n: target })), x + w - 2, yy + 4.2, { align: 'right' });
      yy += 7;
      const order = set && set.order ? ['A', 'B'].sort((a, b) => (a === set.firstServing ? -1 : b === set.firstServing ? 1 : 0)) : ['A', 'B'];
      order.forEach(tm => { yy = drawTeamInSet(set, tm, x, yy, w, target) + 1.5; });
      // riepilogo del set
      const lines = [];
      if (set) {
        const c = window.Rules.tossChooser(set.toss);
        if (c && set.toss.choice) {
          const parts = [`${tn(c)}: ${t('ch_' + set.toss.choice)}`];
          if (set.toss.otherChoice) parts.push(`${tn(other(c))}: ${t('ch_' + set.toss.otherChoice)}`);
          lines.push(t('pdfChoices', { x: parts.join(' · ') }));
        }
        if (set.startLeft) lines.push(t('pdfLeftStart', { t: tn(set.startLeft) }));
        if (set.switches.length) lines.push(t('pdfSwitches', { x: set.switches.map(s => `${s.A}-${s.B}`).join(', ') }));
        if (set.tto) lines.push(t('pdfTto', { x: `${set.tto.A}-${set.tto.B}` }));
      }
      font(6.5, 'normal', GREY);
      lines.forEach(l => { doc.text(doc.splitTextToSize(clean(l), w), x, yy + 2); yy += 3.2 * Math.max(1, doc.splitTextToSize(clean(l), w).length); });
      if (set && set.winner) {
        yy += 1;
        box(x, yy, w, 6.5, [245, 248, 250]);
        font(7, 'normal', GREY); doc.text(clean(t('pdfResult')), x + 1.5, yy + 4.3);
        font(10, 'bold'); doc.text(`${set.score.A} – ${set.score.B}`, x + 22, yy + 4.6);
        fit(t('pdfWinsSet', { t: tn(set.winner) }), x + w - 1.5, yy + 4.4, w - 42, 8, 'bold', set.winner === 'A' ? A_COL : B_COL, 'right');
        yy += 6.5;
      }
      return yy;
    }

    function drawTeamInSet(set, tm, x, y0, w, target) {
      const col = tm === 'A' ? A_COL : B_COL;
      let yy = y0;
      doc.setFillColor(...col); doc.rect(x, yy, 1.4, 4.6, 'F');
      fit(`${tm}  ${tn(tm)}`, x + 2.5, yy + 3.4, w * 0.55, 8, 'bold', col);
      font(6.5, 'normal', GREY);
      const tos = set ? set.timeouts[tm].map(z => `${z.score[tm]}:${z.score[other(tm)]}`) : [];
      doc.text(clean(`${t('toShort')}: ${tos.length ? tos.join(' ') : '—'}`), x + w, yy + 3.3, { align: 'right' });
      yy += 5.5;

      // turni di servizio (numero = punteggio della squadra quando perde il servizio)
      const labW = Math.min(30, w * 0.34), bw = 5.6, bh = 5;
      const perRow = Math.max(4, Math.floor((w - labW) / bw));
      [0, 1].forEach(i => {
        const pIdx = set && set.order ? set.order[tm][i] : i;
        const pos = set && set.firstServing ? (tm === set.firstServing ? (i === 0 ? 'I' : 'III') : (i === 0 ? 'II' : 'IV')) : '';
        const turns = set ? set.turns.filter(z => z.team === tm && z.player === pIdx) : [];
        const rows = Math.max(1, Math.ceil(turns.length / perRow));
        for (let r = 0; r < rows; r++) {
          box(x, yy, labW, bh, r === 0 ? [245, 248, 250] : null);
          if (r === 0) {
            font(7, 'bold'); doc.text(pos, x + 1.2, yy + 3.5);
            fit(pl(tm, pIdx), x + 7, yy + 3.5, labW - 8, 7, 'normal');
          }
          for (let c = 0; c < perRow; c++) {
            const bx = x + labW + c * bw;
            box(bx, yy, bw, bh);
            const tr = turns[r * perRow + c];
            if (tr && tr.end != null) {
              font(7, 'bold'); doc.text(String(tr.end), bx + bw / 2, yy + 3.5, { align: 'center' });
              if (tr.final) { doc.setDrawColor(...INK); doc.setLineWidth(0.25); doc.circle(bx + bw / 2, yy + 2.5, 2.2, 'S'); }
            }
          }
          yy += bh;
        }
      });
      yy += 1;

      // punteggio progressivo: punti fatti barrati, P = punto da penalizzazione
      const pts = set ? set.points[tm] : [];
      const last = set ? set.score[tm] : 0;
      const n = Math.max(target, last, set ? set.score[other(tm)] : 0);
      const cellW = w / Math.ceil(w / 5.4), per = Math.round(w / cellW), ch = 4.4;
      for (let k = 1; k <= n; k++) {
        const r = Math.floor((k - 1) / per), c = (k - 1) % per;
        const cx = x + c * cellW, cy = yy + r * ch;
        const p = pts[k - 1];
        box(cx, cy, cellW, ch, p && p.by === 'awarded' ? LIGHT : null);
        font(6.3, 'normal', p ? INK : GREY);
        doc.text(String(k), cx + cellW / 2, cy + 3.1, { align: 'center' });
        if (p) {
          doc.setDrawColor(...col); doc.setLineWidth(0.35);
          doc.line(cx + 0.6, cy + ch - 0.5, cx + cellW - 0.6, cy + 0.5);
          if (p.by === 'penalty') { font(4.5, 'bold', B_COL); doc.text('P', cx + 0.5, cy + 1.8); }
        }
        if (set && set.winner && k === last) { doc.setDrawColor(...INK); doc.setLineWidth(0.3); doc.circle(cx + cellW / 2, cy + ch / 2, 2, 'S'); }
      }
      yy += Math.ceil(n / per) * ch;
      return yy;
    }

    // ---- risultato, sanzioni, osservazioni, omologazione ----
    // spazio per risultati/sanzioni (sinistra) e osservazioni/firme/omologa (destra)
    const remLines = doc.splitTextToSize(clean(m.remarks || ''), (cw * 0.56) - 7).length;
    const need = Math.max(
      19 + 5 * st.sets.length + (st.forfeit ? 4 : 0) + 3.5 + Math.max(1, st.sanctions.length) * 3.6,
      Math.max(11, 4 + remLines * 3.2) + 31
    );
    if (y + need > H - 7) { doc.addPage(); y = M + 4; }
    const leftW = cw * 0.44;
    // tabella risultati
    const cols = [[t('thSet'), 11], [tn('A'), (leftW - 11 - 34) / 2], [tn('B'), (leftW - 11 - 34) / 2], [t('pdfDuration'), 16], [t('pdfWinner'), 18]];
    let cx = M;
    font(7, 'bold');
    cols.forEach(([l, cwid]) => { box(cx, y, cwid, 5, LIGHT); fit(l, cx + cwid / 2, y + 3.5, cwid - 2, 7, 'bold', INK, 'center'); cx += cwid; });
    let ry = y + 5;
    st.sets.forEach(s => {
      cx = M;
      const d = mins(s.startTime, s.endTime);
      const vals = [`${s.index + 1}${s.awarded ? '*' : ''}`, s.score.A, s.score.B, d != null ? `${d}'` : '', s.winner || ''];
      cols.forEach(([, cwid], k) => { box(cx, ry, cwid, 5); font(8, k === 1 || k === 2 ? 'bold' : 'normal'); doc.text(String(vals[k]), cx + cwid / 2, ry + 3.6, { align: 'center' }); cx += cwid; });
      ry += 5;
    });
    cx = M;
    const tot = [t('pdfSetsWon'), st.setsWon.A, st.setsWon.B, dur != null ? `${dur}'` : '', st.winner || ''];
    cols.forEach(([, cwid], k) => { box(cx, ry, cwid, 6, [245, 248, 250]); font(k ? 10 : 7, 'bold'); doc.text(String(tot[k]), cx + cwid / 2, ry + 4.2, { align: 'center' }); cx += cwid; });
    ry += 8;
    if (st.winner) {
      fit(`${t('pdfMatchWinner', { t: tn(st.winner) })}  ${st.setsWon[st.winner]}–${st.setsWon[other(st.winner)]}  (${st.sets.map(s => `${s.score[st.winner]}-${s.score[other(st.winner)]}`).join(', ')})`, M, ry + 1, leftW, 10, 'bold', st.winner === 'A' ? A_COL : B_COL);
      ry += 5;
    }
    if (st.forfeit) {
      const why = t('r_' + st.forfeit.reason);
      font(7, 'normal', GREY); doc.text(clean(t('pdfAwarded', { why, t: tn(st.forfeit.team), h: hhmm(st.forfeit.time) })), M, ry); ry += 4;
    }
    // sanzioni
    font(7, 'bold', GREY); doc.text(clean(t('pdfSanctions')), M, ry + 1); ry += 3.5;
    if (!st.sanctions.length) { font(7, 'normal'); doc.text(clean(t('pdfNone')), M, ry + 1); ry += 4; }
    st.sanctions.forEach(s => {
      const who = s.player === 'C' ? t('pdfCoach') : s.player === 'T' ? t('pdfTeam') : pl(s.team, s.player);
      font(7, 'normal');
      doc.text(clean(`${t('setN', { n: s.set + 1 })}  ${s.score.A}-${s.score.B}  ${hhmm(s.time)}  ·  ${s.team} ${tn(s.team)} – ${who}  ·  ${t('san_' + s.kind)}`), M, ry + 1, { maxWidth: leftW });
      ry += 3.6;
    });

    // osservazioni e omologazione (a destra)
    const rx = M + leftW + 4, rw = cw - leftW - 4;
    let yy = y;
    font(6, 'normal', GREY); doc.text(clean(t('remarks').toUpperCase()), rx + 1.2, yy + 2.6);
    const rem = doc.splitTextToSize(clean(m.remarks || ''), rw - 3);
    const remH = Math.max(11, 4 + rem.length * 3.2);
    box(rx, yy, rw, remH);
    font(7.5, 'normal'); doc.text(rem, rx + 1.5, yy + 6);
    yy += remH + 2;
    const sigW = (rw - 3 * 2) / 4, sigH = 17;
    [['capA', t('pdfCaptain', { t: tn('A') })], ['capB', t('pdfCaptain', { t: tn('B') })], ['scorer', `${t('scorer')} ${clean(m.officials.scorer || '')}`], ['ref1', `${t('ref1')} ${clean(m.officials.ref1 || '')}`]].forEach(([k, l], i) => {
      const sx = rx + i * (sigW + 2);
      box(sx, yy, sigW, sigH);
      fit(l, sx + 1, yy + 2.6, sigW - 2, 5.8, 'normal', GREY);
      if (m.signatures && m.signatures[k]) {
        try { doc.addImage(m.signatures[k], 'PNG', sx + 1, yy + 3.5, sigW - 2, (sigW - 2) / 3 > sigH - 4 ? sigH - 4 : (sigW - 2) / 3, 'sig-' + k, 'FAST'); } catch (e) { /* firma non leggibile */ }
      }
    });
    yy += sigH + 2;
    if (m.approved) {
      doc.setDrawColor(43, 138, 62); doc.setLineWidth(0.6); doc.setFillColor(235, 251, 238);
      doc.roundedRect(rx, yy, rw, 10, 1.5, 1.5, 'FD');
      font(11, 'bold', [43, 138, 62]); doc.text(clean(t('pdfApproved')), rx + 3, yy + 6.6);
      font(8, 'normal', [43, 138, 62]); doc.text(clean(t('pdfApprovedOn', { d: new Date(m.approved.time).toLocaleString(I18n.locale(), { hourCycle: 'h23' }) })), rx + rw - 3, yy + 6.4, { align: 'right' });
    } else {
      doc.setDrawColor(...GREY); doc.setLineWidth(0.3); doc.setLineDashPattern([1.5, 1], 0);
      doc.roundedRect(rx, yy, rw, 10, 1.5, 1.5, 'S'); doc.setLineDashPattern([], 0);
      font(9, 'bold', GREY); doc.text(clean(t('pdfNotApproved')), rx + 3, yy + 6.4);
    }

    // legenda e piè di pagina
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      font(5.8, 'normal', GREY);
      doc.text(clean(t('pdfLegend')), M, H - 3.5, { maxWidth: W - 2 * M - 25 });
      doc.text(clean(t('pdfPage', { p, n: pages })), W - M, H - 3.5, { align: 'right' });
      if (opts.draft) {
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.12 }));
        font(90, 'bold', [201, 42, 42]);
        doc.text(clean(t('pdfDraft')), W / 2, H / 2 + 15, { align: 'center', angle: 20 });
        doc.restoreGraphicsState();
      }
    }

    const name = `${t('pdfFile')}${safe(m.header.matchNo) ? '_' + safe(m.header.matchNo) : ''}_${safe(opts.teamName ? opts.teamName('A') : 'A')}_vs_${safe(opts.teamName ? opts.teamName('B') : 'B')}${opts.draft ? '_' + t('pdfFileDraft') : ''}.pdf`;
    return { blob: doc.output('blob'), name, doc };
  }

  window.ScoresheetPDF = { generate, safeName: safe };
})();
