// Diario Cantieri — schermate e navigazione.
// C'è un unico flusso: Inizio → Racconta → Quale cantiere? → Nota salvata → Inizio.

(function () {
  'use strict';

  var GENERALE = 'Generale';
  var CHIAVE_BOZZA = 'diario-cantieri:bozza';
  var MILLISECONDI_CONFERMA = 3000;
  var MILLISECONDI_ANTI_DOPPIO_TOCCO = 400;

  // Cantieri finti, usati solo in modalità prova (CONFIG.URL_WEB_APP vuoto).
  var CANTIERI_FINTI = [
    'Casa Rossi – Predazzo',
    'Condominio Lagorai',
    'Capannone Ziano',
    'Ristrutturazione Bianchi – Tesero',
    'Villetta Verdi – Cavalese'
  ];

  function $(id) { return document.getElementById(id); }

  var el = {
    nuova: $('btn-nuova'),
    statoInvio: $('stato-invio'),
    ultime: $('ultime'),
    ultimeElenco: $('ultime-elenco'),
    versione: $('versione'),
    racconta: $('schermo-racconta'),
    microfono: $('btn-microfono'),
    aiuto: $('aiuto-tastiera'),
    testo: $('testo'),
    annulla: $('btn-annulla'),
    avanti: $('btn-avanti'),
    elenco: $('elenco-cantieri'),
    avviso: $('avviso-cantiere'),
    generale: $('btn-generale'),
    conferma: $('schermo-conferma'),
    confermaCantiere: $('conferma-cantiere'),
    confermaAttesa: $('conferma-attesa'),
    buttaNo: $('btn-butta-no'),
    buttaSi: $('btn-butta-si')
  };

  var stato = {
    schermo: 'home',
    cambioIl: 0,
    guardia: false,
    ignoraPop: false,
    dopoPop: null,
    salvataggio: false,
    timerConferma: null
  };

  // ---- Utilità ----

  function vibra() {
    if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) { /* non supportata */ } }
  }

  function nuovoId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function due(n) { return (n < 10 ? '0' : '') + n; }

  function inizioGiorno(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }

  function formattaQuando(iso) {
    var d = new Date(iso);
    var ora = due(d.getHours()) + ':' + due(d.getMinutes());
    var giorni = Math.round((inizioGiorno(new Date()) - inizioGiorno(d)) / 86400000);
    if (giorni === 0) return 'oggi ' + ora;
    if (giorni === 1) return 'ieri ' + ora;
    return due(d.getDate()) + '/' + due(d.getMonth() + 1) + ' ' + ora;
  }

  // ---- Bozza: il testo si salva da solo mentre si detta ----
  // Se arriva una telefonata e l'app si chiude, alla riapertura il testo è ancora lì.

  function leggiBozza() {
    try { return localStorage.getItem(CHIAVE_BOZZA) || ''; } catch (e) { return ''; }
  }

  function salvaBozza(testo) {
    try { localStorage.setItem(CHIAVE_BOZZA, testo); } catch (e) { /* memoria non disponibile */ }
  }

  function cancellaBozza() {
    try { localStorage.removeItem(CHIAVE_BOZZA); } catch (e) { /* memoria non disponibile */ }
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

  function mettiGuardia() {
    if (stato.ignoraPop) { stato.dopoPop = mettiGuardia; return; }
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
      if (stato.dopoPop) { var poi = stato.dopoPop; stato.dopoPop = null; poi(); }
      return;
    }
    stato.guardia = false;
    if (stato.schermo === 'cantiere' || stato.schermo === 'butta') {
      mostra('racconta');
      mettiGuardia();
    } else if (stato.schermo === 'racconta') {
      if (el.testo.value.trim()) {
        el.testo.blur();
        mostra('butta');
        mettiGuardia();
      } else {
        chiudiRacconta();
      }
    }
  });

  // ---- Schermata iniziale ----

  function aggiornaHome() {
    Archivio.contaInAttesa().then(function (n) {
      el.statoInvio.textContent = n === 0 ? 'Tutto inviato ✓'
        : (n === 1 ? '1 nota in attesa di rete' : n + ' note in attesa di rete');
      el.statoInvio.classList.toggle('stato-attesa', n > 0);
    }).catch(function () { /* la schermata resta com'era */ });

    Archivio.ultimeInviate(3).then(function (note) {
      el.ultimeElenco.textContent = '';
      note.forEach(function (nota) {
        var riga = document.createElement('li');
        var capo = document.createElement('span');
        capo.className = 'ultima-capo';
        capo.textContent = formattaQuando(nota.dataOraNota) + ' · ' + nota.cantiere;
        var testo = document.createElement('span');
        testo.className = 'ultima-testo';
        testo.textContent = nota.testo;
        riga.appendChild(capo);
        riga.appendChild(testo);
        el.ultimeElenco.appendChild(riga);
      });
      el.ultime.hidden = note.length === 0;
    }).catch(function () { /* la schermata resta com'era */ });
  }

  // ---- Schermata "Racconta" ----

  function aggiornaAvanti() {
    el.avanti.disabled = !el.testo.value.trim();
  }

  function apriRacconta() {
    vibra();
    el.testo.value = leggiBozza();
    aggiornaAvanti();
    el.racconta.classList.remove('con-tastiera');
    el.aiuto.hidden = true;
    mostra('racconta');
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

  function chiudiRacconta() {
    cancellaBozza();
    el.testo.value = '';
    el.testo.blur();
    togliGuardia();
    mostra('home');
    aggiornaHome();
  }

  function annulla() {
    vibra();
    if (el.testo.value.trim()) {
      // C'è del testo: prima di buttarlo via si chiede conferma.
      el.testo.blur();
      mostra('butta');
    } else {
      chiudiRacconta();
    }
  }

  // ---- Schermata "Quale cantiere?" ----

  function elencoCantieri() {
    // In modalità prova l'elenco è finto; con il backend arriverà dal foglio dell'ufficio.
    return Promise.resolve(CANTIERI_FINTI);
  }

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
      pulsante.className = 'btn btn-principale btn-cantiere';
      pulsante.textContent = cantiere.nome;
      pulsante.addEventListener('click', function () { scegliCantiere(cantiere.nome); });
      el.elenco.appendChild(pulsante);
    });
  }

  function apriCantieri() {
    if (!el.testo.value.trim()) return;
    vibra();
    el.testo.blur();
    el.avviso.hidden = true;
    Promise.all([
      elencoCantieri(),
      Archivio.leggi('usoCantieri').catch(function () { return null; })
    ]).then(function (dati) {
      disegnaCantieri(dati[0], dati[1] || {});
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
      id: nuovoId(),
      testo: testo,
      cantiere: nome,
      // Momento in cui la nota è stata registrata, non quello dell'invio.
      dataOraNota: new Date().toISOString(),
      stato: 'in_attesa',
      tentativi: 0
    };
    Archivio.salvaNota(nota).then(function () {
      cancellaBozza();
      el.testo.value = '';
      if (nome !== GENERALE) segnaUso(nome);
      mostraConferma(nome);
      Coda.invia();
    }, function () {
      // Il testo resta dov'è: può riprovare.
      el.avviso.hidden = false;
    }).then(function () {
      stato.salvataggio = false;
    });
  }

  // ---- Schermata "Nota salvata" ----

  function mostraConferma(nome) {
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

  // ---- Collegamenti ----

  el.nuova.addEventListener('click', apriRacconta);
  el.microfono.addEventListener('click', function () { vibra(); usaTastiera(); });
  el.aiuto.addEventListener('click', usaTastiera);
  el.testo.addEventListener('input', function () { salvaBozza(el.testo.value); aggiornaAvanti(); });
  el.annulla.addEventListener('click', annulla);
  el.avanti.addEventListener('click', apriCantieri);
  el.generale.addEventListener('click', function () { scegliCantiere(GENERALE); });
  el.conferma.addEventListener('click', tornaHome);
  el.buttaNo.addEventListener('click', function () { vibra(); mostra('racconta'); });
  el.buttaSi.addEventListener('click', function () { vibra(); chiudiRacconta(); });

  // La coda riparte al ritorno della rete e quando l'app torna in primo piano.
  Coda.alCambio = function () { if (stato.schermo === 'home') aggiornaHome(); };
  window.addEventListener('online', function () { Coda.invia(); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    Coda.invia();
    if (stato.schermo === 'home') aggiornaHome();
  });

  el.versione.textContent = 'v' + CONFIG.VERSIONE + (CONFIG.URL_WEB_APP ? '' : ' · prova');
  aggiornaHome();
  Coda.invia();
})();
