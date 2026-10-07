/** @OnlyCurrentDoc */
// Diario Cantieri — backend su Google Apps Script, legato al foglio Google dell'ufficio.
//
// Pubblicato come Web App ("Esegui come: me", "Accesso: chiunque"):
//   GET  …/exec?c=CODICE   → { ok: true, cantieri: [...] }                  elenco dei cantieri attivi
//   POST …/exec            → { ok: true, ricevute: [id...], scartate: [] }   riceve una o più note
// Ogni richiesta porta il codice segreto dell'operatore, controllato nel foglio nascosto "Operatori".
// Nel foglio c'è il menu "Diario Cantieri": "Prepara il foglio" e "Nuovo operatore…".

var NOME_CANTIERI = 'Cantieri';
var NOME_SEGNALAZIONI = 'Segnalazioni';
var NOME_OPERATORI = 'Operatori';
var NOME_CONFIG = 'Config';
var GENERALE = 'Generale';

var INTESTAZIONI = {};
INTESTAZIONI[NOME_CANTIERI] = ['nome', 'attivo', 'note'];
INTESTAZIONI[NOME_SEGNALAZIONI] = ['id', 'data_ora_nota', 'data_ora_ricezione', 'operatore', 'cantiere',
  'testo_originale', 'testo_corretto', 'stato_correzione', 'letto'];
INTESTAZIONI[NOME_OPERATORI] = ['codice', 'nome', 'attivo'];
INTESTAZIONI[NOME_CONFIG] = ['chiave', 'valore', 'note'];

var MAX_NOTE_PER_RICHIESTA = 50;
var MAX_LUNGHEZZA_TESTO = 5000;
var MAX_LUNGHEZZA_CANTIERE = 100;
var RIGHE_PREPARATE = 5000;   // quante righe preparare in anticipo (formati e tendine)

// ---------- Web App ----------

function doGet(e) {
  try {
    var codice = e && e.parameter ? e.parameter.c : '';
    if (!operatoreDaCodice(codice)) return rispostaJson({ ok: false, errore: 'codice' });
    return rispostaJson({ ok: true, cantieri: cantieriAttivi() });
  } catch (errore) {
    console.error('doGet: ' + errore);
    return rispostaJson({ ok: false, errore: 'server' });
  }
}

function doPost(e) {
  try {
    var dati = JSON.parse(e.postData.contents);
    var operatore = operatoreDaCodice(dati.codice);
    if (!operatore) return rispostaJson({ ok: false, errore: 'codice' });
    if (!Array.isArray(dati.note)) return rispostaJson({ ok: false, errore: 'richiesta' });
    var esito = aggiungiNote(operatore, dati.note.slice(0, MAX_NOTE_PER_RICHIESTA));
    return rispostaJson({ ok: true, ricevute: esito.ricevute, scartate: esito.scartate });
  } catch (errore) {
    console.error('doPost: ' + errore);
    return rispostaJson({ ok: false, errore: 'server' });
  }
}

