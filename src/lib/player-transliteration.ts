/**
 * Transliterates untranslated player names (nameHe contains Latin chars) to Hebrew.
 * Used both in the admin fetch pipeline and as a standalone backfill script.
 */

import prisma from '@/lib/prisma';

// ─── First name lookup ────────────────────────────────────────────────────────

const FIRST_NAMES: Record<string, string> = {
  // ── Israeli / Hebrew ──
  Avi: 'אבי', Avia: 'אביה', Aviad: 'אביעד', Avigdor: 'אביגדור', Avital: 'אביטל',
  Avner: 'אבנר', Avraham: 'אברהם', Amir: 'אמיר', Amit: 'עמית', Amram: 'עמרם',
  Ariel: 'אריאל', Asaf: 'אסף', Asher: 'אשר',
  Bar: 'בר', Ben: 'בן', Binyamin: 'בנימין',
  Dan: 'דן', Dani: 'דני', Daniel: 'דניאל', Dario: 'דריו', David: 'דוד',
  Denny: 'דני', Dor: 'דור', Dori: 'דורי', Doron: 'דורון', Dror: 'דרור',
  Eden: 'עדן', Edan: 'עידן', Idan: 'עידן', Erez: 'ארז',
  Elad: 'אלעד', Eli: 'אלי', Eliad: 'אליעד', Eliav: 'אליאב', Elior: 'אליאור',
  Eliyahu: 'אליהו', Elon: 'אלון', Alon: 'אלון',
  Eran: 'ערן', Oren: 'אורן', Ofer: 'עופר', Ofek: 'אופק',
  Etai: 'איתי', Itai: 'איתי', Itay: 'איתי', Eytam: 'איתם', Itam: 'איתם',
  Itamar: 'איתמר',
  Eyal: 'איל', Eytan: 'איתן', Etan: 'איתן',
  Gal: 'גל', Gali: 'גלי', Gilad: 'גלעד', Gil: 'גיל', Golan: 'גולן',
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
  Ohad: 'אוהד', Omri: 'עומרי', Omer: 'עומר', Ori: 'אורי',
  Oriel: 'אוריאל', Uriel: 'אוריאל', Uri: 'אורי',
  Paz: 'פז',
  Ram: 'רם', Ran: 'ראן', Raz: 'רז', Reef: 'ריף', Rif: 'ריף',
  Roi: 'רועי', Roei: 'רועי', Roee: 'רועי',
  Ron: 'רון', Roni: 'רוני', Roy: 'רועי',
  Saar: 'סאר', Sagi: 'שגיא', Saied: 'סעיד', Shavit: 'שביט',
  Shay: 'שי', Shai: 'שי', Shahar: 'שחר', Shon: 'שון', Sean: 'שון',
  Shlomi: 'שלומי', Shlomo: 'שלמה',
  Tal: 'טל', Tamir: 'תמיר', Tom: 'תום', Tomer: 'תומר', Tyrese: 'טיירז',
  Tzahi: 'צחי', Tzach: 'צח', Tzvi: 'צבי',
  Yaniv: 'יניב', Yaad: 'יעד', Yair: 'יאיר', Yarden: 'ירדן', Yaron: 'ירון',
  Yehuda: 'יהודה', Yuval: 'יובל', Yoav: 'יואב', Yoel: 'יואל',
  Yoram: 'יורם', Yossi: 'יוסי', Yosef: 'יוסף',
  Ziv: 'זיב',
  Aharon: 'אהרון', Aaron: 'אהרון', Nawi: 'נאווי',
  // ── Arabic ──
  Ahmad: 'אחמד', Ahmed: 'אחמד', Anis: 'אניס',
  Bilal: 'בילאל',
  Firas: 'פירס',
  Haitham: 'הייתם', Hamza: 'חמזה',
  Ibrahim: 'אברהים',
  Jihad: "ג'יהאד",
  Karim: 'כרים', Khalil: "ח'ליל",
  Mahmoud: 'מחמוד', Muhamad: 'מוחמד', Mohammed: 'מוחמד', Mohammad: 'מוחמד',
  Murad: 'מוראד',
  Nashat: 'נשאת', Nasser: 'נאסר',
  Omar: 'עומר',
  Samir: 'סמיר', Samer: 'סמיר', Salem: 'סאלם',
  Waseem: 'וסים', Walid: 'וליד',
  Youssef: 'יוסף', Younes: 'יונס',
  // ── Slavic / Eastern European ──
  Aleksander: 'אלכסנדר', Alexander: 'אלכסנדר', Aleksandr: 'אלכסנדר',
  Andrija: 'אנדריה', Andrei: 'אנדריי', Andrey: 'אנדריי',
  Boris: 'בוריס',
  Danijel: 'דניאל', Dmitri: 'דמיטרי',
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
  // ── Western / African / Latin ──
  Anthony: 'אנתוני',
  Benjamin: 'בנימין', Boni: 'בוני',
  Carlos: 'קארלוס', Christian: 'כריסטיאן', Christopher: 'כריסטופר',
  Eduardo: 'אדוארדו', Emeka: 'אמקה',
  Fabio: 'פביו', Frederic: 'פרדריק',
  George: "ג'ורג'",
  Heitor: 'הייטור', Henry: 'הנרי',
  Ismael: 'ישמאעל',
  Jean: "ז'אן", John: "ג'ון",
  Kevin: 'קווין',
  Larry: 'לארי', Luwagga: 'לובגה',
  Marc: 'מארק', Marcos: 'מארקוס', Mario: 'מאריו',
  Nicholas: 'ניקולס', Nicolas: 'ניקולס',
  Patrick: 'פטריק', Pedro: 'פדרו',
  Rafael: 'רפאל', Regis: "רג'יס", Roberto: 'רוברטו',
  Samuel: 'סמואל',
  Thomas: 'תומאס', Timothy: 'טימותי',
  Weslley: 'ווסלי', William: 'וויליאם',
  Yasmao: 'יסמאו',
};

