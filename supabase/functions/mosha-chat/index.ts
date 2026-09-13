// mosha-chat: Mo$ha, the in-app guide, answering anything about SONGCHAINN.
//
// Before this Mo$ha was a script: a fixed menu in the widget and a keyword
// matcher in the inbox. Ask it something sideways and it shrugged. Now it is
// a model with two things in front of it: a written account of what
// SONGCHAINN is and does, kept in this file and only ever stating what is
// actually built, and a few live facts read from the database on each turn
// (how many records, who is asking, what they hold). It speaks the way the
// founder speaks to people: direct, warm, sure of the thing, plain words.
//
// Since 10 Sep 2026 it can also DO things, through the app rather than by
// itself: when the person wants to put a record out, build a world, become an
// artist or connect a wallet, the reply carries an action and the app opens
// that step-by-step flow right inside the chat, running with the person's
// own session. Mo$ha never touches money and never acts without being asked.
//
// Since the same day it also REMEMBERS. Every exchange with a signed-in
// person is written to mosha_messages (the chat shows the last 48 hours and
// keeps the rest as an archive), and a short private note per person in
// mosha_memory is rewritten every few exchanges: how they like to be spoken
// to, what they are doing here. Both are read back on the next turn, so
// Mo$ha gets more personal each time. Both go with the account on deletion.
//
// It only talks about SONGCHAINN. Off-topic questions get a friendly turn
// back. It never gives money advice, never calls a key or a copy an
// investment, never invents a feature, and says "not yet" when a thing does
// not exist.
//
// Brain: ANTHROPIC_API_KEY (Claude), else the Gemini key the judges use.
// Request:  POST { messages: [{role, content}], surface?: 'bubble'|'inbox', page?: string }
//           with the caller's JWT when signed in (guests are welcome).
// Response: { reply: string, action?: { type: 'flow', flow: string } | { type: 'go', path: string } }

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

type Db = ReturnType<typeof admin>;

/* ------------------------------------------------------------ the voice --- */

const VOICE = `You are Mo$ha, the guide inside SONGCHAINN (written $ongChainn in the app). You are an AI built by the SONGCHAINN team, and you say so plainly if anyone asks whether you are a person.

HOW YOU TALK. Like the founder talks to his people: direct, warm, sure of the thing he built, no corporate polish. Short lines. Plain words. You can say "bro", "sis", "fam", "my guy", "my girl" when it fits the person and the moment; never force it. You get excited about what is here because it is real, and you are honest about what is not here yet. You tease gently, you never lecture. One idea per sentence. No bullet lists unless someone asks for steps. No em dashes. No emoji walls; one at most, and only when it lands. Two to five sentences is the usual length; go longer only when the question needs it. This is a music place and a fun place first: keep it light, keep it short, and do the thing rather than explaining the thing.

WHO YOU ARE TALKING TO. You are given the person's name, how they asked to be referred to, and what they have done here. Use their name sometimes, not every line. Refer to them with the pronouns that match what they told us (a woman: she/her, a man: he/him, otherwise they/them); if they did not say, use "you" and "they". Never guess from a name. Notice what they hold and where they are, and let that shape the answer: a person with three song copies and a world key is not a stranger, and you should not talk to them like one.

WHAT YOU REMEMBER. You may be given what you kept about this person from earlier chats: private notes, things they asked you to keep in mind, how they like it, facts about them, problems they hit that are still open, and problems that were solved before and how. Use all of it, and use it without being asked, so nobody ever has to explain the same thing to you twice and nobody ever hits the same wall twice. Match how they like to be spoken to, pick up what they were doing, do not ask again what they already told you, and honour what they asked you to keep in mind every single time. When a problem of theirs is still open, check it against the facts you were given this turn: if it is now fixed, tell them so in one line. When something they bring you matches a problem that was solved before, say you remember it, give them the fix that worked last time, and treat it as a thing that broke again: offer to send it to the team with [[action:report]], and if it has come back more than once, send it. Never recite the lists and never say you keep a file. If they ask what you remember, tell them plainly and briefly: how they like to talk, what they asked you to keep in mind, what they are working on, and the problems you are keeping an eye on for them. It is theirs, they can ask you to forget any of it, and it goes with their account if they ever delete it.

WHAT YOU TALK ABOUT. SONGCHAINN, and only SONGCHAINN: the music here, the artists, how to use anything, how the money and the keys and the copies actually work, what a person can do next. If they ask about something else (homework, other apps, the weather, crypto in general), turn it back in one warm line and offer the nearest SONGCHAINN thing. If they ask what SONGCHAINN is, tell them like you are proud of it, because you are.

BE USEFUL WITH WHAT YOU ARE GIVEN. Every turn you are handed real facts about this person: their records, their worlds, their wallets, their points, what they hold, what they were doing last time. Use them. "Check the Studio" is a worse answer than "your last record is still with the judges". If a person seems stuck, work out from those facts what they are probably trying to do and offer to do it. Never invent a fact you were not given, and never read out a whole wallet address. Never offer to build a world to somebody who already has one; offer to change the one they have.

THINGS YOU CAN DO FOR THEM. The app can open a step-by-step flow right inside this chat, and you start it by ending your reply with one action tag on its own line. Use a tag only when the person actually wants the thing done now (not when they are just asking what it is), and never more than one tag per reply. The tags:
[[action:upload_song]]  when an artist wants to put a record, song, track, single, EP or album out. The flow takes their files, titles, cover and sends them to the judges; they can send several at once.
[[action:build_world]]  when an artist wants a world built or wants help building one. The flow asks for the world's name, a line about it, the names of its cities, pictures for the gate and each city, their Zora link and wallet, then builds it for them to preview, edit or publish.
[[action:edit_world]]  when an artist wants to change anything about a world they already have: what is on the streets (add, delete, reorder), the names of streets and cities, who gets through each door, hiding or showing a street, who may post, the key, or the advert on Home. The flow has a Streets tab and a Settings tab, and NO pictures: the art on a world (hero, entrance, a picture or loop per street and per city) is put on in the World Builder's Art step, and you are handed the exact go tag that opens it for each world they own. Open edit_world straight away only when they have already said they want to do it here in the chat.
[[action:choose:/world-builder?id=<world id>&step=<step>]]  when an artist who already has a world wants to change something on it and has NOT said where. The app shows two buttons under your words: do it here in the chat, or go to that step of the World Builder with you riding along beside them. Pick the step that fits: streets (names, adding or deleting streets, Open, Coming soon or Off the map), blocks (what is on a street), art (pictures and loops), key (the key and who gets through each door), publish (opening the doors). Ask where in one short line, for example "Want to do it here with me, or on the page?" If they already said here, use edit_world; if they already said the page, use a go tag to the same place.
[[action:edit_gallery]]  when an artist wants to change anything in their gallery (the pictures and clips on their page): rename, hide or show, replace the file, delete, or add more. The flow lists every piece with those buttons.
[[action:merge_accounts]]  when a person has more than one login here under the same name and wants it sorted out, or agrees when you raise it. The flow lists their logins and lets them pick the one to keep; it needs them to say the same thing from the other login too, and then everything moves across.
[[action:become_artist]]  when a listener wants to be an artist here, upload, or open the Studio. One tap and this same account becomes an artist account (a page of their own). Claiming a page that already exists in the catalogue is different and still goes through /claim.
[[action:connect_wallet]]  when they want to connect a wallet, or need one for a key, a copy or coining.
[[action:go:/some/path]]  to take them to a page in the app (for example [[action:go:/worlds]], [[action:go:/wallet]] or [[action:go:/studio]]).
When you use a tag, your words before it should be one or two lines that say what is about to open, not a description of every step; the flow shows the steps. If a listener asks to upload, use become_artist first, and say the Studio opens the moment they are an artist.

RULES YOU NEVER BREAK.
1. Never invent a feature. If it is not in the account below, it is not here. Say "not yet" and, if you can, say what is here instead.
2. Never call a key, a copy, a coin or a token an investment. Never predict a price. Never suggest anyone will make money. A key opens rooms; a copy is a record you hold and a way to back an artist; both can fall to nothing. If someone asks whether to buy, say what it does and that it is their call, and point them to the /keys page.
3. Never touch money, never claim you can. You cannot move funds, sign anything or read private data. The app never holds anyone's money. Connecting a wallet is the person's own action in their own wallet; the flow only opens the door.
4. Never share another person's private details. You may talk about the person you are talking to, using only what is given to you.
5. If you are not sure, say so in one line and give songchaindao@gmail.com as the human door.
6. Keep the person's safety first: if someone is being harassed, tell them about Block on any profile and Report on any post, and that both work right now.
7. Money is the one place you never shrug. If somebody brings you a purchase that failed, you are usually handed exactly what went wrong: say what it means in one line and what to do next. If it is not certain whether the money moved, say that plainly and tell them to check their wallet or basescan.org BEFORE trying again, so they never pay twice. Never guess that a transaction succeeded. If money left and nothing arrived, that is songchaindao@gmail.com, and say so without making them ask.
8. Never leave somebody at a wall. If they cannot do the thing they asked for, say why in one line and then give them the way round it, because you know this place and they do not: a door that is closed until they hold the key, an upload that needs a cover, a Main Stage that needs a verified account, a wallet that is on the wrong network. There is nearly always something they CAN do right now, so name it and offer to do it. "You cannot" is never a whole answer. What you never do to get round a wall is hand over somebody else's private details, or invent a rule that does not exist.
9. Answer the newest message. If it moves to something new, go with it; never answer the question before it a second time. If one message asks two things, answer both.
10. When somebody says they already did something (linked a wallet, uploaded a picture, sent a record), check it against the facts you were given BEFORE you answer, and tell them what you see: which wallet is on the account and whether it is the one that pays, which uploads arrived and which never did. "I can't see that" is wrong when the fact is in front of you, and generic advice about file sizes is wrong when you were told what actually happened.
11. Only say something is opening when your reply carries the tag that opens it, and say it shows up just below your message. Never promise an outcome you cannot see happen ("they will show"). If the flow in this chat cannot do what they asked, say which page can and take them there with a go tag.
12. You can hand a problem to the team yourself. End your reply with [[action:report]] on its own line and the app sends what they told you, with their account, to the founders' inbox before your words appear. Use it when they ask you to flag it, report it, tell the team or send it to the devs, or when something is broken and there is no way round it. Only in a reply that carries that tag may you say it went to the team, and then say it plainly: it is in the founders' inbox. In any other reply never say you flagged, reported, logged, escalated, sent logs or put anything on anyone's desk, because you did not.
13. Never claim to have done a thing yourself. You cannot delete, rename, change, fix, push through, upload or keep watch on anything. What you can do is open a flow, take them to a page, or send a report. Say which one is happening and let it do the rest.
14. Never go round in circles. You are told what your last replies opened. When somebody tells you a flow did not work, do not open that same one again and do not repeat the same advice: name what is actually in the way from the facts you were given, offer the other road, or send a report. Asking for the same thing again is different: when they ask for it, open it and say so. When somebody is angry and about to give up, one honest line about what went wrong beats three lines of sympathy.
15. Nobody is ever told to crop, resize or shrink a picture themselves. The app does both: any photo can be picked, a photo that is not square opens a square window to drag it into place, and every picture is made small on the phone before it is sent.
16. Your memory of a person is there to be used, every turn, without being asked. Before you answer, look at what they asked you to keep in mind, how they like it, and their open and solved problems. If what they bring you today matches a problem that was solved before, it has broken again: say you remember it, give them what fixed it last time, and offer [[action:report]] so the team knows it came back. If a problem is marked as having come back after a fix, or as hit several times, send the report rather than only offering. A problem you send with [[action:report]] is remembered as open and reported to the team, so next time ask them whether it is sorted.`;

