/**
 * scripts/transliterate-players.js
 *
 * Transliterates untranslated player names (nameHe contains Latin chars) to Hebrew.
 *
 * Usage:
 *   node scripts/transliterate-players.js            -- dry run (preview only)
 *   node scripts/transliterate-players.js --apply    -- write to DB
 *   node scripts/transliterate-players.js --season 2024 --apply
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DRY_RUN = !process.argv.includes('--apply');
const ALL_SEASONS = process.argv.includes('--all');
const SEASON_YEAR = (() => {
  const idx = process.argv.indexOf('--season');
  return idx !== -1 ? parseInt(process.argv[idx + 1], 10) : 2025;
})();

// ─── First name lookup (English → Hebrew) ────────────────────────────────────
// Covers the most common Israeli + Arabic + common foreign names in Israeli football

const FIRST_NAMES = {
  // ── Israeli / Hebrew ──
  Avi: 'אבי', Avia: 'אביה', Aviad: 'אביעד', Avigdor: 'אביגדור', Avital: 'אביטל',
  Avner: 'אבנר', Avraham: 'אברהם', Amir: 'אמיר', Amit: 'עמית', Amram: 'עמרם',
  Ariel: 'אריאל', Asaf: 'אסף', Asher: 'אשר',
  Bar: 'בר', Ben: 'בן', Binyamin: 'בנימין',
  Dan: 'דן', Dani: 'דני', Daniel: 'דניאל', Dario: 'דריו', David: 'דוד',
  Denny: 'דני', Dor: 'דור', Dori: 'דורי', Doron: 'דורון',
  Eden: 'עדן', Edan: 'עידן', Idan: 'עידן', Erez: 'ארז',
  Elad: 'אלעד', Eli: 'אלי', Eliad: 'אליעד', Eliav: 'אליאב', Elior: 'אליאור',
  Eliyahu: 'אליהו', Elon: 'אלון', Alon: 'אלון',
  Eran: 'ערן', Oren: 'אורן', Ofer: 'עופר', Ofek: 'אופק',
  Etai: 'איתי', Itai: 'איתי', Itay: 'איתי', Eytam: 'איתם', Itam: 'איתם',
  Itamar: 'איתמר',
  Eyal: 'איל', Eytan: 'איתן', Etan: 'איתן',
  Gal: 'גל', Gali: 'גלי', Gilad: 'גלעד', Gil: 'גיל',
  Guy: 'גיא',
  Haim: 'חיים', Harel: 'הראל', Hisham: 'הישאם',
  Ido: 'עידו',
  Ion: 'יון', Issouf: 'איסוף',
  Jonathan: 'יונתן', Yonatan: 'יונתן', Yoni: 'יוני',
  Kobi: 'קובי', Koby: 'קובי',
  Lior: 'ליאור', Liav: 'ליאב', Liran: 'לירן',
  Maor: 'מאור', Matan: 'מתן', Meir: 'מאיר', Mohamed: 'מוחמד', Moshe: 'משה',
  Michael: 'מיכאל',
  Natan: 'נתן', Nadav: 'נדב', Nevo: 'נבו', Nir: 'ניר', Noam: 'נועם',
  Naor: 'נאור', Noy: 'נוי',
  Ofek: 'אופק', Ohad: 'אוהד', Omri: 'עומרי', Omer: 'עומר', Ori: 'אורי',
  Oriel: 'אוריאל', Uriel: 'אוריאל', Uri: 'אורי',
  Paz: 'פז',
  Ram: 'רם', Ran: 'ראן', Raz: 'רז', Reef: 'ריף', Rif: 'ריף',
  Roi: 'רועי', Roei: 'רועי', Roe: 'רועי',
  Ron: 'רון', Roni: 'רוני',
  Saar: 'סאר', Sagi: 'שגיא', Saied: 'סעיד',
  Shay: 'שי', Shai: 'שי', Shahar: 'שחר', Shon: 'שון', Sean: 'שון',
  Shlomi: 'שלומי', Shlomo: 'שלמה',
  Tal: 'טל', Tamir: 'תמיר', Tom: 'תום', Tomer: 'תומר', Tyrese: 'טיירז',
  Tzahi: 'צחי', Tzach: 'צח', Tzvi: 'צבי',
  Yaniv: 'יניב', Yaad: 'יעד', Yair: 'יאיר', Yarden: 'ירדן', Yaron: 'ירון',
  Yehuda: 'יהודה', Yuval: 'יובל', Yoav: 'יואב', Yoel: 'יואל',
  Yoram: 'יורם', Yossi: 'יוסי', Yosef: 'יוסף', Yoseph: 'יוסף',
  Ziv: 'זיב',
  Aharon: 'אהרון', Aaron: 'אהרון',
  Dror: 'דרור', Golan: 'גולן', Roee: 'רועי', Shavit: 'שביט',
  Roy: 'רועי', Nawi: 'נאווי', Weslley: 'ווסלי', Heitor: 'הייטור',

  // ── Arabic (common in Israeli football) ──
  Ahmad: 'אחמד', Ahmed: 'אחמד', Anis: 'אניס',
  Bilal: 'בילאל',
  Firas: 'פירס',
  Haitham: 'הייתם', Hamza: 'חמזה',
  Ibrahim: 'אברהים',
  Jihad: 'ג\'יהאד',
  Karim: 'כרים', Khalil: 'ח\'ליל',
  Mahmoud: 'מחמוד', Muhamad: 'מוחמד', Mohammed: 'מוחמד', Mohammad: 'מוחמד',
  Murad: 'מוראד',
  Nashat: 'נשאת', Nasser: 'נאסר',
  Omar: 'עומר',
  Samir: 'סמיר', Samer: 'סמיר', Salem: 'סאלם',
  Waseem: 'וסים', Walid: 'וליד',
  Youssef: 'יוסף', Younes: 'יונס',

  // ── Slavic / Eastern European (frequent in Israeli football) ──
  Aleksander: 'אלכסנדר', Alexander: 'אלכסנדר', Aleksandr: 'אלכסנדר',
  Andrija: 'אנדריה', Andrei: 'אנדריי', Andrey: 'אנדריי', Andri: 'אנדרי',
  Boris: 'בוריס',
  Danijel: 'דניאל', Dmitri: 'דמיטרי', Dmitriy: 'דמיטרי',
  Filip: 'פיליפ',
  Goran: 'גורן', Grigori: 'גריגורי',
  Igor: 'איגור', Ivan: 'איוון',
  Kirill: 'קיריל',
  Luka: 'לוקה',
  Marko: 'מרקו', Matej: 'מאטיי', Maxim: 'מקסים', Mihail: 'מיכאיל',
  Milan: 'מילן', Miroslav: 'מירוסלב',
  Nikita: 'ניקיטה', Nikolai: 'ניקולאי', Nikola: 'ניקולה',
  Pavel: 'פאבל', Petar: 'פטר',
  Roman: 'רומן',
  Sandro: 'סנדרו', Sergei: 'סרגיי', Sergey: 'סרגיי',
  Stefan: 'סטפן', Stanislav: 'סטניסלב',
  Taras: 'טראס',
  Valentin: 'ולנטין', Vasily: 'וסילי', Viktor: 'ויקטור', Vladimir: 'ולדימיר',
  Yaroslav: 'ירוסלב', Yuri: 'יורי',

  // ── Western / Latin / African ──
  Anthony: 'אנתוני',
  Benjamin: 'בנימין', Boni: 'בוני',
  Carlos: 'קארלוס', Christian: 'כריסטיאן', Christopher: 'כריסטופר',
  David: 'דוד',
  Eduardo: 'אדוארדו', Emeka: 'אמקה',
  Fabio: 'פביו', Frederic: 'פרדריק',
  George: 'ג\'ורג\'',
  Henry: 'הנרי',
  Ismael: 'ישמאעל',
  Jean: 'ז\'אן', John: 'ג\'ון',
  Kevin: 'קווין',
  Larry: 'לארי', Luwagga: 'לובגה',
  Marc: 'מארק', Marcos: 'מארקוס', Mario: 'מאריו',
  Nicholas: 'ניקולס', Nicolas: 'ניקולס',
  Patrick: 'פטריק', Pedro: 'פדרו',
  Rafael: 'רפאל', Regis: 'רג\'יס', Roberto: 'רוברטו',
  Samuel: 'סמואל', Sevi: 'סווי',
  Thomas: 'תומאס', Timothy: 'טימותי',
  William: 'וויליאם',
  Yasmao: 'יסמאו',
};

// ─── Last name lookup ────────────────────────────────────────────────────────

const LAST_NAMES = {
  // Israeli surnames
  Abuhazeira: 'אבוחצירה', Abutbul: 'אבוטבול',
  Azulay: 'אזולאי', Amar: 'עמאר', Ambar: 'אמבר', Arbel: 'ארבל',
  Asulin: 'אסולין',
  Badash: 'בדש', Balay: 'בלאי', Bar: 'בר', Barda: 'ברדה',
  Baruchyan: 'ברוכיאן', Ben: 'בן', Biton: 'ביטון',
  Cohen: 'כהן', Confino: 'קונפינו',
  Dahan: 'דהן', Dasa: 'דסה',
  Edri: 'אדרי',
  Gabay: 'גבאי', Gerafi: 'גרפי',
  Haim: 'חיים',
  Israeli: 'ישראלי',
  Kadosh: 'קדוש',
  Levi: 'לוי', Levy: 'לוי',
  Melamed: 'מלמד', Mishpati: 'משפטי', Mizrahi: 'מזרחי', Mizrachi: 'מזרחי',
  Nawi: 'נאווי',
  Ohayon: 'אוחיון',
  Peretz: 'פרץ',
  Rosen: 'רוזן',
  Sabag: 'סבג', Salem: 'סאלם', Serdal: 'סרדל', Shlomo: 'שלמה',
  Tzedaka: 'צדקה',
  Zikri: 'זיקרי',
  // Slavic
  Altunashvili: 'אלטונשווילי',
  Ferber: 'פרבר',
  Krichak: 'קריצ\'ק', Kričak: 'קריצ\'ק',
  Morozov: 'מורוזוב',
  Radulovic: 'ראדולוביץ\'', Radulović: 'ראדולוביץ\'',
  Stojic: 'סטויץ\'', Stojić: 'סטויץ\'',
  Zuparic: 'ז\'ופריץ\'', Župarić: 'ז\'ופריץ\'',
  // African / other
  Addo: 'אדו', Angulo: 'אנגולו', Asante: 'אסנטה',
  Bemba: 'במבה', Boganim: 'בוגנים',
  Camara: 'קמארה',
  Diba: 'דיבה',
  Elkayam: 'אלקיים',
  Gerafi: 'גרפי', Gonen: 'גונן', Gropper: 'גרופר',
  Kabeda: 'קאבדה', Kizito: 'קיזיטו',
  Layous: 'לאיוס',
  Machini: 'מאצ\'יני', Madmon: 'מדמון', Mahajne: 'מהאג\'נה', Malul: 'מלול',
  Ndo: 'נדו',
  Pini: 'פיני', Pinto: 'פינטו',
  Revivo: 'רביבו',
  Sahiti: 'סהיטי', Sissokho: 'סיסוקו',
  Trau: 'טראו',
  Weinberg: 'ויינברג',
  Altman: 'אלטמן', Altmann: 'אלטמן', Aviv: 'אביב',
  David: 'דוד',
  Katz: 'כץ',
  Nir: 'ניר', Niddam: 'נידם',
  Rotman: 'רוטמן',
  Zafrani: 'זפרני',
};

// ─── Phonetic transliteration (fallback) ─────────────────────────────────────

const DIGRAPHS = [
  ['sh', 'ש'], ['ch', 'ח'], ['th', 'ת'], ['ph', 'פ'],
  ['tz', 'צ'], ['ts', 'צ'], ['gh', 'ג'],
  ['qu', 'קו'], ['ck', 'ק'], ['kh', 'ח'],
  ['dj', 'ג\''], ['zh', 'ז\''],
];

const SINGLE = {
  a: 'א', b: 'ב', c: 'ק', d: 'ד', e: 'ע', f: 'פ', g: 'ג', h: 'ה',
  i: 'י', j: 'ג\'', k: 'ק', l: 'ל', m: 'מ', n: 'נ', o: 'ו', p: 'פ',
  q: 'ק', r: 'ר', s: 'ס', t: 'ט', u: 'ו', v: 'ב', w: 'ו', x: 'קס',
  y: 'י', z: 'ז',
};

// Letters that create a vowel sound in a consonantal cluster — skip if repeated
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

// Normalize accented / special chars to plain ASCII equivalents
function normalizeAccents(s) {
  return s
    .replace(/[àáâãä]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o').replace(/[ùúûü]/g, 'u').replace(/[ýÿ]/g, 'y')
    .replace(/[čć]/g, 'c').replace(/š/g, 's').replace(/ž/g, 'z').replace(/đ/g, 'd')
    .replace(/ñ/g, 'n').replace(/[łl]/g, 'l').replace(/ő/g, 'o').replace(/ą/g, 'a')
    .replace(/[ę]/g, 'e').replace(/ń/g, 'n').replace(/ū/g, 'u').replace(/ī/g, 'i')
    .replace(/['']/g, ''); // apostrophes in names like N'do
}

function phoneticTransliterate(word) {
  if (!word) return '';
  const normalized = normalizeAccents(word);
  const lower = normalized.toLowerCase().replace(/[^a-z]/g, '');
  if (!lower) return word; // couldn't normalize, return as-is

  let result = '';
  let i = 0;

  while (i < lower.length) {
    // try digraph first
    const di = lower.slice(i, i + 2);
    const digraphMatch = DIGRAPHS.find(([d]) => d === di);
    if (digraphMatch) {
      result += digraphMatch[1];
      i += 2;
      continue;
    }

    const ch = lower[i];
    const isLast = i === lower.length - 1;
    const prevIsVowel = i > 0 && VOWELS.has(lower[i - 1]);
    const nextIsVowel = i < lower.length - 1 && VOWELS.has(lower[i + 1]);

    if (VOWELS.has(ch)) {
      if (result === '') {
        // Word starts with vowel → add א then the vowel letter
        result += 'א';
        if (ch === 'i' || ch === 'y') result += 'י';
        else if (ch === 'u' || ch === 'o') result += 'ו';
      } else if (!prevIsVowel) {
        // Vowel in middle/end: only i→י, o/u→ו; a/e are mostly silent
        if (ch === 'i') result += 'י';
        else if (ch === 'o' || ch === 'u') result += 'ו';
        // a and e are silent inside the word
        // except: 'e' at very end → silent (like "Andre", "Ище")
      }
      // skip consecutive vowels
    } else if (ch === 'y') {
      result += 'י';
    } else {
      // Consonant: skip if same as previous consonant (double letters → single in Hebrew)
      const prev = result[result.length - 1];
      const mapped = SINGLE[ch] || '';
      if (mapped && mapped !== prev) {
        result += mapped;
      } else if (!mapped) {
        // unrecognized char — skip
      }
    }
    i++;
  }

  // Apply Hebrew final letter forms
  const FINAL_FORMS = { 'נ': 'ן', 'מ': 'ם', 'פ': 'ף', 'כ': 'ך', 'צ': 'ץ' };
  const last = result[result.length - 1];
  if (FINAL_FORMS[last]) {
    result = result.slice(0, -1) + FINAL_FORMS[last];
  }

  return result || word;
}

// ─── Main translate function ─────────────────────────────────────────────────

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
}

function translateName(firstNameEn, lastNameEn) {
  // Take only first token of multi-word first name (e.g., "Larry Johan" → "Larry")
  const firstName = (firstNameEn || '').split(/\s+/)[0];
  // Take last token of last name for compound surnames (e.g., "Angulo Riascos" → "Angulo")
  const lastNameRaw = (lastNameEn || '').split(/\s+/)[0];

  const firstHe =
    FIRST_NAMES[firstName] ||
    FIRST_NAMES[capitalize(firstName)] ||
    phoneticTransliterate(firstName);

  const lastHe =
    LAST_NAMES[lastNameRaw] ||
    LAST_NAMES[capitalize(lastNameRaw)] ||
    phoneticTransliterate(lastNameRaw);

  return `${firstHe} ${lastHe}`.trim();
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function processSeasonYear(year) {
  const latinChars = /[a-zA-Z]/;

  const players = await prisma.player.findMany({
    where: { team: { season: { year } } },
    select: {
      id: true, nameEn: true, nameHe: true,
      firstNameEn: true, lastNameEn: true,
      team: { select: { nameHe: true } },
    },
  });

  const untranslated = players.filter((p) => latinChars.test(p.nameHe));

  console.log(`\nעונה ${year}: ${players.length} שחקנים, ${untranslated.length} ללא תרגום`);

  let updated = 0;
  let skipped = 0;

  for (const player of untranslated) {
    let translated;

    if (!player.firstNameEn && !player.lastNameEn) {
      const parts = (player.nameEn || '').split(/\s+/);
      translated = parts.map(phoneticTransliterate).join(' ');
    } else {
      translated = translateName(player.firstNameEn, player.lastNameEn);
    }

    if (!translated || latinChars.test(translated)) {
      skipped++;
      continue;
    }

    if (!DRY_RUN) {
      await prisma.player.update({ where: { id: player.id }, data: { nameHe: translated } });
    }
    updated++;
  }

  console.log(`  ✓ תורגם: ${updated}  ⚠ דולג: ${skipped}`);
  return { updated, skipped };
}

async function main() {
  console.log(DRY_RUN ? '[DRY RUN]' : '[APPLY — שומר לDB]');

  if (ALL_SEASONS) {
    const seasons = await prisma.season.findMany({
      select: { year: true },
      orderBy: { year: 'desc' },
    });
    let totalUpdated = 0;
    let totalSkipped = 0;
    for (const { year } of seasons) {
      const { updated, skipped } = await processSeasonYear(year);
      totalUpdated += updated;
      totalSkipped += skipped;
    }
    console.log(`\nסיכום: ✓ ${totalUpdated} תורגמו  ⚠ ${totalSkipped} דולגו`);
  } else {
    await processSeasonYear(SEASON_YEAR);
    if (DRY_RUN) console.log('\nהפעל עם --apply כדי לשמור לDB');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
