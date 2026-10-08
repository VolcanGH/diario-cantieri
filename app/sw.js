// Diario Cantieri — service worker: fa aprire l'app anche senza rete.
// Tiene in cache i file dell'app; le chiamate al foglio Google passano sempre dalla rete.
// Quando esce una versione nuova (cambia CONFIG.VERSIONE in config.js) la cache vecchia viene buttata.

importScripts('config.js', 'db.js');

var NOME_CACHE = 'diario-cantieri-v' + self.CONFIG.VERSIONE;
var FILE_APP = [
  './', 'index.html', 'stile.css', 'config.js', 'db.js', 'speech.js', 'app.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', function (evento) {
  evento.waitUntil(
    caches.open(NOME_CACHE).then(function (cache) {
      // cache: 'reload' = scarica davvero dalla rete, saltando la cache del browser
      // (GitHub Pages tiene i file per 10 minuti: senza questo si rischia di salvare la versione vecchia).
      return Promise.all(FILE_APP.map(function (file) {
        return fetch(new Request(file, { cache: 'reload' })).then(function (risposta) {
          if (!risposta.ok) throw new Error('Impossibile scaricare ' + file);
          return cache.put(file, risposta);
        });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (evento) {
  evento.waitUntil(
    caches.keys().then(function (nomi) {
      return Promise.all(nomi
        .filter(function (nome) { return nome.indexOf('diario-cantieri-') === 0 && nome !== NOME_CACHE; })
        .map(function (nome) { return caches.delete(nome); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (evento) {
  var richiesta = evento.request;
  if (richiesta.method !== 'GET') return;
  // Il foglio Google (e qualsiasi altro sito) va sempre in rete.
  if (new URL(richiesta.url).origin !== self.location.origin) return;

  evento.respondWith(
    caches.open(NOME_CACHE).then(function (cache) {
      // ignoreSearch: il link personale "…/?c=CODICE" deve aprire la stessa pagina salvata.
      return cache.match(richiesta, { ignoreSearch: true }).then(function (salvata) {
        if (salvata) return salvata;
        if (richiesta.mode === 'navigate') return cache.match('./');
        return fetch(richiesta);
      });
    }).catch(function () { return fetch(richiesta); })
  );
});

// Invio in background (Chrome su Android): quando torna la rete le note partono anche ad app chiusa.
// Se restano note in attesa si lancia un errore apposta: così il browser riprova più tardi.
self.addEventListener('sync', function (evento) {
  if (evento.tag !== 'invia-note') return;
  evento.waitUntil(
    self.Coda.invia()
      .then(function () { return self.Archivio.contaInAttesa(); })
      .then(function (inAttesa) {
        if (inAttesa > 0) throw new Error('Note ancora in attesa');
      })
  );
});
