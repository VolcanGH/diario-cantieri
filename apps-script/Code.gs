/** @OnlyCurrentDoc */
// Diario Cantieri — backend su Google Apps Script, legato al foglio Google dell'ufficio.
//
// Pubblicato come Web App ("Esegui come: me", "Accesso: chiunque"):
//   GET  …/exec?codice=CODICE → { ok: true, cantieri: [...] }               elenco dei cantieri attivi
//   (il nome "c" NON si può usare: per Apps Script è riservato e la chiamata risponde "file non trovato")
//   POST …/exec            → { ok: true, ricevute: [id...], scartate: [] }   riceve una o più note
// Ogni richiesta porta il codice segreto dell'operatore, controllato nel foglio nascosto "Operatori".
// Nel foglio c'è il menu "Diario Cantieri": "Prepara il foglio" e "Nuovo operatore…".

var NOME_CANTIERI = 'Cantieri';
var NOME_SEGNALAZIONI = 'Segnalazioni';
var NOME_OPERATORI = 'Operatori';
var NOME_CONFIG = 'Config';
var GENERALE = 'Generale';

var FOGLI_DI_SISTEMA = [NOME_CANTIERI, NOME_SEGNALAZIONI, NOME_OPERATORI, NOME_CONFIG];

var INTESTAZIONI = {};
INTESTAZIONI[NOME_CANTIERI] = ['nome', 'attivo', 'note'];
INTESTAZIONI[NOME_SEGNALAZIONI] = ['id', 'data_ora_nota', 'data_ora_ricezione', 'operatore', 'cantiere',
  'testo_originale', 'testo_corretto', 'stato_correzione', 'letto'];
INTESTAZIONI[NOME_OPERATORI] = ['codice', 'nome', 'attivo'];
INTESTAZIONI[NOME_CONFIG] = ['chiave', 'valore', 'note'];

// Numero di colonna (1 = A) di ogni intestazione di "Segnalazioni": il codice non usa numeri a memoria,
// così aggiungere una colonna in futuro non rompe niente.
var COL = {};
INTESTAZIONI[NOME_SEGNALAZIONI].forEach(function (nome, i) { COL[nome] = i + 1; });

var MAX_NOTE_PER_RICHIESTA = 50;
var MAX_LUNGHEZZA_TESTO = 20000;
var MAX_LUNGHEZZA_CANTIERE = 100;
var RIGHE_CASELLE = 200;      // righe con la casella "attivo" pronta in Cantieri e Operatori
var VERSIONE_SCRIPT = 4;      // compare nelle risposte: serve a capire quale versione è pubblicata

// ---------- Web App ----------

