// Diario Cantieri — memoria del telefono (IndexedDB) e coda di invio.
// Ogni nota viene prima salvata qui e poi inviata: così non si perde mai.
// Questo file viene letto sia dalla pagina sia dal service worker: qui niente "window" o "document".

(function (globale) {
  'use strict';

  // Il nome ha il prefisso dell'app perché su GitHub Pages tutti i siti
  // dello stesso utente condividono la stessa memoria.
  var NOME_DB = 'diario-cantieri';
  var VERSIONE_DB = 1;
  var NOTE_INVIATE_DA_TENERE = 30;
  var NOTE_PER_INVIO = 20;
  var MILLISECONDI_ATTESA_RISPOSTA = 45000;

  var connessione = null;

  function apri() {
    if (connessione) return connessione;
    connessione = new Promise(function (risolvi, rifiuta) {
      var richiesta = indexedDB.open(NOME_DB, VERSIONE_DB);
      richiesta.onupgradeneeded = function () {
        var db = richiesta.result;
        if (!db.objectStoreNames.contains('note')) {
          // Una nota: { id, testo, cantiere, dataOraNota, stato: 'in_attesa' | 'inviata', tentativi }
          db.createObjectStore('note', { keyPath: 'id' }).createIndex('stato', 'stato');
        }
        if (!db.objectStoreNames.contains('impostazioni')) {
          // Coppie chiave/valore: codiceOperatore, cantieri, usoCantieri, problemaCodice…
          db.createObjectStore('impostazioni', { keyPath: 'chiave' });
        }
      };
      richiesta.onsuccess = function () { risolvi(richiesta.result); };
      richiesta.onerror = function () { connessione = null; rifiuta(richiesta.error); };
    });
    return connessione;
  }

  // Esegue "lavoro" dentro una transazione e risolve solo quando la transazione è davvero conclusa.
  function transazione(scrittura, lavoro) {
    return apri().then(function (db) {
      return new Promise(function (risolvi, rifiuta) {
        var depositi = ['note', 'impostazioni'];
        var tx;
        if (scrittura) {
          // "strict" = la scrittura è confermata solo quando è arrivata sul disco.
          try { tx = db.transaction(depositi, 'readwrite', { durability: 'strict' }); }
          catch (e) { tx = db.transaction(depositi, 'readwrite'); }
        } else {
          tx = db.transaction(depositi, 'readonly');
        }
        var esito = {};
        tx.oncomplete = function () { risolvi(esito.valore); };
        tx.onerror = function () { rifiuta(tx.error); };
        tx.onabort = function () { rifiuta(tx.error || new Error('Scrittura annullata')); };
        lavoro(tx, esito);
      });
    });
  }

  function perDataCrescente(a, b) { return a.dataOraNota < b.dataOraNota ? -1 : (a.dataOraNota > b.dataOraNota ? 1 : 0); }

  function leggiPerStato(stato) {
    return transazione(false, function (tx, esito) {
      var richiesta = tx.objectStore('note').index('stato').getAll(stato);
      richiesta.onsuccess = function () { esito.valore = richiesta.result; };
    });
  }

  function salvaNota(nota) {
    return transazione(true, function (tx) { tx.objectStore('note').put(nota); });
  }

  function noteInAttesa() {
    return leggiPerStato('in_attesa').then(function (note) { return note.sort(perDataCrescente); });
  }

  function contaInAttesa() {
    return transazione(false, function (tx, esito) {
      var richiesta = tx.objectStore('note').index('stato').count('in_attesa');
      richiesta.onsuccess = function () { esito.valore = richiesta.result; };
    });
  }

  function ultimeInviate(quante) {
    return leggiPerStato('inviata').then(function (note) {
      return note.sort(perDataCrescente).reverse().slice(0, quante);
    });
  }

  function segnaInviate(ids) {
    var adesso = new Date().toISOString();
    return transazione(true, function (tx) {
      var deposito = tx.objectStore('note');
      ids.forEach(function (id) {
        var richiesta = deposito.get(id);
        richiesta.onsuccess = function () {
          var nota = richiesta.result;
          if (nota && nota.stato !== 'inviata') {
            nota.stato = 'inviata';
            nota.inviataIl = adesso;
            deposito.put(nota);
          }
        };
      });
    });
  }

  // Delle note già inviate si tengono solo le più recenti: servono per l'elenco nella schermata iniziale.
  function sfoltisci() {
    return leggiPerStato('inviata').then(function (note) {
      var vecchie = note.sort(perDataCrescente).reverse().slice(NOTE_INVIATE_DA_TENERE);
      if (!vecchie.length) return;
      return transazione(true, function (tx) {
        vecchie.forEach(function (nota) { tx.objectStore('note').delete(nota.id); });
      });
    });
  }

  function leggi(chiave) {
    return transazione(false, function (tx, esito) {
      var richiesta = tx.objectStore('impostazioni').get(chiave);
      richiesta.onsuccess = function () { esito.valore = richiesta.result ? richiesta.result.valore : undefined; };
    });
  }

  function scrivi(chiave, valore) {
    return transazione(true, function (tx) { tx.objectStore('impostazioni').put({ chiave: chiave, valore: valore }); });
  }

  // ---- Collegamento con il foglio dell'ufficio ----

  // Senza indirizzo della Web App l'app è in modalità prova: cantieri finti e invio simulato.
  function inProva() { return !globale.CONFIG.URL_WEB_APP; }

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
      if (!risposta.ok) throw new Error('HTTP ' + risposta.status);
      return risposta.json();
    }).finally(function () { clearTimeout(timer); });
  }

  // Scarica l'elenco dei cantieri attivi e lo tiene in memoria per quando manca la rete.
  function scaricaCantieri() {
    if (inProva() || !navigator.onLine) return Promise.resolve(null);
    return leggi('codiceOperatore').then(function (codice) {
      if (!codice) return null;
      return chiama('GET', 'codice=' + encodeURIComponent(codice)).then(function (risposta) {
        if (!risposta || !risposta.ok) {
          if (risposta && risposta.errore === 'codice') return scrivi('problemaCodice', true).then(function () { return null; });
          return null;
        }
        var cantieri = Array.isArray(risposta.cantieri) ? risposta.cantieri : [];
        return scrivi('cantieri', cantieri)
          .then(function () { return scrivi('problemaCodice', false); })
          .then(function () { return cantieri; });
      });
    }).catch(function () { return null; });
  }

  // Invia le note in attesa, un blocco alla volta. Una nota è "inviata" solo quando
  // il foglio ne conferma l'id: così un invio interrotto a metà non perde nulla.
  function inviaVero() {
    if (!navigator.onLine) return Promise.resolve();
    return Promise.all([leggi('codiceOperatore'), noteInAttesa()]).then(function (dati) {
      var codice = dati[0];
      var note = dati[1];
      if (!codice || !note.length) return;
      var blocco = note.slice(0, NOTE_PER_INVIO).map(function (nota) {
        return { id: nota.id, dataOraNota: nota.dataOraNota, cantiere: nota.cantiere, testo: nota.testo, tipo: 'nota' };
      });
      return chiama('POST', null, { codice: codice, note: blocco }).then(function (risposta) {
        if (!risposta || !risposta.ok) {
          if (risposta && risposta.errore === 'codice') return scrivi('problemaCodice', true);
          throw new Error('Risposta non valida');
        }
        var confermate = (risposta.ricevute || []).concat(risposta.scartate || []);
        return segnaInviate(confermate)
          .then(sfoltisci)
          .then(function () { return scrivi('problemaCodice', false); })
          .then(function () { return scrivi('ultimoErroreInvio', 0); })
          .then(function () {
            if (note.length > blocco.length) return inviaVero();
          });
      }, function (errore) {
        // Si segna quando è fallito l'ultimo invio con la rete: serve alla schermata iniziale
        // per distinguere "non c'è campo" da "il foglio non risponde da un giorno".
        return scrivi('ultimoErroreInvio', Date.now()).then(function () { throw errore; });
      });
    });
  }

  var invioInCorso = null;

  function attendi(millisecondi) {
    return new Promise(function (risolvi) { setTimeout(risolvi, millisecondi); });
  }

  // Modalità prova: finge l'invio dopo un attimo, ma solo se c'è rete,
  // così si vede già come si comporta l'app senza campo.
  function inviaFinto() {
    if (!navigator.onLine) return Promise.resolve();
    return attendi(1200).then(noteInAttesa).then(function (note) {
      if (!note.length) return;
      return segnaInviate(note.map(function (nota) { return nota.id; })).then(sfoltisci);
    });
  }

  // Prova a inviare le note in attesa. Si può chiamare quante volte si vuole:
  // se un invio è già in corso non ne parte un secondo.
  function invia() {
    if (invioInCorso) return invioInCorso;
    invioInCorso = (inProva() ? inviaFinto() : inviaVero())
      .catch(function () { /* resta tutto in coda: si riprova più tardi */ })
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
    ultimeInviate: ultimeInviate,
    segnaInviate: segnaInviate,
    leggi: leggi,
    scrivi: scrivi
  };

  globale.Coda = {
    invia: invia,
    scaricaCantieri: scaricaCantieri,
    inProva: inProva,
    // La pagina mette qui una funzione da chiamare quando la coda cambia.
    alCambio: null
  };
})(self);