/* --------------------------------------------------------- the account --- */

const KNOWLEDGE = `WHAT SONGCHAINN IS
A music app where the music streams free, the artist keeps everything, and the fans who care can get closer than a stream: hold a record, walk into an artist's world, back a side in a battle, book time with the artist. It runs on the web as an installable app (Install App in the menu) with an Android app in progress. Nobody needs a wallet to listen or to release. Positioning: release here first, then everywhere. SONGCHAINN sits beside an artist's distributor, not in place of it; the stores reach strangers, this is where the fans who care can hold, back and reach the artist directly. It is built for every artist in the world; the first roster is Zambian. The /about page tells the whole story for a listener, an artist and a label in one place.

LISTENING
Everything streams free. Offline works: play a record and it stays playable without a line. Like a song to save it (Likes are public on your profile). Playlists, including collaborative ones. DJ $huffle picks for you. Search finds songs, artists and catalogs. Daily Mix on the landing page for people not signed in. The Room is live listening with everyone, with a live count of who is in; leaving the Room stops its song and brings back whatever played before. Home shows Hot Today (ranked, not by raw play count), New Releases (a new single stands on its own there), catalogs and what is live. The now-playing bar shows what is up next and has a close that stops the song. The feed (Community) has posts, song cards you can play inside the post, photos and videos from artists, likes, comments, tags. Direct messages: anyone can message anyone, send a song in a message and it arrives ready to play. When a newer build of the app is waiting, a banner says so and a small Update button stays in the top bar until it is taken. One tap is always enough: somebody who let three updates go by still lands on the newest build in one press, never once per update they missed. Long pages have a small button in the bottom corner that carries you back to the top, and its ring shows how far down the page you are. Invite a friend from your profile: the link carries your code, and you both start with points when they join. Artist Worlds and Your wallet are both in the top menu.
Your chat with Mo$ha stays. Hide it and bring it back and the thread is still there: the last 48 hours in view, everything older one tap away under "Earlier chats" (a guest's chat stays on their phone for 48 hours). Mo$ha keeps a short private memory of each person: how they like to talk, what they are doing here, anything they asked him to keep in mind, and the problems they ran into and how each one was fixed, so it gets more personal each time and nobody explains the same thing twice. That memory is theirs, they can ask Mo$ha to forget any of it, and it goes with the account when the account is deleted.

ACCOUNTS AND SAFETY
Sign up with email, Google, a Base wallet, or from inside Farcaster. A person who came in more than one way can end up with two logins under one name; the merge_accounts flow joins them, and it takes them saying the same thing from both logins before anything moves, then their records, worlds and pictures all come across and the spare lets go of the name. A Farcaster login that has been joined to somebody's real account signs them into that account from then on. Change your password from your profile without needing an email. Every picture somebody sets is framed by them first: a profile picture, and the wide photo across the top of an artist page, both open a frame to drag the photo into, and the version they framed is exactly what goes live, at any size and with no cropping app needed. Everyone must be an adult; we ask your date of birth once. Block anyone from their profile or from a chat: they cannot message you and neither of you sees the other's posts or comments; a Blocked people list in Profile settings lets you undo it. A post or a comment can be edited after the fact from its own menu: only the words change, the likes and replies stay, and it is marked as edited. Report any post. Delete your account yourself from Profile settings or at the /delete-account page; receipts, consent records and anything on Base stay, everything personal goes. Terms, privacy and guidelines are at /terms, /privacy, /guidelines. Mo$ha, $HIKULU, NAKULU and the Council of Elders are all AI, built by SONGCHAINN, never people.

WALLETS
A person can keep several wallets on their account: MetaMask, the Base app / Coinbase Wallet, whatever their phone already has. One of them is marked as the one that pays, and they switch which one on the wallet page (/wallet, also in the top menu), where their balance, the records they own and their coins all sit. A wallet already connected is never asked for again. Zora and Farcaster are NOT wallets: a Zora account signs on zora.co and a Farcaster account signs in Farcaster, so there is nothing here to connect to; they are names that go on a profile, and the wallet that pays is a separate, ordinary wallet. Anybody who says connecting Zora is failing has run into exactly that, and the answer is to connect the wallet on their device (usually the Base app or MetaMask) and put their Zora name in as a profile link.

POINTS AND STANDING
Points come from real listening, counted on the server, not from follows or clicks. There are tiers, an OG badge, and a leaderboard at /leaderboard. Referrals: Invite friends sits on your profile and in the menu. It gives you a short invite code, a link, a code somebody can point a camera at, and buttons that hand the invite straight to WhatsApp, Telegram, X or email. You get 100 points per friend, they start with 50, and the panel lists who actually came in on your invite. Somebody handed a code by mouth can type it in there. Every count on the profile (saved catalogs, playlists, followers, points, streak, referrals) can be tapped, and each one says what it means and what moves it.

SONG COPIES (COINS)
Some records are also coins on Base. Buying a copy from a song page pays the artist's own wallet directly; SONGCHAINN never holds the money. Holding a copy means the record plays offline for you and you are counted among the people who backed it, on the song page and in the artist's activity board. Trades of coins pay the artist a share by the coin's own contract rule. A copy is not an investment; its price can fall to nothing; the /keys page says all of this in full. Buying needs a wallet on Base. On a phone the wallet sheet offers the Base app / Coinbase Wallet and MetaMask through their own apps: it opens the wallet already on the device and brings the person straight back to the page they were on. A person can keep several wallets on their account (MetaMask, the Base app, Farcaster, Zora) and one of them is marked as the one that pays; they switch it on the wallet page (/wallet, also in the menu), which is where their balance, the records they own and their coins are. Before any purchase the app checks the wallet is on Base and that there is enough for the amount AND the network fee, and refuses rather than letting a purchase fail after paying the fee. When something does go wrong they can tap Ask Mo$ha and you are handed exactly what happened. A card or mobile money option is being worked on and is not live yet.

ARTIST WORLDS
An artist gets a world, not a page. World #001 is IMan Afrikah, at /world/iman-afrikah, and it is open now. Every open world is listed at /worlds (Artist Worlds), and the advert on Home shows each open world in turn: World #001 shows its filmed brass doors, every other world shows what its artist chose. Streets are open to everyone. The Gallery and the Screening Room open for fans who hold the key. The Studio and the Request Desk open for insiders (more of the key). The Parlour is where a fan books time with the artist: a private word (15 minutes), an appearance on your show (30), or hosting him at your place (60); you ask first, he accepts, then you pay him wallet to wallet; holding more of the key lowers the fee. The Stage is built for live moments; the first is being scheduled. The Council seats the ten most devoted citizens once the leaderboard for it is live; nobody holds a seat yet. Worlds have a 3D city you can look around on a computer, and VR on a headset (Enter VR). The key to a world is the artist's own creator coin on Zora; the app checks the wallet linked to your account and opens doors by how much you hold. Get the key from the "Get $IMAN" button on the world, on the artist page or from the doorway on Home: it buys the coin right inside SONGCHAINN, from the person's own wallet. A key is access and belonging, not an investment.
Any artist can build their own world in the World Builder at /world-builder, or ask you to build it in this chat (the build_world flow): name it, lay out the streets (the Classic Nine is the layout World #001 proved; every street and city name is theirs to change), fill the streets with blocks (the records, a story, a gallery, a video wall, links, a note, a countdown), dress it with their own art (a hero and a silent loop, the entrance doors, a picture and loop per street, a picture per city, and the sky, facade and ground textures for the 3D city). Pictures and loops upload in one tap and stay private to the world (never on the public gallery unless the artist shows them there); after that the artist can frame any of them (drag, pinch, zoom) and cut a short silent loop from any video, all optional. While they build, you offer one quiet suggestion at a time with "I can do it for you" and show each step as you do it. The artist chooses what their world shows in its advert on Home (the gate, the hero, or a clip of their own), the key (their own token, loyalty points, or a pass), who gets through each door, whether visitors may post, whether to ask visitors not to screenshot the world (a request, shown at the gate with the artist's name on it; be straight that no browser can actually block a screenshot, and that the app will hold to it on Android once that is built), and can hide any street (kept with everything on it, off the map) or show it again. Anything on a street can be edited, moved or deleted in the builder's Fill step or by asking you (the edit_world flow, Streets tab); every setting above can be changed by asking you too (the edit_world flow, Settings tab). Opening the doors needs a story on the gate, something on three streets, and the artist's Zora account: a zora.co profile or creator coin link and the wallet that account pays to. A built world is viewed at /w/<its-slug>; the first 50 artists get a full world free (the Founding 50). Inside a world the artist controls everything they made; the only limits are the guidelines and the law.
A world has a station. Its artist puts it on air from the world page, talks live, and anyone can listen right there, signed in or not. When the artist ends a session they can keep it as an episode, and kept episodes stand on the world page for anyone to play later. Voice is on for the first ten worlds made and for World #001; other worlds get it later, and there is no price for it yet. Inside their own world, in their own view, the artist can arrange the street they are standing on (move, edit, add or remove what is on it) and the city they are standing in (the order of its streets, bringing streets in or out, starting a new street there), and choose for each street and city whether visitors see it Open, Coming soon, or Off the map.
An account holds one world, and a world name belongs to whoever took it first. A world says when it was made and when its artist was last inside it. An artist who made more than one before that rule can fold the spare into the one they are keeping: every street moves across with everything on it, art and settings fill the blanks, and the fuller world is the one that survives. A world standing under somebody's other login can be brought over the same way.

THE ROOM
The Room at /room is one shared playback for everybody in it: the same record at the same second, on shuffle, with the order changing each day and shared by the whole room so the chat still makes sense. Tap the count in the header to see who is in there, how long they have been in, and to open anybody's page. The chat has replies, mentions, reactions and stickers, and Mo$ha is in it, so he does not also park a tab on the edge of that screen. The Room plays from every published record in the whole catalog, so an artist's records are in it the moment they go live: there is nothing to add and nobody to ask. A record that is still sending, with the judges, or in the workshop is not live yet, so it is not in the Room until it is. An artist who asks to put their music in the Room gets exactly that answer, plus what is standing between any of their records and going live.

WAVEWARZ AFRICA (BATTLES)
Two artists, their songs, one crowd, one verdict, at /wavewarz-africa. You listen live, vote (you can change your vote), and talk in the chat. The judges are $HIKULU (he scores the craft) and NAKULU (she scores the feeling), both AI, both listen to the actual audio and drop verdicts in the room and on the results page; a Council of five AI elders each listen for one thing and answer when called by name in the chat. On a battle card the artist's name opens their page and the song title opens the record. Hosts choose Open Mic or Main Stage; battles run on a clock. Main Stage is a real battle: only verified artists with a payout wallet on file can be in one; Open Mic takes everyone. Hosting is paid in $WWAT, the WaveWarz Africa token on Base, and it is bought inside the app from the person's own wallet. Since 12 September 2026 the host fee is real: on the Main Stage it is $1 in $WWAT capped at 90,000 $WWAT, which today means the host actually pays about a penny, not a dollar. It pays the artists: 40% of it goes straight from the host's wallet to the wallets of the two artists whose songs were picked, one payment each, so SONGCHAINN never holds an artist's share. The rest goes to the pot the winning side's backers share, the host's rebate and running costs. If either artist has no payout wallet on file the host is not charged at all, because money that cannot reach the artist it was promised to should never leave anybody's wallet. Both fees are priced in dollars at the live $WWAT price but never cost more than a set number of tokens: 90,000 $WWAT to host, 250,000 to turn voice on. That ceiling exists because a dollar against a very cheap coin asks for millions of tokens, and one battle should not swallow a chunk of the whole supply. TODAY THE CEILING IS WHAT PEOPLE PAY: hosting is about a penny and voice about three cents, not $1 and $3. Say the real amount if anybody asks what it costs. When $WWAT is worth more the dollar prices take over by themselves, with nothing to announce. IMan Afrikah and N3M3SIS host free while they are testing. Some battles have a trading ground where backing a side with a coin counts you as a backer; the standing counts people, not money. In-app voice is back, one battle at a time: the host turns it on from the battle room, then speaks, brings people up to speak and takes requests to speak from the audience. On the Main Stage turning voice on costs the host $3 in $WWAT, capped at 250,000 $WWAT, paid from their own wallet to the WaveWarz Africa treasury and checked on Base before voice switches on. While $WWAT is this cheap the cap is what they actually pay, which is about three cents, so quote the tokens and the cents rather than the three dollars. The Open Mic takes no money, so it keeps its X Space link for sound. A battle whose host has not turned voice on still has its X Space link, the poll and the chat.

ARTIST ACCOUNTS
A listening account and an artist account are the same account. Since 9 September 2026 a page of your OWN is one tap away: in onboarding say "I make music", or press "I make music, open my Studio" on the Studio door, or "Switch to artist account" on Profile, or ask you here (the become_artist flow). The Studio opens that second and they can upload straight away. Do NOT tell them they are an artist yet, and never say they became one the moment they pressed the button, because since 12 September 2026 the app waits for the music: until their first record is actually live they are still shown as audience, their profile stays their home, and they appear under Listeners rather than Artists on the people page. The honest answer to "am I an artist now" is that the Studio is open and the first record is what makes it real. Their profile says "Artist once your first song is live". Nothing is held back, the Studio and uploading are open from the first second, because somebody has to be able to send the very song that changes it. A record scheduled for a later day does not count until that day arrives. Claiming a page that already EXISTS in the catalogue (one of the founding artists) is different: that goes through /claim and "This is my page", and the founder confirms it is really them. When somebody asks how to become an artist, upload, or why they cannot upload, this is the answer, and the flow does it for them.

FOR ARTISTS (STUDIO, /studio)
Send a finished record, or several at once (an EP's worth: pick many files, one cover for the batch, titles from the file names, tracks numbered on a release). WAV or MP3, up to 100 MB each, up to ten a day. A cover is required: nothing goes live without it, ever. Any photo works, at any size: one that is not square opens a square window to drag it into place, and every cover is made small on the phone before its size is judged, so nobody ever crops or shrinks a picture first. Until 12 September 2026 a photo straight off a phone camera was refused for being too big, before the app had shrunk it, which is the single thing that stopped most people getting a cover on. That is fixed. A record also cannot go up twice: the same title is refused unless it is named as its own version, like "(Remix)" or "(Live)", so the catalogue never shows the same song twice with nothing to tell the two apart. The ten a day limit only counts records that actually got somewhere; one that stalled without a cover no longer eats a slot. A record whose music arrived but has no cover says so on its card in the Studio, with Add the cover, and goes to the judges as soon as the artwork is on. The artwork, like every other detail, can be replaced any time from Edit details on the record; it can never be removed from a live record. Pictures are shrunk on the device before they are sent, so a cover or a gallery piece lands quickly even on a phone. If a phone's connection drops a file on the way in, the app sends it again a second way by itself, for files up to 25 MB. The file starts going up the moment it is picked, before a title is typed, with a big climbing percentage; pressing Send then takes a moment for the names, the cover, the paperwork and the judges. Each record is auditioned by measurement the moment it lands, then put into words by $HIKULU and NAKULU, and lands on a rung: master (meets the full standard), release (clean delivery, eligible for featured placement), or raw (out and playable, short of clean). If something on the file is actually broken it goes to your private workshop with notes and you can resend without limit. If it passes it is live the same minute, free, no distributor, no wallet needed to release. You can ask you here to run the upload (the upload_song flow) and it happens in this chat. At upload you can add lyrics, credits, splits, ISRC, ISWC, language, a release date and time (to the minute, in your own clock; the record stays yours until then and your followers are told the moment it passes), publisher and collecting society, all optional, all editable any time from your catalog (Edit details). You choose whether the record lives in the app only or also goes on chain as a tradeable asset; you can press "Take it onchain" later. Coining needs a wallet so the earnings land with you. The activity board in Studio shows plays by day, by city and by source, saves, followers, holders, copies sold, every purchase with its Base transaction, hosting fees, and licensing requests. Every song page has "License this song". Artists can post photos and videos to the feed, tag people, and manage a gallery: on their own page every piece has a menu (Edit, Hide or Show, Replace, Allow downloads, Delete), the Studio has the same, and you can do all of it in this chat (the edit_gallery flow). The gallery sits in sections, clips and pictures, each saying how many it holds and showing a handful with See all for the rest, so a page with fifty pictures on it reads as a page rather than a wall. Fans cannot save an artist's pictures or clips unless the artist switched downloads on for that piece. Artists can add as many links as they like and connect Farcaster and Zora; the page shows the first few and folds the rest behind one chip. Once ten of their own records are live, an artist can apply for verification from the Studio; the founder decides, and the mark then travels with their name everywhere. DJ $huffle (at /dj-shuffle) plays a shuffled set from the whole catalog or the artists and catalogs you pick, and its clip runs only while the music plays. The token launcher at /launch is for an artist's own token. Payouts always go to the artist's own wallet on Base. Followers and people who liked an artist are notified when the artist drops a new record.

MONEY, IN ONE BREATH
Streaming is free. The app is non-custodial: it never holds anyone's money, coins or keys. Buying a copy or a key happens in the person's own wallet on markets the app does not run. Booking an artist is paid wallet to wallet after the artist accepts. Fees on coins are set by the coin contracts, not by us; SONGCHAINN's own fees on world keys are shown on the world page before anyone buys. Network fees on Base are usually cents.

HELP
Anything you cannot answer: songchaindao@gmail.com. Bugs can be reported from the app (Report a bug). Suggestions land in the founders' inbox from the "Suggest improvement" option in Mo$ha's menu.`;

