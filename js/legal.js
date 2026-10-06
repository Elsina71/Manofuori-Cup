// Testi legali (in italiano, lingua di riferimento): informativa privacy, cookie policy, termini e condizioni.
// Titolare: ASD Manofuori Volley Project. Aggiornare la data e la versione quando si cambia un testo.
const Legal = (() => {
  const VERSION = '2026-10-05';
  const ORG = {
    name: 'ASD Manofuori Volley Project',
    kind: 'Associazione Sportiva Dilettantistica',
    address: "via Mandrolisai 68A, 09045 Quartu Sant'Elena (CA)",
    cf: '92212890922',
    vat: '03512620927',
    rep: 'Marianna Stara',
    repRole: 'Presidente e legale rappresentante',
    email: 'manofuori@tiscali.it',
    site: 'https://manofuori-774b2.web.app'
  };
  const mail = `<a href="mailto:${ORG.email}">${ORG.email}</a>`;
  const owner = `<p><strong>${ORG.name}</strong> (${ORG.kind})<br>${ORG.address}<br>Codice fiscale ${ORG.cf} · Partita IVA ${ORG.vat}<br>
    ${ORG.repRole}: ${ORG.rep}<br>Email per la privacy e per ogni richiesta: ${mail}</p>`;

  const privacy = `
    <p class="muted">Informativa ai sensi degli artt. 13 e 14 del Regolamento (UE) 2016/679 (GDPR) e del D.Lgs. 196/2003, relativa al sito e all'app Manofuori Cup (<a href="${ORG.site}">${ORG.site.replace(/^https?:\/\//, '')}</a>). Ultimo aggiornamento: ${VERSION.split('-').reverse().join('/')}.</p>
    <h2>1. Titolare del trattamento</h2>
    ${owner}
    <p>L'associazione non ha nominato un Responsabile della protezione dei dati (DPO), non essendo obbligata; per ogni richiesta sulla privacy scrivi a ${mail}.</p>

    <h2>2. Quali dati trattiamo</h2>
    <ul>
      <li><strong>Account</strong>: nome, cognome, sesso, email e password. La password è gestita dal servizio di autenticazione di Google Firebase e non è mai visibile all'associazione.</li>
      <li><strong>Tornei e classifiche</strong>: iscrizioni, compagni di squadra, risultati, punteggi e classifiche.</li>
      <li><strong>Prenotazioni dei campi</strong>: giorno, orario e campo. Agli altri utenti il campo risulta solo "occupato", senza il tuo nome.</li>
      <li><strong>Sfide, gioco libero, "cerco compagno/a"</strong>: le partecipazioni e le candidature che invii (il nome è visibile agli utenti coinvolti, come descritto in ogni sezione; nel gioco libero gli altri vedono solo quanti uomini e donne partecipano).</li>
      <li><strong>Allenamenti</strong>: gruppi, presenze, assenze, posti spot e recuperi. Il coach vede solo nomi e presenze dei propri allenamenti.</li>
      <li><strong>Scheda del corsista</strong> (solo per chi si allena con l'associazione): luogo e data di nascita, comune e indirizzo di residenza, codice fiscale, tesseramento della stagione e <em>data di scadenza</em> del certificato medico. Non conserviamo il certificato né informazioni sul tuo stato di salute.</li>
      <li><strong>Pagamenti</strong>: importo, data, modalità (contanti, bancomat, bonifico) e ricevute emesse. Nell'app non si inseriscono dati di carte o conti bancari.</li>
      <li><strong>Dati tecnici</strong>: indirizzo IP e informazioni del browser registrati dai fornitori dei servizi (vedi punto 5) per farli funzionare e proteggerli.</li>
    </ul>

    <h2>3. Perché li trattiamo (finalità e basi giuridiche)</h2>
    <ul>
      <li><strong>Creare e gestire il tuo account e i servizi dell'app</strong> (tornei, prenotazioni, sfide, gioco libero, allenamenti, avvisi di servizio) — esecuzione del rapporto con te, art. 6.1.b GDPR.</li>
      <li><strong>Pubblicare l'elenco degli iscritti, i risultati e le classifiche dei tornei</strong> (nome, cognome, categoria maschile/femminile e punteggi) — esecuzione del rapporto associativo e sportivo, art. 6.1.b, e legittimo interesse dell'associazione a dare evidenza all'attività sportiva, art. 6.1.f.</li>
      <li><strong>Tesseramento, verifica dell'idoneità sportiva (scadenza del certificato) e gestione degli allenamenti</strong> — obblighi di legge e dei regolamenti sportivi, art. 6.1.c, ed esecuzione del rapporto, art. 6.1.b.</li>
      <li><strong>Registrazione dei pagamenti ed emissione delle ricevute</strong>, con codice fiscale e residenza — obblighi fiscali e contabili, art. 6.1.c.</li>
      <li><strong>Sicurezza dell'app e prevenzione degli abusi</strong> — legittimo interesse, art. 6.1.f.</li>
    </ul>
    <p>Non usiamo i tuoi dati per pubblicità, marketing o profilazione e non li vendiamo a nessuno. La classifica e i reward sono calcoli sull'attività sportiva, non profilazione a fini commerciali.</p>

    <h2>4. Obbligatorietà</h2>
    <p>I dati dell'account sono necessari per usare i servizi riservati agli utenti registrati. I dati della scheda del corsista e dei pagamenti sono necessari per il tesseramento, per partecipare agli allenamenti e per emettere le ricevute: senza di essi non possiamo fornire questi servizi.</p>

    <h2>5. A chi comunichiamo i dati</h2>
    <ul>
      <li><strong>Persone autorizzate dall'associazione</strong>: il Presidente e gli amministratori generali dell'app; gli amministratori dei tornei solo per tornei, iscrizioni, classifiche e referti; gli addetti alla cassa solo per incassi e ricevute (con nome, codice fiscale e residenza dei tesserati necessari a intestarle); i coach solo per nomi e presenze dei propri allenamenti; gli account dei campi solo per i referti delle partite.</li>
      <li><strong>Google Ireland Ltd / Google LLC</strong> (Firebase: hosting, database, autenticazione, invio delle email di conferma), che agisce come responsabile del trattamento secondo i termini sulla protezione dei dati di Google Cloud.</li>
      <li><strong>Federazioni ed enti di promozione sportiva</strong> per il tesseramento, <strong>consulenti fiscali</strong> per gli adempimenti contabili e <strong>autorità pubbliche</strong> quando previsto dalla legge.</li>
    </ul>
    <p>I dati pubblici dell'app (calendari, elenco degli iscritti ai tornei con nome, cognome e categoria maschile/femminile, risultati e classifiche con nome e punteggi) sono visibili a chiunque visiti il sito. Email, telefono e gli altri dati del profilo non sono mai pubblici.</p>

    <h2>6. Dove sono conservati i dati e trasferimenti fuori dall'Unione europea</h2>
    <p>Il database dell'app è conservato <strong>nell'Unione europea, a Milano (Italia)</strong>, nella regione europe-west8 di Google Cloud.</p>
    <p>Solo in casi limitati (per esempio assistenza tecnica e sicurezza) Google LLC può trattare dati negli Stati Uniti. Il trasferimento avviene sulla base della decisione di adeguatezza UE-USA (Data Privacy Framework) e/o delle clausole contrattuali standard approvate dalla Commissione europea.</p>

    <h2>7. Per quanto tempo li conserviamo</h2>
    <ul>
      <li><strong>Account e profilo</strong>: finché l'account è attivo; dopo la richiesta di cancellazione vengono eliminati, salvo quanto indicato sotto.</li>
      <li><strong>Prenotazioni, presenze, iscrizioni, sfide e gioco libero</strong>: 24 mesi.</li>
      <li><strong>Risultati e classifiche dei tornei</strong>: conservati come archivio storico dell'attività sportiva; puoi chiedere che il tuo nome sia sostituito da un'abbreviazione.</li>
      <li><strong>Scheda del corsista</strong>: 2 anni dopo la fine dell'ultima stagione di allenamenti.</li>
      <li><strong>Ricevute e dati fiscali</strong>: 10 anni, come previsto dalla legge (art. 2220 c.c.).</li>
    </ul>

    <h2>8. I tuoi diritti</h2>
    <p>Puoi chiedere in ogni momento: <strong>accesso</strong> ai tuoi dati e una copia (art. 15), <strong>rettifica</strong> (art. 16), <strong>cancellazione</strong> (art. 17), <strong>limitazione</strong> (art. 18), <strong>portabilità</strong> in formato leggibile (art. 20) e <strong>opposizione</strong> ai trattamenti basati sul legittimo interesse (art. 21).</p>
    <p>Come fare: dal tuo <strong>Profilo → Privacy e dati personali</strong> puoi scaricare i tuoi dati e chiedere la cancellazione dell'account; per tutto il resto scrivi a ${mail}. Rispondiamo entro 30 giorni (prorogabili di altri 60 nei casi complessi, avvisandoti). Alcuni dati possono essere conservati se un obbligo di legge lo richiede (per esempio le ricevute).</p>
    <p>Hai anche il diritto di presentare reclamo al <strong>Garante per la protezione dei dati personali</strong> (www.garanteprivacy.it).</p>

    <h2>9. Sicurezza</h2>
    <p>I dati sono trasmessi solo con connessione cifrata (HTTPS) e conservati, cifrati, sui server di Google a Milano. L'accesso è regolato da regole lato server: i dati della scheda del corsista, i piani e le ricevute li vedono solo gli amministratori e il diretto interessato; le email degli utenti non sono visibili agli altri utenti. Il sito usa intestazioni di sicurezza (Content Security Policy, HSTS) contro attacchi informatici.</p>

    <h2>10. Minori</h2>
    <p>I servizi sono rivolti a maggiorenni. Per i minori di 14 anni l'iscrizione e il trattamento dei dati richiedono il consenso di chi esercita la responsabilità genitoriale (art. 2-quinquies D.Lgs. 196/2003), da raccogliere presso la segreteria.</p>

    <h2>11. Modifiche</h2>
    <p>Possiamo aggiornare questa informativa; la versione in vigore è sempre in questa pagina e, in caso di modifiche importanti, ti chiederemo di prenderne visione all'accesso.</p>`;

  const cookies = `
    <p class="muted">Ultimo aggiornamento: ${VERSION.split('-').reverse().join('/')}. Titolare: ${ORG.name}, ${ORG.email}.</p>
    <h2>Cosa usiamo</h2>
    <p>Questo sito <strong>non usa cookie di profilazione, pubblicitari o di statistica</strong> e non installa strumenti di tracciamento. Non usa cookie veri e propri ma la memoria del browser (localStorage e IndexedDB), con le stesse regole dei cookie (art. 122 D.Lgs. 196/2003, Linee guida del Garante del 10 giugno 2021).</p>
    <p>Al primo accesso puoi scegliere: <strong>Accetta tutti</strong>, <strong>Rifiuta</strong> (solo strumenti necessari) o <strong>Personalizza</strong>. Puoi cambiare idea in qualsiasi momento con <a href="#/cookie" data-consent="open">Preferenze cookie</a> (anche nel piè di pagina). Se rifiuti, lingua, tema e colori si possono cambiare durante la visita ma <strong>non vengono salvati</strong>, e la copia offline dei dati non viene creata (quella già presente viene cancellata).</p>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Nome</th><th>Categoria</th><th>Finalità</th><th>Durata</th></tr></thead>
      <tbody>
        <tr><td>Sessione di accesso (Firebase Authentication: IndexedDB "firebaseLocalStorageDb")</td><td>Necessario, prima parte</td><td>Ricordare che hai fatto l'accesso</td><td>Fino all'uscita dall'account</td></tr>
        <tr><td>bpa-consent (localStorage)</td><td>Necessario</td><td>Ricordare la tua scelta sui cookie</td><td>Fino alla cancellazione dei dati del sito dal browser</td></tr>
        <tr><td>Dati del referto elettronico (localStorage, solo account dei campi)</td><td>Necessario</td><td>Non perdere il referto in compilazione senza rete</td><td>Fino all'invio o alla cancellazione</td></tr>
        <tr><td>pcm-lang, pcm-theme, pcm-design (localStorage)</td><td>Preferenze (solo con consenso)</td><td>Lingua e stile grafico scelti</td><td>Fino alla revoca del consenso o alla cancellazione dei dati del sito</td></tr>
        <tr><td>Copia offline del database (IndexedDB di Firestore)</td><td>Preferenze (solo con consenso)</td><td>Far funzionare l'app più velocemente e anche con poca rete</td><td>Fino alla revoca del consenso o alla cancellazione dei dati del sito</td></tr>
      </tbody></table></div>
    <h2>Risorse di terze parti</h2>
    <p>Caratteri, icone e programmi sono <strong>dentro l'app</strong>: il browser non contatta Google Fonts né altri servizi esterni per scaricarli. L'unico fornitore esterno è <strong>Google (Firebase)</strong>, che ospita il sito e il database come responsabile del trattamento (vedi l'Informativa privacy); non installa cookie attraverso il nostro sito.</p>
    <h2>Come cancellarli</h2>
    <p>Oltre alle Preferenze cookie, puoi cancellare tutto dalle impostazioni del browser (Cronologia → Cancella dati dei siti web). L'app continuerà a funzionare, ma dovrai accedere di nuovo e scegliere di nuovo.</p>`;

  const terms = `
    <p class="muted">Termini e condizioni d'uso dell'app Manofuori Cup. Ultimo aggiornamento: ${VERSION.split('-').reverse().join('/')}.</p>
    <h2>1. Chi fornisce il servizio</h2>
    ${owner}
    <p>L'app è uno strumento gratuito dell'associazione per i propri soci e per chi partecipa alle sue attività (tornei, prenotazioni dei campi, sfide, gioco libero, allenamenti). Le quote e i prezzi delle attività si pagano in sede; l'app non incassa pagamenti.</p>

    <h2>2. Account</h2>
    <ul>
      <li>Per registrarti devi indicare dati veri e aggiornati e confermare l'email; l'account è personale e non si cede.</li>
      <li>Custodisci la password: le azioni fatte con il tuo account si considerano fatte da te. Se sospetti un uso non autorizzato, cambiala e avvisaci.</li>
      <li>L'associazione può sospendere l'uso di alcune funzioni (lista nera per tornei e/o prenotazioni) o l'account in caso di violazione di questi termini o del regolamento del centro, informandoti.</li>
    </ul>

    <h2>3. Prenotazioni dei campi</h2>
    <ul>
      <li>Le prenotazioni seguono i limiti indicati nell'app (durata minima e massima, numero al giorno, giorni di anticipo) e gli orari dei campi.</li>
      <li>Si possono modificare o cancellare dall'app nei limiti previsti. Chi non si presenta ripetutamente può essere escluso dalle prenotazioni.</li>
      <li>L'associazione può spostare o annullare una prenotazione per esigenze organizzative, maltempo, manutenzione o eventi, avvisandoti nell'app.</li>
    </ul>

    <h2>4. Tornei, sfide e gioco libero</h2>
    <ul>
      <li>L'iscrizione a un torneo è confermata secondo le regole del torneo; si applicano il regolamento del torneo e le norme sportive. Risultati e classifiche sono pubblici.</li>
      <li>Sfide, gioco libero e "cerco compagno/a" sono strumenti per organizzarsi: ognuno è responsabile dei messaggi e delle candidature che invia, nel rispetto degli altri utenti.</li>
    </ul>

    <h2>5. Allenamenti</h2>
    <ul>
      <li>L'abbonamento è mensile (o trimestrale, dove previsto) e dà diritto agli allenamenti settimanali del proprio piano; il quinto lunedì, martedì, ecc. del mese (giorni 29, 30 e 31) è fuori abbonamento e si paga come allenamento spot.</li>
      <li>La presenza va confermata nell'app entro le ore 12 del giorno dell'allenamento; chi non risponde è considerato assente e il posto può essere assegnato ad altri. Le assenze non danno diritto a rimborsi; l'eventuale recupero è a discrezione dell'associazione.</li>
      <li>Gli allenamenti spot sono confermati dall'associazione e si pagano in sede. Per ogni pagamento viene rilasciata ricevuta.</li>
      <li>Per allenarsi servono il tesseramento della stagione e un certificato medico di idoneità valido, che il socio consegna in segreteria e di cui è responsabile.</li>
    </ul>

    <h2>6. Uso corretto</h2>
    <p>È vietato usare l'app per scopi illeciti, inserire contenuti offensivi o dati di altre persone senza autorizzazione, tentare di accedere a dati non propri, aggirare i limiti o sovraccaricare il servizio con richieste automatiche.</p>

    <h2>7. Disponibilità e responsabilità</h2>
    <p>L'associazione cura il buon funzionamento dell'app ma non può garantire che sia sempre disponibile e priva di errori (per esempio per manutenzione o guasti dei fornitori). In caso di malfunzionamenti fanno fede gli accordi presi con la segreteria. L'associazione non risponde dei danni derivanti da un uso dell'app non conforme a questi termini; restano ferme le responsabilità per dolo o colpa grave e i diritti non derogabili del consumatore (D.Lgs. 206/2005).</p>

    <h2>8. Privacy</h2>
    <p>I dati personali sono trattati come descritto nell'<a href="#/privacy">Informativa privacy</a>.</p>

    <h2>9. Modifiche, legge e foro</h2>
    <p>I termini possono essere aggiornati; le modifiche importanti ti verranno comunicate nell'app. Si applica la legge italiana. Per le controversie con un consumatore è competente il foro del suo luogo di residenza o domicilio; negli altri casi il foro di Cagliari.</p>

    <h2>10. Contatti</h2>
    <p>Per qualsiasi domanda scrivi a ${mail}.</p>`;

  return { VERSION, ORG, pages: { privacy, cookie: cookies, termini: terms } };
})();
