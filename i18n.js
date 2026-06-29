window.SETU_I18N = {};

(function() {
  'use strict';

  var strings = {
    en: {
      searchPlaceholder: 'Search a place or wound…',
      legendTitle: 'What the colours mean',
      legendFunding: 'Open for funding',
      legendReframe: 'Needs reframe',
      legendStatutory: "Government's duty — routed",
      legendProven: 'Proven / healed',
      dockLoading: 'Loading…',
      emptyTitle: 'This corner is quiet — for now.',
      emptyDesc: 'No wounds have been spoken here yet. Be the first. Your voice puts the first pin on the map.',
      emptyBtn: 'Speak a wound',
      storyTab: 'Story',
      detailsTab: 'Details',
      closeLabel: 'Close',
      shareLabel: 'Share this wound',
      fileWithAuth: 'File this with',
      fileViaWA: 'Tap to send a prefilled complaint via WhatsApp',
      fileWA: 'WhatsApp →',
      fileEmail: 'Email',
      zeroTaken: '₹0 taken by Setu · verified milestones only',
      refreshLabel: 'Refresh map data',
      loadingText: 'The map is waking up…',
      toastRetry: 'Retry',
      toastCouldNotLoad: 'Could not load the map.',
      dockHealed: 'healed',
      dockInMotion: 'in motion',
      dockWounds: 'wound',
      dockWoundsPlural: 'wounds',
      dockNearYou: 'near you',
      dockNoWounds: 'No wounds here yet.',
      dockUpdated: 'updated',
      shareTitle: 'Civic wound on Setu',
      shareCopied: 'Link copied!',
      statsLegal: 'Legal',
      statsPartner: 'Partner',
      statsProof: 'Proof',
      scheduleVII: 'Schedule VII',
      toBeMatched: 'to be matched',
      csrReady: '12A·80G·CSR-1',
      onceFunded: 'once funded',
      fourLayer: '4-layer',
      stageHeard: 'Heard',
      stageSorted: 'Sorted',
      stageFunded: 'Funded',
      stageBuilt: 'Built',
      stageProven: 'Proven',
      stageNotFiled: "Not yet filed — government's duty",
      allWounds: 'All wounds'
    },
    hi: {
      searchPlaceholder: 'कोई जगह या समस्या खोजें…',
      legendTitle: 'रंगों का मतलब',
      legendFunding: 'फंडिंग के लिए खुला',
      legendReframe: 'रीफ्रेम की ज़रूरत है',
      legendStatutory: 'सरकार की ज़िम्मेदारी',
      legendProven: 'सिद्ध / हल हुआ',
      dockLoading: 'लोड हो रहा है…',
      emptyTitle: 'यह कोना अभी शांत है।',
      emptyDesc: 'यहाँ अभी तक कोई समस्या नहीं बताई गई। पहल करें। आपकी आवाज़ नक़्शे पर पहला निशान लगाएगी।',
      emptyBtn: 'समस्या बताएं',
      storyTab: 'कहानी',
      detailsTab: 'विवरण',
      closeLabel: 'बंद करें',
      shareLabel: 'यह समस्या शेयर करें',
      fileWithAuth: 'इसमें शिकायत दर्ज करें',
      fileViaWA: 'WhatsApp पर पहले से लिखी शिकायत भेजें',
      fileWA: 'WhatsApp →',
      fileEmail: 'ईमेल',
      zeroTaken: 'Setu ने ₹0 लिया · केवल सत्यापित चरण',
      refreshLabel: 'नक़्शा ताज़ा करें',
      loadingText: 'नक़्शा जाग रहा है…',
      toastRetry: 'पुनः प्रयास करें',
      toastCouldNotLoad: 'नक़्शा लोड नहीं हो सका।',
      dockHealed: 'हल हुई',
      dockInMotion: 'प्रगति में',
      dockWounds: 'समस्या',
      dockWoundsPlural: 'समस्याएं',
      dockNearYou: 'आपके आस-पास',
      dockNoWounds: 'यहाँ कोई समस्या नहीं।',
      dockUpdated: 'अपडेट',
      shareTitle: 'Setu पर समस्या',
      shareCopied: 'लिंक कॉपी हुआ!',
      statsLegal: 'कानूनी',
      statsPartner: 'साझेदार',
      statsProof: 'प्रमाण',
      scheduleVII: 'अनुसूची VII',
      toBeMatched: 'मिलान होना बाकी',
      csrReady: '12A·80G·CSR-1',
      onceFunded: 'फंडिंग के बाद',
      fourLayer: '4-स्तरीय',
      stageHeard: 'सुनी गई',
      stageSorted: 'छांटी गई',
      stageFunded: 'फंड हुई',
      stageBuilt: 'बनी',
      stageProven: 'सिद्ध',
      stageNotFiled: 'अभी दर्ज नहीं — सरकार की ज़िम्मेदारी',
      allWounds: 'सभी समस्याएं'
    }
  };

  function resolve() {
    var stored = null;
    try { stored = localStorage.getItem('setu_lang'); } catch(e) {}
    var lang = stored;
    if (lang && strings[lang]) return lang;
    var nav = (navigator.language || '').split('-')[0];
    if (nav === 'hi') return 'hi';
    return 'en';
  }

  var currentLang = resolve();
  window.SETU_I18N = strings[currentLang];

  window.setLanguage = function(lang) {
    if (strings[lang]) {
      currentLang = lang;
      window.SETU_I18N = strings[lang];
      try { localStorage.setItem('setu_lang', lang); } catch(e) {}
      var els = document.querySelectorAll('[data-i18n]');
      for (var i = 0; i < els.length; i++) {
        var key = els[i].getAttribute('data-i18n');
        if (key && strings[lang][key]) els[i].textContent = strings[lang][key];
      }
      return true;
    }
    return false;
  };

  window.getLanguage = function() { return currentLang; };

  // Auto-apply the detected language on load
  if (currentLang !== 'en') window.setLanguage(currentLang);
})();
