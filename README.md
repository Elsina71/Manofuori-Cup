# Manofuori Cup 🏐

Web app responsive (telefono, tablet, PC) per gestire tornei, gioco libero, allenamenti e cassa.
Interfaccia **solo in italiano** (anche nel referto elettronico).

È un'app **indipendente**: ha il suo progetto Firebase (database, account, sito web) e non condivide nulla
con altre app. Nasce come copia di Beach+ Arena Event Manager (repository `Elsina71/Repository-principale`,
cartella `beach-plus-arena`); per ora ha un solo **tema neutro** (vedi *Temi grafici e colori*).

**Differenze da Beach+ Arena**: niente prenotazione dei campi, niente sfide, niente "cerco compagno/a" (ai tornei ci si iscrive come squadra) e niente ranking (le classifiche saranno
rifatte per le squadre di pallavolo). Gioco libero e allenamenti non occupano campi: hanno un **luogo** scritto a mano.
Categorie, tabelle punti e anagrafica giocatori restano per ora, finché i tornei non vengono rifatti per le squadre.

## Da completare prima di pubblicare

Cerca `DA_COMPILARE` nei file: sono i dati che mancano.
- `firestore.rules`: email degli admin generali (l'UID dell'admin principale è già inserito).
- `js/legal.js`: sito (ora `manofuori-774b2.web.app`) da cambiare se ci sarà un dominio proprio.

## Configurazione (una volta sola)

1. Crea un progetto su https://console.firebase.google.com (es. `manofuori-cup`).
2. Attiva **Authentication → Email/password**, **Firestore Database** e **Hosting**.
3. In *Impostazioni progetto → Le tue app* aggiungi un'app **Web** e copia i dati in `js/firebase-config.js`.
4. Crea l'utente amministratore in *Authentication → Users*, copia il suo **UID** e mettilo in
   `firestore.rules` (al posto di `UID_ADMIN_DA_COMPILARE`). L'UID non va nel codice pubblico: l'app capisce di essere
   admin leggendo `admins/probe`, che le regole permettono solo agli admin. Altri admin: raccolta `admins` (console Firebase).
5. Scrivi l'ID del progetto in `.firebaserc`.
6. Pubblica:
   - **automaticamente**: a ogni modifica su `main` parte `.github/workflows/pubblica.yml` (scheda *Actions*, anche
     *Run workflow* a mano). Serve il secret `FIREBASE_SA_MANOFUORI` (*Settings → Secrets and variables → Actions*) con
     la chiave JSON dell'account di servizio (*Impostazioni progetto → Account di servizio → Genera nuova chiave privata*;
     ruolo *Amministratore Firebase*);
   - **a mano (Windows)**: scarica lo ZIP del repository, estrailo e fai doppio clic su `pubblica-manofuori.bat`.

## Pagina "In evidenza" (prima pagina)

La prima pagina (`#/`, icona della casetta nel menu) contiene:
- **due spazi editoriali** con foto, titolo e testo, a dimensione fissa e identica: se il testo non ci sta finisce con
  "…" e compare **Visualizza l'articolo**, che apre la pagina autonoma dell'articolo (`#/a/1`, `#/a/2`);
- i **tornei attivi** (in corso e in arrivo), con il link a *Tutti i tornei* (`#/tournaments`);
- le prossime sessioni di **gioco libero**.

L'admin compila gli spazi direttamente in pagina (*Aggiungi articolo · spazio 1/2*, *Modifica*, *Svuota spazio*);
la foto si carica dal telefono o dal computer e viene ridimensionata automaticamente. Sono salvati in
`data/editorial1` e `data/editorial2` del database (lettura per tutti, scrittura solo admin).

## Account dei giocatori, iscrizioni online, reward e messaggi

- **Registrazione** (*Impostazioni → Registrati*): nome, cognome, sesso, email e password. Il profilo (`#/me`, voce
  **Profilo**) è visibile solo all'utente: dati, tornei disputati, piazzamenti e punti (per torneo e totali), reward e
  tornei in programma a cui è iscritto. L'iscrizione si cancella fino a 24 ore prima dell'inizio; dopo, l'app chiede di
  contattare l'organizzatore (bloccato anche dalle regole del database).
