/* players.js — the roster and the ladders.
 *
 * Two views of the same rows, because they answer different questions. The
 * roster answers "who else is here and what do they look like"; the ladders
 * answer "who is actually better at Geography".
 *
 * Which numbers can be trusted is a real distinction and the page says so
 * rather than hiding it: sessions, answers, accuracy and XP are aggregated
 * server-side from synced rows, while the character and the Elo come from each
 * player's own browser. See lib/roster.js for why that split exists.
 */
'use strict';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const DOMAINS = [
  { key: 'numbers', label: 'Numbers', icon: '🔢' },
  { key: 'mapmaster', label: 'Geography', icon: '🌍' },
  { key: 'chronicle', label: 'History', icon: '🏛️' },
  { key: 'reader', label: 'Reading', icon: '📖' },
  { key: 'briefing', label: 'Briefing', icon: '📰' },
];

let players = [];
let sort = 'overall';

const ratingOf = (p, key) => {
  const d = (p.card.domains || []).find((x) => x.key === key);
  return d && typeof d.rating === 'number' ? d.rating : null;
};

const ago = (iso) => {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
};

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

const SORTS = {
  overall: (a, b) => (b.card.overall ?? -1) - (a.card.overall ?? -1),
  xp: (a, b) => b.xp - a.xp,
  accuracy: (a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1),
  sessions: (a, b) => b.sessions - a.sessions,
};

function renderRoster() {
  const me = window.Auth && Auth.user() ? Auth.user().id : null;
  const list = [...players].sort(SORTS[sort] || SORTS.overall);
  const host = $('roster');
  host.innerHTML = '';

  list.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = `pcard${p.id === me ? ' is-you' : ''}`;

    const domains = (p.card.domains || []).slice().sort((a, b) => b.rating - a.rating);
    card.innerHTML =
      `<div class="pc-rank">${i + 1}</div>
       <div class="pc-fig"></div>
       <div class="pc-body">
         <div class="pc-name">${esc(p.name)}${p.id === me ? '<span class="pc-you">you</span>' : ''}</div>
         <div class="pc-meta">
           <span title="Overall rating"><b>${p.card.overall ?? '—'}</b> rating</span>
           <span><b>${p.xp.toLocaleString()}</b> XP</span>
           <span><b>${p.accuracy === null ? '—' : p.accuracy + '%'}</b> accuracy</span>
           <span><b>${p.sessions}</b> sessions</span>
           ${p.card.streak ? `<span title="Current daily streak">🔥 <b>${p.card.streak}</b></span>` : ''}
         </div>
         <div class="pc-domains">
           ${domains.length
             ? domains.map((d) => `<span class="pc-dom" title="${esc(d.label)}${d.detail ? ' — ' + esc(d.detail) : ''}">${d.icon} ${Math.round(d.rating)}</span>`).join('')
             : '<span class="pc-dom none">no rated games yet</span>'}
         </div>
         <div class="pc-last">Last played ${ago(p.lastPlayed)}</div>
       </div>`;

    host.appendChild(card);

    // Draw them wearing what they equipped. Ownership is re-checked inside
    // look(), so a card claiming gear its owner never earned draws bare.
    //
    // A player who has an account but has never opened this page has no card
    // yet — leave a marked empty frame rather than a hole, so the row still
    // reads as a row.
    // Wardrobe.look is checked by name, not just by Wardrobe existing: this repo
    // gets worked on from more than one place at once, and a page that throws
    // because a sibling library landed a version behind is worse than one that
    // draws a plain figure for a moment.
    const fig = card.querySelector('.pc-fig');
    if (window.Avatar && window.Wardrobe && typeof Wardrobe.look === 'function' && p.card.wardrobe) {
      Avatar.create(fig, { ...Wardrobe.look(p.card.wardrobe), facing: 's' });
    } else {
      fig.classList.add('empty');
      fig.title = 'Has not opened Players yet';
    }
  });
}

// ---------------------------------------------------------------------------
// Ladders — one per game, only players who have a rating in it
// ---------------------------------------------------------------------------

function renderLadders() {
  const me = window.Auth && Auth.user() ? Auth.user().id : null;
  $('ladders').innerHTML = DOMAINS.map((dom) => {
    const ranked = players
      .map((p) => ({ p, r: ratingOf(p, dom.key) }))
      .filter((x) => x.r !== null)
      .sort((a, b) => b.r - a.r);

    const rows = ranked.length
      ? ranked.map((x, i) =>
          `<li class="${x.p.id === me ? 'is-you' : ''}"><span class="ld-i">${i + 1}</span>
             <span class="ld-n">${esc(x.p.name)}</span><b>${Math.round(x.r)}</b></li>`).join('')
      : '<li class="ld-empty">nobody rated yet</li>';

    return `<div class="ladder">
        <h3>${dom.icon} ${dom.label}</h3>
        <ol>${rows}</ol>
      </div>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function load() {
  if (!window.Auth || !Auth.isSignedIn()) {
    $('gate').classList.remove('hidden');
    $('board').classList.add('hidden');
    $('status').textContent = '';
    return;
  }
  $('gate').classList.add('hidden');
  $('status').textContent = 'Loading players…';

  try {
    // Publish first so arriving here puts you on the board even if you have
    // never finished a session on this device.
    await Roster.publish({ force: true });
    players = await Roster.fetch();
  } catch (err) {
    $('status').textContent = err.message;
    return;
  }

  if (!players.length) {
    $('status').textContent = 'Nobody here yet — send a friend the link.';
    return;
  }

  $('status').textContent = players.length === 1
    ? 'Just you so far. Send a friend the link.'
    : `${players.length} players.`;
  $('board').classList.remove('hidden');
  renderRoster();
  renderLadders();
}

$('seg').addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
  sort = btn.dataset.sort;
  renderRoster();
});

Sync.mountUI();
// Signing in or out changes whether there is a roster at all.
Auth.onChange(() => load());
