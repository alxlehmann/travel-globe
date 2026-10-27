(() => {
  const html = document.documentElement;
  const copy = {
    en: { eyebrow: 'A personal atlas', heading: 'A few places.<br>A world of memories.', intro: 'Where I’m from, where I am, and a few stops along the way.', source: 'View source', map: 'Map data' },
    de: { eyebrow: 'Ein persönlicher Atlas', heading: 'Ein paar Orte.<br>Eine Welt voller Erinnerungen.', intro: 'Woher ich komme, wo ich lebe und ein paar Stationen dazwischen.', source: 'Quellcode', map: 'Kartendaten' }
  };
  function theme(value) {
    html.dataset.theme = value;
    document.querySelectorAll('[data-theme-choice]').forEach(b => b.setAttribute('aria-pressed', b.dataset.themeChoice === value));
    document.querySelector('meta[name="theme-color"]').content = value === 'dark' ? '#141518' : '#f5f5f7';
    document.dispatchEvent(new CustomEvent('travel-globe:appearance'));
  }
  function language(value) {
    html.lang = value;
    document.querySelectorAll('[data-language-choice]').forEach(b => b.setAttribute('aria-pressed', b.dataset.languageChoice === value));
    document.querySelectorAll('[data-copy]').forEach(el => { el.innerHTML = copy[value][el.dataset.copy]; });
    document.dispatchEvent(new CustomEvent('travel-globe:language'));
  }
  document.querySelectorAll('[data-theme-choice]').forEach(b => b.addEventListener('click', () => theme(b.dataset.themeChoice)));
  document.querySelectorAll('[data-language-choice]').forEach(b => b.addEventListener('click', () => language(b.dataset.languageChoice)));
  const systemTheme = matchMedia('(prefers-color-scheme: dark)');
  theme(systemTheme.matches ? 'dark' : 'light');
})();