function rispostaJson(oggetto) {
  return ContentService.createTextOutput(JSON.stringify(oggetto))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- Operatori e cantieri ----------

function operatoreDaCodice(codice) {
  codice = String(codice || '').trim();
  if (codice.length < 8) return null;
  var righe = valoriFoglio(NOME_OPERATORI);
  for (var i = 0; i < righe.length; i++) {
    if (String(righe[i][0]).trim() === codice && righe[i][2] === true) {
      return String(righe[i][1]).trim() || 'operatore';
    }
  }
  return null;
}

function cantieriAttivi() {
  var nomi = [];
  valoriFoglio(NOME_CANTIERI).forEach(function (riga) {
    var nome = String(riga[0]).trim();
    if (nome && riga[1] === true && nomi.indexOf(nome) < 0) nomi.push(nome);
  });
  return nomi;
}

// Valori di un foglio senza la riga di intestazione.
function valoriFoglio(nome) {
  var foglio = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
  if (!foglio || foglio.getLastRow() < 2) return [];
  return foglio.getRange(2, 1, foglio.getLastRow() - 1, foglio.getLastColumn()).getValues();
}

// ---------- Note ----------

function aggiungiNote(operatore, note) {
  var ricevute = [];
  var scartate = [];
  var pulite = [];
  note.forEach(function (nota) {
    var pulita = pulisciNota(nota);
    if (pulita) pulite.push(pulita);
    else if (nota && nota.id) scartate.push(String(nota.id));
  });
  if (!pulite.length) return { ricevute: ricevute, scartate: scartate };

  // Un solo invio alla volta scrive sul foglio: niente righe sovrapposte né doppioni.
  var blocco = LockService.getScriptLock();
  blocco.waitLock(30000);
  try {
    var foglio = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_SEGNALAZIONI);
    if (!foglio) throw new Error('Manca il foglio "' + NOME_SEGNALAZIONI + '": usa "Prepara il foglio"');

    var esistenti = {};
    if (foglio.getLastRow() >= 2) {
      foglio.getRange(2, 1, foglio.getLastRow() - 1, 1).getValues().forEach(function (riga) {
        esistenti[String(riga[0])] = true;
      });
    }

    var adesso = new Date();
    var righe = [];
    pulite.forEach(function (nota) {
      ricevute.push(nota.id);
      if (esistenti[nota.id]) return;   // già arrivata: il telefono l'ha solo rimandata
      esistenti[nota.id] = true;
      righe.push([nota.id, nota.dataOraNota, adesso, operatore, nota.cantiere, nota.testo, '', '', false]);
    });

    if (righe.length) {
      var prima = foglio.getLastRow() + 1;
      // Le colonne di testo restano testo: una nota che inizia con "=" o "+39" non diventa formula o numero.
      foglio.getRange(prima, 1, righe.length, 1).setNumberFormat('@');
      foglio.getRange(prima, 4, righe.length, 5).setNumberFormat('@');
      foglio.getRange(prima, 1, righe.length, righe[0].length).setValues(righe);
      foglio.getRange(prima, 9, righe.length, 1).insertCheckboxes();
      SpreadsheetApp.flush();
    }
  } finally {
    blocco.releaseLock();
  }
  return { ricevute: ricevute, scartate: scartate };
}

// Controlla e ripulisce una nota arrivata dal telefono; null se non è utilizzabile.
function pulisciNota(nota) {
  if (!nota || typeof nota !== 'object') return null;
  var id = String(nota.id || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return null;
  var testo = String(nota.testo || '').trim();
  if (!testo) return null;
  if (testo.length > MAX_LUNGHEZZA_TESTO) testo = testo.slice(0, MAX_LUNGHEZZA_TESTO);
  var cantiere = String(nota.cantiere || '').trim().slice(0, MAX_LUNGHEZZA_CANTIERE) || GENERALE;
  var data = new Date(nota.dataOraNota);
  if (isNaN(data.getTime())) data = new Date();
  return { id: id, testo: testo, cantiere: cantiere, dataOraNota: data };
}

// ---------- Menu e preparazione del foglio ----------

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Diario Cantieri')
    .addItem('Prepara il foglio', 'preparaFoglio')
    .addItem('Nuovo operatore…', 'nuovoOperatore')
    .addItem('Mostra / nascondi operatori', 'mostraNascondiOperatori')
    .addToUi();
}

