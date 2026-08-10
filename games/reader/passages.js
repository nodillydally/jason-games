/* passages.js — reading passages and comprehension questions for Reader.
 *
 * All prose here is original, written for this game. That matters for two
 * reasons: no licensing question, and every question can be answered *only* by
 * having read the passage. A comprehension test you can pass from general
 * knowledge measures nothing.
 *
 * Each question has exactly one defensible answer stated in the text. Wrong
 * options are plausible-sounding claims the passage does not make — the usual
 * failure mode of speed reading is recognising familiar words and inventing the
 * argument around them, and these are built to catch that.
 *
 * `level` sets syntactic difficulty, not topic difficulty: 1 is plain
 * declarative prose, 3 has subordinate clauses, qualifications, and abstractions
 * that punish skimming.
 */

const PASSAGES = [
  {
    id: 'early',
    title: 'The Cost of Being Early',
    level: 1,
    text: `Being early to a market looks like an advantage, and sometimes it is. More often it is expensive. The first company to sell a product has to explain to customers why they need it at all, and that explanation is the costliest part of any sale. By the time people understand the category, the pioneer has usually spent its money teaching them.

The second company arrives to a market that already knows what the product is for. It skips the education entirely and competes on execution, which is cheaper. This is why so many category-defining companies were not the first to their category. They were the first to arrive after the expensive part was over.

None of this argues for waiting. A market that nobody has entered may be empty because it is not a market. The useful question is narrower: is the thing you are building unfamiliar, or merely unbuilt? Unbuilt is a fine place to be early. Unfamiliar means you are about to fund a public education campaign, and you should price that into your plan before you start, not after your first year of confused customers.`,
    questions: [
      {
        q: 'According to the passage, what makes being first expensive?',
        options: [
          'The pioneer pays to teach customers the category exists',
          'Early technology is more expensive to build',
          'First movers must charge lower prices to attract buyers',
          'Regulators scrutinise the first entrant most closely',
        ],
        answer: 0,
      },
      {
        q: 'What distinction does the passage say actually matters?',
        options: [
          'Whether the product is unfamiliar or merely unbuilt',
          'Whether the market is large or small',
          'Whether the founder has prior experience',
          'Whether competitors are funded',
        ],
        answer: 0,
      },
      {
        q: 'What does the passage say about entering an empty market?',
        options: [
          'It may be empty because it is not a market',
          'It is always the strongest possible position',
          'It requires more capital than a crowded one',
          'It guarantees a durable advantage',
        ],
        answer: 0,
      },
    ],
  },

  {
    id: 'roots',
    title: 'What Happens Under a Forest',
    level: 1,
    text: `A forest floor looks inert. Underneath it is a trading network. Fungal threads thinner than a hair wrap around tree roots and extend outward for metres, and through those threads trees move sugar, water, and nitrogen between themselves.

The fungus is not doing this out of goodwill. It cannot photosynthesise, so it takes a share of the sugar passing through in exchange for carrying the traffic. The tree gets access to minerals its own roots would never reach. Neither party could do the other's job, which is precisely why the arrangement holds.

What surprised researchers was the direction of the flow. Sugar tends to move from trees with plenty toward trees with little, including seedlings shaded out on the forest floor that could not survive on the light reaching them. A tall tree in full sun may be quietly subsidising a sapling it will never compete with.

This is not generosity either. A seedling that survives becomes part of the same network, and a forest with gaps in it dries out and burns more readily than a dense one. What looks like altruism is closer to infrastructure. The trees are not helping each other so much as maintaining the conditions that keep all of them alive.`,
    questions: [
      {
        q: 'What does the fungus get from the arrangement?',
        options: [
          'A share of the sugar passing through, since it cannot photosynthesise',
          'Protection from sunlight',
          'Nitrogen it cannot otherwise absorb',
          'Physical support from the root structure',
        ],
        answer: 0,
      },
      {
        q: 'Which direction does sugar tend to flow?',
        options: [
          'From trees with plenty toward trees with little',
          'From younger trees toward older ones',
          'Outward from the forest edge toward the centre',
          'Downward from the canopy into the soil only',
        ],
        answer: 0,
      },
      {
        q: 'How does the passage explain the apparent generosity?',
        options: [
          'A denser forest is less prone to drying out and burning',
          'Trees cannot detect which roots are their own',
          'Excess sugar would otherwise damage the tree',
          'The fungus forces the transfer',
        ],
        answer: 0,
      },
    ],
  },

  {
    id: 'longitude',
    title: 'The Longitude Problem',
    level: 2,
    text: `For most of the age of sail, a ship could tell you how far north it was but not how far east. Latitude falls out of the angle of the sun at noon, which anyone with an instrument and a table can measure. Longitude is harder, because the Earth turns. To know your longitude you must know what time it is where you are and, simultaneously, what time it is somewhere whose position you already know. The difference between the two, at fifteen degrees per hour, is your answer.

That reduces the problem to keeping accurate time at sea, which sounds easier than it was. Pendulum clocks, the best timekeepers on land, are useless on a rolling deck. Temperature changes the length of metal parts. Humidity corrodes them. A clock losing three seconds a day, excellent by the standards of the era, would put a ship more than ten miles off course after a month at sea, and ships were at sea for far longer than a month.

The eventual solution was mechanical rather than astronomical, and it came from a carpenter rather than an astronomer — a fact the scientific establishment of the day found difficult to accept, and resisted for years after the instruments were demonstrably working.`,
    questions: [
      {
        q: 'Why is longitude harder to determine than latitude?',
        options: [
          'It requires knowing the time in two places at once, because the Earth turns',
          'The instruments required had not yet been invented',
          'The sun’s angle changes too rapidly to measure',
          'Magnetic compasses drift unpredictably at sea',
        ],
        answer: 0,
      },
      {
        q: 'What does the passage give as the rate of conversion?',
        options: [
          'Fifteen degrees per hour',
          'Ten miles per day',
          'Three seconds per degree',
          'One degree per minute',
        ],
        answer: 0,
      },
      {
        q: 'What does the passage say about the eventual solution?',
        options: [
          'It was mechanical, came from a carpenter, and was resisted by the establishment',
          'It was astronomical and was adopted immediately',
          'It relied on improved pendulum design',
          'It was discovered independently by several astronomers',
        ],
        answer: 0,
      },
    ],
  },

  {
    id: 'cobra',
    title: 'When the Incentive Becomes the Target',
    level: 2,
    text: `A colonial administration in Delhi, worried about venomous snakes, offered a bounty for every dead cobra brought in. The policy worked briefly. Then people began breeding cobras, because a farmed snake earns the same bounty as a wild one and is considerably easier to obtain. When the administration discovered this and cancelled the scheme, the breeders released their now-worthless stock, and the city ended up with more cobras than it had started with.

The story is repeated often enough that its details have probably drifted from whatever actually happened. Its usefulness does not depend on the history being exact. The structure it describes is real and recurs constantly: a measure chosen to stand in for an outcome becomes, once rewarded, a target that can be pursued directly, and the connection between measure and outcome quietly breaks.

The pattern is hard to avoid because the alternative — rewarding the outcome itself — is usually impossible. Nobody could pay for "fewer snakebites" directly. So a proxy is chosen, and the proxy is gameable, and the gaming is rational for whoever does it. The failure is not moral. It is structural, and the people exploiting it are usually just responding sensibly to what they were asked to do.`,
    questions: [
      {
        q: 'Why did cancelling the bounty make things worse?',
        options: [
          'Breeders released stock that had become worthless',
          'Wild cobra populations had already grown',
          'Hunters stopped killing wild snakes entirely',
          'The bounty was replaced by a less effective policy',
        ],
        answer: 0,
      },
      {
        q: 'What does the passage say about the historical accuracy of the story?',
        options: [
          'Its usefulness does not depend on the details being exact',
          'It has been verified by colonial records',
          'It is entirely fabricated and should be discarded',
          'The details matter more than the structure',
        ],
        answer: 0,
      },
      {
        q: 'How does the passage characterise the people who game a proxy?',
        options: [
          'They are responding sensibly to what they were asked to do',
          'They are acting immorally for private gain',
          'They usually misunderstand the policy',
          'They are a small minority in most systems',
        ],
        answer: 0,
      },
    ],
  },

  {
    id: 'maps',
    title: 'What a Map Leaves Out',
    level: 3,
    text: `Every map is a claim about what matters, disguised as a description of what exists. This is not a criticism; it is a structural necessity. A map that preserved every feature of the territory would be the size of the territory and no more useful than standing in it. Selection is the whole point, and selection requires someone to have decided what may be discarded.

The decisions are rarely visible in the finished product, which is what makes them powerful. A road atlas renders a nation as a circulatory system and its wilderness as the gaps between arteries. A political map draws borders in hard ink and leaves the mountain ranges those borders often follow entirely unmarked, implying that the line is the primary fact and the geography incidental — when historically the causation usually ran the other way.

None of this makes maps untrustworthy, but it does mean that reading one well requires holding two things at once: what the map asserts, and what it had to suppress in order to assert it clearly. The most misleading maps are not the inaccurate ones, which can be corrected. They are the accurate ones whose choice of subject was never examined, because a map that is correct about everything it shows still tells you nothing about what it declined to show.`,
    questions: [
      {
        q: 'Why does the passage say selection is a structural necessity?',
        options: [
          'A map preserving every feature would be as large as the territory',
          'Printing costs constrain the level of detail',
          'Readers cannot process more than a few features at once',
          'Surveying every feature is technically impossible',
        ],
        answer: 0,
      },
      {
        q: 'What does the passage say a political map implies about borders?',
        options: [
          'That the line is primary and the geography incidental',
          'That borders are permanent and unchanging',
          'That mountain ranges are the true boundaries',
          'That political divisions follow population density',
        ],
        answer: 0,
      },
      {
        q: 'Which maps does the passage call most misleading?',
        options: [
          'Accurate ones whose choice of subject was never examined',
          'Inaccurate ones that go uncorrected',
          'Maps drawn for political purposes',
          'Maps that omit scale or projection information',
        ],
        answer: 0,
      },
    ],
  },

  {
    id: 'replication',
    title: 'The Result That Would Not Repeat',
    level: 3,
    text: `A finding published in a respected journal has, in principle, earned a degree of trust: it survived peer review, its statistics cleared the conventional threshold, and its author staked a reputation on it. In practice a substantial fraction of such findings fail when another laboratory attempts the same experiment, and the reasons are less scandalous and more structural than fraud.

Consider what a threshold does. If a result counts as publishable when the odds of it arising by chance fall below one in twenty, then among a large enough population of researchers testing effects that do not exist, roughly one in twenty will nonetheless produce a publishable result. Those are the ones submitted, because a null finding is difficult to publish and does little for a career. The literature therefore accumulates a systematically biased sample of the experiments actually conducted, and no individual within it has done anything wrong.

The correction is unglamorous: pre-register the hypothesis before collecting data, publish results regardless of outcome, and treat a single study as a suggestion rather than a fact. What resists this is not disagreement about the diagnosis, which is now broadly accepted, but the incentive structure that made the problem in the first place — which continues to reward novelty over confirmation, and rewards it immediately.`,
    questions: [
      {
        q: 'What does the passage identify as the main cause of failed replications?',
        options: [
          'A structural bias in which experiments get published',
          'Widespread data fabrication',
          'Insufficient sample sizes in original studies',
          'Poor training in statistical methods',
        ],
        answer: 0,
      },
      {
        q: 'What does the passage say about researchers who produce these findings?',
        options: [
          'No individual within the process has necessarily done anything wrong',
          'Most are aware they are misrepresenting results',
          'They typically fail to follow peer review procedures',
          'They tend to be inexperienced',
        ],
        answer: 0,
      },
      {
        q: 'What does the passage say resists the correction?',
        options: [
          'The incentive structure that rewards novelty over confirmation',
          'Disagreement about whether the problem is real',
          'The cost of running replication studies',
          'Journals refusing to change their thresholds',
        ],
        answer: 0,
      },
    ],
  },
  {
    id: 'tides',
    title: 'The Second Tide',
    level: 1,
    text: `The moon pulls the ocean toward it. That much is common knowledge, and it explains one bulge of high water on the side of Earth facing the moon. It does not explain the second one. There are two high tides a day, not one, and the second bulge sits on the far side of the planet, pointing away from the moon entirely.

The reason is that the moon pulls on everything, not just the water. It pulls hardest on the near side of Earth, less hard on the planet's centre, and least of all on the far side, because the pull weakens with distance. The near ocean is drawn away from the planet. The planet is drawn away from the far ocean. Both leave a bulge behind them.

So the second tide is not caused by a force pushing water outward. It is what is left over when the ground underneath the water is pulled out from under it. Earth turns through both bulges each day, which is why almost every coast gets two high tides rather than one.

The sun does the same thing at roughly half the strength. When sun and moon line up, their bulges add and the tides run high; when they sit at right angles, the tides are meek. None of this depends on the sun being brighter or the moon being nearer in any simple sense. It depends only on how much the pull changes across the width of the planet.`,
    questions: [
      {
        q: 'Why does the passage say a second bulge forms on the far side of Earth?',
        options: [
          'The planet is pulled away from the water on that side',
          'The moon’s gravity wraps around Earth and pushes the water outward',
          'The sun pulls the far water while the moon pulls the near water',
          'Earth’s rotation flings the far-side water outward',
        ],
        answer: 0,
      },
      {
        q: 'According to the passage, what determines the strength of the effect?',
        options: [
          'How much the pull changes across the width of the planet',
          'The total strength of the moon’s gravity',
          'The depth of the ocean at a given coast',
          'How fast the planet rotates',
        ],
        answer: 0,
      },
      {
        q: 'What does the passage say happens when the sun and moon line up?',
        options: [
          'Their bulges add and the tides run high',
          'The sun cancels the moon’s effect and tides flatten',
          'There is one high tide that day instead of two',
          'The far-side bulge disappears',
        ],
        answer: 0,
      },
    ],
  },
  {
    id: 'apprentice',
    title: 'What Cannot Be Written Down',
    level: 1,
    text: `Most skills are taught by explanation, and most skills are not learned that way. Someone who has done a thing for twenty years can usually tell you the rules they follow. What they cannot tell you is the much larger set of judgements they make without noticing: when to break the rule, how much is enough, what a problem feels like before it becomes visible. That knowledge is real, and it is almost never in the explanation.

Apprenticeship works around the problem instead of solving it. The apprentice does not receive the expert's knowledge in words. They stand next to the expert for a long time, attempt the work badly, and get corrected on the specific thing they did. Over enough corrections the judgement transfers, without either person being able to say what was transferred.

This is slow and it does not scale, which is why nearly every field replaced it with instruction. The replacement is a genuine trade rather than a pure loss. A textbook reaches thousands of people and an apprenticeship reaches one.

But the trade has a cost that is easy to miss, because what gets lost is exactly the part nobody could write down in the first place. A field that has moved entirely to instruction will not notice a gap. It will only notice that its graduates know the rules and still cannot do the work.`,
    questions: [
      {
        q: 'What does the passage say experts usually cannot explain?',
        options: [
          'The judgements they make without noticing',
          'The formal rules their field follows',
          'How long the skill took them to acquire',
          'Why their field matters to outsiders',
        ],
        answer: 0,
      },
      {
        q: 'How does the passage say apprenticeship transfers judgement?',
        options: [
          'Through repeated correction of specific attempts',
          'Through careful verbal explanation of the expert’s reasoning',
          'By having the apprentice memorise the expert’s rules',
          'By exposing the apprentice to many different experts',
        ],
        answer: 0,
      },
      {
        q: 'What does the passage say a fully instruction-based field will notice?',
        options: [
          'That its graduates know the rules and still cannot do the work',
          'That its textbooks have grown too long to use',
          'That fewer people are entering the field',
          'That its experts disagree with one another more often',
        ],
        answer: 0,
      },
    ],
  },
  {
    id: 'queue',
    title: 'One Line or Six',
    level: 1,
    text: `A bank with six tellers can arrange its customers two ways. It can run six lines, one per teller, or one line that feeds whichever teller comes free. The total waiting time is nearly identical either way, because the same number of people are being served by the same number of tellers. What changes is how the waiting is distributed.

Six lines produce a small number of very unlucky people. If the person ahead of you has a complicated problem, you wait for all of it while the line beside you moves. One line removes that possibility. Nobody gets stuck behind a single slow transaction, because the queue routes around it. The average wait barely moves, but the worst wait gets much shorter.

Customers report the single line as fairer and, oddly, as faster, even when it is not. Part of that is the absence of the particular irritation of watching another line beat you. Part of it is that the single line visibly moves all the time, whereas your own line in a six-line system stands still for long stretches.

Airports, banks and post offices adopted the single line for these reasons rather than for throughput. It is worth being clear about which problem was solved. The single line did not make service faster. It made waiting less variable, and people evidently mind variance more than they mind the wait.`,
    questions: [
      {
        q: 'According to the passage, what does a single queue actually improve?',
        options: [
          'The worst wait rather than the average wait',
          'The number of customers served each hour',
          'The speed of each individual transaction',
          'The number of tellers a branch needs',
        ],
        answer: 0,
      },
      {
        q: 'Why does the passage say the single line feels faster?',
        options: [
          'It moves constantly and removes the sight of a rival line winning',
          'It is usually shorter than any one of the separate lines',
          'Staff work faster when every customer is watching them',
          'Customers are given an estimated wait when they join it',
        ],
        answer: 0,
      },
      {
        q: 'What does the passage conclude that people mind most?',
        options: [
          'Variance in waiting, more than the waiting itself',
          'The total length of the wait',
          'The behaviour of the customers around them',
          'Being served by a teller they do not know',
        ],
        answer: 0,
      },
    ],
  },
  {
    id: 'scurvy',
    title: 'The Cure That Went Missing',
    level: 2,
    text: `The Royal Navy solved scurvy in 1795 and then lost the solution for most of a century. This is a stranger story than a simple failure, because the cure worked, was adopted, and still went missing.

Citrus was issued as lemon juice, and the disease effectively vanished from the fleet. But the reason it worked was not understood; vitamin C would not be identified for over a hundred years. What the Navy held was a procedure, not an explanation, and a procedure with no explanation behind it cannot defend itself against a plausible substitution. When lemons were replaced by West Indian limes on grounds of cost and supply, nobody could say why the swap might matter. Limes carry substantially less vitamin C, and the juice was often processed in ways that destroyed much of what remained.

Scurvy returned, quietly at first, on long polar voyages where the diet offered no other source. By then the failure was read through newer theories — spoiled food, tainted air, too little fresh meat — each of which explained part of the evidence and none of which was right. The original observation had not been refuted. It had simply been detached from the practice that depended on it.

The pattern is not confined to medicine. An organisation that knows what to do without knowing why will keep doing it until something changes that looks irrelevant. It then rediscovers the reason by losing it, which is the most expensive way to learn anything.`,
    questions: [
      {
        q: 'Why does the passage say the cure was vulnerable?',
        options: [
          'It was a procedure with no explanation behind it',
          'It was too expensive to supply across the whole fleet',
          'Sailors refused to take it consistently',
          'It had never actually been tested at sea',
        ],
        answer: 0,
      },
      {
        q: 'What does the passage say happened when scurvy came back?',
        options: [
          'It was explained by newer theories that were wrong',
          'The Navy immediately restored lemon juice',
          'Doctors concluded that citrus had never worked at all',
          'It was mistaken for an entirely different disease',
        ],
        answer: 0,
      },
      {
        q: 'What general pattern does the passage draw from the story?',
        options: [
          'Knowing what to do without knowing why lasts until something seemingly irrelevant changes',
          'Cost-cutting is the usual cause of institutional failure',
          'Medical knowledge advances fastest under military pressure',
          'Direct observation should always outrank theory',
        ],
        answer: 0,
      },
    ],
  },
  {
    id: 'gauge',
    title: 'The Width of the Rails',
    level: 2,
    text: `Railway track in most of the world is 1,435 millimetres between the rails, a number with no engineering logic behind it. It is the width George Stephenson used on a colliery line in the north of England, itself inherited from the wagonways that came before. Nothing about the figure is optimal. Wider gauges are steadier at speed and carry more; several were built, and several worked better.

They lost anyway, and not because anyone judged them inferior. A railway's value is largely the set of other railways it can connect to, so the gauge that is already common is worth more than the gauge that is better. Each new line faced a choice between joining a network and forming an island, and consistently chose the network. Every such choice made the next one more lopsided.

What locks a standard in place is the cost of leaving it, and that cost grows with every mile laid. By the time the drawbacks were well understood, converting meant rebuilding track, rolling stock and platforms at once across an entire country — an expense no single operator could justify and no group could coordinate.

A few countries did convert, always under conditions that made the usual arithmetic fail: a network small enough, a state willing to absorb the cost, or a war that had destroyed the track anyway. Absent those, the early accident holds. The standard does not persist because it won an argument. It persists because the argument stopped being worth having.`,
    questions: [
      {
        q: 'Why does the passage say the common gauge won?',
        options: [
          'A line’s value came from what it could connect to, not from the gauge itself',
          'It proved steadier than the wider alternatives',
          'Stephenson held a patent that others had to license',
          'Governments mandated it before rivals could spread',
        ],
        answer: 0,
      },
      {
        q: 'What does the passage say makes a standard hard to leave?',
        options: [
          'The cost of switching grows with every mile built',
          'Operators sign long agreements that require maintaining it',
          'Engineers become unwilling to learn new methods',
          'The original reason for it is eventually forgotten',
        ],
        answer: 0,
      },
      {
        q: 'Under what conditions does the passage say conversion did happen?',
        options: [
          'A small network, a state willing to pay, or a war that destroyed the track anyway',
          'The arrival of a clearly superior technology',
          'Several operators agreeing to convert together',
          'Passenger demand outgrowing existing capacity',
        ],
        answer: 0,
      },
    ],
  },
  {
    id: 'forgetting',
    title: 'The Feeling of Learning',
    level: 2,
    text: `Studying the same material twice in one evening feels more productive than studying it twice a week apart, and it is measurably worse. The feeling is not a mistake about effort; the second reading really is easier. It is a mistake about what ease indicates.

Material reviewed while it is still fresh is easy to recall precisely because it has not yet begun to fade, and recall that costs nothing strengthens nothing. Waiting until retrieval is difficult but still possible is what does the work. The effort of reconstructing something half-forgotten is what makes it durable, so the best moment to review sits close to the point where you would have lost it.

This puts the learner's judgement in direct conflict with the learner's interest. Massed practice produces high confidence and rapid apparent progress, both of which are the sensations of information sitting in short-term memory. Spaced practice feels like failure in progress, because you keep meeting things you thought you knew and no longer do. Given the choice, most people take the version that feels like learning over the version that produces it.

The practical consequence is that scheduling cannot be left to the person doing the studying. Whatever decides when material comes back — a system, a schedule, another person — has to be something that does not consult how well the studying seems to be going, because that signal points reliably the wrong way.`,
    questions: [
      {
        q: 'What does the passage say makes review durable?',
        options: [
          'The effort of reconstructing something half-forgotten',
          'The sheer number of times material is reviewed',
          'Reviewing before any forgetting has begun',
          'Studying in a consistent place and time',
        ],
        answer: 0,
      },
      {
        q: 'Why does massed practice feel effective, according to the passage?',
        options: [
          'It produces confidence from material still sitting in short-term memory',
          'It covers more material in less total time',
          'It reduces the anxiety of being tested',
          'It matches the way material is usually examined',
        ],
        answer: 0,
      },
      {
        q: 'What does the passage conclude about scheduling review?',
        options: [
          'It must not be based on how well the studying feels to be going',
          'It should be set by the difficulty of the material',
          'It should be compressed as an exam approaches',
          'It works best when the learner sets it personally',
        ],
        answer: 0,
      },
    ],
  },
  {
    id: 'commons',
    title: 'The Pasture and Its Rules',
    level: 3,
    text: `The standard account of a shared resource, which has been taught for decades and is repeated far more often than it is examined, holds that anything owned by everyone will be destroyed by everyone. Each herder grazing a common pasture captures the whole benefit of one more animal while bearing only a fraction of the resulting damage, so the arithmetic governing the individual runs against the arithmetic governing the group, and the pasture is stripped. From this it is generally concluded that the resource must be divided into private holdings or placed under an external authority, those being the only two arrangements that bring the two arithmetics back into line.

The conclusion follows from the assumptions, and the assumptions are frequently false. What the model actually describes is not a shared resource but a shared resource among strangers who cannot communicate, cannot observe one another, and will not meet again. Where those conditions are relaxed — which is to say, in most of the commons that have actually existed — communities have often produced their own rules, monitored each other at almost no cost because they were already present, and imposed penalties that escalated gradually rather than beginning with expulsion.

Such arrangements are neither universal nor guaranteed. They fail regularly, and they fail predictably: when the group grows too large to observe itself, when its boundaries are unclear, or when an outside authority overrides the local rules with worse ones. The correction, then, is not that the tragedy is a myth. It is that the tragedy describes a particular institutional vacuum, and that treating it as a law of nature tends to justify dismantling the very arrangements that were preventing it.`,
    questions: [
      {
        q: 'What does the passage say the standard model actually describes?',
        options: [
          'A resource shared among strangers who cannot communicate or observe one another',
          'Any resource held in common by more than one party',
          'A resource with no legal owner of any kind',
          'A resource whose damage is invisible to those using it',
        ],
        answer: 0,
      },
      {
        q: 'According to the passage, when do community arrangements fail?',
        options: [
          'When the group is too large to observe itself, its boundaries blur, or outside rules override local ones',
          'When penalties are too mild to deter cheating',
          'When the resource becomes commercially valuable',
          'When members are free to leave the group',
        ],
        answer: 0,
      },
      {
        q: 'What correction does the passage offer?',
        options: [
          'The tragedy describes an institutional vacuum rather than a law of nature',
          'The tragedy has never actually been observed in practice',
          'Communal management always outperforms private ownership',
          'External authorities are necessary but not sufficient',
        ],
        answer: 0,
      },
    ],
  },
  {
    id: 'signal',
    title: 'What an Assurance Costs',
    level: 3,
    text: `An assurance is worth attending to only in proportion to what it would cost the speaker to make it falsely, which is why claims that are free to assert carry almost no information regardless of how emphatically they are made. Anyone can say they are diligent. The statement costs the same whether or not it is true, so it separates nobody from anybody, and a listener who updated on it would be updating on noise.

What does carry information is a claim that would be painful to make dishonestly. A guarantee obliging the seller to refund a bad product is not primarily a reassurance about the product; it is a bet the seller loses if the product is bad, and the willingness to place it is the evidence. The same logic explains why costly and apparently wasteful displays persist across species and societies. The waste is not incidental to the signal — it is the mechanism. A display the unqualified could also afford would immediately be adopted by them, and would then mean nothing.

This yields an uncomfortable prediction, namely that useful signals tend to be expensive by design and cannot be made cheaper without being destroyed. It also yields a test. When judging an assurance, the question is not whether the person is sincere, since sincerity is as available to the mistaken as to the correct. The question is what the assurance would have cost them had it turned out wrong, and whether they had any way of knowing that in advance.`,
    questions: [
      {
        q: 'Why does the passage say free assertions carry little information?',
        options: [
          'They cost the same whether true or false, so they separate nobody from anybody',
          'They are usually made by people with little expertise',
          'They are too vague to be tested against evidence',
          'Listeners have learned to discount all confident claims',
        ],
        answer: 0,
      },
      {
        q: 'What does the passage say about the waste in costly displays?',
        options: [
          'The waste is the mechanism rather than a side effect',
          'It is tolerated because the benefits outweigh it',
          'It tends to decline once the signal is established',
          'It shows the display has been poorly designed',
        ],
        answer: 0,
      },
      {
        q: 'What test does the passage propose for judging an assurance?',
        options: [
          'What it would have cost the speaker had it been wrong, and whether they could know that beforehand',
          'Whether the speaker appears sincere',
          'Whether the claim can be independently verified',
          'Whether the speaker has been right about similar things before',
        ],
        answer: 0,
      },
    ],
  },
  {
    id: 'induction',
    title: 'The Sun and the Record',
    level: 3,
    text: `Every expectation about the future rests on a pattern that has held in the past, and no pattern that has held in the past entails that it will continue — a difficulty that has resisted solution for roughly three centuries rather than a puzzle awaiting a clever answer. The sun has risen on every recorded morning; nothing in that record contains the further claim that tomorrow belongs to the same series. To argue that such inferences have generally worked before is to use induction in its own defence, and an argument that assumes what it is trying to establish has established nothing.

The practical response, which is not a refutation, is to notice that the difficulty is uniform. It applies with equal force to every prediction and therefore does not discriminate between them. It gives no reason to prefer the expectation that bread will nourish over the expectation that it will poison, so it cannot unsettle the first without equally unsettling the second, and a doubt that touches everything alike leaves the ordering of our beliefs exactly where it found it.

What the difficulty does change is the status we assign to a well-supported belief. That status cannot be certainty, and treating it as certainty is where the damage occurs — not in the ordinary use of evidence, which proceeds perfectly well, but in the confidence attached to a rule that has never yet been violated. The observation that a thing has always happened is entirely compatible with its being about to stop, and the longer the record, the more forcefully that tends to be forgotten.`,
    questions: [
      {
        q: 'Why does the passage say induction cannot be defended by its track record?',
        options: [
          'Doing so uses induction to justify induction',
          'The track record is shorter than it appears',
          'Past successes were largely coincidental',
          'No record is ever complete enough to serve as evidence',
        ],
        answer: 0,
      },
      {
        q: 'What does the passage say follows from the difficulty being uniform?',
        options: [
          'It cannot rank one expectation above another, so it leaves our beliefs ordered as they were',
          'It shows that all predictions are equally unreliable',
          'It means the problem can safely be ignored in science',
          'It implies experience is not a source of knowledge at all',
        ],
        answer: 0,
      },
      {
        q: 'Where does the passage say the damage actually occurs?',
        options: [
          'In the certainty attached to a rule that has never yet been violated',
          'In the ordinary use of evidence to make decisions',
          'In assuming the future will resemble the past',
          'In relying on records that are too short',
        ],
        answer: 0,
      },
    ],
  },
];
