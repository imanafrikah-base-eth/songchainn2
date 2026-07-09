function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// CDN prefixes
const R2A = "https://pub-5692eded60084f25a0e00a8c74c83fb1.r2.dev";
const R2B = "https://pub-221dc60ecc5143e3b28d9d2bfa2cbee0.r2.dev";
const R2C = "https://pub-16e4913e843a417aa5b0c907a4f79ba4.r2.dev";
const R2D = "https://pub-02031b2f7f24476c9c42081bfe076230.r2.dev";

// Album artwork
const A7V1 = `${R2A}/7ROO7H%20BASED.jpg`;
const A7V2 = `${R2B}/7ROO7H%20ARTWORK.png`;
const A7V3 = `${R2A}/7ROO7H%20BASED%20vol3.jpeg`;
const A7V4 = `${R2B}/7ROO7H%20%20Based/7ROO7H%20Based%20(1).png`;

const ADJ = `${R2A}/DENAJAH.jpg`;

const AIV1 = `${R2A}/IMAN%20AFRIKAH.jpg`;
const AIV2 = `${R2B}/IMan%20Afrikah%20-%20300FRQs%20vol2.png`;
const AIV3 = `${R2B}/IMan%20Afrikah%20-%20300FRQs%20vol3.png`;
const AIV4 = `${R2A}/IMAN%20AFRIKAH%20vol4%20artwork.png`;
const AIV5 = `${R2A}/iman%20vol5.png`;
const AIV6 = `${R2A}/immaan%20vol6.png`;
const AIV7 = `${R2A}/iman%20vol7.png`;
const AI30 = `${R2A}/IMan%20Arikah%20-3.0%20art.png`;
const AILV = `${R2A}/IMAN%20AFRIKAH%20-LOVERS%20cover%20art.png`;
const AIEF = `${R2D}/Er'ting%20flex/ER'TING%20FLEX%20ARTWORK.png`;
const AI7U = `${R2C}/IMAN%20AFARIKAH%20-%207USHIMI%20CATALOG%20DATA/7ushimi%20artwork.jpg`;

const AN1 = `${R2A}/NDA.jpg`;
const AN2 = `${R2B}/nda%20artwor.jpg`;
const AN3 = `${R2A}/MiDNiGHT%20RUN_20260129_221806_0000%20(1).jpg`;
const AN4 = `${R2A}/NDA%20-%20SIGNALS%20FROM%20THE%20OTHER%20SIDE%20VL%204.jpg`;
const AN5 = `${R2A}/NDA%20DRUMTIDE%3B%206.11%20VL5.jpg`;
const AN6 = `${R2A}/NDA%20INFINITY%20MINUS%20ONE%20VL6.jpg`;

const AP1 = `${R2A}/PRP.jpg`;
const AP2 = `${R2B}/PRP%20ARTWORK.png`;

const ASC = `${R2A}/SANCHY.jpg`;
const AST1 = `${R2A}/file_00000000106871fd889daaa509fd5a14.png`;
const AST2 = `${R2A}/Santana%20vol2%20Art.png`;
const AST3 = `${R2C}/Santana%20Vol3/SANTANA%20VOL%203%20ARTWORK.png`;

const AFT = `${R2A}/FAITH%20ART%20WORK.png`;
const AJM = `${R2B}/JMN%20ARTWORK.png`;
const ASM = `${R2B}/Sammie%20Song%20ART.png`;
const ANM = `${R2C}/NEMESIS%20VS%20LADYRYN/NEMESIS%20VS%20LADYRN%20-%20LIKE%20COMMENT%20SUBSCRIBE%20ARTWORK.jpg`;
const AHB = `${R2C}/IMAN%20AFRIKAH%20-%20HIGH-BRED/HIGH-BRED/IMAN%20AFRIKAH%20-%20HIGH-BRED%20ARTWORK.jpg`;
const ASHD = `${R2C}/NEMESIS%20VS%20LADYRYN/grey/SHADOW/SHADOW%20ARTWORK.jpg`;