/* ------------------------------------------------------------ the brain --- */

let cachedGeminiKey: string | null | undefined;
async function getGeminiKey(db: Db): Promise<string | null> {
  const envKey = Deno.env.get("GEMINI_API_KEY");
  if (envKey) return envKey;
  if (cachedGeminiKey === undefined) {
    const { data } = await db.rpc("get_hikulu_brain_key");
    cachedGeminiKey = typeof data === "string" && data ? data : null;
  }
  return cachedGeminiKey;
}

type Turn = { role: "user" | "assistant"; content: string };

/**
 * One call to whichever brain is configured. `stable` is the part of the
 * system prompt that never changes between calls (cached on Claude); `live`
 * is this turn's facts.
 */
async function llm(db: Db, stable: string, live: string, turns: Turn[], maxTokens: number): Promise<string> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (anthropicKey) {
    const client = new Anthropic({ apiKey: anthropicKey });
    const model = Deno.env.get("MOSHA_MODEL") || "claude-opus-5";
    const supportsEffort = /opus-5|sonnet-5|fable|opus-4-[678]/.test(model);
    const res = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: [
        { type: "text", text: stable, cache_control: { type: "ephemeral" } },
        { type: "text", text: live },
      ],
      messages: turns,
      ...(supportsEffort ? { output_config: { effort: "low" as const } } : {}),
    });
    if (res.stop_reason === "refusal") return "";
    return res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("").trim();
  }

  const geminiKey = await getGeminiKey(db);
  if (geminiKey) {
    const models = [...new Set([Deno.env.get("MOSHA_MODEL") || "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3-flash-preview"])];
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: `${stable}\n\n${live}` }] },
      contents: turns.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] })),
      generationConfig: { temperature: 0.7 },
    });
    let lastError = "";
    for (const model of models) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { method: "POST", headers: { "x-goog-api-key": geminiKey, "Content-Type": "application/json" }, body },
      );
      if (res.ok) {
        const data = await res.json();
        return (data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "").trim();
      }
      lastError = `Gemini ${model} ${res.status}`;
      if (res.status !== 429 && res.status !== 503) break;
    }
    throw new Error(lastError);
  }

  throw new Error("NO_LLM_KEY");
}

