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
  function push(rolls, total, numDice, rolledBy, timestamp, myName, opts) {
    const { sides = 6, notation = null, preset = null, event = null, production = null } = opts || {};
    history.unshift({ rolls, total, numDice, rolledBy, timestamp, myName, sides, notation, preset, event, production });
    if (history.length > MAX_ROWS) history.length = MAX_ROWS;
    render();
  }

  // Plain-text notice row (e.g. "Sam switched the Pit to Catan")
  function pushNotice(text) {
    history.unshift({ notice: text });
    if (history.length > MAX_ROWS) history.length = MAX_ROWS;
    render();
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  function render() {
    if (!container) return;

    container.innerHTML = history.map((entry, index) => {
      const opacity = OPACITY[index];
      const slide   = index === 0 ? 'feed-slide-in' : '';

      if (entry.notice) {
        return `
        <div class="feed-row feed-notice ${slide}" style="opacity:${opacity};">
          <span class="feed-notice-text">${escHtml(entry.notice)}</span>
        </div>`;
      }

      const isOwn    = entry.rolledBy === entry.myName;
      const arrow    = (isOwn && index === 0) ? '→' : '';
      const name     = truncate(isOwn ? 'You' : entry.rolledBy, 12);
      const isCatan  = entry.preset === 'catan';
      const isCK     = entry.preset === 'cities-knights';
      const symbols  = isCK
        ? entry.rolls.slice(0, 2).map(r => diceSymbol(r)).join(' ')
          + ` <span class="feed-event feed-event-${entry.event.face}">${EVENT_GLYPHS[entry.event.face]}</span>`
        : entry.sides === 6
          ? entry.rolls.map(r => diceSymbol(r)).join(' ')
          : escHtml(entry.notation || `d${entry.sides}`);
      const badge    = isCatan ? '<span class="feed-preset">Catan</span>'
                     : isCK    ? '<span class="feed-preset">C&amp;K</span>' : '';
      const value    = isCK
        ? `${entry.rolls[0]}+${entry.rolls[1]}=${entry.production}`
        : entry.numDice === 1 && !entry.notation?.includes('+') && !entry.notation?.includes('-')
          ? entry.rolls[0]
          : entry.rolls.join('+') + '=' + entry.total;
      const time     = index === 0 ? 'just now' : entry.timestamp;
      const ownCls   = isOwn ? 'feed-own' : 'feed-other';
      const sevenCls = (isCatan && entry.total === 7) || (isCK && entry.production === 7) ? 'feed-seven' : '';

      return `
        <div class="feed-row ${ownCls} ${sevenCls} ${slide}" style="opacity:${opacity};">
          <span class="feed-arrow">${arrow}</span>
          <span class="feed-player">${escHtml(name)}</span>
          <span class="feed-symbols">${badge}${symbols}</span>
          <span class="feed-value">${value}</span>
          <span class="feed-time">${escHtml(time)}</span>
        </div>`;
    }).join('');
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const SYMBOLS = { 1:'⚀', 2:'⚁', 3:'⚂', 4:'⚃', 5:'⚄', 6:'⚅' };
  const EVENT_GLYPHS = { ship: '⛵︎', blue: '⛩︎', green: '⛩︎', yellow: '⛩︎' };
  function diceSymbol(n) { return SYMBOLS[n] || n; }
  function truncate(str, max) { return str.length > max ? str.slice(0, max) + '…' : str; }
  function escHtml(s) {
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;');
  }

  document.addEventListener('DOMContentLoaded', init);

  return { push, pushNotice };
})();