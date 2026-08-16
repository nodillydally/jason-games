/* lib/elo.js — one scale for every domain: the cross-game scoreboard.
 *
 * Numbers, Geography, History, Spelling and Memory earn REAL per-answer Elo
 * inside their games (1000 baseline, ~300 a tier, rating moves by surprise).
 * Reading and Briefing are MAPPED onto the same scale from their own honest
 * units:
 *
 *   Reading   1000 + 300·log2(effective wpm / 250) — 250 ewpm (a solid adult
 *             reader at full comprehension) sits at baseline; doubling the
 *             effective rate is worth a tier, like rating tiers everywhere.
 *   Memory    a span, not a percentage: an unaided digit span of 7 is the
 *             average adult, so 7 sits at 1000 and every extra place is worth
 *             200. Its game does that conversion itself, so what lands here is
 *             already a rating.
 *   Briefing  grade quality + CONSISTENCY. Base maps the average grade
 *             (B/75 ≈ 1060, 70 ≈ 1000); then the last 14 days of keeping the
 *             brief move it ±100 — all 14 kept = +100, half = 0, none = −100.
 *             Writing well matters; showing up daily matters too.
 *
 * Overall = mean of the domains that have data. Shown on the hub; each
 * domain's own stats screen shows its detail.
 */

window.EloBoard = (function () {
  'use strict';

  const read = (key) => {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  };

  const mean = (vals) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);

  function numbers() {
    const s = read('numbers.profile.v1');
    if (!s || !s.elo) return null;
    const rs = Object.values(s.elo).filter((e) => e && e.n > 0).map((e) => e.r);
    if (!rs.length) return null;
    return { rating: mean(rs), detail: `${rs.length} topics rated` };
  }

  function geography() {
    const s = read('mapmaster-v1');
    if (!s || !s.elo) return null;
    const rs = Object.values(s.elo).filter((e) => e && e.n > 0).map((e) => e.r);
    if (!rs.length) return null;
    return { rating: mean(rs), detail: `${rs.length} continents rated` };
  }

  function history() {
    const s = read('chronicle.profile.v1');
    if (!s || !s.elo || !s.elo.n) return null;
    return { rating: s.elo.r, detail: `${s.elo.n} rated answers` };
  }

  // Per-TRAP ratings, not per-word: the finding worth carrying is "still loses
  // -ible words", not "missed irresistible once".
  function spelling() {
    const s = read('spelling.profile.v1');
    if (!s || !s.elo) return null;
    const rs = Object.values(s.elo).filter((e) => e && e.n > 0).map((e) => e.r);
    if (!rs.length) return null;
    const banked = Object.values(s.words || {}).filter((w) => w.learned).length;
    return { rating: mean(rs), detail: `${rs.length} traps rated · ${banked} words banked` };
  }

  // Span kinds only. Memory's Pairs mode is scored and pays out like everything
  // else, but it never reaches this number — a board rewards a search strategy
  // as much as recall, and averaging that into digit span would make the
  // rating mean less rather than more.
  function memory() {
    const s = read('memory.profile.v1');
    if (!s || !s.elo) return null;
    const rs = Object.values(s.elo).filter((e) => e && e.n > 0).map((e) => e.r);
    if (!rs.length) return null;
    const best = Math.max(0, ...Object.values(s.span || {}));
    return { rating: mean(rs), detail: best ? `best span ${best}` : `${rs.length} kinds rated` };
  }

  function reading() {
    const s = read('reader.profile.v1');
    if (!s || !Array.isArray(s.history) || !s.history.length) return null;
    // Recent measured sessions only — the trend is the score.
    const recent = s.history.slice(-10).map((h) => h.ewpm).filter((v) => v > 0);
    if (!recent.length) return null;
    const ewpm = mean(recent);
    return { rating: 1000 + 300 * Math.log2(ewpm / 250), detail: `${Math.round(ewpm)} effective wpm` };
  }

  function briefing() {
    const s = read('briefing.profile.v1');
    if (!s || !s.gradedCount) return null;
    const avg = s.scoreSum / s.gradedCount;                 // 0-100
    const base = 1000 + (avg - 70) * 12;                    // 70 -> 1000, 85 -> 1180

    // Consistency over the last 14 days: kept days move the rating ±100.
    const kept = { ...(s.doneDates || {}), ...(s.keptDays || {}) };
    let keptCount = 0;
    for (let i = 0; i < 14; i += 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      if (kept[d.toISOString().slice(0, 10)]) keptCount += 1;
    }
    const consistency = 200 * (keptCount / 14 - 0.5);
    return { rating: base + consistency, detail: `${Math.round(avg)} avg grade · ${keptCount}/14 days kept` };
  }

  function board() {
    const domains = [
      { key: 'numbers', label: 'Numbers', icon: '🔢', ...(numbers() || { rating: null }) },
      { key: 'mapmaster', label: 'Geography', icon: '🌍', ...(geography() || { rating: null }) },
      { key: 'chronicle', label: 'History', icon: '🏛️', ...(history() || { rating: null }) },
      { key: 'spelling', label: 'Spelling', icon: '🔤', ...(spelling() || { rating: null }) },
      { key: 'memory', label: 'Memory', icon: '🧠', ...(memory() || { rating: null }) },
      { key: 'reader', label: 'Reading', icon: '📖', ...(reading() || { rating: null }) },
      { key: 'briefing', label: 'Briefing', icon: '📰', ...(briefing() || { rating: null }) },
    ];
    const rated = domains.filter((d) => d.rating !== null);
    return {
      domains,
      overall: rated.length ? Math.round(mean(rated.map((d) => d.rating))) : null,
      ratedCount: rated.length,
    };
  }

  return { board };
})();
