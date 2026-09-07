/**
 * The rules, in one place, with versions.
 *
 * Every acceptance recorded in policy_acceptances points at a version string
 * from this file. That is what makes "by proceeding you agree" mean anything:
 * the app can say which words were on the screen at the moment somebody
 * proceeded, rather than showing today's wording and hoping.
 *
 * Bump the version whenever the substance changes. Do not edit a document in
 * place and leave the version alone, because every prior acceptance then points
 * at wording that no longer exists.
 *
 * Written to be read. Legalese that nobody finishes is not consent, it is
 * decoration, and a court reading it later will notice the difference too.
 */

export const POLICY_VERSIONS = {
  terms: '2026-09-01',
  privacy: '2026-09-06',
  guidelines: '2026-09-01',
  launch_risk: '2026-09-01',
  upload_rights: '2026-09-01',
} as const;

export type PolicyKey = keyof typeof POLICY_VERSIONS;

export interface Section {
  heading: string;
  body: string[];
}

export interface PolicyDoc {
  key: PolicyKey;
  title: string;
  version: string;
  updated: string;
  summary: string;
  sections: Section[];
}

/* ------------------------------------------------------------- the ages --- */

export const MIN_AGE = 13;
export const ADULT_AGE = 18;

/* ---------------------------------------------------------------- terms --- */