// Crea (o completa) i fogli con intestazioni, formati, tendine e caselle. Si può rilanciare senza danni.
function preparaFoglio() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('Europe/Rome');
  ss.setSpreadsheetLocale('it_IT');

  var cantieri = assicuraFoglio(ss, NOME_CANTIERI);
  cantieri.getRange('B2:B200').insertCheckboxes();
  if (!contiene(cantieri, 1, GENERALE)) {
    scriviRiga(cantieri, [GENERALE, true, 'Sempre attivo: raccoglie le note senza cantiere. Per spostarle cambia il cantiere in "Segnalazioni".']);
  }
  spostaInAlto(cantieri, GENERALE);
  cantieri.setColumnWidth(1, 260);
  cantieri.setColumnWidth(3, 420);

  var segnalazioni = assicuraFoglio(ss, NOME_SEGNALAZIONI);
  segnalazioni.getRange('A2:A' + RIGHE_PREPARATE).setNumberFormat('@');
  segnalazioni.getRange('B2:C' + RIGHE_PREPARATE).setNumberFormat('dd/mm/yyyy hh:mm');
  segnalazioni.getRange('D2:H' + RIGHE_PREPARATE).setNumberFormat('@');
  segnalazioni.getRange('F2:G' + RIGHE_PREPARATE).setWrap(true);
  // Tendina dei cantieri: segnala un nome che non è in "Cantieri" ma non blocca lo script.
  var regola = SpreadsheetApp.newDataValidation()
    .requireValueInRange(cantieri.getRange('A2:A200'), true)
    .setAllowInvalid(true)
    .build();
  segnalazioni.getRange('E2:E' + RIGHE_PREPARATE).setDataValidation(regola);
  [60, 130, 130, 110, 200, 420, 420, 110, 60].forEach(function (larghezza, i) {
    segnalazioni.setColumnWidth(i + 1, larghezza);
  });

  var operatori = assicuraFoglio(ss, NOME_OPERATORI);
  operatori.getRange('C2:C200').insertCheckboxes();
  operatori.setColumnWidth(1, 220);
  operatori.hideSheet();

  var config = assicuraFoglio(ss, NOME_CONFIG);
  assicuraConfig(config, 'correzione_attiva', false, 'Correzione automatica del testo: spunta per attivarla (serve il codice della tappa 6)');
  assicuraConfig(config, 'url_app', 'https://volcangh.github.io/diario-cantieri/app/', 'Indirizzo dell\'app sul telefono: serve per creare i link degli operatori');
  config.setColumnWidth(1, 180);
  config.setColumnWidth(2, 420);
  config.setColumnWidth(3, 520);

  // Il foglio vuoto creato da Google non serve più.
  ss.getSheets().forEach(function (foglio) {
    if (/^(Foglio|Sheet) ?1$/i.test(foglio.getName()) && foglio.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(foglio);
    }
  });

  ss.setActiveSheet(segnalazioni);
  SpreadsheetApp.getUi().alert('Foglio pronto.\n\n1. Scrivi i cantieri nel foglio "Cantieri" e spunta "attivo".\n2. Metti l\'indirizzo dell\'app in "Config" → url_app.\n3. Crea gli operatori dal menu "Diario Cantieri → Nuovo operatore…".');
}

function assicuraFoglio(ss, nome) {
  var foglio = ss.getSheetByName(nome) || ss.insertSheet(nome);
  var intestazioni = INTESTAZIONI[nome];
  foglio.getRange(1, 1, 1, intestazioni.length).setValues([intestazioni]).setFontWeight('bold');
  foglio.setFrozenRows(1);
  return foglio;
}

// Prima riga con la colonna A vuota: "appendRow" non va bene perché le caselle di spunta
// preparate in anticipo contano come contenuto e la riga finirebbe in fondo.
function primaRigaLibera(foglio) {
  var valori = foglio.getRange(1, 1, Math.max(foglio.getLastRow(), 1), 1).getValues();
  for (var i = 0; i < valori.length; i++) {
    if (String(valori[i][0]).trim() === '') return i + 1;
  }
  return valori.length + 1;
}

// Scrive i valori nella prima riga libera e la restituisce.
function scriviRiga(foglio, valori) {
  var riga = primaRigaLibera(foglio);
  foglio.getRange(riga, 1, 1, valori.length).setValues([valori]);
  return riga;
}

// Se una riga è finita sotto le righe vuote (versioni precedenti), la riporta in alto.
function spostaInAlto(foglio, valore) {
  var colonna = foglio.getRange(1, 1, Math.max(foglio.getLastRow(), 1), 1).getValues();
  for (var i = 0; i < colonna.length; i++) {
    if (String(colonna[i][0]).trim().toLowerCase() !== String(valore).toLowerCase()) continue;
    var rigaAttuale = i + 1;
    var libera = primaRigaLibera(foglio);
    if (rigaAttuale <= libera) return;
    var dati = foglio.getRange(rigaAttuale, 1, 1, foglio.getLastColumn()).getValues();
    foglio.deleteRow(rigaAttuale);
    foglio.getRange(libera, 1, 1, dati[0].length).setValues(dati);
    return;
  }
}

