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
  const SLOT_LABEL = { head: 'Head', face: 'Face', back: 'Back', hand: 'Hand', aura: 'Aura', ink: 'Ink' };

  /* ------------------------------ catalogue ------------------------------ */

  // `at` is the level in `from` that drops it. `flag` items ignore level and
  // are granted by the game calling grantFlag() when something notable happens.
  const ITEMS = [
    /* ---- Numbers: mental math, moss ---- */
    { id: 'cap', name: 'Field Cap', slot: 'head', from: 'numbers', at: 2,
      svg: '<path class="av-fill" d="M13.8 7.8a6.3 6.3 0 0 1 12.4 0z"/><path d="M26.2 7.8h5"/>' },
    { id: 'sliderule', name: 'Slide Rule', slot: 'hand', from: 'numbers', at: 3,
      svg: '<path class="av-thick" d="M-1.5 0h9"/><path d="M2 -1.6v3.2"/>' },
    { id: 'specs', name: 'Working Specs', slot: 'face', from: 'numbers', at: 4,
      svg: '<circle cx="17.2" cy="9.2" r="2.1"/><circle cx="23" cy="9.2" r="2.1"/><path d="M19.3 9.2h1.6"/>' },
    { id: 'digits', name: 'Orbiting Digits', slot: 'aura', from: 'numbers', at: 5,
      svg: '<g class="av-orbit"><circle class="av-fill" cx="20" cy="6" r="1.3"/><circle class="av-fill" cx="31" cy="24" r="1.3"/><circle class="av-fill" cx="9" cy="24" r="1.3"/></g>' },
    { id: 'satchel', name: 'Chalk Satchel', slot: 'back', from: 'numbers', at: 6,
      svg: '<path class="av-cape" d="M12 21h6.2v7.4H12z"/><path d="M15.2 21v-2.6"/>' },
    { id: 'graphite', name: 'Graphite', slot: 'ink', from: 'numbers', at: 7, ink: '#4A433E' },
    { id: 'visor', name: 'Counting Visor', slot: 'face', from: 'numbers', at: 8,
      svg: '<path class="av-fill" d="M13.6 7.6h12.8v2.6H13.6z"/>' },
    { id: 'abacus', name: 'Pocket Abacus', slot: 'hand', from: 'numbers', at: 10,
      svg: '<path d="M-1 -2.6h7v6h-7z"/><path d="M-1 -.6h7M-1 1.4h7"/>' },
    { id: 'pihalo', name: 'Halo of Pi', slot: 'aura', from: 'numbers', at: 12,
      svg: '<ellipse cx="20" cy="2.6" rx="7.4" ry="2.2"/>' },
    { id: 'sevens', name: 'Crown of Sevens', slot: 'head', from: 'numbers', at: 15,
      svg: '<path class="av-fill" d="M14.2 4.6l1.4-3.8 2.3 2.6 2.1-3.6 2.1 3.6 2.3-2.6 1.4 3.8z"/>' },
    { id: 'carrycape', name: 'Cape of Carries', slot: 'back', from: 'numbers', at: 20,
      svg: '<path class="av-cape" d="M20 17c-5.4 2.8-7.3 9.4-8.7 15.2 4.6 1.4 12.8 1.4 17.4 0C27.3 26.4 25.4 19.8 20 17z"/><path d="M15.6 18.2h8.8"/>' },

    /* ---- Mapmaster: geography, azure ---- */
    { id: 'pith', name: "Explorer's Pith", slot: 'head', from: 'mapmaster', at: 2,
      svg: '<path class="av-fill" d="M14.2 6.8a5.9 5.9 0 0 1 11.6 0z"/><path class="av-thick" d="M11.8 7h16.4"/>' },
    { id: 'compass', name: 'Brass Compass', slot: 'hand', from: 'mapmaster', at: 3,
      svg: '<circle cx="2" cy="0" r="3.4"/><path class="av-fill" d="M2-2.4l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3L-1.1 1.2 1.1-.1z"/>' },
    { id: 'pack', name: 'Trail Pack', slot: 'back', from: 'mapmaster', at: 4,
      svg: '<path class="av-cape" d="M12.4 20h6.4v9h-6.4z"/><path d="M12.4 24h6.4"/>' },
    { id: 'globe', name: 'Orbiting Globe', slot: 'aura', from: 'mapmaster', at: 5,
      svg: '<g class="av-orbit"><circle class="av-fill" cx="31" cy="18" r="2.6"/></g>' },
    { id: 'goggles', name: 'Summit Goggles', slot: 'face', from: 'mapmaster', at: 6,
      svg: '<path class="av-fill" d="M14.2 7.6h4.8v3.2h-4.8zM21 7.6h4.8v3.2H21z"/><path d="M19 9.2h2"/>' },
    { id: 'azure', name: 'Azure', slot: 'ink', from: 'mapmaster', at: 7, ink: '#3F6FA8' },
    { id: 'staff', name: 'Walking Staff', slot: 'hand', from: 'mapmaster', at: 8,
      svg: '<path class="av-thick" d="M1.6-9.5v18"/>' },
    { id: 'captain', name: "Captain's Cap", slot: 'head', from: 'mapmaster', at: 10,
      svg: '<path class="av-fill" d="M14.4 6.6a5.7 5.7 0 0 1 11.2 0z"/><path class="av-thick" d="M13.6 6.8h13.2"/><path d="M26.4 6.8h4"/>' },
    { id: 'constellation', name: 'Constellation', slot: 'aura', from: 'mapmaster', at: 12,
      svg: '<g class="av-orbit"><circle class="av-fill" cx="30" cy="14" r="1.1"/><circle class="av-fill" cx="33" cy="21" r="1.1"/><circle class="av-fill" cx="27" cy="24" r="1.1"/><path d="M30 14l3 7-6 3"/></g>' },
    { id: 'sextant', name: 'Sextant', slot: 'hand', from: 'mapmaster', at: 15,
      svg: '<path d="M-1 3.6L4.4-4"/><path d="M-1 3.6A7 7 0 0 0 6 2"/><path d="M4.4-4L1.4 3"/>' },
    { id: 'wings', name: "Cartographer's Wings", slot: 'back', from: 'mapmaster', at: 20,
      svg: '<path class="av-cape" d="M20 19c-4.4-3.4-9.6-4-12.8.4 3.6-.6 6 .6 7.4 2.6-3.2.2-5.8 1.8-7 4.2 3.8-1.6 8-1.2 12.4 1.2z"/><path class="av-cape" d="M20 19c4.4-3.4 9.6-4 12.8.4-3.6-.6-6 .6-7.4 2.6 3.2.2 5.8 1.8 7 4.2-3.8-1.6-8-1.2-12.4 1.2z"/>' },

    /* ---- Chronicle: history, ember ---- */
    { id: 'laurel', name: 'Laurel Wreath', slot: 'head', from: 'chronicle', at: 2,
      svg: '<path d="M13.6 12.2A7.2 7.2 0 0 1 14.8 4.2"/><path d="M26.4 12.2A7.2 7.2 0 0 0 25.2 4.2"/>' },
    { id: 'hourglass', name: 'Hourglass', slot: 'hand', from: 'chronicle', at: 3,
      svg: '<path d="M-1.4-3.4h6.8M-1.4 3.4h6.8"/><path class="av-fill" d="M-1.4-3.4L5.4 3.4M5.4-3.4L-1.4 3.4"/>' },
    { id: 'robe', name: 'Senator’s Robe', slot: 'back', from: 'chronicle', at: 4,
      svg: '<path class="av-cape" d="M20 17c-5 2.6-6.8 9-8 14.6 4.2 1.2 11.8 1.2 16 0C26.8 26 25 19.6 20 17z"/><path d="M17 18.4l-2.6 12"/>' },
    { id: 'scroll', name: 'Floating Scroll', slot: 'aura', from: 'chronicle', at: 5,
      svg: '<g class="av-orbit"><path class="av-fill" d="M28.6 15.6h6v3.6h-6z"/></g>' },
    { id: 'monocle', name: 'Monocle', slot: 'face', from: 'chronicle', at: 6,
      svg: '<circle cx="22.6" cy="9" r="2.5"/><path d="M22.6 11.5v2.8"/>' },
    { id: 'ember', name: 'Ember', slot: 'ink', from: 'chronicle', at: 7, ink: '#B4622F' },
    { id: 'torch', name: 'Torch', slot: 'hand', from: 'chronicle', at: 8,
      svg: '<path class="av-thick" d="M1.6 8v-6"/><path class="av-fill" d="M1.6-6c2.6 2.2 3.4 4 3.4 5.4a3.4 3.4 0 0 1-6.8 0c0-1.4.8-3.2 3.4-5.4z"/>' },
    { id: 'helm', name: 'Centurion Helm', slot: 'head', from: 'chronicle', at: 10,
      svg: '<path class="av-fill" d="M14 7.2a6 6 0 0 1 12 0z"/><path class="av-thick" d="M20 1v4.4"/>' },
    { id: 'comet', name: 'Comet', slot: 'aura', from: 'chronicle', at: 12,
      svg: '<g class="av-orbit"><circle class="av-fill" cx="31" cy="16" r="1.9"/><path d="M31 16l6 4"/></g>' },
    { id: 'sceptre', name: 'Sceptre', slot: 'hand', from: 'chronicle', at: 15,
      svg: '<path class="av-thick" d="M1.6 8v-9"/><circle class="av-fill" cx="1.6" cy="-3.4" r="2.4"/>' },
    { id: 'pharaoh', name: 'Pharaoh’s Crown', slot: 'head', from: 'chronicle', at: 20,
      svg: '<path class="av-fill" d="M15.6 6.6l.9-6.4h7l.9 6.4z"/><path d="M20 .2v6.4"/>' },

    /* ---- Reader: speed reading, violet ---- */
    { id: 'readers', name: 'Reading Glasses', slot: 'face', from: 'reader', at: 2,
      svg: '<path d="M14.4 7.8h4.6v3h-4.6zM21 7.8h4.6v3H21z"/><path d="M19 9.2h2"/>' },
    { id: 'book', name: 'Open Book', slot: 'hand', from: 'reader', at: 3,
      svg: '<path d="M-2 -2.4h4.2v5.6H-2zM2.2-2.4h4.2v5.6H2.2z"/><path d="M2.2-2.4v5.6"/>' },
    { id: 'page', name: 'Loose Page', slot: 'aura', from: 'reader', at: 4,
      svg: '<g class="av-orbit"><path class="av-fill" d="M28.8 14.6h5.4v6.8h-5.4z"/></g>' },
    { id: 'nightcap', name: 'Nightcap', slot: 'head', from: 'reader', at: 5,
      svg: '<path class="av-fill" d="M14 7.6a6 6 0 0 1 11.4-1.8c1.8 1.2 3.8 1.6 5 1.4-1 1.8-3 2.8-5 2.6z"/>' },
    { id: 'scarf', name: 'Long Scarf', slot: 'back', from: 'reader', at: 6,
      svg: '<path class="av-thick" d="M15 18.2h10"/><path d="M15.4 18.4l-1.8 7.6"/>' },
    { id: 'violet', name: 'Violet', slot: 'ink', from: 'reader', at: 7, ink: '#6C5091' },
    { id: 'quill', name: 'Quill', slot: 'hand', from: 'reader', at: 8,
      svg: '<path class="av-thick" d="M-1 6L5 -6"/><path d="M5-6c-2.6 1.4-4 3.4-4.4 6"/>' },
    { id: 'lamp', name: 'Reading Lamp', slot: 'hand', from: 'reader', at: 10,
      svg: '<path d="M1.6-5.4v2"/><path class="av-fill" d="M-1.8-3.4h6.8L3.6 3H.6z"/>' },
    { id: 'words', name: 'Swirl of Words', slot: 'aura', from: 'reader', at: 12,
      svg: '<g class="av-orbit"><path d="M28 14h6M29.4 18h5.4M27.6 22h6.6"/></g>' },
    { id: 'tomecape', name: 'Library Cloak', slot: 'back', from: 'reader', at: 15,
      svg: '<path class="av-cape" d="M20 17c-6 3-8 10-9.4 16 5 1.4 13.8 1.4 18.8 0C28 27 26 20 20 17z"/><path d="M20 18v14"/>' },
    { id: 'bookmark', name: 'Bookmark Circlet', slot: 'head', from: 'reader', at: 20,
      svg: '<path class="av-thick" d="M14 6h12"/><path class="av-fill" d="M22.4 6h3.2v5l-1.6-1.6L22.4 11z"/>' },

    /* ---- Briefing: the daily, rose ---- */
    { id: 'beanie', name: 'Morning Beanie', slot: 'head', from: 'briefing', at: 2,
      svg: '<path class="av-fill" d="M14 8a6 6 0 0 1 12 0z"/><path class="av-thick" d="M13.6 8.2h12.8"/>' },
    { id: 'mug', name: 'Enamel Mug', slot: 'hand', from: 'briefing', at: 3,
      svg: '<path class="av-fill" d="M-1.6-2.6h6v6h-6z"/><path d="M4.4-1.2h2v3h-2"/>' },
    { id: 'messenger', name: 'Messenger Bag', slot: 'back', from: 'briefing', at: 4,
      svg: '<path class="av-cape" d="M11.8 22h7v6.4h-7z"/><path d="M12.4 22l7-4.4"/>' },
    { id: 'sunrise', name: 'Sunrise', slot: 'aura', from: 'briefing', at: 5,
      svg: '<path d="M12 33h16"/><path class="av-fill" d="M14.8 33a5.2 5.2 0 0 1 10.4 0z"/>' },
    { id: 'rose', name: 'Rose', slot: 'ink', from: 'briefing', at: 7, ink: '#B0526B' },
    { id: 'clipboard', name: 'Clipboard', slot: 'hand', from: 'briefing', at: 8,
      svg: '<path d="M-1.4-3.4h6.6v7.4h-6.6z"/><path class="av-fill" d="M.6-4.4h2.6v2H.6z"/>' },
    { id: 'headset', name: 'Headset', slot: 'face', from: 'briefing', at: 10,
      svg: '<path d="M14 9.2a6.1 6.1 0 0 1 12 0"/><circle class="av-fill" cx="13.8" cy="10.4" r="1.5"/><path d="M15.2 12.4h3.2"/>' },
    { id: 'streakflame', name: 'Streak Flame', slot: 'aura', from: 'briefing', at: 12,
      svg: '<g class="av-orbit"><path class="av-fill" d="M31 14c2.6 2.4 3.4 4.2 3.4 5.6a3.4 3.4 0 0 1-6.8 0c0-1.4.8-3.2 3.4-5.6z"/></g>' },
    { id: 'dawncape', name: 'Dawn Cloak', slot: 'back', from: 'briefing', at: 15,
      svg: '<path class="av-cape" d="M20 17.4c-5.6 2.8-7.6 9.6-9 15.4 4.8 1.4 13.2 1.4 18 0-1.4-5.8-3.4-12.6-9-15.4z"/><path d="M14.4 24h11.2"/>' },

    /* ---- Legendaries: earned by doing a thing, not by grinding a level ---- */
    { id: 'metronomecrown', name: "The Metronome's Crown", slot: 'head', from: 'numbers',
      flag: 'numbers:metronome-hard', legendary: true,
      svg: '<path class="av-fill" d="M14.4 5.2l1.6-4.2 2.2 2.8 1.8-3.4 1.8 3.4 2.2-2.8 1.6 4.2z"/><path d="M20 5.2v-4"/>' },
    { id: 'ghostbreaker', name: 'Ghostbreaker', slot: 'aura', from: 'numbers',
      flag: 'numbers:beat-ghost', legendary: true,
      svg: '<g class="av-orbit"><path d="M13 24a8 8 0 0 1 8-8"/><path d="M27 20a8 8 0 0 1-6 7.8"/></g>' },
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
    { id: 's-tophat', name: 'Top Hat', slot: 'head', price: 260,
      svg: '<path class="av-thick" d="M13.4 6.4h13.2"/><path class="av-fill" d="M15.4 6.4V-.4h9.2v6.8z"/>' },
    { id: 's-party', name: 'Party Hat', slot: 'head', price: 140,
      svg: '<path class="av-fill" d="M20 -1.6l4.6 8.4h-9.2z"/><circle class="av-fill" cx="20" cy="-2.4" r="1.4"/>' },
    { id: 's-cone', name: 'Traffic Cone', slot: 'head', price: 180,
      svg: '<path class="av-fill" d="M20 -1l4.2 8h-8.4z"/><path class="av-thick" d="M14.6 7h10.8"/>' },
    { id: 's-halo', name: 'Halo', slot: 'head', price: 320,
      svg: '<ellipse cx="20" cy="1" rx="5" ry="1.7"/>' },
    { id: 's-antlers', name: 'Antlers', slot: 'head', price: 220,
      svg: '<path d="M16.6 4.4L14.4-.4M14.4-.4l-2.6.6M14.4-.4l.4-2.6"/><path d="M23.4 4.4L25.6-.4M25.6-.4l2.6.6M25.6-.4l-.4-2.6"/>' },
    { id: 's-bandana', name: 'Bandana', slot: 'head', price: 130,
      svg: '<path class="av-fill" d="M13.9 7.4a6.2 6.2 0 0 1 12.2 0z"/><path d="M13.9 7.4l-3 2.6"/>' },

    { id: 's-eyepatch', name: 'Eyepatch', slot: 'face', price: 150,
      svg: '<path class="av-fill" d="M20.6 7.2h4.4v3.6h-4.4z"/><path d="M13.9 7.6h12.2"/>' },
    { id: 's-shades', name: 'Shades', slot: 'face', price: 190,
      svg: '<path class="av-fill" d="M14.6 7.4h4.4v2.8h-4.4zM21 7.4h4.4v2.8H21z"/><path d="M19 8.4h2"/>' },
    { id: 's-tache', name: 'Moustache', slot: 'face', price: 120,
      svg: '<path class="av-fill" d="M16.6 12.4c1.2-1.4 2.4-1.4 3.4 0 1-1.4 2.2-1.4 3.4 0-1 .8-2.2 1-3.4.2-1.2.8-2.4.6-3.4-.2z"/>' },

    { id: 's-duck', name: 'Rubber Duck', slot: 'hand', price: 200,
      svg: '<circle class="av-fill" cx="1.6" cy="0" r="2.8"/><path class="av-fill" d="M4.2-1.2h2.4l-1.6 1.6z"/>' },
    { id: 's-balloon', name: 'Balloon', slot: 'hand', price: 160,
      svg: '<path d="M1.6 1.4v-4"/><ellipse class="av-fill" cx="1.6" cy="-5.6" rx="3" ry="3.6"/>' },
    { id: 's-sword', name: 'Wooden Sword', slot: 'hand', price: 280,
      svg: '<path class="av-thick" d="M1.6 4V-8"/><path class="av-thick" d="M-1.6 1.4h6.4"/>' },
    { id: 's-brolly', name: 'Umbrella', slot: 'hand', price: 210,
      svg: '<path class="av-thick" d="M1.6 6V-3"/><path class="av-fill" d="M-3.4-3a5 5 0 0 1 10 0z"/>' },
    { id: 's-wand', name: 'Star Wand', slot: 'hand', price: 340,
      svg: '<path class="av-thick" d="M-.6 5L3-4"/><path class="av-fill" d="M3.4-7.4l1 2.4 2.6.2-2 1.8.6 2.6-2.2-1.4-2.2 1.4.6-2.6-2-1.8 2.6-.2z"/>' },
    { id: 's-flag', name: 'Little Flag', slot: 'hand', price: 150,
      svg: '<path class="av-thick" d="M1.6 6V-7"/><path class="av-fill" d="M1.6-7h6l-1.6 2.4L7.6-2.2h-6z"/>' },

    { id: 's-shell', name: 'Turtle Shell', slot: 'back', price: 300,
      svg: '<path class="av-cape" d="M20 18c-5.4 1.6-7.4 7-7.4 10.6 0 2.4 14.8 2.4 14.8 0 0-3.6-2-9-7.4-10.6z"/><path d="M13.6 24.6h12.8"/>' },
    { id: 's-jetpack', name: 'Jetpack', slot: 'back', price: 420,
      svg: '<path class="av-cape" d="M12.6 19.4h6v9h-6z"/><path class="av-fill" d="M15.6 28.4c1.6 1.6 2.2 2.8 2.2 3.6a2.2 2.2 0 0 1-4.4 0c0-.8.6-2 2.2-3.6z"/>' },
    { id: 's-angel', name: 'Angel Wings', slot: 'back', price: 460,
      svg: '<path class="av-cape" d="M20 18c-3.6-2.6-8.6-3-11 .8 3 0 5 1 6 2.6-2.4.4-4.4 1.8-5.2 3.8 3-1.4 6.6-1 10.2 1z"/><path class="av-cape" d="M20 18c3.6-2.6 8.6-3 11 .8-3 0-5 1-6 2.6 2.4.4 4.4 1.8 5.2 3.8-3-1.4-6.6-1-10.2 1z"/>' },

    { id: 's-cloud', name: 'Personal Rain Cloud', slot: 'aura', price: 260,
      svg: '<path class="av-fill" d="M14.4 1.6a3 3 0 0 1 5.8-.8 2.6 2.6 0 0 1 4 .8z"/><path d="M15.6 3.4l-1 2.4M20 3.4l-1 2.4M24.4 3.4l-1 2.4"/>' },
    { id: 's-bubbles', name: 'Bubbles', slot: 'aura', price: 180,
      svg: '<g class="av-orbit"><circle cx="30" cy="15" r="2"/><circle cx="33" cy="22" r="1.3"/><circle cx="28" cy="25" r="1"/></g>' },
    { id: 's-butterflies', name: 'Butterflies', slot: 'aura', price: 300,
      svg: '<g class="av-orbit"><path class="av-fill" d="M30 15c-1.4-1.4-3-1-3 .4s2 1.6 3 .6c1 1 3 .8 3-.6s-1.6-1.8-3-.4z"/><path class="av-fill" d="M28 24c-1-1-2.2-.7-2.2.3s1.4 1.1 2.2.4c.8.7 2.2.6 2.2-.4s-1.2-1.3-2.2-.3z"/></g>' },
    { id: 's-sparks', name: 'Sparks', slot: 'aura', price: 140,
      svg: '<g class="av-orbit"><path d="M30 14v2.6M33 20.4l-2.2 1M27.6 24.4l1.4-2.2"/></g>' },

    { id: 's-ink-slate', name: 'Slate', slot: 'ink', price: 200, ink: '#54606B' },
    { id: 's-ink-plum', name: 'Plum', slot: 'ink', price: 240, ink: '#7E4A6B' },
    { id: 's-ink-teal', name: 'Teal', slot: 'ink', price: 240, ink: '#2E7D7B' },
    { id: 's-ink-gold', name: 'Old Gold', slot: 'ink', price: 380, ink: '#A8802A' },
  ].map((i) => ({ ...i, shop: true, from: 'shop' }));

  const ALL = ITEMS.concat(SHOP);
  const byId = (id) => ALL.find((i) => i.id === id) || null;

  /* ------------------------------- storage ------------------------------- */

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return { owned: {}, equipped: {}, flags: {}, ink: null, coins: 0, earned: 0, ...JSON.parse(raw) };
    } catch (err) { /* corrupted — start fresh rather than break every game */ }
    return { owned: {}, equipped: {}, flags: {}, ink: null, coins: 0, earned: 0 };
  }

  const w = load();
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
      if (i.slot === 'ink') { if (!w.ink) w.ink = i.id; }
      else if (!w.equipped[i.slot]) w.equipped[i.slot] = i.id;
    });
    save();
    refresh();
    return fresh;
  }

  // Called by a game whenever its level may have moved. Grants everything that
  // game drops at or below the level, then shows the reveal.
  function check(game, level) {
    const fresh = grant(ITEMS.filter((i) => i.from === game && i.at && i.at <= level));
    if (fresh.length) reveal(fresh);
    return fresh;
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

  function gear() {
    const out = {};
    SLOTS.forEach((slot) => {
      const item = byId(w.equipped[slot]);
      if (item && owns(item.id)) out[slot] = item;
    });
    return out;
  }

  function ink() {
    const item = byId(w.ink);
    return item && owns(item.id) ? item.ink : 'var(--p1)';
  }

  function equip(slot, id) {
    if (slot === 'ink') w.ink = id;
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
      b.av.setInk(ink());
      b.av.setGear(gear());
      if (b.panel && !b.panel.classList.contains('hidden')) renderPanel(b);
      const btn = b.root.querySelector('.wardrobe-btn');
      if (btn) btn.textContent = `👕 Wardrobe · ${found()}`;
      const coins = b.root.querySelector('.wardrobe-coins');
      if (coins) coins.textContent = `🪙 ${w.coins.toLocaleString()}`;
      const purse = b.root.querySelector('.wardrobe-purse');
      if (purse) {
        purse.textContent = `🪙 ${w.coins.toLocaleString()}`;
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

    [...SLOTS, 'ink'].forEach((slot) => {
      const mine = ownedItems.filter((i) => i.slot === slot);
      if (!mine.length) return;

      const row = el('div', 'wardrobe-slot');
      row.appendChild(el('span', 'wardrobe-slot-label', SLOT_LABEL[slot]));
      const chips = el('div', 'wardrobe-chips');

      mine.forEach((i) => {
        const on = slot === 'ink' ? w.ink === i.id : w.equipped[slot] === i.id;
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
      const worn = i.slot === 'ink' ? {} : { [i.slot]: i };
      Avatar.create(preview, {
        ink: i.slot === 'ink' ? i.ink : ink(),
        gear: { ...gear(), ...worn },
      }).pose('idle');
    });

    body.appendChild(el('p', 'wardrobe-remaining',
      `<b>🪙 ${w.coins.toLocaleString()}</b> in the purse.`
      + `<span class="wardrobe-tally">${SHOP.filter((i) => owns(i.id)).length}/${SHOP.length} bought</span>`));
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Drops the figure and a wardrobe button into a game's profile card.
  function attach(game) {
    const card = document.querySelector('.profile-card');
    if (!card || !window.Avatar) return null;

    const root = el('div', 'wardrobe-bay');
    const stage = el('span', 'wardrobe-figure');
    const btn = el('button', 'wardrobe-btn', `👕 Wardrobe · ${found()}`);
    // The purse is its own control rather than a number hidden one click deep:
    // a shop nobody can find is a shop nobody uses.
    const purse = el('button', 'wardrobe-purse', `🪙 ${w.coins.toLocaleString()}`);
    purse.title = 'Shop';
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

    const av = Avatar.create(stage, { ink: ink(), gear: gear() });
    av.pose('idle');

    const bay = { root, panel, av, game, tab: 'worn' };
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

  /* ------------------------------- reveal -------------------------------- */

  // The payoff. One card per item, the figure wearing it, and no warning that
  // it was coming.
  function reveal(items) {
    if (!items.length || !window.Avatar) return;

    const scrim = el('div', 'reveal-scrim');
    const card = el('div', 'reveal-card');
    const stage = el('span', 'reveal-figure');

    card.appendChild(el('span', 'reveal-kicker', items[0].legendary ? 'Legendary find' : 'Found something'));
    card.appendChild(stage);
    card.appendChild(el('h3', 'reveal-name', esc(items[0].name)));
    card.appendChild(el('p', 'reveal-src',
      `${SLOT_LABEL[items[0].slot]} · dropped by ${SOURCE[items[0].from].icon} ${SOURCE[items[0].from].label}`));
    if (items.length > 1) card.appendChild(el('p', 'reveal-more', `+ ${items.length - 1} more`));

    const dismiss = el('button', 'reveal-ok primary', items.length > 1 ? 'Next' : 'Wear it');
    card.appendChild(dismiss);
    scrim.appendChild(card);
    document.body.appendChild(scrim);

    // Shown on the figure straight away — the item is the picture, not a label.
    const worn = {};
    if (items[0].slot !== 'ink') worn[items[0].slot] = items[0];
    const av = Avatar.create(stage, {
      ink: items[0].slot === 'ink' ? items[0].ink : ink(),
      gear: { ...gear(), ...worn },
    });
    av.pose('idle');
    setTimeout(() => av.flash('cheer', 1200), 260);

    const close = () => {
      scrim.remove();
      if (items.length > 1) reveal(items.slice(1));
      else refresh();
    };
    dismiss.addEventListener('click', close);
    scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
  }

  return {
    attach,
    check,
    earn,
    coins: () => w.coins,
    buy,
    stock,
    grantFlag,
    gear,
    ink,
    owns,
    found,
    foundDrops,
    remaining,
    total: () => ITEMS.length,
  };
})();
