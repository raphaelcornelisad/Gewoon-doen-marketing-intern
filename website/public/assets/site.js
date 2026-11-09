/* Gewoon Doen Marketing — interacties. Geen libraries; alles werkt ook zonder JS (inhoud blijft zichtbaar). */
(function () {
  'use strict';
  var d = document, html = d.documentElement;
  html.classList.remove('no-js');
  var rustig = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var opslaan = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };
  var lezen = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };

  /* Header: schaduw bij scrollen + hoogte van de aankondigingsbalk voor het mobiele menu */
  var header = d.querySelector('.header');
  var aank = d.querySelector('.aankondiging');
  function opScroll() {
    if (header) header.classList.toggle('gescrold', window.scrollY > 8);
    var cta = d.querySelector('.mobiele-cta');
    if (cta) cta.classList.toggle('zien', window.scrollY > 600);
  }
  window.addEventListener('scroll', opScroll, { passive: true });
  opScroll();
  function aankHoogte() {
    var h = aank ? Math.max(0, aank.getBoundingClientRect().bottom) : 0;
    html.style.setProperty('--aank-h', h + 'px');
  }

  /* Mobiel menu */
  var menuknop = d.querySelector('.menuknop');
  if (menuknop) menuknop.addEventListener('click', function () {
    aankHoogte();
    var open = d.body.classList.toggle('menu-open');
    menuknop.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  d.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      d.body.classList.remove('menu-open');
      if (menuknop) menuknop.setAttribute('aria-expanded', 'false');
      d.querySelectorAll('.dropdown.open').forEach(function (x) { x.classList.remove('open'); x.querySelector('button').setAttribute('aria-expanded', 'false'); });
    }
  });

  /* Dropdown Specialisaties: klik (touch) + hover (muis) */
  d.querySelectorAll('.dropdown').forEach(function (dd) {
    var knop = dd.querySelector('button');
    var zet = function (open) { dd.classList.toggle('open', open); knop.setAttribute('aria-expanded', open ? 'true' : 'false'); };
    knop.addEventListener('click', function (e) { e.stopPropagation(); zet(!dd.classList.contains('open')); });
    if (window.matchMedia('(hover: hover) and (min-width: 1021px)').matches) {
      var t;
      dd.addEventListener('mouseenter', function () { clearTimeout(t); zet(true); });
      dd.addEventListener('mouseleave', function () { t = setTimeout(function () { zet(false); }, 160); });
    }
  });
  d.addEventListener('click', function (e) {
    d.querySelectorAll('.dropdown.open').forEach(function (dd) { if (!dd.contains(e.target)) { dd.classList.remove('open'); dd.querySelector('button').setAttribute('aria-expanded', 'false'); } });
  });

  /* Onthullen bij scrollen */
  var onthul = d.querySelectorAll('.onthul');
  if ('IntersectionObserver' in window && !rustig) {
    var io = new IntersectionObserver(function (items) {
      items.forEach(function (it) { if (it.isIntersecting) { it.target.classList.add('zien'); io.unobserve(it.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    onthul.forEach(function (el) { io.observe(el); });
  } else onthul.forEach(function (el) { el.classList.add('zien'); });

  /* VSL: poster -> iframe; daarna meeschuivende mini-speler rechtsonder */
  d.querySelectorAll('[data-vsl]').forEach(function (plek) {
    var vsl = plek.querySelector('.vsl');
    var poster = plek.querySelector('.vsl-poster');
    var src = plek.getAttribute('data-vsl');
    var gesloten = false, speelt = false;
    poster.addEventListener('click', function () {
      if (!src) {
        if (!plek.querySelector('.vsl-melding')) {
          var m = d.createElement('div'); m.className = 'vsl-melding'; m.setAttribute('role', 'status');
          m.textContent = 'De video wordt binnenkort toegevoegd. Plan alvast een kennismaking in.';
          vsl.appendChild(m);
        }
        return;
      }
      var f = d.createElement('iframe');
      f.src = src + (src.indexOf('?') > -1 ? '&' : '?') + 'autoplay=1';
      f.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
      f.allowFullscreen = true;
      f.title = 'Video: zo werkt Gewoon Doen Marketing';
      poster.replaceWith(f);
      speelt = true;
    });
    var sluit = plek.querySelector('.vsl-sluit');
    if (sluit) sluit.addEventListener('click', function () {
      gesloten = true; vsl.classList.remove('mini');
      var f = vsl.querySelector('iframe'); if (f) f.src = f.src.replace('autoplay=1', 'autoplay=0');
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (items) {
        var zichtbaar = items[0].isIntersecting;
        vsl.classList.toggle('mini', speelt && !gesloten && !zichtbaar && window.innerWidth > 360);
      }, { threshold: 0.25 }).observe(plek);
    }
  });

  /* Tijdlijn: lijn vult zich mee met het scrollen, stappen lichten op */
  d.querySelectorAll('.tijdlijn').forEach(function (lijst) {
    var balk = lijst.querySelector('.tijdlijn-voortgang');
    var stappen = lijst.querySelectorAll('.stap');
    function update() {
      var r = lijst.getBoundingClientRect(), vh = window.innerHeight;
      var p = Math.min(1, Math.max(0, (vh * 0.6 - r.top) / r.height));
      if (balk) balk.style.setProperty('height', (p * 100) + '%');
      stappen.forEach(function (s) { s.classList.toggle('actief', s.getBoundingClientRect().top < vh * 0.62); });
    }
    if (rustig) { stappen.forEach(function (s) { s.classList.add('actief'); }); if (balk) balk.style.height = '100%'; return; }
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  });

  /* Kantelende mockups (muis) */
  if (!rustig && window.matchMedia('(hover: hover)').matches) {
    d.querySelectorAll('[data-kantel]').forEach(function (el) {
      var max = parseFloat(el.getAttribute('data-kantel')) || 8;
      var doel = el.querySelector('.kantel') || el;
      var zone = el.closest('[data-kantel-zone]') || el;
      zone.addEventListener('mousemove', function (e) {
        var r = zone.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        doel.style.transform = 'rotateY(' + (x * max * 2) + 'deg) rotateX(' + (-y * max * 2) + 'deg)';
        el.style.setProperty('--mx', ((x + 0.5) * 100) + '%');
        el.style.setProperty('--my', ((y + 0.5) * 100) + '%');
      });
      zone.addEventListener('mouseleave', function () { doel.style.transform = ''; });
    });
  }

  /* WhatsApp-mockup: berichten komen een voor een binnen */
  d.querySelectorAll('.wa-chat').forEach(function (chat) {
    var berichten = chat.querySelectorAll('.bericht');
    if (rustig || !('IntersectionObserver' in window)) { berichten.forEach(function (b) { b.classList.add('zien'); }); return; }
    var gestart = false;
    new IntersectionObserver(function (items) {
      if (!items[0].isIntersecting || gestart) return;
      gestart = true;
      berichten.forEach(function (b, i) { setTimeout(function () { b.classList.add('zien'); }, 400 + i * 900); });
    }, { threshold: 0.4 }).observe(chat);
  });

  /* Insights-filter */
  var filters = d.querySelector('.filters');
  if (filters) filters.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var cat = b.getAttribute('data-cat');
    filters.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    d.querySelectorAll('.artikel-kaart').forEach(function (k) { k.hidden = cat !== 'alle' && k.getAttribute('data-cat') !== cat; });
  });

  /* Inhoudsopgave: actieve kop */
  var toc = d.querySelectorAll('.inhoudsopgave ol a');
  if (toc.length && 'IntersectionObserver' in window) {
    var koppen = Array.prototype.map.call(toc, function (a) { return d.getElementById(a.getAttribute('href').slice(1)); }).filter(Boolean);
    var obs = new IntersectionObserver(function (items) {
      items.forEach(function (it) {
        if (it.isIntersecting) toc.forEach(function (a) { a.classList.toggle('actief', a.getAttribute('href') === '#' + it.target.id); });
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    koppen.forEach(function (k) { obs.observe(k); });
  }
  var tocKnop = d.querySelector('.inhoudsopgave button');
  if (tocKnop) tocKnop.addEventListener('click', function () {
    var box = tocKnop.closest('.inhoudsopgave'); var open = box.classList.toggle('open');
    tocKnop.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  /* Lead magnet-formulier -> /api/lead -> /training */
  d.querySelectorAll('form[data-lead]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fout = form.querySelector('.fout');
      var knop = form.querySelector('button[type="submit"]');
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = String(v).trim(); });
      data.pagina = location.pathname;
      var bron = new URLSearchParams(location.search);
      data.src = bron.get('utm_source') || bron.get('src') || lezen('gd_src') || '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || '')) { fout.textContent = 'Vul een geldig e-mailadres in.'; fout.hidden = false; return; }
      if (!data.voornaam) { fout.textContent = 'Vul je voornaam in.'; fout.hidden = false; return; }
      fout.hidden = true; knop.disabled = true; var oud = knop.innerHTML; knop.textContent = 'Even geduld…';
      fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.error || 'fout');
          opslaan('gd_training', '1');
          opslaan('gd_naam', data.voornaam);
          location.href = form.getAttribute('data-volgende') || '/training';
        })
        .catch(function () {
          knop.disabled = false; knop.innerHTML = oud;
          fout.textContent = 'Er ging iets mis bij het versturen. Probeer het opnieuw of mail ons.'; fout.hidden = false;
        });
    });
  });
  /* Bron onthouden (bijv. ?utm_source=instagram) */
  var q = new URLSearchParams(location.search).get('utm_source');
  if (q) opslaan('gd_src', q.slice(0, 40));

  /* Trainingspagina: begroeting met voornaam; zonder aanmelding eerst het formulier */
  var poort = d.querySelector('[data-training-poort]');
  if (poort) {
    var toegang = lezen('gd_training') === '1' || /[?&]t=1/.test(location.search);
    if (toegang) { opslaan('gd_training', '1'); d.body.classList.add('heeft-toegang'); }
    var naam = lezen('gd_naam');
    d.querySelectorAll('[data-voornaam]').forEach(function (el) { if (naam) el.textContent = ', ' + naam; });
  }
})();
