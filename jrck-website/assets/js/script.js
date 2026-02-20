/* ============================================================
   JRCK – Jawa Riders Club Kerala | Main JavaScript
   Fixes: Hero parallax (no background-attachment:fixed),
          Premium scoped cursor, Smooth scroll, Performance
   ============================================================ */

(function () {
  'use strict';

  /* ============================================================
     UTILITIES
  ============================================================ */
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => (ctx || document).querySelectorAll(sel);

  /* Detect touch / mobile */
  const isMobile = () =>
    window.matchMedia('(hover: none), (pointer: coarse)').matches ||
    window.innerWidth <= 768;

  /* rAF throttle for scroll/mouse handlers */
  function rafThrottle(fn) {
    let ticking = false;
    return function (...args) {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => { fn.apply(this, args); ticking = false; });
      }
    };
  }

  /* ============================================================
     1. STICKY HEADER
  ============================================================ */
  const header = $('#header');
  if (header) {
    const onScroll = rafThrottle(() => {
      header.classList.toggle('scrolled', window.scrollY > 50);
    });
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ============================================================
     2. MOBILE MENU
  ============================================================ */
  const hamburger = $('.hamburger');
  const navMobile = $('.nav-mobile');
  if (hamburger && navMobile) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      navMobile.classList.toggle('open');
      document.body.style.overflow =
        navMobile.classList.contains('open') ? 'hidden' : '';
    });
    $$('a', navMobile).forEach(link =>
      link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navMobile.classList.remove('open');
        document.body.style.overflow = '';
      })
    );
  }

  /* ============================================================
     3. HERO PARALLAX — JS translateY, no background-attachment:fixed
        Moves bg up as user scrolls down. GPU-composited only.
  ============================================================ */
  const heroBg = $('#heroBg');
  const heroSection = $('#heroSection');

  if (heroBg && heroSection) {
    /* Scroll parallax — only while hero is visible */
    const scrollParallax = rafThrottle(() => {
      const heroH = heroSection.offsetHeight;
      const scrolled = window.scrollY;
      /* Only run while hero is in view */
      if (scrolled > heroH) return;
      /* Parallax factor: bg moves at 35% of scroll speed */
      const offset = scrolled * 0.35;
      heroBg.style.transform = `translateZ(0) translateY(${offset}px)`;
    });

    window.addEventListener('scroll', scrollParallax, { passive: true });

    /* Mouse-move parallax — subtle tilt of bg following cursor */
    let mouseParallaxActive = false;
    if (!isMobile()) {
      heroSection.addEventListener('mousemove', rafThrottle((e) => {
        const rect = heroSection.getBoundingClientRect();
        /* Normalise mouse position to -1 … +1 */
        const nx = ((e.clientX - rect.left) / rect.width  - 0.5) * 2;
        const ny = ((e.clientY - rect.top)  / rect.height - 0.5) * 2;
        /* Max bg shift: ±18px horizontal, ±12px vertical */
        const px = nx * 18;
        const py = ny * 12;
        const scrollOffset = window.scrollY * 0.35;
        heroBg.style.transform =
          `translateZ(0) translate(${px}px, ${scrollOffset + py}px)`;
      }), false);

      heroSection.addEventListener('mouseleave', () => {
        const scrollOffset = window.scrollY * 0.35;
        heroBg.style.transform = `translateZ(0) translateY(${scrollOffset}px)`;
      });
    }
  }

  /* ============================================================
     4. PREMIUM HERO CURSOR — scoped to hero section only
        Dot + lagging ring + canvas light trail
  ============================================================ */
  if (!isMobile() && heroSection) {
    const cursorDot  = $('#heroCursor');
    const cursorRing = $('#heroCursorRing');
    const canvas     = $('#hero-trail-canvas');

    if (!cursorDot || !cursorRing || !canvas) goto_next: {
      break goto_next; // Skip if elements missing
    }

    /* ----- Canvas trail setup ----- */
    const ctx2d = canvas.getContext('2d');
    let cw = 0, ch = 0;

    function resizeCanvas() {
      cw = canvas.width  = heroSection.offsetWidth;
      ch = canvas.height = heroSection.offsetHeight;
    }
    resizeCanvas();
    new ResizeObserver(resizeCanvas).observe(heroSection);

    /* Trail particles */
    const MAX_TRAIL = 28;
    const trail = []; // [{x, y, age, alpha}]
    let mx = -999, my = -999; // mouse in hero-local coords
    let dotX = -999, dotY = -999; // current dot screen pos
    let ringX = -999, ringY = -999; // lagging ring
    let isInsideHero = false;
    let animRafId = null;

    /* ----- Cursor state ----- */
    function showCursor() {
      cursorDot.classList.add('visible');
      cursorRing.classList.add('visible');
      isInsideHero = true;
    }
    function hideCursor() {
      cursorDot.classList.remove('visible');
      cursorRing.classList.remove('visible');
      isInsideHero = false;
    }

    heroSection.addEventListener('mouseenter', showCursor);
    heroSection.addEventListener('mouseleave', hideCursor);

    /* ----- Mouse tracking ----- */
    heroSection.addEventListener('mousemove', (e) => {
      mx = e.clientX;
      my = e.clientY;

      const rect = heroSection.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;

      /* Add to trail every few px moved */
      const last = trail[trail.length - 1];
      if (!last || Math.hypot(localX - last.x, localY - last.y) > 6) {
        trail.push({ x: localX, y: localY, age: 0 });
        if (trail.length > MAX_TRAIL) trail.shift();
      }
    }, { passive: true });

    /* ----- Hover expand on interactive elements ----- */
    const heroInteractives = $$('a, button', heroSection);
    heroInteractives.forEach(el => {
      el.addEventListener('mouseenter', () => {
        cursorDot.classList.add('hero-cursor--hover');
        cursorRing.classList.add('hero-cursor-ring--hover');
      });
      el.addEventListener('mouseleave', () => {
        cursorDot.classList.remove('hero-cursor--hover');
        cursorRing.classList.remove('hero-cursor-ring--hover');
      });
    });

    /* ----- Animation loop ----- */
    const RING_LERP = 0.1;  // ring lag factor (lower = laggier)

    function drawTrail() {
      ctx2d.clearRect(0, 0, cw, ch);

      if (!isInsideHero || trail.length < 2) {
        /* Age & clean even when mouse is static */
        for (let i = trail.length - 1; i >= 0; i--) {
          trail[i].age++;
          if (trail[i].age > 30) trail.splice(i, 1);
        }
        return;
      }

      /* Draw each segment as a glowing tapered line */
      for (let i = 1; i < trail.length; i++) {
        const p0 = trail[i - 1];
        const p1 = trail[i];
        /* Normalise age: trail fades from head to tail */
        const t = i / trail.length;
        const alpha = t * 0.5; // 0→0.5 across trail
        const lineWidth = t * 4 + 0.5;

        ctx2d.beginPath();
        ctx2d.moveTo(p0.x, p0.y);
        ctx2d.lineTo(p1.x, p1.y);
        ctx2d.strokeStyle = `rgba(246,126,42,${alpha.toFixed(3)})`;
        ctx2d.lineWidth = lineWidth;
        ctx2d.lineCap = 'round';
        ctx2d.shadowColor = 'rgba(246,126,42,0.6)';
        ctx2d.shadowBlur = 8;
        ctx2d.stroke();
        ctx2d.shadowBlur = 0;

        /* Age the point */
        p0.age++;
      }

      /* Remove old particles */
      for (let i = trail.length - 1; i >= 0; i--) {
        if (trail[i].age > 40) trail.splice(i, 1);
      }
    }

    function animateCursor() {
      /* Move dot instantly to mouse */
      if (isInsideHero) {
        dotX = mx;
        dotY = my;
        cursorDot.style.transform = `translate(calc(${dotX}px - 50%), calc(${dotY}px - 50%))`;

        /* Ring lags behind */
        ringX += (mx - ringX) * RING_LERP;
        ringY += (my - ringY) * RING_LERP;
        cursorRing.style.transform = `translate(calc(${ringX}px - 50%), calc(${ringY}px - 50%))`;
      }

      drawTrail();
      animRafId = requestAnimationFrame(animateCursor);
    }

    /* Init ring position at current dot */
    ringX = mx; ringY = my;
    animateCursor();
  }

  /* ============================================================
     5. SCROLL ANIMATIONS (Intersection Observer)
  ============================================================ */
  const animElements = $$('.anim-fade, .anim-left, .anim-right');
  if (animElements.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    animElements.forEach(el => observer.observe(el));
  }

  /* ============================================================
     6. ACTIVE NAV LINK
  ============================================================ */
  const currentFile = location.pathname.split('/').pop() || 'index.html';
  $$('.nav-links a').forEach(link => {
    if (link.getAttribute('href') === currentFile) link.classList.add('active');
  });

  /* ============================================================
     7. TESTIMONIALS SLIDER
  ============================================================ */
  const track = $('.testimonials-track');
  if (track) {
    const cards    = $$('.testimonial-card', track);
    const dots     = $$('.slider-dot');
    const prevBtn  = $('.slider-prev');
    const nextBtn  = $('.slider-next');
    let current    = 0;

    function getVisible() {
      return window.innerWidth < 768 ? 1 : window.innerWidth < 1100 ? 2 : 3;
    }

    function updateSlider() {
      const cardEl = cards[0];
      if (!cardEl) return;
      const gapPx = 24;
      const cardWidth = cardEl.getBoundingClientRect().width + gapPx;
      track.style.transform = `translateX(-${current * cardWidth}px)`;
      dots.forEach((d, i) => d.classList.toggle('active', i === current));
    }

    function maxIndex() {
      return Math.max(0, cards.length - getVisible());
    }

    if (prevBtn) prevBtn.addEventListener('click', () => {
      current = Math.max(0, current - 1); updateSlider();
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
      current = Math.min(maxIndex(), current + 1); updateSlider();
    });
    dots.forEach((dot, i) => dot.addEventListener('click', () => {
      current = i; updateSlider();
    }));

    /* Auto-play */
    let autoplay = setInterval(() => {
      current = current >= maxIndex() ? 0 : current + 1;
      updateSlider();
    }, 5000);
    track.addEventListener('mouseenter', () => clearInterval(autoplay));
    track.addEventListener('mouseleave', () => {
      autoplay = setInterval(() => {
        current = current >= maxIndex() ? 0 : current + 1;
        updateSlider();
      }, 5000);
    });

    window.addEventListener('resize', rafThrottle(() => {
      current = 0;
      updateSlider();
    }));
  }

  /* ============================================================
     8. FAQ ACCORDION
  ============================================================ */
  $$('.accordion').forEach(acc => {
    const hdr = $('.accordion-header', acc);
    if (!hdr) return;
    hdr.addEventListener('click', () => {
      const isOpen = acc.classList.contains('open');
      /* Close all */
      $$('.accordion').forEach(a => {
        a.classList.remove('open');
        const b = $('.accordion-body', a);
        if (b) b.style.maxHeight = null;
      });
      /* Toggle clicked */
      if (!isOpen) {
        acc.classList.add('open');
        const body = $('.accordion-body', acc);
        if (body) body.style.maxHeight = body.scrollHeight + 'px';
      }
    });
  });

  /* ============================================================
     9. FAQ CATEGORY FILTER
  ============================================================ */
  const faqCatBtns = $$('.faq-cat-btn');
  const faqGroups  = $$('.faq-group');
  faqCatBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      faqCatBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.category;
      faqGroups.forEach(g => {
        g.style.display =
          (target === 'all' || g.dataset.group === target) ? 'block' : 'none';
      });
    });
  });

  /* ============================================================
     10. EVENT / BLOG CATEGORY FILTER
  ============================================================ */
  $$('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      /* Scope to same filter group */
      const group = btn.closest('div, section');
      if (!group) return;
      group.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      $$('.filterable-card').forEach(card => {
        card.style.display =
          (filter === 'all' || card.dataset.category === filter) ? 'block' : 'none';
      });
    });
  });

  /* ============================================================
     11. FORMS — submit feedback
  ============================================================ */
  $$('.jrck-form').forEach(form => {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const btn = $('button[type="submit"]', form);
      if (!btn) return;
      const orig = btn.innerHTML;
      btn.innerHTML = '✓ Submitted Successfully!';
      btn.style.background = '#28a745';
      btn.disabled = true;
      setTimeout(() => {
        btn.innerHTML = orig;
        btn.style.background = '';
        btn.disabled = false;
        form.reset();
      }, 3500);
    });
  });

  /* ============================================================
     12. SMOOTH SCROLL for anchor links
  ============================================================ */
  $$('a[href^="#"]').forEach(a => {
    a.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const top = target.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  /* ============================================================
     13. COUNTER ANIMATION
  ============================================================ */
  $$('.stat-number').forEach(el => {
    const raw    = el.textContent.trim();
    const target = parseInt(raw.replace(/\D/g, ''), 10);
    const suffix = raw.replace(/[0-9]/g, '');
    el.dataset.target = target;
    el.dataset.suffix = suffix;

    const counterObs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      counterObs.unobserve(el);
      const duration = 1600;
      const step = 16;
      const steps = duration / step;
      let cur = 0;
      const inc = target / steps;
      const timer = setInterval(() => {
        cur = Math.min(cur + inc, target);
        el.textContent = Math.floor(cur) + suffix;
        if (cur >= target) clearInterval(timer);
      }, step);
    }, { threshold: 0.6 });

    counterObs.observe(el);
  });

  /* ============================================================
     14. JS-BASED PARALLAX for .parallax-banner-bg and .cta-banner-bg
         Replaces the broken background-attachment:fixed approach.
  ============================================================ */
  const parallaxTargets = $$('.parallax-banner-bg, .cta-banner-bg, .page-hero-bg');

  if (parallaxTargets.length) {
    const scrollParallaxSections = rafThrottle(() => {
      parallaxTargets.forEach(el => {
        const parent = el.parentElement;
        const rect   = parent.getBoundingClientRect();
        /* Only animate when visible */
        if (rect.bottom < 0 || rect.top > window.innerHeight) return;
        /* How far through viewport: -1 (above) → 0 (center) → +1 (below) */
        const progress = (window.innerHeight / 2 - rect.top - rect.height / 2) / window.innerHeight;
        const offset = progress * 60; /* ±60px max travel */
        el.style.transform = `translateZ(0) translateY(${offset}px)`;
      });
    });

    window.addEventListener('scroll', scrollParallaxSections, { passive: true });
    scrollParallaxSections(); /* Initial call */
  }

})();
