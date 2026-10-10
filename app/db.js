// Diario Cantieri — memoria del telefono (IndexedDB) e coda di invio.
// Ogni nota viene prima salvata qui e poi inviata: così non si perde mai.
// Qui stanno anche gli appuntamenti del calendario, che invece restano solo sul telefono.
// Questo file viene letto sia dalla pagina sia dal service worker: qui niente "window" o "document".

(function (globale) {
  'use strict';

  // Il nome ha il prefisso dell'app perché su GitHub Pages tutti i siti
  // dello stesso utente condividono la stessa memoria.
  var NOME_DB = 'diario-cantieri';
  var VERSIONE_DB = 2;   // 2: aggiunto il deposito "appuntamenti" (calendario)
  var DEPOSITI = ['note', 'impostazioni', 'appuntamenti'];
  var NOTE_INVIATE_DA_TENERE = 30;
  var NOTE_PER_INVIO = 20;
  var MILLISECONDI_ATTESA_RISPOSTA = 45000;
  var ATTESA_MINIMA = 60000;          // dopo una risposta sbagliata del foglio: 1 minuto…
  var ATTESA_MASSIMA = 30 * 60000;    // …che raddoppia a ogni fallimento, fino a mezz'ora
  var NOME_BLOCCO_INVIO = 'diario-cantieri:invio';

  // Cantieri finti della modalità prova (CONFIG.URL_WEB_APP vuoto).
  var CANTIERI_FINTI = [
    'Casa Rossi – Predazzo',
    'Condominio Lagorai',
    'Capannone Ziano',
    'Ristrutturazione Bianchi – Tesero',
    'Villetta Verdi – Cavalese'
  ];

  // Una nota salvata sul telefono:
  //   { id, tipo: 'nota', testo, cantiere, dataOraNota, stato: 'in_attesa' | 'inviata' | 'scartata', inviataIl }
  // "inviataIl" è il momento in cui il foglio l'ha confermata: serve solo a capire cosa è successo.
  // "scartata" = il foglio l'ha rifiutata (non può succedere con le note fatte dall'app): non si riprova.
  //
  // Un appuntamento del calendario (resta solo sul telefono):
  //   { chiave: '2026-10-12 08', giorno: '2026-10-12', ora: 8, testo, modificatoIl }
  // La chiave è "giorno ora": così gli appuntamenti di un giorno si leggono con un intervallo di chiavi.

  // ---- IndexedDB ----

  var connessione = null;

  function apri() {
    if (connessione) return connessione;
    connessione = new Promise(function (risolvi, rifiuta) {
      var richiesta = indexedDB.open(NOME_DB, VERSIONE_DB);
      richiesta.onupgradeneeded = function () {
        var db = richiesta.result;
        if (!db.objectStoreNames.contains('note')) {
          db.createObjectStore('note', { keyPath: 'id' }).createIndex('stato', 'stato');
        }
        if (!db.objectStoreNames.contains('impostazioni')) {
          // Coppie chiave/valore: codiceOperatore, cantieri, usoCantieri, problemaCodice, ultimoErroreInvio…
          db.createObjectStore('impostazioni', { keyPath: 'chiave' });
        }
        if (!db.objectStoreNames.contains('appuntamenti')) {
          db.createObjectStore('appuntamenti', { keyPath: 'chiave' });
        }
      };
      richiesta.onsuccess = function () {
        var db = richiesta.result;
        // Se il browser chiude la connessione (pulizia della memoria, versione nuova aperta
        // da un altro contesto) la prossima operazione ne apre un'altra invece di fallire per sempre.
        db.onversionchange = db.onclose = function () {
          try { db.close(); } catch (e) { /* già chiusa */ }
          connessione = null;
        };
        risolvi(db);
      };
      richiesta.onerror = function () { connessione = null; rifiuta(richiesta.error); };
    });
    return connessione;
  }

  function nuovaTransazione(db, modo, sicura) {
    if (!sicura) return db.transaction(DEPOSITI, modo);
    // "strict" = la scrittura è confermata solo quando è arrivata sul disco: si usa per le note.
    try { return db.transaction(DEPOSITI, 'readwrite', { durability: 'strict' }); }
    catch (errore) {
      if (errore.name === 'InvalidStateError') throw errore;
      return db.transaction(DEPOSITI, 'readwrite');
    }
  }

  // Esegue "lavoro" dentro una transazione e risolve solo quando la transazione è davvero conclusa.
  function transazione(modo, lavoro, sicura, secondoTentativo) {
    return apri().then(function (db) {
      var tx;
      try {
        tx = nuovaTransazione(db, modo, sicura);
      } catch (errore) {
        // Connessione chiusa sotto i piedi: si riapre e si riprova una volta sola.
        connessione = null;
        if (secondoTentativo) throw errore;
        return transazione(modo, lavoro, sicura, true);
      }
      return new Promise(function (risolvi, rifiuta) {
        var esito = {};
        tx.oncomplete = function () { risolvi(esito.valore); };
        tx.onabort = function () { rifiuta(tx.error || new Error('Scrittura annullata')); };
        lavoro(tx, esito);
      });
    });
  }

  function perDataCrescente(a, b) { return a.dataOraNota < b.dataOraNota ? -1 : (a.dataOraNota > b.dataOraNota ? 1 : 0); }

  function leggiPerStato(stato) {
    return transazione('readonly', function (tx, esito) {
      var richiesta = tx.objectStore('note').index('stato').getAll(stato);
      richiesta.onsuccess = function () { esito.valore = richiesta.result; };
    });
  }

  function salvaNota(nota) {
    return transazione('readwrite', function (tx) { tx.objectStore('note').put(nota); }, true);
  }

  function noteInAttesa() {
    return leggiPerStato('in_attesa').then(function (note) { return note.sort(perDataCrescente); });
  }

  function contaInAttesa() {
    return transazione('readonly', function (tx, esito) {
      var richiesta = tx.objectStore('note').index('stato').count('in_attesa');
      richiesta.onsuccess = function () { esito.valore = richiesta.result; };
    });
  }

  // Segna le note con quegli id come "inviata" o "scartata". Si può ripetere senza danni.
  function segnaEsito(ids, stato) {
    if (!ids.length) return Promise.resolve();
    var adesso = new Date().toISOString();
    return transazione('readwrite', function (tx) {
      var deposito = tx.objectStore('note');
      ids.forEach(function (id) {
        var richiesta = deposito.get(String(id));
        richiesta.onsuccess = function () {
          var nota = richiesta.result;
          if (nota && nota.stato === 'in_attesa') {
            nota.stato = stato;
            nota.inviataIl = adesso;
            deposito.put(nota);
          }
        };
      });
    });
  }

  // Delle note già inviate (o scartate) si tengono solo le più recenti.
  function sfoltisci() {
    return Promise.all([leggiPerStato('inviata'), leggiPerStato('scartata')]).then(function (liste) {
      var vecchie = liste[0].sort(perDataCrescente).reverse().slice(NOTE_INVIATE_DA_TENERE)
        .concat(liste[1].sort(perDataCrescente).reverse().slice(NOTE_INVIATE_DA_TENERE));
      if (!vecchie.length) return;
      return transazione('readwrite', function (tx) {
        vecchie.forEach(function (nota) { tx.objectStore('note').delete(nota.id); });
      });
    });
  }

  function leggi(chiave) {
    return transazione('readonly', function (tx, esito) {
      var richiesta = tx.objectStore('impostazioni').get(chiave);
      richiesta.onsuccess = function () { esito.valore = richiesta.result ? richiesta.result.valore : undefined; };
    });
  }

  function scrivi(chiave, valore) {
    var valori = {};
    valori[chiave] = valore;
    return scriviPiu(valori);
  }

  // Più impostazioni in una transazione sola.
  function scriviPiu(valori) {
    return transazione('readwrite', function (tx) {
      var deposito = tx.objectStore('impostazioni');
      Object.keys(valori).forEach(function (chiave) { deposito.put({ chiave: chiave, valore: valori[chiave] }); });
    });
  }

  // ---- Appuntamenti del calendario ----

  // Tutti gli appuntamenti di un giorno ('2026-10-12'): le chiavi di quel giorno stanno tra "… 00" e "… 24".
  function appuntamentiDelGiorno(giorno) {
    return transazione('readonly', function (tx, esito) {
      var richiesta = tx.objectStore('appuntamenti').getAll(IDBKeyRange.bound(giorno + ' 00', giorno + ' 24'));
      richiesta.onsuccess = function () { esito.valore = richiesta.result; };
    });
  }

  function salvaAppuntamento(appuntamento) {
    return transazione('readwrite', function (tx) { tx.objectStore('appuntamenti').put(appuntamento); }, true);
  }

  function eliminaAppuntamento(chiave) {
    return transazione('readwrite', function (tx) { tx.objectStore('appuntamenti').delete(chiave); }, true);
  }

  // ---- Collegamento con il foglio dell'ufficio ----

  // Senza indirizzo della Web App l'app è in modalità prova: cantieri finti e invio simulato.
  function inProva() { return !globale.CONFIG.URL_WEB_APP; }

  // Il foglio ha risposto, ma male (pagina di errore, risposta non in JSON, "ok: false").
  // È diverso da un errore di rete: per il telefono "non c'è campo" e "il foglio è guasto"
  // sembrano uguali, e invece il secondo caso va segnalato all'ufficio.
  function ErroreFoglio(messaggio) {
    this.name = 'ErroreFoglio';
    this.message = messaggio;
  }
  ErroreFoglio.prototype = Object.create(Error.prototype);

  // Chiamata alla Web App di Google. Il POST usa "text/plain" apposta: così il browser
  // non fa la richiesta preliminare (preflight) che Apps Script non sa gestire.
  function chiama(metodo, parametri, corpo) {
    var url = globale.CONFIG.URL_WEB_APP;
    if (parametri) url += (url.indexOf('?') < 0 ? '?' : '&') + parametri;
    var controllo = new AbortController();
    var timer = setTimeout(function () { controllo.abort(); }, MILLISECONDI_ATTESA_RISPOSTA);
    var opzioni = { method: metodo, redirect: 'follow', signal: controllo.signal };
    if (corpo !== undefined) {
      opzioni.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
      opzioni.body = JSON.stringify(corpo);
    }
    return fetch(url, opzioni).then(function (risposta) {
      if (!risposta.ok) throw new ErroreFoglio('HTTP ' + risposta.status);
      return risposta.json().catch(function () { throw new ErroreFoglio('Risposta non in JSON'); });
    }).finally(function () { clearTimeout(timer); });
  }

  // Salva l'elenco dei cantieri solo se è cambiato (ogni scrittura è lavoro per il telefono).
  function salvaCantieri(cantieri) {
    return leggi('cantieri').then(function (vecchi) {
      var valori = { problemaCodice: false };
      if (JSON.stringify(vecchi || []) !== JSON.stringify(cantieri)) valori.cantieri = cantieri;
      return scriviPiu(valori);
    }).then(function () { return cantieri; });
  }

  // Scarica l'elenco dei cantieri attivi e lo tiene in memoria per quando manca la rete.
  function scaricaCantieri() {
    if (inProva()) return salvaCantieri(CANTIERI_FINTI);
    if (!navigator.onLine) return Promise.resolve(null);
    return leggi('codiceOperatore').then(function (codice) {
      if (!codice) return null;
      return chiama('GET', 'codice=' + encodeURIComponent(codice)).then(function (risposta) {
        if (!risposta.ok) {
          if (risposta.errore === 'codice') return scrivi('problemaCodice', true).then(function () { return null; });
          return null;
        }
        return salvaCantieri(Array.isArray(risposta.cantieri) ? risposta.cantieri : []);
      });
    }).catch(function () { return null; });
  }

  // Invia le note in attesa, un blocco alla volta. Una nota è "inviata" solo quando
  // il foglio ne conferma l'id: così un invio interrotto a metà non perde nulla.
  function inviaVero() {
    return Promise.all([leggi('codiceOperatore'), leggi('problemaCodice'), noteInAttesa()]).then(function (dati) {
      var codice = dati[0];
      var problemaCodice = dati[1] === true;
      var note = dati[2];
      // Con il codice rifiutato dal foglio non si insiste a ogni giro: si riprova dopo che
      // l'elenco dei cantieri è stato scaricato di nuovo con successo (riapertura dell'app).
      if (!codice || problemaCodice || !note.length) return;
      var blocco = note.slice(0, NOTE_PER_INVIO).map(function (nota) {
        return { id: nota.id, tipo: nota.tipo || 'nota', dataOraNota: nota.dataOraNota, cantiere: nota.cantiere, testo: nota.testo };
      });
      return chiama('POST', null, { codice: codice, note: blocco }).then(function (risposta) {
        if (!risposta.ok) {
          if (risposta.errore === 'codice') return scrivi('problemaCodice', true);
          throw new ErroreFoglio('Risposta: ' + risposta.errore);
        }
        return segnaEsito(risposta.ricevute || [], 'inviata')
          .then(function () { return segnaEsito(risposta.scartate || [], 'scartata'); })
          .then(sfoltisci)
          .then(function () { return scriviPiu({ problemaCodice: false, ultimoErroreInvio: 0 }); })
          .then(function () {
            if (note.length > blocco.length) return inviaVero();
          });
      }).catch(function (errore) {
        if (errore && errore.name === 'ErroreFoglio') {
          // Il foglio ha risposto male: lo si annota per la schermata iniziale, poi si rilancia.
          return scrivi('ultimoErroreInvio', Date.now()).then(function () { throw errore; });
        }
        throw errore;
      });
    });
  }

  function attendi(millisecondi) {
    return new Promise(function (risolvi) { setTimeout(risolvi, millisecondi); });
  }

  // Modalità prova: finge l'invio dopo un attimo, così si vede già come si comporta l'app.
  function inviaFinto() {
    return attendi(1200).then(noteInAttesa).then(function (note) {
      if (!note.length) return;
      return segnaEsito(note.map(function (nota) { return nota.id; }), 'inviata').then(sfoltisci);
    });
  }

  // Pagina e service worker possono voler spedire nello stesso momento:
  // il blocco li fa passare uno alla volta (dove il browser lo supporta).
  function conBlocco(lavoro) {
    if (navigator.locks && navigator.locks.request) return navigator.locks.request(NOME_BLOCCO_INVIO, lavoro);
    return lavoro();
  }

  var invioInCorso = null;
  var fallimentiFoglio = 0;   // risposte sbagliate di fila dal foglio
  var nonPrimaDi = 0;         // momento prima del quale non si riprova

  function azzeraAttesa() {
    fallimentiFoglio = 0;
    nonPrimaDi = 0;
  }

  // Prova a inviare le note in attesa. Si può chiamare quante volte si vuole: senza rete,
  // con un invio già in corso o durante la pausa dopo un guasto del foglio non fa niente.
  function invia() {
    if (invioInCorso) return invioInCorso;
    if (!navigator.onLine || Date.now() < nonPrimaDi) return Promise.resolve();
    invioInCorso = conBlocco(function () { return inProva() ? inviaFinto() : inviaVero(); })
      .then(azzeraAttesa, function (errore) {
        if (errore && errore.name === 'ErroreFoglio') {
          // Il foglio è guasto: inutile martellarlo, si aspetta sempre di più tra un tentativo e l'altro.
          fallimentiFoglio += 1;
          nonPrimaDi = Date.now() + Math.min(ATTESA_MASSIMA, ATTESA_MINIMA * Math.pow(2, fallimentiFoglio - 1));
        }
        // Errore di rete: si riprova al prossimo giro, senza attese.
      })
      .then(function () {
        invioInCorso = null;
        if (globale.Coda.alCambio) globale.Coda.alCambio();
      });
    return invioInCorso;
  }

  globale.Archivio = {
    salvaNota: salvaNota,
    noteInAttesa: noteInAttesa,
    contaInAttesa: contaInAttesa,
    leggi: leggi,
    scrivi: scrivi,
    appuntamentiDelGiorno: appuntamentiDelGiorno,
    salvaAppuntamento: salvaAppuntamento,
    eliminaAppuntamento: eliminaAppuntamento
  };

  globale.Coda = {
    invia: invia,
    scaricaCantieri: scaricaCantieri,
    inProva: inProva,
    // Da chiamare quando torna la rete o l'app torna in primo piano: cancella la pausa dopo un guasto.
    azzeraAttesa: azzeraAttesa,
    // La pagina mette qui una funzione da chiamare quando la coda cambia.
    alCambio: null
  };
})(self);
