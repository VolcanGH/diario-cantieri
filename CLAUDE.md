# Diario Cantieri — istruzioni di progetto

## Cos'è
Una web app (PWA) semplicissima che permette a un operatore sul campo, un uomo di circa 50 anni poco abituato alla tecnologia, di registrare dal cellulare gli avvenimenti dei cantieri. Le note arrivano in ufficio in un Google Sheet, divise per cantiere.

**Regola d'oro: se una scelta rende l'app anche solo un po' più complicata per l'utente, è la scelta sbagliata.** In caso di dubbio togli, non aggiungere.

## Utente e contesto d'uso
- Usa il telefono con una mano, spesso all'aperto, con il sole sullo schermo, a volte con le mani sporche o i guanti.
- La connessione nei cantieri è spesso assente o debole.
- Preferisce parlare piuttosto che scrivere.
- Non deve mai trovarsi davanti messaggi tecnici, menu, impostazioni o login con password.

## Flusso dell'app (è l'unico flusso)

1. **Schermata iniziale**
   - Un unico pulsante enorme (almeno metà schermo): **"Cosa è successo?"**
   - Sotto, in piccolo e discreto: lo stato di invio ("Tutto inviato ✓" oppure "2 note in attesa di rete").
   - Facoltativo: elenco delle ultime 3 note inviate (solo lettura), per rassicurarlo che sono arrivate.

2. **Schermata "Racconta"**
   - Un grande pulsante microfono 🎤 **"Tieni premuto / Tocca per parlare"** (dettatura vocale in italiano).
   - Un'area di testo grande che si riempie con quanto dettato, modificabile anche da tastiera.
   - È possibile dettare più volte di seguito: il testo si accoda, non si sostituisce.
   - Pulsante grande **"Avanti"** (disattivato se il testo è vuoto) e un pulsante secondario **"Annulla"**.

3. **Schermata "Quale cantiere?"**
   - Elenco dei cantieri attivi come pulsanti grandi, uno sotto l'altro, ordinati con prima gli **ultimi usati**.
   - In fondo, ben visibile, un pulsante **"Non so / Generale"**: la nota NON va mai persa e finisce nel cantiere "Generale".
   - Il tocco su un cantiere salva e invia subito, senza ulteriore conferma.

4. **Conferma**
   - Schermata piena con **"✓ Nota salvata"**. Se è offline: "✓ Nota salvata, verrà inviata appena c'è campo".
   - Dopo 3 secondi, o al tocco, si torna alla schermata iniziale.

Niente foto, niente login con password, niente impostazioni visibili all'utente.

## Requisiti di interfaccia
- Testo base di almeno 20px; pulsanti principali alti almeno 80px; area toccabile minima di 56px.
- Contrasto alto (WCAG AAA dove possibile), leggibile al sole. Niente grigi chiari su bianco.
- Niente gesti nascosti (swipe, pressione prolungata obbligatoria, doppio tocco).
- Tutte le parole in italiano semplice, mai termini tecnici ("sincronizzazione", "errore 500", "token"...).
- Layout verticale pensato per smartphone; su desktop basta che funzioni.
- Feedback tattile (vibrazione breve), dove supportato, alla pressione dei pulsanti principali.

## Dettatura vocale
- Usare la Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) con `lang = 'it-IT'`.
- **Attenzione su iPhone:** il supporto nelle PWA installate (modalità standalone) è stato storicamente instabile. Va verificato sul dispositivo reale.
- **Fallback obbligatorio:** se l'API non è disponibile o fallisce, il pulsante microfono mette il focus sull'area di testo e mostra un aiuto grande e chiaro: "Tocca il microfono 🎤 sulla tastiera e parla". La dettatura della tastiera di iOS e Android funziona sempre.
- Durante l'ascolto il pulsante deve mostrare in modo evidente che sta registrando (colore pieno, animazione, testo "Sto ascoltando...").