export const TERMS: PolicyDoc = {
  key: 'terms',
  title: 'Terms of Use',
  version: POLICY_VERSIONS.terms,
  updated: '1 September 2026',
  summary:
    'SONGCHAINN gives you the tools. What you make, say, upload, launch or buy is yours, and so is the responsibility for it.',
  sections: [
    {
      heading: 'What SONGCHAINN is',
      body: [
        'SONGCHAINN is technology and infrastructure. We host a place where artists put out music and visual work, build worlds, and where an audience listens, talks and collects.',
        'We are not a label, a manager, a publisher, a broker, an exchange, a bank, or a financial adviser. We do not sign artists, we do not choose what they release, and we do not take a position in what anyone buys or sells.',
        'When you use SONGCHAINN you are dealing with other people. We provide the room. What happens between you and them is between you and them.',
      ],
    },
    {
      heading: 'Who can be here',
      body: [
        `You must be at least ${MIN_AGE} to have an account. If you are under ${ADULT_AGE}, some parts of SONGCHAINN are closed to you: private messaging, uploading photographs or video, launching a token, and anything involving money.`,
        'We ask for your date of birth and we hold you to it. Giving a false age is a breach of these terms and we may end the account.',
        'One person, one account, under a name that is yours to use. Pretending to be somebody else, or to represent an artist or company you do not represent, is not allowed.',
      ],
    },
    {
      heading: 'Your work stays yours',
      body: [
        'You keep every right you had in your music, artwork, photographs, video and writing. We do not take ownership of any of it, ever.',
        'You give us permission to host it, store it, stream it, resize it and show it inside SONGCHAINN and in links that point back to SONGCHAINN, so that the app can do the one job you came here for. That permission lasts as long as the work is up, and ends when you take it down, apart from copies in backups that age out on their own.',
        'You promise the work is yours to put up. If you upload something you do not have the rights to, that is your problem and not ours, and you agree to cover us if somebody comes after us for it.',
        'If you believe something here infringes your rights, report it, or write to us. We will look, and we will take down what needs taking down.',
      ],
    },
    {
      heading: 'What other people put here',
      body: [
        'Anything you see on SONGCHAINN that we did not write ourselves comes from another person. We do not check it in advance, we do not endorse it, and we cannot promise it is true, accurate, legal or safe.',
        'That includes music, artwork, video, worlds, posts, messages, comments, artist claims about themselves, and anything anyone says about a token.',
        'If it breaks the rules, report it and we will deal with it. Until somebody tells us, we may not know it is there.',
      ],
    },
    {
      heading: 'Money, tokens and the risk',
      body: [
        'Some parts of SONGCHAINN touch a public blockchain. A song coin, an artist token, a copy of a record: these are things you buy and hold in your own wallet, not with us. We never hold your funds and we never take custody of your wallet.',
        'The value of anything tradeable can fall, including to nothing. There is no guarantee, no floor, no promise of a return, and nothing here is an investment product or investment advice.',
        'Transactions on a blockchain are final. We cannot reverse one, refund one, or recover a wallet you lose access to. Nobody can.',
        'If you launch a token through SONGCHAINN, you are the one launching it. You sign it with your own wallet, you own the result, and you are responsible for what you told people about it and for whatever rules apply where you live. We provide the tool.',
        'We are not responsible for a third party you reach through SONGCHAINN, including a blockchain, a wallet, an exchange, a marketplace, or anyone who buys from or sells to you.',
      ],
    },
    {
      heading: 'Worlds belong to their artists',
      body: [
        'An artist who builds a world sets its rules: who gets in, what is behind which door, and whether visitors can post. We host it. We do not run it.',
        'If you are inside somebody\'s world you are a guest in it, and the artist can decide who is welcome there.',
        'What an artist promises the people in their world is between the artist and those people. We do not guarantee it and we cannot enforce it for you.',
      ],
    },
    {
      heading: 'Behaviour',
      body: [
        'The Community Guidelines are part of these terms. They are short, and they are the actual rules.',
        'If you break them we may warn you, mute you, stop you uploading or messaging, suspend you, or end the account. We will tell you what happened and why, and you can appeal it.',
        'If what you do puts SONGCHAINN, its people, or the people using it at real risk, including legal risk, we may act immediately and explain afterwards.',
      ],
    },
    {
      heading: 'What we do not promise',
      body: [
        'SONGCHAINN is provided as it is. We work hard on it, but we do not promise it will always be available, always be correct, or never lose anything.',
        'We may change features, and we may stop offering some of them. If we are shutting something down that holds your work, we will tell you and give you a way to get it out.',
        'We do not promise an audience, a number of plays, an income, or any particular result from being here.',
      ],
    },
    {
      heading: 'Where the line is on liability',
      body: [
        'To the fullest extent the law allows, we are not liable for anything you lose that we did not directly and unreasonably cause: lost income, lost opportunity, lost data, the value of a token, or what another person did to you here.',
        'Where liability cannot be excluded, ours is limited to the amount you paid us in the twelve months before the claim, or one hundred United States dollars, whichever is greater.',
        'Nothing here limits liability for anything that cannot lawfully be limited, including death or personal injury caused by negligence, or fraud.',
      ],
    },
    {
      heading: 'You cover us',
      body: [
        'If somebody brings a claim against us because of something you put here, something you did here, or a right you said you had and did not, you agree to cover our reasonable costs in dealing with it.',
        'This is the ordinary bargain of a platform that lets people publish. We are not checking every upload, so the person who uploaded it carries it.',
      ],
    },
    {
      heading: 'Ending it',
      body: [
        'You can close your account whenever you like. Your work comes down. Things already on a blockchain stay there, because we cannot remove them and neither can anyone else.',
        'We can end an account for a serious or repeated breach. You will be told why and you can appeal.',
      ],
    },
    {
      heading: 'The law that applies',
      body: [
        'These terms are governed by the laws of the Republic of Zambia, and the courts of Zambia have jurisdiction, without taking away any protection you have under the law where you live.',
        'If a part of these terms turns out to be unenforceable, the rest still stands.',
      ],
    },
    {
      heading: 'Changes to these terms',
      body: [
        'If we change anything that matters, we will tell you in the app and ask you to agree again before you carry on. The version you agreed to is recorded against your account.',
      ],
    },
    {
      heading: 'Reaching us',
      body: ['Write to songchaindao@gmail.com. A person reads it.'],
    },
  ],
};

/* -------------------------------------------------------------- privacy --- */