function doGet(e) {
  try {
    var codice = e && e.parameter ? e.parameter.codice : '';
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
  oggetto.versione = VERSIONE_SCRIPT;
  return ContentService.createTextOutput(JSON.stringify(oggetto))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- Lettura dei fogli ----------

function foglio(nome) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
}

function lettera(colonna) {
  return String.fromCharCode(64 + colonna);   // 1 → A (vale fino alla colonna Z)
}

// Valori di un foglio senza la riga di intestazione, solo le colonne previste.
function valoriFoglio(nome) {
  var f = foglio(nome);
  if (!f || f.getLastRow() < 2) return [];
  return f.getRange(2, 1, f.getLastRow() - 1, INTESTAZIONI[nome].length).getValues();
}

// Prima riga (di dati) il cui valore nella colonna è uguale a "valore"; null se non c'è.
function cercaRiga(nomeFoglio, colonna, valore, ignoraMaiuscole) {
  var cercato = String(valore).trim();
  if (ignoraMaiuscole) cercato = cercato.toLowerCase();
  var righe = valoriFoglio(nomeFoglio);
  for (var i = 0; i < righe.length; i++) {
    var presente = String(righe[i][colonna - 1]).trim();
    if (ignoraMaiuscole) presente = presente.toLowerCase();
    if (presente === cercato) return righe[i];
  }
  return null;
}

// ---------- Operatori e cantieri ----------

function operatoreDaCodice(codice) {
  codice = String(codice || '').trim();
  if (codice.length < 8) return null;
  var riga = cercaRiga(NOME_OPERATORI, 1, codice, false);
  if (!riga || riga[2] !== true) return null;
  return String(riga[1]).trim() || 'operatore';
}

function cantieriAttivi() {
  var nomi = [];
  valoriFoglio(NOME_CANTIERI).forEach(function (riga) {
    var nome = String(riga[0]).trim();
    if (nome && riga[1] === true && nomi.indexOf(nome) < 0) nomi.push(nome);
  });
  return nomi;
}

function leggiConfig(chiave) {
  var riga = cercaRiga(NOME_CONFIG, 1, chiave, false);
  return riga ? riga[1] : '';
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
  var cantieriNuovi = [];
  try {
    var f = foglio(NOME_SEGNALAZIONI);
    if (!f) throw new Error('Manca il foglio "' + NOME_SEGNALAZIONI + '": usa "Prepara il foglio"');

    // Una sola lettura della colonna id: serve per i doppioni e per trovare dove scrivere.
    var ids = colonnaId(f);
    var esistenti = {};
    ids.forEach(function (id) { if (id) esistenti[id.toLowerCase()] = true; });

    var adesso = new Date();
    var righe = [];
    pulite.forEach(function (nota) {
      ricevute.push(nota.idOriginale);
      if (esistenti[nota.id]) return;   // già arrivata: il telefono l'ha solo rimandata
      esistenti[nota.id] = true;
      var riga = [];
      riga[COL.id - 1] = nota.id;
      riga[COL.data_ora_nota - 1] = nota.dataOraNota;
      riga[COL.data_ora_ricezione - 1] = adesso;
      riga[COL.operatore - 1] = operatore;
      riga[COL.cantiere - 1] = nota.cantiere;
      riga[COL.testo_originale - 1] = nota.testo;
      riga[COL.testo_corretto - 1] = '';
      riga[COL.stato_correzione - 1] = '';
      riga[COL.letto - 1] = false;
      righe.push(riga);
      if (cantieriNuovi.indexOf(nota.cantiere) < 0) cantieriNuovi.push(nota.cantiere);
    });

    if (righe.length) {
      var prima = primaRigaLiberaPer(ids, righe.length);
      f.getRange(prima, 1, righe.length, righe[0].length).setValues(righe);
      f.getRange(prima, COL.letto, righe.length, 1).insertCheckboxes();
      SpreadsheetApp.flush();
    }
  } finally {
    blocco.releaseLock();
  }

  // Alla prima nota di un cantiere nasce il suo foglio. Se qualcosa va storto qui, le note
  // sono comunque salvate: non deve far fallire la risposta al telefono.
  try {
    assicuraFogliPerCantieri(cantieriNuovi);
  } catch (errore) {
    console.error('fogli per cantiere: ' + errore);
  }
  return { ricevute: ricevute, scartate: scartate };
}

// Colonna degli id di "Segnalazioni" dalla riga 2 all'ultima riga usata (compresi i vuoti).
function colonnaId(f) {
  var ultima = f.getLastRow();
  if (ultima < 2) return [];
  return f.getRange(2, COL.id, ultima - 1, 1).getValues().map(function (riga) { return String(riga[0]).trim(); });
}

// Prima riga da cui ci sono "quante" righe libere di seguito; se non c'è un buco così grande,
// la riga dopo l'ultima. Serve perché le caselle di spunta trascinate giù dall'ufficio
// contano come righe piene per getLastRow(): le note non devono finire sotto righe vuote.
function primaRigaLiberaPer(ids, quante) {
  var inizio = -1;
  for (var i = 0; i < ids.length; i++) {
    if (ids[i]) { inizio = -1; continue; }
    if (inizio < 0) inizio = i;
    if (i - inizio + 1 >= quante) return inizio + 2;
  }
  return (inizio >= 0 ? inizio : ids.length) + 2;
}

// Controlla e ripulisce una nota arrivata dal telefono; null se non è utilizzabile.
function pulisciNota(nota) {
  if (!nota || typeof nota !== 'object') return null;
  var idOriginale = String(nota.id || '').trim();
  var id = idOriginale.toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return null;
  // Per ora esiste un solo tipo di registrazione: gli altri verranno con i prossimi moduli.
  var tipo = String(nota.tipo || 'nota').trim().toLowerCase();
  if (tipo !== 'nota') return null;
  var testo = String(nota.testo || '').trim();
  if (!testo) return null;
  if (testo.length > MAX_LUNGHEZZA_TESTO) testo = testo.slice(0, MAX_LUNGHEZZA_TESTO);
  var cantiere = String(nota.cantiere || '').trim().slice(0, MAX_LUNGHEZZA_CANTIERE) || GENERALE;
  var data = new Date(nota.dataOraNota);
  if (isNaN(data.getTime())) data = new Date();
  return { id: id, idOriginale: idOriginale, tipo: tipo, testo: testo, cantiere: cantiere, dataOraNota: data };
}

// ---------- Fogli per cantiere ----------

// Nome di foglio valido a partire dal nome del cantiere (Google vieta le parentesi quadre, * ? / \ e i due punti).
function nomeFoglioPerCantiere(cantiere) {
  var nome = String(cantiere).replace(/[\[\]*?\/\\:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
  if (!nome) nome = GENERALE;
  if (FOGLI_DI_SISTEMA.some(function (sistema) { return sistema.toLowerCase() === nome.toLowerCase(); })) nome += ' (cantiere)';
  return nome;
}

// Il foglio di un cantiere si riconosce da "Cantiere:" in A1 e dal nome esatto in B1,
// non dal nome della scheda: due cantieri diversi possono dare lo stesso nome di scheda.
function eFoglioDelCantiere(f, cantiere) {
  var celle = f.getRange('A1:B1').getValues()[0];
  return String(celle[0]) === 'Cantiere:' && String(celle[1]) === cantiere;
}

function formulaFoglioCantiere() {
  var da = lettera(COL.data_ora_nota);
  var a = lettera(COL.letto);
  var cantiere = lettera(COL.cantiere);
  var scelte = [COL.data_ora_nota, COL.operatore, COL.testo_originale, COL.testo_corretto]
    .map(function (colonna) { return colonna - COL.data_ora_nota + 1; });
  // Separatore ";": funziona con qualsiasi lingua del foglio. FILTER e non QUERY, perché QUERY
  // si rompe con gli apostrofi nei nomi e con i testi che sembrano numeri. TRIM: un nome scritto
  // con uno spazio in più in "Cantieri" deve trovare lo stesso le sue note.
  return '=IFNA(SORT(CHOOSECOLS(FILTER(' + NOME_SEGNALAZIONI + '!' + da + '2:' + a + '; TRIM('
    + NOME_SEGNALAZIONI + '!' + cantiere + '2:' + cantiere + ') = $B$1); ' + scelte.join('; ')
    + '); 1; FALSE); "Nessuna nota per questo cantiere")';
}

// Crea il foglio del cantiere se non esiste, o lo ripara se qualcuno ha toccato intestazione
// e formula. Si può chiamare quante volte si vuole.
function assicuraFoglioCantiere(cantiere) {
  cantiere = String(cantiere || '').trim();
  if (!cantiere) return null;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var nome = nomeFoglioPerCantiere(cantiere);

  var f = ss.getSheetByName(nome);
  if (!(f && eFoglioDelCantiere(f, cantiere))) {
    // Non c'è col nome atteso: forse esiste con un altro nome (collisione risolta in passato).
    f = null;
    var fogli = ss.getSheets();
    for (var i = 0; i < fogli.length; i++) {
      if (FOGLI_DI_SISTEMA.indexOf(fogli[i].getName()) < 0 && eFoglioDelCantiere(fogli[i], cantiere)) { f = fogli[i]; break; }
    }
  }

  if (!f) {
    // Nome libero: i nomi delle schede sono unici senza distinzione tra maiuscole e minuscole.
    var occupati = {};
    ss.getSheets().forEach(function (s) { occupati[s.getName().toLowerCase()] = true; });
    var candidato = nome;
    for (var n = 2; occupati[candidato.toLowerCase()]; n++) candidato = nome + ' (' + n + ')';
    f = ss.insertSheet(candidato);
    f.getRange('A1').setValue('Cantiere:').setFontWeight('bold');
    f.getRange('B1').setNumberFormat('@').setValue(cantiere).setFontWeight('bold');
    f.getRange('A2').setValue('Foglio automatico: non scrivere qui. Per spostare una nota cambia il cantiere nel foglio "' + NOME_SEGNALAZIONI + '".')
      .setFontStyle('italic').setFontColor('#595959');
    f.getRange('A4:D4').setValues([['data_ora_nota', 'operatore', 'testo_originale', 'testo_corretto']]).setFontWeight('bold');
    f.getRange('A5:A').setNumberFormat('dd/mm/yyyy hh:mm');
    f.getRange('C5:D').setWrap(true);
    [130, 110, 420, 420].forEach(function (larghezza, i) { f.setColumnWidth(i + 1, larghezza); });
    f.setFrozenRows(4);
    // Avviso (non blocco) se qualcuno prova a scrivere qui.
    f.protect().setDescription('Foglio automatico del cantiere').setWarningOnly(true);
  }

  // La formula va rimessa se manca o è stata cambiata: "Prepara il foglio" ripara anche questo.
  var formula = formulaFoglioCantiere();
  if (f.getRange('A5').getFormula() !== formula) f.getRange('A5').setFormula(formula);
  return f;
}

// Un foglio per ciascuno dei cantieri elencati (senza ripetizioni).
function assicuraFogliPerCantieri(cantieri) {
  var visti = {};
  cantieri.forEach(function (cantiere) {
    cantiere = String(cantiere || '').trim();
    if (cantiere && !visti[cantiere]) {
      visti[cantiere] = true;
      assicuraFoglioCantiere(cantiere);
    }
  });
}

// Tutti i cantieri presenti in "Segnalazioni" hanno il loro foglio.
function assicuraTuttiIFogliCantiere() {
  assicuraFogliPerCantieri(valoriFoglio(NOME_SEGNALAZIONI).map(function (riga) { return riga[COL.cantiere - 1]; }));
}

// Quando l'ufficio cambia il cantiere di una nota (colonna "cantiere" di "Segnalazioni")
// il foglio del cantiere nuovo nasce se non c'è; i fogli si aggiornano da soli.
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var f = e.range.getSheet();
    if (f.getName() !== NOME_SEGNALAZIONI) return;
    if (e.range.getColumn() > COL.cantiere || e.range.getLastColumn() < COL.cantiere) return;
    var valori = f.getRange(e.range.getRow(), COL.cantiere, e.range.getNumRows(), 1).getValues();
    assicuraFogliPerCantieri(valori.map(function (riga) { return riga[0]; }));
    // Creare un foglio lo porta in primo piano: si torna dove l'ufficio stava lavorando.
    f.activate();
  } catch (errore) {
    console.error('onEdit: ' + errore);
  }
}

// ---------- Menu e preparazione del foglio ----------

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Diario Cantieri')
    .addItem('Prepara il foglio', 'preparaFoglio')
    .addItem('Nuovo operatore…', 'nuovoOperatore')
    .addItem('Mostra / nascondi operatori', 'mostraNascondiOperatori')
    .addToUi();
}