- **Creazione del torneo in due fasi**: (1) nome, data e ora di inizio, maschile/femminile/misto, numero massimo di
  squadre, termine delle iscrizioni; (2) gli utenti registrati si iscrivono con il compagno o la compagna (scelto tra
  gli utenti registrati, oppure scritto a mano se non usa l'app). Oltre il massimo si va in **lista d'attesa**.
- **Gestione**: chiusura delle iscrizioni e importazione delle squadre, revisione (aggiungi, modifica, cancella,
  lista d'attesa), **conferma della lista ufficiale**, poi scelta di **formula, categoria e coefficiente** (scheda
  *Scheda*). Da lì il torneo prosegue come sempre.
- **Reward**: livelli Stellina ⭐, Stella cometa ☄️, Terra 🌍, Pianeti 🪐, Galassia 🌌 in base ai tornei disputati
  (giocatore nella lista ufficiale), per tutti i giocatori registrati o no. Le soglie le sceglie l'admin in
  *Impostazioni → Reward dei giocatori*.
- **Messaggi** (*Impostazioni → Messaggi*): l'admin scrive a utenti scelti, a tutti i registrati o agli iscritti di un
  torneo; il messaggio compare come **ALERT** in cima alla prima pagina solo ai destinatari (le regole del database
  impediscono agli altri di leggerlo) finché l'utente non preme *Ho letto*.
- **Omonimi e alias**: gli utenti si distinguono per email. Se due utenti hanno stesso nome, cognome e sesso, l'admin
  riceve un avviso (prima pagina e *Impostazioni → Utenti registrati*) e assegna un **alias**, modificabile, che
  sostituisce il nome in liste, iscrizioni e classifiche. Per gli omonimi il collegamento con il giocatore in anagrafica
  lo sceglie l'admin.
- **Privacy**: l'email la vedono solo l'utente e l'admin. Cliccando un nome gli altri vedono solo i tornei
  giocati, i piazzamenti e i punti. L'elenco degli iscritti è pubblico. I reward compaiono nel profilo dell'utente e,
  per l'admin, nelle liste.
- **Tornei già creati**: in Gestione si possono aprire le iscrizioni online (data e ora, termine, massimo squadre); le
  squadre già inserite dall'admin restano in lista e occupano i primi posti.
- Database: `members/{uid}`, `accounts/{uid}` (email), `registrations/{id}`, `messages/{id}`, `inbox/{uid}`; alias in
  `data/settings`.

## Tornei a squadre (Manofuori Cup)

Campionato amatoriale misto per adulti: un torneo per **livello** (DINOS, MASTER, SUPER MASTER, SUPER 10), con le
squadre ammesse a quel livello (pagina *Squadre*). Voce **Tornei** nel menu (`#/tornei`), pagina del torneo `#/vt/{id}`
con le schede *Squadre e gironi*, *Calendario*, *Classifica* e *Playoff*. Motore in `js/volley.js` (test:
`node --test tests/volley.test.js`).

- **Formula** (admin tornei, *Nuovo torneo*): gironi all'italiana con **andata e ritorno** o **sola andata**, uno o più
  gironi, e facoltativamente **playoff** a eliminazione diretta.
- **Gironi**: si sceglie il girone di ogni squadra ammessa al livello (o si usa il **sorteggio**), poi **Genera il
  calendario** (metodo di Berger: casa e trasferta alternate, al massimo una gara in casa di differenza). Il calendario
  si annulla e si rifà finché nessuna gara è giocata.
- **Calendario**: data, ora e palestra gara per gara oppure per tutta la giornata (*Applica a tutta la giornata*).
- **Risultati**: li inseriscono l'**admin tornei** o lo **scorer** (account del campo in *Impostazioni → Account dei
  campi*, legato a un torneo o a tutti; lo scorer inserisce solo i set, da *Le mie gare* o dal calendario). Nei gironi
  si giocano sempre **3 set a 25** (due punti di scarto; oltre il 25 scarto esatto di 2).
