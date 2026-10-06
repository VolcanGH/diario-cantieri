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

  // ---- Coda di invio ----

  var invioInCorso = null;

  function attendi(millisecondi) {
    return new Promise(function (risolvi) { setTimeout(risolvi, millisecondi); });
  }

  // Modalità prova (CONFIG.URL_WEB_APP vuoto): finge l'invio dopo un attimo, ma solo se c'è rete,
  // così si vede già come si comporta l'app senza campo. L'invio vero arriva con il backend.
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
    invioInCorso = inviaFinto()
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
    // La pagina mette qui una funzione da chiamare quando la coda cambia.
    alCambio: null
  };
})(self);