// Crea (o completa) i fogli con intestazioni, formati, tendine e caselle.
// Si può rilanciare senza danni: non tocca dati e spunte esistenti.
function preparaFoglio() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('Europe/Rome');
  ss.setSpreadsheetLocale('it_IT');

  var cantieri = assicuraFoglio(ss, NOME_CANTIERI);
  // I nomi restano testo: un cantiere chiamato "2419" non deve diventare un numero.
  cantieri.getRange('A2:A').setNumberFormat('@');
  assicuraCaselle(cantieri, 2, 2, RIGHE_CASELLE);
  if (!cercaRiga(NOME_CANTIERI, 1, GENERALE, true)) {
    var rigaGenerale = scriviRiga(cantieri, [GENERALE, '', 'Sempre attivo: raccoglie le note senza cantiere. Per spostarle cambia il cantiere in "' + NOME_SEGNALAZIONI + '".']);
    segnaSpunta(cantieri, rigaGenerale, 2);
  }
  cantieri.setColumnWidth(1, 260);
  cantieri.setColumnWidth(3, 420);

  var segnalazioni = assicuraFoglio(ss, NOME_SEGNALAZIONI);
  var c = function (nomeColonna) { return lettera(COL[nomeColonna]); };
  // Formati su tutta la colonna, così non c'è un limite di righe oltre il quale spariscono.
  segnalazioni.getRange(c('id') + '2:' + c('id')).setNumberFormat('@');
  segnalazioni.getRange(c('data_ora_nota') + '2:' + c('data_ora_ricezione')).setNumberFormat('dd/mm/yyyy hh:mm');
  segnalazioni.getRange(c('operatore') + '2:' + c('stato_correzione')).setNumberFormat('@');
  segnalazioni.getRange(c('testo_originale') + '2:' + c('testo_corretto')).setWrap(true);
  // Tendina dei cantieri: segnala un nome che non è in "Cantieri" ma non blocca lo script.
  var regola = SpreadsheetApp.newDataValidation()
    .requireValueInRange(cantieri.getRange('A2:A'), true)
    .setAllowInvalid(true)
    .build();
  segnalazioni.getRange(c('cantiere') + '2:' + c('cantiere')).setDataValidation(regola);
  [60, 130, 130, 110, 200, 420, 420, 110, 60].forEach(function (larghezza, i) {
    segnalazioni.setColumnWidth(i + 1, larghezza);
  });

  var operatori = assicuraFoglio(ss, NOME_OPERATORI);
  assicuraCaselle(operatori, 3, 2, RIGHE_CASELLE);
  operatori.setColumnWidth(1, 220);
  operatori.hideSheet();

  var config = assicuraFoglio(ss, NOME_CONFIG);
  assicuraConfig(config, 'correzione_attiva', false, 'Correzione automatica del testo: spunta per attivarla (serve il codice della tappa 6)');
  assicuraConfig(config, 'url_app', 'https://volcangh.github.io/diario-cantieri/app/', 'Indirizzo dell\'app sul telefono: serve per creare i link degli operatori. Non cambiarlo.');
  config.setColumnWidth(1, 180);
  config.setColumnWidth(2, 420);
  config.setColumnWidth(3, 520);

  // Il foglio vuoto creato da Google non serve più.
  ss.getSheets().forEach(function (f) {
    if (/^(Foglio|Sheet) ?1$/i.test(f.getName()) && f.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(f);
    }
  });

  assicuraTuttiIFogliCantiere();

  ss.setActiveSheet(segnalazioni);
  SpreadsheetApp.getUi().alert('Foglio pronto.\n\n1. Scrivi i cantieri nel foglio "' + NOME_CANTIERI + '" e spunta "attivo".\n2. Crea gli operatori dal menu "Diario Cantieri → Nuovo operatore…" e manda a ciascuno il suo link.');
}