- **Classifica**: 1 punto per ogni set vinto. A parità di punti: 1) gare vinte, 2) quoziente set, 3) quoziente punti,
  4) incontri diretti tra le squadre ancora pari.
- **Playoff**: l'admin sceglie quante squadre per girone vanno ai playoff (**Gold**) e, se vuole, quante al **Silver**.
  Teste di serie per posizione nel girone, poi punti per gara, quoziente set e quoziente punti (ordine modificabile
  prima delle gare). Turno per turno l'admin sceglie **3 set** o **al meglio dei 5** (quinto set a 15) e **andata e
  ritorno** o **gara secca**; la **finale è sempre gara secca**. Andata e ritorno: passa chi vince più set nelle due
  gare; a parità di set conta il **quoziente punti** (a parità perfetta passa la testa di serie migliore). Con un numero
  di squadre che non è una potenza di 2, le prime teste di serie passano il primo turno.
- Database: `vtours/{id}` (torneo, pubblico) e `vmatches/{torneo_gara}` (gare, pubbliche; lo scorer scrive solo set e
  stato). Test delle regole: `tests/vtour.rules.test.mjs`.
- I vecchi tornei beach (coppie, categorie, giocatori) non sono più nel menu; il loro codice verrà tolto più avanti.
  Il referto elettronico per la pallavolo arriverà da un progetto separato: per ora i risultati si inseriscono a mano.

## Squadre

- Voce **Squadre** nel menu (`#/teams`). Il **capitano** (utente registrato con email confermata, non in
  lista nera) iscrive la squadra: nome, **livello** (quello comunicato dall'organizzatore), **tipo** (mista, maschile,
  femminile) e **rosa** con cognome, nome, sesso e **numero di maglia**. Nessun numero massimo di giocatori (12
  consigliati); la rosa si cambia in qualsiasi momento. Avviso se due giocatori hanno lo stesso numero.
- La squadra resta **in attesa** finché l'organizzatore (admin tornei) non **conferma l'ammissione** al livello. In attesa
  il capitano può cambiare il livello e ritirare l'iscrizione; dopo l'ammissione il livello lo cambia solo l'organizzatore.
- Tutti vedono le squadre ammesse divise per livello (nome, tipo, capitano); la **rosa** la vedono solo il capitano e
  l'admin. L'admin vede anche le squadre in attesa, può crearne (scegliendo il capitano tra gli utenti), modificarle
  ed eliminarle.
- **Livelli**: DINOS, MASTER, SUPER MASTER, SUPER 10 (dal meno al più forte), modificabili dall'admin tornei in fondo
  alla pagina Squadre (salvati in `data/tour`).
- Database: `teams/{id}` (pubblico) e `rosters/{id}` (rosa: capitano e admin). Test delle regole:
  `tests/teams.rules.test.mjs` (istruzioni in cima al file).

## Gioco libero

- Voce **Gioco libero** nel menu (`#/free`) e le prossime sessioni anche in prima pagina. L'admin crea una sessione con
  nome, data, orario di inizio e di fine e le categorie: **Aperto a tutti** oppure uno o più livelli (Start, Intermedio,
  Intermedio avanzato, Pro).
- L'admin può indicare il **luogo** (testo libero, es. "Palestra comunale, campo 2"). La sessione si può **modificare**
  (nome, data, orari, luogo, categorie): i partecipanti restano.
