// Testi del referto (solo italiano).
const I18n = (() => {
  const dict = {
    it: {
      appName: 'Referto Beach Volley', homeAria: "Torna all'elenco gare", language: 'Lingua',
      match: 'Gara', court: 'Campo', teamX: 'Squadra {t}', playerN: 'Giocatore {n}', vs: 'vs',
      saveError: 'Attenzione: impossibile salvare nel browser',
      cancel: 'Annulla', confirm: 'Conferma', close: 'Chiudi', ok: 'OK', del: 'Elimina',
      // home
      heroTitle: 'Referto elettronico',
      heroText: "Inserisci i dati della gara, esegui il sorteggio e poi tocca solo la squadra che vince l'azione: servizio, rotazione, cambi campo e fine set li gestisce l'app.",
      newMatch: '＋ Nuova gara', newSame: '＋ Nuova gara, stesso torneo', newSameTitle: "Copia torneo, data, arbitri e formula dall'ultima gara",
      matches: 'Gare', noMatches: 'Nessuna gara salvata.',
      st_approved: 'Omologata', st_idle: 'Da iniziare', st_toApprove: 'Da omologare', st_live: 'In corso',
      deleteTitle: 'Eliminare la gara?', deleteText: "{m}: {a} vs {b}. L'operazione non si può annullare.", deleteAria: 'Elimina gara',
      backup: 'Backup', backupText: 'Le gare restano salvate su questo dispositivo, anche senza connessione. Esporta un file di backup per conservarle o spostarle.',
      exportBtn: '⬇ Esporta backup', importBtn: '⬆ Importa backup', imported: '{n} gare importate', badFile: 'File non valido',
      // dati gara
      secTournament: 'Torneo e gara', competition: 'Torneo / competizione', competitionPh: 'es. Campionato Italiano – Tappa di Rimini',
      location: 'Località / impianto', phase: 'Fase / girone', phasePh: 'es. Girone A, Semifinale', matchNo: 'Numero gara',
      date: 'Data', startTime: 'Orario di inizio', category: 'Categoria', g_M: 'Maschile', g_F: 'Femminile', g_X: 'Misto',
      teamName: 'Nome squadra', teamNameHint: '(facoltativo: se vuoto usa i cognomi)', playerNo: 'Giocatore n. {n}', fullName: 'Nome e cognome',
      coach: 'Allenatore', officials: 'Ufficiali di gara', ref1: '1° arbitro', ref2: '2° arbitro', scorer: 'Segnapunti', assistant: 'Assistente segnapunti',
      format: 'Formula', formatLabel: 'Formula di gioco', fmt_bo3: 'Al meglio dei 3 set ({a} – {a} – {b})', fmt_single: 'Set unico a {a}',
      ttoLabel: 'Tempo tecnico a 21 punti totali (set 1 e 2)', formatLocked: 'La formula non si può cambiare a gara iniziata.',
      backToMatch: 'Torna alla gara', save: 'Salva', nextToss: 'Avanti: sorteggio ▸',
      // sorteggio
      setN: 'Set {n}', tossSuffix: ' — sorteggio', setsWon: 'Set vinti', setsWonShort: 'Set',
      tossWinner: 'Chi ha vinto il sorteggio?', tossWinnerChose: 'Il vincitore del sorteggio sceglie',
      set2Chooser: 'Sceglie la squadra che ha perso il sorteggio del set 1',
      chooserChose: '{t} sceglie', otherChose: '{t} sceglie tra servizio e ricezione',
      ch_serve: 'Servizio', ch_receive: 'Ricezione', ch_side: 'Campo',
      servesFirst: 'Serve per prima', leftSide: 'Squadra alla SINISTRA del segnapunti', leftSideHint: 'secondo il campo scelto',
      firstServer: 'Primo al servizio – {t}', scorerView: 'Vista dal tavolo del segnapunti', serviceOrder: 'Ordine di servizio',
      undoLast: '↶ Annulla ultimo evento', editData: '✎ Dati gara', startSet: '▶ Inizia set {n}',
      // gara
      toSet: 'a {n}', setStart: 'Inizio {t}', switchIn: 'cambio campo tra {n} punti', switchIn1: 'cambio campo tra 1 punto',
      serving: 'al servizio', next: '(prossimo)', pointTo: 'Punto a {t}', plusPoint: '+1 PUNTO',
      timeout: '⏱ Time-out', timeoutUsed: 'usato', setPoint: 'Set point', toGo: '−{n} al set',
      undo: '↶ Annulla', sanction: '🟨 Sanzione', more: '⋯ Altro', lastRallies: 'Ultime azioni', penaltyBadge: 'penalità', sideOut: 'cambio palla',
      tapHint: "Tocca il punteggio della squadra che vince l'azione.", toShort: 'T-O',
      timeoutTitle: 'Time-out', timeoutAsk: 'Time-out richiesto da <b>{t}</b>?',
      switchTitle: '⇄ CAMBIO CAMPO', switchText: 'Le squadre cambiano lato: sullo schermo i lati sono già stati invertiti.',
      ttoTitle: 'Tempo tecnico', ttoSub: '21 punti totali',
      matchEndTitle: '🏆 Fine gara', setEndTitle: 'Fine set {n}', wins: 'Vince', setTo: 'Set a', undoPoint: '↶ Annulla ultimo punto',
      undone: 'Annullato: {x}', ev_point: 'punto', ev_timeout: 'time-out', ev_sanction: 'sanzione', ev_setStart: 'inizio set', ev_forfeit: 'ritiro',
      sanTitle: 'Sanzione', team: 'Squadra', member: 'Componente', type: 'Tipo', pointToOpp: '(punto agli avversari)', record: 'Registra',
      heavyConfirm: 'Confermi?', heavyE: '{s} a {t}: la squadra perde il set.', heavyD: '{s} a {t}: la squadra perde la gara.',
      moreTitle: 'Altre operazioni', editMatch: '✎ Modifica dati gara (nomi, arbitri…)', draftPdf: '📄 Anteprima PDF (bozza)',
      forfeitOf: '🚑 Ritiro / forfait {t}', matchList: '⌂ Elenco gare', forfeitTitle: 'Ritiro di {t}',
      forfeitText: 'La squadra perde la gara: agli avversari vengono assegnati i punti e i set mancanti.',
      r_INJ: 'Infortunio / squadra incompleta', r_FFT: 'Rinuncia (forfait)', r_D: 'squalifica',
      san_DW: 'Avvertimento per ritardo', san_DP: 'Penalizzazione per ritardo', san_W: 'Avvertimento (condotta)', san_P: 'Penalizzazione',
      san_E: 'Espulsione (set perso)', san_D: 'Squalifica (gara persa)',
      sanShort_DW: 'AR', sanShort_DP: 'PR', sanShort_W: 'AVV', sanShort_P: 'PEN', sanShort_E: 'ESP', sanShort_D: 'SQU',
      // fine gara
      approvedStamp: 'OMOLOGATA', finalResult: 'Risultato finale', thSet: 'Set', thStart: 'Inizio', thEnd: 'Fine', thDuration: 'Durata',
      matchDuration: 'durata gara {n}′', awardedNote: '(* set assegnato)',
      remarks: 'Osservazioni', remarksPh: 'Eventuali annotazioni, reclami, infortuni…', signatures: 'Firme', optional: '(facoltative)', clear: 'Cancella',
      sig_capA: 'Capitano squadra A', sig_capB: 'Capitano squadra B', sig_scorer: 'Segnapunti', sig_ref1: '1° arbitro',
      downloadPdf: '⬇ Scarica PDF del referto', approveBtn: '✔ OMOLOGA', approveTitle: 'Omologare il risultato?',
      approveText: "Dopo l'omologazione il referto non è più modificabile.", approvedToast: 'Risultato omologato',
      pdfMaking: 'Creazione PDF…', pdfError: 'Errore nella creazione del PDF',
      // PDF
      fmt_bo5: 'Al meglio dei 5 set (a {a}, quinto set a {b})',
      linkLoading: 'Collegamento alla gara…',
      linkOffline: 'Serve la connessione a internet per aprire il referto la prima volta.',
      linkedBanner: "Gara collegata al torneo: torneo, numero gara, squadre, orario, campo e fase arrivano dall'organizzazione. Completa gli ufficiali di gara: il punteggio sarà pubblicato in diretta.",
      linkedBadge: 'Collegata al torneo',
      closeSendBtn: '✔ CHIUDI GARA E INVIA RISULTATO', closeSendTitle: 'Chiudere la gara e inviare il risultato?',
      closeSendText: "Il risultato sarà visibile nell'app del torneo e verrà acquisito dopo l'omologa dell'organizzazione. Il referto non sarà più modificabile.",
      pendingStamp: 'IN ATTESA DI OMOLOGA', pendingText: "Risultato inviato: in attesa dell'omologa dell'organizzazione.", sentToast: "Risultato inviato all'organizzazione",
      approvedByOrg: "Risultato omologato dall'organizzazione", reopenedByOrg: "L'organizzazione ha riaperto la gara: puoi modificare il referto.",
      sync_ok: 'In diretta', sync_wait: 'In attesa di rete', sync_err: 'Non pubblicato',
      loginTitle: 'Accesso refertista', loginText: "Accedi con l'account del campo (o da amministratore).", password: 'Password', loginBtn: 'Accedi',
      loginErr: 'Email o password non corrette.', notEnabled: 'Questo account non è abilitato ai referti elettronici.',
      refNotFound: 'Referto non trovato: aprilo dal pulsante E-scoresheet della gara nel Championship Manager.',
      archiveTitle: 'Archivio referti', archiveCount: '{n} referti', archiveEmpty: 'Nessun referto per questo torneo.',
      archiveHelp: "Un referto per ogni gara. I PDF sono archiviati e sempre aggiornati all'ultima versione del referto (omologato o in bozza).",
      zipBtn: '⬇ Scarica tutti i PDF (ZIP)', zipMaking: 'Preparazione… {n}/{t}', openBtn: 'Apri',
      jerseyQ: 'Colore della maglia delle squadre', jersey: 'Colore maglia', jerseyRequired: 'Scegli il colore della maglia di entrambe le squadre.', jerseySame: 'Le due squadre hanno lo stesso colore di maglia: scegline uno diverso.',
      col_white: 'Bianco', col_black: 'Nero', col_red: 'Rosso', col_bordeaux: 'Bordeaux', col_orange: 'Arancione', col_yellow: 'Giallo', col_green: 'Verde',
      col_lime: 'Verde lime', col_lightblue: 'Azzurro', col_blue: 'Blu', col_navy: 'Blu scuro', col_purple: 'Viola', col_pink: 'Rosa', col_grey: 'Grigio', col_custom: 'Altro',
      pdfJersey: 'Maglia: {c}',
      pdfTitle: 'REFERTO DI GARA — BEACH VOLLEY', pdfMatchCourt: 'Gara n. {m}   ·   Campo {c}',
      pdfScheduled: 'Orario programmato', pdfActualStart: 'Inizio effettivo', pdfMatchEnd: 'Fine gara', pdfDuration: 'Durata', min: '{n} min',
      pdfToss: 'Sorteggio set {n}', pdfTossWon: 'vinto da {t}', pdfChoices: 'Scelte: {x}',
      pdfSetAwarded: 'Set assegnato', pdfPoints: 'a {n} punti', pdfStartEnd: 'Inizio {a}  ·  Fine {b}  ·  a {n}',
      pdfLeftStart: "Lato sinistro all'inizio: {t}", pdfSwitches: 'Cambi campo: {x}', pdfTto: 'Tempo tecnico: {x}',
      pdfResult: 'RISULTATO', pdfWinsSet: 'vince {t}', pdfSetsWon: 'Set vinti', pdfWinner: 'Vince', pdfMatchWinner: 'VINCE: {t}',
      pdfAwarded: '* Set assegnato: {why} di {t} alle {h}', pdfSanctions: 'SANZIONI', pdfNone: 'Nessuna', pdfCoach: 'Allenatore', pdfTeam: 'Squadra',
      pdfCaptain: 'Capitano {t}', pdfApproved: 'RISULTATO OMOLOGATO', pdfApprovedOn: 'il {d}', pdfNotApproved: 'Risultato non ancora omologato',
      pdfLegend: 'Turni di servizio: punteggio della squadra quando il giocatore perde il servizio (cerchiato = fine set). Punti barrati = punti fatti, P = punto da penalizzazione, grigio = assegnato.',
      pdfPage: 'Pagina {p}/{n}', pdfDraft: 'BOZZA', pdfFile: 'referto_gara', pdfFileDraft: 'BOZZA'
    }
  };

  const LOCALES = { it: 'it-IT' };
  const lang = 'it';   // solo italiano

  return {
    get lang() { return lang; },
    langs: ['it'],
    set() { /* una sola lingua */ },
    locale() { return LOCALES[lang]; },
    t(key, params) {
      let s = dict[lang][key] || key;
      if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? params[k] : m));
      return s;
    },
    _dict: dict
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = I18n;