## Offline e invio
- Ogni nota viene salvata **prima** in locale (IndexedDB), poi inviata.
- Coda di invio con nuovi tentativi automatici: al ritorno della rete, all'apertura dell'app e periodicamente mentre l'app è aperta.
- Ogni nota ha un `id` univoco (UUID) generato sul telefono: il backend lo usa per **evitare duplicati** se un invio viene ripetuto.
- Service worker per far funzionare l'app interamente offline (app shell in cache).
- L'elenco cantieri viene scaricato dal server e messo in cache; offline si usa l'ultimo elenco noto.
- Timestamp della nota = momento in cui l'utente l'ha registrata, non quello dell'invio.

## Backend: Google Sheets + Apps Script

### Struttura del foglio
- **`Cantieri`** — gestito dall'ufficio a mano. Colonne: `nome`, `attivo` (TRUE/FALSE), `note`. Il cantiere "Generale" esiste sempre e non si può disattivare.
- **`Segnalazioni`** — registro principale, una riga per nota. Colonne:
  `id` | `data_ora_nota` | `data_ora_ricezione` | `operatore` | `cantiere` | `testo_originale` | `testo_corretto` | `stato_correzione` | `letto` (checkbox per l'ufficio)
- **Un foglio per cantiere** — creato in automatico dallo script quando arriva la prima nota di un cantiere nuovo. Contiene una formula `QUERY` sul foglio `Segnalazioni` filtrata per quel cantiere, ordinata dalla più recente. Non va mai modificato a mano: si modifica `Segnalazioni`.
- Per riassegnare una nota "Generale" a un cantiere, l'ufficio cambia la cella `cantiere` in `Segnalazioni` (convalida dati a tendina presa da `Cantieri`). I fogli per cantiere si aggiornano da soli.

### Web App Apps Script
- Pubblicata come Web App: "Esegui come: me", "Accesso: chiunque".
- `doGet` → restituisce in JSON l'elenco dei cantieri attivi.
- `doPost` → riceve una o più note (array, per svuotare la coda in un colpo solo), scarta gli `id` già presenti e aggiunge le righe.
- Per evitare problemi CORS il client invia `POST` con `Content-Type: text/plain` e corpo JSON (niente preflight).
- **Sicurezza minima:** ogni richiesta include un codice segreto per operatore, che la Web App verifica contro un foglio nascosto `Operatori` (colonne `codice`, `nome`, `attivo`). Il codice viene inserito una sola volta tramite un link personale (es. `https://.../?c=XXXX`) che salva il codice sul telefono. L'utente non deve mai digitarlo.
- Usare `LockService` durante la scrittura per evitare righe sovrapposte.

### Correzione ortografica e di forma
- Il testo dettato va corretto per ortografia, punteggiatura e frasi spezzate, **senza cambiarne il significato** e senza aggiungere informazioni.
- Va **sempre** conservato `testo_originale`; la correzione finisce in `testo_corretto`.
- Implementazione proposta: chiamata da Apps Script all'API di Claude (modello economico, es. `claude-haiku-4-5-20251001`). La chiave API va salvata nelle Script Properties, mai nel codice né nel client.
- La correzione gira in modo **asincrono**: un trigger a tempo ogni 5 minuti elabora le righe con `stato_correzione` vuoto. Così il `doPost` resta veloce e un errore dell'API non blocca mai il salvataggio della nota.
- In caso di errore: `stato_correzione = "errore"` e nuovo tentativo al giro successivo (massimo 3 tentativi).
- Prompt di correzione: correggi ortografia e punteggiatura, ricomponi le frasi in italiano chiaro, mantieni termini tecnici edilizi, nomi, numeri e misure esattamente come sono, restituisci solo il testo corretto.
- Rendere la correzione disattivabile da una cella di configurazione (foglio `Config`).

## Struttura del repository (indicativa)
```
/app                 → PWA (HTML, CSS, JS; niente framework pesanti)
  index.html
  app.js
  db.js              → IndexedDB e coda di invio
  speech.js          → dettatura vocale con fallback
  sw.js              → service worker
  manifest.webmanifest
  icons/
/apps-script         → codice Apps Script (gestito con clasp)
  Code.gs
  Correzione.gs
  appsscript.json
README.md            → guida di installazione per non tecnici
```

## Scelte tecniche
- JavaScript semplice o, al massimo, una libreria leggera. Niente build complessa: deve restare manutenibile anni dopo, da chiunque.
- Hosting statico gratuito (GitHub Pages, Cloudflare Pages o Netlify).
- Manifest PWA completo con icona grande e riconoscibile, nome breve ("Cantieri"), `display: standalone`, orientamento verticale.
- URL della Web App in un unico file di configurazione.

## Come lavorare su questo progetto
- Prima di implementare una funzionalità, proponi il piano e aspetta l'approvazione.
- Procedi per tappe, ognuna provabile sul telefono:
  1. Interfaccia completa con dati finti salvati in locale
  2. Dettatura vocale con fallback
  3. Backend Apps Script (lettura cantieri e scrittura note)
  4. Offline e coda di invio
  5. Fogli per cantiere automatici
  6. Correzione del testo
  7. README di installazione (per l'ufficio e per configurare il telefono dell'operatore)
- Ad ogni tappa, indica come provarla su un telefono vero.
- Commenti nel codice in italiano.

## Checklist di prova prima del rilascio
- [ ] Nota registrata in modalità aereo → arriva quando torna la rete, una sola volta
- [ ] Chiusura dell'app con note in coda → partono alla riapertura
- [ ] Dettatura vocale su Android (Chrome) e iPhone (Safari e PWA installata)
- [ ] Fallback tastiera quando la dettatura non è disponibile
- [ ] "Non so / Generale" funziona sempre
- [ ] Cantiere nuovo aggiunto in ufficio → compare sul telefono
- [ ] Nota riassegnata in ufficio → si sposta nel foglio del cantiere giusto
- [ ] Errore dell'API di correzione → la nota è comunque salvata con il testo originale
- [ ] Leggibilità al sole, con il telefono a luminosità media
- [ ] Prova reale con l'operatore: completa una nota da solo, senza aiuto, in meno di 30 secondi

## Aggiunte approvate dopo la prima versione

- **Richieste all'ufficio (ottobre 2026).** Nella schermata "Racconta" c'è un interruttore **"Da fare per l'ufficio"**, spento di default. Acceso, la registrazione ha `tipo = "richiesta"` e lo script la mette nel foglio **`Richieste`** (colonne: `id | data_ora_richiesta | data_ora_ricezione | operatore | cantiere | richiesta | accettata_da | data_accettazione | fatto | note_ufficio`) invece che in `Segnalazioni`. Chi in ufficio la accetta sceglie il proprio nome nella tendina `accettata_da` (nomi nel foglio `Persone`); la data di accettazione si compila da sola. Le richieste non compaiono nei fogli per cantiere e non hanno scadenza. Dal menu si può spostare una riga tra `Segnalazioni` e `Richieste`.
- **Calendario (ottobre 2026).** Nella schermata iniziale un secondo pulsante grande, azzurro, **"Calendario"**, che si divide lo spazio con "Cosa è successo?" (l'elenco delle ultime note inviate è stato tolto). Appuntamenti dell'operatore dal lunedì al sabato, caselle fisse di un'ora dalle 7 alle 19, un giorno alla volta con due frecce grandi ‹ › (giorno prima / giorno dopo); il tocco su una casella apre la schermata "Racconta" (dettatura o tastiera) con *Salva* e, se c'è già un testo, *Cancella l'appuntamento*. Gli appuntamenti restano **solo sul telefono** (IndexedDB), non arrivano in ufficio e non hanno sveglia: il promemoria è il prossimo appuntamento di oggi scritto nel pulsante.
- Il parametro della chiamata GET si chiama `codice` (in Apps Script `c` è riservato); i fogli per cantiere usano `SORT(CHOOSECOLS(FILTER(…)))` invece di `QUERY`; il microfono è solo "tocca per parlare / tocca per fermare".

## Idee per una fase 2 (NON implementare senza richiesta)
- Pulsante "È urgente" che invia subito un'email all'ufficio.
- Riepilogo giornaliero via email all'ufficio con le note del giorno, divise per cantiere.
- Suggerimento automatico del cantiere in base alla posizione GPS.
- Più operatori, ognuno con il proprio link personale (la struttura è già pronta).
