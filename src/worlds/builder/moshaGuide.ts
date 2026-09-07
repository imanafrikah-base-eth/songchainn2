/**
 * What Mo$ha asks while an artist builds a world.
 *
 * Not a chatbot. A patient set of questions with real answers attached, because
 * the hard part of building a world is not the software, it is not knowing what
 * is allowed. Most artists arrive assuming a "world" means a landing page with
 * their album on it, and never find out they could have built a radio station,
 * a park, a members' room with its own rules, or a town with a door only their
 * coin opens.
 *
 * So Mo$ha's job on every screen is the same: ask one question, offer real
 * examples, and get out of the way. Their world, their view, their rules. We
 * host it, we do not design it.
 *
 * Every suggestion here maps to something the builder can actually do today. A
 * guide that suggests a feature the app does not have is worse than no guide.
 */

export type BuilderStep = 'name' | 'streets' | 'blocks' | 'key' | 'drops' | 'walk' | 'publish';

export interface MoshaSuggestion {
  /** The shape being suggested, in the artist's language, not ours. */
  label: string;
  /** What it actually is, and why somebody would build it. */
  detail: string;
  /** Blocks in the registry that build it. Keeps the advice honest. */
  blocks?: string[];
}

export interface MoshaBeat {
  /** The one question for this screen. */
  question: string;
  /** Said before the examples, in Mo$ha's voice. */
  opener: string;
  suggestions: MoshaSuggestion[];
  /** The thing artists most often get wrong here. */
  watchOut?: string;
}