// ─── Last name lookup ─────────────────────────────────────────────────────────

const LAST_NAMES: Record<string, string> = {
  Abuhazeira: 'אבוחצירה', Abutbul: 'אבוטבול',
  Addo: 'אדו', Altman: 'אלטמן', Altmann: 'אלטמן', Angulo: 'אנגולו',
  Asante: 'אסנטה', Asulin: 'אסולין', Aviv: 'אביב', Azulay: 'אזולאי',
  Amar: 'עמאר', Ambar: 'אמבר', Arbel: 'ארבל',
  Badash: 'בדש', Balay: 'בלאי', Bar: 'בר', Barda: 'ברדה',
  Baruchyan: 'ברוכיאן', Bemba: 'במבה', Ben: 'בן', Biton: 'ביטון',
  Boganim: 'בוגנים',
  Camara: 'קמארה', Cohen: 'כהן',
  Dahan: 'דהן', Dasa: 'דסה', David: 'דוד', Diba: 'דיבה',
  Edri: 'אדרי', Elkayam: 'אלקיים',
  Ferber: 'פרבר',
  Gabay: 'גבאי', Gerafi: 'גרפי', Gonen: 'גונן', Gropper: 'גרופר',
  Haim: 'חיים',
  Israeli: 'ישראלי',
  Kabeda: 'קאבדה', Kadosh: 'קדוש', Katz: 'כץ', Kizito: 'קיזיטו',
  Krichak: "קריצ'ק", Kričak: "קריצ'ק",
  Layous: 'לאיוס', Levi: 'לוי', Levy: 'לוי',
  Machini: "מאצ'יני", Madmon: 'מדמון', Mahajne: "מהאג'נה", Malul: 'מלול',
  Mazal: 'מזל', Melamed: 'מלמד', Mishpati: 'משפטי',
  Mizrahi: 'מזרחי', Mizrachi: 'מזרחי', Morozov: 'מורוזוב',
  Ndo: 'נדו', Niddam: 'נידם', Nir: 'ניר', Noy: 'נוי',
  Ohayon: 'אוחיון',
  Peretz: 'פרץ', Pini: 'פיני', Pinto: 'פינטו',
  Radulovic: "ראדולוביץ'", Radulović: "ראדולוביץ'",
  Revivo: 'רביבו', Rosen: 'רוזן', Rotman: 'רוטמן',
  Sabag: 'סבג', Sahiti: 'סהיטי', Salem: 'סאלם', Serdal: 'סרדל',
  Shlomo: 'שלמה', Sissokho: 'סיסוקו',
  Stojic: "סטויץ'", Stojić: "סטויץ'",
  Trau: 'טראו', Tzedaka: 'צדקה',
  Weinberg: 'ויינברג',
  Zafrani: 'זפרני', Zikri: 'זיקרי',
  Zuparic: "ז'ופריץ'", Župarić: "ז'ופריץ'",
  Altunashvili: 'אלטונשווילי',
};

// ─── Phonetic transliteration ─────────────────────────────────────────────────

const DIGRAPHS: [string, string][] = [
  ['sh', 'ש'], ['ch', 'ח'], ['th', 'ת'], ['ph', 'פ'],
  ['tz', 'צ'], ['ts', 'צ'], ['gh', 'ג'],
  ['qu', 'קו'], ['ck', 'ק'], ['kh', 'ח'],
  ['dj', "ג'"], ['zh', "ז'"],
];

