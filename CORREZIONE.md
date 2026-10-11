# Correzione dei testi — istruzioni per il correttore esterno

Queste istruzioni sono per chi corregge i testi dettati dall'operatore: un programma (o un agente) che gira fuori dal foglio, con accesso al foglio Google "Diario Cantieri" tramite l'API di Google Fogli. Il foglio è condiviso con il suo account con permesso **Editor**. Lo script dentro al foglio non fa nessuna correzione e non chiama nessuna API: la correzione è tutta qui.

**Stato attuale (ottobre 2026):** il correttore è una routine di Claude nel cloud, sull'account di Mirko, che gira **ogni ora dal lunedì al sabato, dalle 7 alle 19 circa**. Una nota dettata la sera o di domenica viene corretta al primo giro utile.

## Contratto: cosa non deve cambiare nel foglio

La routine trova schede e colonne **per nome**. Spostarle di posto si può; rinominarle no.

- Schede: `Segnalazioni`, `Richieste`, `Config` (e `Persone`, da cui viene la tendina dei nomi).
- Colonne: `id`, `cantiere`, `operatore`, `testo_originale`, `testo_corretto`, `richiesta`, `richiesta_corretta`, `stato_correzione`, `accettata_da`, `data_accettazione`.
- `data_accettazione` resta nel formato `GG/MM/AAAA HH:MM` (è il formato che "Prepara il foglio" mette sulla colonna: non cambiarlo a mano).
- I nomi in `Persone` (quindi nella tendina `accettata_da`) devono essere **esattamente** quelli noti alla routine, oggi: Mirko, Monica, Gabriele, Mattia, Stefano. Per aggiungere una persona, cambiarle il nome o il colore, avvisare Mirko: va aggiornata la routine.
- Se nasce una scheda nuova con testi da correggere, avvisare Mirko: va aggiunta alle istruzioni della routine.
- Il foglio deve restare **condiviso** con l'account della routine (Editor); se la condivisione sparisce, tutto si ferma in silenzio.
- La riga `correzione_attiva` in `Config` deve restare, con quel nome.

## Cosa deve fare, in breve

Ogni pochi minuti: leggere le righe con il testo ancora da correggere, scrivere il testo corretto nella colonna accanto, segnare lo stato. Niente altro.

## Interruttore

Foglio `Config`, riga `correzione_attiva` (colonna `valore`, una casella): se **non è spuntata** (FALSE) non fare niente. Controllarla a ogni giro.

## Dove sono i testi

Le colonne si trovano **per nome**, leggendo la riga 1 di ciascun foglio: mai per lettera o posizione, perché in futuro una colonna può spostarsi.

| Foglio | Testo da correggere | Dove scrivere il testo corretto | Stato |
|---|---|---|---|
| `Segnalazioni` | `testo_originale` | `testo_corretto` | `stato_correzione` |
| `Richieste` | `richiesta` | `richiesta_corretta` | `stato_correzione` |

In entrambi i fogli la colonna `id` è un identificativo univoco della riga (scritto dal telefono).

## Quali righe

- Da correggere: `stato_correzione` **vuoto** e testo da correggere **non vuoto**.
- `errore`: da riprovare al giro successivo.
- `fatto` e `no`: **non toccare mai**. `fatto` può contenere una correzione ritoccata a mano dall'ufficio; `no` significa che l'ufficio non vuole la correzione.

## Cosa scrivere

1. Il testo corretto nella colonna del testo corretto, **sempre**, anche quando è identico all'originale (così la colonna è sempre piena e i fogli per cantiere mostrano sempre una versione pulita).
2. `fatto` in `stato_correzione`. Se la correzione non è riuscita (chiamata fallita, risposta vuota), `errore`.
3. **Nessun'altra cella.** In particolare: mai l'originale, mai `id`, mai date, `cantiere`, `operatore`, `letto`, `accettata_da`, `fatto`, `note_ufficio`.

## Come scrivere senza fare danni

- Scrivere **per `id`**: al momento di scrivere, ritrovare la riga cercando l'`id` nella colonna `id`, e scrivere lì. Un numero di riga letto qualche minuto prima può non valere più: l'ufficio cancella e sposta righe a mano, e il menu "Sposta la riga" cancella righe.
- Leggere e scrivere a blocchi (al massimo 50 righe per giro), con una scrittura per cella o per blocco contiguo: mai riscrivere l'intero foglio.
- Mai cancellare, inserire o spostare righe o colonne. Mai scrivere nei fogli per cantiere (sono formule che leggono `Segnalazioni`), né in `Cantieri`, `Persone`, `Operatori`, `Config`.
- Un giro ogni ora va bene (è la frequenza attuale); più spesso non serve. Per restare leggeri si può leggere per intero solo `stato_correzione` e prendere `id` e testo solo delle righe da fare.