- **Blocchi da 1 ora** (opzione dell'admin, es. 10–18 → 10–11, 11–12, …): chi partecipa sceglie i blocchi in cui c'è
  (es. 12–15) e li può cambiare. Tutti vedono una tabella con quanti uomini e quante donne ci sono in ogni blocco
  (dalle presenze anonime `fpanon`: solo sesso e blocchi, senza nome né uid); l'admin vede anche i nomi per blocco.
- Gli utenti registrati (email confermata) premono **PARTECIPA AL GIOCO LIBERO**, indicando se vogliono il proprio livello,
  **fino a un'ora prima dell'inizio**; fino allo stesso limite possono anche cancellarsi (e ripartecipare).
- Tutti vedono solo **quanti uomini e quante donne** partecipano; i nomi li vede solo l'admin, con il **resoconto** di chi
  si è iscritto e poi cancellato (date e ore).
- Database: `freeplay/{id}` (pubblico, con i contatori) e `fpreg/{sessione_utente}` (solo admin e interessato); il
  contatore cambia solo insieme a un'iscrizione o cancellazione vera (regole del database).

## Allenamenti (parte 1: allenamenti, coach, gruppi, schede corsisti, listino)

- Sezione **Allenamenti** (`#/train`), visibile all'admin e ai coach.
- **Allenamenti settimanali** (admin): nome facoltativo, giorno, orari (ogni 15 minuti), livello (Start, Intermedio,
  Intermedio avanzato, Pro), massimo persone, coach e luogo (testo libero).
- **Coach**: utenti registrati indicati dall'admin; per ognuno l'admin sceglie se vede tutti gli allenamenti o solo i suoi.
  Il coach vede solo i nomi del gruppo (non i dati personali, il certificato o i pagamenti).
- **Gruppi del mese**: l'admin compone a mano il gruppo di ogni allenamento, mese per mese (con "Copia i gruppi del
  mese precedente"). Inserendo un corsista indica anche tesseramento della stagione (dal 1° settembre) e scadenza del
  certificato medico.
- **Allenamenti dalla scheda corsista**: alla creazione della scheda (e poi in modifica) si spuntano gli allenamenti
  del mese scelto in alto: il corsista entra o esce dai gruppi e il piano si aggiorna.
- **5° giorno del mese** (29, 30, 31: il quinto lunedì, martedì…): fuori abbonamento, nessun gruppo, tutti i posti sono
  spot; anche i corsisti si candidano e pagano lo spot (le regole non accettano la risposta del gruppo quel giorno).
- **Piano del corsista**: si ricava dai gruppi (1, 2, 3, 4 allenamenti a settimana); il prezzo arriva dal **listino**
  (1–4 a settimana e allenamento spot) e l'admin può cambiarlo per il singolo corsista.
- **Corsisti** (`#/athletes`, solo admin): scheda con anagrafica (nascita, residenza, codice fiscale), tesseramento,
  certificato (avviso un mese prima della scadenza e quando è scaduto), piano e prezzo del mese.
- Il corsista vede nel profilo i suoi allenamenti del mese e lo stato del certificato; riceve l'avviso in prima pagina.
- Regole: `athletes` e `plans` li leggono solo l'admin e l'interessato; `groups` l'admin e i coach (tutti o solo i propri).
- **Admin corsista o coach**: in Allenamenti → Allenamenti e gruppi l'admin registra il proprio nome da giocatore
  (scheda utente `members/{uid}`); da quel momento compare negli elenchi e può essere inserito nei gruppi o come coach.
  Da admin vede in prima pagina la conferma della presenza e in Allenamenti "I miei allenamenti".

## Allenamenti (parte 2: presenze, spot, recuperi)

- **Presenze**: il giorno dell'allenamento il corsista del gruppo vede in prima pagina "Conferma la tua presenza per
  l'allenamento di oggi" (Presente / Assente); può rispondere anche nei giorni prima dal profilo (prossimi 7 giorni).
  Entro le 12: chi non risponde resta "non risposto" ma conta come assente; l'admin può segnarlo presente.
  Dopo le 12 si può ancora cambiare, ma se i posti sono andati agli spot compare "contatta la segreteria".
- **Posti spot** = massimo − presenti − spot confermati − (prima delle 12) chi non ha ancora risposto.
  Si vedono nella pagina Allenamenti e in prima pagina (prossimi 7 giorni); si candidano gli utenti registrati con email
  confermata fino a un'ora prima. L'admin conferma (con il prezzo, dal listino) o no: il richiedente vede
  "Allenamento confermato" / "Allenamento non confermato" in prima pagina.
- **Recupero**: su un corsista assente l'admin sceglie un altro allenamento (prossimi 30 giorni) e il prezzo (anche 0).
- **Annullare un giorno** di allenamento, con motivo: avviso in prima pagina a corsisti e spot confermati
  (i campi restano bloccati nella griglia).
- Admin e coach: scheda "Presenze del giorno" con risposte, spot e candidature (il coach solo in lettura).
- Database: `occ` (pubblico: contatori presenti/assenti/spot, annullato), `att` (risposte) e `spots`; le regole tengono
  i contatori coerenti con le risposte e non permettono a un utente di autoconfermarsi.

## Allenamenti (parte 3: pagamenti e ricevute)

- **Pagamento mensile** (scheda del corsista, piano del mese): data, modalità (contanti, bancomat, bonifico) e importo
  (dal prezzo del piano). Stato: pagato / da pagare / in ritardo (dopo il 10 del mese).
- **Trimestrale** (solo 1 e 2 allenamenti a settimana, prezzi scontati nel listino): copre il mese del pagamento e i due
  successivi con un'unica ricevuta ("… - trimestre Ottobre 2026 - Dicembre 2026"); i mesi senza piano restano
  "prepagati" nella scheda e risultano pagati quando si compone il gruppo. Annullando la ricevuta tornano da pagare.
- **Pagamento spot** (presenze del giorno, spot confermati): importo dal prezzo dello spot; un recupero gratuito (0 €)
  si segna pagato senza ricevuta. Se mancano i dati per la ricevuta, si compilano nel modulo e si salvano nella scheda.
- **Ricevuta PDF** (jsPDF già incluso in `referto/vendor`): numero progressivo che riparte ogni anno (`counters`),
  intestazione dell'associazione, dati del socio, importo in cifre e in lettere, causale
  "Quota sociale allenamenti - mese di …" o "… - allenamento del gg/mm/aaaa", modalità, spazio per timbro e firma.
- **Amministrazione pagamenti** (`#/payments`, da Impostazioni): mese, tipo, incassi per modalità, pagamenti mancanti,
  ricevute con PDF singolo, PDF unico o ZIP del mese; una ricevuta si può annullare (resta come ANNULLATA).
- **Cambia numero** (Amministrazione pagamenti): si dà un nuovo numero a una ricevuta; da quella in poi le ricevute dello
  stesso anno proseguono in ordine progressivo, il contatore riparte dall'ultimo numero e i numeri mostrati su piani,
  spot e trimestrali si aggiornano (avviso se un numero risulterebbe doppio).
- Il corsista scarica dal profilo solo le proprie ricevute (`receipts`: admin e interessato).
- **Ruoli** (pagina Utenti → "Ruoli e accessi"):
  - *Admin generale*: tutto. Sono gli account con email confermata pierpaolomurgioni@gmail.com
    (nelle regole del database), l'account principale e la raccolta `admins`.
  - *Admin tornei* (`roles/{uid}.tour`): tornei, categorie e tabelle punti, giocatori, iscrizioni, referti e
    refertisti. Categorie, premi ed EOPE stanno in `data/tour` (separati da `data/settings`, che resta dell'admin generale).
  - *Cassa* (`roles/{uid}.cash`): registra incassi ed emette ricevute; non vede schede atleti né il resto dell'amministrazione.
  - *Coach* e *refertisti* come prima. I ruoli si assegnano con le caselle accanto a ogni utente (solo admin generale).
- **Cassa** (`#/cassa`, admin generale e cassa): ogni incasso (`incassi`) ha una o più righe: quote sociali (corsi di
  allenamento, torneo sociale) e commerciale
  (bevande, altro). Ricevute separate: serie Q `n/Q/anno` (contatore `receipts-AAAA`, che prosegue la numerazione delle
  ricevute precedenti) e serie C `n/C/anno` (`receiptsC-AAAA`); ripartono ogni anno. Carta e bonifico: ricevuta sempre;
  contanti: a scelta. Intestatario facoltativo (ricevuta senza nome con spazi da compilare) e assegnabile dopo dall'admin
  (persona registrata o nome scritto a mano; le modifiche restano registrate). Inserimento con numero e data scelti: le
  ricevute successive della stessa serie scalano di uno. Annullamento dell'incasso (ricevute ANNULLATE,
  piani, spot e pacchetti di nuovo da pagare). Resoconto mensile (totali Q/C, per voce e modalità) e prospetto Excel.
  I pagamenti degli allenamenti registrati dalla scheda corsista sono anche incassi della cassa.
- **Report presenze** (`#/report`, solo admin): settimana, mese o trimestre solare; tabelle per allenamento, livello,
  allenatore e giorno (allenamenti, iscritti, presenti, assenti, senza risposta, spot, recuperi, media, presenza %,
  riempimento), grafici e download in Excel. Solo allenamenti già iniziati e non annullati; chi non ha risposto conta come
  assente. Presenze, spot e giornate dei periodi passati si leggono dal database solo quando servono.
- **Ricavi per allenamento e backup mensile** (Amministrazione pagamenti): quota mensile divisa in parti uguali tra gli
  allenamenti del piano (trimestrale: importo / 3), spot e recuperi all'allenamento, pacchetti: prezzo / numero di
  allenamenti per ogni allenamento scalato; colonna "Da incassare". Il pulsante di backup scarica un Excel (generato nel
  browser con JSZip) con allenamenti, gruppi, piani e pagamenti, spot, pacchetti e ricavi del mese.
- **Pacchetti di allenamenti** (scheda del corsista): l'admin inserisce numero di allenamenti e prezzo totale (`packs`:
  admin e interessato in lettura). Chi ha un pacchetto chiede un posto spot; quando l'admin conferma con "Scala dal
  pacchetto" lo spot ha prezzo 0 e si scala un allenamento. Se la conferma viene tolta o l'allenamento è annullato,
  l'allenamento torna nel pacchetto (con il ripristino si scala di nuovo). Nessuna scadenza; a pacchetto esaurito si
  paga lo spot o si crea un nuovo pacchetto. Ricevuta unica al pagamento: "Quota sociale allenamenti - pacchetto di N
  allenamenti".

