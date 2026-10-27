(() => {
  'use strict';
  const root = document.querySelector('[data-travel-globe]');
  if (!root) return;
  const scriptURL = document.currentScript.src;
  const asset = path => new URL('../' + path, scriptURL).href;
  const canvas = root.querySelector('canvas');
  const viewport = root.querySelector('.travel-globe__viewport');
  const ctx = canvas.getContext('2d');
  const picker = root.querySelector('[data-globe-picker]');
  const tooltip = root.querySelector('.globe-tooltip');
  const status = root.querySelector('[role="status"]');
  const special = [...root.querySelectorAll('[data-globe-special]')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const copy = {
    en: { title: 'Places I’ve been', picker: 'Explore a place', origin: 'Where I’m from', home: 'Home now', controls: 'Globe controls', in: 'Zoom in', out: 'Zoom out', reset: 'Reset globe', error: 'The globe couldn’t load. Reload the page to try again.' },
    de: { title: 'Orte, an denen ich war', picker: 'Einen Ort entdecken', origin: 'Meine Heimat', home: 'Heute zu Hause', controls: 'Globus steuern', in: 'Vergrößern', out: 'Verkleinern', reset: 'Globus zurücksetzen', error: 'Der Globus konnte nicht geladen werden. Bitte lade die Seite neu.' }
  };
  let language, words, regions;
  let cities = [], land, borders, projection, path, visiblePoints = [];
  let width = 0, height = 0, radius = 0, ratio = 1;
  let longitude = 32, latitude = 36, zoom = 1, target = null;
  let active = null, hovered = null, pointer = null, interacted = false;
  let visible = false, loaded = false, loading = false, raf = 0, lastFrame = 0, dirty = true;
  let dark = document.documentElement.dataset.theme === 'dark';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const name = city => city[language] || city.en;
  const country = city => regions.of(city.country);
  const circle = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };
  const pauseIdle = () => { interacted = true; target = null; };
  const requestDraw = () => { dirty = true; if (visible && loaded && !raf && !document.hidden) raf = requestAnimationFrame(frame); };
  function translate() {
    language = document.documentElement.lang === 'de' ? 'de' : 'en';
    words = copy[language];
    regions = new Intl.DisplayNames([language], { type: 'region' });
    root.setAttribute('aria-label', words.title);
    picker.setAttribute('aria-label', words.picker);
    const origin = cities.find(city => city.kind === 'origin');
    const home = cities.find(city => city.kind === 'home');
    root.querySelector('[data-globe-special="origin"]').setAttribute('aria-label', origin ? name(origin) + ' — ' + words.origin : words.origin);
    root.querySelector('[data-globe-special="home"]').setAttribute('aria-label', home ? name(home) + ' — ' + words.home : words.home);
    root.querySelector('.globe-zoom').setAttribute('aria-label', words.controls);
    root.querySelector('[data-globe-zoom="1"]').setAttribute('aria-label', words.in);
    root.querySelector('[data-globe-zoom="-1"]').setAttribute('aria-label', words.out);
    root.querySelector('[data-globe-reset]').setAttribute('aria-label', words.reset);
    const selected = picker.value;
    picker.replaceChildren(new Option(language === 'de' ? 'Orte entdecken' : words.title, ''));
    const groups = new Map();
    [...cities].sort((a,b) => country(a).localeCompare(country(b), language) || name(a).localeCompare(name(b), language)).forEach(city => {
      if (!groups.has(city.country)) { const group = document.createElement('optgroup'); group.label = country(city); groups.set(city.country, group); picker.append(group); }
      const suffix = city.kind === 'origin' ? ' · ' + words.origin : city.kind === 'home' ? ' · ' + words.home : '';
      groups.get(city.country).append(new Option(name(city) + suffix, String(city.id)));
    });
    picker.value = selected;
    requestDraw();
  }
  function resize() {
    const rect = viewport.getBoundingClientRect(); width = rect.width; height = rect.height;
    ratio = Math.min(devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    radius = Math.min(width * .455, height * .68);
    requestDraw();
  }
  function updateButtons() {
    root.querySelector('[data-globe-zoom="-1"]').disabled = zoom <= 1.001 && (!target || target.zoom <= 1);
    root.querySelector('[data-globe-zoom="1"]').disabled = zoom >= 3.499;
  }
  function project() {
    projection.rotate([-longitude, -latitude, 0]).translate([width / 2, height * (width < 600 ? .56 : .73)]).scale(radius * zoom);
  }
  function placeMarker(button, point, kind) {
    const x = point[0] - 16;
    // The pin's tip, rather than its centre, marks Güstrow.
    const y = point[1] - (kind === 'home' ? 27 : 16);
    button.style.transform = `translate(${x}px,${y}px)`;
    button.style.opacity = '1'; button.style.visibility = 'visible';
  }
  function draw() {
    if (!loaded || !width) return;
    ctx.setTransform(ratio,0,0,ratio,0,0); ctx.clearRect(0,0,width,height);
    project();
    const [cx,cy] = projection.translate(), r = radius * zoom;
    const ocean = ctx.createRadialGradient(cx-r*.35,cy-r*.5,r*.04,cx,cy,r);
    ocean.addColorStop(0, dark ? '#303741' : '#ffffff');
    ocean.addColorStop(.75,dark ? '#20262e' : '#fbfcfd');
    ocean.addColorStop(1,dark ? '#171d25' : '#e7ebf0');
    ctx.save(); circle(cx,cy,r); ctx.fillStyle=ocean; ctx.fill(); ctx.clip();
    ctx.save(); ctx.translate(0,1.2); ctx.beginPath(); path(land); ctx.fillStyle=dark?'#10161b':'#cdd3db'; ctx.fill(); ctx.restore();
    ctx.beginPath(); path(land); ctx.fillStyle=dark?'#414b58':'#e1e5e9'; ctx.fill();
    ctx.strokeStyle=dark?'#59657360':'#ffffffaa'; ctx.lineWidth=.55; ctx.stroke();
    if (borders) {
      ctx.save(); ctx.beginPath(); path(borders); ctx.setLineDash([2, 3]);
      ctx.lineWidth = .7; ctx.lineCap = 'round';
      ctx.strokeStyle = dark ? '#bdcddd38' : '#74839755'; ctx.stroke(); ctx.restore();
    }
    const light=ctx.createRadialGradient(cx-r*.4,cy-r*.55,0,cx,cy,r);
    light.addColorStop(0,dark?'#ffffff08':'#ffffff5c'); light.addColorStop(.65,'#ffffff00'); light.addColorStop(1,dark?'#00000066':'#7c8b9b20');
    circle(cx,cy,r); ctx.fillStyle=light; ctx.fill(); ctx.restore();
    circle(cx,cy,r-.5); ctx.strokeStyle=dark?'#ffffff10':'#ffffffb3';ctx.lineWidth=1;ctx.stroke();
    visiblePoints=[];
    cities.forEach(city => {
      if (d3.geoDistance(city.coordinates,[longitude,latitude]) > Math.PI/2-.035) return;
      const p=projection(city.coordinates);
      if (p[0]<-10 || p[0]>width+10 || p[1]<-10 || p[1]>height-65) return;
      visiblePoints.push({city,p});
      if (city.kind !== 'visited') return; // Special cities use the star and pin above the canvas.
      const selected=city===active || city===hovered;
      if (selected) {
        circle(p[0],p[1],8); ctx.fillStyle=city.kind==='origin'?'#f47a3624':'#007aff20'; ctx.fill();
      }
      circle(p[0],p[1],selected?4:2.6);
      ctx.fillStyle=city.kind==='origin'?'#f47a36':dark?'#62b0ff':'#007aff';ctx.fill();
      if(selected) {ctx.strokeStyle=dark?'#222b35':'#fff';ctx.lineWidth=1.6;ctx.stroke();}
    });
    special.forEach(button=>{
      const point=visiblePoints.find(p=>p.city.kind===button.dataset.globeSpecial);
      if(point) placeMarker(button,point.p,point.city.kind);
      else {button.style.opacity='0';button.style.visibility='hidden';}
    });
    const highlight=hovered || active;
    const spot=visiblePoints.find(p=>p.city===highlight);
    if(spot && !pointer?.moved) {
      tooltip.hidden=false;
      tooltip.querySelector('strong').textContent=name(highlight);
      tooltip.querySelector('span').textContent=country(highlight);
      const tx=clamp(spot.p[0]-tooltip.offsetWidth/2,8,width-tooltip.offsetWidth-8);
      const ty=clamp(spot.p[1]-tooltip.offsetHeight-(highlight.kind==='home'?34:16),8,height-tooltip.offsetHeight-65);
      tooltip.style.transform=`translate(${tx}px,${ty}px)`;
    } else tooltip.hidden=true;
    updateButtons();
  }
  function frame(time) {
    raf=0;
    if (!visible || document.hidden || !loaded) return;
    if (lastFrame && time-lastFrame < 32 && !dirty) { raf=requestAnimationFrame(frame); return; }
    const dt=Math.min(time-(lastFrame || time),64); lastFrame=time;
    let moving=false;
    if(target) {
      const amount=reduced.matches?1:1-Math.exp(-dt/135);
      let dl=((target.longitude-longitude+540)%360)-180;
      longitude+=dl*amount;latitude+=(target.latitude-latitude)*amount;zoom+=(target.zoom-zoom)*amount;
      moving=true;
      if(Math.abs(dl)<.025 && Math.abs(target.latitude-latitude)<.025 && Math.abs(target.zoom-zoom)<.001) {longitude=target.longitude;latitude=target.latitude;zoom=target.zoom;target=null;}
    } else if(!interacted && !reduced.matches && !hovered && !pointer) {
      longitude=32+Math.sin(time*.000075)*7; latitude=36+Math.sin(time*.00005)*1.7; moving=true;
    }
    if(dirty || moving) { draw(); dirty=false; }
    if(moving) raf=requestAnimationFrame(frame);
  }
  function focusCity(city) {
    interacted=true; hovered=null; active=city;
    picker.value=String(city.id);
    target={longitude:city.coordinates[0],latitude:city.coordinates[1]-(width<600?4:13),zoom:width<600?1.65:1.7};
    status.textContent=name(city)+' — '+country(city)+(city.kind==='home'?' · '+words.home:city.kind==='origin'?' · '+words.origin:'');
    requestDraw();
  }
  function nearest(event) {
    const b=canvas.getBoundingClientRect(), x=event.clientX-b.left,y=event.clientY-b.top;
    let best=null,dist=event.pointerType==='touch'?22:10;
    visiblePoints.forEach(point=> {const d=Math.hypot(point.p[0]-x,point.p[1]-y); if(d<dist){dist=d;best=point.city;}});
    return best;
  }
  canvas.addEventListener('pointerdown',event=>{
    if(!loaded || (event.button!==0 && event.pointerType==='mouse')) return;
    pauseIdle(); hovered=null;
    pointer={id:event.pointerId,x:event.clientX,y:event.clientY,longitude,latitude,moved:false};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove',event=>{
    if(pointer && pointer.id===event.pointerId) {
      const dx=event.clientX-pointer.x, dy=event.clientY-pointer.y;
      if(Math.hypot(dx,dy)>5) pointer.moved=true;
      if(pointer.moved) {
        longitude=pointer.longitude-dx*70/(radius*zoom);
        latitude=clamp(pointer.latitude+(event.pointerType==='touch'?0:dy)*70/(radius*zoom),-75,80);
        active=null; picker.value=''; requestDraw();
      }
    } else if(event.pointerType!=='touch') {
      const next=nearest(event);if(next!==hovered){hovered=next;requestDraw();}
      canvas.style.cursor=next?'pointer':'grab';
    }
  });
  const finish=event=>{
    if(!pointer || pointer.id!==event.pointerId) return;
    const click=!pointer.moved && event.type==='pointerup';pointer=null;
    if(canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if(click) {const city=nearest(event);if(city)focusCity(city);else{active=null;picker.value='';requestDraw();}}
    requestDraw();
  };
  canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);
  canvas.addEventListener('lostpointercapture',finish);
  canvas.addEventListener('pointerleave',()=>{hovered=null;requestDraw();});
  picker.addEventListener('change',()=>{const city=cities.find(c=>String(c.id)===picker.value);if(city)focusCity(city);else reset();});
  special.forEach(button => {
    const city = () => cities.find(c => c.kind === button.dataset.globeSpecial);
    const show = () => { hovered = city() || null; requestDraw(); };
    const hide = () => { if (hovered === city()) hovered = null; requestDraw(); };
    button.addEventListener('pointerenter', show);
    button.addEventListener('pointerleave', hide);
    button.addEventListener('focus', show);
    button.addEventListener('blur', hide);
    button.addEventListener('click', () => { const place = city(); if (place) focusCity(place); });
  });
  root.querySelectorAll('[data-globe-zoom]').forEach(button=>button.addEventListener('click',()=>{
    interacted=true;target={longitude,latitude,zoom:clamp((target?.zoom || zoom)+Number(button.dataset.globeZoom)*.5,1,3.5)};requestDraw();
  }));
  function reset() {interacted=true;active=null;hovered=null;picker.value='';target={longitude:32,latitude:36,zoom:1};requestDraw();}
  root.querySelector('[data-globe-reset]').addEventListener('click',reset);
  function loadScript(file) {
    return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=asset('vendor/globe/'+file);s.onload=resolve;s.onerror=reject;document.head.append(s);});
  }
  async function init() {
    if(loading || loaded) return;loading=true;
    try {
      const [world,places,boundaries]=await Promise.all([
        fetch(asset('data/globe-land-50m.json')).then(r=>{if(!r.ok)throw Error(r.status);return r.json();}),
        fetch(asset('data/travel-places.json')).then(r=>{if(!r.ok)throw Error(r.status);return r.json();}),
        fetch(asset('data/globe-borders-50m.json')).then(r=>{if(!r.ok)throw Error(r.status);return r.json();}).catch(()=>null),
        loadScript('d3-array.min.js').then(()=>loadScript('d3-geo.min.js')),
        loadScript('topojson-client.min.js')
      ]);
      cities=places;land=topojson.feature(world,world.objects.land);borders=boundaries;
      projection=d3.geoOrthographic().clipAngle(90).precision(.45);path=d3.geoPath(projection,ctx);
      loaded=true;root.dataset.ready='true';translate();resize();requestDraw();
    } catch(error) {
      const p=document.createElement('p');p.className='travel-globe__fallback';p.textContent=words.error;root.append(p);
      root.querySelector('.travel-globe__controls').hidden=true;
    }
  }
  translate();
  new ResizeObserver(resize).observe(viewport);
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){init();lastFrame=0;requestDraw();}else if(raf){cancelAnimationFrame(raf);raf=0;}},{rootMargin:'160px'}).observe(root);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else{lastFrame=0;requestDraw();}});
  document.addEventListener('travel-globe:language',translate);
  document.addEventListener('travel-globe:appearance',()=>{dark=document.documentElement.dataset.theme==='dark';requestDraw();});
  reduced.addEventListener('change',requestDraw);
})();
