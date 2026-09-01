import { BLOCK_TYPES } from '@/worlds/blocks';
import { MOSHA_BEATS, type BuilderStep } from '@/worlds/builder/moshaGuide';

/**
 * What Mo$ha actually knows.
 *
 * He answers from the app's own state and nothing else: the blocks that really
 * exist in the registry, the streets and gate this artist has actually built,
 * how many of their songs are on SONGCHAINN, what the tiers really cost. No
 * invented features, no confident guesses.
 *
 * That constraint is the whole design. An assistant inside a builder that
 * cheerfully describes a feature nobody wrote sends an artist looking for a
 * button that is not there, and they conclude the app is broken rather than
 * that the helper was wrong. So when Mo$ha does not know, he says so and offers
 * to pass the request on, which is a real action with a real table behind it.
 */

export interface MoshaFacts {
  step: BuilderStep;
  worldName: string;
  tier: string;
  streetCount: number;
  filledStreets: number;
  blockCount: number;
  gateKind: string | null;
  visitorPosts: string;
  published: boolean;
  worldNumber: number | null;
  songCount: number;
  galleryCount: number;
}

export interface MoshaReply {
  text: string;
  /** Shown as tappable follow-ups, so nobody has to guess what he can do. */
  chips?: string[];
  /** True when he could not answer and is offering to pass it on. */
  offersFeatureRequest?: boolean;
}

/* ------------------------------------------------------------- intents --- */

type Intent = {
  id: string;
  /** Any of these in the question triggers it. */
  match: RegExp;
  answer: (f: MoshaFacts) => MoshaReply;
};

const list = (items: string[]) =>
  items.length <= 1 ? items[0] ?? '' : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

const INTENTS: Intent[] = [
  {
    id: 'blocks',
    match: /\b(block|blocks|what can i (add|put)|components?|widgets?|sections?)\b/i,
    answer: () => ({
      text: `There are ${BLOCK_TYPES.length} blocks: ${list(BLOCK_TYPES.map((b) => b.name))}. Anything on your streets is made of those. If you need something that is not in that list, say so and I will pass it on.`,
      chips: ['What should I put on a street?', 'Can I add a radio station?'],
      offersFeatureRequest: true,
    }),
  },
  {
    id: 'radio',
    match: /\b(radio|tv|station|broadcast|schedule|always on)\b/i,
    answer: () => ({
      text: 'You build a station out of what is here rather than a "station" button. A catalog-list block for the rotation, a video-wall for anything filmed, and a countdown for whatever is next. People come back for the countdown more than anything else.',
      chips: ['What blocks exist?', 'How do I gate a street?'],
    }),
  },
  {
    id: 'gate',
    match: /\b(gate|key|lock|token|coin|hold|access|members?|private|threshold|ring)\b/i,
    answer: (f) => ({
      text: f.gateKind
        ? `Your key is set to ${f.gateKind}. A street can be open, or need ring 1, 2 or 3. The key can be $ONGCHAINN, loyalty points, a pass, or your own token on Base. Change it on the Key step and it applies everywhere at once.`
        : 'No key set yet. Options are $ONGCHAINN, loyalty points, a pass, or your own token on Base. A world does not need one at all, and open worlds grow faster early on.',
      chips: ['Can I use one song as the key?', 'Who can post in my world?'],
    }),
  },
  {
    id: 'song-key',
    match: /\b(one song|a song as|song as the key|song key)\b/i,
    answer: () => ({
      text: 'Yes. A street can be keyed to a specific song, so the people who own that one record get in. It is on the Key step, per street, not just for the whole world.',
    }),
  },
  {
    id: 'posting',
    match: /\b(post|posting|comment|visitors? (can|post)|fans post|talk|chat in)\b/i,
    answer: (f) => ({
      text: `Visitor posting is ${f.visitorPosts === 'off' ? 'off, so only you post here' : f.visitorPosts === 'members' ? 'on for anyone past the key' : 'open to anyone who walks in'}. Their words, shares and song cards. Photos and video stay with artists everywhere, including in here.`,
      chips: ['How do I change that?'],
    }),
  },
  {
    id: 'media',
    match: /\b(photo|photos|image|images|video|artwork|gallery|picture)\b/i,
    answer: (f) => ({
      text:
        f.galleryCount > 0
          ? `You have ${f.galleryCount} piece${f.galleryCount === 1 ? '' : 's'} of visual work up. A gallery-grid or video-wall block puts it on a street. Upload more in the Studio, it needs no wallet.`
          : 'Nothing in your gallery yet. Upload artwork, photographs or video in the Studio, then a gallery-grid or video-wall block puts it on a street. No wallet needed to upload, only to coin something.',
      chips: ['What blocks exist?'],
    }),
  },
  {
    id: 'music',
    match: /\b(song|songs|music|track|tracks|catalog|catalogue|release|album)\b/i,
    answer: (f) => ({
      text:
        f.songCount > 0
          ? `You have ${f.songCount} track${f.songCount === 1 ? '' : 's'} on SONGCHAINN. A catalog-list block pulls them onto a street. You pick which, and the order.`
          : 'No tracks on SONGCHAINN yet. Put one out in the Studio first, then a catalog-list block can pull it in. Releasing needs an account and nothing else.',
    }),
  },
  {
    id: 'publish',
    match: /\b(publish|go live|launch it|when.*live|world number)\b/i,
    answer: (f) => ({
      text: f.published
        ? `It is live${f.worldNumber ? ` as World #${String(f.worldNumber).padStart(3, '0')}` : ''}. You can keep editing, changes show up straight away.`
        : `Not published yet. ${f.filledStreets === 0 ? 'Put something on at least one street first, an empty world reads as broken.' : `You have ${f.filledStreets} street${f.filledStreets === 1 ? '' : 's'} with something on ${f.filledStreets === 1 ? 'it' : 'them'}.`} Publishing gives you an address and a number, and you can still edit after.`,
      chips: ['What should I check before publishing?'],
    }),
  },
  {
    id: 'preview',
    match: /\b(preview|walk|how does it look|stranger|test)\b/i,
    answer: () => ({
      text: 'Walk it as a stranger before anything else. You know where everything is, so you are the worst judge of whether it makes sense. The Walk step lets you see it as a stranger, a fan, an insider and the council.',
    }),
  },
  {
    id: 'tier',
    match: /\b(tier|cost|price|pay|upgrade|premium|plan|how much)\b/i,
    answer: (f) => ({
      text: `You are on the ${f.tier} tier. Lite gives you the whole builder and all the stock. The paid tiers add me as a chat and a guide while you build. Nothing about your world is locked behind a tier, only how much help you get.`,
    }),
  },
  {
    id: 'rules',
    match: /\b(rules|governance|dao|vote|voting|own rules|community)\b/i,
    answer: () => ({
      text: 'Your world, your rules. What the app enforces today is access: who gets past which door, and who may post. Voting and formal governance inside a world are not built. If that is what you want, tell me and I will pass it on properly.',
      offersFeatureRequest: true,
    }),
  },
  {
    id: 'streets',
    match: /\b(street|streets|layout|navigation|structure|page|pages)\b/i,
    answer: (f) => ({
      text: `You have ${f.streetCount} street${f.streetCount === 1 ? '' : 's'}, ${f.filledStreets} with something on ${f.filledStreets === 1 ? 'it' : 'them'}. Streets are the order people meet things in. Three is usually plenty.`,
    }),
  },
  {
    id: 'help',
    match: /\b(help|what can you do|who are you|hi|hey|hello|whatsup|what.?s up)\b/i,
    answer: (f) => ({
      text: `I know what this builder can actually do, and I know your world: ${f.streetCount} street${f.streetCount === 1 ? '' : 's'}, ${f.blockCount} block${f.blockCount === 1 ? '' : 's'}, ${f.published ? 'published' : 'still a draft'}. Ask me anything about building it. If I do not know, I will say so rather than make it up.`,
      chips: ['What blocks exist?', 'How do the keys work?', 'What should I do next?'],
    }),
  },
  {
    id: 'next',
    match: /\b(next|what now|what should i do|stuck|where do i start)\b/i,
    answer: (f) => {
      const beat = MOSHA_BEATS[f.step];
      return {
        text:
          f.streetCount === 0
            ? 'Lay out a street or two first. Everything else hangs off them.'
            : f.blockCount === 0
              ? 'Put something on a street. An empty world is the one thing worth avoiding.'
              : !f.published
                ? `${beat.question} That is the question for this screen.`
                : 'It is live. From here it is about giving people a reason to come back: a countdown, or something new behind the key.',
        chips: ['What blocks exist?'],
      };
    },
  },
];

