/* Chronicle — the study syllabus.
 *
 * Everything here feeds the Study loop (read a passage → get quizzed on that
 * passage → next passage). Passages are built the way Briefing builds a story,
 * because that shape is far easier to take in on a phone than prose:
 *
 *     headline · one-line lead · a short list of key/value bullets
 *
 * Bullets are always { k, v } — k is the hook you scan for (a year, or the
 * question the bullet answers) and v is the sentence. Era passages don't spell
 * their bullets out at all: they name events, and game.js builds the bullets
 * straight from the event bank, so the passage and the quiz can never drift
 * apart.
 *
 * 1. AGES — the overview course. Not events: the *ages themselves*. What the
 *    Ancient World is, why the Middle Ages start in 500 and stop in 1450, what
 *    on earth the Age of Discovery was. This is the map you need before any
 *    individual date means anything, so it's offered first. Its questions are
 *    hand-written, because they test the shape of the story rather than a fact
 *    inside it.
 *
 * 2. ERA_SECTIONS — each era in three passages: a headline, a lead, and the
 *    events that passage covers. A study question can only ask about events
 *    listed here, which keeps the promise that you're never quizzed on
 *    something you weren't just shown.
 */

const AGES = {
  id: 'ages',
  name: 'The shape of history',
  blurb: 'The eight ages, what each one is, and why they start and stop where they do. Start here.',
  sections: [
    {
      title: 'The shape of history · part 1 of 9',
      headline: 'Eight ages',
      lead: 'The ages aren\'t natural facts — they\'re bookmarks, and they sit where the rules of life changed.',
      bullets: [
        { k: 'The cuts', v: 'Villages into cities, cities into empires, empires into kingdoms, kingdoms into oceans, muscle into steam, steam into industry, industry into total war, war into networks.' },
        { k: 'The eight', v: 'Ancient World to 500 BC · Classical to AD 500 · Middle Ages to 1450 · Discovery to 1700 · Revolutions to 1850 · Industry to 1914 · the Wars to 1991 · Information since.' },
        { k: 'The shape', v: 'The first two ages cover three thousand years. The last four cover three hundred. The clock speeds up.' },
      ],
      questions: [
        { q: 'What actually marks the boundary between two ages?',
          options: ['A change in the rules of life', 'The death of a famous ruler', 'A round-numbered year', 'The end of a major war'],
          answer: 0,
          why: 'The dates are conveniences. The real boundary is where how people live, work and are governed changes.' },
        { q: 'What happens to the length of the ages as you move toward the present?',
          options: ['They get much shorter', 'They stay about the same', 'They get longer', 'They alternate'],
          answer: 0,
          why: 'The Ancient World alone runs 2,700 years; the Information Age is barely 30. Change compounds.' },
      ],
    },
    {
      title: 'Ancient World · 3200 – 500 BC',
      headline: 'The age of first drafts',
      lead: 'Everything a state needs gets invented from scratch, with nothing to copy.',
      bullets: [
        { k: 'What gets built', v: 'Cities on flood plains, kings, writing, written law, standing armies, coins — every basic component of a state, invented for the first time.' },
        { k: 'Where', v: 'The Nile and Mesopotamia first: Egypt unifies under one pharaoh around 3100 BC, and Mesopotamia works out that the rules should be posted where everyone can see them.' },
        { k: 'How it ends', v: 'Not with a conquest — with an idea. Inside one century: the Buddha, Confucius, Jewish thought reforged in exile, and democracy in Athens.' },
        { k: 'Why that matters', v: 'Humans stop only asking how to survive and start arguing about how one ought to live.' },
      ],
      questions: [
        { q: 'What is the Ancient World the age of?',
          options: ['Inventing the state from scratch', 'Global trade and exploration', 'Religious war in Europe', 'The first machines'],
          answer: 0,
          why: 'Cities, writing, law, coinage, armies — every basic component of a state gets built for the first time.' },
        { q: 'What brings the Ancient World to a close around 500 BC?',
          options: ['A burst of new philosophies and religions', 'The fall of Rome', 'A plague', 'The invention of iron'],
          answer: 0,
          why: 'Buddha, Confucius, the Hebrew prophets and Athenian democracy all land within about a century of each other.' },
      ],
    },
    {
      title: 'Classical Age · 500 BC – AD 500',
      headline: 'The first superpowers',
      lead: 'Two empires at opposite ends of Eurasia work out how to run a continent.',
      bullets: [
        { k: 'Greece', v: 'Invents the argument — philosophy, drama, history, democracy — and Alexander exports it at spear-point as far as India.' },
        { k: 'Rome', v: 'Does the harder thing: holds a Mediterranean-wide state together for centuries using roads, law and extendable citizenship rather than terror alone.' },
        { k: 'China', v: 'Runs the same play on the same scale at the other end of the landmass, under the Qin and then the Han.' },
        { k: 'How it ends', v: 'In 476 the western Roman Empire simply stops — and nothing replaces it for a thousand years.' },
      ],
      questions: [
        { q: 'What separates Rome from the empires before it?',
          options: ['It held a huge state together with law and citizenship', 'It was the first to use cavalry', 'It never lost a battle', 'It was a democracy throughout'],
          answer: 0,
          why: 'Roads, a legal system and extendable citizenship are what let one state run the whole Mediterranean for centuries.' },
        { q: 'The Classical Age ends in 476 with —',
          options: ['The western Roman Empire ceasing to exist', 'The death of Alexander', 'The founding of Constantinople', 'The Black Death'],
          answer: 0,
          why: 'And crucially, nothing takes its place. That vacuum is the story of the next thousand years.' },
      ],
    },
    {
      title: 'Middle Ages · 500 – 1450',
      headline: 'Not blank — reshuffled',
      lead: 'Rome\'s world splits three ways, and power drops to the local level.',
      bullets: [
        { k: 'The three heirs', v: 'Byzantium keeps the empire running in the east; Islam spreads across Arabia, North Africa and Spain; western Europe fragments.' },
        { k: 'In one word', v: 'Decentralised. Power sits with whoever holds the nearest castle — local, land-based and personal.' },
        { k: 'The connectors', v: 'Religion, trade routes, and briefly and violently the Mongols, who reconnect Eurasia end to end.' },
        { k: 'How it ends', v: 'Two machines: the printing press, which makes ideas cheap to copy, and the ocean-going ship, which makes distance survivable.' },
      ],
      questions: [
        { q: 'The best one-word description of medieval power is —',
          options: ['Decentralised', 'Industrial', 'Democratic', 'Global'],
          answer: 0,
          why: 'No Rome-scale state in the west. Power is local, land-based and personal.' },
        { q: 'Which two inventions end the Middle Ages?',
          options: ['The printing press and the ocean-going ship', 'Gunpowder and the compass', 'The steam engine and the telescope', 'Paper and the stirrup'],
          answer: 0,
          why: 'One makes ideas cheap to copy, the other makes the ocean crossable. The next age is built on both.' },
      ],
    },
    {
      title: 'Age of Discovery · 1450 – 1700',
      headline: 'The age the map closes',
      lead: 'The one most people can\'t name — and the hinge the modern world turns on.',
      bullets: [
        { k: 'What happens', v: 'European ships reach the Americas and sail to Asia. For the first time every inhabited continent is in permanent contact with the others.' },
        { k: 'The cost', v: 'Crops, silver, people and disease move in every direction. All of those continents are remade by it, most of them brutally.' },
        { k: 'The same press', v: 'That spread Luther\'s protest also spread Copernicus, Galileo and Newton — reformation and modern science ride the same technology.' },
        { k: 'By 1700', v: 'Truth answers to evidence rather than to authority, and Europe has both the ships and the science to press its advantage.' },
      ],
      questions: [
        { q: 'What makes 1450–1700 its own age?',
          options: ['Every inhabited continent comes into permanent contact', 'Europe industrialises', 'The Roman Empire is restored', 'Democracy spreads worldwide'],
          answer: 0,
          why: 'Before this, the Americas and Eurasia were separate worlds. After it, there is one connected system.' },
        { q: 'The printing press spread which two movements at once?',
          options: ['The Reformation and modern science', 'Democracy and socialism', 'Islam and Christianity', 'Nationalism and industry'],
          answer: 0,
          why: 'Luther and Copernicus rode the same technology. Cheap copying is what makes an argument unstoppable.' },
      ],
    },
    {
      title: 'Age of Revolutions · 1700 – 1850',
      headline: 'Steam and citizens',
      lead: 'Two revolutions running at once, each accelerating the other.',
      bullets: [
        { k: 'The mechanical one', v: 'Steam breaks the ancient ceiling on how much work a human or an animal can do.' },
        { k: 'The political one', v: 'America, France and Haiti each argue — and then fight — that authority comes from the governed rather than from birth.' },
        { k: 'The result', v: 'In about 150 years monarchy stops being the obvious way to run a country, and muscle stops being the main source of power.' },
        { k: 'The vocabulary', v: 'Citizen, constitution, rights, left and right — almost every political word you use daily is issued in this window.' },
      ],
      questions: [
        { q: 'Which two revolutions define 1700–1850?',
          options: ['Mechanical and political', 'Agricultural and religious', 'Scientific and artistic', 'Digital and financial'],
          answer: 0,
          why: 'Steam power and popular sovereignty arrive together, and each accelerates the other.' },
        { q: 'The political revolutions argued that authority comes from —',
          options: ['The governed', 'God alone', 'Inherited birth', 'The wealthiest landowners'],
          answer: 0,
          why: 'That single claim is what makes America, France and Haiti one story rather than three.' },
      ],
    },
    {
      title: 'Industry & Empire · 1850 – 1914',
      headline: 'The age of compounding',
      lead: 'Everything speeds up at once, and the planet becomes a single machine.',
      bullets: [
        { k: 'One lifetime', v: 'Telegraph, telephone, light bulb, motor car, aeroplane — and Einstein rewriting space and time.' },
        { k: 'Nations', v: 'Consolidate to industrial scale, and Europe divides most of the rest of the planet between them.' },
        { k: 'Those borders', v: 'Are drawn in European conference rooms with rulers, and most of them are still on the map.' },
        { k: 'The catch', v: 'The system is wired, scheduled, armed, allied and confident — so one assassination in 1914 is enough to bring it all down.' },
      ],
      questions: [
        { q: 'What is new about the world by 1914?',
          options: ['It is one connected, industrial system', 'Most people live in cities', 'Empires have been dismantled', 'Europe is at peace with itself'],
          answer: 0,
          why: 'Telegraph wires, steamship schedules and imperial borders knit the planet into a single machine.' },
        { q: 'Why could one assassination start a world war?',
          options: ['Every power was armed and locked into alliances', 'The victim ruled most of Europe', 'It destroyed the world economy', 'It broke a religious truce'],
          answer: 0,
          why: 'An interlocking alliance system means a local quarrel pulls in everyone automatically.' },
      ],
    },
    {
      title: 'World Wars & Cold War · 1914 – 1991',
      headline: 'The age the West nearly ended itself',
      lead: 'Two wars in thirty years, then a standoff neither side can win.',
      bullets: [
        { k: 'The wars', v: 'Kill on an industrial scale, break Europe\'s empires, and finish with a weapon capable of completing the job.' },
        { k: 'After 1945', v: 'Two systems, one planet. Direct war is unwinnable, so the contest moves sideways.' },
        { k: 'Sideways means', v: 'Space, laboratories, proxy wars — and thirteen days over Cuba when it very nearly went the other way.' },
        { k: 'How it ends', v: 'Not with the expected bang. A wall comes down on live television in 1989, and in 1991 the Soviet Union votes itself out of existence.' },
      ],
      questions: [
        { q: 'What shaped the second half of this age?',
          options: ['A standoff neither side could win outright', 'A single global government', 'The collapse of industry', 'A return to empire'],
          answer: 0,
          why: 'Nuclear weapons made direct war unwinnable, so the contest moved to space, science and proxies.' },
        { q: 'How does the Cold War actually end?',
          options: ['The Soviet Union dissolves itself', 'A negotiated peace treaty', 'A short war in Europe', 'The United Nations intervenes'],
          answer: 0,
          why: 'No surrender and no battle — the wall falls in 1989 and the USSR signs itself out in 1991.' },
      ],
    },
    {
      title: 'Information Age · 1991 – now',
      headline: 'The one you\'re living in',
      lead: 'It has no ending yet, and one structural change underneath everything.',
      bullets: [
        { k: 'The change', v: 'Copying information becomes effectively free — first the web, then search, then a computer in every pocket, then machines that write.' },
        { k: 'Everything else', v: 'The financial crash, the pandemic, populism, the return of war to Europe — all of it plays out on top of that network.' },
        { k: 'Open question', v: 'Whether this is the whole age or just its opening chapter is genuinely not known yet.' },
      ],
      questions: [
        { q: 'The structural change of the Information Age is —',
          options: ['Copying information becomes nearly free', 'The world population stops growing', 'Empires return', 'Energy becomes unlimited'],
          answer: 0,
          why: 'Every other development of the period runs on top of that one fact.' },
        { q: 'Put these in order: Discovery, Revolutions, Information, Classical.',
          options: ['Classical → Discovery → Revolutions → Information',
            'Classical → Revolutions → Discovery → Information',
            'Discovery → Classical → Revolutions → Information',
            'Discovery → Revolutions → Classical → Information'],
          answer: 0,
          why: 'Classical ends in 476, Discovery runs 1450–1700, Revolutions 1700–1850, Information from 1991.' },
      ],
    },
  ],
};