## Profilo: le mie attività (parte 4)

- Allenamenti della stagione: presenze, assenze, spot e recuperi.
- Tornei disputati, punti, reward e risultati dei tornei conclusi restano come prima.

## Privacy, termini e sicurezza

- **Pagine legali** (`js/legal.js`, in italiano): `#/privacy` (informativa artt. 13-14 GDPR), `#/cookie` (cookie policy),
  `#/termini` (termini e condizioni). Titolare: ASD Beach Piu' Arena, legale rappresentante il Presidente
  Pier Paolo Murgioni, beachpiuarena@gmail.com. Link nel piè di pagina di ogni schermata. Cambiando un testo si
  aggiorna `Legal.VERSION`: agli utenti viene chiesto di prenderne visione di nuovo.
- **Avviso cookie** al primo accesso (solo informativo: l'app usa unicamente strumenti tecnici).
- **Registrazione**: casella obbligatoria "Ho letto l'Informativa privacy e accetto i Termini"; data e versione salvate
  nel profilo (`members.privacyAt`, `privacyVer`). Chi non le ha (utenti precedenti o creati dall'admin) vede la richiesta
  all'accesso. Nell'elenco utenti l'admin vede lo stato.
- **Diritti dell'interessato** (Profilo → Privacy e dati personali): scarica i propri dati in JSON, richiesta di
  cancellazione (avviso agli admin, data nel profilo), contatto email per gli altri diritti.
- **Intestazioni di sicurezza** (`firebase.json`): Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options,
  X-Frame-Options, Referrer-Policy, Permissions-Policy, Cross-Origin-Opener-Policy. Nessuno script "in linea"
  (`js/boot.js`). Se si aggiunge un servizio esterno va aggiunto alla CSP.
- **Limite tentativi** di registrazione (20 secondi tra un tentativo e l'altro, oltre ai limiti di Firebase).

## Conferma dell'email e lista nera

- Alla registrazione arriva un'email con il link di conferma. Finché l'indirizzo non è confermato l'utente **non può
  iscriversi ai tornei né partecipare al gioco libero** (bloccato anche dalle regole del database); l'app mostra un avviso con
  *Ho confermato* e *Invia di nuovo*. Vale anche per chi si era registrato prima.
- **Conferma a mano** (*Impostazioni → Utenti registrati*): accanto a ogni utente si vede se l'email è confermata,
  confermata dall'admin o da confermare; l'admin può **confermare a mano** chi non riceve l'email (`verified/{uid}`,
  vale anche nelle regole del database) e annullare la conferma.
- **Registrazione da parte dell'admin** (stessa pagina): l'admin crea l'account con nome, cognome, sesso, email e
  password; l'utente è già confermato e può cambiare la password con "Password dimenticata?".
- **Lista nera** (*Impostazioni → Utenti registrati*): per ogni utente l'admin può bloccare le **iscrizioni ai tornei**. L'utente bloccato vede l'invito a contattare l'organizzatore; un utente
  bloccato per i tornei non può nemmeno essere iscritto come compagno. Database: `bans/{uid}` (lo legge solo
  l'interessato e l'admin).

## Temi grafici e colori

Per ora c'è un solo **tema neutro** (grigi e blu ardesia, chiaro o scuro secondo il dispositivo): i colori sono in
`:root` in cima a `css/style.css`. Con un solo tema le schede *Tema grafico* e *Colori* in Impostazioni non compaiono.

Per aggiungere un tema:
- **tavolozza di colori**: un blocco `[data-theme="id"] { --bg: …; --primary: …; }` in fondo a `css/style.css`, una riga
  in `THEMES` (`js/app.js`) e il nome `theme_id` in `js/i18n.js`;
- **tema grafico** (caratteri, decorazioni, immagine in cima ai tornei `.theme-hero`): un blocco `[data-design="id"]` in
  `css/style.css`, una riga in `DESIGNS` (`js/app.js`), i nomi `design_id` / `designDesc_id` in `js/i18n.js` e, se usa
  altri caratteri, il file `assets/fonts/id.css` con i font in `assets/fonts/files/`.
I temi di Beach+ Arena (cartella `beach-plus-arena` del repository principale) si possono riprendere da lì.

## Funzioni

- **Giocatori**: anagrafica con genere e società.
- **Tabelle punti**: componi tabelle con punti per qualsiasi posizione
  (ogni riga vale dalla sua posizione fino alla riga successiva, es. `5 → 60` vale per 5°–8° se la riga dopo è `9`).
- **Categorie** (es. Master, Challenger, Satellite) collegate a una tabella predefinita.
- **Tornei**: per ciascuno scegli genere (maschile, femminile o **misto**: ogni squadra è un uomo + una donna), categoria, tabella punti, **coefficiente** (es. ×1,2) e formula:
  - Gironi + eliminazione diretta (squadre per girone e qualificate a scelta)
  - Gironi FIVB da 4 (1-4, 2-3, vincenti/perdenti) + eliminazione
  - Doppia eliminazione
  - Eliminazione diretta
  - Girone unico
  - **Gold & Silver**: gironi da 3, 4 o 5 squadre (anche di dimensioni diverse; per ogni girone da 4 si sceglie
    tutti contro tutti o formula FIVB). L'admin sceglie quante squadre vanno nel **Gold** (prima tutte le 1ª, poi le 2ª,
    poi le migliori 3ª per quoziente punti, massimo 16): tabellone da 16 con bye alle teste di serie e senza squadre
    dello stesso girone al primo turno. Tutte le altre giocano il **Silver** (tabellone da 16). Finale 3°/4° posto
    a scelta nel Gold e nel Silver. Punti con **due tabelle del torneo** (Gold e Silver), al posto di quella
    della categoria. In Gestione, spostando le squadre nella lista si vede subito l'anteprima dei gironi
    (serpentina). Teste di serie e bye nei tabelloni: prima le 1ª, poi le 2ª, ecc.; a parità di posizione
    punti in classifica (2 vittoria, 1 sconfitta; FIVB: percorso vincenti/perdenti), poi quoziente punti; squadre dello stesso girone mai contro nei
    primi due turni. Solo in questo formato l'admin può cambiare il numero delle gare (nella finestra della gara:
    la gara che aveva quel numero prende il vecchio numero) e ripristinare la numerazione standard dal calendario.
    Gli altri formati non cambiano.
  - Partite a set unico o al meglio di 3/5, con punti del set e del tie-break liberi (21/15, 15/15, …)
  - Finale 3°/4° opzionale
  - **Qualificazioni** a eliminazione diretta senza limite di squadre, con N posti per il main draw
  - **Wild card**
