// Diario Cantieri — dettatura vocale con la Web Speech API del browser.
// Un tocco avvia l'ascolto, un altro lo ferma; dopo una pausa Android lo ferma da solo.
// Se qualcosa non va (niente rete, permesso negato, API assente) la pagina passa
// al microfono della tastiera, che c'è sempre.

(function (globale) {
  'use strict';

  var Riconoscimento = globale.SpeechRecognition || globale.webkitSpeechRecognition;
  var attivo = null;          // il riconoscitore in corso, uno solo alla volta
  var chiusuraForzata = null;

  function disponibile() { return !!Riconoscimento; }

  function inAscolto() { return !!attivo; }

  // opzioni: alTesto(testo) mentre parla, allaFine(testo) quando ha finito,
  //          allErrore(codice, testo) se qualcosa è andato storto.
  // Restituisce false se non è riuscito nemmeno a partire.
  function avvia(opzioni) {
    if (!Riconoscimento || attivo) return false;

    var r = new Riconoscimento();
    r.lang = 'it-IT';
    r.continuous = false;       // la modalità continua su Android duplica il testo (bug noto)
    r.interimResults = true;    // mostra le parole man mano che le capisce
    r.maxAlternatives = 1;

    var testo = '';
    var errore = null;
    var finito = false;

    r.onresult = function (evento) {
      // Il testo si ricostruisce ogni volta da tutti i risultati,
      // così non importa quante volte e in che forma arriva l'evento.
      var pezzi = [];
      for (var i = 0; i < evento.results.length; i++) pezzi.push(evento.results[i][0].transcript);
      testo = pezzi.join(' ').replace(/\s+/g, ' ').trim();
      opzioni.alTesto(testo);
    };

    r.onerror = function (evento) { errore = evento.error || 'sconosciuto'; };

    r.onend = function () {
      if (finito) return;
      finito = true;
      clearTimeout(chiusuraForzata);
      if (attivo === r) attivo = null;
      if (errore && errore !== 'aborted') opzioni.allErrore(errore, testo);
      else opzioni.allaFine(testo);
    };

    try { r.start(); } catch (e) { return false; }
    attivo = r;
    return true;
  }

  // Ferma l'ascolto e lascia arrivare il risultato finale.
  function ferma() {
    if (!attivo) return;
    var r = attivo;
    try { r.stop(); } catch (e) { /* già fermo */ }
    // Se la fine non arriva da sola, si chiude lo stesso dopo qualche secondo.
    clearTimeout(chiusuraForzata);
    chiusuraForzata = setTimeout(function () {
      if (attivo !== r) return;
      try { r.abort(); } catch (e) { /* già chiuso */ }
      r.onend();
    }, 4000);
  }

  // Interrompe senza usare il risultato (quando si cambia schermata).
  function annulla() {
    if (!attivo) return;
    var r = attivo;
    attivo = null;
    clearTimeout(chiusuraForzata);
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
