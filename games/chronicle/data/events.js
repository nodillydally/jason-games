/* Chronicle — the event bank.
 *
 * ~113 canonical events across eight eras, chosen for load-bearing "you should
 * be able to place this" history: the journal goal is being able to say what
 * was happening in 50 BC, 0–1000, the 1500s, 1700s, the 1900s, and the 2000s.
 *
 * y: year (negative = BC). Dates are the standard textbook ones; where history
 * gives a range, the conventional single year is used (e.g. 476 for the fall
 * of the Western Roman Empire). `why` is the one-line reason the event is
 * worth carrying around — shown after answering, never before.
 */

const ERAS = [
  { id: 'ancient',    name: 'Ancient World',        from: -3200, to: -500 },
  { id: 'classical',  name: 'Classical Age',        from: -500,  to: 500 },
  { id: 'medieval',   name: 'Middle Ages',          from: 500,   to: 1450 },
  { id: 'discovery',  name: 'Age of Discovery',     from: 1450,  to: 1700 },
  { id: 'revolution', name: 'Age of Revolutions',   from: 1700,  to: 1850 },
  { id: 'industrial', name: 'Industry & Empire',    from: 1850,  to: 1914 },
  { id: 'worldwars',  name: 'World Wars & Cold War', from: 1914, to: 1991 },
  { id: 'information', name: 'Information Age',     from: 1991,  to: 2100 },
];

