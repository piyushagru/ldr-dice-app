// ─── Stats module ─────────────────────────────────────────────────────────────
// Owns all roll-statistics state and DOM updates for the stats panel.
// Called by app.js via window.Stats.update(rolls).

window.Stats = (() => {
  const state = {
    totalRolls:   0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    allRolls:     []
  };

  const el = {
    totalRolls:     () => document.getElementById('totalRolls'),
    avgRoll:        () => document.getElementById('avgRoll'),
    mostRolled:     () => document.getElementById('mostRolled'),
    leastRolled:    () => document.getElementById('leastRolled'),
    randomnessPct:  () => document.getElementById('randomnessPct'),
    randomnessFill: () => document.getElementById('randomnessFill'),
  };

  function update(rolls) {
    const arr = Array.isArray(rolls) ? rolls : [rolls];
    arr.forEach(r => {
      state.totalRolls++;
      state.distribution[r]++;
      state.allRolls.push(r);
    });
    render();
  }

  function render() {
    el.totalRolls().textContent = state.totalRolls;
    if (state.totalRolls === 0) return;

    const sum = state.allRolls.reduce((a, b) => a + b, 0);
    el.avgRoll().textContent = (sum / state.allRolls.length).toFixed(2);

    const counts   = state.distribution;
    const maxCount = Math.max(...Object.values(counts));
    const nonZero  = Object.values(counts).filter(c => c > 0);
    const minCount = nonZero.length ? Math.min(...nonZero) : 0;

    el.mostRolled().textContent =
      Object.keys(counts).filter(k => counts[k] === maxCount).join(', ') + ` (${maxCount}x)`;
    el.leastRolled().textContent = nonZero.length
      ? Object.keys(counts).filter(k => counts[k] === minCount && counts[k] > 0).join(', ') + ` (${minCount}x)`
      : '-';

    // Balance score via normalised chi-square (0 = perfect, higher = skewed)
    const expected = state.totalRolls / 6;
    let chi = 0;
    for (let i = 1; i <= 6; i++) chi += Math.pow(counts[i] - expected, 2) / expected;
    const score = Math.max(0, Math.min(100, 100 - chi * 5));

    // Colour transitions: green → amber → orange → red
    let color;
    if (state.totalRolls < 6)  color = '#aaa';
    else if (score >= 80)      color = '#22c55e';
    else if (score >= 55)      color = '#f59e0b';
    else if (score >= 30)      color = '#f97316';
    else                       color = '#ef4444';

    const pctEl  = el.randomnessPct();
    const fillEl = el.randomnessFill();
    pctEl.textContent          = state.totalRolls >= 6 ? score.toFixed(0) + '%' : '–';
    pctEl.style.color          = color;
    fillEl.style.width         = (state.totalRolls >= 6 ? score.toFixed(1) : 0) + '%';
    fillEl.style.backgroundColor = color;
  }

  // Stats panel collapse toggle: collapsed by default, choice persisted
  const OPEN_KEY = 'spicediceStatsOpen';
  if (localStorage.getItem(OPEN_KEY) === null && (localStorage.getItem('spicydiceStatsOpen') ?? localStorage.getItem('clattrStatsOpen')) !== null) localStorage.setItem(OPEN_KEY, localStorage.getItem('spicydiceStatsOpen') ?? localStorage.getItem('clattrStatsOpen'));

  document.addEventListener('DOMContentLoaded', () => {
    const panel  = document.getElementById('statsPanel');
    const header = panel && panel.querySelector('.stats-header');
    if (!panel || !header) return;

    function setOpen(open) {
      panel.classList.toggle('stats-collapsed', !open);
      header.setAttribute('aria-expanded', String(open));
      localStorage.setItem(OPEN_KEY, open ? '1' : '0');
    }

    setOpen(localStorage.getItem(OPEN_KEY) === '1');

    header.addEventListener('click', e => {
      e.stopPropagation();
      setOpen(panel.classList.contains('stats-collapsed'));
    });
    header.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(panel.classList.contains('stats-collapsed'));
      }
    });
  });

  return { update };
})();