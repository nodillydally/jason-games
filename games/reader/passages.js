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
];