const EVENTS = [
  // ----- Ancient World (to 500 BC) -----
  { id: 'egypt-unified', y: -3100, name: 'Egypt unified under the first pharaohs', why: 'The first large centralized state — the template every empire after it copies.' },
  { id: 'great-pyramid', y: -2560, name: 'Great Pyramid of Giza completed', why: 'Stayed the tallest human structure on Earth for nearly 4,000 years.' },
  { id: 'hammurabi', y: -1754, name: 'Code of Hammurabi written in Babylon', why: 'The famous early written law code — rules posted in public instead of living in a king\'s head.' },
  { id: 'bronze-collapse', y: -1177, name: 'Bronze Age collapse', why: 'Interconnected Mediterranean civilizations fell together — the first systemic crash of a "globalized" world.' },
  { id: 'olympics', y: -776, name: 'First recorded Olympic Games', why: 'The traditional anchor date of Greek history — Greeks counted years by Olympiads.' },
  { id: 'rome-founded', y: -753, name: 'Legendary founding of Rome', why: 'The traditional start date of the state that would define Western politics and law.' },
  { id: 'first-coins', y: -650, name: 'First coins minted in Lydia', why: 'Money as standardized state-issued tokens — trade stops being pure barter and weighing.' },
  { id: 'temple-destroyed', y: -586, name: 'Babylon destroys Jerusalem\'s First Temple', why: 'The exile that followed reshaped Judaism — and through it, later Christianity and Islam.' },
  { id: 'buddha', y: -563, name: 'Birth of the Buddha (traditional date)', why: 'One of the axial-age founders whose ideas still organize how billions live.' },
  { id: 'confucius', y: -551, name: 'Birth of Confucius', why: 'His ethics of duty and hierarchy became China\'s operating system for two millennia.' },
  { id: 'persia-peak', y: -522, name: 'Darius I rules the Persian Empire at its peak', why: 'The largest empire the world had seen — roads, satraps, and postal relays.' },
  { id: 'athens-democracy', y: -508, name: 'Athens establishes democracy', why: 'Cleisthenes gives ordinary citizens a vote — the West\'s prototype for self-rule.' },

  // ----- Classical Age (500 BC – AD 500) -----
  { id: 'marathon', y: -490, name: 'Battle of Marathon', why: 'Athens turns back Persia — Greek independence survives, and with it the classical experiment.' },
  { id: 'salamis', y: -480, name: 'Thermopylae and Salamis', why: 'The second Persian invasion breaks; Greece\'s golden age follows.' },
  { id: 'peloponnesian', y: -431, name: 'Peloponnesian War begins', why: 'Athens vs. Sparta — the classic study of how rival great powers stumble into ruinous war.' },
  { id: 'socrates', y: -399, name: 'Trial and death of Socrates', why: 'The founding martyr of Western philosophy — questioning authority priced at hemlock.' },
  { id: 'alexander', y: -334, name: 'Alexander the Great invades Persia', why: 'In a decade he spreads Greek culture from Egypt to India — the Hellenistic world.' },
  { id: 'qin-unifies', y: -221, name: 'Qin Shi Huang unifies China', why: 'The first emperor — standardized script, weights, and the beginnings of the Great Wall.' },
  { id: 'hannibal', y: -218, name: 'Hannibal crosses the Alps', why: 'Rome\'s nearest brush with destruction — and the war that made it a Mediterranean superpower.' },
  { id: 'caesar', y: -44, name: 'Julius Caesar assassinated', why: 'The republic\'s death blow — killing the dictator only cleared the way for emperors.' },
  { id: 'augustus', y: -27, name: 'Augustus becomes the first Roman emperor', why: 'Two centuries of Pax Romana begin — roads, law, and trade across the whole Mediterranean.' },
  { id: 'crucifixion', y: 30, name: 'Crucifixion of Jesus (c. AD 30)', why: 'A provincial execution that became the founding event of the world\'s largest religion.' },
  { id: 'vesuvius', y: 79, name: 'Vesuvius buries Pompeii', why: 'A Roman city frozen mid-life — most of what we know about daily Rome comes from its ash.' },
  { id: 'paper', y: 105, name: 'Paper perfected in Han China', why: 'Cai Lun\'s recipe made writing cheap — a thousand years before Europe caught on.' },
  { id: 'rome-peak', y: 117, name: 'Rome reaches its greatest extent under Trajan', why: 'Britain to the Persian Gulf — the high-water mark of the ancient West.' },
  { id: 'milan-edict', y: 313, name: 'Constantine legalizes Christianity', why: 'From persecuted sect to imperial religion within a century — Europe\'s trajectory set.' },
  { id: 'rome-sacked', y: 410, name: 'Visigoths sack Rome', why: 'The eternal city falls to a foreign army for the first time in 800 years — the shock heard across the empire.' },
  { id: 'rome-falls', y: 476, name: 'Fall of the Western Roman Empire', why: 'The conventional end of antiquity — Western Europe fragments for a thousand years.' },

  // ----- Middle Ages (500–1450) -----
  { id: 'hijra', y: 622, name: 'Muhammad\'s Hijra to Medina', why: 'Year one of the Islamic calendar — within a century, an empire from Spain to India.' },
  { id: 'iberia', y: 711, name: 'Muslim conquest of Iberia begins', why: 'Al-Andalus becomes medieval Europe\'s brightest center of learning for centuries.' },
  { id: 'tours', y: 732, name: 'Battle of Tours', why: 'Frankish victory that marks the limit of the Umayyad advance into Western Europe.' },
  { id: 'lindisfarne', y: 793, name: 'Viking raid on Lindisfarne', why: 'The Viking Age opens — three centuries of raiding, trading, and settling from Canada to Kyiv.' },
  { id: 'charlemagne', y: 800, name: 'Charlemagne crowned emperor', why: 'A "Roman" empire reborn in the West — the idea behind a unified Europe is born.' },
  { id: 'hastings', y: 1066, name: 'Norman conquest of England', why: 'Hastings rewires England\'s language, law, and aristocracy — English itself is the residue.' },
  { id: 'crusade', y: 1096, name: 'First Crusade sets out', why: 'Two centuries of holy war — and with them, trade routes and ideas flowing East–West again.' },
  { id: 'genghis', y: 1206, name: 'Genghis Khan unites the Mongols', why: 'The largest contiguous land empire ever follows — brutal, and yet it reconnected Eurasia.' },
  { id: 'magna-carta', y: 1215, name: 'Magna Carta sealed', why: 'The king agrees he is under the law — the seed of constitutional government.' },
  { id: 'marco-polo', y: 1271, name: 'Marco Polo departs for China', why: 'His account of the East lit the imagination that later funded Columbus.' },
  { id: 'tenochtitlan', y: 1325, name: 'Aztecs found Tenochtitlan', why: 'A lake-borne capital bigger than most European cities of its day.' },
  { id: 'black-death', y: 1347, name: 'Black Death reaches Europe', why: 'A third to half of Europe dies — labor scarcity cracks feudalism open.' },
  { id: 'joan', y: 1431, name: 'Joan of Arc executed', why: 'The peasant girl who turned the Hundred Years\' War — and became France\'s national symbol.' },
  { id: 'printing', y: 1440, name: 'Gutenberg develops the printing press', why: 'Ideas become copyable at scale — the Reformation and modern science both run on it.' },

  // ----- Age of Discovery (1450–1700) -----
  { id: 'constantinople', y: 1453, name: 'Ottomans take Constantinople', why: 'The Byzantine Empire ends; Europe starts looking for sea routes around the new power.' },
  { id: 'columbus', y: 1492, name: 'Columbus reaches the Americas', why: 'Two halves of the planet meet — crops, silver, empires, and catastrophe exchange hands.' },
  { id: 'gama', y: 1498, name: 'Vasco da Gama reaches India by sea', why: 'The ocean route around Africa breaks the old middlemen — Europe plugs into Asia directly.' },
  { id: 'luther', y: 1517, name: 'Luther posts the 95 Theses', why: 'The Reformation splits Western Christianity and, with it, Europe\'s politics for centuries.' },
  { id: 'cortes', y: 1519, name: 'Cortés lands in Mexico; Magellan sails', why: 'The Aztec empire falls within two years; a ship circles the Earth within three.' },
  { id: 'copernicus', y: 1543, name: 'Copernicus publishes heliocentrism', why: 'The Earth is demoted from center of the universe — the scientific revolution\'s opening move.' },
  { id: 'armada', y: 1588, name: 'Spanish Armada defeated', why: 'England survives; the sea power that will build the largest empire starts its rise.' },
  { id: 'eic', y: 1600, name: 'East India Company chartered', why: 'The joint-stock corporation is born — a company that would end up ruling India.' },
  { id: 'jamestown', y: 1607, name: 'Jamestown founded', why: 'The first permanent English settlement in America — the thread that becomes the United States.' },
  { id: 'galileo', y: 1610, name: 'Galileo turns the telescope on Jupiter', why: 'Moons orbiting another world — direct evidence the heavens don\'t revolve around us.' },
  { id: 'thirty-years', y: 1618, name: 'Thirty Years\' War begins', why: 'Europe\'s deadliest religious war ends in the Peace of Westphalia — the modern state system.' },
  { id: 'qing', y: 1644, name: 'Qing dynasty takes Beijing', why: 'China\'s last imperial dynasty begins its 268-year run.' },
  { id: 'principia', y: 1687, name: 'Newton publishes the Principia', why: 'Motion and gravity under one mathematical law — the model of what "science" means.' },
  { id: 'glorious', y: 1689, name: 'English Bill of Rights', why: 'Parliament above the crown — the constitutional template America would radicalize.' },

  // ----- Age of Revolutions (1700–1850) -----
  { id: 'watt', y: 1769, name: 'Watt patents his steam engine', why: 'Work stops being limited by muscle, wind, and water — the Industrial Revolution\'s engine.' },
  { id: 'independence', y: 1776, name: 'American Declaration of Independence', why: 'A state founded on a written argument — also the year Adam Smith\'s Wealth of Nations lands.' },
  { id: 'bastille', y: 1789, name: 'French Revolution begins', why: 'Monarchy, aristocracy, and church swept off the board — modern politics\' vocabulary is coined.' },
  { id: 'haiti', y: 1791, name: 'Haitian Revolution begins', why: 'The only successful slave revolt in history founds a state — and terrifies every slave empire.' },
  { id: 'vaccine', y: 1796, name: 'Jenner demonstrates the smallpox vaccine', why: 'The first vaccine — the single deadliest disease in history is put on a path to extinction.' },
  { id: 'napoleon', y: 1804, name: 'Napoleon crowns himself emperor', why: 'The revolution eats itself — but his legal code still underlies half the world\'s law.' },
  { id: 'waterloo', y: 1815, name: 'Waterloo ends the Napoleonic Wars', why: 'A century of relative European peace — and British dominance — begins.' },
  { id: 'railway', y: 1825, name: 'First public steam railway opens', why: 'Distance starts collapsing — within decades, continents run on timetables.' },
  { id: 'abolition', y: 1833, name: 'Britain abolishes slavery across its empire', why: 'The world\'s biggest slave power reverses — abolition becomes an enforceable global cause.' },
  { id: 'opium', y: 1839, name: 'First Opium War begins', why: 'Gunboats open China; the "century of humiliation" still shapes Chinese politics today.' },
  { id: 'famine', y: 1845, name: 'Great Irish Famine begins', why: 'A million dead, a million emigrated — and a diaspora that reshaped America.' },
  { id: 'revolutions-1848', y: 1848, name: 'Revolutions sweep Europe; Communist Manifesto published', why: 'Liberalism and socialism both announce themselves in one year.' },

  // ----- Industry & Empire (1850–1914) -----
  { id: 'darwin', y: 1859, name: 'Darwin publishes On the Origin of Species', why: 'Life explained without a designer — biology\'s unifying theory, and a cultural earthquake.' },
  { id: 'civil-war', y: 1861, name: 'American Civil War begins', why: 'The industrial North\'s victory ends slavery and forges a single continental power.' },
  { id: 'meiji', y: 1868, name: 'Meiji Restoration in Japan', why: 'The one non-Western nation to industrialize on its own terms — in a single generation.' },
  { id: 'suez', y: 1869, name: 'Suez Canal opens', why: 'Europe-to-Asia shipping shortens by weeks — trade and empire both accelerate.' },
  { id: 'germany', y: 1871, name: 'Germany unified', why: 'A new industrial giant in the middle of Europe — the balance that breaks in 1914.' },
  { id: 'telephone', y: 1876, name: 'Bell patents the telephone', why: 'Real-time voice at a distance — the network that still carries everything today.' },
  { id: 'lightbulb', y: 1879, name: 'Edison\'s practical light bulb', why: 'Cheap light decouples life from the sun — and electrification begins.' },
  { id: 'berlin-conf', y: 1884, name: 'Berlin Conference carves up Africa', why: 'European powers draw Africa\'s borders with rulers — most are still there.' },
  { id: 'automobile', y: 1885, name: 'Benz builds the first automobile', why: 'Personal motorized transport — the machine that would redesign every city.' },
  { id: 'flight', y: 1903, name: 'Wright brothers achieve powered flight', why: 'Twelve seconds at Kitty Hawk — sixty-six years later, the Moon.' },
  { id: 'relativity', y: 1905, name: 'Einstein\'s special relativity', why: 'Space and time turn out to be one flexible thing — physics\' 20th century begins.' },
  { id: 'qing-falls', y: 1912, name: 'China\'s last dynasty falls', why: 'Two thousand years of imperial rule end — the struggle over what replaces it defines modern China.' },

  // ----- World Wars & Cold War (1914–1991) -----
  { id: 'ww1', y: 1914, name: 'First World War begins', why: 'An assassination cascades through alliances — four empires won\'t survive it.' },
  { id: 'russian-rev', y: 1917, name: 'Russian Revolution', why: 'The first communist state — the 20th century\'s defining rivalry gets its second pole.' },
  { id: 'ww1-ends', y: 1918, name: 'WWI ends; influenza pandemic peaks', why: 'The war kills 17 million; the flu kills more — and the peace terms load the next war.' },
  { id: 'crash-29', y: 1929, name: 'Wall Street Crash', why: 'The Great Depression follows worldwide — and desperate countries turn to strongmen.' },
  { id: 'hitler', y: 1933, name: 'Hitler takes power in Germany', why: 'Democracy dismantled from inside in months — the century\'s darkest lesson in fragility.' },
  { id: 'ww2', y: 1939, name: 'Second World War begins', why: 'The deadliest war in history — some 60 million dead before it ends.' },
  { id: 'pearl-harbor', y: 1941, name: 'Pearl Harbor brings the US into WWII', why: 'The war becomes truly global — and American industrial power decides it.' },
  { id: 'dday', y: 1944, name: 'D-Day landings in Normandy', why: 'The largest seaborne invasion ever opens the Western front\'s final act.' },
  { id: 'ww2-ends', y: 1945, name: 'WWII ends; atomic bombs; UN founded', why: 'The nuclear age and the modern world order both start in the same summer.' },
  { id: 'india', y: 1947, name: 'India and Pakistan independent', why: 'The empire\'s keystone leaves — within two decades, most of the colonized world follows.' },
  { id: 'israel', y: 1948, name: 'State of Israel founded', why: 'A state born from the Holocaust\'s aftermath — and a conflict that still shapes the region.' },
  { id: 'prc', y: 1949, name: 'Mao proclaims the People\'s Republic of China', why: 'A quarter of humanity turns communist — today\'s superpower rivalry has its origin.' },
  { id: 'dna', y: 1953, name: 'DNA\'s double helix discovered', why: 'Life\'s information storage decoded — genetics, biotech, and modern medicine follow.' },
  { id: 'sputnik', y: 1957, name: 'Sputnik launched', why: 'The space race starts — and with it, the satellites everything now runs on.' },
  { id: 'cuba', y: 1962, name: 'Cuban Missile Crisis', why: 'Thirteen days at the edge of nuclear war — the closest call in human history.' },
  { id: 'moon', y: 1969, name: 'Apollo 11 lands on the Moon; ARPANET\'s first link', why: 'Humanity\'s farthest step — and, the same year, the internet\'s first packet.' },
  { id: 'deng', y: 1978, name: 'China\'s reform and opening begins', why: 'Deng\'s markets lift hundreds of millions from poverty — history\'s fastest enrichment.' },
  { id: 'wall-falls', y: 1989, name: 'Berlin Wall falls', why: 'The Cold War\'s symbol comes down live on television — the Soviet bloc unravels in months.' },
  { id: 'ussr-ends', y: 1991, name: 'Soviet Union dissolves', why: 'The 20th century\'s great experiment ends — one superpower remains, briefly.' },

  // ----- Information Age (1991–) -----
  { id: 'www', y: 1991, name: 'World Wide Web opens to the public', why: 'Berners-Lee gives the internet a face — and gives it away for free.' },
  { id: 'eu', y: 1993, name: 'European Union established', why: 'The Maastricht Treaty turns a trading bloc into a union — the boldest answer yet to 1914–45.' },
  { id: 'mandela', y: 1994, name: 'Mandela elected; apartheid ends', why: 'A negotiated end to institutional racism — and the century\'s great reconciliation story.' },
  { id: 'hong-kong', y: 1997, name: 'Hong Kong returned to China', why: 'The formal end of the British Empire\'s story — and a live test of "one country, two systems".' },
  { id: 'google', y: 1998, name: 'Google founded', why: 'Organizing the web\'s information becomes the world\'s most valuable business model.' },
  { id: 'nine-eleven', y: 2001, name: '9/11 attacks', why: 'Two decades of war, surveillance, and airport security trace back to one September morning.' },
  { id: 'genome', y: 2003, name: 'Human Genome Project completed', why: 'Our own source code read end to end — the platform for modern biotech.' },
  { id: 'iphone', y: 2007, name: 'iPhone launches', why: 'Computing moves into every pocket — most of humanity\'s first computer is a phone.' },
  { id: 'gfc', y: 2008, name: 'Global financial crisis', why: 'The worst crash since 1929 — bailouts, populism, and Bitcoin are all downstream of it.' },
  { id: 'arab-spring', y: 2010, name: 'Arab Spring begins', why: 'Social-media-fueled uprisings topple four governments — and show both the power and limits of the feed.' },
  { id: 'alexnet', y: 2012, name: 'Deep learning breakthrough (AlexNet)', why: 'Neural networks suddenly work — the current AI era starts here.' },
  { id: 'covid', y: 2020, name: 'COVID-19 pandemic', why: 'The first pandemic of the connected age — and the fastest vaccine ever developed.' },
  { id: 'chatgpt', y: 2022, name: 'Russia invades Ukraine; ChatGPT released', why: 'War returns to Europe and AI goes mainstream in the same year — this decade\'s two hinges.' },
];

// Era is derived from the year, so the two can never disagree.
for (const e of EVENTS) {
  e.era = ERAS.find((era) => e.y >= era.from && e.y < era.to).id;
}