interface SongMeta { t: string; a: string; img: string }
const SONG_META: Record<string, SongMeta> = {
  // 7ROO7H BASED Vol1
  "1": { t: "Eve's Daughter", a: "7ROO7H BASED", img: A7V1 },
  "8": { t: "OUNCE", a: "7ROO7H BASED", img: A7V1 },
  "10": { t: "ME", a: "7ROO7H BASED", img: A7V1 },
  "11": { t: "GOD'S SIN", a: "7ROO7H BASED", img: A7V1 },
  "12": { t: "ALREADY LOST", a: "7ROO7H BASED", img: A7V1 },
  "13": { t: "7", a: "7ROO7H BASED", img: A7V1 },
  "49": { t: "Eve's Daughter (Alt Mix)", a: "7ROO7H BASED", img: A7V1 },
  // 7ROO7H BASED Vol2
  "57": { t: "DISCORD", a: "7ROO7H BASED", img: A7V2 },
  "58": { t: "DRUNK", a: "7ROO7H BASED", img: A7V2 },
  "59": { t: "I TRY", a: "7ROO7H BASED", img: A7V2 },
  "60": { t: "INCOMPATIBLE", a: "7ROO7H BASED", img: A7V2 },
  "61": { t: "NEVER AGAIN", a: "7ROO7H BASED", img: A7V2 },
  "62": { t: "ONCHAIN", a: "7ROO7H BASED", img: A7V2 },
  "63": { t: "SUPER BASED", a: "7ROO7H BASED", img: A7V2 },
  // 7ROO7H BASED Vol3
  "107": { t: "AGAIN", a: "7ROO7H BASED", img: A7V3 },
  "108": { t: "MATCH MADE IN HEAVEN", a: "7ROO7H BASED", img: A7V3 },
  "109": { t: "IF I COULD", a: "7ROO7H BASED", img: A7V3 },
  "110": { t: "SHNAKKE", a: "7ROO7H BASED", img: A7V3 },
  "111": { t: "TWEAKING", a: "7ROO7H BASED", img: A7V3 },
  "112": { t: "AHEAD OF TIME", a: "7ROO7H BASED", img: A7V3 },
  "113": { t: "MY OWN", a: "7ROO7H BASED", img: A7V3 },
  // 7ROO7H BASED Vol4
  "114": { t: "THE RISING HOPE", a: "7ROO7H BASED", img: A7V4 },
  "115": { t: "NO PLAYSTATION", a: "7ROO7H BASED", img: A7V4 },
  "116": { t: "INFORMA", a: "7ROO7H BASED", img: A7V4 },
  "117": { t: "FADA", a: "7ROO7H BASED", img: A7V4 },
  "118": { t: "MORE LIFE", a: "7ROO7H BASED", img: A7V4 },
  "119": { t: "SELF ADVICE", a: "7ROO7H BASED", img: A7V4 },
  "204": { t: "INSIDE LIBALA RMS", a: "7ROO7H BASED", img: A7V4 },
  // 7ROO7H BASED Vol5
  "120": { t: "THE GARDEN", a: "7ROO7H BASED", img: A7V4 },
  "121": { t: "THE LIGHT HOUSE", a: "7ROO7H BASED", img: A7V4 },
  "122": { t: "THE SUMO WRESLER", a: "7ROO7H BASED", img: A7V4 },
  "123": { t: "THE WIRECABLE", a: "7ROO7H BASED", img: A7V4 },
  "124": { t: "THE GOLDEN STOPWATCH", a: "7ROO7H BASED", img: A7V4 },
  "125": { t: "THE FLOWER", a: "7ROO7H BASED", img: A7V4 },
  "126": { t: "THE DIAMOND PATH", a: "7ROO7H BASED", img: A7V4 },
  // DenaJah
  "2": { t: "Dance", a: "DenaJah", img: ADJ },
  "9": { t: "Alone", a: "DenaJah", img: ADJ },
  "14": { t: "HUNTER", a: "DenaJah", img: ADJ },
  "15": { t: "EMPRESS", a: "DenaJah", img: ADJ },
  "16": { t: "LOVIE", a: "DenaJah", img: ADJ },
  "17": { t: "MY BABY", a: "DenaJah", img: ADJ },
  "18": { t: "COME CLOSER", a: "DenaJah", img: ADJ },
  // IMan Afrikah Vol1
  "3": { t: "Endless", a: "IMan Afrikah", img: AIV1 },
  "31": { t: "GRAVITY GIRLS", a: "IMan Afrikah", img: AIV1 },
  "32": { t: "HEAVENS BOUNCE", a: "IMan Afrikah", img: AIV1 },
  "33": { t: "HOLY WATER", a: "IMan Afrikah", img: AIV1 },
  "34": { t: "MIDNIGHT", a: "IMan Afrikah", img: AIV1 },
  "35": { t: "MOTION", a: "IMan Afrikah", img: AIV1 },
  "36": { t: "SLIME", a: "IMan Afrikah", img: AIV1 },
  // IMan Afrikah Vol2
  "64": { t: "Ghost", a: "IMan Afrikah", img: AIV1 },
  "65": { t: "Mirror Talk", a: "IMan Afrikah", img: AIV1 },
  "66": { t: "Pressure", a: "IMan Afrikah", img: AIV1 },
  "67": { t: "Pressure Proof", a: "IMan Afrikah", img: AIV1 },
  "68": { t: "Space", a: "IMan Afrikah", img: AIV1 },
  "69": { t: "Spirit Bank", a: "IMan Afrikah", img: AIV2 },
  "70": { t: "Top Floor", a: "IMan Afrikah", img: AIV2 },
  // IMan Afrikah Vol3
  "71": { t: "Beautiful Beginning", a: "IMan Afrikah", img: AIV3 },
  "72": { t: "IWE NAINE", a: "IMan Afrikah", img: AIV3 },
  "73": { t: "LOVE IT", a: "IMan Afrikah", img: AIV3 },
  "74": { t: "MELLOW MOOD", a: "IMan Afrikah", img: AIV3 },
  "75": { t: "OPEN UP THE WINDOW", a: "IMan Afrikah", img: AIV3 },
  "76": { t: "SHE TIRED", a: "IMan Afrikah", img: AIV3 },
  "77": { t: "SHOTS ON ME (KILLER)", a: "IMan Afrikah", img: AIV3 },
  // IMan Afrikah Vol4
  "100": { t: "TALKING TO YOU", a: "IMan Afrikah", img: AIV4 },
  "101": { t: "SLOW BURN", a: "IMan Afrikah", img: AIV4 },
  "102": { t: "MOVES DIFFERENT", a: "IMan Afrikah", img: AIV4 },
  "103": { t: "NOTICE YOU", a: "IMan Afrikah", img: AIV4 },
  "104": { t: "STAY A WHILE", a: "IMan Afrikah", img: AIV4 },
  "105": { t: "JUST LIKE THAT", a: "IMan Afrikah", img: AIV4 },
  "106": { t: "MOVE LIKE THAT", a: "IMan Afrikah", img: AIV4 },
  // IMan Afrikah Vol5
  "127": { t: "BIG MOVES", a: "IMan Afrikah", img: AIV5 },
  "128": { t: "EASY", a: "IMan Afrikah", img: AIV5 },
  "129": { t: "HIGHLY FAVOURED", a: "IMan Afrikah", img: AIV5 },
  "130": { t: "KEPT IT PUSHING", a: "IMan Afrikah", img: AIV5 },
  "131": { t: "LET IT BREATH", a: "IMan Afrikah", img: AIV5 },
  "132": { t: "MADE", a: "IMan Afrikah", img: AIV5 },
  "133": { t: "MY LANE", a: "IMan Afrikah", img: AIV5 },
  // IMan Afrikah Vol6
  "134": { t: "BEST WOMAN WALKING", a: "IMan Afrikah", img: AIV6 },
  "135": { t: "BUILT FOR IT", a: "IMan Afrikah", img: AIV6 },
  "136": { t: "GLOW", a: "IMan Afrikah", img: AIV6 },
  "137": { t: "PRAY", a: "IMan Afrikah", img: AIV6 },
  "138": { t: "SPARK", a: "IMan Afrikah", img: AIV6 },
  "139": { t: "SURF", a: "IMan Afrikah", img: AIV6 },
  "140": { t: "UP", a: "IMan Afrikah", img: AIV1 },
  // IMan Afrikah Vol7
  "141": { t: "BRA! BRA!", a: "IMan Afrikah", img: AIV1 },
  "142": { t: "BUZZ", a: "IMan Afrikah", img: AIV1 },
  "143": { t: "END GAME", a: "IMan Afrikah", img: AIV1 },
  "144": { t: "REACTIVE", a: "IMan Afrikah", img: AIV1 },
  "145": { t: "SPEED", a: "IMan Afrikah", img: AIV1 },
  "146": { t: "STEP OUTSUDE", a: "IMan Afrikah", img: AIV7 },
  "147": { t: "SWEET", a: "IMan Afrikah", img: AIV7 },
  // IMan Afrikah 3.0
  "176": { t: "RUDE BOY", a: "IMan Afrikah", img: AI30 },
  "177": { t: "ID FLEX", a: "IMan Afrikah", img: AI30 },
  "178": { t: "LIKKU MISS", a: "IMan Afrikah", img: AI30 },
  "179": { t: "WGE", a: "IMan Afrikah", img: AI30 },
  "180": { t: "TAKE IT HOW YOU WANT", a: "IMan Afrikah", img: AI30 },
  "181": { t: "THROUGH YOU", a: "IMan Afrikah ft Santana", img: AI30 },
  "182": { t: "WILD OUT", a: "IMan Afrikah", img: AI30 },
  // IMan Afrikah Lovers EP
  "190": { t: "KEEP IT TO MYSELF", a: "IMan Afrikah", img: AILV },
  "191": { t: "LIKKU MISS", a: "IMan Afrikah", img: AILV },
  "192": { t: "PASSIONATE EATER", a: "IMan Afrikah", img: AILV },
  "193": { t: "SHE OUTSIDE", a: "IMan Afrikah", img: AILV },
  "194": { t: "THERE SHE GOES", a: "IMan Afrikah", img: AILV },
  "195": { t: "TURN IT UP AGAIN", a: "IMan Afrikah", img: AILV },
  "196": { t: "JIGGY WITH ME (ft TRACEY LOVE)", a: "IMan Afrikah", img: AILV },
  // IMan Afrikah ER'TING FLEX
  "197": { t: "BEEN BAD", a: "IMan Afrikah", img: AIEF },
  "198": { t: "CAN'T LET YOU GO", a: "IMan Afrikah", img: AIEF },
  "199": { t: "ROYALTY", a: "IMan Afrikah", img: AIEF },
  "200": { t: "STYLE UP", a: "IMan Afrikah", img: AIEF },
  "201": { t: "WHEN SHE TOUCH ROAD", a: "IMan Afrikah", img: AIEF },
  "202": { t: "HAVE YOU SEEN HER", a: "IMan Afrikah", img: AIEF },
  "203": { t: "WILD (FT RVSSIAN)", a: "IMan Afrikah", img: AIEF },
  // IMan Afrikah 7USHIMI
  "215": { t: "WORLD CHAMPION GYAL", a: "IMan Afrikah", img: AI7U },
  "216": { t: "LETI NALANTI", a: "IMan Afrikah", img: AI7U },
  "217": { t: "NO B.S", a: "IMan Afrikah", img: AI7U },
  "218": { t: "EUPHORIA", a: "IMan Afrikah", img: AI7U },
  "219": { t: "HURTACHE", a: "IMan Afrikah", img: AI7U },
  "220": { t: "SHE WILL ALWAYS BE PERFECT", a: "IMan Afrikah", img: AI7U },
  "221": { t: "HIGHLY POSITIVE", a: "IMan Afrikah", img: AI7U },
  // NDA Vol1
  "4": { t: "Shadow Work", a: "NDA", img: AN1 },
  "19": { t: "ANCESTRAL FREQUENCY", a: "NDA", img: AN1 },
  "20": { t: "COPPER BLOOD", a: "NDA", img: AN1 },
  "21": { t: "SERPENT FREQUENCY", a: "NDA", img: AN1 },
  "22": { t: "THE AWAKENING", a: "NDA", img: AN1 },
  "23": { t: "THE REBIRTH CODE", a: "NDA", img: AN1 },
  "24": { t: "VENOM VIRTUE", a: "NDA", img: AN1 },
  // NDA Vol2
  "78": { t: "CALM", a: "NDA", img: AN2 },
  "79": { t: "CAN'T MATCH", a: "NDA", img: AN2 },
  "80": { t: "COME HOME", a: "NDA", img: AN2 },
  "81": { t: "FUEGO", a: "NDA", img: AN2 },
  "82": { t: "MONEY", a: "NDA", img: AN2 },
  "83": { t: "PREACH", a: "NDA", img: AN2 },
  "84": { t: "STILL", a: "NDA", img: AN2 },
  // NDA Vol3
  "148": { t: "3AM", a: "NDA", img: AN3 },
  "149": { t: "BACK ON MY SHIT", a: "NDA", img: AN3 },
  "150": { t: "BITTERSWEET ESCAPE", a: "NDA", img: AN3 },
  "151": { t: "BOSSED UP", a: "NDA", img: AN3 },
  "152": { t: "CROSSED LINES", a: "NDA", img: AN3 },
  "153": { t: "FLOOD", a: "NDA", img: AN3 },
  "154": { t: "LEO", a: "NDA", img: AN1 },
  // NDA Vol4
  "169": { t: "DO YOU DIGG", a: "NDA", img: AN4 },
  "170": { t: "1 OF 1", a: "NDA", img: AN4 },
  "171": { t: "ACE", a: "NDA", img: AN4 },
  "172": { t: "BEAMM", a: "NDA", img: AN4 },
  "173": { t: "BIEH", a: "NDA", img: AN4 },
  "174": { t: "YEAH", a: "NDA", img: AN4 },
  "175": { t: "ROACHES AND RATS", a: "NDA", img: AN4 },
  // NDA Vol5
  "155": { t: "2.22", a: "NDA", img: AN5 },
  "156": { t: "4.44", a: "NDA", img: AN5 },
  "157": { t: "ELEMENT", a: "NDA", img: AN5 },
  "158": { t: "Gbona", a: "NDA", img: AN5 },
  "159": { t: "GiRL FROM LTC", a: "NDA", img: AN5 },
  "160": { t: "married to the grind", a: "NDA", img: AN5 },
  "161": { t: "POUR UP", a: "NDA", img: AN5 },
  // NDA Vol6
  "162": { t: "BAD TO THE BONE", a: "NDA", img: AN6 },
  "163": { t: "CLEAN", a: "NDA", img: AN6 },
  "164": { t: "FROZE", a: "NDA", img: AN6 },
  "165": { t: "I'M HIM", a: "NDA", img: AN6 },
  "166": { t: "LOST MORALS", a: "NDA", img: AN6 },
  "167": { t: "REAL ONE", a: "NDA", img: AN6 },
  "168": { t: "STILL WATCHING", a: "NDA", img: AN6 },
  // PRP Vol1
  "5": { t: "ALE TI", a: "PRP", img: AP1 },
  "25": { t: "LOVE & SHELTER", a: "PRP", img: AP1 },
  "26": { t: "MAMI RHODA", a: "PRP", img: AP1 },
  "27": { t: "VIBE", a: "PRP", img: AP1 },
  "28": { t: "LOVE YOU", a: "PRP", img: AP1 },
  "29": { t: "ME", a: "PRP", img: AP1 },
  "30": { t: "EYA", a: "PRP", img: AP1 },
  // PRP Vol2
  "85": { t: "EVEN ME", a: "PRP", img: AP2 },
  "86": { t: "EX", a: "PRP", img: AP2 },
  "87": { t: "KEEP", a: "PRP", img: AP2 },
  "88": { t: "KEYS", a: "PRP", img: AP2 },
  "89": { t: "NO LIMITS", a: "PRP", img: AP2 },
  "90": { t: "PANADO", a: "PRP", img: AP2 },
  "91": { t: "TELL ME", a: "PRP", img: AP2 },
  // Sanchy
  "6": { t: "Midnight", a: "Sanchy", img: ASC },
  "37": { t: "ANXIETY", a: "Sanchy", img: ASC },
  "38": { t: "GODDESS MODE", a: "Sanchy", img: ASC },
  "39": { t: "HONEY BURN", a: "Sanchy", img: ASC },
  "40": { t: "NO APOLOGY", a: "Sanchy", img: ASC },
  "41": { t: "SACRED SEDUCTION", a: "Sanchy", img: ASC },
  "42": { t: "SWEET HEAT", a: "Sanchy", img: ASC },
  // Santana Vol1
  "7": { t: "Brick By Brick", a: "Santana", img: AST1 },
  "43": { t: "DEVINE", a: "Santana", img: AST1 },
  "44": { t: "POISON", a: "Santana", img: AST1 },
  "45": { t: "QUEEN", a: "Santana", img: AST1 },
  "46": { t: "SHAKE", a: "Santana", img: AST1 },
  "47": { t: "SLOW FIRE", a: "Santana", img: AST1 },
  "48": { t: "WORLDS APART", a: "Santana", img: AST1 },
  // Santana Vol2
  "183": { t: "BUMBLE BEE", a: "Santana", img: AST2 },
  "184": { t: "DIAL TONE", a: "Santana", img: AST2 },
  "185": { t: "GNB", a: "Santana", img: AST2 },
  "186": { t: "NYASH", a: "Santana", img: AST2 },
  "187": { t: "CHERIE", a: "Santana", img: AST2 },
  "188": { t: "NYASH EXT", a: "Santana", img: AST2 },
  "189": { t: "SOKO", a: "Santana", img: AST2 },
  // Santana Vol3
  "205": { t: "BABY MAMA", a: "Santana", img: AST3 },
  "206": { t: "ENTANGLEMENT", a: "Santana", img: AST3 },
  "207": { t: "GOOD BAD ENERGY", a: "Santana", img: AST3 },
  "208": { t: "GRAVITY", a: "Santana", img: AST3 },
  "209": { t: "MARY GO ROUND", a: "Santana", img: AST3 },
  "210": { t: "NONCOMMITTAL", a: "Santana", img: AST3 },
  "211": { t: "STEAK & LOBSTER", a: "Santana", img: AST3 },
  // FAITH
  "50": { t: "UNTAMED", a: "FAITH", img: AFT },
  "51": { t: "RISE", a: "FAITH", img: AFT },
  "52": { t: "LION HEART", a: "FAITH", img: AFT },
  "53": { t: "GOLD AURA", a: "FAITH", img: AFT },
  "54": { t: "CROWN UP", a: "FAITH", img: AFT },
  "55": { t: "RADIANT", a: "FAITH", img: AFT },
  "56": { t: "NO SEATS", a: "FAITH", img: AFT },
  // JMN
  "92": { t: "LATE NIGHT", a: "JMN", img: AJM },
  "93": { t: "PARTY", a: "JMN", img: AJM },
  "94": { t: "OWN IT", a: "JMN", img: AJM },
  // SAMMIE
  "95": { t: "EYES ON ME", a: "SAMMIE", img: ASM },
  "96": { t: "LET GO", a: "SAMMIE", img: ASM },
  "97": { t: "NOBODY", a: "SAMMIE", img: ASM },
  "98": { t: "THE ONE", a: "SAMMIE", img: ASM },
  "99": { t: "LOVE", a: "SAMMIE", img: ASM },
  // NEMESISvsLADYRYN
  "212": { t: "Block is Hot", a: "NEMESISvsLADYRYN", img: ANM },
  "213": { t: "Vib3", a: "NEMESISvsLADYRYN", img: ANM },
  "214": { t: "Gr3Y", a: "NEMESISvsLADYRYN", img: ANM },
  // IMAN AFRIKAH HIGH-BRED
  "225": { t: "10 10", a: "IMAN AFRIKAH", img: AHB },
  "226": { t: "BUILD A BETTER WORLD", a: "IMAN AFRIKAH", img: AHB },
  "227": { t: "CAME A LONG WAY", a: "IMAN AFRIKAH", img: AHB },
  "228": { t: "FINALLY THEY PUT ME ON", a: "IMAN AFRIKAH", img: AHB },
  "229": { t: "IYA PEOPLE SONG", a: "IMAN AFRIKAH", img: AHB },
  "230": { t: "LATELY ALOT", a: "IMAN AFRIKAH", img: AHB },
  "231": { t: "THE BIGMAN CALL", a: "IMAN AFRIKAH", img: AHB },
  // NEMESISvsLADYRYN SHADOW single
  "232": { t: "SHADOW", a: "NEMESISvsLADYRYN", img: ASHD },
};

