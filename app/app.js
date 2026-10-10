// Diario Cantieri — schermate e navigazione.
// Due flussi: Inizio → Racconta → Quale cantiere? → Nota salvata → Inizio
//          e  Inizio → Calendario → casella di un'ora → Racconta (la stessa schermata) → Calendario.

(function () {
  'use strict';

  var GENERALE = 'Generale';
  var CHIAVE_BOZZA = 'diario-cantieri:bozza';
  var CHIAVE_BOZZA_INIZIO = 'diario-cantieri:bozza-inizio';
  var CHIAVE_BOZZA_UFFICIO = 'diario-cantieri:bozza-ufficio';
  var PRIMA_ORA = 7;        // il calendario va dalle 7…
  var ULTIMA_ORA = 19;      // …alle 19, a caselle di un'ora (7–8, 8–9 … 18–19)
  var DOMENICA = 0;         // getDay() della domenica: il calendario la salta
  var GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  var MILLISECONDI_CONFERMA = 3000;
  var MILLISECONDI_ANTI_DOPPIO_TOCCO = 400;
  var MILLISECONDI_AVVISO_MICROFONO = 2500;
  var MILLISECONDI_ASCOLTO_MINIMO = 700;
  var MILLISECONDI_RITENTATIVO = 60000;
  var MILLISECONDI_UN_GIORNO = 24 * 60 * 60 * 1000;
  var MILLISECONDI_SEI_ORE = 6 * 60 * 60 * 1000;
  var MILLISECONDI_CONTROLLO_VERSIONE = 15 * 60 * 1000;

  function $(id) { return document.getElementById(id); }

  var el = {
    nuova: $('btn-nuova'),
    calendario: $('btn-calendario'),
    calendarioOggi: $('calendario-oggi'),
    statoInvio: $('stato-invio'),
    versione: $('versione'),
    racconta: $('schermo-racconta'),
    raccontaTitolo: $('racconta-titolo'),
    microfono: $('btn-microfono'),
    microfonoTesto: $('microfono-testo'),
    microfonoSotto: $('microfono-sotto'),
    aiuto: $('aiuto-tastiera'),
    testo: $('testo'),
    raccontaAvviso: $('racconta-avviso'),
    ufficio: $('btn-ufficio'),
    elimina: $('btn-elimina'),
    annulla: $('btn-annulla'),
    avanti: $('btn-avanti'),
    elenco: $('elenco-cantieri'),
    avviso: $('avviso-cantiere'),
    generale: $('btn-generale'),
    conferma: $('schermo-conferma'),
    confermaTitolo: $('conferma-titolo'),
    confermaCantiere: $('conferma-cantiere'),
    confermaAttesa: $('conferma-attesa'),
    giornoPrima: $('btn-giorno-prima'),
    giornoDopo: $('btn-giorno-dopo'),
    giornoNome: $('giorno-nome'),
    giornoData: $('giorno-data'),
    elencoOre: $('elenco-ore'),
    calendarioChiudi: $('btn-calendario-chiudi'),
    domandaTitolo: $('domanda-titolo'),
    domandaNo: $('btn-domanda-no'),
    domandaSi: $('btn-domanda-si')
  };

  var stato = {
    schermo: 'home',
    cambioIl: 0,
    guardia: false,
    ignoraPop: false,
    rimettiGuardia: false,
    salvataggio: false,
    modalita: 'nota',        // cosa si sta scrivendo in "Racconta": 'nota' oppure 'appuntamento'
    testoIniziale: '',       // testo con cui si è aperta "Racconta": se non è cambiato, Annulla non chiede niente
    perUfficio: false,
    appuntamento: null,      // { giorno, ora } della casella aperta dal calendario
    giorno: null,            // giorno mostrato nel calendario
    azioneSi: null,          // cosa fare se nella schermata "domanda" si risponde sì
    timerConferma: null,
    timerMicrofono: null,
    ascoltoDa: 0,
    erroriPermesso: 0,
    registrazioneSW: null,
    ultimoControlloVersione: 0
  };

  // ---- Utilità ----

  function vibra() {
    if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) { /* non supportata */ } }
  }

  function due(n) { return (n < 10 ? '0' : '') + n; }

  function maiuscola(testo) { return testo.charAt(0).toUpperCase() + testo.slice(1); }

  function inizioGiorno(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  function spostaGiorni(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

  // '2026-10-12': è la forma con cui i giorni sono scritti nella memoria del telefono.
  function chiaveGiorno(d) { return d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate()); }

  function nomeGiorno(d) { return GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()]; }

  function etichettaOra(ora) { return ora + '–' + (ora + 1); }

  // ---- Bozza: il testo della nota si salva da solo mentre si detta ----
  // Se arriva una telefonata e l'app si chiude, alla riapertura il testo è ancora lì.
  // Sta in localStorage e non in IndexedDB perché si scrive a ogni tasto e la scrittura
  // è immediata: anche se l'app viene chiusa un istante dopo, il testo c'è.
  // Insieme al testo si salva quando è iniziata la nota: è quella l'ora che va in ufficio.
  // Gli appuntamenti del calendario non hanno bozza: sono corti e si riscrivono in un attimo.

  function leggiBozza() {
    try { return localStorage.getItem(CHIAVE_BOZZA) || ''; } catch (e) { return ''; }
  }

  function inizioBozza() {
    try { return localStorage.getItem(CHIAVE_BOZZA_INIZIO) || ''; } catch (e) { return ''; }
  }

  function salvaBozza(testo) {
    try {
      localStorage.setItem(CHIAVE_BOZZA, testo);
      if (testo.trim() && !localStorage.getItem(CHIAVE_BOZZA_INIZIO)) {
        localStorage.setItem(CHIAVE_BOZZA_INIZIO, new Date().toISOString());
      }
    } catch (e) { /* memoria non disponibile */ }
  }

  function cancellaBozza() {
    try {
      localStorage.removeItem(CHIAVE_BOZZA);
      localStorage.removeItem(CHIAVE_BOZZA_INIZIO);
      localStorage.removeItem(CHIAVE_BOZZA_UFFICIO);
    } catch (e) { /* memoria non disponibile */ }
  }

  // L'interruttore "Da fare per l'ufficio" fa parte della bozza: se l'app si chiude a metà, si ritrova acceso.
  function impostaPerUfficio(acceso) {
    stato.perUfficio = !!acceso;
    el.ufficio.classList.toggle('attivo', stato.perUfficio);
    el.ufficio.setAttribute('aria-pressed', stato.perUfficio ? 'true' : 'false');
    try {
      if (stato.perUfficio) localStorage.setItem(CHIAVE_BOZZA_UFFICIO, '1');
      else localStorage.removeItem(CHIAVE_BOZZA_UFFICIO);
    } catch (e) { /* memoria non disponibile */ }
  }

  function bozzaPerUfficio() {
    try { return localStorage.getItem(CHIAVE_BOZZA_UFFICIO) === '1'; } catch (e) { return false; }
  }

  // ---- Schermate ----

  function mostra(nome) {
    var schermi = document.querySelectorAll('.schermo');
    for (var i = 0; i < schermi.length; i++) {
      schermi[i].classList.toggle('attivo', schermi[i].id === 'schermo-' + nome);
    }
    stato.schermo = nome;
    stato.cambioIl = Date.now();
    window.scrollTo(0, 0);
  }

  // Anti doppio tocco: per un attimo dopo il cambio di schermata i tocchi vengono ignorati,
  // così un tocco doppio con i guanti non preme per sbaglio un pulsante della schermata successiva.
  document.addEventListener('click', function (evento) {
    if (Date.now() - stato.cambioIl < MILLISECONDI_ANTI_DOPPIO_TOCCO) {
      evento.stopPropagation();
      evento.preventDefault();
    }
  }, true);

  // ---- Tasto Indietro di Android ----
  // Fuori dalla schermata iniziale si tiene una "guardia" nella cronologia: il tasto Indietro
  // la consuma e l'app decide cosa fare, invece di chiudersi con una nota a metà.
  // C'è una guardia sola per volta: la mette la prima schermata dopo l'inizio (Racconta o Calendario)
  // e le schermate successive la riusano.

  function mettiGuardia() {
    if (stato.ignoraPop) { stato.rimettiGuardia = true; return; }
    history.pushState({ guardia: true }, '');
    stato.guardia = true;
  }

  function togliGuardia() {
    if (!stato.guardia) return;
    stato.guardia = false;
    stato.ignoraPop = true;
    history.back();
  }

  window.addEventListener('popstate', function () {
    if (stato.ignoraPop) {
      // Ritorno voluto dall'app, non dal tasto Indietro.
      stato.ignoraPop = false;
      if (stato.rimettiGuardia) { stato.rimettiGuardia = false; mettiGuardia(); }
      return;
    }
    stato.guardia = false;
    if (stato.schermo === 'cantiere' || stato.schermo === 'domanda') {
      tornaARacconta();
      mettiGuardia();
    } else if (stato.schermo === 'racconta') {
      annulla(true);
    } else if (stato.schermo === 'calendario') {
      chiudiCalendario();
    }
  });

  // ---- Schermata iniziale ----

  function aggiornaHome() {
    Promise.all([
      Archivio.noteInAttesa(),
      Archivio.leggi('problemaCodice'),
      Archivio.leggi('ultimoErroreInvio')
    ]).then(function (dati) {
      var note = dati[0];
      var n = note.length;
      var problemaCodice = dati[1] === true;
      var ultimoErrore = dati[2] || 0;
      // Nota ferma da più di un giorno e il foglio che ha risposto male di recente:
      // visto dal telefono è uguale a "non c'è campo", ma qui serve l'ufficio.
      var ferma = n > 0
        && Date.now() - new Date(note[0].dataOraNota).getTime() > MILLISECONDI_UN_GIORNO
        && Date.now() - ultimoErrore < MILLISECONDI_SEI_ORE;
      var testo;
      if (problemaCodice || ferma) {
        testo = n > 0 ? 'Note salvate sul telefono. Per farle partire chiama l\'ufficio.'
          : 'Il telefono non è riconosciuto. Chiama l\'ufficio.';
      } else {
        testo = n === 0 ? 'Tutto inviato ✓' : (n === 1 ? '1 nota in attesa di rete' : n + ' note in attesa di rete');
      }
      el.statoInvio.textContent = testo;
      el.statoInvio.classList.toggle('stato-attesa', n > 0 || problemaCodice);
    }).catch(function () {
      el.statoInvio.textContent = 'La memoria del telefono non risponde. Chiama l\'ufficio.';
      el.statoInvio.classList.add('stato-attesa');
    });

    aggiornaCalendarioOggi();
  }

  // Nel pulsante "Calendario" si legge il prossimo appuntamento di oggi (anche quello in corso):
  // è il promemoria dell'app, perché una web app chiusa non può suonare come una sveglia.
  function aggiornaCalendarioOggi() {
    var adesso = new Date();
    Archivio.appuntamentiDelGiorno(chiaveGiorno(adesso)).then(function (lista) {
      var prossimi = lista
        .filter(function (a) { return a.ora >= adesso.getHours(); })
        .sort(function (a, b) { return a.ora - b.ora; });
      if (prossimi.length) el.calendarioOggi.textContent = 'Oggi alle ' + prossimi[0].ora + ' · ' + prossimi[0].testo;
      else el.calendarioOggi.textContent = lista.length ? 'Oggi niente altro' : 'Oggi niente in programma';
      el.calendarioOggi.hidden = false;
    }).catch(function () { el.calendarioOggi.hidden = true; });
  }

  // ---- Schermata "Racconta" ----
  // Serve a due cose: scrivere una nota (poi si sceglie il cantiere) e scrivere un appuntamento
  // (poi si torna al calendario). "stato.modalita" dice quale delle due.

  function aggiornaAvanti() {
    el.avanti.disabled = !el.testo.value.trim();
  }

  // A ogni modifica del testo: la nota salva la bozza, l'appuntamento no.
  function testoCambiato() {
    if (stato.modalita === 'nota') salvaBozza(el.testo.value);
    aggiornaAvanti();
  }

  // Parte comune all'apertura di "Racconta".
  function preparaRacconta() {
    aggiornaAvanti();
    el.racconta.classList.remove('con-tastiera');
    el.aiuto.hidden = true;
    el.raccontaAvviso.hidden = true;
    // Ogni volta si riparte con il microfono dell'app: un rifiuto passeggero non lo spegne per sempre.
    stato.erroriPermesso = 0;
    impostaMicrofono('pronto');
    mostra('racconta');
  }

  function apriRacconta() {
    vibra();
    stato.modalita = 'nota';
    stato.testoIniziale = '';
    el.raccontaTitolo.hidden = true;
    el.ufficio.hidden = false;
    el.elimina.hidden = true;
    el.avanti.textContent = 'Avanti';
    el.testo.value = leggiBozza();
    impostaPerUfficio(bozzaPerUfficio());
    preparaRacconta();
    mettiGuardia();
  }

  // Ripiego: si usa il microfono della tastiera del telefono.
  function usaTastiera() {
    el.racconta.classList.add('con-tastiera');
    el.aiuto.hidden = false;
    el.testo.focus();
    // Cursore in fondo, così il testo nuovo si accoda a quello che c'è già.
    var fine = el.testo.value.length;
    try { el.testo.setSelectionRange(fine, fine); } catch (e) { /* non indispensabile */ }
  }

  // Si lascia "Racconta": la nota torna all'inizio, l'appuntamento torna al calendario.
  function chiudiRacconta() {
    fermaDettatura();
    el.testo.value = '';
    el.testo.blur();
    if (stato.modalita === 'appuntamento') {
      mostra('calendario');
      // Arrivando dal tasto Indietro la guardia è stata consumata: va rimessa.
      if (!stato.guardia) mettiGuardia();
      disegnaGiorno();
    } else {
      cancellaBozza();
      togliGuardia();
      mostra('home');
      aggiornaHome();
    }
  }

  // "Annulla" o il tasto Indietro: se c'è del testo nuovo si chiede conferma prima di buttarlo via.
  function annulla(daIndietro) {
    if (!daIndietro) vibra();
    fermaDettatura();
    var testo = el.testo.value.trim();
    if (testo && testo !== stato.testoIniziale) {
      el.testo.blur();
      chiedi('Butto via quello che hai scritto?', 'No, torna al testo', 'Sì, butta via', chiudiRacconta);
    } else {
      chiudiRacconta();
    }
  }

  function avanti() {
    if (stato.modalita === 'appuntamento') salvaAppuntamento();
    else apriCantieri();
  }

  // ---- Dettatura ----

  // Etichette del pulsante microfono nei vari momenti.
  function impostaMicrofono(fase) {
    clearTimeout(stato.timerMicrofono);
    el.microfono.classList.toggle('ascolto', fase === 'ascolto');
    el.microfonoSotto.hidden = fase !== 'ascolto';
    if (fase === 'ascolto') {
      el.microfonoTesto.textContent = 'Sto ascoltando…';
      el.microfonoSotto.textContent = 'tocca per fermare';
    } else if (fase === 'chiusura') {
      el.microfonoTesto.textContent = 'Un attimo…';
    } else if (fase === 'niente') {
      el.microfonoTesto.textContent = 'Non ho sentito niente';
      stato.timerMicrofono = setTimeout(function () { impostaMicrofono('pronto'); }, MILLISECONDI_AVVISO_MICROFONO);
    } else {
      el.microfonoTesto.textContent = 'Tocca per parlare';
    }
  }

  // Accoda il testo dettato a quello già presente, con lo spazio e la maiuscola giusti.
  function unisci(base, aggiunta) {
    if (!aggiunta) return base;
    var prima = base.replace(/\s+$/, '');
    if (!prima) return maiuscola(aggiunta);
    if (/[.!?]$/.test(prima)) return prima + ' ' + maiuscola(aggiunta);
    return prima + ' ' + aggiunta;
  }

  // Mette nel testo quello che è stato capito finora (anche a metà).
  function completaDettatura(base, testo) {
    el.testo.value = unisci(base, testo);
    testoCambiato();
    el.testo.scrollTop = el.testo.scrollHeight;
  }

  // Interrompe l'ascolto quando si lascia la schermata; il testo già comparso resta.
  function fermaDettatura() {
    if (Dettatura.inAscolto()) Dettatura.annulla();
    impostaMicrofono('pronto');
  }

  function toccaMicrofono() {
    vibra();
    if (Dettatura.inAscolto()) {
      // Un secondo tocco subito dopo il primo è quasi sempre un doppio tocco involontario.
      if (Date.now() - stato.ascoltoDa < MILLISECONDI_ASCOLTO_MINIMO) return;
      impostaMicrofono('chiusura');
      Dettatura.ferma();
      return;
    }
    // Senza API, senza rete o con il permesso negato si passa subito alla tastiera:
    // farlo dentro il tocco è l'unico modo per far aprire la tastiera da sola.
    if (!Dettatura.disponibile() || stato.erroriPermesso >= 2 || !navigator.onLine) {
      usaTastiera();
      return;
    }
    var base = el.testo.value;
    var partito = Dettatura.avvia({
      alTesto: function (testo) { completaDettatura(base, testo); },
      allaFine: function (testo) {
        completaDettatura(base, testo);
        stato.erroriPermesso = 0;
        impostaMicrofono('pronto');
      },
      allErrore: function (codice, testo) {
        completaDettatura(base, testo);
        if (codice === 'no-speech') { impostaMicrofono('niente'); return; }
        // "not-allowed" arriva sia col permesso negato sia col microfono occupato:
        // si rinuncia all'ascolto in-app solo se succede due volte di fila.
        if (codice === 'not-allowed' || codice === 'service-not-allowed') stato.erroriPermesso += 1;
        impostaMicrofono('pronto');
        usaTastiera();
      }
    });
    if (partito) {
      stato.ascoltoDa = Date.now();
      impostaMicrofono('ascolto');
    } else {
      usaTastiera();
    }
  }

  // ---- Schermata "Quale cantiere?" ----

  function disegnaCantieri(nomi, uso) {
    var ordinati = nomi
      .filter(function (nome) { return nome.toLowerCase() !== GENERALE.toLowerCase(); })
      .map(function (nome, posizione) { return { nome: nome, posizione: posizione, usatoIl: uso[nome] || 0 }; })
      // Prima gli ultimi usati; a parità, l'ordine dell'ufficio.
      .sort(function (a, b) { return (b.usatoIl - a.usatoIl) || (a.posizione - b.posizione); });

    el.elenco.textContent = '';
    ordinati.forEach(function (cantiere) {
      var pulsante = document.createElement('button');
      pulsante.type = 'button';
      pulsante.className = 'btn btn-cantiere';
      pulsante.textContent = cantiere.nome;
      pulsante.addEventListener('click', function () { scegliCantiere(cantiere.nome); });
      el.elenco.appendChild(pulsante);
    });
  }

  function apriCantieri() {
    if (!el.testo.value.trim()) return;
    vibra();
    fermaDettatura();
    el.testo.blur();
    el.avviso.hidden = true;
    // Se la memoria non si legge, la schermata si apre lo stesso: "Non so / Generale" basta a non perdere la nota.
    Promise.all([
      Archivio.leggi('cantieri').catch(function () { return null; }),
      Archivio.leggi('usoCantieri').catch(function () { return null; })
    ]).then(function (dati) {
      disegnaCantieri(dati[0] || [], dati[1] || {});
      mostra('cantiere');
      el.elenco.scrollTop = 0;
    });
  }

  function segnaUso(nome) {
    return Archivio.leggi('usoCantieri').then(function (uso) {
      uso = uso || {};
      uso[nome] = Date.now();
      return Archivio.scrivi('usoCantieri', uso);
    }).catch(function () { /* l'ordine degli ultimi usati non è indispensabile */ });
  }

  // Il tocco su un cantiere salva e invia subito, senza altre conferme.
  function scegliCantiere(nome) {
    var testo = el.testo.value.trim();
    if (stato.salvataggio || !testo) return;
    stato.salvataggio = true;
    vibra();
    var nota = {
      id: crypto.randomUUID(),
      // "nota" va in Segnalazioni; "richiesta" (da fare per l'ufficio) va in Richieste.
      tipo: stato.perUfficio ? 'richiesta' : 'nota',
      testo: testo,
      cantiere: nome,
      // Momento in cui la nota è stata iniziata (non quello dell'invio, né quello del tocco finale).
      dataOraNota: inizioBozza() || new Date().toISOString(),
      stato: 'in_attesa'
    };
    Archivio.salvaNota(nota).then(function () {
      cancellaBozza();
      el.testo.value = '';
      if (nome !== GENERALE) segnaUso(nome);
      mostraConferma(nome, nota.tipo);
      Coda.invia();
    }, function () {
      // Il testo resta dov'è: può riprovare.
      el.avviso.hidden = false;
    }).then(sbloccaSalvataggio, sbloccaSalvataggio);
  }

  function sbloccaSalvataggio() { stato.salvataggio = false; }

  // ---- Schermata "Nota salvata" ----

  function mostraConferma(nome, tipo) {
    el.confermaTitolo.textContent = tipo === 'richiesta' ? 'Richiesta salvata' : 'Nota salvata';
    el.confermaCantiere.textContent = 'Cantiere: ' + nome;
    el.confermaAttesa.hidden = navigator.onLine;
    mostra('conferma');
    togliGuardia();
    clearTimeout(stato.timerConferma);
    stato.timerConferma = setTimeout(tornaHome, MILLISECONDI_CONFERMA);
  }

  function tornaHome() {
    clearTimeout(stato.timerConferma);
    mostra('home');
    aggiornaHome();
  }

  // ---- Schermata "domanda": un sì o un no a tutto schermo ----

  function chiedi(titolo, testoNo, testoSi, seSi) {
    el.domandaTitolo.textContent = titolo;
    el.domandaNo.textContent = testoNo;
    el.domandaSi.textContent = testoSi;
    stato.azioneSi = seSi;
    mostra('domanda');
    if (!stato.guardia) mettiGuardia();
  }

  function tornaARacconta() {
    stato.azioneSi = null;
    mostra('racconta');
  }

  function rispondiSi() {
    vibra();
    var azione = stato.azioneSi;
    stato.azioneSi = null;
    if (azione) azione();
  }

  // ---- Calendario ----
  // Gli appuntamenti dell'operatore: dal lunedì al sabato, caselle di un'ora dalle 7 alle 19.
  // Restano solo sul telefono (IndexedDB), in ufficio non arriva niente.

  // La domenica non c'è: si passa al lunedì.
  function giornoDiCalendario(d) {
    return d.getDay() === DOMENICA ? spostaGiorni(d, 1) : d;
  }

  function apriCalendario() {
    vibra();
    stato.giorno = giornoDiCalendario(inizioGiorno(new Date()));
    mostra('calendario');
    mettiGuardia();
    disegnaGiorno();
  }

  function chiudiCalendario() {
    togliGuardia();
    mostra('home');
    aggiornaHome();
  }

  function cambiaGiorno(passo) {
    vibra();
    var nuovo = spostaGiorni(stato.giorno, passo);
    if (nuovo.getDay() === DOMENICA) nuovo = spostaGiorni(nuovo, passo);
    stato.giorno = nuovo;
    disegnaGiorno();
  }

  // Intestazione su due righe: "Oggi · sabato" (o "Lunedì") e sotto "10 ottobre".
  function intestazioneGiorno(d) {
    var distanza = Math.round((d - inizioGiorno(new Date())) / MILLISECONDI_UN_GIORNO);
    var nome = GIORNI[d.getDay()];
    if (distanza === 0) nome = 'Oggi · ' + nome;
    else if (distanza === 1) nome = 'Domani · ' + nome;
    else if (distanza === -1) nome = 'Ieri · ' + nome;
    else nome = maiuscola(nome);
    return { nome: nome, data: d.getDate() + ' ' + MESI[d.getMonth()] };
  }

  function rigaOra(ora, testo, adesso) {
    var riga = document.createElement('button');
    riga.type = 'button';
    riga.className = 'btn riga-ora' + (testo ? ' piena' : '') + (adesso ? ' adesso' : '');
    var etichetta = document.createElement('span');
    etichetta.className = 'ora';
    etichetta.textContent = etichettaOra(ora);
    var contenuto = document.createElement('span');
    contenuto.className = 'riga-testo';
    contenuto.textContent = testo;
    riga.appendChild(etichetta);
    riga.appendChild(contenuto);
    riga.addEventListener('click', function () { apriAppuntamento(ora, testo); });
    return riga;
  }

  // Disegna il giorno scelto: una riga per ora, con il testo dell'appuntamento se c'è.
  function disegnaGiorno() {
    var giorno = stato.giorno;
    var capo = intestazioneGiorno(giorno);
    el.giornoNome.textContent = capo.nome;
    el.giornoData.textContent = capo.data;
    el.elencoOre.textContent = '';
    Archivio.appuntamentiDelGiorno(chiaveGiorno(giorno)).catch(function () { return []; }).then(function (lista) {
      if (giorno !== stato.giorno) return;   // nel frattempo si è passati a un altro giorno
      var testi = {};
      lista.forEach(function (a) { testi[a.ora] = a.testo; });
      var adesso = new Date();
      var oraAdesso = chiaveGiorno(giorno) === chiaveGiorno(adesso) ? adesso.getHours() : -1;
      el.elencoOre.textContent = '';
      for (var ora = PRIMA_ORA; ora < ULTIMA_ORA; ora++) {
        el.elencoOre.appendChild(rigaOra(ora, testi[ora] || '', ora === oraAdesso));
      }
    });
  }

  // Tocco su una casella: si apre "Racconta" per quell'ora (vuota o con il testo da cambiare).
  function apriAppuntamento(ora, testo) {
    vibra();
    stato.modalita = 'appuntamento';
    stato.appuntamento = { giorno: stato.giorno, ora: ora };
    stato.testoIniziale = testo;
    el.raccontaTitolo.textContent = maiuscola(nomeGiorno(stato.giorno)) + ' · ' + etichettaOra(ora);
    el.raccontaTitolo.hidden = false;
    el.ufficio.hidden = true;
    el.elimina.hidden = !testo;
    el.avanti.textContent = 'Salva';
    el.testo.value = testo;
    preparaRacconta();
    // Niente guardia nuova: c'è già quella del calendario, e il tasto Indietro riporta lì.
  }

  function salvaAppuntamento() {
    var testo = el.testo.value.trim();
    if (stato.salvataggio || !testo) return;
    stato.salvataggio = true;
    vibra();
    fermaDettatura();
    var a = stato.appuntamento;
    Archivio.salvaAppuntamento({
      chiave: chiaveGiorno(a.giorno) + ' ' + due(a.ora),
      giorno: chiaveGiorno(a.giorno),
      ora: a.ora,
      testo: testo,
      modificatoIl: new Date().toISOString()
    }).then(chiudiRacconta, function () {
      // Il testo resta dov'è: può riprovare.
      el.raccontaAvviso.hidden = false;
    }).then(sbloccaSalvataggio, sbloccaSalvataggio);
  }

  function eliminaAppuntamento() {
    vibra();
    fermaDettatura();
    el.testo.blur();
    chiedi('Cancello l\'appuntamento?', 'No, lascialo', 'Sì, cancella', function () {
      var a = stato.appuntamento;
      Archivio.eliminaAppuntamento(chiaveGiorno(a.giorno) + ' ' + due(a.ora)).then(chiudiRacconta, function () {
        tornaARacconta();
        el.raccontaAvviso.hidden = false;
      });
    });
  }

  // ---- Collegamento con l'ufficio ----

  // Il codice dell'operatore arriva una volta sola, dal link personale (…/?c=CODICE):
  // viene salvato sul telefono e tolto dall'indirizzo solo dopo che il salvataggio è riuscito.
  function codiceDalLink() {
    var trovato = /[?&]c=([^&#]+)/.exec(location.search);
    if (!trovato) return Promise.resolve();
    var codice = decodeURIComponent(trovato[1]).trim();
    if (!codice) return Promise.resolve();
    return Archivio.scrivi('codiceOperatore', codice)
      .then(function () { return Archivio.scrivi('problemaCodice', false); })
      .then(function () {
        try { history.replaceState(null, '', location.pathname); } catch (e) { /* non indispensabile */ }
      })
      .catch(function () { /* l'indirizzo resta com'è: alla prossima apertura si riprova */ });
  }

  function collegato() {
    if (Coda.inProva()) return Promise.resolve(true);
    return Archivio.leggi('codiceOperatore').then(function (codice) { return !!codice; });
  }

  // Quando l'app si apre o torna in primo piano: si riprova a inviare, si aggiorna l'elenco
  // dei cantieri, si controlla se c'è una versione nuova.
  function alRitornoInPrimoPiano() {
    Coda.azzeraAttesa();
    Coda.invia();
    Coda.scaricaCantieri();
    if (stato.schermo === 'home') aggiornaHome();
    if (stato.schermo === 'calendario') disegnaGiorno();   // intanto può essere cambiata l'ora, o il giorno
    if (stato.schermo === 'collegamento') avvio();
    var registrazione = stato.registrazioneSW;
    if (registrazione && Date.now() - stato.ultimoControlloVersione > MILLISECONDI_CONTROLLO_VERSIONE) {
      stato.ultimoControlloVersione = Date.now();
      registrazione.update().catch(function () { /* senza rete */ });
    }
  }

  function avvio() {
    collegato().then(function (ok) {
      if (!ok) {
        mostra('collegamento');
        return;
      }
      if (stato.schermo === 'collegamento') mostra('home');
      aggiornaHome();
      Coda.invia();
      Coda.scaricaCantieri();
    }).catch(function () {
      // Memoria non leggibile: si mostra comunque la schermata iniziale con l'avviso.
      aggiornaHome();
    });
  }

  // ---- Collegamenti ----

  el.nuova.addEventListener('click', apriRacconta);
  el.calendario.addEventListener('click', apriCalendario);
  el.microfono.addEventListener('click', toccaMicrofono);
  el.aiuto.addEventListener('click', usaTastiera);
  el.testo.addEventListener('input', testoCambiato);
  el.ufficio.addEventListener('click', function () { vibra(); impostaPerUfficio(!stato.perUfficio); });
  // Toccandolo mentre la tastiera è aperta, il testo non perde il fuoco: la tastiera resta aperta
  // e si può continuare a scrivere o dettare (il fuoco si sposta con mousedown, che qui si annulla).
  el.ufficio.addEventListener('mousedown', function (evento) { evento.preventDefault(); });
  el.elimina.addEventListener('click', eliminaAppuntamento);
  el.annulla.addEventListener('click', function () { annulla(false); });
  el.avanti.addEventListener('click', avanti);
  el.generale.addEventListener('click', function () { scegliCantiere(GENERALE); });
  el.conferma.addEventListener('click', tornaHome);
  el.domandaNo.addEventListener('click', function () { vibra(); tornaARacconta(); });
  el.domandaSi.addEventListener('click', rispondiSi);
  el.giornoPrima.addEventListener('click', function () { cambiaGiorno(-1); });
  el.giornoDopo.addEventListener('click', function () { cambiaGiorno(1); });
  el.calendarioChiudi.addEventListener('click', function () { vibra(); chiudiCalendario(); });

  // La coda riparte al ritorno della rete e quando l'app torna in primo piano.
  // Se restano note in attesa, si chiede al telefono di riprovare in background appena torna la rete.
  Coda.alCambio = function () {
    aggiornaHome();
    chiediInvioInBackground();
  };
  window.addEventListener('online', function () { Coda.azzeraAttesa(); Coda.invia(); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) chiediInvioInBackground();
    else alRitornoInPrimoPiano();
  });
  // Ad app aperta si riprova comunque ogni minuto.
  setInterval(function () { Coda.invia(); }, MILLISECONDI_RITENTATIVO);

  // Tastiera del telefono: Chrome su Android dice quanto è alta (API VirtualKeyboard).
  // La schermata si accorcia di quel tanto (vedi stile.css) e il pulsante microfono
  // sparisce finché la tastiera è aperta. Dove l'API manca, ci si basa sul focus del testo.
  if (navigator.virtualKeyboard) {
    try {
      navigator.virtualKeyboard.overlaysContent = true;
      navigator.virtualKeyboard.addEventListener('geometrychange', function (evento) {
        var aperta = evento.target.boundingRect.height > 0;
        el.racconta.classList.toggle('tastiera-aperta', aperta);
      });
    } catch (e) { /* API non disponibile */ }
  } else {
    el.testo.addEventListener('focus', function () { el.racconta.classList.add('tastiera-aperta'); });
    el.testo.addEventListener('blur', function () { el.racconta.classList.remove('tastiera-aperta'); });
  }

  // ---- Service worker: l'app si apre anche senza rete e si aggiorna da sola ----

  function chiediInvioInBackground() {
    var registrazione = stato.registrazioneSW;
    if (!registrazione || !registrazione.sync) return;
    Archivio.contaInAttesa().then(function (n) {
      if (n > 0) return registrazione.sync.register('invia-note');
    }).catch(function () { /* non supportato o rifiutato: restano i tentativi ad app aperta */ });
  }

  if ('serviceWorker' in navigator) {
    var avevaGiaUnWorker = !!navigator.serviceWorker.controller;
    // updateViaCache 'none': anche config.js e db.js (letti dal worker) vengono ricontrollati in rete,
    // altrimenti un numero di versione nuovo potrebbe restare nascosto dalla cache per 10 minuti.
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (registrazione) {
      stato.registrazioneSW = registrazione;
      stato.ultimoControlloVersione = Date.now();
    }).catch(function () { /* senza service worker l'app funziona lo stesso, solo non si apre senza rete */ });
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      // Versione nuova attiva: si ricarica solo dalla schermata iniziale, mai con una nota a metà.
      if (avevaGiaUnWorker && stato.schermo === 'home') location.reload();
      avevaGiaUnWorker = true;
    });
  }

  // Chiede al telefono di non cancellare la memoria dell'app per fare spazio.
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(function () { /* non indispensabile */ });
  }

  el.versione.textContent = 'v' + CONFIG.VERSIONE + (CONFIG.URL_WEB_APP ? '' : ' · prova');
  codiceDalLink().then(avvio);
})();
