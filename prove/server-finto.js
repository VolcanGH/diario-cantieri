// Diario Cantieri — server locale per le prove sul computer.
//
// Fa due cose insieme:
//   1. serve la cartella del progetto come farà GitHub Pages → http://localhost:8765/app/
//      (a config.js viene cambiato al volo l'indirizzo della Web App, così l'app usa il finto backend);
//   2. finge il backend di Google Apps Script → http://localhost:8766/exec
//      con lo stesso contratto del vero (GET elenco cantieri, POST note, doppioni scartati,
//      risposta dopo un reindirizzamento 302 come fa davvero Apps Script).
//
// Uso (dalla cartella del progetto):  node prove/server-finto.js
// Per le prove:  GET /stato (note ricevute)   POST /azzera (svuota)   GET /guasto/on|off (il backend risponde 500)
//
// Codice operatore valido nel finto backend: PROVAPROVAPROVA1

const http = require('http');
const fs = require('fs');
const path = require('path');

const RADICE = path.join(__dirname, '..');
const PORTA_APP = Number(process.env.PORT) || 8765;
const PORTA_BACKEND = PORTA_APP + 1;
const URL_BACKEND = 'http://localhost:' + PORTA_BACKEND + '/exec';

const TIPI = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

// ---- 1. I file dell'app ----

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
    if (percorso.endsWith('/app/config.js')) {
      contenuto = Buffer.from(contenuto.toString('utf8').replace(/URL_WEB_APP:\s*'[^']*'/, "URL_WEB_APP: '" + URL_BACKEND + "'"));
    }
    risposta.writeHead(200, {
      'Content-Type': TIPI[path.extname(file)] || 'application/octet-stream',
      // In prova niente cache: si vede sempre l'ultima modifica.
      'Cache-Control': 'no-store'
    });
    risposta.end(contenuto);
  });
}).listen(PORTA_APP, () => {
  console.log('App in prova su http://localhost:' + PORTA_APP + '/app/  (backend finto: ' + URL_BACKEND + ')');
});

// ---- 2. Il finto backend ----

const OPERATORI = { PROVAPROVAPROVA1: 'Mario (prova)' };
const CANTIERI = ['Casa Rossi – Predazzo', 'Condominio Lagorai', 'Capannone Ziano'];
let note = [];
let guasto = false;
const risposteInAttesa = new Map();   // token → JSON, per imitare il 302 di Apps Script
let contatore = 0;

function json(risposta, codice, oggetto) {
  risposta.writeHead(codice, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  risposta.end(JSON.stringify(oggetto));
}

// Apps Script non risponde direttamente: rimanda (302) a un altro indirizzo da cui si legge la risposta.
function rispondiComeAppsScript(risposta, oggetto) {
  const token = 'r' + (++contatore);
  risposteInAttesa.set(token, oggetto);
  // Anche il reindirizzamento deve avere l'intestazione CORS, altrimenti il browser si ferma lì.
  risposta.writeHead(302, { Location: '/risposta/' + token, 'Access-Control-Allow-Origin': '*' });
  risposta.end();
}

function elaboraNote(dati) {
  const operatore = OPERATORI[String(dati.codice || '').trim()];
  if (!operatore) return { ok: false, errore: 'codice' };
  if (!Array.isArray(dati.note)) return { ok: false, errore: 'richiesta' };
  const ricevute = [];
  const scartate = [];
  for (const nota of dati.note) {
    const id = String(nota && nota.id || '').toLowerCase();
    if (!/^[0-9a-f-]{36}$/.test(id) || !String(nota.testo || '').trim()) { if (id) scartate.push(id); continue; }
    ricevute.push(id);
    if (note.some(n => n.id === id)) continue;   // doppione: già arrivata
    note.push({ id, dataOraNota: nota.dataOraNota, dataOraRicezione: new Date().toISOString(), operatore, cantiere: nota.cantiere || 'Generale', testo: nota.testo });
  }
  return { ok: true, ricevute, scartate };
}

http.createServer((richiesta, risposta) => {
  const url = new URL(richiesta.url, 'http://localhost');

  if (url.pathname.startsWith('/risposta/')) {
    const oggetto = risposteInAttesa.get(url.pathname.slice('/risposta/'.length));
    if (!oggetto) return json(risposta, 404, { ok: false, errore: 'scaduta' });
    return json(risposta, 200, oggetto);
  }
  if (url.pathname === '/stato') return json(risposta, 200, { note, guasto });
  if (url.pathname === '/azzera') { note = []; return json(risposta, 200, { ok: true }); }
  if (url.pathname.startsWith('/guasto/')) { guasto = url.pathname.endsWith('/on'); return json(risposta, 200, { guasto }); }

  if (url.pathname !== '/exec') return json(risposta, 404, { ok: false, errore: 'indirizzo' });
  if (guasto) { risposta.writeHead(500, { 'Access-Control-Allow-Origin': '*' }); return risposta.end('Errore finto'); }

  if (richiesta.method === 'GET') {
    const operatore = OPERATORI[String(url.searchParams.get('c') || '').trim()];
    return rispondiComeAppsScript(risposta, operatore ? { ok: true, cantieri: CANTIERI } : { ok: false, errore: 'codice' });
  }
  if (richiesta.method === 'POST') {
    let corpo = '';
    richiesta.on('data', pezzo => { corpo += pezzo; });
    richiesta.on('end', () => {
      let dati;
      try { dati = JSON.parse(corpo); } catch (e) { return rispondiComeAppsScript(risposta, { ok: false, errore: 'richiesta' }); }
      rispondiComeAppsScript(risposta, elaboraNote(dati));
    });
    return;
  }
  json(risposta, 405, { ok: false, errore: 'metodo' });
}).listen(PORTA_BACKEND);