## Regole di correzione

Il testo arriva dalla dettatura vocale di un operatore di cantiere (edilizia: cemento, ferro, casseri, scavi, impianti, DL, committente, fornitori). Correggere **solo la forma**:

- ortografia, accenti, maiuscole, punteggiatura;
- frasi spezzate o ripetute dalla dettatura (es. "allora allora oggi è venuto il geometra è venuto alle 8" → "Oggi è venuto il geometra alle 8.");
- numeri detti a parole possono diventare cifre se è più chiaro ("venti sacchi" → "20 sacchi"), ma le misure e le quantità devono restare **esattamente le stesse**.

Non fare mai:

- cambiare il significato, aggiungere informazioni, togliere informazioni, "completare" una frase con quello che sembra sottinteso;
- cambiare termini tecnici, nomi di persone, ditte, cantieri, materiali, sigle, numeri, misure, orari, date;
- tradurre o rendere il testo più formale del necessario: deve restare la frase dell'operatore, solo scritta bene;
- aggiungere commenti, virgolette, spiegazioni: il risultato è **solo il testo corretto**.

Se il testo è già corretto, ricopiarlo uguale. Se è incomprensibile, ricopiarlo uguale e segnare `fatto`: l'ufficio lo legge comunque in originale.

### Esempi

| Originale (dettato) | Corretto |
|---|---|
| ordinare venti sacchi di cemento per lunedì mattina servono per il getto del vano scala | Ordinare 20 sacchi di cemento per lunedì mattina: servono per il getto del vano scala. |
| è venuto il geometra rossi ha detto che il muro a nord va spostato di 10 centimetri verso l'interno | È venuto il geometra Rossi: ha detto che il muro a nord va spostato di 10 centimetri verso l'interno. |
| manca il ferro per i pilastri la gru è ferma da stamattina | Manca il ferro per i pilastri. La gru è ferma da stamattina. |

## Come interviene l'ufficio

- Rifare una correzione: svuotare `stato_correzione` (al giro dopo viene rifatta).
- Impedirla: scrivere `no` in `stato_correzione`.
- Correggere a mano: modificare il testo corretto e lasciare `fatto`.
- Fermare tutto: togliere la spunta a `correzione_attiva` in `Config`.

## Dove si vede il risultato

Nei fogli per cantiere, accanto all'originale (colonna `testo_corretto`), e nelle colonne dei due fogli principali.

## Eventi in calendario per le richieste accettate (stessa routine, dall'11/10/2026)

Non fa parte della correzione, ma lo fa la stessa routine, leggendo lo stesso foglio:

- Quando in `Richieste` una riga ha `accettata_da` e `data_accettazione`, crea un evento sul calendario Google di Mirko: inizio a `data_accettazione` + 24 ore arrotondato all'ora intera più vicina, durata 30 minuti, promemoria all'inizio.
- Titolo: `<cantiere> – <richiesta_corretta>` (se `richiesta_corretta` è vuota usa `richiesta`; nello stesso giro la correzione gira prima degli eventi, quindi di norma il testo corretto c'è già). Descrizione: chi ha fatto la richiesta, chi l'ha accettata e quando, testo originale, `id richiesta: <id>`.
- Colore per persona: Mirko rosso, Monica blu, Gabriele verde, Mattia giallo, Stefano grigio; un nome fuori tabella prende il colore predefinito.
- Niente doppioni: prima di creare cerca l'`id` della richiesta nel calendario. Non modifica né cancella eventi già creati. Nel foglio non scrive niente.
- Le accettazioni precedenti all'11/10/2026 19:53 (prove) vengono ignorate.
- Limiti: crea eventi, non attività di Google Tasks; un'accettazione del sabato sera viene elaborata il lunedì alle 7.
- `Config.correzione_attiva = FALSE` ferma solo le correzioni, non gli eventi.

La colonna `fatto` di `Richieste` resta e resta dell'ufficio: la routine non la legge, ma è l'unico posto dove è scritto che una richiesta è stata chiusa (l'evento in calendario è un promemoria, non un registro).

## Avvisi

Se un giro fallisce (foglio o calendario non raggiungibili, scheda o colonna non trovata, righe in errore, evento non creato) la routine manda una mail a Mirko, al massimo una al giorno. Se per qualche giorno non arrivano né correzioni né eventi, la prima cosa da controllare è la condivisione del foglio.