function assicuraFoglio(ss, nome) {
  var f = ss.getSheetByName(nome) || ss.insertSheet(nome);
  var intestazioni = INTESTAZIONI[nome];
  f.getRange(1, 1, 1, intestazioni.length).setValues([intestazioni]).setFontWeight('bold');
  f.setFrozenRows(1);
  return f;
}

// Prima riga con la colonna A vuota: "appendRow" non va bene perché le caselle di spunta
// preparate in anticipo contano come contenuto e la riga finirebbe in fondo.
function primaRigaLibera(f) {
  var valori = f.getRange(1, 1, Math.max(f.getLastRow(), 1), 1).getValues();
  for (var i = 0; i < valori.length; i++) {
    if (String(valori[i][0]).trim() === '') return i + 1;
  }
  return valori.length + 1;
}

// Scrive i valori nella prima riga libera e la restituisce.
function scriviRiga(f, valori) {
  var riga = primaRigaLibera(f);
  f.getRange(riga, 1, 1, valori.length).setValues([valori]);
  return riga;
}

// Mette le caselle di spunta solo nelle celle ancora vuote: inserire una casella in una cella
// la azzera, quindi rilanciare "Prepara il foglio" non deve toccare le spunte già date.
function assicuraCaselle(f, colonna, daRiga, aRiga) {
  var valori = f.getRange(daRiga, colonna, aRiga - daRiga + 1, 1).getValues();
  var inizio = -1;
  for (var i = 0; i <= valori.length; i++) {
    var vuota = i < valori.length && valori[i][0] === '';
    if (vuota && inizio < 0) inizio = i;
    if (!vuota && inizio >= 0) {
      f.getRange(daRiga + inizio, colonna, i - inizio, 1).insertCheckboxes();
      inizio = -1;
    }
  }
}

