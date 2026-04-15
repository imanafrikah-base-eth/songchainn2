import heroBackgroundImage from '@/assets/WaveWarz Africa HEADER HERO MOCKUP.png';
import heroLogoTransparent from '@/assets/WaveWarz Africa music logo transparent.png';
const heroLogoWithBackground = '/wavewarz-africa-background.png';
import onboardingHeroImage from '@/assets/WaveWarz Africa New Page Mock up.png';
import imanAfrikahImage from '@/assets/IMan Afrikah/IMan Afrikah (1).png';
import ndaImage from '@/assets/NDA/NDA (1).png';
import santanaImage from '@/assets/Santana/Santana (1).png';
import sanchyImage from '@/assets/Sanchy/Sanchy (1).png';

export const WAVEWARZ_AFRICA_LINKS = {
  enterBattlez: '/wavewarz-africa',
  watchLiveBattles: '/wavewarz-africa/live',
  quickBattles: '/wavewarz-africa/live',
  learnMore: 'https://subscribepage.io/XFM0pk',
  createBattlez: '/wavewarz-africa/create',
  supportCommunityBattle: '/wavewarz-africa/live',
  launchNextQuickBattle: '/wavewarz-africa/live',
  connectWallet: 'https://phantom.com/',
  solflare: 'https://solflare.com/',
  phantom: 'https://phantom.com/',
  contactEmail: 'wavewarzafrica@songchainn.xyz',
} as const;

export const WAVEWARZ_AFRICA_ASSETS = {
  heroBackgroundImage,
  heroLogoTransparent,
  heroLogoWithBackground,
  onboardingHeroImage,
} as const;

export type CountryRolloutState = 'live' | 'coming-soon';

export interface CountryRolloutItem {
  country: string;
  state: CountryRolloutState;
}

export const WAVEWARZ_COUNTRY_ROLLOUT: CountryRolloutItem[] = [
  { country: 'Zambia', state: 'live' },
  { country: 'South Africa', state: 'coming-soon' },
  { country: 'Nigeria', state: 'coming-soon' },
  { country: 'Zimbabwe', state: 'coming-soon' },
  { country: 'Botswana', state: 'coming-soon' },
];

export interface BattleCardItem {
  id: string;
  status: 'live' | 'upcoming';
  title: string;
  subtitle: string;
  artistA: string;
  artistB: string;
  artistAImage: string;
  artistBImage: string;
  ctaUrl: string;
}

export const WAVEWARZ_BATTLE_CARDS: BattleCardItem[] = [
  {
    id: 'battle-live-iman-nda',
    status: 'live',
    title: 'IMan Afrikah vs NDA',
    subtitle: 'Live now: high-volume token battle from Zambia.',
    artistA: 'IMan Afrikah',
    artistB: 'NDA',
    artistAImage: imanAfrikahImage,
    artistBImage: ndaImage,
    ctaUrl: WAVEWARZ_AFRICA_LINKS.quickBattles,
  },
  {
    id: 'battle-upcoming-santana-sanchy',
    status: 'upcoming',
    title: 'Santana vs Sanchy',
    subtitle: 'Upcoming: Afro energy vs late-night atmospheric sound.',
    artistA: 'Santana',
    artistB: 'Sanchy',
    artistAImage: santanaImage,
    artistBImage: sanchyImage,
    ctaUrl: WAVEWARZ_AFRICA_LINKS.quickBattles,
  },
  {
    id: 'battle-upcoming-nda-santana',
    status: 'upcoming',
    title: 'NDA vs Santana',
    subtitle: 'Upcoming: dark sonic edge against crowd-lifting anthems.',
    artistA: 'NDA',
    artistB: 'Santana',
    artistAImage: ndaImage,
    artistBImage: santanaImage,
    ctaUrl: WAVEWARZ_AFRICA_LINKS.quickBattles,
  },
];

export const WAVEWARZ_HERO_STATS = [
  { label: 'Upcoming Battles', value: '12', href: '/wavewarz-africa' },
  { label: 'Past Battles', value: '84', href: '/wavewarz-africa/results' },
  { label: 'Zambia Active', value: 'Live', href: '/wavewarz-africa/live' },
] as const;

export interface RoleOnboardingItem {
  key: 'trader' | 'artist' | 'host';
  title: string;
  copy: string[];
}

export const WAVEWARZ_ROLE_ONBOARDING: RoleOnboardingItem[] = [
  {
    key: 'trader',
    title: 'Trader',
    copy: [
      'Connect your wallet.',
      'Open a live battle and buy/sell tokens while the timer runs.',
      'When it ends, press Withdraw to claim your SOL.',
    ],
  },
  {
    key: 'artist',
    title: 'Artist',
    copy: [
      'Upload music to audius.co.',
      'Connect your wallet on desktop/laptop (this flow does not work on mobile).',
      'Create Quick BattleZ, connect your Audius profile, then queue tracks.',
      'Payouts: 1% of every trade on your music. Win bonus: 5%. Lose bonus: 2%.',
    ],
  },
  {
    key: 'host',
    title: 'Host',
    copy: [
      'Connect your wallet.',
      'Go to Community BattleZ and launch a battle (you will approve a few transactions).',
      'Tell your audience to press Withdraw when the battle timer ends.',
    ],
  },
];

export const WAVEWARZ_BATTLE_RULES: string[] = [
  'Two artists compete (Artist A vs Artist B).',
  'While the timer runs, people buy and sell tokens for either side.',
  'When the timer hits zero, the side with more SOL behind it wins.',
  '40% of the losing pool moves into the winning pool.',
  'Winning token holders split the winning pool based on tokens held.',
  'Losing token holders split what is left based on tokens held.',
  'Final step: press Withdraw to receive your SOL.',
];
