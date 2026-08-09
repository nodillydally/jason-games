/* Chronicle — the study syllabus.
 *
 * Two things live here, both feeding the Study loop (read a passage → get
 * quizzed on that passage → next passage). The old Learn screen put all the
 * reading up front and the quiz at the end, which is how you get a page that
 * feels like homework and teaches almost nothing: by question four you're
 * recalling paragraph one from ten minutes ago.
 *
 * 1. AGES — the overview course. Not events: the *ages themselves*. What the
 *    Ancient World is, why the Middle Ages start in 500 and end in 1450, what
 *    on earth the Age of Discovery was. This is the map you need before any
 *    individual date means anything, so it's the first thing offered.
 *    Its questions are written by hand, because they test the shape of the
 *    story rather than any single fact in it.
 *
 * 2. ERA_SECTION_IDS — which events each paragraph of an era's story mentions.
 *    The prose isn't duplicated here; game.js splits `era.story` on blank lines
 *    and zips it against these lists. That keeps the promise the old Learn
 *    screen made: a study question can only ask about something the passage
 *    you just read actually taught.
 */

const AGES = {
  id: 'ages',
  name: 'The shape of history',
  blurb: 'The eight ages, what each one is, and why they start and stop where they do. Start here.',
  sections: [
    {
      title: 'Eight ages',
      text: `History gets cut into eight rough ages. They aren't natural facts — they're bookmarks, and they sit where the rules of life changed: villages into cities, cities into empires, empires into kingdoms, kingdoms into oceans, muscle into steam, steam into industry, industry into total war, and war into networks.\n\nRoughly: the Ancient World up to 500 BC, the Classical Age to AD 500, the Middle Ages to 1450, Discovery to 1700, Revolutions to 1850, Industry to 1914, the Wars to 1991, and the Information Age since. Notice the shape — the first two ages cover three thousand years, and the last four cover three hundred. The clock speeds up.`,
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
      text: `The age of first drafts. Everything a state needs gets invented from scratch, with nothing to copy: cities on flood plains, kings, writing, written law, standing armies, coins. Egypt unifies under one pharaoh around 3100 BC. Mesopotamia works out that the rules should be written down where everyone can see them.\n\nIt doesn't end with a conquest. It ends with an idea — inside a single century you get the Buddha in India, Confucius in China, Jewish thought reforged in exile, and democracy in Athens. Humans stop only asking how to survive and start arguing about how one ought to live.`,
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
      text: `The age of the first superpowers. Greece invents the argument — philosophy, drama, history, democracy — and Alexander exports it at spear-point as far as India. Rome then does the harder thing: it holds a Mediterranean-wide state together for centuries using roads, law and citizenship rather than terror alone. At the far end of Eurasia, Han China runs the same play on the same scale.\n\nIt ends in 476, when the western Roman Empire simply stops. Nothing replaces it for a thousand years, which is exactly why the next age looks the way it does.`,
      questions: [
        { q: 'What separates Rome from the empires before it?',
          options: ['It held a huge state together with law and citizenship', 'It was the first to use cavalry', 'It never lost a battle', 'It was a democracy throughout'],
          answer: 0,
          why: 'Roads, a legal system and extendable citizenship are what let one state run the whole Mediterranean for centuries.' },
        { q: 'The Classical Age ends in 476 with —',
          options: ['The western Roman Empire ceasing to exist', 'The death of Alexander', 'The founding of Constantinople', 'The Black Death'],
          answer: 0,
          why: 'And crucially, nothing takes its place. The vacuum is the story of the next thousand years.' },
      ],
    },
    {
      title: 'Middle Ages · 500 – 1450',
      text: `Not a blank thousand years — a reshuffle. Rome's world splits three ways: Byzantium keeps the empire running in the east, Islam spreads across Arabia, North Africa and Spain, and western Europe fragments into small, local, land-based power. If you want a one-word summary, it's *decentralised*: power sits with whoever holds the nearest castle.\n\nThe connectors are religion and, briefly and violently, the Mongols. It ends around 1450 with two machines that make the next age possible — the printing press, which makes ideas cheap to copy, and the ocean-going ship, which makes distance survivable.`,
      questions: [
        { q: 'The best one-word description of medieval power is —',
          options: ['Decentralised', 'Industrial', 'Democratic', 'Global'],
          answer: 0,
          why: 'No Rome-scale state in the west. Power is local, land-based and personal.',
        },
        { q: 'Which two inventions end the Middle Ages?',
          options: ['The printing press and the ocean-going ship', 'Gunpowder and the compass', 'The steam engine and the telescope', 'Paper and the stirrup'],
          answer: 0,
          why: 'One makes ideas cheap to copy, the other makes the ocean crossable. The next age is built on both.' },
      ],
    },
    {
      title: 'Age of Discovery · 1450 – 1700',
      text: `The age the map closes — and the one most people can't name, even though the modern world turns on it. European ships reach the Americas and sail to Asia, and for the first time every inhabited continent is in permanent contact with the others. Crops, silver, people and disease move in every direction, and all of those continents are remade by it, most of them brutally.\n\nThe same press that spread Luther's protest across Europe also spread Copernicus, Galileo and Newton. By 1700 truth answers to evidence rather than to authority, and Europe has both the ships and the science to press its advantage.`,
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
      text: `Two revolutions running at once, each feeding the other. The mechanical one: steam breaks the ancient ceiling on how much work a human or an animal can do. The political one: America, France and Haiti each argue, and then fight, for the position that authority comes from the governed rather than from birth.\n\nIn about 150 years monarchy stops being the obvious way to run a country and muscle stops being the main source of power. Almost every political word you use daily — citizen, constitution, rights, left and right — is issued in this window.`,
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
      text: `The age of compounding. Inside one lifetime: the telegraph, the telephone, the light bulb, the motor car, the aeroplane — and Einstein rewriting space and time. Nations consolidate to industrial scale, and Europe divides most of the rest of the planet between them, drawing borders that are still on the map.\n\nThe result is the first genuinely global system: wired, scheduled, and running to timetable. It is also armed, allied and extremely confident, which is why a single assassination in 1914 is enough to bring the whole structure down.`,
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
      text: `The age the West nearly ended itself. Two wars in thirty years kill on an industrial scale, break Europe's empires, and finish with a weapon capable of completing the job. Everything after 1945 is shaped by that: two systems, one planet, and a standoff neither side can win outright.\n\nSo the fight moves sideways — into space, into laboratories, into proxy wars, and into thirteen days over Cuba when it very nearly went the other way. And then the expected bang never comes. In 1989 a wall comes down on live television, and in 1991 the Soviet Union votes itself out of existence.`,
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
      text: `The age you're living in, which is why it has no ending yet. Its one structural change is that copying information becomes effectively free: first the web, then search, then a computer in every pocket, then machines that can write.\n\nEverything else in the period — the financial crash, the pandemic, populism, the return of war to Europe — plays out on top of a network that carries anything, anywhere, instantly. Whether that turns out to be the whole age or just its opening chapter is genuinely not known yet.`,
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

/* Which events each paragraph of an era's story mentions, in paragraph order.
 * game.js splits the story on blank lines and zips it against these, so a
 * study question can only ask about what the passage just taught. A few events
 * in the bank aren't named in any paragraph (Vesuvius, the transatlantic
 * telegraph) — those stay out of Study and appear only in the quiz modes. */
const ERA_SECTION_IDS = {
  ancient: [
    ['egypt-unified', 'great-pyramid', 'hammurabi'],
    ['bronze-collapse', 'olympics', 'rome-founded', 'first-coins'],
    ['buddha', 'confucius', 'temple-destroyed', 'athens-democracy', 'persia-peak'],
  ],
  classical: [
    ['marathon', 'salamis', 'peloponnesian', 'socrates', 'alexander'],
    ['hannibal', 'qin-unifies', 'caesar', 'augustus', 'rome-peak', 'paper'],
    ['crucifixion', 'milan-edict', 'rome-sacked', 'rome-falls'],
  ],
  medieval: [
    ['hijra', 'iberia', 'tours', 'charlemagne'],
    ['lindisfarne', 'hastings', 'crusade', 'genghis', 'marco-polo', 'tenochtitlan'],
    ['magna-carta', 'black-death', 'joan', 'printing'],
  ],
  discovery: [
    ['constantinople', 'columbus', 'gama', 'cortes'],
    ['luther', 'thirty-years', 'copernicus', 'galileo', 'principia'],
    ['armada', 'eic', 'jamestown', 'qing', 'glorious'],
  ],
  revolution: [
    ['watt', 'railway', 'independence', 'bastille', 'haiti'],
    ['napoleon', 'waterloo', 'abolition'],
    ['vaccine', 'opium', 'revolutions-1848', 'famine'],
  ],
  industrial: [
    ['telephone', 'lightbulb', 'automobile', 'flight', 'relativity', 'darwin'],
    ['civil-war', 'germany', 'meiji'],
    ['suez', 'berlin-conf', 'qing-falls'],
  ],
  worldwars: [
    ['ww1', 'russian-rev', 'ww1-ends', 'crash-29', 'hitler', 'ww2', 'pearl-harbor', 'dday', 'ww2-ends'],
    ['prc', 'india', 'israel', 'sputnik', 'moon', 'dna', 'cuba'],
    ['deng', 'wall-falls'],
  ],
  information: [
    ['ussr-ends', 'www', 'google', 'eu', 'mandela', 'hong-kong'],
    ['nine-eleven', 'gfc'],
    ['genome', 'iphone', 'arab-spring', 'alexnet', 'covid', 'chatgpt'],
  ],
};
