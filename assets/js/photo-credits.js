(() => {
  const de = new URL(location.href).searchParams.get('lang') === 'de';
  document.documentElement.lang = de ? 'de' : 'en';
  if (de) {
    document.title = 'Bildnachweise — Travel Globe';
    document.querySelector('h1').textContent = 'Bildnachweise';
    document.querySelector('.credits-intro').textContent = 'Fotos von Wikimedia Commons unter ihren jeweiligen Lizenzen. Lokale Kopien wurden verkleinert und in WebP umgewandelt; Vorschaubilder können einen Ausschnitt zeigen. Quellen und Lizenzen sind unten verlinkt.';
  }
  if (matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.dataset.theme = 'dark';
    document.querySelector('meta[name="theme-color"]').content = '#141518';
  }
})();
