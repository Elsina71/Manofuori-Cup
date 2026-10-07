# Referto Pallavolo (indoor 6 contro 6) 🏐

Referto elettronico (e-scoresheet) per le partite di pallavolo indoor, pensato per il torneo amatoriale di
pallavolo mista **Manofuori Cup**. Si usa da telefono, tablet o PC, funziona **senza connessione** e salva
tutto sul dispositivo. Le regole sono quelle ufficiali FIVB, le stesse che segue il software e-Scoresheet
di Data Project usato nelle gare internazionali.

## Come si usa

1. **Nuova gara**: torneo, fase, numero gara, data, ora, palestra e campo; per ogni squadra nome, colore
   della maglia, giocatori (numero, nome, **D/U** donna/uomo, **L** libero, **K** capitano) e allenatore;
   arbitri, segnapunti e **formula**.
   Con **“Nuova gara, stesso torneo”** torneo, data, arbitri e formula vengono copiati e il numero gara
   aumenta di uno.
2. **Sorteggio e formazioni** (set 1 e set decisivo): chi vince il sorteggio sceglie servizio, ricezione o
   campo; se sceglie il campo, l'altra squadra sceglie servizio o ricezione. Poi si indica la squadra alla
   sinistra del segnapunti e si inseriscono le formazioni **dal posto 1 al posto 6**. Ogni squadra è disegnata
   su due righe da 3, con la rete in alto: in alto i posti 4, 3, 2, in basso i posti 5, 6, 1 (senso antiorario,
   posto 1 in basso a destra = al servizio). Negli altri set il sistema propone già il cambio di campo, la squadra al
   servizio (quella che ha ricevuto per prima nel set precedente) e la formazione del set prima.
3. **Gara**: si tocca **+1 punto** sotto la squadra che vince l'azione. Il resto è automatico:
   - **rotazioni**: quando la squadra che riceve vince l'azione conquista il servizio e ruota in senso
     orario (il giocatore del posto 2 va al servizio al posto 1); ogni giocatore resta col suo numero di maglia e
     ruota a partire dalla formazione iniziale del set; 🏐 indica chi serve;
   - fine set a 25 con 2 punti di scarto, set decisivo a 15 con **cambio di campo a 8**, fine gara;
   - **Time-out** (2 per set, conto alla rovescia di 30″);
   - **Sostituzioni** (tocca il giocatore in campo o *Cambio*): massimo 6 per set; il titolare può uscire
     una volta e rientrare solo al posto di chi l'ha sostituito; il sostituto entra una volta sola per set.
     Il sistema propone solo i giocatori che possono entrare. **Sostituzione eccezionale** per infortunio,
     espulsione o squalifica: non conta, e chi esce non rientra più nella gara;
   - **Sanzioni**: avvertimento e penalizzazione per ritardo, avvertimento (giallo), penalizzazione (rosso:
     punto e servizio agli avversari), espulsione e squalifica (il giocatore va sostituito);
   - **Altro…**: squadra incompleta (perde il set), rinuncia o ritiro (perde la gara);
   - **↶ Annulla** toglie l'ultimo evento (anche l'ultimo punto di un set o l'inizio di un set).
4. **Fine gara**: osservazioni, **✔ Chiudi gara** (il referto viene bloccato), **📄 Scarica PDF** e
   **🖨 Stampa**. Il PDF (A4 orizzontale) contiene i dati della gara, gli elenchi delle squadre (donne in
   evidenza), per ogni set le formazioni dal posto 1 al 6, le sostituzioni (esce > entra, con il punteggio), i
   time-out, il punteggio a fine di ogni turno di servizio sotto ogni posto, le entrate e uscite del libero, le
   sanzioni, il risultato, le osservazioni e gli spazi per le firme. Prima della chiusura è una **BOZZA**
   (anche da *Altro…* durante la gara). Nella gara collegata al torneo, alla chiusura il PDF viene archiviato
   da solo nell'app del torneo (`refertiPdf/{torneo}_{gara}`).

