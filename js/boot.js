// Consenso per la memoria del browser (art. 122 Codice privacy, Linee guida Garante 2021).
// "Necessari": accesso all'account e la scelta stessa sui cookie (sempre attivi).
// "Preferenze": tema, colori e copia offline del database: salvati solo con il consenso.
// Senza consenso le funzioni si possono usare durante la visita, ma non resta salvato nulla.
window.Consent = (function () {
  var K = 'bpa-consent', PREF_KEYS = ['pcm-lang', 'pcm-theme', 'pcm-design', 'bpa-cookie-ok'];
  function get() { try { return JSON.parse(localStorage.getItem(K)) || null; } catch (e) { return null; } }
  function clearPrefs() {
    try {
      PREF_KEYS.forEach(function (k) { localStorage.removeItem(k); });
      // chiavi tecniche della copia offline del database
      Object.keys(localStorage).forEach(function (k) { if (k.indexOf('firestore_') === 0) localStorage.removeItem(k); });
    } catch (e) { /* ignore */ }
    // copia offline del database (Firestore): si elimina, l'app la ricrea solo con il consenso
    try {
      if (indexedDB.databases) indexedDB.databases().then(function (l) { l.forEach(function (d) { if (d.name && d.name.indexOf('firestore/') === 0) indexedDB.deleteDatabase(d.name); }); });
    } catch (e) { /* ignore */ }
  }
  return {
    get: get,
    decided: function () { return !!get(); },
    prefs: function () { var c = get(); return !!(c && c.prefs); },
    set: function (prefs) {
      try { localStorage.setItem(K, JSON.stringify({ prefs: !!prefs, at: Date.now(), v: 1 })); } catch (e) { /* ignore */ }
      if (!prefs) clearPrefs();
    },
    // lettura/scrittura delle preferenze: solo con il consenso
    read: function (k) { if (!this.prefs()) return null; try { return localStorage.getItem(k); } catch (e) { return null; } },
    write: function (k, v) { if (!this.prefs()) return; try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
    clearPrefs: clearPrefs
  };
})();
if (!Consent.prefs()) Consent.clearPrefs();

// Stile grafico scelto su questo dispositivo (applicato subito, prima del caricamento dell'app).
(function () {
  var th = Consent.read('pcm-theme'); if (th && th !== 'logo') document.documentElement.setAttribute('data-theme', th);
  var ds = Consent.read('pcm-design') || 'classico'; if (ds !== 'classico') document.documentElement.setAttribute('data-design', ds);
})();
