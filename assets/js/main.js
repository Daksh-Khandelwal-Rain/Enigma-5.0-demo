window.tailwind = window.tailwind || {};
tailwind.config = {
    theme: {
      extend: {
        colors: {
          void: '#0C1210',
          panel: '#141B18',
          panel2: '#181F1B',
          parchment: '#EDE6D6',
          ink: '#E7E3D8',
          mute: '#8A9089',
          brass: '#B8894C',
          oxide: '#C24A3A',
          phosphor: '#8FD14F',
        },
        fontFamily: {
          display: ['"Big Shoulders Display"', 'sans-serif'],
          body: ['Inter', 'sans-serif'],
          mono: ['"JetBrains Mono"', 'monospace'],
        },
      },
    },
  };

document.addEventListener('DOMContentLoaded', () => {
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CIPHER_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#%&$';

  /* ---------- Subtle mechanical audio (optional, synthesized, no external files) ---------- */
  let actx = null;
  function audioCtx() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    }
    return actx;
  }
  function click(freq, dur, gainPeak, type) {
    try {
      const ctx = audioCtx();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(gainPeak, ctx.currentTime + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.02);
    } catch (e) { /* audio not available, fail silently */ }
  }
  const soundRelay = () => click(620, 0.09, 0.05, 'square');
  const soundLatch = () => click(180, 0.05, 0.06, 'square');
  const soundStamp = () => click(90, 0.14, 0.08, 'sine');
  const soundBad = () => click(140, 0.12, 0.05, 'sawtooth');

  function scrambleInto(el, finalText, opts = {}) {
    const { duration = 900, stepMs = 34, onDone = () => {} } = opts;
    if (reduceMotion || duration === 0) { el.textContent = finalText; onDone(); return; }
    const chars = finalText.split('');
    const totalSteps = Math.max(1, Math.floor(duration / stepMs));
    let step = 0;
    const revealAt = chars.map((_, i) => Math.floor((i / chars.length) * totalSteps * 0.7));
    const timer = setInterval(() => {
      step++;
      let out = '';
      for (let i = 0; i < chars.length; i++) {
        const c = chars[i];
        if (c === ' ' || c === '\n') { out += c; continue; }
        out += (step >= revealAt[i] + totalSteps * 0.3) ? c : CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)];
      }
      el.textContent = out;
      if (step >= totalSteps) {
        clearInterval(timer);
        el.textContent = finalText;
        onDone();
      }
    }, stepMs);
    return timer;
  }

  /* =========================================================
     THE PLUGBOARD — single source of truth for all wiring
     Used only in three places + one hidden easter egg, per design rule.
     ========================================================= */
  const KNOWN_PAIRS = {
    finance: { a: 'F', b: 'N', label: 'FINANCE DOSSIER' },
    health:  { a: 'H', b: 'C', label: 'HEALTHCARE DOSSIER' },
    access:  { a: 'A', b: 'R', label: 'ACCESS REQUEST' },
    hidden:  { a: 'Q', b: 'Z', label: 'FILE 00', requires: ['finance', 'health'] },
  };
  const EASTER_PAIR = { a: 'E', b: 'X' };

  const board = { connections: {} };
  let pending = null;

  function pairKeyFor(a, b) {
    for (const [key, p] of Object.entries(KNOWN_PAIRS)) {
      if ((p.a === a && p.b === b) || (p.a === b && p.b === a)) return key;
    }
    return null;
  }

  function isPairUnlocked(key) {
    const p = KNOWN_PAIRS[key];
    if (!p.requires) return true;
    return p.requires.every(r => board.connections[r]);
  }

  function jackEl(letter) {
    return document.querySelector('.jack[data-letter="' + letter + '"]');
  }

  function refreshJackVisual(letter) {
    const el = jackEl(letter);
    if (!el) return;
    const connectedKey = Object.keys(board.connections).find(k => {
      const p = KNOWN_PAIRS[k];
      return p.a === letter || p.b === letter;
    });
    el.classList.toggle('wired', !!connectedKey);
    el.classList.toggle('pending', pending === letter);
    const dormant = Object.entries(KNOWN_PAIRS).some(([k, p]) =>
      (p.a === letter || p.b === letter) && p.requires && isPairUnlocked(k) && !board.connections[k]
    );
    el.classList.toggle('dormant-live', dormant && !connectedKey);
    el.disabled = false;
  }

  function refreshAllJacks() {
    document.querySelectorAll('.jack').forEach(el => refreshJackVisual(el.dataset.letter));
  }

  function setReadout(text, tone) {
    const el = document.getElementById('console-readout');
    el.textContent = text;
    el.classList.remove('flash-bad', 'flash-good');
    if (tone) {
      el.classList.add(tone === 'good' ? 'flash-good' : 'flash-bad');
      setTimeout(() => el.classList.remove('flash-bad', 'flash-good'), 900);
    }
  }

  function baseReadout() {
    const financeDone = !!board.connections.finance;
    const healthDone = !!board.connections.health;
    const hiddenDone = !!board.connections.hidden;
    if (hiddenDone) return 'ALL KNOWN CIRCUITS LIVE.';
    if (financeDone && healthDone) return 'BOTH DOSSIERS LIVE — A HIDDEN PAIR JUST WOKE UP (Q ↔ Z)';
    if (financeDone || healthDone) return 'ONE CIRCUIT LIVE — WIRE THE OTHER, OR CARRY ON WHEN READY';
    return 'WIRE F ↔ N OR H ↔ C TO OPEN A DOSSIER';
  }

  function drawCables(justConnectedKey) {
    const svg = document.getElementById('cable-svg');
    const container = document.getElementById('console-board');
    if (!svg || !container) return;
    const rect = container.getBoundingClientRect();
    svg.setAttribute('viewBox', '0 0 ' + rect.width + ' ' + rect.height);
    svg.innerHTML = '';
    Object.entries(board.connections).forEach(([key, p]) => {
      const elA = jackEl(p.a), elB = jackEl(p.b);
      if (!elA || !elB) return;
      const rA = elA.getBoundingClientRect(), rB = elB.getBoundingClientRect();
      const x1 = rA.left - rect.left + rA.width / 2, y1 = rA.top - rect.top + rA.height / 2;
      const x2 = rB.left - rect.left + rB.width / 2, y2 = rB.top - rect.top + rB.height / 2;
      const midY = (y1 + y2) / 2 - 14;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' Q ' + ((x1+x2)/2) + ' ' + midY + ' ' + x2 + ' ' + y2);
      const color = key === 'hidden' ? '#C24A3A' : '#8FD14F';
      path.setAttribute('stroke', color);
      if (key === justConnectedKey && !reduceMotion) path.classList.add('snap');
      svg.appendChild(path);
    });
  }

  function onDossierWired(key) {
    document.querySelectorAll('[data-case]').forEach(c => {
      const [a, b] = c.dataset.pair.split(',');
      if ((a === KNOWN_PAIRS[key].a && b === KNOWN_PAIRS[key].b)) {
        c.classList.add('wired');
        const state = c.querySelector('[data-pair-state]');
        if (state) state.textContent = '· live';
        const btn = c.querySelector('[data-wire-pair]');
        if (btn) { btn.textContent = 'Circuit Live ✓'; btn.disabled = true; }
      }
    });
    if (board.connections.finance && board.connections.health) {
      document.getElementById('both-chosen-line').classList.add('show');
      document.documentElement.style.setProperty('--bp-density', '0.65');
    }
  }

  function onHiddenWired() {
    document.getElementById('file00').classList.add('show');
    document.documentElement.style.setProperty('--bp-density', '0.9');
    document.getElementById('file00').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  }

  function onAccessWired() {
    updateDrawerState();
  }

  function connectPair(key) {
    const p = KNOWN_PAIRS[key];
    board.connections[key] = { a: p.a, b: p.b };
    refreshAllJacks();
    drawCables(key);
    setReadout('CIRCUIT CLOSED — ' + p.label, 'good');
    soundRelay();
    [jackEl(p.a), jackEl(p.b)].forEach(el => {
      if (!el) return;
      el.classList.add('latch');
      setTimeout(() => el.classList.remove('latch'), 340);
    });
    setTimeout(() => setReadout(baseReadout()), 1400);
    if (key === 'finance' || key === 'health') onDossierWired(key);
    if (key === 'hidden') onHiddenWired();
    if (key === 'access') onAccessWired();
  }

  function disconnectPair(key) {
    delete board.connections[key];
    refreshAllJacks();
    drawCables();
    setReadout(baseReadout());
    if (key === 'access') updateDrawerState();
  }

  function handleJackClick(letter) {
    const connectedKey = Object.keys(board.connections).find(k => {
      const p = KNOWN_PAIRS[k];
      return p.a === letter || p.b === letter;
    });
    if (connectedKey) { disconnectPair(connectedKey); return; }

    if (pending === letter) { pending = null; refreshAllJacks(); return; }

    if (!pending) {
      pending = letter;
      refreshAllJacks();
      soundLatch();
      return;
    }

    const a = pending, b = letter;
    pending = null;

    if ((a === EASTER_PAIR.a && b === EASTER_PAIR.b) || (a === EASTER_PAIR.b && b === EASTER_PAIR.a)) {
      setReadout('"THE BOARD REMEMBERS EVERY OPERATOR WHO SAT HERE."', 'good');
      soundRelay();
      refreshAllJacks();
      setTimeout(() => setReadout(baseReadout()), 2400);
      return;
    }

    const key = pairKeyFor(a, b);
    if (key && !board.connections[key] && isPairUnlocked(key)) {
      connectPair(key);
      return;
    }

    refreshAllJacks();
    soundBad();
    [jackEl(a), jackEl(b)].forEach(el => { if (el) { el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 350); } });
    setReadout(key ? 'THAT CIRCUIT ISN\'T LIVE YET' : 'NO KNOWN CIRCUIT', 'bad');
    setTimeout(() => setReadout(baseReadout()), 1200);
  }

  function buildBoard() {
    const rows = ['QWERTYUIOP', 'ASDFGHJKLZXCVBNM'];
    const row1 = document.getElementById('jack-row-1');
    const row2 = document.getElementById('jack-row-2');
    [[rows[0], row1], [rows[1], row2]].forEach(([letters, mount]) => {
      [...letters].forEach(letter => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'jack';
        btn.dataset.letter = letter;
        btn.setAttribute('aria-label', 'Jack ' + letter);
        btn.textContent = letter;
        btn.addEventListener('click', () => handleJackClick(letter));
        mount.appendChild(btn);
      });
    });
    setReadout(baseReadout());
    refreshAllJacks();
    drawCables();
  }
  buildBoard();
  window.addEventListener('resize', () => drawCables());

  function showConsole() {
    document.getElementById('console-wrap').classList.add('show');
  }

  /* ---------- Intro mini-jacks (S <-> T ignites the station — the entry ritual) ---------- */
  const introJacksWrap = document.getElementById('intro-jacks');
  const miniCablePath = document.getElementById('mini-cable-path');
  let introPending = null;
  let introDone = false;

  function drawMiniCable(svgId, pathEl, elA, elB) {
    const svg = document.getElementById(svgId);
    const wrap = elA.closest('.mini-jacks');
    const rect = wrap.getBoundingClientRect();
    svg.setAttribute('viewBox', '0 0 ' + rect.width + ' ' + rect.height);
    const rA = elA.getBoundingClientRect(), rB = elB.getBoundingClientRect();
    const x1 = rA.left - rect.left + rA.width/2, y1 = rA.top - rect.top + rA.height/2;
    const x2 = rB.left - rect.left + rB.width/2, y2 = rB.top - rect.top + rB.height/2;
    pathEl.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2);
    pathEl.setAttribute('opacity', '1');
  }

  introJacksWrap.querySelectorAll('.mini-jack').forEach(btn => {
    btn.addEventListener('click', () => {
      const letter = btn.dataset.miniLetter;
      if (introDone) return;
      if (!introPending) { introPending = letter; btn.classList.add('pending'); soundLatch(); return; }
      if (introPending === letter) { introPending = null; btn.classList.remove('pending'); return; }
      document.querySelectorAll('#intro-jacks .mini-jack').forEach(b => { b.classList.add('wired', 'latch'); setTimeout(() => b.classList.remove('latch'), 340); });
      const [elA, elB] = introJacksWrap.querySelectorAll('.mini-jack');
      drawMiniCable('mini-cable-svg', miniCablePath, elA, elB);
      soundRelay();
      startTransmission();
    });
  });

  function startTransmission() {
    if (introDone) return;
    introDone = true;
    const introText = document.getElementById('intro-text');
    const introSub = document.getElementById('intro-sub');
    if (reduceMotion) {
      introText.textContent = 'ENIGMA 5.0';
      setTimeout(finishIntro, 400);
      return;
    }
    introSub.textContent = 'SIGNAL LOCKED';
    setTimeout(() => {
      introSub.textContent = 'DECRYPTING';
      scrambleInto(introText, 'ENIGMA 5.0', { duration: 850, stepMs: 34, onDone: () => setTimeout(finishIntro, 500) });
    }, 500);
  }

  function finishIntro() {
    document.getElementById('intro').classList.add('hide');
    showConsole();
  }

  document.getElementById('skip-intro').addEventListener('click', startTransmission);
  setTimeout(() => { if (!introDone) startTransmission(); }, 9000);

  /* ---------- Top bar scroll state ---------- */
  const topbar = document.getElementById('topbar');
  const onScroll = () => topbar.classList.toggle('scrolled', window.scrollY > 40);
  document.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Scroll reveal ---------- */
  const revealEls = document.querySelectorAll('.reveal');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  revealEls.forEach(el => io.observe(el));

  /* ---------- Blueprint density + THE MACHINE assembling in the background ---------- */
  document.documentElement.style.setProperty('--bp-density', '0.4');
  const milestoneSections = document.querySelectorAll('[data-milestone]');
  const visited = new Set();
  const TOTAL_MILESTONES = 6;
  const machineParts = document.querySelectorAll('#machine-build .part');
  const milestoneIo = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const key = entry.target.getAttribute('data-milestone');
        if (!visited.has(key)) {
          visited.add(key);
          const n = Math.min(visited.size, TOTAL_MILESTONES);
          const density = 0.4 + (n / TOTAL_MILESTONES) * 0.5;
          document.documentElement.style.setProperty('--bp-density', String(density));
          // reveal the next machine part quietly — nothing calls attention to it
          const partIndex = Math.min(n - 1, machineParts.length - 1);
          if (machineParts[partIndex]) machineParts[partIndex].classList.add('on');
        }
      }
    });
  }, { threshold: 0.4 });
  milestoneSections.forEach(el => milestoneIo.observe(el));

  /* ---------- Progressive declassification (history) ---------- */
  const historySection = document.getElementById('history');
  const redactSpans = [...document.querySelectorAll('.redact')].sort(
    (a, b) => Number(a.dataset.order) - Number(b.dataset.order)
  );
  const historyIo = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        redactSpans.forEach((span, i) => {
          setTimeout(() => span.classList.add('declassified'), reduceMotion ? 0 : i * 550);
        });
        historyIo.disconnect();
      }
    });
  }, { threshold: 0.4 });
  historyIo.observe(historySection);

  /* ---------- Plugboard sketch illustration (history section) ---------- */
  (function buildSketchJacks() {
    const mount = document.getElementById('sketch-jacks');
    if (!mount) return;
    const xs = [45, 75, 105, 135, 165, 195, 225];
    xs.forEach((x) => {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', x); c.setAttribute('cy', 90); c.setAttribute('r', 6);
      c.setAttribute('class', 'sketch-line');
      mount.appendChild(c);
    });
  })();
  const sketchIo = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        document.querySelectorAll('#plugboard-sketch .diagram-draw').forEach((p, i) => {
          setTimeout(() => p.classList.add('drawn'), reduceMotion ? 0 : i * 300 + 200);
        });
        sketchIo.disconnect();
      }
    });
  }, { threshold: 0.4 });
  const sketchEl = document.getElementById('plugboard-sketch');
  if (sketchEl) sketchIo.observe(sketchEl);

  /* ---------- Rotor cross-section illustration (briefing section) ---------- */
  const rotorIo = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        ['rotor-1', 'rotor-2', 'rotor-3'].forEach((id, i) => {
          const el = document.getElementById(id);
          if (el) setTimeout(() => el.classList.add('drawn'), reduceMotion ? 0 : i * 260 + 150);
        });
        rotorIo.disconnect();
      }
    });
  }, { threshold: 0.4 });
  const rotor1 = document.getElementById('rotor-1');
  if (rotor1) rotorIo.observe(rotor1.closest('svg'));

  /* ---------- Bridge decrypt (then -> now) ---------- */
  const bridgeEl = document.getElementById('bridge-line');
  const bridgeFinal = "Today the board isn't rotors. It's a market that outruns the people it affects, and a diagnosis that arrives too late to matter.";
  const bridgeIo = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        scrambleInto(bridgeEl, bridgeFinal, { duration: reduceMotion ? 0 : 1600, stepMs: 22 });
        bridgeIo.disconnect();
      }
    });
  }, { threshold: 0.5 });
  bridgeIo.observe(bridgeEl);

  /* ---------- Dossier cards: open + wire ---------- */
  document.querySelectorAll('[data-case]').forEach(card => {
    const toggleBtn = card.querySelector('[data-case-toggle]');
    toggleBtn.addEventListener('click', () => {
      const willOpen = !card.classList.contains('open');
      document.querySelectorAll('[data-case]').forEach(c => c.classList.remove('open'));
      if (willOpen) card.classList.add('open');
      soundLatch();
    });
  });
  document.querySelectorAll('[data-wire-pair]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const [a, b] = btn.dataset.wirePair.split(',');
      const key = pairKeyFor(a, b);
      if (key && !board.connections[key]) connectPair(key);
    });
  });

  /* ---------- Prize decrypt ---------- */
  const prizeEl = document.getElementById('prize-amount');
  const prizeFinal = prizeEl.getAttribute('data-final');
  const prizeIo = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        scrambleInto(prizeEl, prizeFinal, { duration: reduceMotion ? 0 : 1200, stepMs: 40 });
        prizeIo.disconnect();
      }
    });
  }, { threshold: 0.5 });
  prizeIo.observe(prizeEl);

  /* ---------- Registration drawer (gated by A <-> R — signature plugboard use #2) ---------- */
  const overlay = document.getElementById('overlay');
  const drawer = document.getElementById('drawer');
  const drawerSub = document.getElementById('drawer-sub');
  const regForm = document.getElementById('reg-form');
  const successEl = document.getElementById('success');
  const submitBtn = document.getElementById('submit-btn');
  const lockedFields = () => [...regForm.querySelectorAll('.field')];
  let lastFocused = null;
  let drawerPending = null;

  function setChecklist(step) {
    const order = ['received', 'wired', 'cleared'];
    const idx = order.indexOf(step);
    order.forEach((s, i) => {
      document.querySelector('[data-check="' + s + '"]').classList.toggle('done', i <= idx);
    });
  }

  function unlockFields() {
    lockedFields().forEach((f, i) => {
      setTimeout(() => {
        f.disabled = false;
        f.classList.remove('locked');
      }, reduceMotion ? 0 : i * 70);
    });
    setTimeout(() => { submitBtn.disabled = false; }, reduceMotion ? 0 : lockedFields().length * 70 + 100);
    drawerSub.textContent = 'Circuit closed. Complete the form to transmit.';
    setChecklist('cleared');
  }

  function updateDrawerState() {
    const wired = !!board.connections.access;
    document.querySelectorAll('#drawer-jacks .mini-jack').forEach(b => b.classList.toggle('wired', wired));
    if (wired) {
      const [elA, elB] = document.querySelectorAll('#drawer-jacks .mini-jack');
      drawMiniCable('drawer-cable-svg', document.getElementById('drawer-cable-path'), elA, elB);
      unlockFields();
    } else {
      document.getElementById('drawer-cable-path').setAttribute('opacity', '0');
      setChecklist('received');
    }
  }

  document.querySelectorAll('#drawer-jacks .mini-jack').forEach(btn => {
    btn.addEventListener('click', () => {
      const letter = btn.dataset.miniLetter;
      if (board.connections.access) { disconnectPair('access'); drawerPending = null; refreshDrawerPending(); return; }
      if (!drawerPending) { drawerPending = letter; refreshDrawerPending(); soundLatch(); return; }
      if (drawerPending === letter) { drawerPending = null; refreshDrawerPending(); return; }
      drawerPending = null;
      connectPair('access');
      refreshDrawerPending();
    });
  });
  function refreshDrawerPending() {
    document.querySelectorAll('#drawer-jacks .mini-jack').forEach(b => {
      b.classList.toggle('pending', drawerPending === b.dataset.miniLetter);
    });
  }

  function openDrawer() {
    lastFocused = document.activeElement;
    overlay.classList.add('open');
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setChecklist('received');
    updateDrawerState();
  }

  function closeDrawer() {
    overlay.classList.remove('open');
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocused) lastFocused.focus();
  }

  document.querySelectorAll('[data-open-drawer]').forEach(b => b.addEventListener('click', openDrawer));
  document.querySelectorAll('[data-close-drawer]').forEach(b => b.addEventListener('click', closeDrawer));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
  });

  /* ---------- THE CINEMATIC MOMENT ----------
     Registration accepted -> a flash of transmitted light -> the signal leaves
     the station -> everything on the page slowly, deliberately powers down.
     This is the one unforgettable scene; nothing else on the page attempts it. */
  regForm.addEventListener('submit', (e) => {
    e.preventDefault();
    regForm.classList.add('hidden');
    successEl.classList.remove('hidden');
    successEl.classList.add('flex');
    requestAnimationFrame(() => successEl.querySelector('.stamp').classList.add('show'));
    soundStamp();

    const flash = document.getElementById('power-flash');
    if (!reduceMotion) {
      flash.classList.add('flash');
      setTimeout(() => flash.classList.remove('flash'), 120);
    }

    const bars = document.querySelectorAll('#footer-bars .bar');
    const footerLabel = document.getElementById('footer-label');
    const successSub = document.getElementById('success-sub');

    setTimeout(() => {
      bars.forEach(b => b.classList.add('dead'));
      footerLabel.textContent = 'SIGNAL SENT — STATION POWERING DOWN';
      if (successSub) successSub.textContent = 'The transmission has left the station.';
      document.body.classList.add('powering-down');
    }, reduceMotion ? 0 : 900);

    setTimeout(() => {
      document.getElementById('console-wrap').classList.add('powered-down');
      footerLabel.textContent = 'TRANSMISSION ENDED';
    }, reduceMotion ? 0 : 3200);
  });

  /* ---------- Ambient particles ---------- */
  const canvas = document.getElementById('particles');
  if (canvas && !reduceMotion) {
    const ctx = canvas.getContext('2d');
    let w, h, particles;
    const COUNT = 34;
    function resize() { w = canvas.width = canvas.offsetWidth; h = canvas.height = canvas.offsetHeight; }
    function init() {
      particles = Array.from({ length: COUNT }, () => ({
        x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.4 + 0.4,
        vx: (Math.random() - 0.5) * 0.1, vy: (Math.random() - 0.5) * 0.1, a: Math.random() * 0.45 + 0.12,
      }));
    }
    function tick() {
      ctx.clearRect(0, 0, w, h);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(184, 137, 76, ' + p.a + ')'; ctx.fill();
      });
      requestAnimationFrame(tick);
    }
    resize(); init(); tick();
    window.addEventListener('resize', () => { resize(); init(); });
  }
})();
});