export const PRIVACY: PolicyDoc = {
  key: 'privacy',
  title: 'Privacy Policy',
  version: POLICY_VERSIONS.privacy,
  updated: '6 September 2026',
  summary:
    'What we hold about you, why, and what you can do about it. We collect what the app needs to work, and not much else.',
  sections: [
    {
      heading: 'What we hold',
      body: [
        'Your account: email address, a display name, a username, and a password we never see in readable form, and how you would like to be referred to, if you tell us. If you sign in with a wallet, Farcaster or Facebook instead, we hold the identifier that service gives us.',
        'Your date of birth, to know whether you are old enough and which parts of the app are open to you.',
        'What you put here: your posts, comments, messages, playlists, uploads and worlds.',
        'What you do here: what you play, like, pulse and collect. This is what powers the charts, your points, and what the app shows you next.',
        'If you connect a wallet, its public address. A public address is public by nature. We never hold a private key or a seed phrase, and we will never ask for one.',
        'Roughly where you are: the city and country your connection resolves to when you play a song, read from the request itself, never from a location permission and never GPS accurate. It powers the activity numbers artists and visitors see on a song page, and cities with only a few plays are grouped as Other.',
      ],
    },
    {
      heading: 'What we do not hold',
      body: [
        'We do not hold your card details. We do not take payments directly.',
        'We do not hold your private keys, your seed phrase, or your funds.',
        'We do not sell your data. We have never sold it and we are not building towards selling it.',
      ],
    },
    {
      heading: 'Why we hold it',
      body: [
        'To run the app: sign you in, show you your things, deliver your messages, keep your place in a song.',
        'To make it work better: what is popular, what people finish, what nobody finds.',
        'To keep it safe: spotting spam, abuse, and people breaking the rules.',
        'To meet a legal obligation, when one applies.',
      ],
    },
    {
      heading: 'Who else sees it',
      body: [
        'Supabase, which hosts our database and handles sign-in. Cloudflare R2, which stores the audio, images and video. Vercel, which serves the app.',
        'Where an artist has a world, that world\'s owner can see who is a member of it.',
        'Anything you post publicly is public. Your display name, your username, your picture and your public activity can be seen by anyone.',
        'We hand data to law enforcement only when we are legally required to, and only what is asked for.',
      ],
    },
    {
      heading: 'The blockchain part',
      body: [
        'When you buy a copy of a song or hold a token, that happens on a public blockchain and it is public forever. Your wallet address, what you hold, and when you bought it can be read by anyone, by us, and by people we have nothing to do with.',
        'We cannot delete anything from a blockchain. Nobody can. If you connect a wallet to your profile you are linking a public, permanent record to your name here, and that is worth knowing before you do it.',
      ],
    },
    {
      heading: 'How long we keep it',
      body: [
        'While your account is open, and for a short while after you close it in case you come back or something needs resolving.',
        'Backups age out on their own within ninety days.',
        'Records we have to keep by law, we keep for as long as the law says.',
      ],
    },
    {
      heading: 'What you can ask for',
      body: [
        'A copy of what we hold about you. Correction of anything wrong. Deletion of your account and what is in it, except things on a blockchain and things we must keep.',
        'To object to us using your activity to shape what you are shown.',
        'Write to songchaindao@gmail.com and we will do it.',
      ],
    },
    {
      heading: 'Children',
      body: [
        `SONGCHAINN is not for anyone under ${MIN_AGE}. If we learn an account belongs to someone younger, we close it and delete what it holds.`,
        `Accounts between ${MIN_AGE} and ${ADULT_AGE} cannot use private messaging, cannot upload photographs or video, and cannot take part in anything involving money.`,
      ],
    },
    {
      heading: 'Where your data lives',
      body: [
        'On servers outside Zambia, because that is where our hosting providers run. By using SONGCHAINN you agree to it being handled there.',
      ],
    },
  ],
};

/* ----------------------------------------------------------- guidelines --- */

export interface Rule {
  key: string;
  title: string;
  body: string;
}

export const RULES: Rule[] = [
  {
    key: 'be_real',
    title: 'Be who you say you are',
    body: 'Do not pretend to be another person, artist, or company. Parody is fine if it is obviously parody.',
  },
  {
    key: 'own_it',
    title: 'Put up work you have the right to put up',
    body: 'Your music, your artwork, your photographs. If you sampled, cleared or covered something, that is on you. Do not upload other people\'s records as your own.',
  },
  {
    key: 'no_harassment',
    title: 'Do not go after people',
    body: 'No targeted abuse, threats, pile-ons, or following somebody around the app to bother them. Disagreeing is fine. Hunting somebody is not.',
  },
  {
    key: 'no_hate',
    title: 'No hate',
    body: 'Nothing attacking people for who they are: race, tribe, nationality, religion, gender, sexuality, disability.',
  },
  {
    key: 'no_sexual_content',
    title: 'Keep it non-explicit',
    body: 'No pornography and no sexual content involving anyone who is or appears to be a minor, ever, under any framing. This one ends an account immediately and gets reported.',
  },
  {
    key: 'no_violence',
    title: 'No violence or real threats',
    body: 'Do not threaten anyone, organise harm, or glorify it. Music that describes hard things is not the same as threatening a person, and we can tell the difference.',
  },
  {
    key: 'no_scams',
    title: 'Do not run games on people',
    body: 'No fake giveaways, no phishing, no pretending a token will go up, no promising returns. If you launch something, tell people the truth about it.',
  },
  {
    key: 'no_spam',
    title: 'Do not flood the place',
    body: 'No mass unsolicited messages, no bot accounts, no gaming plays, points or charts. Play counts are supposed to mean something.',
  },
  {
    key: 'respect_worlds',
    title: 'A world belongs to its artist',
    body: 'If you are in somebody\'s world, their rules apply. If you are asked to leave, leave.',
  },
  {
    key: 'protect_minors',
    title: 'Nothing involving children',
    body: 'Any sexualisation of a minor, any grooming, any attempt to contact a child inappropriately. We report this to the authorities and we do not warn first.',
  },
];

