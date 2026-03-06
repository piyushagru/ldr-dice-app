// ─── Roll Feed widget ─────────────────────────────────────────────────────────
// Displays the last 3 rolls as a stacked feed below the dice.
// Newest entry is at top (full opacity, slides in), older rows fade out.
//
// Usage:
//   window.RollFeed.push(rolls, total, numDice, rolledBy, timestamp, myName)

window.RollFeed = (() => {
  const MAX_ROWS  = 3;
  const OPACITY   = [1, 0.5, 0.25]; // newest → oldest

  // Internal history (newest first)
  const history = [];

  // Container element (injected into #roll-feed)
  let container = null;

  function init() {
    container = document.getElementById('roll-feed');
    if (!container) console.warn('RollFeed: #roll-feed element not found');
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  function push(rolls, total, numDice, rolledBy, timestamp, myName) {
    history.unshift({ rolls, total, numDice, rolledBy, timestamp, myName });
    if (history.length > MAX_ROWS) history.length = MAX_ROWS;
    render();
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  function render() {
    if (!container) return;

    container.innerHTML = history.map((entry, index) => {
      const isOwn    = entry.rolledBy === entry.myName;
      const arrow    = (isOwn && index === 0) ? '→' : '';
      const name     = truncate(isOwn ? 'You' : entry.rolledBy, 12);
      const symbols  = entry.rolls.map(r => diceSymbol(r)).join(' ');
      const value    = entry.numDice === 1
        ? entry.rolls[0]
        : entry.rolls.join('+') + '=' + entry.total;
      const time     = index === 0 ? 'just now' : entry.timestamp;
      const opacity  = OPACITY[index];
      // Light fill: green for own, blue for others
      const bg       = isOwn
        ? 'rgba(40, 167, 69, 0.10)'
        : 'rgba(23, 162, 184, 0.10)';
      const slide    = index === 0 ? 'feed-slide-in' : '';

      return `
        <div class="feed-row ${slide}" style="opacity:${opacity}; background:${bg};">
          <span class="feed-arrow">${arrow}</span>
          <span class="feed-player">${escHtml(name)}</span>
          <span class="feed-symbols">${symbols}</span>
          <span class="feed-value">${value}</span>
          <span class="feed-time">${escHtml(time)}</span>
        </div>`;
    }).join('');
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const SYMBOLS = { 1:'⚀', 2:'⚁', 3:'⚂', 4:'⚃', 5:'⚄', 6:'⚅' };
  function diceSymbol(n) { return SYMBOLS[n] || n; }
  function truncate(str, max) { return str.length > max ? str.slice(0, max) + '…' : str; }
  function escHtml(s) {
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;');
  }

  document.addEventListener('DOMContentLoaded', init);

  return { push };
})();