function contiene(foglio, colonna, valore) {
  if (foglio.getLastRow() < 2) return false;
  return foglio.getRange(2, colonna, foglio.getLastRow() - 1, 1).getValues().some(function (riga) {
    return String(riga[0]).trim().toLowerCase() === String(valore).toLowerCase();
  });
}

function assicuraConfig(foglio, chiave, valore, nota) {
  if (contiene(foglio, 1, chiave)) return;
  var riga = scriviRiga(foglio, [chiave, valore, nota]);
  if (typeof valore === 'boolean') foglio.getRange(riga, 2).insertCheckboxes();
}

function leggiConfig(chiave) {
  var righe = valoriFoglio(NOME_CONFIG);
  for (var i = 0; i < righe.length; i++) {
    if (String(righe[i][0]).trim() === chiave) return righe[i][1];
  }
  return '';
}

// ---------- Operatori ----------

// Crea un operatore con un codice casuale e mostra il link da mandargli su WhatsApp.
function nuovoOperatore() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var operatori = ss.getSheetByName(NOME_OPERATORI);
  if (!operatori) {
    ui.alert('Prima usa "Diario Cantieri → Prepara il foglio".');
    return;
  }
  var risposta = ui.prompt('Nuovo operatore', 'Nome dell\'operatore (comparirà nel foglio accanto alle sue note):', ui.ButtonSet.OK_CANCEL);
  if (risposta.getSelectedButton() !== ui.Button.OK) return;
  var nome = risposta.getResponseText().trim();
  if (!nome) return;

  var codice = nuovoCodice();
  var riga = scriviRiga(operatori, [codice, nome, true]);
  operatori.getRange(riga, 3).insertCheckboxes();

  var url = String(leggiConfig('url_app')).trim();
  var link = url ? url + (url.indexOf('?') < 0 ? '?' : '&') + 'c=' + codice : '';
  var html = '<div style="font: 15px system-ui, Arial, sans-serif; line-height: 1.4">'
    + '<p>Operatore <b>' + scappa(nome) + '</b> creato.</p>'
    + (link
      ? '<p>Manda questo link su WhatsApp al suo telefono. Aprendolo <b>con Chrome</b> il telefono si collega da solo:</p>'
        + '<input id="link" readonly value="' + scappa(link) + '" style="width: 100%; font-size: 14px; padding: 6px" onclick="this.select()">'
        + '<p><button onclick="var c = document.getElementById(\'link\'); c.select(); document.execCommand(\'copy\'); this.textContent = \'Copiato\'">Copia il link</button></p>'
      : '<p style="color: #a80000">Manca l\'indirizzo dell\'app: scrivilo in "Config" → url_app e rifai "Nuovo operatore".</p>')
    + '<p style="color: #595959">Il link contiene il codice segreto dell\'operatore: non pubblicarlo. Per bloccare un operatore togli la spunta "attivo" nel foglio "Operatori" (menu → Mostra / nascondi operatori).</p>'
    + '</div>';
  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(560).setHeight(300), 'Link per ' + nome);
}

function mostraNascondiOperatori() {
  var foglio = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_OPERATORI);
  if (!foglio) return;
  if (foglio.isSheetHidden()) {
    foglio.showSheet();
    foglio.activate();
  } else {
    foglio.hideSheet();
  }
}

// Codice di 20 caratteri, senza lettere e cifre che si confondono (0/O, 1/I).
function nuovoCodice() {
  var alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var esadecimale = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  var codice = '';
  for (var i = 0; i < 20; i++) {
    codice += alfabeto.charAt(parseInt(esadecimale.substr(i * 3, 3), 16) % alfabeto.length);
  }
  return codice;
}

function scappa(testo) {
  return String(testo).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