export const GUIDELINES: PolicyDoc = {
  key: 'guidelines',
  title: 'Community Guidelines',
  version: POLICY_VERSIONS.guidelines,
  updated: '1 September 2026',
  summary:
    'Ten rules, not a rulebook. We would rather people made things than read policy, so this is as short as we can honestly make it.',
  sections: [
    {
      heading: 'The rules',
      body: RULES.map((r) => `${r.title}. ${r.body}`),
    },
    {
      heading: 'What happens if you break one',
      body: [
        'Most of the time: a warning that says what happened and why. Most people stop there and that is the point.',
        'If it keeps happening, or it was serious: we may mute you, stop you uploading, stop you messaging, or suspend the account, for a set time or until it is sorted.',
        'For the worst of it, anything involving a child, a real threat, or fraud, we end the account and, where the law requires it, we report it.',
        'You will always be told what rule was broken. "You violated our policies" is not an explanation and we are not going to send you one.',
      ],
    },
    {
      heading: 'If you think we got it wrong',
      body: [
        'Appeal it. There is a button on the notice, and a person reads it.',
        'Tell us what you think happened. If we were wrong we lift it and say so.',
        'One appeal per action. If you still disagree after that, write to us and talk to a person.',
      ],
    },
    {
      heading: 'Reporting something',
      body: [
        'There is a report option on posts, messages, profiles and uploads. It goes to a queue somebody actually reads.',
        'Reporting is not a vote. Ten reports on something that breaks no rule changes nothing, and one report on something serious is enough.',
        'Reporting things falsely to get at somebody is itself a breach.',
      ],
    },
  ],
};

/* ----------------------------------------------- point-of-action consent --- */

/**
 * The short line shown at the moment somebody does the thing, rather than
 * buried in a document they accepted months ago.
 */
export const CONSENT_LINES: Record<string, string> = {
  upload_rights:
    'By uploading this you confirm it is yours to put up, and that you have the rights to everything in it. You keep ownership. You are giving SONGCHAINN permission to host and show it here.',
  launch_risk:
    'By launching this you are the one launching it. It signs with your wallet, you own the result, and you are responsible for what you tell people about it. Value can fall, including to nothing. SONGCHAINN provides the tool and takes no position in it.',
  purchase_risk:
    'By buying this you accept that value can fall, including to nothing, that the transaction is final and cannot be reversed by anyone, and that SONGCHAINN neither holds your funds nor guarantees any return.',
  collect_risk:
    'By collecting this you mint an NFT on Base with your own wallet. You pay the price the artist set plus network and protocol fees, the transaction is final, and SONGCHAINN neither holds your funds nor guarantees any value. What you get is the token and whatever the artist says it opens.',
  key_risk:
    'By getting this key you buy the artist\'s coin on Base with your own wallet, on a market SONGCHAINN does not run. A key is access, not an investment: its price can fall to nothing, the trade is final, and SONGCHAINN neither holds your funds nor guarantees any door stays open if you sell.',
  drop_risk:
    'By making this drop you deploy it with your own wallet and you own the contract. The price, the copies and what holders get are your promises to keep. You confirm the song, artwork or content is yours to sell. SONGCHAINN provides the tool and takes no position in it.',
  messaging:
    'By sending a message you agree to the Community Guidelines. Messages are private between you and the person you send them to, but they can be reported to us.',
  world_visit:
    'This world belongs to its artist, who sets its rules. SONGCHAINN hosts it and does not run it.',
};

export const ALL_POLICIES: PolicyDoc[] = [TERMS, PRIVACY, GUIDELINES];
