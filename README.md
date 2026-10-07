# Manofuori Cup 🏐

Web app responsive (telefono, tablet, PC) per gestire tornei, gioco libero, allenamenti e cassa.
Interfaccia **solo in italiano** (anche nel referto elettronico).

È un'app **indipendente**: ha il suo progetto Firebase (database, account, sito web) e non condivide nulla
con altre app. Nasce come copia di Beach+ Arena Event Manager (repository `Elsina71/Repository-principale`,
cartella `beach-plus-arena`); per ora ha un solo **tema neutro** (vedi *Temi grafici e colori*).

**Differenze da Beach+ Arena**: niente prenotazione dei campi, niente sfide, niente "cerco compagno/a" e niente ranking. I tornei di
beach a coppie sono sostituiti dai **tornei a squadre** di pallavolo (vedi sotto). Gioco libero e allenamenti non
occupano campi: hanno un **luogo** scritto a mano.

## Da completare prima di pubblicare

Cerca `DA_COMPILARE` nei file: sono i dati che mancano.
- `firestore.rules`: email degli admin generali (l'UID dell'admin principale è già inserito).
- Indirizzo dell'app: **https://manofuori.it** (dominio Aruba collegato a Firebase Hosting: record A `199.36.158.100` e
  TXT `hosting-site=manofuori-774b2` sul dominio, CNAME `www` → `manofuori-774b2.web.app`). Funziona anche
  `manofuori-774b2.web.app`. I domini vanno anche in Firebase *Authentication → Domini autorizzati*.

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

## Account dei giocatori e messaggi

- **Registrazione** (*Impostazioni → Registrati*): nome, cognome, sesso, email e password. Il profilo (`#/me`, voce
  **Profilo**) è visibile solo all'utente: dati, gare delle sue squadre, allenamenti e ricevute.
- **Messaggi** (*Impostazioni → Messaggi*): l'admin scrive a utenti scelti, a tutti i registrati o ai capitani e
  giocatori collegati delle squadre di un torneo; il messaggio compare come **ALERT** in cima alla prima pagina solo ai
  destinatari finché l'utente non preme *Ho letto*.
- **Omonimi e alias**: gli utenti si distinguono per email. Se due utenti hanno stesso nome, cognome e sesso, l'admin
  riceve un avviso e assegna un **alias**, modificabile, che sostituisce il nome nelle liste.