// Casella spuntata in una cella (prima la casella, poi il valore: l'ordine inverso la azzererebbe).
function segnaSpunta(f, riga, colonna) {
  var cella = f.getRange(riga, colonna);
  cella.insertCheckboxes();
  cella.setValue(true);
}

function assicuraConfig(f, chiave, valore, nota) {
  if (cercaRiga(NOME_CONFIG, 1, chiave, false)) return;
  var riga = scriviRiga(f, [chiave, typeof valore === 'boolean' ? '' : valore, nota]);
  if (typeof valore === 'boolean') {
    f.getRange(riga, 2).insertCheckboxes();
    if (valore) f.getRange(riga, 2).setValue(true);
  }
}

// ---------- Operatori ----------

// Crea un operatore con un codice casuale e mostra il link da mandargli su WhatsApp.
function nuovoOperatore() {
  var ui = SpreadsheetApp.getUi();
  var operatori = foglio(NOME_OPERATORI);
  if (!operatori) {
    ui.alert('Prima usa "Diario Cantieri → Prepara il foglio".');
    return;
  }
  var risposta = ui.prompt('Nuovo operatore', 'Nome dell\'operatore (comparirà nel foglio accanto alle sue note):', ui.ButtonSet.OK_CANCEL);
  if (risposta.getSelectedButton() !== ui.Button.OK) return;
  var nome = risposta.getResponseText().trim();
  if (!nome) return;

  var codice = nuovoCodice();
  var riga = scriviRiga(operatori, [codice, nome, '']);
  segnaSpunta(operatori, riga, 3);

  var url = String(leggiConfig('url_app')).trim();
  var link = url ? url + (url.indexOf('?') < 0 ? '?' : '&') + 'c=' + codice : '';
  var html = '<div style="font: 15px system-ui, Arial, sans-serif; line-height: 1.4">'
    + '<p>Operatore <b>' + scappa(nome) + '</b> creato.</p>'
    + (link
      ? '<p>Manda questo link su WhatsApp al suo telefono. Aprendolo <b>con Chrome</b> il telefono si collega da solo:</p>'
        + '<input id="link" readonly value="' + scappa(link) + '" style="width: 100%; font-size: 14px; padding: 6px" onclick="this.select()">'
        + '<p><button onclick="var c = document.getElementById(\'link\'); c.select(); document.execCommand(\'copy\'); this.textContent = \'Copiato\'">Copia il link</button></p>'
      : '<p style="color: #a80000">Manca l\'indirizzo dell\'app: scrivilo in "' + NOME_CONFIG + '" → url_app e rifai "Nuovo operatore".</p>')
    + '<p style="color: #595959">Il link contiene il codice segreto dell\'operatore: non pubblicarlo. Per bloccare un operatore togli la spunta "attivo" nel foglio "' + NOME_OPERATORI + '" (menu → Mostra / nascondi operatori).</p>'
    + '</div>';
  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(560).setHeight(300), 'Link per ' + nome);
}

function mostraNascondiOperatori() {
  var f = foglio(NOME_OPERATORI);
  if (!f) return;
  if (f.isSheetHidden()) {
    f.showSheet();
    f.activate();
  } else {
    f.hideSheet();
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