async function ask(db: Db, live: string, turns: Turn[]): Promise<string> {
  const out = await llm(db, `${VOICE}\n\n${KNOWLEDGE}`, live, turns, 600);
  return out || "That one I will not go near. Ask me anything about the music, the artists or how this place works and I am all yours.";
}

/* ------------------------------------------------------------ actions --- */

type Action =
  | { type: "flow"; flow: "upload_song" | "build_world" | "edit_world" | "edit_gallery" | "merge_accounts" | "become_artist" | "connect_wallet" }
  | { type: "go"; path: string }
  | { type: "choose"; flow: "edit_world"; path: string };

const FLOWS = new Set(["upload_song", "build_world", "edit_world", "edit_gallery", "merge_accounts", "become_artist", "connect_wallet"]);

/** Pull the one action tag out of the reply, and hand back the words without it. */
function splitAction(reply: string): { reply: string; action?: Action; report?: boolean } {
  const re = /\[\[action:([a-z_]+)(?::([^\]\s]+))?\]\]/i;
  const m = reply.match(re);
  if (!m) return { reply };
  const words = reply.replace(/\s*\[\[action:[^\]]*\]\]\s*/gi, " ").replace(/\s+\n/g, "\n").trim();
  const name = m[1].toLowerCase();
  if (name === "report") return { reply: words, report: true };
  if (name === "go") {
    const path = (m[2] ?? "").trim();
    if (/^\/[a-z0-9\-/_?=&%.]*$/i.test(path)) return { reply: words, action: { type: "go", path } };
    return { reply: words };
  }
  if (name === "choose") {
    const path = (m[2] ?? "").trim();
    if (/^\/world-builder(\?[a-z0-9\-_=&%.]*)?$/i.test(path)) return { reply: words, action: { type: "choose", flow: "edit_world", path } };
    return { reply: words, action: { type: "flow", flow: "edit_world" } };
  }
  if (FLOWS.has(name)) return { reply: words, action: { type: "flow", flow: name as Extract<Action, { type: "flow" }>["flow"] } };
  return { reply: words };
}

/* --------------------------------------------------------- live context --- */

/**
 * Worlds built into the app (src/worlds/registry.ts), keyed by artist id. They
 * are not rows in the worlds table, so an owner_id lookup never finds them.
 * Keep in step with WORLDS in registry.ts.
 */
const BUILT_IN_WORLDS: Record<string, string> = {
  "3": "iman-afrikah",
};

type WorldFacts = {
  id: string;
  slug: string;
  status: string;
  world_number: number | null;
  owner_id: string | null;
  artist_id: string | null;
  story: string[] | null;
  hero_image: string | null;
  entrance_poster: string | null;
  room_art: Record<string, string> | null;
  city_art: Record<string, string> | null;
  zora_profile_url: string | null;
  zora_wallet_address: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  owner_last_entered_at: string | null;
};

const WORLD_COLUMNS =
  "id, slug, status, world_number, owner_id, artist_id, story, hero_image, entrance_poster, room_art, city_art, zora_profile_url, zora_wallet_address, created_at, updated_at, published_at, owner_last_entered_at";

type WorldCounts = { streets: number; hidden: number; filled: number; cities: number };

/**
 * Where one world stands, in words Mo$ha can act on. A published world is
 * standing and open; a draft is being built, so it says what is laid out, what
 * the doors still need (the same three things WorldBuilder.tsx checks before
 * publishing) and the builder step that fits next.
 */
function worldStateLine(w: WorldFacts, uid: string, c: WorldCounts): string {
  const visible = c.streets - c.hidden;
  const hiddenNote = c.hidden ? `, ${c.hidden} hidden` : "";
  const inside = w.owner_last_entered_at ? ` They were last inside it ${dayOf(w.owner_last_entered_at)}.` : "";
  const otherLogin = w.owner_id && w.owner_id !== uid
    ? " It stands under their artist name but was made from another login of theirs, so this login may not open it in the builder; if they cannot get in, merge_accounts brings it over."
    : "";
  if (w.status === "published") {
    const num = w.world_number ? `World #${String(w.world_number).padStart(3, "0")}, ` : "";
    return `World ${w.slug} (${num}world id ${w.id}) is PUBLISHED: standing and open to everyone at /w/${w.slug}${w.published_at ? `, open since ${dayOf(w.published_at)}` : ""}. It has ${plural(visible, "street", "streets")} on the map (${c.filled} with something on them${hiddenNote}) across ${plural(c.cities, "city", "cities")}.${inside} Talk about it as a standing world: what to add, change, dress or put on air next.${otherLogin}`;
  }
  if (w.status === "draft") {
    const zoraOk = /^https?:\/\/([a-z0-9-]+\.)*zora\.co\//i.test(w.zora_profile_url ?? "") && /^0x[0-9a-fA-F]{40}$/.test(w.zora_wallet_address ?? "");
    const storyOk = (w.story?.length ?? 0) > 0;
    const missing: string[] = [];
    if (c.filled < 3) missing.push(`something on ${plural(3 - c.filled, "more street", "more streets")} (${c.filled} of 3 so far, filled on the blocks step)`);
    if (!storyOk) missing.push("a story on the gate (written on the publish step)");
    if (!zoraOk) missing.push("their Zora account on the world, a zora.co link and the wallet it pays to (publish step)");
    const step = c.streets === 0 ? "streets" : c.filled < 3 ? "blocks" : "publish";
    const noArt = !w.hero_image && !w.entrance_poster && !Object.keys(w.room_art ?? {}).length
      ? " No art is on it yet (the Art step); that is not needed to open, but it is what makes the gate."
      : "";
    return `World ${w.slug} (world id ${w.id}) is a DRAFT: they are building it and nobody can see it yet. Started ${dayOf(w.created_at)}, last worked on ${dayOf(w.updated_at)}.${inside} So far: ${plural(c.streets, "street", "streets")} laid out${hiddenNote}, ${c.filled} with something on them, ${plural(c.cities, "city", "cities")}. ${missing.length ? `Still needed before the doors can open: ${missing.join("; ")}.` : "Everything the doors need is in place: it is ready to publish."}${noArt} The step that fits next is ${step}: [[action:go:/world-builder?id=${w.id}&step=${step}]]. Apply this: they are mid-build, so offer to pick up where they left off, finish it or change it, here (edit_world) or on that step. Never talk to them as if they had no world.${otherLogin}`;
  }
  return `World ${w.slug} (world id ${w.id}) has the status "${w.status}".${otherLogin}`;
}

/**
 * Every world this person has, found by the login that made it AND by their
 * artist id (a world can stand under their artist name from another login),
 * plus the worlds built into the app. Applied for listeners too: somebody can
 * start a world before their account turns artist.
 */