- **Account senza scheda utente** (creati dalla console di Firebase o prima della registrazione dall'app): in
  *Impostazioni* completano nome, cognome e sesso (e confermano l'email); da lì compaiono nella lista degli utenti.
  Gli admin senza scheda trovano lo stesso invito in Impostazioni.
- **Correzione dei nomi** (*Impostazioni → Utenti registrati → Modifica nome*, solo admin generale): nome, cognome e
  sesso dell'utente; il nuovo nome compare anche come capitano delle sue squadre e nei gruppi degli allenamenti.
- **Privacy**: l'email la vedono solo l'utente e l'admin.
- Database: `members/{uid}`, `accounts/{uid}` (email), `messages/{id}`, `inbox/{uid}`; alias in `data/settings`.

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
  gare; a parità di set conta il **quoziente punti**; a parità perfetta si gioca un **golden set** ai punti decisi
  dall'admin per quel turno (si inserisce sotto il confronto; lo salva la gara di ritorno). Con un numero di squadre che
  non è una potenza di 2, le prime teste di serie passano il primo turno.
- **Finale per il 3° e 4° posto** tra le perdenti delle semifinali, sempre gara secca; la formula (3 set o al meglio dei
  5) si sceglie a parte, anche diversa da quella della finale (si crea insieme alla finale). In cima al tabellone il podio con le prime quattro.
- Database: `vtours/{id}` (torneo, pubblico) e `vmatches/{torneo_gara}` (gare, pubbliche; lo scorer scrive solo set e
  stato). Test delle regole: `tests/vtour.rules.test.mjs`.
- Il referto (`referto-indoor/`) si sviluppa solo qui, in questo repository: è la versione principale.
- **Referto elettronico** (`referto-indoor/`, 6 contro 6 con rotazioni, libero, minimo 2 donne in campo): pulsante
  **E-scoresheet** sulla gara (admin generale, admin tornei e scorer del torneo). La prima volta crea `referti/{torneo}_{gara}` con
  torneo, fase, data, ora, palestra, squadre (A = casa) con le rose e la formula (gironi: 3 set fissi a 25; playoff:
  come il turno; minimo 2 donne in campo solo per le squadre miste). Il punteggio va in diretta nel calendario
  (`live/{id}`, pubblico); alla **chiusura del referto** il risultato entra da solo nella gara e quindi in classifica (se
  l'invio non riesce resta il pulsante **Riporta il risultato del referto**); il PDF si archivia in `refertiPdf`. Il referto è facoltativo: i set si possono sempre
  inserire a mano. Gli scorer leggono le rose (servono al referto); per tutti gli altri restano private.
- **Le mie gare** (menu e profilo): calendario e risultati delle squadre di cui si è capitano o giocatore. Il capitano
  collega i giocatori della rosa al loro account dell'app (colonna *Account app*; l'app propone l'utente con lo stesso
  nome e cognome); `teams.memberUids` contiene solo gli id degli account, la rosa resta privata.
- **Avvisi**: se l'admin cambia data, ora o palestra di una gara che li aveva già (gara per gara o per tutta la
  giornata), capitani e giocatori collegati delle due squadre ricevono un avviso in prima pagina.
- **Chiusura a fine stagione** (*Impostazioni del torneo → Chiudi il torneo*): il torneo passa tra i *Tornei conclusi*
  e lo scorer non inserisce più risultati; si può riaprire.

- **Scheda Referti** nella pagina del torneo (admin tornei e account dei campi del torneo): l'elenco dei referti
  elettronici delle gare (stato: da iniziare, LIVE, referto chiuso, risultato riportato; risultato del referto; chi
  l'ha compilato), **Apri referto**, il **PDF** archiviato e **Scarica tutti i PDF (ZIP)**.
- **Presenze dei giocatori** (stessa scheda): per ogni squadra e giocatore il numero di gare concluse con il referto in
  cui è **entrato davvero in campo** (sestetto iniziale, sostituzione o libero); le gare con il risultato inserito a mano
  non contano. L'admin tornei fissa le **gare giocate minime per i playoff** (`vtours.minPlayed`): chi è sotto il
  minimo è in rosso e la squadra mostra quanti sono. Il referto lo aprono anche gli **admin tornei**.

## Squadre

- Voce **Squadre** nel menu (`#/teams`). Il **capitano** iscrive la squadra: è un utente registrato **abilitato
  dall'admin generale** (ruolo *Capitano*: casella accanto all'utente in *Impostazioni → Utenti registrati*, oppure
  "Abilita come capitano" quando l'admin crea l'account), con email confermata e non in lista nera. Chi non è
  abilitato vede l'invito a contattare l'organizzatore. Il capitano indica: nome, **livello** (quello comunicato dall'organizzatore), **tipo** (mista, maschile,
  femminile) e **rosa** con cognome, nome, sesso e **numero di maglia**. Nessun numero massimo di giocatori (12
  consigliati); la rosa si cambia in qualsiasi momento. Avviso se due giocatori hanno lo stesso numero.
- La squadra resta **in attesa** finché l'organizzatore (admin tornei) non **conferma l'ammissione** al livello. In attesa
  il capitano può cambiare il livello e ritirare l'iscrizione; dopo l'ammissione il livello lo cambia solo l'organizzatore.
- Tutti vedono le squadre ammesse divise per livello (nome, tipo, capitano); la **rosa** la vedono solo il capitano,
  l'admin e gli scorer (per il referto). L'admin vede anche le squadre in attesa, le modifica e le
  elimina; può anche **iscrivere lui le squadre** (entrano già ammesse), con il capitano scelto tra gli utenti dell'app
  oppure solo con il nome se non ha l'account.
- **Livelli**: DINOS, MASTER, SUPER MASTER, SUPER 10 (dal meno al più forte), modificabili solo dall'admin generale e
  dall'admin tornei nella pagina **Livelli** (`#/livelli`, da *Impostazioni → Gestisci i livelli*; salvati in `data/tour`).
- Database: `teams/{id}` (pubblico) e `rosters/{id}` (rosa: capitano, admin e scorer). Test delle regole:
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
- **Corsisti minorenni** (scheda corsista → *Corsista minorenne*, spuntata da sola se dalla data di nascita risultano meno
  di 18 anni): dati del genitore responsabile (nome, cognome, Sig./Sig.ra, via e numero, città, codice fiscale). La
  ricevuta è intestata al genitore, riporta i dati del minore (nome, luogo e data di nascita, codice fiscale), dice che il
  pagamento è "per conto del figlio/della figlia" e in fondo ha il testo per la detrazione IRPEF del 19%.
- **Timbro e firma** (*Impostazioni → Timbro e firma delle ricevute*, admin): immagini caricate dall'admin (sfondo bianco
  reso trasparente), stampate su tutte le ricevute. Stanno nel database (`private/receiptSign`, leggibile solo dagli
  utenti collegati), non tra i file pubblici del sito.
- **Codice fiscale** nella scheda corsista (anche nel modulo di creazione; in testa alla scheda, o "CF mancante"):
  compare nelle ricevute.
- **Ricevuta PDF** (jsPDF incluso in `vendor/jspdf`): numero progressivo che riparte ogni anno (`counters`),
  intestazione dell'associazione, dati del socio, importo in cifre e in lettere, causale
  "Quota sociale allenamenti - mese di …" o "… - allenamento del gg/mm/aaaa", modalità, spazio per timbro e firma.
- **Amministrazione pagamenti** (`#/payments`, da Impostazioni): mese, tipo, incassi per modalità, pagamenti mancanti,
  ricevute con PDF singolo, PDF unico o ZIP del mese; una ricevuta si può annullare (resta come ANNULLATA).
