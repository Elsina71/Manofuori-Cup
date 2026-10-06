# Referto Beach Volley 🏐

Scoresheet elettronico di beach volley: veloce, pensato per il segnapunti a bordo campo
(telefono, tablet o PC), in **italiano, greco e inglese** (IT / ΕΛ / EN in alto; la lingua è la stessa del
Championship Manager). Funziona anche **senza connessione** e i dati restano salvati sul dispositivo.

Online: https://<progetto>.web.app/referto/ (si pubblica insieme al Championship Manager con
`firebase deploy --only hosting,firestore:rules`).

**Gara collegata al torneo (E-scoresheet)**: il tablet del campo accede con l'account del campo nel Championship
Manager, apre **Le mie gare** e tocca **E-scoresheet** accanto alla gara. Il referto si apre (`?g=<torneo>_<gara>`) con
torneo, numero gara, squadre, orario, campo, fase e formula già compilati e bloccati; ogni modifica viene salvata nel
**referto della gara** (raccolta `referti`) e il punteggio pubblicato in diretta (in alto: *In diretta* /
*In attesa di rete*). A fine gara **✔ CHIUDI GARA E INVIA RISULTATO**: il risultato resta in attesa finché
l'organizzazione non lo omologa (il referto lo mostra da solo) e il PDF viene archiviato (raccolta `refertiPdf`).
Se l'organizzazione riapre la gara, il referto torna modificabile. Aprendo la stessa gara su un altro dispositivo
si riprende dal punto in cui era.

**Archivio referti** (`?archivio=<torneo>`): tutti i referti del torneo, con il PDF di ognuno e lo ZIP di tutti i PDF.

## Come si usa

1. **Nuova gara** → inserisci torneo, località, fase, numero gara, campo, data e orario di inizio,
   poi i giocatori (n. 1 e n. 2), gli allenatori e il **colore della maglia** delle due squadre (obbligatorio e diverso:
   diventa il colore della squadra in tutto il referto e compare nel PDF), gli arbitri e il segnapunti.
   Con **“Nuova gara, stesso torneo”** torneo, data, arbitri e formula vengono copiati dall'ultima gara
   e il numero gara aumenta di uno.
2. **Sorteggio e scelte** → nel set 1 (e nel set decisivo, con nuovo sorteggio) sceglie la squadra che vince
   il sorteggio; nel set 2 sceglie la squadra che ha perso il sorteggio del set 1. Chi sceglie decide tra
   servizio, ricezione o campo; se sceglie il campo, l'altra squadra sceglie tra servizio e ricezione.
   Poi si indica quale squadra è alla sinistra del segnapunti e il primo al servizio di ogni squadra.
   L'anteprima del campo mostra l'ordine di servizio I → II → III → IV.
3. **Gara** → tocca il riquadro della squadra che ha vinto l'azione. Il resto è automatico:
   - turno di servizio e rotazione dei giocatori (🏐 = al servizio, ↻ = prossimo in cambio palla);
   - cambio campo ogni 7 punti (5 nel set decisivo), con avviso e lati invertiti sullo schermo;
   - fine set a 21 (15 nel terzo) con 2 punti di scarto, fine gara a 2 set vinti;
   - **Time-out** (uno per squadra per set, con conto alla rovescia di 30″), **Sanzioni**
     (avvertimenti, penalizzazioni con punto agli avversari, espulsione, squalifica),
     **Ritiro/forfait**, tempo tecnico a 21 punti totali nei set 1 e 2 (attivo di default, si può togliere nella formula).
   - **↶ Annulla** toglie l'ultimo evento (anche l'ultimo punto di un set o l'inizio di un set).
4. **Fine gara** → osservazioni, firme (facoltative, col dito), poi **✔ OMOLOGA**:
   il referto viene bloccato e si scarica il **PDF del referto** compilato
   (intestazione, squadre, ufficiali, sorteggi, turni di servizio, punteggio progressivo,
   time-out, cambi campo, sanzioni, risultato, firme e data di omologazione).
   Prima dell'omologa è disponibile un'anteprima PDF con la scritta “BOZZA”.

Da **Backup** nella schermata iniziale si esportano/importano tutte le gare in un file JSON.

## Come si apre in locale

Dalla cartella `beach-plus-arena`:

```
python -m http.server 8765
```

e poi apri `http://localhost:8765/referto/`. Online si può **installare sul telefono** (“Aggiungi a schermata Home”)
e funziona anche offline. Aprendo `index.html` direttamente da disco l'app funziona, ma il PDF usa un font
senza lettere greche.

## Struttura

```
index.html              pagina principale
css/style.css           grafica (mobile-first, chiaro/scuro)
js/i18n.js              traduzioni IT / EL / EN
js/rules.js             regole di gioco: si ricostruisce la gara riapplicando gli eventi
js/app.js               interfaccia
js/pdf.js               PDF del referto
js/cloud.js             collegamento al torneo (accesso dei campi, referti, archivio PDF, punteggio in diretta)
sw.js                   funzionamento offline
vendor/jspdf.umd.min.js jsPDF 2.5.2 (MIT)
vendor/jszip.min.js     JSZip 3.10.1 (MIT) per lo ZIP dell'archivio
fonts/                  Roboto (Apache 2.0) per lettere latine e greche nel PDF
tests/rules.test.js     test delle regole: node --test tests/
```