/* Each era in three passages. `ids` names the events the passage covers —
 * game.js turns them into the bullet list AND draws the questions from the
 * same list, so the passage and the quiz can never drift apart. A few events
 * in the bank (Vesuvius) sit in no passage and stay quiz-only. */
const ERA_SECTIONS = {
  ancient: [
    { headline: 'Everything invented once',
      lead: 'The first states appear where rivers flood on schedule — and every part of a state has to be built from nothing.',
      ids: ['egypt-unified', 'great-pyramid', 'hammurabi'] },
    { headline: 'The first crash, and the reboot',
      lead: 'An interconnected bronze-trading world collapses all at once. What grows back is leaner and better organised.',
      ids: ['bronze-collapse', 'olympics', 'rome-founded', 'first-coins'] },
    { headline: 'The century that asks why',
      lead: 'Inside about a hundred years, four traditions appear that are still running today.',
      ids: ['temple-destroyed', 'buddha', 'confucius', 'persia-peak', 'athens-democracy'] },
  ],
  classical: [
    { headline: 'Greece invents the argument',
      lead: 'A handful of quarrelsome city-states stop a superpower, produce a golden age, then ruin themselves.',
      ids: ['marathon', 'salamis', 'peloponnesian', 'socrates', 'alexander'] },
    { headline: 'Rome holds it together',
      lead: 'Two empires at opposite ends of Eurasia run the same play: one state, one law, at continental scale.',
      ids: ['qin-unifies', 'hannibal', 'caesar', 'augustus', 'paper', 'rome-peak'] },
    { headline: 'The empire converts, then stops',
      lead: 'A provincial execution becomes the state religion — and then the western half simply ends.',
      ids: ['crucifixion', 'milan-edict', 'rome-sacked', 'rome-falls'] },
  ],
  medieval: [
    { headline: 'Rome\'s world splits three ways',
      lead: 'Byzantium in the east, Islam across Arabia and North Africa, and a fragmented Christian west.',
      ids: ['hijra', 'iberia', 'tours', 'charlemagne'] },
    { headline: 'The edges move in',
      lead: 'Vikings, Normans, Crusaders and Mongols spend four centuries redrawing who holds what.',
      ids: ['lindisfarne', 'hastings', 'crusade', 'genghis', 'marco-polo', 'tenochtitlan'] },
    { headline: 'Kings fenced in, ideas set loose',
      lead: 'Law starts binding the crown, plague cracks the feudal deal, and a machine starts copying ideas.',
      ids: ['magna-carta', 'black-death', 'joan', 'printing'] },
  ],
  discovery: [
    { headline: 'The map closes',
      lead: 'A toll gate on the road east sends Europe around the world instead — and two halves of the planet meet.',
      ids: ['constantinople', 'columbus', 'gama', 'cortes'] },
    { headline: 'One press, two revolutions',
      lead: 'The technology that splits Christianity also makes truth answer to evidence.',
      ids: ['luther', 'copernicus', 'galileo', 'thirty-years', 'principia'] },
    { headline: 'The tools of the next world',
      lead: 'Sea power, joint-stock companies, colonies and a parliament above the crown — all inside a century.',
      ids: ['armada', 'eic', 'jamestown', 'qing', 'glorious'] },
  ],
  revolution: [
    { headline: 'Steam and citizens',
      lead: 'One revolution breaks the ceiling on work; the other breaks the rule on who may rule.',
      ids: ['watt', 'independence', 'bastille', 'haiti', 'railway'] },
    { headline: 'The experiment eats itself',
      lead: 'France\'s revolution produces an emperor — but the new vocabulary survives his defeat.',
      ids: ['napoleon', 'waterloo', 'abolition'] },
    { headline: 'New leverage, new arguments',
      lead: 'Science starts saving lives at scale while empire finds new ways to apply force.',
      ids: ['vaccine', 'opium', 'famine', 'revolutions-1848'] },
  ],
  industrial: [
    { headline: 'One lifetime, every machine',
      lead: 'Communication, light, the car and flight all arrive inside a single human life.',
      ids: ['darwin', 'telephone', 'lightbulb', 'automobile', 'flight', 'relativity'] },
    { headline: 'Nations at industrial scale',
      lead: 'Three countries consolidate into modern powers within a decade of each other.',
      ids: ['civil-war', 'meiji', 'germany'] },
    { headline: 'One system, drawn with rulers',
      lead: 'The planet becomes a single network — and its borders are drawn in European conference rooms.',
      ids: ['suez', 'berlin-conf', 'qing-falls'] },
  ],
  worldwars: [
    { headline: 'Thirty years of catastrophe',
      lead: 'Two wars, one economic collapse, and the end of four empires.',
      ids: ['ww1', 'russian-rev', 'ww1-ends', 'crash-29', 'hitler', 'ww2', 'pearl-harbor', 'dday', 'ww2-ends'] },
    { headline: 'Two systems, one planet',
      lead: 'Empires dissolve, and the contest moves to space, the laboratory and proxy wars.',
      ids: ['india', 'israel', 'prc', 'dna', 'sputnik', 'cuba', 'moon'] },
    { headline: 'The ending nobody scripted',
      lead: 'No final battle: one side quietly rejoins the market world, and the other stops existing.',
      ids: ['deng', 'wall-falls'] },
  ],
  information: [
    { headline: 'The network switches on',
      lead: 'The Cold War ends and the web opens to the public in the same year.',
      ids: ['ussr-ends', 'www', 'eu', 'mandela', 'hong-kong', 'google'] },
    { headline: 'The shocks',
      lead: 'Openness gets turned against itself, and then the financial plumbing nearly fails.',
      ids: ['nine-eleven', 'gfc'] },
    { headline: 'The tools keep compounding',
      lead: 'Genome, smartphone, feeds — and finally machines that write.',
      ids: ['genome', 'iphone', 'arab-spring', 'alexnet', 'covid', 'chatgpt'] },
  ],
};