export default async function handler(req: any, res: any) {
  const id = String(req.query?.id || "").trim();

  if (!id || !/^\d+$/.test(id)) {
    res.statusCode = 302;
    res.setHeader("Location", "/");
    res.end();
    return;
  }

  const songUrl = `https://songchainn.xyz/song/${id}`;
  const logoUrl = "https://songchainn.xyz/songchainn-logo.webp";

  // Use hardcoded lookup as primary source
  const meta = SONG_META[id];
  let title = meta?.t || "$ongChainn";
  let artist = meta?.a || "";
  let img = meta?.img || logoUrl;

  // Enrich from DB if available (fills gaps for songs not in SONG_META)
  if (!meta) {
    const supabaseUrl =
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      "";

    if (supabaseUrl && supabaseKey) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, supabaseKey, {
          auth: { persistSession: false },
        });
        const { data } = await supabase
          .from("songs")
          .select("title, artist_name, cover_art_url")
          .eq("id", id)
          .maybeSingle();

        if (data) {
          if (data.title) title = data.title;
          if (data.artist_name) artist = data.artist_name;
          if (data.cover_art_url) img = data.cover_art_url;
        }
      } catch {
        // keep defaults
      }
    }
  }

  const displayTitle = artist ? `${title} — ${artist}` : title;
  const description = artist
    ? `Listen to "${title}" by ${artist} on $ongChainn`
    : "Listen on $ongChainn";

  const fcFrameJson = JSON.stringify({
    version: "next",
    imageUrl: img,
    button: {
      title: "🎵 Listen Now",
      action: {
        type: "launch_frame",
        name: "$ongChainn",
        url: songUrl,
        splashImageUrl: logoUrl,
        splashBackgroundColor: "#1a0533",
      },
    },
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(displayTitle)} | $ongChainn</title>

  <meta property="og:title" content="${esc(displayTitle)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${esc(img)}" />
  <meta property="og:image:width" content="800" />
  <meta property="og:image:height" content="800" />
  <meta property="og:url" content="${esc(songUrl)}" />
  <meta property="og:type" content="music.song" />
  <meta property="og:site_name" content="$ongChainn" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(displayTitle)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(img)}" />
  <meta name="twitter:site" content="@songchainn" />

  <meta name="fc:frame" content="${esc(fcFrameJson)}" />

  <meta http-equiv="refresh" content="0;url=${esc(songUrl)}" />
</head>
<body style="margin:0;background:#0a0a0a;">
  <script>window.location.replace("${songUrl.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}");</script>
  <noscript><a href="${esc(songUrl)}">Click to listen</a></noscript>
</body>
</html>`;

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=3600, stale-while-revalidate=86400"
  );
  res.end(html);
}
