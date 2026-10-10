// Diario Cantieri — configurazione.
// È l'unico file da toccare quando cambia l'indirizzo del foglio o si pubblica una versione nuova.
// Viene letto sia dalla pagina sia dal service worker: qui niente "window" o "document".

self.CONFIG = {
  // Indirizzo della Web App di Google (quello che finisce con /exec, dato dalla pubblicazione dello script).
  // Vuoto = modalità prova: cantieri finti e invio simulato, in ufficio non arriva niente.
  URL_WEB_APP: 'https://script.google.com/macros/s/AKfycbzpr1xB6AIxnmKZQHq-ypa3rwCXaMdOQbOnHTKW9HGSKqLIsHXphtQXPfZtutl7NeHmsw/exec',

  // Numero di versione, mostrato in piccolo nella schermata iniziale.
  // Va aumentato a ogni pubblicazione.
  VERSIONE: '8'
};
