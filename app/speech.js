// Diario Cantieri — dettatura vocale con la Web Speech API del browser.
// Un tocco avvia l'ascolto, un altro lo ferma. Android chiude il riconoscimento da solo dopo
// due o tre secondi di silenzio: qui lo si riapre subito, finché l'operatore non tocca "ferma",
// così può fare pause senza che la dettatura si interrompa. Il testo degli spezzoni si accoda.
// Per non restare acceso per sempre, l'ascolto si chiude da solo dopo due minuti senza una parola
// o dopo dieci minuti in tutto.
// Se qualcosa non va (niente rete, permesso negato, API assente) la pagina passa
// al microfono della tastiera, che c'è sempre.

(function (globale) {
  'use strict';

  var Riconoscimento = globale.SpeechRecognition || globale.webkitSpeechRecognition;
  // Modalità continua: Android tiene aperto il microfono attraverso le pause brevi e chiude solo dopo
  // silenzi più lunghi, quindi riapre meno volte e perde meno parole. In cambio dopo una pausa può
  // ripetere il testo già detto: "accoda" qui sotto scarta i doppioni. Se desse problemi: false.
  var CONTINUO = true;
  var MILLISECONDI_SILENZIO_MASSIMO = 2 * 60 * 1000;   // senza una parola per due minuti si chiude da solo
  var MILLISECONDI_ASCOLTO_MASSIMO = 10 * 60 * 1000;   // e comunque mai oltre dieci minuti
  var MILLISECONDI_CHIUSURA_FORZATA = 4000;            // se dopo "ferma" la fine non arriva, si chiude a forza
  var MILLISECONDI_SPEZZONE_A_VUOTO = 1500;            // uno spezzone chiuso subito e senza parole è "a vuoto"…
  var SPEZZONI_A_VUOTO_MASSIMI = 5;                    // …dopo cinque di fila qualcosa non va: si smette

  var sessione = null;   // l'ascolto in corso: uno solo alla volta, fatto di più riconoscitori in fila

  function disponibile() { return !!Riconoscimento; }

  function inAscolto() { return !!sessione; }

  function unisciPezzi(a, b) { return (a + ' ' + b).replace(/\s+/g, ' ').trim(); }

  function testoDi(s) { return unisciPezzi(s.precedente, s.corrente); }

  // Accoda un pezzo di trascrizione scartando i doppioni della modalità continua di Android:
  // dopo una pausa il pezzo nuovo può ripartire con tutto il testo già detto, o essere una
  // ripetizione esatta di quello appena arrivato.
  function accoda(acc, pezzo) {
    pezzo = String(pezzo || '').replace(/\s+/g, ' ').trim();
    if (!pezzo) return acc;
    if (!acc) return pezzo;
    var a = acc.toLowerCase();
    var p = pezzo.toLowerCase();
    if (p.indexOf(a) === 0) return pezzo;              // il pezzo nuovo contiene già tutto il precedente
    if (a.slice(-p.length) === p) return acc;          // ripetizione esatta della coda
    return acc + ' ' + pezzo;
  }

  // opzioni: alTesto(testo) mentre parla, allaFine(testo) quando ha finito,
  //          allErrore(codice, testo) se qualcosa è andato storto (il testo capito fin lì resta).
  // "testo" è sempre tutto quello capito dall'inizio del tocco.
  // Restituisce false se non è riuscito nemmeno a partire.
  function avvia(opzioni) {
    if (!Riconoscimento || sessione) return false;
    var s = {
      opzioni: opzioni,
      precedente: '',          // testo degli spezzoni già chiusi
      corrente: '',            // testo dello spezzone in corso
      riconoscitore: null,
      fermata: false,          // l'operatore ha toccato "ferma": niente più riaperture
      timerChiusura: null,
      inizio: Date.now(),
      ultimaParola: Date.now(),
      inizioSpezzone: 0,
      spezzoniAVuoto: 0
    };
    if (!apriSpezzone(s)) return false;
    sessione = s;
    return true;
  }

  // Apre un riconoscitore. Quando Android lo chiude, se l'operatore non ha fermato
  // e non c'è un errore vero, ne apre subito un altro che continua ad accodare.
  function apriSpezzone(s) {
    var r = new Riconoscimento();
    r.lang = 'it-IT';
    r.continuous = CONTINUO;
    r.interimResults = true;    // mostra le parole man mano che le capisce
    r.maxAlternatives = 1;

    var errore = null;
    var finito = false;
    s.corrente = '';
    s.inizioSpezzone = Date.now();

    r.onresult = function (evento) {
      // Il testo dello spezzone si ricostruisce ogni volta da tutti i risultati,
      // così non importa quante volte e in che forma arriva l'evento.
      var testo = '';
      for (var i = 0; i < evento.results.length; i++) testo = accoda(testo, evento.results[i][0].transcript);
      s.corrente = testo;
      if (s.corrente) s.ultimaParola = Date.now();
      s.opzioni.alTesto(testoDi(s));
    };

    r.onerror = function (evento) { errore = evento.error || 'sconosciuto'; };

    r.onend = function () {
      if (finito) return;
      finito = true;
      clearTimeout(s.timerChiusura);
      if (sessione !== s) return;   // annullata nel frattempo: non interessa più

      var aVuoto = !s.corrente && Date.now() - s.inizioSpezzone < MILLISECONDI_SPEZZONE_A_VUOTO;
      s.spezzoniAVuoto = aVuoto ? s.spezzoniAVuoto + 1 : 0;
      s.precedente = testoDi(s);
      s.corrente = '';

      // "no-speech" e "aborted" sono Android che chiude per il silenzio: non sono errori.
      // Gli altri (permesso negato, rete, microfono occupato) sì: la pagina passa alla tastiera.
      var grave = errore && errore !== 'no-speech' && errore !== 'aborted';
      var basta = s.fermata || grave
        || s.spezzoniAVuoto >= SPEZZONI_A_VUOTO_MASSIMI
        || Date.now() - s.ultimaParola > MILLISECONDI_SILENZIO_MASSIMO
        || Date.now() - s.inizio > MILLISECONDI_ASCOLTO_MASSIMO;
      if (!basta && apriSpezzone(s)) return;

      sessione = null;
      if (grave) s.opzioni.allErrore(errore, s.precedente);
      else if (s.spezzoniAVuoto >= SPEZZONI_A_VUOTO_MASSIMI) s.opzioni.allErrore('aborted', s.precedente);
      else if (!s.fermata && !s.precedente) s.opzioni.allErrore('no-speech', '');   // chiuso da solo senza una parola
      else s.opzioni.allaFine(s.precedente);
    };

    try { r.start(); } catch (e) { return false; }
    s.riconoscitore = r;
    return true;
  }

  // Ferma l'ascolto e lascia arrivare il risultato finale dello spezzone in corso.
  function ferma() {
    if (!sessione) return;
    var s = sessione;
    s.fermata = true;
    var r = s.riconoscitore;
    try { r.stop(); } catch (e) { /* già fermo */ }
    // Se la fine non arriva da sola, si chiude lo stesso dopo qualche secondo.
    clearTimeout(s.timerChiusura);
    s.timerChiusura = setTimeout(function () {
      if (sessione !== s) return;
      try { r.abort(); } catch (e) { /* già chiuso */ }
      r.onend();
    }, MILLISECONDI_CHIUSURA_FORZATA);
  }

  // Interrompe senza usare il risultato (quando si cambia schermata).
  function annulla() {
    if (!sessione) return;
    var s = sessione;
    sessione = null;
    clearTimeout(s.timerChiusura);
    var r = s.riconoscitore;
    // Niente più risultati né fine: un risultato in ritardo non deve riscrivere il testo.
    r.onresult = function () {};
    r.onend = function () {};
    try { r.abort(); } catch (e) { /* già chiuso */ }
  }

  globale.Dettatura = {
    disponibile: disponibile,
    inAscolto: inAscolto,
    avvia: avvia,
    ferma: ferma,
    annulla: annulla
  };
})(self);
