/* rules.js — the Learn screen.
 *
 * Deliberately not a word list. A list of two hundred words teaches two
 * hundred things; the six patterns below decide thousands of words each, and
 * they transfer to words that were never in the game. Numbers has the same
 * shape in methods.js — the drill is the game, this is the part that makes the
 * drill unnecessary.
 */

const RULE_TOPICS = [
  { id: 'ieei', label: 'ie / ei', icon: '🔀' },
  { id: 'doubling', label: 'Doubling', icon: '🔁' },
  { id: 'endings', label: '-ible / -able', icon: '✒️' },
  { id: 'ceance', label: '-ence / -ance', icon: '🖋' },
  { id: 'silent', label: 'Silent letters', icon: '🤫' },
  { id: 'plurals', label: 'y, e and plurals', icon: '➕' },
];

const RULES = {
  ieei: `
    <h3>I before E — but say the rule properly</h3>
    <p>The playground version ("i before e except after c") is right about two
      thirds of the time, which is worse than useless. The version that works:</p>
    <p class="rule-line"><b>I before E when the sound is "ee".</b></p>
    <p>bel<em>ie</em>ve, ach<em>ie</em>ve, f<em>ie</em>ld, n<em>ie</em>ce, s<em>ie</em>ge —
      all "ee", all <em>ie</em>. And after a C, the "ee" sound flips:
      rec<em>ei</em>ve, dec<em>ei</em>ve, perc<em>ei</em>ve, c<em>ei</em>ling.</p>
    <p>When the sound is <em>not</em> "ee", it is almost always <em>ei</em>:
      w<em>ei</em>ght, n<em>ei</em>ghbour, th<em>ei</em>r, for<em>ei</em>gn, h<em>ei</em>r.</p>
    <p class="rule-note">The genuine outlaws are few enough to memorise as a
      sentence: <b>weird seizures of caffeine and protein leisure</b> —
      weird, seize, caffeine, protein, leisure. Learn those five and the rule
      covers the rest.</p>`,

  doubling: `
    <h3>When a consonant doubles</h3>
    <p>Adding <em>-ed</em>, <em>-ing</em>, <em>-er</em>: double the final
      consonant only when the stress lands on the final syllable and that
      syllable is one short vowel + one consonant.</p>
    <p class="rule-line">be<b>GIN</b> → begi<em>nn</em>ing · re<b>FER</b> → refe<em>rr</em>ed ·
      con<b>TROL</b> → contro<em>ll</em>ing</p>
    <p>Stress earlier in the word, and nothing doubles:
      <b>BEN</b>efit → benefi<em>t</em>ed, <b>OF</b>fer → offe<em>r</em>ed,
      <b>VIS</b>it → visi<em>t</em>ed.</p>
    <p class="rule-note">The words people actually lose money on are the ones
      where one letter doubles and its neighbour does not:
      a<em>cc</em>o<em>mm</em>odate (both), nece<em>ss</em>ary (one c, two s),
      reco<em>mm</em>end (one c, two m), emba<em>rr</em>a<em>ss</em> (both),
      hara<em>ss</em> (one r). There is no rule for those — they are facts, and
      that is what Review mode is for.</p>`,

  endings: `
    <h3>-ible or -able</h3>
    <p>Take the ending off. If what remains is a whole English word,
      it is nearly always <em>-able</em>:</p>
    <p class="rule-line">comfort → comfort<em>able</em> · depend → depend<em>able</em> ·
      predict → predict<em>able</em></p>
    <p>If what remains is a fragment that cannot stand alone, it is nearly
      always <em>-ible</em>:</p>
    <p class="rule-line">poss- → poss<em>ible</em> · terr- → terr<em>ible</em> ·
      vis- → vis<em>ible</em> · aud- → aud<em>ible</em></p>
    <p>A soft <em>c</em> or <em>g</em> takes <em>-ible</em> too, because
      <em>-able</em> would harden it: for<em>cible</em>, legible, eligible.
      Keep a silent <em>e</em> for the same reason: notic<em>e</em>able,
      manag<em>e</em>able, chang<em>e</em>able.</p>
    <p class="rule-note">The rule is about 80% reliable, which is high enough to
      guess with. The famous exceptions run the other way — <em>accessible</em>,
      <em>irresistible</em>, <em>flexible</em> — so when a full word takes
      <em>-ible</em>, that is the one to remember.</p>`,

  ceance: `
    <h3>-ence or -ance, -ent or -ant</h3>
    <p>Listen to the consonant in front of it. After a <b>soft c</b> ("s"
      sound) or a <b>soft g</b> ("j" sound), the vowel is <em>e</em>:</p>
    <p class="rule-line">innoc<em>ence</em> · magnific<em>ent</em> ·
      intellig<em>ence</em> · urg<em>ent</em></p>
    <p>After a <b>hard c</b> ("k") or a <b>hard g</b>, it is <em>a</em>:</p>
    <p class="rule-line">signific<em>ant</em> · vac<em>ant</em> ·
      arrog<em>ant</em> · eleg<em>ant</em></p>
    <p>Everywhere else, look for the related word — it usually gives the vowel
      away: <em>substantial</em> → substance, <em>presidential</em> → president,
      <em>confidential</em> → confidence.</p>
    <p class="rule-note">And the pair that costs everyone: independ<b>ent</b>
      (not -ant), but attend<b>ance</b> (not -ence).</p>`,

  silent: `
    <h3>Silent letters have a reason</h3>
    <p>They are not decoration — they are fossils. Nearly every silent letter
      was pronounced once, and the related word still says it out loud. Find
      the relative and the letter stops being arbitrary:</p>
    <p class="rule-line">
      bom<b>b</b> → bom<b>b</b>ard · sig<b>n</b> → si<b>gn</b>ature ·
      mus<b>c</b>le → mus<b>c</b>ular · con<b>demn</b> → con<b>demn</b>ation ·
      de<b>b</b>t → de<b>b</b>it · colum<b>n</b> → colum<b>n</b>ist</p>
    <p>The clusters worth knowing by shape: <b>kn-</b> (knee, knead, knuckle),
      <b>gn-</b> (gnaw, gnome), <b>wr-</b> (wrestle, wreck, wrought),
      <b>ps-</b> (psalm, psychology), <b>-mb</b> (thumb, lamb, plumber),
      <b>rh-</b> (rhythm, rhetoric), and <b>-lm</b> (calm, psalm, salmon).</p>
    <p class="rule-note">French borrowings hide whole syllables rather than
      single letters: rendezvous, silhouette, liaison. Those you learn once and
      keep.</p>`,

  plurals: `
    <h3>y, silent e, and what happens when you add to a word</h3>
    <p><b>Final y after a consonant becomes i</b>: happy → happ<em>i</em>ness,
      carry → carr<em>i</em>ed, city → cit<em>i</em>es. After a vowel it stays:
      play → pla<em>y</em>ed, journey → journe<em>y</em>s.</p>
    <p><b>Drop the silent e before a vowel ending, keep it before a consonant
      ending</b>: hope → hop<em>ing</em> but hope<em>ful</em>;
      argue → argu<em>ment</em> (a famous exception that drops it anyway);
      true → tru<em>ly</em>.</p>
    <p><b>Words ending in -ce or -ge keep the e</b> before <em>-able</em> and
      <em>-ous</em>, because it is the only thing keeping the sound soft:
      notic<em>e</em>able, courag<em>e</em>ous, outrag<em>e</em>ous.</p>
    <p class="rule-note">Half of all doubled-letter errors are really this rule
      in disguise: the letter did not double, a silent e was dropped and
      something had to hold the vowel short.</p>`,
};