export const MOSHA_BEATS: Record<BuilderStep, MoshaBeat> = {
  drops: {
    question: 'Is there something here worth owning?',
    opener:
      'A drop is a thing people keep. Not every world needs one, and an empty shelf is better than a shelf of nothing much. If you make one, make it the thing you would want to hold yourself.',
    suggestions: [
      {
        label: 'One record, small edition',
        detail:
          'The song people ask for, 50 copies, a real price. Scarce enough to mean something, cheap enough that a fan can actually get one.',
        blocks: ['collectibles'],
      },
      {
        label: 'The cover art, open edition',
        detail:
          'Free or nearly free, as many as people want. A way in for someone who is not ready to spend, and a wallet full of your art is a fan who comes back.',
        blocks: ['collectibles'],
      },
      {
        label: 'A key',
        detail:
          'A drop that opens a street. Hold it, walk in. The price of the drop is the price of the door, and you set both.',
        blocks: ['collectibles'],
      },
    ],
    watchOut:
      'The terms go on chain when you mint and do not change after. Read the price and the copies back before you confirm in your wallet.',
  },
  name: {
    question: 'What is this place, and who is it for?',
    opener:
      "Before the name, decide what you are actually building. It does not have to be a page about you. People have built stations, parks and whole towns in here.",
    suggestions: [
      {
        label: 'A radio or TV station',
        detail:
          'Your catalogue on rotation, a schedule, and a room people drop into. Good if you release often and want somewhere that is always on.',
        blocks: ['catalog-list', 'video-wall', 'countdown'],
      },
      {
        label: 'A park',
        detail:
          'Quiet, open to everyone, nothing gated. Somewhere people bring friends. Good if you want reach before you want members.',
        blocks: ['hero', 'gallery-grid', 'note'],
      },
      {
        label: 'A community with its own rules',
        detail:
          'A members’ place where the door is a token you choose. You write the rules, we only host them.',
        blocks: ['story', 'note', 'link-row'],
      },
      {
        label: 'A record, as a place',
        detail:
          'One album, walkable. The story, the artwork, the credits, the people on it. Good for a body of work you want understood, not just played.',
        blocks: ['hero', 'story', 'catalog-list', 'credits'],
      },
    ],
    watchOut:
      'A name people can say out loud beats a clever one. It becomes the address.',
  },

  streets: {
    question: 'How should somebody move through it?',
    opener:
      'Streets are the order people meet things in. Think about the walk, not the sitemap.',
    suggestions: [
      {
        label: 'One street, front to back',
        detail: 'Simplest and often best. Arrive, walk, understand, leave knowing what you are.',
      },
      {
        label: 'A main street and a members’ street',
        detail:
          'Everyone sees the first. The second only opens for people holding the key. The difference is the point.',
      },
      {
        label: 'A street per release',
        detail: 'If you have a catalogue, give each record its own road rather than one long list.',
      },
    ],
    watchOut:
      'Three streets is usually plenty. A world nobody finishes walking is a world nobody remembers.',
  },

  blocks: {
    question: 'What is actually on the street?',
    opener:
      'Fill it with the things only you have. Anybody can put up a player, nobody else has your rooms, your photographs or your reasons.',
    suggestions: [
      {
        label: 'The story behind it',
        detail: 'The thing interviews never get right. Written by you, once, permanently.',
        blocks: ['story'],
      },
      {
        label: 'The work itself',
        detail: 'Tracks, artwork, video. Pulled from what you have already put on SONGCHAINN.',
        blocks: ['catalog-list', 'gallery-grid', 'video-wall'],
      },
      {
        label: 'Something coming',
        detail: 'A date with a countdown on it changes how people treat the place. They come back.',
        blocks: ['countdown'],
      },
      {
        label: 'The people who made it',
        detail: 'Credits, properly. Engineers and features get erased everywhere else.',
        blocks: ['credits'],
      },
    ],
    watchOut:
      'An empty block is worse than no block. If you have nothing for it yet, leave it out and add it later.',
  },

  key: {
    question: 'Who gets in, and what opens the door?',
    opener:
      'This is the part that is yours alone. The key can be your artist coin, one particular song, any tradeable token, or nothing at all.',
    suggestions: [
      {
        label: 'No key',
        detail: 'Open to everyone. Nothing wrong with it. Reach first, rules later.',
      },
      {
        label: 'Your artist coin',
        detail:
          'Holding it opens the door. Rings let you set how much opens how far, so a fan and a founder do not get the same room.',
      },
      {
        label: 'One song',
        detail:
          'Owning a specific record is the key. The people who backed that one thing get somewhere nobody else does.',
      },
      {
        label: 'Any other token',
        detail:
          'A collaborator’s coin, a community token, anything tradeable. Or a token that only means something inside your world.',
      },
    ],
    watchOut:
      'Decide what a person gets, not what they pay. If the only thing behind the door is a link, they will feel it.',
  },

  walk: {
    question: 'Does it hold up when you are not the one looking?',
    opener:
      'Walk it as a stranger first. You know where everything is, so you are the worst judge of whether it makes sense.',
    suggestions: [
      {
        label: 'As a stranger',
        detail: 'Do they understand what this is within a few seconds, with no explanation from you?',
      },
      {
        label: 'As a fan',
        detail: 'Is there a reason to come back, or did they finish it?',
      },
      {
        label: 'As an insider',
        detail: 'Is what is behind the door genuinely worth the door?',
      },
    ],
    watchOut:
      'If a locked room looks empty from outside, nobody tries the handle. Say what is in there.',
  },

  publish: {
    question: 'Ready for it to be real?',
    opener:
      'Publishing gives it an address and a number. You can keep editing after, so this is not the last decision, it is the first public one.',
    suggestions: [
      {
        label: 'Tell the people already here',
        detail: 'Post it to your timeline. The people who follow you find out first, which is the right order.',
      },
      {
        label: 'Leave a way in',
        detail: 'If most of it is gated, keep one thing open so a stranger has a reason to care.',
      },
    ],
    watchOut: 'Your world, your rules. We host it. Nothing here changes without you.',
  },
};

/**
 * Whether Mo$ha should say anything unprompted on this screen.
 *
 * Once per screen per world, then silence. An assistant that reappears every
 * time you look at it stops being help and becomes weather.
 */
export function shouldGreet(seen: string[], worldId: string, step: BuilderStep): boolean {
  return !seen.includes(`${worldId}:${step}`);
}
