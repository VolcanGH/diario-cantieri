// Diario Cantieri — server locale per le prove sul computer.
// Serve la cartella del progetto così com'è, come farà GitHub Pages: l'app si apre su
//   http://localhost:8765/app/
// Uso (dalla cartella del progetto):  node prove/server-finto.js

const http = require('http');
const fs = require('fs');
const path = require('path');

const RADICE = path.join(__dirname, '..');
const PORTA = Number(process.env.PORT) || 8765;

const TIPI = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

http.createServer((richiesta, risposta) => {
  let percorso = decodeURIComponent(new URL(richiesta.url, 'http://localhost').pathname);
  if (percorso.endsWith('/')) percorso += 'index.html';
  const file = path.join(RADICE, percorso);

  // Non si esce mai dalla cartella del progetto.
  if (!file.startsWith(RADICE + path.sep)) {
    risposta.writeHead(403);
    risposta.end();
    return;
  }

  fs.readFile(file, (errore, contenuto) => {
    if (errore) {
      risposta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      risposta.end('Non trovato');
      return;
    }
    risposta.writeHead(200, {
      'Content-Type': TIPI[path.extname(file)] || 'application/octet-stream',
      // In prova niente cache: si vede sempre l'ultima modifica.
      'Cache-Control': 'no-store'
    });
    risposta.end(contenuto);
  });
}).listen(PORTA, () => {
  console.log('Diario Cantieri in prova su http://localhost:' + PORTA + '/app/');
});
