(function(){
  "use strict";
  /* sticky header */
  var header = document.getElementById('siteHeader');
  if (header){
    var onScroll = function(){ header.classList.toggle('solid', window.scrollY > 12); };
    onScroll(); window.addEventListener('scroll', onScroll, {passive:true});
  }

  /* mobile nav */
  var toggle = document.getElementById('navToggle');
  var mobile = document.getElementById('mobileNav');
  if (toggle && mobile){
    toggle.addEventListener('click', function(){
      var open = mobile.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    mobile.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', function(){
        mobile.classList.remove('open');
        toggle.setAttribute('aria-expanded','false');
      });
    });
  }

  /* reveal on scroll */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if (e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, {threshold:.15, rootMargin:'0px 0px -6% 0px'});
    reveals.forEach(function(el){ io.observe(el); });
  } else {
    reveals.forEach(function(el){ el.classList.add('in'); });
  }

  /* featured-work carousel (portfolio page only) */
  var viewport = document.getElementById('carViewport');
  var prev = document.getElementById('carPrev');
  var next = document.getElementById('carNext');
  var dotsEl = document.getElementById('carDots');
  if (viewport && prev && next && dotsEl){
    var dots = Array.prototype.slice.call(dotsEl.children);
    function cardStep(){
      var t = document.getElementById('carTrack');
      var first = t.children[0], second = t.children[1];
      return second ? second.offsetLeft - first.offsetLeft : first.offsetWidth;
    }
    function count(){ return document.getElementById('carTrack').children.length; }
    function index(){ return Math.max(0, Math.min(count()-1, Math.round(viewport.scrollLeft / cardStep()))); }
    function render(){
      var cur = index();
      prev.disabled = viewport.scrollLeft <= 4;
      next.disabled = viewport.scrollLeft >= viewport.scrollWidth - viewport.clientWidth - 4;
      dots.forEach(function(d,i){ d.classList.toggle('active', i === cur); });
    }
    function go(i){
      var maxIndex = count()-1;
      i = Math.max(0, Math.min(maxIndex, i));
      viewport.scrollTo({left: i * cardStep(), behavior:'smooth'});
    }
    prev.addEventListener('click', function(){ go(index()-1); });
    next.addEventListener('click', function(){ go(index()+1); });
    dots.forEach(function(d, i){ d.addEventListener('click', function(){ go(i); }); });
    viewport.addEventListener('scroll', render, {passive:true});
    window.addEventListener('resize', render);
    render();
  }

  /* consultation form (consult.html) */
  var cform = document.getElementById('consultForm');
  if (cform){
    var cta = document.getElementById('waSend');
    if (cta){
      cta.addEventListener('click', function(){
        var g = function(n){
          var el = cform.querySelector('[name="' + n + '"]');
          return el ? el.value.trim() : '';
        };
        var lines = [
          'Hi Billy Data Genius! I would like a free consultation.',
          'Name: ' + (g('name') || '(not given)'),
          'Email: ' + (g('email') || '(not given)'),
          'Phone: ' + (g('phone') || '(not given)'),
          'Organisation: ' + (g('organisation') || '(not given)'),
          'Help needed: ' + g('service'),
          'Message: ' + (g('message') || '(not given)')
        ].join('\n');
        window.open('https://wa.me/27810606050?text=' + encodeURIComponent(lines), '_blank');
      });
    }
    var ok = document.getElementById('formSuccess');
    var sent = window.location.search.indexOf('sent=1') !== -1;
    if (sent && ok){
      cform.style.display = 'none';
      ok.classList.add('show');
      var sec = document.getElementById('form-sec') || document.querySelector('.form-sec');
      if (sec) sec.scrollIntoView({ block: 'start' });
    }
  }
})();
/* ---------- fixed vertical brand band (desktop; decorative, non-interactive) ---------- */
(function(){
  var b = document.createElement('div');
  b.className = 'bdg-sideband';
  b.setAttribute('aria-hidden', 'true');
  b.innerHTML = '<b>BILLY DATA GENIUS</b>';
  document.body.appendChild(b);
})();

/* ---------- services: expandable detail panels + deep links ---------- */
(function(){
  var cards = document.querySelectorAll('.cards .card');
  if (!cards.length) return;
  var panels = document.querySelectorAll('.svc-panel');
  function setBtn(card, open){
    var b = card.querySelector('button.learn');
    if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function closeAll(){
    for (var i = 0; i < panels.length; i++) panels[i].hidden = true;
    for (var j = 0; j < cards.length; j++) setBtn(cards[j], false);
  }
  function toggle(card, scroll){
    var panel = document.getElementById(card.id + '-panel');
    if (!panel) return;
    var wasOpen = !panel.hidden;
    closeAll();
    if (wasOpen) return;
    panel.hidden = false;
    setBtn(card, true);
    if (scroll) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  for (var k = 0; k < cards.length; k++){
    (function(card){
      var btn = card.querySelector('button.learn');
      if (!btn) return;
      btn.setAttribute('aria-controls', card.id + '-panel');
      btn.addEventListener('click', function(){ toggle(card, true); });
    })(cards[k]);
  }
  function fromHash(){
    var h = window.location.hash || '';
    if (h.indexOf('#svc-') !== 0) return;
    var card = document.getElementById(h.slice(1));
    if (card && card.classList.contains('card')) toggle(card, true);
  }
  window.addEventListener('hashchange', fromHash);
  if (window.location.hash) window.setTimeout(fromHash, 80);
})();
