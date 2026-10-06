// Diario Cantieri — configurazione.
// È l'unico file da toccare quando cambia l'indirizzo del foglio o si pubblica una versione nuova.
// Viene letto sia dalla pagina sia dal service worker: qui niente "window" o "document".

self.CONFIG = {
  // Indirizzo della Web App di Google (finisce con /exec).
  // Vuoto = modalità prova: cantieri finti e invio simulato, in ufficio non arriva niente.
  URL_WEB_APP: '',

  // Numero di versione, mostrato in piccolo nella schermata iniziale.
  // Va aumentato a ogni pubblicazione.
  VERSIONE: '2'
};
