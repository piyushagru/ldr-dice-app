// ─── Stats module ─────────────────────────────────────────────────────────────
// Owns all roll-statistics state and DOM updates for the stats panel.
// Called by app.js via window.Stats.update(rolls).

window.Stats = (() => {
  const state = {
    totalRolls:   0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    allRolls:     []
  };

  // DOM refs (panel elements)
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

    // Average
    const sum = state.allRolls.reduce((a, b) => a + b, 0);
    el.avgRoll().textContent = (sum / state.allRolls.length).toFixed(2);

    // Most / least rolled
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

  // Stats panel collapse toggle
  document.addEventListener('DOMContentLoaded', () => {
    const header  = document.querySelector('.stats-header');
    const content = document.querySelector('.stats-content');
    if (header && content) {
      header.addEventListener('click', e => {
        e.stopPropagation();
        const collapsed = content.style.display === 'none';
        content.style.display = collapsed ? 'flex' : 'none';
        header.textContent    = collapsed ? 'Stats' : 'Stats +';
      });
    }
  });

  return { update };
})();