**Libero** (pulsante *Libero* sotto la squadra, o tocco sul libero in campo): entra al posto di un giocatore di
seconda linea (posti 1, 5, 6; non al posto di chi sta per servire), non conta come sostituzione e **esce da solo**
quando la rotazione lo porterebbe in prima linea: rientra il giocatore che aveva sostituito. Si può farlo uscire a
mano o cambiarlo con il secondo libero. In campo è a strisce con la scritta “L · n. sostituito”; le sue entrate e
uscite compaiono nel referto stampato. Da **Backup** nella schermata iniziale si esportano o importano le gare in un file JSON.

### Formula (per i tornei amatoriali)

| Campo | Default | Note |
|---|---|---|
| Set | Al meglio di 5 | oppure **set fissi** (si giocano sempre tutti, è possibile il pareggio) |
| Punti per set / ultimo set | 25 / 15 | con set fissi si può mettere l'ultimo set a 25 |
| Punteggio massimo | 0 (nessuno) | es. 27: chi arriva a 27 vince anche con 1 punto di scarto |
| Time-out / sostituzioni per set | 2 / 6 | |
| Donne in campo, minimo | **2** (regola della Manofuori Cup) | **pallavolo mista**: conta chi è davvero in campo, **libero compreso** (una delle due può essere il libero). Avvisa se un cambio o un ingresso/uscita del libero lasciano meno di 2 donne; se il libero esce perché va in prima linea compare un avviso e sotto la squadra resta il segnale ⚠. 0 = nessun controllo |

## Collegamento all'app del torneo

Il referto è pronto per essere aperto **su ogni singola partita** di un torneo creato nell'app
(pulsante *E-scoresheet* accanto alla gara), con lo stesso schema del referto beach dell'app Manofuori Cup:

- si apre con `referto-indoor/?g=<torneo>_<gara>`;
- `js/cloud.js` (caricato solo in quel caso) usa la configurazione Firebase dell'app
  (`../../js/firebase-config.js`, librerie in `../../vendor/firebase/`) e gli stessi account dei campi
  (raccolte `admins`, `scorers`);
- legge la gara da `referti/{torneo}_{gara}`, campo `info`:

```json
{
  "competition": "Manofuori Cup", "phase": "Girone A", "matchNo": "3",
  "date": "2026-10-12", "time": "18:30", "venue": "Palestra …", "court": "1",
  "settings": { "mode": "best", "sets": 3, "points": 25, "lastPoints": 15, "minWomen": 2 },
  "A": { "name": "Leoni", "color": "#1f63d1", "coach": "…",
         "players": [{ "no": 7, "name": "Anna Rossi", "gender": "F", "libero": false, "captain": true }] },
  "B": { "name": "Falchi", "players": [] }
}
```

- a ogni evento scrive il referto completo in `referti/{id}` (`json`, `closedAt`) e il punteggio in diretta
  in `live/{id}`: `status` (`live`/`finished`), `sets` `[{a, b}]`, `setsWon`, `cur` (set in corso),
  `serving`, `winner`, `outcome`. Squadra `a` = squadra A della gara.

Il referto è già integrato nell'app Manofuori Cup: il pulsante **E-scoresheet** sulla gara crea
`referti/{torneo}_{gara}` con `info` e apre il link. Questa cartella è la **versione principale** del referto:
le modifiche si fanno qui, nel repository `Elsina71/Manofuori-Cup` (il branch di sviluppo iniziale in
`Repository-principale` non viene più aggiornato). Dopo ogni modifica alzare `CACHE` in `sw.js`.

## Come si apre in locale

```
cd referto-indoor
python -m http.server 8790
```

e poi apri `http://localhost:8790/`. Online si può **installare sul telefono** (“Aggiungi a schermata Home”).

## Struttura

```
index.html              pagina
css/style.css           grafica (telefono/tablet/PC, chiaro/scuro, stampa A4)
js/rules.js             regole di gioco: la gara si ricostruisce riapplicando gli eventi
js/app.js               interfaccia, stampa del referto, collegamento al torneo
js/pdf.js               PDF del referto
vendor/jspdf.umd.min.js jsPDF 2.5.2 (MIT)
fonts/                  Roboto (Apache 2.0) per il PDF
js/cloud.js             collegamento Firebase (solo dentro l'app del torneo)
sw.js                   funzionamento offline
tests/rules.test.js     test delle regole: node --test tests/rules.test.js
```