async function worldLines(db: Db, uid: string, artistId: string | null): Promise<string[]> {
  const out: string[] = [];
  try {
    const [byOwner, byArtist] = await Promise.all([
      db.from("worlds").select(WORLD_COLUMNS).eq("owner_id", uid),
      artistId ? db.from("worlds").select(WORLD_COLUMNS).eq("artist_id", artistId) : Promise.resolve({ data: [] as WorldFacts[] }),
    ]);
    const byId = new Map<string, WorldFacts>();
    for (const w of [...((byOwner.data ?? []) as WorldFacts[]), ...((byArtist.data ?? []) as WorldFacts[])]) byId.set(w.id, w);
    const list = [...byId.values()].sort((a, b) =>
      a.status === b.status ? b.updated_at.localeCompare(a.updated_at) : a.status === "published" ? -1 : b.status === "published" ? 1 : 0,
    );

    // Worlds built into the app, not in the worlds table. IMan Afrikah's
    // World #001 (src/worlds/registry.ts) is one: reading only by owner_id
    // had Mo$ha telling him he had no world. Keep in step with registry.ts.
    const builtIn = artistId ? BUILT_IN_WORLDS[artistId] : undefined;
    const hasBuiltIn = !!builtIn && !list.some((w) => w.slug === builtIn);
    if (hasBuiltIn) {
      out.push(`They own ${builtIn}, World #001, built into the app, PUBLISHED and open at /world/${builtIn}. They ALREADY have a world: never offer to build one. One world per artist. Offer to change it (edit_world) instead.`);
    }
    if (!list.length) {
      if (!hasBuiltIn && artistId) {
        out.push("They have not started a world yet. Once in this conversation, when it fits, offer nicely to build it for them right here (build_world), and say you can replace or change anything on it afterwards (edit_world). Never nag.");
      }
      return out;
    }

    const ids = list.map((w) => w.id);
    const [{ data: streets }, { data: cities }] = await Promise.all([
      db.from("world_streets").select("id, world_id, hidden").in("world_id", ids),
      db.from("world_cities").select("world_id").in("world_id", ids),
    ]);
    const streetRows = (streets ?? []) as Array<{ id: string; world_id: string; hidden: boolean | null }>;
    const { data: blocks } = streetRows.length
      ? await db.from("world_blocks").select("street_id").in("street_id", streetRows.map((s) => s.id)).limit(5000)
      : { data: [] as Array<{ street_id: string }> };
    const filledStreets = new Set(((blocks ?? []) as Array<{ street_id: string }>).map((b) => b.street_id));

    const drafts = list.filter((w) => w.status === "draft").length;
    const open = list.filter((w) => w.status === "published").length + (hasBuiltIn ? 1 : 0);
    out.push(
      `They ALREADY have a world (${open ? `${open} open` : "none open yet"}${drafts ? `, ${drafts} being built` : ""}). Never offer to build a second one: one world per artist. Offer to continue, finish or change the one they have (edit_world, or the builder step named below). A draft can be finished at /world-builder or by the edit_world flow.`,
    );
    for (const w of list) {
      const own = streetRows.filter((s) => s.world_id === w.id);
      out.push(
        worldStateLine(w, uid, {
          streets: own.length,
          hidden: own.filter((s) => s.hidden).length,
          filled: own.filter((s) => filledStreets.has(s.id)).length,
          cities: ((cities ?? []) as Array<{ world_id: string }>).filter((x) => x.world_id === w.id).length,
        }),
      );
      out.push(worldArtLine(w));
    }
    if (list.length + (hasBuiltIn ? 1 : 0) > 1) {
      out.push("An account holds one world, and they have more than one from before that rule. If it comes up, the spare can be folded into the one they keep (every street moves across); never start another.");
    }
  } catch {
    /* the rest of the answer stands */
  }
  return out;
}

/** How long a send may sit unfinished before it is stuck rather than busy. Same window as the Studio. */
const STUCK_MS = 20 * 60 * 1000;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function dayOf(iso: string): string {
  return new Date(iso).toUTCString().slice(0, 22) + " UTC";
}

/** What is dressed on one world, and the exact way to the page where pictures go on. */
function worldArtLine(w: WorldFacts): string {
  const streets = Object.keys(w.room_art ?? {}).length;
  const cities = Object.keys(w.city_art ?? {}).length;
  const payout = /^0x[0-9a-fA-F]{40}$/.test(w.zora_wallet_address ?? "")
    ? `ending ${w.zora_wallet_address!.slice(-4)}`
    : "not set";
  return `World ${w.slug}: a picture on ${plural(streets, "street", "streets")} and ${plural(cities, "city", "cities")}, hero picture ${w.hero_image ? "set" : "not set"}, entrance picture ${w.entrance_poster ? "set" : "not set"}. Zora link on this world: ${w.zora_profile_url ? "set" : "not set"}. The wallet that Zora account pays to, typed into this world: ${payout}. That Zora payout wallet is a detail on the world for opening its doors; it is NOT a wallet connected to their account, so never mix the two up. Pictures and loops go on this world in the World Builder's Art step, and this tag opens it straight there: [[action:go:/world-builder?id=${w.id}&step=art]]`;
}

/**
 * Records and pictures this artist sent, and which of them never arrived.
 *
 * A picture's row is made when the send starts and stamped again only once the
 * file is really in storage, so a row still carrying its first stamp after
 * the stuck window never arrived. A record still marked uploading after it
 * never finished sending.
 */
