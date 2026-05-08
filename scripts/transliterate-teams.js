/**
 * scripts/transliterate-teams.js
 *
 * Translates English team names (where nameHe == nameEn) to Hebrew.
 * Strategy: split into known club prefix + city/area suffix, translate each.
 *
 * Usage:
 *   node scripts/transliterate-teams.js            -- dry run
 *   node scripts/transliterate-teams.js --apply    -- write to DB
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

// Club / org prefixes (case-insensitive)
const PREFIXES = {
  'Hapoel': 'הפועל',
  'Maccabi': 'מכבי',
  'Beitar': 'בית"ר',
  'Beitar': 'בית"ר',
  'Ironi': 'עירוני',
  'Bnei': 'בני',
  'Ihud': 'איחוד',
  'Ihoud': 'איחוד',
  'Sektzia': 'סקציה',
  'Hapoel Ironi': 'הפועל עירוני',
  'MS': 'מ.ס.',
  'M.S.': 'מ.ס.',
  'AS': 'א.ס.',
  'A.S.': 'א.ס.',
  'FC': '',
  'F.C.': '',
  'SC': 'ס.ק.',
  'Football Club': '',
};

// Cities / areas — most common Israeli locations
const PLACES = {
  'Tel Aviv': 'תל אביב',
  'Tel-Aviv': 'תל אביב',
  'Beer Sheva': 'באר שבע',
  "Be'er Sheva": 'באר שבע',
  'Beer-Sheva': 'באר שבע',
  'Beersheba': 'באר שבע',
  'Jerusalem': 'ירושלים',
  'Haifa': 'חיפה',
  'Netanya': 'נתניה',
  'Petah Tikva': 'פתח תקווה',
  'Petach Tikva': 'פתח תקווה',
  'Petah-Tikva': 'פתח תקווה',
  'Ashdod': 'אשדוד',
  'Ashkelon': 'אשקלון',
  'Hadera': 'חדרה',
  'Sakhnin': 'סכנין',
  'Bnei Sakhnin': 'בני סכנין',
  'Kfar Saba': 'כפר סבא',
  'Kfar-Saba': 'כפר סבא',
  'Raanana': 'רעננה',
  "Ra'anana": 'רעננה',
  'Acre': 'עכו',
  'Akko': 'עכו',
  'Kiryat Shmona': 'קריית שמונה',
  'Kiryat-Shmona': 'קריית שמונה',
  'Kiryat Gat': 'קריית גת',
  'Kiryat Yam': 'קריית ים',
  'Kiryat Ata': 'קריית אתא',
  'Kiryat Ono': 'קריית אונו',
  'Kiryat Malakhi': 'קריית מלאכי',
  'Kiryat Bialik': 'קריית ביאליק',
  'Ramat Gan': 'רמת גן',
  'Rishon LeZion': 'ראשון לציון',
  'Rishon Le Zion': 'ראשון לציון',
  'Rishon-LeZion': 'ראשון לציון',
  'Modiin': 'מודיעין',
  "Modi'in": 'מודיעין',
  'Holon': 'חולון',
  'Bat Yam': 'בת ים',
  'Herzliya': 'הרצליה',
  'Tiberias': 'טבריה',
  'Nazareth': 'נצרת',
  'Nazareth Illit': 'נוף הגליל',
  'Nof HaGalil': 'נוף הגליל',
  'Nof-HaGalil': 'נוף הגליל',
  'Afula': 'עפולה',
  'Lod': 'לוד',
  'Yarka': 'ירכא',
  'Yehud-Monosson': 'יהוד מונוסון',
  'Or Yehuda': 'אור יהודה',
  'Yavne': 'יבנה',
  'Givatayim': 'גבעתיים',
  'Givat Olga': 'גבעת אולגה',
  'Yehuda Tel Aviv': 'יהודה תל אביב',
  'Yehuda': 'יהודה',
  'Bat Hefer': 'בת חפר',
  'Tirat HaCarmel': 'טירת הכרמל',
  'Tirat-HaCarmel': 'טירת הכרמל',
  'Beit Shean': 'בית שאן',
  'Beit Shemesh': 'בית שמש',
  'Beit Dagan': 'בית דגן',
  'Bnei Lod': 'בני לוד',
  'Bnei Baqa': 'בני בקעה',
  'Bnei Reineh': 'בני ריינה',
  'Bnei Raina': 'בני ריינה',
  'Eilat': 'אילת',
  'Mevaseret Zion': 'מבשרת ציון',
  'Mevaseret-Zion': 'מבשרת ציון',
  'Ramla': 'רמלה',
  'Rahat': 'רהט',
  'Umm al-Fahm': 'אום אל-פאחם',
  'Umm-al-Fahm': 'אום אל-פאחם',
  'Shefaram': 'שפרעם',
  "Sha'arayim": 'שעריים',
  'Tamra': 'טמרה',
  'Kafr Qara': 'כפר קרע',
  'Kafr-Qara': 'כפר קרע',
  'Kafr Manda': 'כפר מנדא',
  'Kafr Kanna': 'כפר כנא',
  'Maghar': 'מגאר',
  'Daliyat al-Karmel': 'דלית אל כרמל',
  'Daliyat-al-Karmel': 'דלית אל כרמל',
  'Iksal': 'איכסל',
  'Tabla Bridge': 'גשר תבלא',
  'Ramot Menashe': 'רמות מנשה',
  'Ramat HaSharon': 'רמת השרון',
  'Ramat-HaSharon': 'רמת השרון',
  'Nesher': 'נשר',
  'Segev Shalom': 'שגב שלום',
  'Tira': 'טירה',
  'Taibe': 'טייבה',
  'Taybeh': 'טייבה',
  'Taibeh': 'טייבה',
  'Migdal HaEmek': 'מגדל העמק',
  'Mahane Yehuda': 'מחנה יהודה',
  'Katamon Jerusalem': 'קטמון ירושלים',
  'Katamon': 'קטמון',
  'Hadera': 'חדרה',
  'Bika': 'ביכא',
  'Mei Naftoah': 'מי נפתוח',
  'Adamit': 'אדמית',
  'Agam Ha\'amakim': 'אגם העמקים',
  'Aliya': 'עלייה',
  'Asi Gilboa': 'אסי גלבוע',
  'Atzmona': 'עצמונה',
  'Avhanun Yarka': 'אבחנון ירכא',
  'Beit El': 'בית אל',
  'Givat Hen': 'גבעת חן',
  'Hadassim': 'הדסים',
  'Kabri': 'כברי',
  'Kfar Vradim': 'כפר ורדים',
  'Kabul': 'כאבול',
  'Karkur': 'כרכור',
  'Kfar Yona': 'כפר יונה',
  'Pardes Hanna': 'פרדס חנה',
  'Pardes-Hanna': 'פרדס חנה',
  'Naz Sarig': 'נז סריג',
  'Yokneam': 'יקנעם',
  'Zichron Yaakov': 'זכרון יעקב',
  'Bnei Reine': 'בני ריינה',
  'Givat Shmuel': 'גבעת שמואל',
  'Maalot': 'מעלות',
  'Migdal Tefen': 'מגדל תפן',
  'Yehud-Monosson': 'יהוד מונוסון',
  'Karmiel': 'כרמיאל',
  'Sderot': 'שדרות',
  'Beit Yaakov': 'בית יעקב',
  'Bik\'at Beit Hakerem': 'בקעת בית הכרם',
  'Tzomet HaSharon': 'צומת השרון',
  'Mazkeret Batya': 'מזכרת בתיה',
  'Misgav': 'מסגב',
};

// Suffixes
const SUFFIXES = {
  'Under 19': 'נוער',
  'U19': 'נוער',
  'U-19': 'נוער',
  'Under-19': 'נוער',
  'Women': 'נשים',
  "Women's": 'נשים',
  // Special edge cases — full team modifiers
};

// Sort keys by length (descending) so longer matches win
const sortedPlaces = Object.keys(PLACES).sort((a, b) => b.length - a.length);
const sortedSuffixes = Object.keys(SUFFIXES).sort((a, b) => b.length - a.length);
const sortedPrefixes = Object.keys(PREFIXES).sort((a, b) => b.length - a.length);

function transliterateTeam(nameEn) {
  let working = nameEn.trim();

  // Strip suffixes (Under 19, Women) — keep marker for re-add
  let suffix = '';
  for (const sfx of sortedSuffixes) {
    const re = new RegExp(`\\b${sfx.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(working)) {
      suffix = SUFFIXES[sfx];
      working = working.replace(re, '').trim();
    }
  }

  // Strip "FC", "F.C.", "AFC", "Football Club"
  working = working.replace(/\b(A?F\.?C\.?|Football Club)\b/gi, '').trim();
  // Collapse double spaces
  working = working.replace(/\s+/g, ' ');

  // Try matching prefix
  let prefix = '';
  for (const pfx of sortedPrefixes) {
    if (PREFIXES[pfx] && working.toLowerCase().startsWith(pfx.toLowerCase())) {
      prefix = PREFIXES[pfx];
      working = working.slice(pfx.length).trim();
      break;
    }
  }

  // Try to match remaining as a place
  let place = '';
  // Try longer matches first
  for (const p of sortedPlaces) {
    if (working.toLowerCase() === p.toLowerCase()) {
      place = PLACES[p];
      working = '';
      break;
    }
  }
  // If no exact match, try starts-with
  if (!place) {
    for (const p of sortedPlaces) {
      if (working.toLowerCase().startsWith(p.toLowerCase())) {
        place = PLACES[p];
        working = working.slice(p.length).trim();
        break;
      }
    }
  }

  // If we got nothing, return null (skip — keep original)
  if (!prefix && !place) return null;

  // Build Hebrew name
  let hebrew = '';
  if (prefix) hebrew += prefix;
  if (place) hebrew += (hebrew ? ' ' : '') + place;
  if (working) hebrew += ' ' + working; // leftover word — keep as-is
  if (suffix) hebrew += ' ' + suffix;

  return hebrew.trim();
}

async function main() {
  const teams = await prisma.team.findMany({
    select: { id: true, nameHe: true, nameEn: true },
  });

  let translated = 0;
  let skipped = 0;
  const skippedNames = [];

  for (const t of teams) {
    if (!t.nameEn) { skipped++; continue; }
    // Only translate when nameHe is empty or English (== nameEn)
    if (t.nameHe && t.nameHe !== t.nameEn && /[֐-׿]/.test(t.nameHe)) {
      // already Hebrew
      continue;
    }
    const heb = transliterateTeam(t.nameEn);
    if (!heb) {
      skipped++;
      skippedNames.push(t.nameEn);
      continue;
    }
    if (APPLY) {
      await prisma.team.update({ where: { id: t.id }, data: { nameHe: heb } });
    }
    translated++;
    if (translated <= 12) console.log(`  ${t.nameEn}  →  ${heb}`);
  }

  console.log(`\n${APPLY ? '✓ Applied' : '[DRY RUN]'}: ${translated} translated, ${skipped} skipped`);
  if (skippedNames.length > 0 && skippedNames.length <= 30) {
    console.log('\nSkipped (no rule matched):');
    for (const n of skippedNames) console.log('  ' + n);
  } else if (skippedNames.length > 30) {
    console.log(`\nSkipped ${skippedNames.length} names (showing 30):`);
    for (const n of skippedNames.slice(0, 30)) console.log('  ' + n);
  }

  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); prisma.$disconnect(); process.exit(1); });