- **Cambia numero** (Amministrazione pagamenti): si dà un nuovo numero a una ricevuta; da quella in poi le ricevute dello
  stesso anno proseguono in ordine progressivo, il contatore riparte dall'ultimo numero e i numeri mostrati su piani,
  spot e trimestrali si aggiornano (avviso se un numero risulterebbe doppio).
- Il corsista scarica dal profilo solo le proprie ricevute (`receipts`: admin e interessato).
- **Ruoli** (pagina Utenti → "Ruoli e accessi"):
  - *Admin generale*: tutto. Gli **admin principali** sono manofuori@gmail.com (account principale) e
    pierpaolomurgioni@gmail.com, con email confermata (nelle regole del database): nessuno può togliere loro il ruolo e
    sono gli unici che possono toglierlo agli altri. Gli altri admin generali li nomina un admin generale con la casella
    **Admin generale** accanto all'utente (raccolta `admins`; vale dal prossimo accesso). Nessun admin cambia il proprio ruolo.
  - *Admin tornei* (`roles/{uid}.tour`): tornei, squadre (ammissione), livelli, calendari e risultati. I livelli stanno
    in `data/tour` (separati da `data/settings`, che resta dell'admin generale).
  - *Capitano* (`roles/{uid}.captain`): può iscrivere e gestire la propria squadra.
  - *Cassa* (`roles/{uid}.cash`): registra incassi ed emette ricevute; non vede schede atleti né il resto dell'amministrazione.
  - *Coach* e *scorer* (account dei campi). I ruoli si assegnano con le caselle accanto a ogni utente (solo admin generale).
- **Cassa** (`#/cassa`, admin generale e cassa): ogni incasso (`incassi`) ha una o più righe: quote sociali (corsi di
  allenamento, torneo sociale) e commerciale
  (bevande, altro). Ricevute separate: serie Q `n/Q/anno` (contatore `receipts-AAAA`, che prosegue la numerazione delle
  ricevute precedenti) e serie C `n/C/anno` (`receiptsC-AAAA`); ripartono ogni anno. Carta e bonifico: ricevuta sempre;
  contanti: a scelta. Intestatario facoltativo (ricevuta senza nome con spazi da compilare) e assegnabile dopo dall'admin
  (persona registrata o nome scritto a mano; le modifiche restano registrate). Già al momento dell'incasso
  l'intestatario si può **scrivere a mano** (nome e cognome, Sig./Sig.ra) con il **codice fiscale** (16 caratteri, o 11 cifre
  di partita IVA); per una persona scelta dall'elenco il codice fiscale si prende dalla scheda e si può correggere.
  L'admin cambia il **numero di una ricevuta** anche dall'elenco degli incassi (*Cambia numero*). Inserimento con numero e data scelti: le
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
- **Le mie gare**: calendario e risultati delle squadre di cui si è capitano o giocatore collegato.

## Privacy, termini e sicurezza

- **Pagine legali** (`js/legal.js`, in italiano): `#/privacy` (informativa artt. 13-14 GDPR), `#/cookie` (cookie policy),
  `#/termini` (termini e condizioni). Titolare: ASD Manofuori Volley Project, legale rappresentante il
  Presidente Marianna Stara, manofuori@tiscali.it. Link nel piè di pagina di ogni schermata. Cambiando un testo si
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

Ogni utente sceglie il tema dall'icona della tavolozza nella testata (pagina `#/tema`) o da *Impostazioni → Tema*; la scelta resta solo su quel dispositivo (con il consenso alle
preferenze nell'avviso cookie, altrimenti vale per la visita). Temi: **Neutro** (predefinito), **Palestra**,
**Gialloblù**, **Notte di gara** (scuro), **Fenicottero**, **Azzurri**, **Tramonto** e tre cartoon: **Fumetto**,
**Lavagna del coach** (scuro) e **Palla pazza**. Ogni tema cambia colori, carattere dei titoli, testata, barra in basso
e l'illustrazione in prima pagina (`.theme-hero`), con un pallone disegnato nello stile del Molten Flistatec (senza marchi).

Per aggiungere un tema: un blocco `[data-theme="id"]` in fondo a `css/style.css` (variabili di colore e regole), una
riga in `THEMES` (`js/app.js`: id, colore principale, sfondo, accento) e il nome `theme_id` in `js/i18n.js`. I caratteri
dei temi (Google Fonts, licenza OFL) sono in `assets/fonts/files/`, dichiarati in `assets/fonts/themes.css`: il browser
li scarica solo per il tema scelto.

## Struttura

```
index.html        pagina principale
css/style.css     grafica (chiaro/scuro, mobile-first)
js/i18n.js        testi dell'interfaccia (italiano)
js/store.js       stato dell'app (dati dal database)
js/cloud.js       collegamento al database (Firebase)
js/volley.js      tornei: calendari, classifiche, playoff
js/legal.js       privacy, cookie e termini
js/app.js         interfaccia
referto-indoor/   referto elettronico di gara (6 contro 6) → /referto-indoor/
vendor/           Firebase, jsPDF, JSZip
```