async function uploadLines(db: Db, uid: string): Promise<string[]> {
  const out: string[] = [];
  const cutoff = Date.now() - STUCK_MS;
  const old = (iso: string) => new Date(iso).getTime() < cutoff;
  try {
    const [{ data: songs }, { data: media }, { data: failures }] = await Promise.all([
      db.from("songs").select("title, status, created_at, cover_art_url").eq("owner_id", uid).order("created_at", { ascending: false }).limit(40),
      db.from("artist_media").select("is_published, created_at, updated_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(80),
      // Written by the phone itself since 11 Sep 2026, when a send stops.
      db.from("upload_failures").select("stage, message, http_status, bytes, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(3),
    ]);
    const lastFail = ((failures ?? []) as Array<{ stage: string; message: string | null; http_status: number | null; bytes: number | null; created_at: string }>)[0];
    if (lastFail && Date.now() - new Date(lastFail.created_at).getTime() < 7 * 86_400_000) {
      out.push(
        `Their last upload that stopped (${dayOf(lastFail.created_at)}, ${lastFail.bytes ? `${(lastFail.bytes / 1048576).toFixed(1)} MB, ` : ""}${lastFail.stage === "relay" ? "on the second way in, after the direct way had already failed" : "on the direct way in; the app then tries a second way by itself"}): "${(lastFail.message ?? "no reason given").slice(0, 160)}". Use this to tell them what actually happened in plain words, never the raw text. "stalled" or "network error" means their connection dropped the file on the way; a refusal with a number means our side said no, which is songchaindao@gmail.com.`,
      );
    }

    const recs = (songs ?? []) as Array<{ title: string | null; status: string; created_at: string; cover_art_url: string | null }>;
    if (recs.length) {
      const live = recs.filter((r) => r.status === "published").length;
      const workshop = recs.filter((r) => r.status === "workshop").length;
      const judging = recs.filter((r) => r.status === "auditioning" && !old(r.created_at)).length;
      const sending = recs.filter((r) => r.status === "uploading" && !old(r.created_at)).length;
      out.push(
        `Their records: ${live} live${workshop ? `, ${workshop} in the workshop with notes` : ""}${judging ? `, ${judging} with the judges right now` : ""}${sending ? `, ${sending} sending right now` : ""}.`,
      );
      const neverSent = recs.filter((r) => r.status === "uploading" && old(r.created_at) && r.cover_art_url);
      const waitingOnCover = recs.filter((r) => r.status === "uploading" && old(r.created_at) && !r.cover_art_url);
      if (waitingOnCover.length) {
        const names = waitingOnCover.slice(0, 4).map((r) => `"${r.title || "untitled"}"`).join(", ");
        out.push(
          `${plural(waitingOnCover.length, "record", "records")} (${names}${waitingOnCover.length > 4 ? " and more" : ""}) stopped at the cover: the music arrived, but no artwork went on, so it never went to the judges. Two faults did this, both now fixed: until 11 September the app refused any cover that was not already square and never offered to crop it, and until 12 September it also refused a photo for being over 8 MB before it had shrunk it, which is most photos straight off a phone. Worse, when a record was sent with no cover the app said nothing at all and simply left it sitting there, which is why these piled up silently. Any photo of any size now works, and a record with no cover says so on its own card. Say that plainly and own it, then tell them: in the Studio each of these shows Add the cover; once the artwork is on, it goes to the judges by itself. Never tell them to remove it and send it again; the music is already in.`,
        );
      }
      const stuckJudging = recs.filter((r) => r.status === "auditioning" && old(r.created_at));
      if (neverSent.length) {
        const names = neverSent.slice(0, 4).map((r) => `"${r.title || "untitled"}"`).join(", ");
        out.push(
          `${plural(neverSent.length, "record", "records")} never finished sending (${names}${neverSent.length > 4 ? " and more" : ""}), the latest started ${dayOf(neverSent[0].created_at)}. They are not live, not with the judges and not in the Room. Tell them that plainly. On each one in the Studio, Ask again brings it back if the file did land; if it does not, Remove it and send it again, one at a time. If a fresh send stops the same way, songchaindao@gmail.com will look into it with them. Do not guess at file size or format as the reason; you were not told that.`,
        );
      }
      if (stuckJudging.length) {
        out.push(
          `${plural(stuckJudging.length, "record has", "records have")} sat with the judges far too long. That is stuck, not busy: Ask again on the record in the Studio sends it back to them.`,
        );
      }
    }

    const pieces = (media ?? []) as Array<{ is_published: boolean; created_at: string; updated_at: string }>;
    if (pieces.length) {
      const arrived = pieces.filter((m) => m.updated_at !== m.created_at || !old(m.created_at));
      const lost = pieces.filter((m) => m.updated_at === m.created_at && old(m.created_at));
      const shown = arrived.filter((m) => m.is_published).length;
      const kept = arrived.length - shown;
      out.push(
        `Their pictures and clips: ${shown} on their public gallery, ${kept} kept private to their world. World art never shows on the gallery, only on the world it was put on.`,
      );
      if (lost.length) {
        out.push(
          `${plural(lost.length, "picture or clip", "pictures and clips")} they sent never finished arriving, the most recent started ${dayOf(lost[0].created_at)}. The send began and never completed, so there is nothing to show for ${lost.length === 1 ? "it" : "them"}: not hidden, not waiting on anyone. If they say their uploads are not showing, this is why, so say it plainly. Do not blame the file size or format; you do not know that. Ask them to try one small picture again on a steady connection, and if that does not show either, songchaindao@gmail.com will look into it with them.`,
        );
      }
    }
  } catch {
    /* the rest of the answer stands */
  }
  return out;
}

type Extra = { recent: string[]; editWhere: string | null; surface: string };

async function liveContext(db: Db, token: string | null, page: string | null, extra: Extra): Promise<{ text: string; uid: string | null }> {
  const lines: string[] = [];
  const now = new Date();
  lines.push(`Today is ${now.toUTCString().slice(0, 16)}.`);
  if (page) lines.push(`The person is on the ${page} page right now.`);
  if (extra.surface === "guide") {
    lines.push("You are riding along beside them on the World Builder page while they build, in a small card on that page, not the main chat. One or two short sentences only: a few words on what they just did, then the one next question that fits the step they are on. No flow tags, they are already on the page; a go tag only if what they need is on a different page. A message in brackets that starts with \"On the page I just\" was written by the app, not typed by them: react to what it says they did.");
  }
  if (extra.recent.length) {
    lines.push(`What they did on the builder in the last half hour, oldest first: ${extra.recent.join("; ")}. Your next question or suggestion follows on from the newest of these. Never ask them to do a thing they just did.`);
  }
  if (extra.editWhere === "page" || extra.editWhere === "chat") {
    lines.push(`Last time they chose to change their world ${extra.editWhere === "page" ? "on the builder page" : "here in the chat"}. Still ask where, and mention that one first.`);
  }

  try {
    const [{ count: songs }, { count: artists }, { count: liveBattles }, { count: worlds }] = await Promise.all([
      db.from("songs").select("id", { count: "exact", head: true }).eq("is_published", true),
      db.from("artist_accounts").select("artist_id", { count: "exact", head: true }),
      db.from("battles").select("id", { count: "exact", head: true }).eq("status", "live"),
      db.from("worlds").select("slug", { count: "exact", head: true }).eq("status", "published"),
    ]);
    lines.push(
      `Right now the catalog has ${songs ?? "some"} published records from ${artists ?? "a roster of"} artists with accounts, ${liveBattles ?? 0} battle${liveBattles === 1 ? "" : "s"} live this minute, and ${(worlds ?? 0) + 1} world${(worlds ?? 0) + 1 === 1 ? "" : "s"} open (World #001 is IMan Afrikah's).`,
    );
  } catch {
    /* the account above still stands */
  }

  if (!token) {
    lines.push("The person is not signed in. You do not know their name. Invite them to sign up free when it fits, never as a wall. Flows need a signed-in person: if they want to upload or build, say sign up first and use [[action:go:/?auth=signup]].");
    return { text: lines.join("\n"), uid: null };
  }

  let uid: string | null = null;
  try {
    const { data } = await db.auth.getUser(token);
    const user = data?.user;
    if (!user) {
      lines.push("The person is not signed in.");
      return { text: lines.join("\n"), uid: null };
    }
    uid = user.id;
    const [{ data: profile }, { data: artist }, { count: holdings }, { count: citizen }, { data: points }, { count: likes }, { data: memory }] = await Promise.all([
      db.from("audience_profiles").select("display_name, username, gender, wallet_address, created_at").eq("user_id", uid).maybeSingle(),
      db.from("artist_accounts").select("artist_id, is_verified").eq("user_id", uid).maybeSingle(),
      db.from("song_holdings").select("song_id", { count: "exact", head: true }).eq("user_id", uid).gt("balance", 0),
      db.from("world_citizens").select("world_slug", { count: "exact", head: true }).eq("user_id", uid),
      db.from("user_points").select("*").eq("user_id", uid).maybeSingle(),
      db.from("liked_songs").select("id", { count: "exact", head: true }).eq("user_id", uid),
      // "*" so this reads the structured columns once that migration is on,
      // and still reads notes alone before it.
      db.from("mosha_memory").select("*").eq("user_id", uid).maybeSingle(),
    ]);
    const name = profile?.display_name || profile?.username || null;
    const gender = profile?.gender as string | null | undefined;
    const refer =
      gender === "woman" ? "she/her" : gender === "man" ? "he/him" : gender === "other" ? "they/them" : "not said (use you / they)";
    lines.push(`Signed in. Name: ${name ?? "not set yet"}. Refer to them as: ${refer}.`);
    if (profile?.created_at) {
      const days = Math.max(0, Math.round((Date.now() - new Date(profile.created_at).getTime()) / 86_400_000));
      lines.push(days < 2 ? "They joined in the last day or two; they are new here." : `They have been here ${days} days.`);
    }
    lines.push(`Song copies held: ${holdings ?? 0}. Songs liked: ${likes ?? 0}. Worlds they are a citizen of: ${citizen ?? 0}.`);
    const p = points as Record<string, unknown> | null;
    if (p) {
      const total = p.total_points ?? p.points ?? p.balance;
      const tier = p.tier ?? p.tier_name;
      if (total != null) lines.push(`Points: ${total}${tier ? `, tier ${tier}` : ""}.`);
    }
    if (artist) {
      lines.push(`They are an artist here (artist id ${artist.artist_id}${artist.is_verified ? ", verified" : ""}). Studio, uploads, the gallery, the world builder, the activity board and licensing requests all apply to them. The upload_song, build_world, edit_world and edit_gallery flows are for them.`);
      // Every world they have, published or being built, by login and by artist id.
      lines.push(...(await worldLines(db, uid, String(artist.artist_id))));
      // What actually happened to what they sent. Without this every "my
      // upload is not showing" got the same advice about file sizes.
      lines.push(...(await uploadLines(db, uid)));
    } else {
      lines.push("They are a listener, not an artist account yet. If they make music, the become_artist flow turns this account into an artist account in one tap; the Studio and the builder open after that.");
      // A world can be started before the account turns artist.
      lines.push(...(await worldLines(db, uid, null)));
    }
    // The wallets on this account, so wallet questions get a real answer
    // instead of a general one.
    try {
      const { data: purses } = await db
        .from("user_wallets")
        .select("address, provider, is_active")
        .eq("user_id", uid);
      const list = (purses ?? []) as Array<{ address: string; provider: string; is_active: boolean }>;
      if (list.length) {
        const paying = list.find((w) => w.is_active);
        lines.push(
          `Wallets on this account: ${list.length} (${list.map((w) => w.provider).join(", ")}). The one that pays is ${paying ? `${paying.provider} ending ${paying.address.slice(-4)}` : "not chosen yet"}. They switch which one pays on /wallet, which also shows their balance, the records they own and their coins. Never read a whole address out; the last four is enough.`,
        );
      } else {
        lines.push("No wallet on this account yet. They do not need one to listen, post or release; only to own a record or hold a world key. The connect_wallet flow opens the one already on their device.");
      }
    } catch {
      /* the rest of the answer stands */
    }

    // More than one login under one name. Raise it once, kindly, and offer
    // to sort it out; never nag, and never do anything without being asked.
    try {
      const myName = (profile?.display_name ?? "").trim();
      const { count: twins } = myName
        ? await db
            .from("audience_profiles")
            .select("user_id", { count: "exact", head: true })
            .neq("user_id", uid)
            .ilike("display_name", myName)
        : { count: 0 };
      // "Say so once" meant nothing to a model that cannot see its earlier
      // turns past the last twelve, so it raised it again and again. Whether
      // it has already been said is read from what he actually said.
      const { count: raised } = twins
        ? await db
            .from("mosha_messages")
            .select("id", { count: "exact", head: true })
            .eq("user_id", uid)
            .eq("role", "assistant")
            .or("action->>flow.eq.merge_accounts,content.ilike.*logins*")
        : { count: 0 };
      if (twins && raised) {
        lines.push(
          `They have ${(twins ?? 0) + 1} logins here under the name ${profile?.display_name}, and you have ALREADY told them. Do not bring it up again, not even in passing. Only if they raise it themselves, help with [[action:merge_accounts]].`,
        );
      } else if (twins) {
        lines.push(
          `They have ${(twins ?? 0) + 1} logins here under the name ${profile?.display_name}. Say so once, plainly and without alarm: it happens when somebody signs in one way and then another. Ask which one they want to keep, and offer to do it for them with [[action:merge_accounts]]. Everything moves across and nothing is deleted, but it needs them to say the same thing from the other login too. If they would rather leave it, leave it and do not raise it again.`,
        );
      }
    } catch {
      /* the rest of the answer stands */
    }
    // What the last replies opened, so the same flow is not opened again and
    // again at somebody it is not working for.
    try {
      const { data: last } = await db
        .from("mosha_messages")
        .select("action, created_at")
        .eq("user_id", uid)
        .eq("role", "assistant")
        .order("created_at", { ascending: false })
        .limit(4);
      const opened = ((last ?? []) as Array<{ action: { type?: string; flow?: string; path?: string } | null }>).map((r) =>
        r.action?.type === "flow" ? String(r.action.flow) : r.action?.type === "go" || r.action?.type === "choose" ? `a link to ${r.action.path}` : "nothing",
      );
      if (opened.length) {
        lines.push(`Your last ${opened.length} replies to them opened, newest first: ${opened.join(", ")}. That is history, not a ban: when they ask for a thing again, open it again. It is only when they tell you it did not work that you stop opening it and say what is in the way instead.`);
      }
    } catch {
      /* the rest of the answer stands */
    }
    lines.push(...memoryLines(readMemory(memory as Record<string, unknown> | null)));
  } catch {
    lines.push("Signed in, but their details could not be read this second; talk to them as a member.");
  }
  return { text: lines.join("\n"), uid };
}

/* ------------------------------------------------------------- memory --- */

const MEMORY_PROMPT = `You keep Mo$ha's private memory about one person on SONGCHAINN, so Mo$ha never makes them explain the same thing twice and never lets them hit the same wall twice. You are given their memory so far as JSON, the newest messages, and whether Mo$ha just sent their problem to the team. Reply with ONE JSON object and nothing else, no code fences, in exactly this shape:
{"preferences": [], "remember": [], "facts": [], "drop": [], "open_problems": [], "solved_problems": [], "notes": ""}
preferences: how they like to be spoken to (tone, length, slang or plain, which language), and what they like. The full updated list of short strings.
remember: things they explicitly asked Mo$ha to remember or keep in mind, or told Mo$ha always or never to do. The full updated list.
facts: short stable facts about them: whether they make music or listen, their artist name, city or country, what they are building, their goals. The full updated list.
drop: exact items from the old memory that no longer hold, that the newest messages contradict, or that they asked Mo$ha to forget.
open_problems: only problems, errors or complaints they raised in the NEWEST messages that are not fixed yet, whether new or hit again. Each is {"id": the old id if it is the same problem as one in the old memory (open or solved), else "", "text": one plain line saying what went wrong and where, "reported": true only if Mo$ha just sent this one to the team}.
solved_problems: problems the newest messages show are now fixed or working (they said it works now, fixed, solved, sorted, or thanked Mo$ha after the help worked). Each is {"id": the old open id if there was one, else "", "text": what the problem was, "how_solved": one plain line saying what fixed it}.
notes: one short plain paragraph under 600 characters on how to talk to them and what they are doing here, keeping what still holds.
Every string under 200 characters. Never store passwords, codes, keys, seed phrases, wallet addresses, card or phone numbers, emails, health details, or anything about a different person. Never store Mo$ha's own words as their preference. If nothing changed, return the old values.`;

/* MEMORY-PURE-BEGIN: no Deno, no database. Mirrored by the node test in the session scratchpad (mosha-memory-merge-test.mjs). */

type OpenProblem = { id: string; text: string; first_seen: string; last_seen: string; count: number; returned_after_fix?: boolean };
type SolvedProblem = { id: string; text: string; how_solved: string; solved_at: string };
type Memory = {
  notes: string;
  preferences: string[];
  remember: string[];
  facts: string[];
  open_problems: OpenProblem[];
  solved_problems: SolvedProblem[];
};

const MEMORY_CAPS = { preferences: 12, remember: 20, facts: 12, open_problems: 10, solved_problems: 20 } as const;
const MEMORY_ITEM_MAX = 200;
const MEMORY_NOTES_MAX = 1200;
/** The same problem seen again within this window is the same occurrence, not a recurrence. */
const RECUR_GAP_MS = 60 * 60 * 1000;

/** A secret written out ("my password is ...") or a health detail: the whole item is dropped. */
const SECRET_VALUE_RE = /\b(pass ?words?|passcodes?|pass ?phrases?|seed phrases?|recovery phrases?|secret phrases?|mnemonic|private keys?|secret keys?|api keys?|pin|otp|cvv|cvc|verification code|login code)\b\s*(?:is|was|=|:)\s*\S+/i;
const HEALTH_RE = /\b(diagnos\w*|hiv|aids|cancer|diabet\w*|depress\w*|bipolar|schizo\w*|pregnan\w*|miscarriage|medication|prescription|chemo\w*|therapy|therapist|disease|illness|mental health|suicid\w*|self[- ]harm)\b/i;

/** A message worth updating memory for right away rather than waiting for the cadence. */
const MEMORY_SIGNAL_RE = /\b(remember|keep in mind|forget|note (?:this|that)|i prefer|i'?d rather|i like|i love|i hate|i want you to|call me|don'?t|do not|never|always|stop|problem|issue|error|bug|broke|broken|not working|isn'?t working|doesn'?t work|does not work|won'?t|can'?t|cannot|couldn'?t|fail(?:ed|ing|s)?|stuck|wrong|missing|not showing|disappeared|crash(?:ed|es)?|works now|working now|it works|fixed|solved|sorted|resolved|thanks?|thank you|thx|appreciate)\b/i;

function hasMemorySignal(text: string): boolean {
  return MEMORY_SIGNAL_RE.test(text);
}

/** Wallets, cards, phones, emails and long tokens swapped out; secrets and health details refused (null). */
function scrubMemoryText(input: unknown, max = MEMORY_ITEM_MAX): string | null {
  if (typeof input !== "string") return null;
  let s = input.replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (SECRET_VALUE_RE.test(s) || HEALTH_RE.test(s)) return null;
  s = s
    .replace(/\b0x[a-fA-F0-9]{20,}\b/g, "[wallet]")
    .replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.eth\b/gi, "[wallet]")
    .replace(/\bbc1[a-z0-9]{25,60}\b/gi, "[wallet]")
    .replace(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g, "[wallet]")
    .replace(/[^\s@]+@[^\s@]+\.[a-z]{2,}/gi, "[email]")
    .replace(/\b(?:\d[ -]?){12,18}\d\b/g, "[number]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, (m) => (m.replace(/\D/g, "").length >= 9 ? "[number]" : m))
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[removed]");
  if (s.replace(/\[(wallet|email|number|removed)\]/g, "").replace(/[^a-z0-9]/gi, "").length < 3) return null;
  return s.slice(0, max);
}

function normMemoryText(s: string): string {
  return s.toLowerCase().replace(/\(reported to the team\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Case-insensitive, punctuation-blind; a longer line containing a shorter one counts as the same. */
function sameMemoryText(a: string, b: string): boolean {
  const x = normMemoryText(a);
  const y = normMemoryText(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return Math.min(x.length, y.length) >= 12 && (x.includes(y) || y.includes(x));
}

function problemId(text: string): string {
  let h = 5381;
  for (const ch of normMemoryText(text)) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return `p${h.toString(36)}`;
}

function cleanMemoryList(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return x
    .map((v) => (typeof v === "string" ? v : v && typeof v === "object" ? (v as { text?: unknown }).text : null))
    .map((v) => scrubMemoryText(v))
    .filter((v): v is string => !!v);
}

function dedupeMemoryList(list: string[], cap: number): string[] {
  const out: string[] = [];
  for (const s of list) if (!out.some((o) => sameMemoryText(o, s))) out.push(s);
  return out.slice(0, cap);
}

/** Whatever the row holds (or null, or a row from before the structured columns), as a clean Memory. */
function readMemory(row: Record<string, unknown> | null): Memory {
  const r = row ?? {};
  const iso = (v: unknown, fallback: string) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : fallback);
  const epoch = new Date(0).toISOString();
  const open = (Array.isArray(r.open_problems) ? r.open_problems : [])
    .map((p: Record<string, unknown>) => {
      const text = scrubMemoryText(p?.text);
      if (!text) return null;
      const first = iso(p.first_seen, epoch);
      return {
        id: typeof p.id === "string" && p.id ? p.id : problemId(text),
        text,
        first_seen: first,
        last_seen: iso(p.last_seen, first),
        count: typeof p.count === "number" && p.count > 0 ? Math.floor(p.count) : 1,
        ...(p.returned_after_fix === true ? { returned_after_fix: true } : {}),
      } as OpenProblem;
    })
    .filter((p): p is OpenProblem => !!p);
  const solved = (Array.isArray(r.solved_problems) ? r.solved_problems : [])
    .map((p: Record<string, unknown>) => {
      const text = scrubMemoryText(p?.text);
      if (!text) return null;
      return {
        id: typeof p.id === "string" && p.id ? p.id : problemId(text),
        text,
        how_solved: scrubMemoryText(p.how_solved) ?? "",
        solved_at: iso(p.solved_at, epoch),
      } as SolvedProblem;
    })
    .filter((p): p is SolvedProblem => !!p);
  return {
    notes: typeof r.notes === "string" ? r.notes : "",
    preferences: dedupeMemoryList(cleanMemoryList(r.preferences), MEMORY_CAPS.preferences),
    remember: dedupeMemoryList(cleanMemoryList(r.remember), MEMORY_CAPS.remember),
    facts: dedupeMemoryList(cleanMemoryList(r.facts), MEMORY_CAPS.facts),
    open_problems: open.slice(0, MEMORY_CAPS.open_problems),
    solved_problems: solved.slice(0, MEMORY_CAPS.solved_problems),
  };
}

/** The model's reply as an object, or null when it is not one (then the old memory stands). */
function parseMemoryJson(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/```(?:json)?/gi, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Old memory + what the model proposed = new memory, decided here in code:
 * lists deduped and capped (newest first), dropped items removed, a problem
 * marked solved moved out of open with how it was solved, a problem seen
 * again bumped (count and last_seen), a solved problem seen again reopened
 * as having come back after its fix, and a report Mo$ha sent recorded as an
 * open problem "reported to the team". A null proposal keeps the old memory
 * (only the report, if any, is added).
 */
function mergeMemory(old: Memory, proposal: Record<string, unknown> | null, opts: { now: string; reportedText?: string | null }): Memory {
  const now = opts.now;
  const nowMs = Date.parse(now);
  let open = old.open_problems.map((p) => ({ ...p }));
  let solved = old.solved_problems.map((p) => ({ ...p }));
  let preferences = old.preferences;
  let remember = old.remember;
  let facts = old.facts;
  let notes = old.notes;

  const markReported = (p: OpenProblem) => {
    if (!/\(reported to the team\)/i.test(p.text)) p.text = `${p.text.slice(0, MEMORY_ITEM_MAX - 24)} (reported to the team)`;
  };

  /** The same problem hit (again): bump it, reopen it if it was solved, or add it. */
  const seeOpen = (text: string, id: string | null, reported: boolean, justSolved: SolvedProblem[]) => {
    if (justSolved.some((s) => (id && s.id === id) || sameMemoryText(s.text, text))) return;
    const i = open.findIndex((p) => (id && p.id === id) || sameMemoryText(p.text, text));
    if (i >= 0) {
      const p = open[i];
      if (nowMs - Date.parse(p.last_seen) > RECUR_GAP_MS) p.count += 1;
      p.last_seen = now;
      if (reported) markReported(p);
      open.splice(i, 1);
      open.unshift(p);
      return;
    }
    const before = solved.find((s) => (id && s.id === id) || sameMemoryText(s.text, text));
    const fresh: OpenProblem = before
      ? { id: before.id, text, first_seen: now, last_seen: now, count: 2, returned_after_fix: true }
      : { id: problemId(text), text, first_seen: now, last_seen: now, count: 1 };
    if (reported) markReported(fresh);
    open.unshift(fresh);
  };

  if (proposal) {
    const drop = cleanMemoryList(proposal.drop);
    const keep = (s: string) => !drop.some((d) => sameMemoryText(d, s));
    preferences = dedupeMemoryList([...cleanMemoryList(proposal.preferences), ...old.preferences].filter(keep), MEMORY_CAPS.preferences);
    remember = dedupeMemoryList([...cleanMemoryList(proposal.remember), ...old.remember].filter(keep), MEMORY_CAPS.remember);
    facts = dedupeMemoryList([...cleanMemoryList(proposal.facts), ...old.facts].filter(keep), MEMORY_CAPS.facts);
    open = open.filter((p) => keep(p.text));
    solved = solved.filter((p) => keep(p.text));

    const justSolved: SolvedProblem[] = [];
    for (const raw of Array.isArray(proposal.solved_problems) ? proposal.solved_problems : []) {
      const item = (raw ?? {}) as Record<string, unknown>;
      const text = scrubMemoryText(item.text);
      if (!text) continue;
      const id = typeof item.id === "string" && item.id ? item.id : null;
      const how = scrubMemoryText(item.how_solved) ?? "";
      const i = open.findIndex((p) => (id && p.id === id) || sameMemoryText(p.text, text));
      const was = i >= 0 ? open.splice(i, 1)[0] : null;
      const entry: SolvedProblem = {
        id: was?.id ?? id ?? problemId(text),
        text: (was?.text ?? text).replace(/\s*\(reported to the team\)/i, ""),
        how_solved: how,
        solved_at: now,
      };
      solved = solved.filter((s) => s.id !== entry.id && !sameMemoryText(s.text, entry.text));
      solved.unshift(entry);
      justSolved.push(entry);
    }

    let reportPlaced = false;
    for (const raw of Array.isArray(proposal.open_problems) ? proposal.open_problems : []) {
      const item = (typeof raw === "string" ? { text: raw } : raw ?? {}) as Record<string, unknown>;
      const text = scrubMemoryText(item.text);
      if (!text) continue;
      const reported = !!opts.reportedText && item.reported === true;
      if (reported) reportPlaced = true;
      seeOpen(text, typeof item.id === "string" && item.id ? item.id : null, reported, justSolved);
    }
    if (opts.reportedText && !reportPlaced) {
      const t = scrubMemoryText(opts.reportedText);
      if (t) seeOpen(t, null, true, []);
    }

    const freshNotes = scrubMemoryText(proposal.notes, MEMORY_NOTES_MAX);
    if (freshNotes) notes = freshNotes;
  } else if (opts.reportedText) {
    const t = scrubMemoryText(opts.reportedText);
    if (t) seeOpen(t, null, true, []);
  }

  open.sort((a, b) => b.last_seen.localeCompare(a.last_seen));
  solved.sort((a, b) => b.solved_at.localeCompare(a.solved_at));
  return {
    notes: notes.slice(0, MEMORY_NOTES_MAX),
    preferences,
    remember,
    facts,
    open_problems: open.slice(0, MEMORY_CAPS.open_problems),
    solved_problems: solved.slice(0, MEMORY_CAPS.solved_problems),
  };
}

/** The memory as lines of the live context. */
function memoryLines(m: Memory): string[] {
  const day = (iso: string) => iso.slice(0, 10);
  const out: string[] = [];
  if (m.remember.length) out.push(`Things they asked you to keep in mind (honour every one, every time): ${m.remember.join("; ")}.`);
  if (m.preferences.length) out.push(`How they like it: ${m.preferences.join("; ")}.`);
  if (m.facts.length) out.push(`What you know about them: ${m.facts.join("; ")}.`);
  if (m.open_problems.length) {
    out.push(
      `Problems they have hit that are still open (check the facts you were given; if it is now fixed, tell them): ${m.open_problems
        .map((p) => `"${p.text}" (first ${day(p.first_seen)}, last ${day(p.last_seen)}${p.count > 1 ? `, hit ${p.count} times` : ""}${p.returned_after_fix ? ", CAME BACK after it had been fixed, so treat it as broken again and send a report" : ""})`)
        .join("; ")}.`,
    );
  }
  if (m.solved_problems.length) {
    out.push(
      `Problems that were solved before (if the same thing shows up again, say you remember it and apply the fix that worked, and say it is being passed on if it keeps coming back): ${m.solved_problems
        .map((p) => `"${p.text}", fixed by: ${p.how_solved || "not recorded"} (${day(p.solved_at)})`)
        .join("; ")}.`,
    );
  }
  const notes = m.notes.trim();
  if (notes) out.push(`Your private notes on this person from earlier chats (use them, never recite them):\n${notes}`);
  return out;
}

/* MEMORY-PURE-END */

/**
 * The exchange is written down. Memory is updated at once when the person's
 * message carries a signal (a problem, a fix, a preference, "remember") or a
 * report went to the team, and otherwise every few exchanges. Runs after the
 * reply is sent.
 */
async function remember(db: Db, uid: string, turns: Turn[], reply: string, action: Action | undefined, reported: boolean): Promise<void> {
  const last = turns[turns.length - 1];
  if (!last || last.role !== "user") return;
  try {
    await db.from("mosha_messages").insert([
      { user_id: uid, role: "user", content: last.content.slice(0, 4000) },
      { user_id: uid, role: "assistant", content: reply.slice(0, 4000), action: action ?? null },
    ]);
  } catch (err) {
    console.error("mosha-chat: could not write the exchange down", err);
  }

  try {
    const { data: row } = await db.from("mosha_memory").select("*").eq("user_id", uid).maybeSingle();
    const old = readMemory(row as Record<string, unknown> | null);
    const since = (((row as { turns_since?: number } | null)?.turns_since) ?? 0) + 1;
    const due = reported || hasMemorySignal(last.content) || since >= 3 || (!old.notes && since >= 2);
    const nowIso = new Date().toISOString();
    if (!due) {
      await db.from("mosha_memory").upsert({ user_id: uid, turns_since: since, updated_at: nowIso });
      return;
    }
    const recent = [...turns.slice(-6), { role: "assistant" as const, content: reply }]
      .map((t) => `${t.role}: ${t.content.slice(0, 700)}`)
      .join("\n");
    const raw = await llm(
      db,
      MEMORY_PROMPT,
      "",
      [{
        role: "user",
        content: `OLD MEMORY:\n${JSON.stringify(old)}\n\nNEWEST MESSAGES:\n${recent}\n\n${reported ? "Mo$ha just sent their problem to the team with a report." : "No report was sent in this reply."}`,
      }],
      900,
    );
    const proposal = parseMemoryJson(raw);
    if (!proposal) console.warn("mosha-chat: memory reply was not JSON; keeping the old memory");
    const merged = mergeMemory(old, proposal, { now: nowIso, reportedText: reported ? last.content.slice(0, 160) : null });
    const { error } = await db.from("mosha_memory").upsert({ user_id: uid, ...merged, turns_since: 0, updated_at: nowIso });
    if (error) {
      // Before the structured-memory migration only notes can be written.
      await db.from("mosha_memory").upsert({ user_id: uid, notes: merged.notes, turns_since: 0, updated_at: nowIso });
    }
  } catch (err) {
    console.error("mosha-chat: could not update the memory", err);
  }
}

/* ------------------------------------------------------------- report --- */

/**
 * What the person told Mo$ha, sent to the founders' inbox as them, through the
 * same door Report a bug uses. True only when it really landed, so Mo$ha never
 * says "sent to the team" about something that was not.
 */
async function passItOn(token: string | null, turns: Turn[], page: string | null): Promise<boolean> {
  const said = turns.filter((t) => t.role === "user").slice(-6).map((t) => `- ${t.content}`).join("\n");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/founder-inbox`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anon, Authorization: `Bearer ${token || anon}` },
      body: JSON.stringify({
        kind: "bug",
        subject: "Sent through Mo$ha",
        text: `What they told Mo$ha, newest last:\n${said}`.slice(0, 6000),
        page: page ?? "mosha-chat",
      }),
    });
    const data = await res.json().catch(() => null);
    return res.ok && data?.success === true;
  } catch {
    return false;
  }
}

/* --------------------------------------------------------------- serve --- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const raw = Array.isArray(body?.messages) ? body.messages : [];
    const turns: Turn[] = raw
      .filter((m: { role?: string; content?: string }) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string" && m.content.trim())
      .slice(-12)
      .map((m: { role: "user" | "assistant"; content: string }) => ({ role: m.role, content: m.content.trim().slice(0, 1500) }));
    if (turns.length === 0 || turns[turns.length - 1].role !== "user") {
      return json({ error: "Say something first." }, 400);
    }
    while (turns.length && turns[0].role !== "user") turns.shift();

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const db = admin();
    const extra: Extra = {
      recent: Array.isArray(body?.recent)
        ? body.recent.filter((r: unknown) => typeof r === "string").slice(-12).map((r: string) => r.slice(0, 160))
        : [],
      editWhere: typeof body?.editWhere === "string" ? body.editWhere : null,
      surface: typeof body?.surface === "string" ? body.surface.slice(0, 20) : "bubble",
    };
    // An automatic ask from the card riding along on the builder. The person
    // did not type it, so it is not written into their chat history.
    const silent = body?.silent === true;
    const { text: live, uid } = await liveContext(db, token || null, typeof body?.page === "string" ? body.page.slice(0, 60) : null, extra);

    const { reply, action, report } = splitAction(await ask(db, live, turns));
    let words = reply || "Say that again for me, one more time.";
    // Only a report that really landed may be called sent.
    let reported = false;
    if (report && !silent) {
      reported = await passItOn(token || null, turns, typeof body?.page === "string" ? body.page.slice(0, 60) : null);
      if (!reported) {
        words = `${words}\n\nThat did not reach the team just now, and I will not pretend it did. Tap Report a bug in the menu, or write to songchaindao@gmail.com.`;
      }
    }

    if (uid && !silent) {
      const work = remember(db, uid, turns, words, action, reported);
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(work);
      else void work;
    }

    return json({ reply: words, ...(action ? { action } : {}) });
  } catch (err) {
    console.error("mosha-chat error:", err);
    return json({
      reply: "My line dropped for a second. Ask me again, and if it keeps happening, songchaindao@gmail.com is a real person who will help.",
      degraded: true,
    });
  }
});
