/* lib/wardrobe.js — one character, one wardrobe, five games feeding it.
 *
 * Levels stay per game: each game keeps its own XP on the same curve, so being
 * level 12 at Numbers and level 2 at Chronicle is honest rather than averaged
 * into a meaningless number. What's shared is the *character* — one figure, one
 * set of clothes, worn everywhere.
 *
 * Every item is dropped by exactly one game and gated on that game's level, so
 * the compass only ever comes out of Mapmaster and the hourglass only ever out
 * of Chronicle. That's deliberate: it makes the game you're worst at the only
 * place to get its gear, which is a better reason to open it than a nag.
 *
 * Nothing locked is ever listed. You get a count of what's still out there and
 * nothing else — finding out what Chronicle level 15 holds means getting there.
 * The reveal is the payoff, so spoiling the catalogue would spend it early.
 *
 * Integration is two calls per game:
 *   Wardrobe.attach('numbers')                        // once, at boot
 *   Wardrobe.check('numbers', levelForXp(store.xp))   // whenever level may have moved
 *
 * Items live in six slots. `head`, `face` and `hand` ride with the body part
 * they're worn on; `back` and `aura` render behind it. `ink` recolours the
 * whole figure.
 */

window.Wardrobe = (function () {
  'use strict';

  const KEY = 'games.wardrobe.v1';

  const GAMES = {
    numbers:   { label: 'Numbers',   icon: '🔢' },
    mapmaster: { label: 'Mapmaster', icon: '🗺' },
    chronicle: { label: 'Chronicle', icon: '📜' },
    reader:    { label: 'Reader',    icon: '📖' },
    briefing:  { label: 'Briefing',  icon: '☀' },
  };

  // Shop items need a source badge too, but never appear in the drop tally.
  const SOURCE = { ...GAMES, shop: { label: 'Shop', icon: '🪙' } };

  const SLOTS = ['head', 'face', 'back', 'hand', 'aura'];
  const PANEL_SLOTS = ['character', ...SLOTS, 'ink'];
  const SLOT_LABEL = { character: 'Who', head: 'Head', face: 'Face', back: 'Back', hand: 'Hand', aura: 'Aura', ink: 'Ink' };

  /* ------------------------------ catalogue ------------------------------ */

  // `at` is the level in `from` that drops it. `flag` items ignore level and
  // are granted by the game calling grantFlag() when something notable happens.
  const ITEMS = [
    /* ---- Numbers: mental math, moss ---- */
    { id: 'cap', name: 'Field Cap', slot: 'head', from: 'numbers', at: 2 },
    { id: 'sliderule', name: 'Slide Rule', slot: 'hand', from: 'numbers', at: 3 },
    { id: 'specs', name: 'Working Specs', slot: 'face', from: 'numbers', at: 4 },
    { id: 'digits', name: 'Orbiting Digits', slot: 'aura', from: 'numbers', at: 5 },
    { id: 'satchel', name: 'Chalk Satchel', slot: 'back', from: 'numbers', at: 6 },
    { id: 'graphite', name: 'Graphite', slot: 'ink', from: 'numbers', at: 7, ink: '#4A433E' },
    { id: 'visor', name: 'Counting Visor', slot: 'face', from: 'numbers', at: 8 },
    { id: 'abacus', name: 'Pocket Abacus', slot: 'hand', from: 'numbers', at: 10 },
    { id: 'pihalo', name: 'Halo of Pi', slot: 'aura', from: 'numbers', at: 12 },
    { id: 'sevens', name: 'Crown of Sevens', slot: 'head', from: 'numbers', at: 15 },
    { id: 'carrycape', name: 'Cape of Carries', slot: 'back', from: 'numbers', at: 20 },

    /* ---- Mapmaster: geography, azure ---- */
    { id: 'pith', name: "Explorer's Pith", slot: 'head', from: 'mapmaster', at: 2 },
    { id: 'compass', name: 'Brass Compass', slot: 'hand', from: 'mapmaster', at: 3 },
    { id: 'pack', name: 'Trail Pack', slot: 'back', from: 'mapmaster', at: 4 },
    { id: 'globe', name: 'Orbiting Globe', slot: 'aura', from: 'mapmaster', at: 5 },
    { id: 'goggles', name: 'Summit Goggles', slot: 'face', from: 'mapmaster', at: 6 },
    { id: 'azure', name: 'Azure', slot: 'ink', from: 'mapmaster', at: 7, ink: '#3F6FA8' },
    { id: 'staff', name: 'Walking Staff', slot: 'hand', from: 'mapmaster', at: 8 },
    { id: 'captain', name: "Captain's Cap", slot: 'head', from: 'mapmaster', at: 10 },
    { id: 'constellation', name: 'Constellation', slot: 'aura', from: 'mapmaster', at: 12 },
    { id: 'sextant', name: 'Sextant', slot: 'hand', from: 'mapmaster', at: 15 },
    { id: 'wings', name: "Cartographer's Wings", slot: 'back', from: 'mapmaster', at: 20 },

    /* ---- Chronicle: history, ember ---- */
    { id: 'laurel', name: 'Laurel Wreath', slot: 'head', from: 'chronicle', at: 2 },
    { id: 'hourglass', name: 'Hourglass', slot: 'hand', from: 'chronicle', at: 3 },
    { id: 'robe', name: 'Senator’s Robe', slot: 'back', from: 'chronicle', at: 4 },
    { id: 'scroll', name: 'Floating Scroll', slot: 'aura', from: 'chronicle', at: 5 },
    { id: 'monocle', name: 'Monocle', slot: 'face', from: 'chronicle', at: 6 },
    { id: 'ember', name: 'Ember', slot: 'ink', from: 'chronicle', at: 7, ink: '#B4622F' },
    { id: 'torch', name: 'Torch', slot: 'hand', from: 'chronicle', at: 8 },
    { id: 'helm', name: 'Centurion Helm', slot: 'head', from: 'chronicle', at: 10 },
    { id: 'comet', name: 'Comet', slot: 'aura', from: 'chronicle', at: 12 },
    { id: 'sceptre', name: 'Sceptre', slot: 'hand', from: 'chronicle', at: 15 },
    { id: 'pharaoh', name: 'Pharaoh’s Crown', slot: 'head', from: 'chronicle', at: 20 },

    /* ---- Reader: speed reading, violet ---- */
    { id: 'readers', name: 'Reading Glasses', slot: 'face', from: 'reader', at: 2 },
    { id: 'book', name: 'Open Book', slot: 'hand', from: 'reader', at: 3 },
    { id: 'page', name: 'Loose Page', slot: 'aura', from: 'reader', at: 4 },
    { id: 'nightcap', name: 'Nightcap', slot: 'head', from: 'reader', at: 5 },
    { id: 'scarf', name: 'Long Scarf', slot: 'back', from: 'reader', at: 6 },
    { id: 'violet', name: 'Violet', slot: 'ink', from: 'reader', at: 7, ink: '#6C5091' },
    { id: 'quill', name: 'Quill', slot: 'hand', from: 'reader', at: 8 },
    { id: 'lamp', name: 'Reading Lamp', slot: 'hand', from: 'reader', at: 10 },
    { id: 'words', name: 'Swirl of Words', slot: 'aura', from: 'reader', at: 12 },
    { id: 'tomecape', name: 'Library Cloak', slot: 'back', from: 'reader', at: 15 },
    { id: 'bookmark', name: 'Bookmark Circlet', slot: 'head', from: 'reader', at: 20 },

    /* ---- Briefing: the daily, rose ---- */
    { id: 'beanie', name: 'Morning Beanie', slot: 'head', from: 'briefing', at: 2 },
    { id: 'mug', name: 'Enamel Mug', slot: 'hand', from: 'briefing', at: 3 },
    { id: 'messenger', name: 'Messenger Bag', slot: 'back', from: 'briefing', at: 4 },
    { id: 'sunrise', name: 'Sunrise', slot: 'aura', from: 'briefing', at: 5 },
    { id: 'rose', name: 'Rose', slot: 'ink', from: 'briefing', at: 7, ink: '#B0526B' },
    { id: 'clipboard', name: 'Clipboard', slot: 'hand', from: 'briefing', at: 8 },
    { id: 'headset', name: 'Headset', slot: 'face', from: 'briefing', at: 10 },
    { id: 'streakflame', name: 'Streak Flame', slot: 'aura', from: 'briefing', at: 12 },
    { id: 'dawncape', name: 'Dawn Cloak', slot: 'back', from: 'briefing', at: 15 },

    /* ---- Legendaries: earned by doing a thing, not by grinding a level ---- */
    { id: 'metronomecrown', name: "The Metronome's Crown", slot: 'head', from: 'numbers',
      flag: 'numbers:metronome-hard', legendary: true },
    { id: 'ghostbreaker', name: 'Ghostbreaker', slot: 'aura', from: 'numbers',
      flag: 'numbers:beat-ghost', legendary: true },
  ];

  /* ------------------------------- roster ---------------------------------
   *
   * Characters are the biggest thing a chest can hold, so they sit at the top
   * of the ladder. Unlike gear they replace the whole sprite rather than
   * hanging off it, which is why they cost a generation each to make and why
   * accessories that float — pets, halos, orbiting things — are the ones worth
   * drawing: those work on every character without being anchored to any.
   */
  const CHARACTERS = [
    { id: 'c-runner',  name: 'The Runner',   sprite: 'runner',  slot: 'character', from: 'numbers',   at: 1 },
    { id: 'c-wizard',  name: 'The Magus',    sprite: 'wizard',  slot: 'character', from: 'chronicle', at: 9 },
    { id: 'c-frost',   name: 'Frostbound',   sprite: 'frost',   slot: 'character', from: 'mapmaster', at: 9 },
    { id: 'c-catfolk', name: 'The Prowler',  sprite: 'catfolk', slot: 'character', from: 'reader',    at: 9 },
    { id: 'c-fairy',   name: 'The Sprite',   sprite: 'fairy',   slot: 'character', from: 'briefing',  at: 9 },
    { id: 'c-reaper',  name: 'The Quiet',    sprite: 'reaper',  slot: 'character', from: 'numbers',   at: 18 },
    { id: 'c-ember',   name: 'Ember',        sprite: 'ember',   slot: 'character', from: 'chronicle', at: 18 },
    { id: 'c-berserker', name: 'The Berserker', sprite: 'berserker', slot: 'character', from: 'mapmaster', at: 4 },
    { id: 'c-rogue',     name: 'The Rogue',     sprite: 'rogue',     slot: 'character', from: 'reader',    at: 4 },
    { id: 'c-oracle',    name: 'The Oracle',    sprite: 'oracle',    slot: 'character', from: 'chronicle', at: 4 },
    { id: 'c-corsair',   name: 'The Corsair',   sprite: 'corsair',   slot: 'character', from: 'briefing',  at: 4 },
    { id: 'c-shinobi',   name: 'The Shinobi',   sprite: 'shinobi',   slot: 'character', from: 'numbers',   at: 12 },
    { id: 'c-ronin',     name: 'The Ronin',     sprite: 'ronin',     slot: 'character', from: 'mapmaster', at: 14 },
    { id: 'c-bonelord',  name: 'The Bonelord',  sprite: 'bonelord',  slot: 'character', from: 'reader',    at: 16 },
    { id: 'c-drake',     name: 'The Drake',     sprite: 'drake',     slot: 'character', from: 'briefing',  at: 20 },
  ];

  /* --------------------------------- shop --------------------------------
   *
   * A deliberately separate pool. Nothing above can ever be bought and nothing
   * here is ever dropped, because the two carry different meanings: a laurel
   * says you got Chronicle to level 2, a traffic cone says you thought it was
   * funny. Collapse them and the drops stop being proof of anything.
   *
   * So this half is the opposite of the other half in every way: it's browsable
   * rather than hidden (you need something to save toward), it's pure
   * expression rather than status, and the stock rotates daily so a big balance
   * can't buy the lot in one sitting.
   */
  const SHOP = [
    { id: 's-tophat', name: 'Top Hat', slot: 'head', price: 260 },
    { id: 's-party', name: 'Party Hat', slot: 'head', price: 140 },
    { id: 's-cone', name: 'Traffic Cone', slot: 'head', price: 180 },
    { id: 's-halo', name: 'Halo', slot: 'head', price: 320 },
    { id: 's-antlers', name: 'Antlers', slot: 'head', price: 220 },
    { id: 's-bandana', name: 'Bandana', slot: 'head', price: 130 },

    { id: 's-eyepatch', name: 'Eyepatch', slot: 'face', price: 150 },
    { id: 's-shades', name: 'Shades', slot: 'face', price: 190 },
    { id: 's-tache', name: 'Moustache', slot: 'face', price: 120 },

    { id: 's-duck', name: 'Rubber Duck', slot: 'hand', price: 200 },
    { id: 's-balloon', name: 'Balloon', slot: 'hand', price: 160 },
    { id: 's-sword', name: 'Wooden Sword', slot: 'hand', price: 280 },
    { id: 's-brolly', name: 'Umbrella', slot: 'hand', price: 210 },
    { id: 's-wand', name: 'Star Wand', slot: 'hand', price: 340 },
    { id: 's-flag', name: 'Little Flag', slot: 'hand', price: 150 },

    { id: 's-shell', name: 'Turtle Shell', slot: 'back', price: 300 },
    { id: 's-jetpack', name: 'Jetpack', slot: 'back', price: 420 },
    { id: 's-angel', name: 'Angel Wings', slot: 'back', price: 460 },

    { id: 's-cloud', name: 'Personal Rain Cloud', slot: 'aura', price: 260 },
    { id: 's-bubbles', name: 'Bubbles', slot: 'aura', price: 180 },
    { id: 's-butterflies', name: 'Butterflies', slot: 'aura', price: 300 },
    { id: 's-sparks', name: 'Sparks', slot: 'aura', price: 140 },

    { id: 's-ink-slate', name: 'Slate', slot: 'ink', price: 200, ink: '#54606B' },
    { id: 's-ink-plum', name: 'Plum', slot: 'ink', price: 240, ink: '#7E4A6B' },
    { id: 's-ink-teal', name: 'Teal', slot: 'ink', price: 240, ink: '#2E7D7B' },
    { id: 's-ink-gold', name: 'Old Gold', slot: 'ink', price: 380, ink: '#A8802A' },
  ].map((i) => ({ ...i, shop: true, from: 'shop' }));

  const ALL = ITEMS.concat(SHOP).concat(CHARACTERS);
  /* -------------------------------- chests --------------------------------
   *
   * Five chests, one per tier, imported from GIF exports (see
   * tools/pixellab-recipe.md). The chest you get tells you the tier before you
   * open it, which is the point: seeing a red one is the anticipation, and
   * opening it is the payoff. Two beats instead of one.
   *
   * Rates below are set so that at roughly two finished games a day the
   * commons fill in about two months, the epics in four and the legendaries in
   * five — long enough to last, frequent enough that a chest is worth opening.
   * 45% of chests hold an item; the rest hold coins, so a chest is never a
   * blank, just not always a surprise.
   */
  const TIERS = [
    { id: 0, name: 'Worn Chest',     rarity: null,        chance: 0.55, coins: [25, 60],  ink: ['#8a6b45', '#c2a06a'] },
    { id: 1, name: 'Green Chest',    rarity: 'common',    chance: 0.26, coins: [10, 25],  ink: ['#5f8a4a', '#8fc47a'] },
    { id: 2, name: 'Steel Chest',    rarity: 'rare',      chance: 0.12, coins: [15, 35],  ink: ['#5b7f9e', '#9ec6e0'] },
    { id: 3, name: 'Emerald Chest',  rarity: 'epic',      chance: 0.05, coins: [30, 70],  ink: ['#2fa36b', '#7fe0b0', '#e0d24a'] },
    { id: 4, name: 'Crimson Chest',  rarity: 'legendary', chance: 0.02, coins: [60, 140], ink: ['#c0392b', '#e8a02c', '#f4d64a'] },
  ];

  // Rarity is derived from the level that used to gate an item, so the ladder
  // that already existed keeps its shape rather than being re-invented.
  function rarityOf(item) {
    if (item.legendary || item.flag) return 'legendary';
    if (!item.at) return null;           // shop items aren't drops
    if (item.at <= 5) return 'common';
    if (item.at <= 10) return 'rare';
    if (item.at <= 15) return 'epic';
    return 'legendary';
  }
  ITEMS.push(...CHARACTERS);
  ITEMS.forEach((i) => { i.rarity = rarityOf(i); });

  const byId = (id) => ALL.find((i) => i.id === id) || null;

  /* ------------------------------- storage ------------------------------- */

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return { owned: {}, equipped: {}, flags: {}, ink: null, coins: 0, earned: 0, chests: [], character: 'c-runner', ...JSON.parse(raw) };
    } catch (err) { /* corrupted — start fresh rather than break every game */ }
    return { owned: {}, equipped: {}, flags: {}, ink: null, coins: 0, earned: 0, chests: [], character: 'c-runner' };
  }

  const w = load();
  w.owned['c-runner'] = w.owned['c-runner'] || 'start';
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(w)); } catch (err) { /* full or private */ } };

  const owns = (id) => !!w.owned[id];

  /* ------------------------------ unlocking ------------------------------ */

  let bays = [];

  function grant(items) {
    const fresh = items.filter((i) => !owns(i.id));
    if (!fresh.length) return [];
    fresh.forEach((i) => {
      w.owned[i.id] = new Date().toISOString().slice(0, 10);
      // An empty slot fills itself, so a new thing is worn the moment it lands
      // rather than sitting unnoticed in a drawer.
      if (i.slot === 'character') { w.character = i.id; }
      else if (i.slot === 'ink') { if (!w.ink) w.ink = i.id; }
      else if (!w.equipped[i.slot]) w.equipped[i.slot] = i.id;
    });
    save();
    refresh();
    return fresh;
  }

  /* -------------------------------- chests -------------------------------- */

  function rollTier() {
    let r = Math.random();
    for (const t of TIERS) { r -= t.chance; if (r <= 0) return t; }
    return TIERS[0];
  }

  // A chest never holds something you already own: it rolls a tier, then draws
  // from what's left in that tier. Duplicates are the fastest way to make a
  // reward system feel like a tax, and there is no reason to allow them. If a
  // tier is exhausted it pays out in coins instead of a shrug.
  function fill(tier) {
    if (!tier.rarity) return null;
    const pool = ITEMS.filter((i) => i.rarity === tier.rarity && !owns(i.id));
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  const pending = () => w.chests.length;

  function awardChest(game, forceTier) {
    const tier = forceTier === undefined ? rollTier() : TIERS[Math.max(0, Math.min(4, forceTier))];
    w.chests.push({ t: tier.id, g: game });
    save();
    refresh();
    return tier;
  }

  // Opens the oldest pending chest and returns what was in it.
  function openChest() {
    const rec = w.chests.shift();
    if (!rec) return null;
    const tier = TIERS[rec.t];
    const item = fill(tier);
    const coins = Math.round(tier.coins[0] + Math.random() * (tier.coins[1] - tier.coins[0]));
    w.coins += coins;
    w.earned += coins;
    save();
    if (item) grant([item]);
    else refresh();
    return { tier, item, coins };
  }

  // Levelling still means something: each milestone hands over a guaranteed
  // Steel-or-better chest rather than a specific item, so the certainty of
  // levelling and the surprise of opening are the same system instead of two.
  function check(game, level) {
    const seen = w.flags['lvl:' + game] || 0;
    if (level <= seen) return [];
    let awarded = 0;
    ITEMS.filter((i) => i.from === game && i.at && i.at > seen && i.at <= level)
      .forEach(() => { awardChest(game, 2 + (awarded++ % 3)); });
    w.flags['lvl:' + game] = level;
    save();
    return awarded;
  }

  // For the things worth more than a level: beating a rival, a clean sweep.
  function grantFlag(flag) {
    if (w.flags[flag]) return [];
    w.flags[flag] = 1;
    save();
    const fresh = grant(ITEMS.filter((i) => i.flag === flag));
    if (fresh.length) reveal(fresh);
    return fresh;
  }

  /* -------------------------------- gear --------------------------------- */

  // An item carries its economy (price, source, level) here and its pixels in
  // lib/gear.js. They're joined only at the point something needs drawing.
  const art = (item) => (item ? { ...item, ...(window.Gear[item.id] || {}) } : null);

  function gear() {
    const out = {};
    SLOTS.forEach((slot) => {
      const item = byId(w.equipped[slot]);
      if (item && owns(item.id)) out[slot] = art(item);
    });
    return out;
  }

  // The sprite every game should draw you as.
  function character() {
    const c = byId(w.character);
    return (c && owns(c.id) && c.sprite) || 'runner';
  }

  function ink() {
    const item = byId(w.ink);
    return item && owns(item.id) ? item.ink : 'var(--p1)';
  }

  function equip(slot, id) {
    if (slot === 'character') w.character = id;
    else if (slot === 'ink') w.ink = id;
    else if (w.equipped[slot] === id) delete w.equipped[slot]; // click again to remove
    else w.equipped[slot] = id;
    save();
    refresh();
  }

  const found = () => Object.keys(w.owned).length;          // everything you have
  const foundDrops = () => ITEMS.filter((i) => owns(i.id)).length;
  // Only drops count toward "still out there" — buying a traffic cone must not
  // read as progress toward the gear you're supposed to earn.
  const remaining = () => ITEMS.length - foundDrops();

  /* -------------------------------- wallet -------------------------------- */

  // Coins come off XP, so they reward the same thing levels do and there's no
  // second scoring system to reason about. Games call earn() when a round ends.
  function earn(n) {
    const amount = Math.max(0, Math.round(n));
    if (!amount) return 0;
    w.coins += amount;
    w.earned += amount;
    save();
    refresh();
    return amount;
  }

  // Stock rotates on the date rather than at random, so it's the same three
  // things all day on every game and doesn't reroll under you mid-decision.
  function daySeed() {
    const d = new Date().toISOString().slice(0, 10);
    let h = 0;
    for (let i = 0; i < d.length; i += 1) h = (h * 31 + d.charCodeAt(i)) | 0;
    return Math.abs(h) || 1;
  }

  const STOCK_SIZE = 3;

  function stock() {
    const pool = SHOP.filter((i) => !owns(i.id));
    if (pool.length <= STOCK_SIZE) return pool;
    let seed = daySeed();
    const picked = [];
    const used = new Set();
    while (picked.length < STOCK_SIZE) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const idx = seed % pool.length;
      if (!used.has(idx)) { used.add(idx); picked.push(pool[idx]); }
    }
    return picked;
  }

  function buy(id) {
    const item = byId(id);
    if (!item || !item.shop || owns(id) || w.coins < item.price) return false;
    w.coins -= item.price;
    save();
    grant([item]);
    reveal([item]);
    return true;
  }

  /* --------------------------------- UI ---------------------------------- */

  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  };

  function refresh() {
    bays.forEach((b) => {
      // Changing character replaces the sprite, so the bay is rebuilt.
      if (b.sprite !== character()) {
        b.sprite = character();
        b.av = Avatar.create(b.root.querySelector('.wardrobe-figure'), { ink: ink(), gear: gear(), sprite: b.sprite });
        b.av.pose('idle');
      }
      b.av.setInk(ink());
      b.av.setGear(gear());
      if (b.panel && !b.panel.classList.contains('hidden')) renderPanel(b);
      const btn = b.root.querySelector('.wardrobe-btn');
      if (btn) btn.innerHTML = wardrobeLabel();
      const coins = b.root.querySelector('.wardrobe-coins');
      if (coins) coins.textContent = `🪙 ${w.coins.toLocaleString()}`;
      const purse = b.root.querySelector('.wardrobe-purse');
      if (purse) {
        purse.innerHTML = storeLabel();
        // A dot only when you could actually buy something today — a badge
        // that is always on is just decoration.
        purse.classList.toggle('affordable', stock().some((i) => w.coins >= i.price));
      }
    });
  }

  function renderPanel(bay) {
    const body = bay.panel.querySelector('.wardrobe-body');
    body.innerHTML = '';
    bay.panel.querySelectorAll('.wardrobe-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.tab === bay.tab);
    });
    if (bay.tab === 'shop') return renderShop(bay, body);

    const ownedItems = ITEMS.filter((i) => owns(i.id));

    PANEL_SLOTS.forEach((slot) => {
      const mine = ownedItems.filter((i) => i.slot === slot);
      if (!mine.length) return;

      const row = el('div', 'wardrobe-slot');
      row.appendChild(el('span', 'wardrobe-slot-label', SLOT_LABEL[slot]));
      const chips = el('div', 'wardrobe-chips');

      mine.forEach((i) => {
        const on = slot === 'ink' ? w.ink === i.id
          : slot === 'character' ? w.character === i.id
          : w.equipped[slot] === i.id;
        const chip = el('button', `wardrobe-chip${on ? ' active' : ''}${i.legendary ? ' legendary' : ''}`,
          `${esc(i.name)}<span class="chip-src">${SOURCE[i.from].icon}</span>`);
        chip.addEventListener('click', () => equip(slot, i.id));
        chips.appendChild(chip);
      });

      row.appendChild(chips);
      body.appendChild(row);
    });

    if (!ownedItems.length) {
      body.appendChild(el('p', 'wardrobe-empty', 'Nothing yet. Play anything and something will turn up.'));
    }

    // The only thing said about locked items is how many there are. Which
    // game, which level, what they look like — all of that is the reward.
    const tally = Object.keys(GAMES).map((k) => {
      const n = ITEMS.filter((i) => i.from === k && owns(i.id)).length;
      const total = ITEMS.filter((i) => i.from === k).length;
      return `${GAMES[k].icon} ${n}/${total}`;
    }).join('   ');

    body.appendChild(el('p', 'wardrobe-remaining',
      `<b>${remaining()}</b> still out there.<span class="wardrobe-tally">${tally}</span>`));
  }

  function renderShop(bay, body) {
    const list = stock();

    if (!list.length) {
      body.appendChild(el('p', 'wardrobe-empty', "You've bought the lot. Nothing left on the shelf."));
      return;
    }

    body.appendChild(el('p', 'shop-note',
      'Three things, changing daily. None of this is earned — it just looks good.'));

    list.forEach((i) => {
      const afford = w.coins >= i.price;
      const row = el('div', `shop-row${afford ? '' : ' broke'}`);

      const preview = el('span', 'shop-preview');
      row.appendChild(preview);

      const meta = el('div', 'shop-meta');
      meta.appendChild(el('span', 'shop-name', esc(i.name)));
      meta.appendChild(el('span', 'shop-slot', SLOT_LABEL[i.slot]));
      row.appendChild(meta);

      const buyBtn = el('button', 'shop-buy', `🪙 ${i.price}`);
      buyBtn.disabled = !afford;
      buyBtn.addEventListener('click', () => { if (buy(i.id)) renderPanel(bay); });
      row.appendChild(buyBtn);

      body.appendChild(row);

      // Shown on your own figure wearing your own gear, so you can see what it
      // would actually look like rather than guessing from a name.
      const worn = i.slot === 'ink' ? {} : { [i.slot]: art(i) };
      Avatar.create(preview, {
        ink: i.slot === 'ink' ? i.ink : ink(),
        gear: { ...gear(), ...worn },
        sprite: character(),
      }).pose('idle');
    });

    body.appendChild(el('p', 'wardrobe-remaining',
      `<b>🪙 ${w.coins.toLocaleString()}</b> in the wallet.`
      + `<span class="wardrobe-tally">${SHOP.filter((i) => owns(i.id)).length}/${SHOP.length} bought</span>`));
  }

  // Name and count are separate elements so the count can be dropped on a
  // narrow screen — the character column is about a quarter of the card, and
  // "👕 Wardrobe · 12" does not fit in it on a phone.
  const wardrobeLabel = () =>
    `👕 <span class="wd-name">Wardrobe</span><span class="wd-count"> · ${found()}</span>`;
  const storeLabel = () =>
    `🪙 <span class="wd-name">Store</span><span class="wd-count"> · ${w.coins.toLocaleString()}</span>`;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Drops the figure and a wardrobe button into a game's profile card.
  function attach(game) {
    const card = document.querySelector('.profile-card');
    if (!card || !window.Avatar) return null;

    const root = el('div', 'wardrobe-bay');
    const stage = el('span', 'wardrobe-figure');
    const btn = el('button', 'wardrobe-btn', wardrobeLabel());
    // The purse is its own control rather than a number hidden one click deep:
    // a shop nobody can find is a shop nobody uses.
    const purse = el('button', 'wardrobe-purse', storeLabel());
    purse.title = 'Open the store — your balance is on the button';
    root.appendChild(stage);
    root.appendChild(btn);
    root.appendChild(purse);

    const panel = el('div', 'wardrobe-panel hidden',
      '<div class="wardrobe-head">'
      + '<div class="wardrobe-tabs">'
      + '<button class="wardrobe-tab active" data-tab="worn">Worn</button>'
      + '<button class="wardrobe-tab" data-tab="shop">Shop</button>'
      + '</div>'
      + '<span class="wardrobe-coins"></span>'
      + '<button class="wardrobe-close" title="Close">✕</button></div>'
      + '<div class="wardrobe-body"></div>');
    root.appendChild(panel);

    // Before the Stats button if there is one, so the figure sits with the
    // level and XP it belongs to.
    const statsBtn = card.querySelector('#stats-btn');
    if (statsBtn) card.insertBefore(root, statsBtn); else card.appendChild(root);

    const av = Avatar.create(stage, { ink: ink(), gear: gear(), sprite: character() });
    av.pose('idle');

    const bay = { root, panel, av, game, tab: 'worn', sprite: character() };
    bays.push(bay);

    panel.querySelectorAll('.wardrobe-tab').forEach((t) => {
      t.addEventListener('click', () => { bay.tab = t.dataset.tab; renderPanel(bay); });
    });
    panel.querySelector('.wardrobe-coins').textContent = `🪙 ${w.coins.toLocaleString()}`;

    const open = (tab) => {
      const closing = !panel.classList.contains('hidden') && bay.tab === tab;
      bay.tab = tab;
      if (!closing) renderPanel(bay);
      panel.classList.toggle('hidden', closing);
    };
    btn.addEventListener('click', () => open('worn'));
    purse.addEventListener('click', () => open('shop'));
    panel.querySelector('.wardrobe-close').addEventListener('click', () => panel.classList.add('hidden'));

    return bay;
  }

  /* ----------------------------- chest opening ---------------------------- */

  const CHEST_ROOT = new URL('sprites/chests/', document.currentScript.src).href;
  const CHEST_FRAMES = 5;
  const COIN = '🟡';

  // Opens one chest with the lid animation, then hands off to the item reveal.
  // The tier is visible before you press anything: seeing a red chest is the
  // anticipation, and the lid is the payoff. Two beats instead of one.
  function openChestUI(after) {
    const rec = w.chests[0];
    if (!rec) { if (after) after(); return; }
    const tier = TIERS[rec.t];

    const scrim = el('div', 'reveal-scrim');
    const card = el('div', 'reveal-card');
    card.appendChild(el('span', 'reveal-kicker',
      pending() > 1 ? pending() + ' chests waiting' : 'A chest'));

    const stage = el('div', 'chest-stage');
    for (let i = 0; i < CHEST_FRAMES; i += 1) {
      const img = el('img', 'chest-f' + (i === 0 ? ' on' : ''));
      img.src = CHEST_ROOT + 't' + tier.id + '-' + i + '.png';
      img.alt = '';
      stage.appendChild(img);
    }
    card.appendChild(stage);
    card.appendChild(el('h3', 'reveal-name', esc(tier.name)));

    const btn = el('button', 'reveal-ok primary', 'Open');
    card.appendChild(btn);
    scrim.appendChild(card);
    document.body.appendChild(scrim);

    let opening = false;
    btn.addEventListener('click', () => {
      if (opening) return;
      opening = true;
      btn.disabled = true;
      const imgs = [].slice.call(stage.querySelectorAll('.chest-f'));
      let f = 0;
      const step = setInterval(() => {
        f += 1;
        imgs.forEach((n, i) => n.classList.toggle('on', i === Math.min(f, CHEST_FRAMES - 1)));
        // A tick per frame as the lid rises, so opening has a rhythm rather
        // than being silent right up until the result.
        if (window.Juice) Juice.buzz(8);
        if (f < CHEST_FRAMES - 1) return;
        clearInterval(step);
        const got = openChest();
        popChest(stage, tier);
        // A beat on the open lid before the contents land.
        setTimeout(() => {
          scrim.remove();
          if (got && got.item) reveal([art(got.item)], got.coins, after);
          else showCoins(got ? got.coins : 0, after);
        }, 620);
      }, 110);
    });
  }

  // The flourish is scaled to the tier on purpose. lib/juice.js makes the case
  // that confetti on every reward is what turns a game into a slot machine, and
  // it is right: a wooden chest gets a tick, and only the top two get the full
  // burst. If every chest celebrated, none of them would.
  function popChest(stage, tier) {
    if (!window.Juice) return;
    const r = stage.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;

    if (!tier.rarity) { Juice.play('correct', 0.3); Juice.buzz(14); return; }

    if (tier.id <= 2) {
      Juice.spawn(x, y, 20, { spread: Math.PI * 2, speed: 5, size: 6, colors: tier.ink });
      Juice.play('win', 0.5);
      Juice.buzz([14, 26]);
      return;
    }

    Juice.spawn(x, y, 54, { spread: Math.PI * 2, speed: 8, size: 7, colors: tier.ink });
    setTimeout(() => Juice.spawn(x, y, 34, { spread: Math.PI * 2, speed: 5, size: 6, colors: tier.ink }), 180);
    Juice.play('level', 0.65);
    Juice.buzz([18, 34, 18, 34]);
    Juice.toast(tier.name);
  }

  function showCoins(coins, after) {
    const scrim = el('div', 'reveal-scrim');
    const card = el('div', 'reveal-card');
    card.appendChild(el('span', 'reveal-kicker', 'Nothing but coin'));
    card.appendChild(el('h3', 'reveal-name', COIN + ' ' + coins));
    card.appendChild(el('p', 'reveal-src', 'Better luck in the next one'));
    const ok = el('button', 'reveal-ok primary', pending() ? 'Next chest' : 'Close');
    card.appendChild(ok);
    scrim.appendChild(card);
    document.body.appendChild(scrim);
    ok.addEventListener('click', () => {
      scrim.remove();
      if (pending()) openChestUI(after); else if (after) after();
    });
  }

  /* ------------------------------- reveal -------------------------------- */

  // The payoff. One card per item, the figure wearing it, and no warning that
  // it was coming.
  function reveal(items, coins, after) {
    if (!items.length || !window.Avatar) { if (after) after(); return; }

    const scrim = el('div', 'reveal-scrim');
    const card = el('div', 'reveal-card');
    const stage = el('span', 'reveal-figure');

    card.appendChild(el('span', 'reveal-kicker', items[0].legendary ? 'Legendary find' : 'Found something'));
    card.appendChild(stage);
    card.appendChild(el('h3', 'reveal-name', esc(items[0].name)));
    card.appendChild(el('p', 'reveal-src',
      `${SLOT_LABEL[items[0].slot]} · dropped by ${SOURCE[items[0].from].icon} ${SOURCE[items[0].from].label}`));
    if (coins) card.appendChild(el('p', 'reveal-more', COIN + ' ' + coins + ' as well'));
    if (items.length > 1) card.appendChild(el('p', 'reveal-more', `+ ${items.length - 1} more`));

    const dismiss = el('button', 'reveal-ok primary', items.length > 1 ? 'Next' : (pending() ? 'Next chest' : 'Wear it'));
    card.appendChild(dismiss);
    scrim.appendChild(card);
    document.body.appendChild(scrim);

    // Shown on the figure straight away — the item is the picture, not a label.
    const worn = {};
    if (items[0].slot !== 'ink') worn[items[0].slot] = art(items[0]);
    const av = Avatar.create(stage, {
      ink: items[0].slot === 'ink' ? items[0].ink : ink(),
      gear: { ...gear(), ...worn },
      // A new character is previewed as itself, not as whoever you are now.
      sprite: items[0].slot === 'character' ? items[0].sprite : character(),
    });
    av.pose('idle');
    setTimeout(() => av.flash('cheer', 1200), 260);

    const close = () => {
      scrim.remove();
      if (items.length > 1) { reveal(items.slice(1), 0, after); return; }
      refresh();
      if (pending()) openChestUI(after); else if (after) after();
    };
    dismiss.addEventListener('click', close);
    scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
  }

  return {
    attach,
    check,
    awardChest,
    openChest,
    openChestUI,
    pending,
    TIERS,
    earn,
    coins: () => w.coins,
    buy,
    stock,
    grantFlag,
    gear,
    ink,
    character,
    owns,
    found,
    foundDrops,
    remaining,
    total: () => ITEMS.length,
  };
})();
