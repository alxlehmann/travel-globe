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
  const tooltipName = tooltip.querySelector('strong');
  const tooltipCountry = tooltip.querySelector('span');
  const photo = document.createElement('img');
  photo.className = 'globe-tooltip__photo'; photo.decoding = 'async'; photo.hidden = true;
  const tooltipCopy = document.createElement('div'); tooltipCopy.className = 'globe-tooltip__copy';
  tooltipCopy.append(tooltipName, tooltipCountry);
  const photoCredit = document.createElement('a'); photoCredit.className = 'globe-tooltip__credit'; photoCredit.hidden = true;
  photoCredit.target = '_blank'; photoCredit.rel = 'noopener';
  tooltip.replaceChildren(photo, tooltipCopy, photoCredit);
  tooltip.id = 'globe-place-preview';
  tooltip.setAttribute('role', 'group');
  tooltip.setAttribute('aria-label', 'Place preview');
  let displayedPhoto = '', hoverTimer = 0, tooltipEngaged = false, dismissed = null;
  const status = root.querySelector('[role="status"]');
  const special = [...root.querySelectorAll('[data-globe-special]')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const copy = {
    en: { title: 'Places I’ve been', picker: 'Explore a place', origin: 'Where I’m from', home: 'Home now', controls: 'Globe controls', in: 'Zoom in', out: 'Zoom out', reset: 'Reset globe', error: 'The globe couldn’t load. Reload the page to try again.' },
    de: { title: 'Orte, an denen ich war', picker: 'Einen Ort entdecken', origin: 'Meine Heimat', home: 'Heute zu Hause', controls: 'Globus steuern', in: 'Vergrößern', out: 'Verkleinern', reset: 'Globus zurücksetzen', error: 'Der Globus konnte nicht geladen werden. Bitte lade die Seite neu.' }
  };
  let language, words, regions;
  let cities = [], land, borders, projection, visiblePoints = [];
  let width = 0, height = 0, radius = 0, ratio = 1;
  let longitude = 32, latitude = 36, zoom = 1, target = null;
  let active = null, hovered = null, pointer = null, interacted = false;
  let visible = false, loaded = false, loading = false, raf = 0, lastFrame = 0, dirty = true;
  let dark = document.documentElement.dataset.theme === 'dark';
  let flight = null;
  const flightDuration = 4600;
  // Cache the map surface so a moving plane does not redraw all geographic paths.
  const surface = document.createElement('canvas');
  const surfaceContext = surface.getContext('2d');
  let surfaceKey = '';
  const aircraft = new Path2D('M14 0C14-1.4 10-2.1 8-2.1H2L-4-10H-7L-4-2.1H-10L-13-5H-15L-13 0L-15 5H-13L-10 2.1H-4L-7 10H-4L2 2.1H8C10 2.1 14 1.4 14 0Z');
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
  function clearHoverLater() {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => { if (!tooltipEngaged && !tooltip.contains(document.activeElement)) { hovered = null; requestDraw(); } }, 220);
  }
  function showHover(city) {
    clearTimeout(hoverTimer);
    if (city !== hovered) { hovered = city; dismissed = null; if (city?.kind === 'origin') startFlight(); requestDraw(); }
  }
  function updatePreview(city) {
    tooltipName.textContent = name(city);
    tooltipCountry.textContent = country(city);
    tooltip.setAttribute('aria-label', name(city));
    const image = city.photo;
    const next = image?.src || '';
    if (next !== displayedPhoto) {
      displayedPhoto = next;
      photo.hidden = !next; photoCredit.hidden = !next;
      tooltip.classList.toggle('has-photo', Boolean(next));
      photo.classList.remove('is-loaded');
      if (next) photo.src = asset(next);
      else photo.removeAttribute('src');
    }
    if (next) {
      photo.alt = language === 'de' ? 'Ansicht von ' + name(city) : 'View of ' + name(city);
      const label = image.author.length <= 32 ? (language === 'de' ? 'Foto: ' : 'Photo: ') + image.author : (language === 'de' ? 'Bildnachweis' : 'Photo credits');
      photoCredit.textContent = label + ' ↗';
      photoCredit.href = new URL('../../sources.html?lang=' + language + '#photo-' + city.id, scriptURL).href;
      photoCredit.title = image.author + ' · ' + image.license;
      photoCredit.setAttribute('aria-label', (language === 'de' ? 'Bildnachweis für ' : 'Photo credits for ') + name(city) + ': ' + image.author + ', ' + image.license);
    }
  }
  photo.addEventListener('load', () => { photo.classList.add('is-loaded'); requestDraw(); });
  photo.addEventListener('error', () => {
    photo.hidden = true; photoCredit.hidden = true; tooltip.classList.remove('has-photo'); requestDraw();
  });
  tooltip.addEventListener('pointerenter', () => { tooltipEngaged = true; clearTimeout(hoverTimer); });
  tooltip.addEventListener('pointerleave', () => { tooltipEngaged = false; clearHoverLater(); });
  tooltip.addEventListener('focusin', () => clearTimeout(hoverTimer));
  tooltip.addEventListener('focusout', clearHoverLater);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || tooltip.hidden) return;
    dismissed = hovered || active; hovered = null;
    if (tooltip.contains(document.activeElement)) picker.focus();
    requestDraw();
  });
  function drawSurface() {
    const key = [width,height,ratio,longitude.toFixed(5),latitude.toFixed(5),zoom.toFixed(5),dark].join('|');
    if (key !== surfaceKey) {
      surfaceKey = key;
      if(surface.width !== canvas.width || surface.height !== canvas.height) {
        surface.width = canvas.width; surface.height = canvas.height;
      }
      const g = surfaceContext;
      g.setTransform(ratio,0,0,ratio,0,0);g.clearRect(0,0,width,height);
      const surfacePath = d3.geoPath(projection,g);
      const sphere = r => { const [x,y]=projection.translate();g.beginPath();g.arc(x,y,r,0,Math.PI*2); };
    const [cx,cy] = projection.translate(), r = radius * zoom;
    const atmosphere = g.createRadialGradient(cx,cy,r-1,cx,cy,r+12);
    atmosphere.addColorStop(0,dark?'#8bbaff12':'#ffffff88');
    atmosphere.addColorStop(1,'#ffffff00');
    sphere(r+12);g.fillStyle=atmosphere;g.fill();
    const ocean = g.createRadialGradient(cx-r*.35,cy-r*.5,r*.04,cx,cy,r);
    ocean.addColorStop(0, dark ? '#303741' : '#ffffff');
    ocean.addColorStop(.75,dark ? '#20262e' : '#fbfcfd');
    ocean.addColorStop(1,dark ? '#171d25' : '#e7ebf0');
    g.save(); sphere(r); g.fillStyle=ocean; g.fill(); g.clip();
    g.save(); g.translate(0,1.2); g.beginPath(); surfacePath(land); g.fillStyle=dark?'#10161b':'#cdd3db'; g.fill(); g.restore();
    g.beginPath(); surfacePath(land); g.fillStyle=dark?'#424d5c':'#e0e6eb'; g.fill();
    g.strokeStyle=dark?'#59657360':'#ffffffaa'; g.lineWidth=.55; g.stroke();
    if (borders) {
      g.save(); g.beginPath(); surfacePath(borders); g.setLineDash([2, 3]);
      g.lineWidth = .7; g.lineCap = 'round';
      g.strokeStyle = dark ? '#bdcddd38' : '#74839755'; g.stroke(); g.restore();
    }
    const light=g.createRadialGradient(cx-r*.4,cy-r*.55,0,cx,cy,r);
    light.addColorStop(0,dark?'#d8eaff10':'#ffffff70'); light.addColorStop(.65,'#ffffff00'); light.addColorStop(1,dark?'#00000066':'#7c8b9b20');
    sphere(r); g.fillStyle=light; g.fill(); g.restore();
    sphere(r-.5); g.strokeStyle=dark?'#ffffff10':'#ffffffb3';g.lineWidth=1;g.stroke();
    }
    ctx.drawImage(surface,0,0,surface.width,surface.height,0,0,width,height);
  }
  function stopFlight() {
    flight = null; delete root.dataset.flight;
  }
  function startFlight() {
    if (!loaded || flight) return;
    const origin = cities.find(city => city.kind === 'origin');
    const home = cities.find(city => city.kind === 'home');
    if (!origin || !home) return;
    interacted = true;
    const interpolate = d3.geoInterpolate(origin.coordinates,home.coordinates);
    const midpoint = interpolate(.5);
    const fits = [origin,home].every(city => {
      if (d3.geoDistance(city.coordinates,[longitude,latitude]) > 1.2) return false;
      const p = projection(city.coordinates);
      return p[0]>42 && p[0]<width-42 && p[1]>80 && p[1]<height-90;
    });
    // A wider composition on touch screens leaves the route above the photo card.
    if(width<600 || !fits || zoom>1.2) {
      target = {longitude:midpoint[0],latitude:clamp(midpoint[1]-(width<600?36:20),-65,65),zoom:1};
    } else target = null;
    flight = {origin,home,interpolate,elapsed:0,still:reduced.matches};
    root.dataset.flight = reduced.matches ? 'arrived' : 'flying';
    status.textContent = language==='de'
      ? name(origin)+' → '+name(home)+'. Von meiner Heimat zu meinem heutigen Zuhause.'
      : name(origin)+' → '+name(home)+'. From my hometown to my home today.';
    requestDraw();
  }
  function flightPoint(t) {
    const coordinates = flight.interpolate(t);
    const p = projection(coordinates);
    const lift = Math.sin(Math.PI*t)*Math.min(76,radius*zoom*.17);
    return {x:p[0],y:p[1]-lift,front:d3.geoDistance(coordinates,[longitude,latitude])<Math.PI/2-.015};
  }
  function drawFlight() {
    if(!flight) return;
    const age=flight.elapsed;
    const progress=flight.still?1:clamp((age-250)/flightDuration,0,1);
    const travelled=progress*progress*(3-2*progress);
    const arrival=clamp((age-flightDuration-250)/1500,0,1);
    const opacity=flight.still?1:1-clamp((age-6200)/900,0,1);
    const route=(from,to)=>{
      ctx.beginPath();let pen=false;
      const steps=Math.max(2,Math.ceil((to-from)*90));
      for(let i=0;i<=steps;i++){
        const p=flightPoint(from+(to-from)*i/steps);
        if(!p.front){pen=false;continue;}
        if(pen)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);
        pen=true;
      }
    };
    ctx.save();ctx.globalAlpha=opacity;ctx.lineCap='round';ctx.lineJoin='round';
    route(0,1);ctx.setLineDash([2,5]);ctx.strokeStyle=dark?'#ffb57b65':'#d378354a';ctx.lineWidth=1;ctx.stroke();ctx.setLineDash([]);
    route(0,travelled);ctx.strokeStyle=dark?'#ffac6d':'#ef873f';ctx.lineWidth=1.6;ctx.stroke();
    if(!flight.still && progress>0 && progress<1){
      const p=flightPoint(travelled),next=flightPoint(Math.min(1,travelled+.003));
      if(p.front){
        const angle=Math.atan2(next.y-p.y,next.x-p.x);
        const scale=(width<600?.68:.88)*(.6+.4*Math.sin(Math.PI*progress));
        // A soft, offset shadow makes the plane float above the route.
        ctx.save();ctx.translate(p.x+2,p.y+7);ctx.rotate(angle);ctx.scale(scale,scale);
        ctx.fillStyle='#24374b14';ctx.fill(aircraft);ctx.restore();
        ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);ctx.scale(scale,scale);
        ctx.globalAlpha=opacity*Math.min(1,progress*10,(1-progress)*10);
        ctx.shadowColor=dark?'#0007':'#34516b44';ctx.shadowBlur=5;ctx.shadowOffsetY=2;
        ctx.fillStyle=dark?'#f5f8ff':'#ffffff';ctx.fill(aircraft);
        ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.strokeStyle=dark?'#ffbc86':'#dd823f';ctx.lineWidth=1.3;ctx.stroke(aircraft);
        ctx.restore();
      }
    }
    if(progress===1){
      const p=projection(flight.home.coordinates);
      if(d3.geoDistance(flight.home.coordinates,[longitude,latitude])<Math.PI/2-.015){
        circle(p[0],p[1],flight.still?11:8+arrival*23);
        ctx.strokeStyle=dark?'#ffb57b':'#ef873f';ctx.lineWidth=1.3;ctx.globalAlpha=opacity*(flight.still?.4:1-arrival);ctx.stroke();
      }
    }
    ctx.restore();
  }
  function draw() {
    if (!loaded || !width) return;
    ctx.setTransform(ratio,0,0,ratio,0,0); ctx.clearRect(0,0,width,height);
    project();
    drawSurface();
    visiblePoints=[];
    cities.forEach(city => {
      if (d3.geoDistance(city.coordinates,[longitude,latitude]) > Math.PI/2-.035) return;
      const p=projection(city.coordinates);
      if (p[0]<-10 || p[0]>width+10 || p[1]<-10 || p[1]>height-65) return;
      visiblePoints.push({city,p});
      if (city.kind !== 'visited') return; // Special cities use the orange dot and pin above the canvas.
      const selected=city===active || city===hovered;
      if (selected) {
        circle(p[0],p[1],8); ctx.fillStyle=city.kind==='origin'?'#f47a3624':'#007aff20'; ctx.fill();
      }
      circle(p[0],p[1],selected?4:2.6);
      ctx.fillStyle=city.kind==='origin'?'#f47a36':dark?'#62b0ff':'#007aff';ctx.fill();
      if(selected) {ctx.strokeStyle=dark?'#222b35':'#fff';ctx.lineWidth=1.6;ctx.stroke();}
    });
    drawFlight();
    special.forEach(button=>{
      const point=visiblePoints.find(p=>p.city.kind===button.dataset.globeSpecial);
      if(point) placeMarker(button,point.p,point.city.kind);
      else {button.style.opacity='0';button.style.visibility='hidden';}
    });
    const highlight=hovered || active;
    const spot=visiblePoints.find(p=>p.city===highlight);
    if(spot && highlight !== dismissed && !pointer?.moved) {
      tooltip.hidden=false;
      updatePreview(highlight);
      const journey = flight && highlight.kind==='origin';
      const tx=clamp(journey && width>=600 ? spot.p[0]+24 : spot.p[0]-tooltip.offsetWidth/2,8,width-tooltip.offsetWidth-8);
      const above = spot.p[1]-tooltip.offsetHeight-(highlight.kind==='home'?34:16);
      const below = spot.p[1]+18;
      const preferred = above < 8 && below+tooltip.offsetHeight < height-65 ? below : above;
      const photoY = journey ? (width<600 ? height-tooltip.offsetHeight-65 : spot.p[1]-tooltip.offsetHeight*.5) : preferred;
      const ty=clamp(photoY,8,Math.max(8,height-tooltip.offsetHeight-65));
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
    if(flight && !flight.still){
      if(reduced.matches){flight.still=true;root.dataset.flight='arrived';dirty=true;}
      else {
        flight.elapsed+=dt;moving=true;
        if(flight.elapsed>=flightDuration+250 && root.dataset.flight!=='arrived'){
          root.dataset.flight='arrived';
          status.textContent=name(flight.home)+(language==='de'?' — heute zu Hause.':' — home now.');
        }
        if(flight.elapsed>=7100)stopFlight();
      }
    }
    if(dirty || moving) { draw(); dirty=false; }
    if(moving) raf=requestAnimationFrame(frame);
  }
  function focusCity(city) {
    clearTimeout(hoverTimer); dismissed=null; interacted=true; hovered=null; active=city;
    picker.value=String(city.id);
    if(city.kind==='origin'){ startFlight(); requestDraw(); return; }
    stopFlight();
    target={longitude:city.coordinates[0],latitude:city.coordinates[1]-(width<600?(city.photo?-9:4):13),zoom:width<600?1.65:1.7};
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
    clearTimeout(hoverTimer); dismissed=null; stopFlight(); pauseIdle(); hovered=null;
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
      const next=nearest(event);if(next) showHover(next); else clearHoverLater();
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
  canvas.addEventListener('pointerleave',clearHoverLater);
  picker.addEventListener('change',()=>{const city=cities.find(c=>String(c.id)===picker.value);if(city)focusCity(city);else reset();});
  special.forEach(button => {
    const city = () => cities.find(c => c.kind === button.dataset.globeSpecial);
    const show = () => showHover(city() || null);
    const hide = clearHoverLater;
    button.addEventListener('pointerenter', event => { if(event.pointerType!=='touch') show(); });
    button.addEventListener('pointerleave', hide);
    button.addEventListener('focus', show);
    button.addEventListener('blur', hide);
    button.addEventListener('click', () => { const place = city(); if (place) focusCity(place); });
  });
  root.querySelectorAll('[data-globe-zoom]').forEach(button=>button.addEventListener('click',()=>{
    stopFlight();interacted=true;target={longitude,latitude,zoom:clamp((target?.zoom || zoom)+Number(button.dataset.globeZoom)*.5,1,3.5)};requestDraw();
  }));
  function reset() {stopFlight();clearTimeout(hoverTimer);dismissed=null;interacted=true;active=null;hovered=null;picker.value='';target={longitude:32,latitude:36,zoom:1};requestDraw();}
  root.querySelector('[data-globe-reset]').addEventListener('click',reset);
  function loadScript(file) {
    return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=asset('vendor/globe/'+file);s.onload=resolve;s.onerror=reject;document.head.append(s);});
  }
  async function init() {
    if(loading || loaded) return;loading=true;
    try {
      const [world,places,boundaries]=await Promise.all([
        fetch(asset('data/globe-land-50m.json')).then(r=>{if(!r.ok)throw Error(r.status);return r.json();}),
        fetch(asset('data/travel-places.json?v=20261028-photos')).then(r=>{if(!r.ok)throw Error(r.status);return r.json();}),
        fetch(asset('data/globe-borders-50m.json')).then(r=>{if(!r.ok)throw Error(r.status);return r.json();}).catch(()=>null),
        loadScript('d3-array.min.js').then(()=>loadScript('d3-geo.min.js')),
        loadScript('topojson-client.min.js')
      ]);
      cities=places;land=topojson.feature(world,world.objects.land);borders=boundaries;
      projection=d3.geoOrthographic().clipAngle(90).precision(.45);
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