const SINGLE: Record<string, string> = {
  a: 'א', b: 'ב', c: 'ק', d: 'ד', e: 'ע', f: 'פ', g: 'ג', h: 'ה',
  i: 'י', j: "ג'", k: 'ק', l: 'ל', m: 'מ', n: 'נ', o: 'ו', p: 'פ',
  q: 'ק', r: 'ר', s: 'ס', t: 'ט', u: 'ו', v: 'ב', w: 'ו', x: 'קס',
  y: 'י', z: 'ז',
};

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

const FINAL_FORMS: Record<string, string> = {
  'נ': 'ן', 'מ': 'ם', 'פ': 'ף', 'כ': 'ך', 'צ': 'ץ',
};

function normalizeAccents(s: string): string {
  return s
    .replace(/[àáâãä]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o').replace(/[ùúûü]/g, 'u').replace(/[ýÿ]/g, 'y')
    .replace(/[čć]/g, 'c').replace(/š/g, 's').replace(/ž/g, 'z').replace(/đ/g, 'd')
    .replace(/ñ/g, 'n').replace(/ő/g, 'o').replace(/ą/g, 'a')
    .replace(/[ę]/g, 'e').replace(/ń/g, 'n').replace(/ū/g, 'u').replace(/ī/g, 'i')
    .replace(/['']/g, '');
}

export function phoneticTransliterate(word: string): string {
  if (!word) return '';
  const normalized = normalizeAccents(word);
  const lower = normalized.toLowerCase().replace(/[^a-z]/g, '');
  if (!lower) return word;

  let result = '';
  let i = 0;

  while (i < lower.length) {
    const di = lower.slice(i, i + 2);
    const digraphMatch = DIGRAPHS.find(([d]) => d === di);
    if (digraphMatch) {
      result += digraphMatch[1];
      i += 2;
      continue;
    }

    const ch = lower[i];
    const prevIsVowel = i > 0 && VOWELS.has(lower[i - 1]);

    if (VOWELS.has(ch)) {
      if (result === '') {
        result += 'א';
        if (ch === 'i' || ch === 'y') result += 'י';
        else if (ch === 'u' || ch === 'o') result += 'ו';
      } else if (!prevIsVowel) {
        if (ch === 'i') result += 'י';
        else if (ch === 'o' || ch === 'u') result += 'ו';
      }
    } else if (ch === 'y') {
      result += 'י';
    } else {
      const prev = result[result.length - 1];
      const mapped = SINGLE[ch] ?? '';
      if (mapped && mapped !== prev) result += mapped;
    }
    i++;
  }

  const last = result[result.length - 1];
  if (last && FINAL_FORMS[last]) {
    result = result.slice(0, -1) + FINAL_FORMS[last];
  }

  return result || word;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
}

export function translatePlayerName(firstNameEn: string | null, lastNameEn: string | null): string {
  const firstName = (firstNameEn ?? '').split(/\s+/)[0];
  const lastNameRaw = (lastNameEn ?? '').split(/\s+/)[0];

  const firstHe =
    FIRST_NAMES[firstName] ?? FIRST_NAMES[capitalize(firstName)] ?? phoneticTransliterate(firstName);

  const lastHe =
    LAST_NAMES[lastNameRaw] ?? LAST_NAMES[capitalize(lastNameRaw)] ?? phoneticTransliterate(lastNameRaw);

  return `${firstHe} ${lastHe}`.trim();
}

// ─── Batch transliterate players for a given season ──────────────────────────

const LATIN = /[a-zA-Z]/;

export async function transliterateSeasonPlayers(seasonId: string): Promise<number> {
  const players = await prisma.player.findMany({
    where: { team: { seasonId } },
    select: { id: true, nameEn: true, nameHe: true, firstNameEn: true, lastNameEn: true },
  });

  const untranslated = players.filter((p) => LATIN.test(p.nameHe ?? ''));
  if (!untranslated.length) return 0;

  let updated = 0;

  for (const player of untranslated) {
    let translated: string;

    if (!player.firstNameEn && !player.lastNameEn) {
      const parts = (player.nameEn ?? '').split(/\s+/);
      translated = parts.map(phoneticTransliterate).join(' ');
    } else {
      translated = translatePlayerName(player.firstNameEn, player.lastNameEn);
    }

    if (!translated || LATIN.test(translated)) continue;

    await prisma.player.update({ where: { id: player.id }, data: { nameHe: translated } });
    updated++;
  }

  return updated;
}