/**
 * Answer a question, or admit you cannot.
 *
 * Deliberately not a language model. Every sentence above is checked against
 * what the app really does, and a wrong answer here costs an artist an
 * afternoon looking for a button that was never built.
 */
export function askMosha(question: string, facts: MoshaFacts): MoshaReply {
  const q = question.trim();
  if (!q) {
    return { text: 'Ask me anything about building this.', chips: ['What can you do?'] };
  }

  for (const intent of INTENTS) {
    if (intent.match.test(q)) return intent.answer(facts);
  }

  return {
    text: 'I do not know that one, and I would rather say so than guess. If it is something the builder cannot do yet, I can pass it on to the people who build this, with your world and where you are attached so it makes sense to them.',
    offersFeatureRequest: true,
    chips: ['What blocks exist?', 'What should I do next?'],
  };
}

/** The unprompted line when guided mode is on and they finish something. */
export function moshaNudge(facts: MoshaFacts): string | null {
  if (facts.streetCount > 0 && facts.blockCount === 0) {
    return 'Streets are in. Now put something on one, even a single note block. An empty street is the one thing that makes a world look abandoned.';
  }
  if (facts.blockCount > 0 && facts.filledStreets < facts.streetCount) {
    return `${facts.streetCount - facts.filledStreets} of your streets are still empty. Either fill them or take them out, an empty road is worse than a short world.`;
  }
  if (facts.filledStreets > 0 && !facts.gateKind) {
    return 'No key set. That is a real choice, not a missing step. Open worlds grow faster early, gated ones reward the people already there.';
  }
  if (facts.filledStreets > 0 && !facts.published) {
    return 'This is ready to walk. Do it as a stranger first, then publish.';
  }
  return null;
}
