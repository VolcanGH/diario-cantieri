# Diario Cantieri

App per il telefono con cui l'operatore sul campo **detta** cosa è successo in cantiere. La nota arriva in ufficio in un foglio Google, divisa per cantiere. Funziona anche senza campo: la nota resta sul telefono e parte da sola appena torna la rete.

Tre guide, una per chi legge:

1. [Per l'ufficio](#1-per-lufficio) — gestire cantieri, note e operatori nel foglio Google
2. [Per preparare il telefono dell'operatore](#2-per-preparare-il-telefono-delloperatore)
3. [Per chi fa manutenzione](#3-per-chi-fa-manutenzione) — come è fatta e come si aggiorna

---

## 1. Per l'ufficio

Tutto si fa nel foglio Google **"Diario Cantieri"** (nel Drive dell'account Google dell'ufficio). Il foglio ha un menu suo, **Diario Cantieri**, in alto accanto a "Guida".

### Le schede del foglio

| Scheda | Cosa contiene | Si modifica a mano? |
|---|---|---|
| `Segnalazioni` | Tutte le note, una per riga, in ordine di arrivo | Sì: solo le colonne `cantiere`, `testo_corretto` e `letto` |
| `Richieste` | Le cose da fare che l'operatore chiede all'ufficio | Sì: `accettata_da`, `fatto`, `note_ufficio` (e `cantiere`) |
| `Persone` | I nomi di chi in ufficio accetta le richieste | Sì, uno per riga |
| `Cantieri` | L'elenco dei cantieri: `nome`, `attivo`, `note` | Sì, è l'ufficio che lo tiene aggiornato |
| Una scheda per cantiere (es. `Rossi`) | Le note di quel cantiere, dalla più recente | **No**: è una formula che legge `Segnalazioni` |
| `Config` | Due impostazioni (vedi sotto) | Solo se serve |
| `Operatori` (nascosta) | Chi può mandare note e il suo codice segreto | Dal menu, non a mano |

### Cosa fare, caso per caso

**Aggiungere un cantiere.** In `Cantieri` scrivi il nome in una riga vuota e metti la spunta in `attivo`. Sul telefono compare alla prossima apertura dell'app con la rete. La scheda del cantiere nasce da sola alla prima nota.

**Chiudere un cantiere.** Togli la spunta `attivo`: sparisce dal telefono, le note vecchie restano. **Non rinominare mai un cantiere**: le note già arrivate resterebbero col nome vecchio. Se serve un nome diverso, chiudi il vecchio e aggiungine uno nuovo.

**Una nota è finita in "Generale" (o nel cantiere sbagliato).** In `Segnalazioni`, nella riga della nota, cambia la cella `cantiere` con la tendina. La nota si sposta da sola nella scheda giusta; se quel cantiere non aveva ancora la scheda, nasce in quel momento.

**Segnare una nota come letta.** In `Segnalazioni`, spunta la casella `letto`.

**Una richiesta dell'operatore ("da fare per l'ufficio").** Arriva nel foglio `Richieste`, con cantiere e testo. Chi se ne occupa sceglie il **proprio nome** nella tendina `accettata_da`: la data di accettazione si scrive da sola. Quando è fatta, spunta `fatto`; in `note_ufficio` si può annotare cosa è stato fatto. I nomi della tendina sono quelli scritti nel foglio `Persone`.

**Una richiesta è finita tra le note (o una nota tra le richieste).** Seleziona una cella della riga e usa il menu **Diario Cantieri → Sposta la riga in Richieste** (o *…in Segnalazioni*): la riga passa nell'altro foglio con data, operatore, cantiere e testo.

**Correggere un testo.** Scrivi la versione corretta in `testo_corretto`, mai in `testo_originale`: l'originale è quello che l'operatore ha detto davvero e va conservato.

**Nuovo operatore (o telefono nuovo).** Menu **Diario Cantieri → Nuovo operatore…** → scrivi il nome → *Copia il link* → mandalo su WhatsApp al suo telefono. Il link contiene il suo codice segreto: va aperto **con Chrome** una volta sola e il telefono resta collegato. Se l'operatore cambia telefono, crea un operatore nuovo e blocca il vecchio.

**Bloccare un operatore.** Menu **Diario Cantieri → Mostra / nascondi operatori** → togli la spunta `attivo` nella sua riga → nascondi di nuovo la scheda dallo stesso menu. Dal momento del blocco le sue note non vengono più accettate.

**Il foglio sembra rotto (manca una scheda, mancano le tendine…).** Menu **Diario Cantieri → Prepara il foglio**: ricrea quello che manca senza toccare le note esistenti. Si può lanciare quante volte si vuole.

**L'operatore dice che l'app scrive "chiama l'ufficio".** Significa una di queste tre cose: il suo operatore è stato bloccato, il link personale non è mai stato aperto, oppure il foglio non ha risposto per più di un giorno. Le note sono al sicuro sul telefono: partiranno da sole appena il problema è risolto. Controlla nel foglio `Operatori` che abbia la spunta `attivo`; se ce l'ha e il problema dura più di un'ora, avvisa chi fa manutenzione (sezione 3).

### Le impostazioni in `Config`

- `url_app`: l'indirizzo dell'app sul telefono. Serve per costruire i link degli operatori. Non cambiarlo.
- `correzione_attiva`: per la correzione automatica del testo (non ancora costruita, vedi la sezione 3). Lascia la spunta vuota.

---

## 2. Per preparare il telefono dell'operatore

Serve un telefono **Android** con **Chrome** (l'iPhone non è supportato: scelta fatta all'inizio del progetto, perché lì la dettatura dentro un'app installata non funziona). Dieci minuti, una volta sola.

1. **Crea l'operatore** nel foglio (vedi sopra) e manda il link al telefono su WhatsApp.
2. **Apri il link con Chrome.** Attenzione: su molti telefoni (Samsung, ad esempio) WhatsApp apre i link in un altro browser. Se non è Chrome, tieni premuto il link → *Copia link* → aprilo in Chrome. Il telefono si collega da solo: deve comparire la schermata iniziale col pulsante giallo "Cosa è successo?", non la schermata "Telefono non collegato".
3. **Installa l'app:** in Chrome, menu ⋮ → **Installa app** (o *Aggiungi a schermata Home*). Sulla Home compare l'icona gialla col casco. Da ora in poi **si usa sempre l'icona**, mai più il link.
4. **Microfono:** apri l'app dall'icona → *Cosa è successo?* → *Tocca per parlare* → quando Chrome chiede il permesso del microfono scegli **Consenti**.
5. **Dettatura senza campo:** senza rete il pulsante grande passa da solo al microfono della tastiera. Perché funzioni offline, scarica l'italiano: impostazioni della tastiera (Gboard) → *Digitazione vocale* → *Riconoscimento vocale offline* → scarica **Italiano**. Prova in modalità aereo: tastiera → microfono → parla → deve scrivere.
6. **Prova completa:** una nota con la rete (deve comparire in `Segnalazioni`), poi una in modalità aereo: "Verrà inviata appena c'è campo" → togli la modalità aereo → "Tutto inviato ✓".

Da sapere:

- **Non cancellare i dati di Chrome** sul telefono: sparirebbero il collegamento all'ufficio e le note non ancora inviate. In quel caso basta riaprire il link personale.
- Le versioni nuove dell'app arrivano da sole, senza reinstallare nulla. Il numero in basso nella schermata iniziale (es. `v6`) dice quale versione gira.
- Dopo una pausa nel parlato, Android ferma l'ascolto da solo: basta toccare di nuovo il microfono, il testo nuovo si accoda.
- Se quello che ha dettato è una cosa che **deve fare l'ufficio** (ordinare, chiamare, portare…), prima di *Avanti* tocca il pulsante **Da fare per l'ufficio**: diventa scuro con la spunta. La richiesta finisce nel foglio `Richieste` invece che tra le note, e la schermata finale dice "Richiesta salvata".
- Mentre la tastiera è aperta (per correggere una parola) il pulsante microfono sparisce per fare spazio: chiudi la tastiera e ricompare.
- Il telefono tiene le ultime 30 note inviate (le ultime 3 si vedono nella schermata iniziale); le note in attesa restano finché non partono.

---

## 3. Per chi fa manutenzione

### Come è fatta

- **`app/`** — l'app sul telefono: HTML, CSS e JavaScript senza librerie né passaggi di compilazione. Pubblicata con GitHub Pages dal ramo `main` di questo repository: ogni `git push` va online in 1-2 minuti.
  - `config.js`: l'indirizzo della Web App e il **numero di versione**. È l'unico file da toccare per una pubblicazione.
  - `app.js` schermate e navigazione · `db.js` memoria del telefono (IndexedDB) e coda di invio · `speech.js` dettatura · `sw.js` service worker (apertura senza rete, aggiornamenti automatici, invio in background).
- **`apps-script/`** — il codice che gira dentro il foglio Google (Apps Script): `Code.gs` e il manifest `appsscript.json`. Riceve le note, controlla il codice dell'operatore, scarta i doppioni, crea le schede per cantiere, fa il menu.
- **`prove/server-finto.js`** — un server locale per provare l'app sul computer senza toccare Google: `node prove/server-finto.js`, poi apri `http://localhost:8765/app/?c=PROVAPROVAPROVA1` (il codice operatore di prova). Il finto backend sta su `http://localhost:8766/exec` e risponde anche a `/stato` (note ricevute), `/azzera` (svuota) e `/guasto/on` · `/guasto/off` (simula un foglio guasto).
- **`app/icons/icona.svg`** — il disegno dell'icona; i PNG a 192 e 512 px sono ricavati da lì.
- **`CLAUDE.md`** — la specifica originale dell'app.

Il dialogo telefono ↔ foglio è tutto qui:

- `GET  …/exec?codice=CODICE` → `{ "ok": true, "cantieri": [...] }`
- `POST …/exec` con corpo JSON `{ "codice", "note": [{ "id", "dataOraNota", "cantiere", "testo", "tipo" }] }` → `{ "ok": true, "ricevute": [id…], "scartate": [id…] }`

Il telefono segna "inviata" solo una nota il cui `id` torna in `ricevute`: per questo un invio interrotto a metà non perde né duplica niente (il foglio scarta gli `id` già presenti). Gli `id` in `scartate` (note che il foglio rifiuta: non può succedere con le note fatte dall'app) vengono messi da parte e non ritentati. Il campo `tipo` vale `"nota"` (→ `Segnalazioni`) o `"richiesta"` (→ `Richieste`, l'interruttore "Da fare per l'ufficio"): lo script smista per tipo con la tabella `TIPI` in `Code.gs`, dove un modulo futuro aggiunge una riga.

### Pubblicare una modifica dell'app

1. Modifica i file in `app/`.
2. Alza `VERSIONE` in `app/config.js` (es. da `'6'` a `'7'`): senza questo i telefoni **non** si aggiornano, perché il service worker tiene i file in cache finché il numero non cambia.
3. `git commit` e `git push`. Dopo 1-2 minuti i telefoni scaricano la versione nuova alla prossima apertura (si ricaricano da soli quando sono sulla schermata iniziale). Aspetta 10 minuti prima di provarla sul telefono: GitHub Pages tiene i file in cache per 10 minuti e nel frattempo potrebbe servire un misto di file vecchi e nuovi.

### Aggiornare lo script del foglio

Lo script si gestisce da questo computer con [clasp](https://github.com/google/clasp) (`npm install -g @google/clasp`, poi `clasp login` con l'account Google dell'ufficio; l'API Apps Script deve essere attiva su https://script.google.com/home/usersettings). Il file `.clasp.json` (non nel repository: contiene gli id dello script) collega la cartella `apps-script/` allo script del foglio. Se manca, nell'editor Apps Script apri *Impostazioni progetto* → copia l'*ID script* e crea il file:

```json
{ "scriptId": "ID-DELLO-SCRIPT", "rootDir": "apps-script" }
```

Poi, a ogni modifica di `Code.gs`:

```bash
clasp push -f
clasp update-deployment ID-DELLA-DISTRIBUZIONE -d "descrizione"
```

L'id della distribuzione è la parte dell'indirizzo della Web App tra `/macros/s/` e `/exec` (lo vedi in `app/config.js`). **Mai creare una distribuzione nuova** per un aggiornamento: avrebbe un indirizzo diverso e i telefoni resterebbero sul codice vecchio. Alza anche `VERSIONE_SCRIPT` in `Code.gs`: compare nelle risposte (`"versione": 3`) ed è il modo per capire quale versione è davvero pubblicata.

### Trappole già incontrate (da non ripetere)

- **Il parametro `c` è riservato** nelle Web App di Apps Script (come `sid`): una chiamata `…/exec?c=…` risponde "Pagina non trovata" senza spiegazioni. Per questo il parametro si chiama `codice`. Il link personale dell'app (`…/app/?c=CODICE`) invece va bene: lo legge l'app, non Apps Script.
- La prima pubblicazione come Web App va fatta dall'editor (*Distribuisci → Nuova distribuzione → Applicazione web → Esegui come: me → Accesso: chiunque*). Gli aggiornamenti si fanno con `clasp update-deployment`.
- Il foglio Google e il suo script vanno creati dall'editor, non con `clasp create-script`: i tentativi falliti lasciano fogli vuoti nel Drive.
- Nei fogli, le caselle di spunta preparate in anticipo contano come righe piene per `appendRow` e `getLastRow()`: lo script scrive sempre nella prima riga libera della colonna A, sia nei fogli del menu sia in `Segnalazioni`. Inserire una casella in una cella la azzera: per questo "Prepara il foglio" mette le caselle solo nelle celle vuote, e quando serve una spunta si inserisce prima la casella e poi il valore.
- Le schede per cantiere usano `SORT(CHOOSECOLS(FILTER(…)))` con il separatore `;`, non `QUERY`: `QUERY` si rompe con gli apostrofi nei nomi e con i testi che sembrano numeri.
- Il link personale aperto dal browser interno di WhatsApp non ha accesso alla memoria di Chrome: sembra funzionare ma non installa niente. Sempre Chrome, poi sempre l'icona.

### Cosa manca (e come si farebbe)

**Correzione automatica del testo** (la "tappa 6" della specifica): un file `Correzione.gs` con un trigger a tempo ogni 5 minuti che legge le righe di `Segnalazioni` con `stato_correzione` vuoto, chiama l'API di Claude (modello economico), scrive `testo_corretto` e `stato_correzione = "fatto"` (oppure `"errore"`, con 3 tentativi al massimo). Prima di costruirla servono: una chiave API Anthropic (console.anthropic.com, a consumo) da salvare nelle *Proprietà dello script* (mai nel codice), la spunta `correzione_attiva` in `Config`, e lo scope `script.external_request` nel manifest. Il prompt è già scritto nella specifica (`CLAUDE.md`): correggere ortografia e punteggiatura senza cambiare il significato.

**Idee di fase 2** (nella specifica): pulsante "È urgente" con email all'ufficio, riepilogo giornaliero via email, suggerimento del cantiere dal GPS, più operatori con link separati (già possibile dal menu).