- **Risultati** con esiti INJ/DSQ (ritiro/infortunio) e DSQ (forfait) calcolati secondo il regolamento.
- **Gironi tutti contro tutti** (in ogni formula), calendario fisso: da 3 squadre 1° turno 1–3, 2° turno 2–3, 3° turno 1–2;
  da 4 squadre 1° turno 1–4 e 2–3, 2° turno 1–3 e 2–4, 3° turno 3–4 e 1–2. Nel calendario generale le gare sono numerate
  turno per turno su tutti i gironi (prima il 1° turno di ogni girone, poi il 2°…), così tra un turno e l'altro di un
  girone si giocano le gare degli altri gironi.
  Nei tornei già avviati l'app corregge da sola i gironi da 3 e da 4 al primo accesso dell'admin: ordine e turni sempre; l'ordine delle
  squadre solo nelle gare senza risultato né referto (le gare giocate restano collegate a risultati e referti).
- **Classifica dei gironi** con i criteri di spareggio del regolamento
  (2 squadre: quoziente punti nel girone, poi scontro diretto; 3+: quoziente punti negli scontri tra loro,
  poi nel girone; infine testa di serie).
- **Classifica finale** del torneo e punti per giocatore (punti tabella × coefficiente), visibili nella scheda del giocatore.
- **E-scoresheet** (referto elettronico collegato):
  - **Account dei campi**: in *Impostazioni → Account dei campi* l'admin crea un account (email e password) per ogni
    campo. Il tablet del campo accede una volta e trova **Le mie gare** (le gare del suo campo, oppure tutti i campi).
    Questi account possono solo compilare i referti: non omologano e non modificano il torneo.
    Con più tornei nello stesso giorno si può **legare l'account a un torneo** (menu *Torneo*, modificabile anche
    dopo dall'elenco degli account): il tablet vede e compila solo quel torneo. Senza torneo vede tutti i tornei in corso.
  - Il pulsante **E-scoresheet** accanto alla gara apre il referto già compilato con torneo, numero gara, squadre,
    orario, campo e fase. Si crea così il **referto della gara** nella raccolta `referti` del database
    (un documento per gara, firme comprese, visibile solo ad admin e campi).
  - Mentre il refertista segna i punti, il punteggio compare in diretta (**LIVE**) nel calendario, nei gironi e nel
    tabellone. Quando chiude la gara il risultato resta **in attesa di omologa**: visibile a tutti ma non conteggiato.
  - Con **Omologa il risultato** l'admin lo rende ufficiale (classifiche dei gironi, passaggi di turno, punti).
    L'admin può sempre correggere il punteggio, riaprire la gara, **riaprirla al refertista** o **azzerare il referto**.
  - Scheda **Referti** nella pagina del torneo (admin e account dei campi): la cartella **referti** con un file per
    ogni gara (stato, punteggio, chi l'ha compilato, *Apri referto*) e la cartella **referti / pdf** con tutti i PDF,
    che si aprono direttamente nell'app; **Scarica tutto (ZIP)** li salva in `referti/pdf/`. I PDF mancanti o non
    aggiornati si creano da soli all'apertura della scheda (o con *Aggiorna PDF*).

### Pubblicare le regole del database

L'E-scoresheet usa nuove raccolte (`referti`, `refertiPdf`, `live`, `scorers`): alla prima pubblicazione servono
anche le regole di sicurezza:

```
firebase deploy --only hosting,firestore:rules
```

## Struttura

```
index.html        pagina principale
css/style.css     grafica (chiaro/scuro, mobile-first)
js/i18n.js        traduzioni IT / EL / EN
js/store.js       salvataggio dati nel browser
js/logic.js       regole: formule, gironi, tabelloni, piazzamenti, punti
js/demo.js        dati di esempio
js/app.js         interfaccia
referto/          referto elettronico di gara (scoresheet) → /referto/
```
