// A felhasználótól érkező szabad szöveges mezők (megjelenített név, cím, leírás) közös
// karakterszabályai. Tiltott karakterek:
// - vezérlőkarakterek (Unicode „Cc”: NUL, sortörés, tabulátor, escape…): a PostgreSQL a NUL
//   karaktert szövegben tárolni sem tudja – ellenőrzés nélkül a beszúrás adatbázishibával (500)
//   állna meg –, a többi megtévesztő megjelenítésre adna módot;
// - a Unicode sor- és bekezdéselválasztója (U+2028, U+2029);
// - a szöveg írásirányát megfordító vezérlők (U+202A–202E, U+2066–2069): ezekkel egy cím másnak
//   látszhat, mint ami (pl. „kep\u202Egpj.exe” → „kepexe.jpg”).
// Forrás: Unicode Technical Report #36 – Unicode Security Considerations (Bidirectional Text
// Spoofing), https://www.unicode.org/reports/tr36/; MDN – Unicode character class escape,
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Unicode_character_class_escape

/** Egysoros mezőkhöz: a szöveg egyetlen tiltott karaktert sem tartalmaz. */
export const NO_CONTROL_CHARACTERS = /^[^\p{Cc}\u2028\u2029\u202A-\u202E\u2066-\u2069]*$/u;

/** Többsoros mezőkhöz (leírás): mint fent, de a sortörés és a tabulátor megengedett. */
export const NO_CONTROL_CHARACTERS_EXCEPT_NEWLINES =
  /^(?:[^\p{Cc}\u2028\u2029\u202A-\u202E\u2066-\u2069]|[\n\r\t])*$/u;

/** A szövegben van legalább egy betű vagy szám (nem csak írásjel vagy láthatatlan karakter). */
export const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * A megjelenítéskor láthatatlan karakterek (Unicode „Default_Ignorable_Code_Point”): pl. a nulla
 * szélességű szóköz és összekötő, az írásirány-jelek, a változatjelölők és a hangul kitöltő karakter
 * – ez utóbbi betűnek számít, mégis üresen jelenik meg.
 * Forrás: Unicode Standard Annex #44 – Unicode Character Database (Default_Ignorable_Code_Point),
 * https://www.unicode.org/reports/tr44/
 */
const INVISIBLE_CHARACTERS = /\p{Default_Ignorable_Code_Point}/gu;

/**
 * A látható karakterek száma: a láthatatlanok nem számítanak bele, és kódpontonként számol (a
 * kiegészítő síkon álló betű – pl. sok CJK-írásjegy – UTF-16-ban két egység, mégis egy karakter).
 */
export const visibleLength = (text: string): number =>
  [...text.replace(INVISIBLE_CHARACTERS, '')].length;

/** Van-e a szövegben látható betű vagy szám (a név vagy a cím ne jelenhessen meg üresen). */
export const hasVisibleLetterOrDigit = (text: string): boolean =>
  HAS_LETTER_OR_DIGIT.test(text.replace(INVISIBLE_CHARACTERS, ''));

/**
 * A Braille üres mintája (U+2800): nem szóköz és nem is „láthatatlan” karakter, mégis üresen
 * jelenik meg – üresnek látszó szövegekhez szokás használni.
 */
const BRAILLE_PATTERN_BLANK = String.fromCodePoint(0x2800);
/** Párosítatlan UTF-16 helyettesítő (surrogate): ebből nem készíthető érvényes UTF-8 */
const LONE_SURROGATE = /\p{Cs}/u;
const LONE_SURROGATES = /\p{Cs}/gu;
const REPLACEMENT_CHARACTER = String.fromCodePoint(0xfffd);
const WHITESPACE = /\s/u;

/** Üresen megjelenő vagy tartalom nélküli karakter: szóköz, Braille-üres minta, hibás karakter. */
const isBlank = (character: string): boolean =>
  WHITESPACE.test(character) ||
  character === BRAILLE_PATTERN_BLANK ||
  character === REPLACEMENT_CHARACTER ||
  LONE_SURROGATE.test(character);

/**
 * Van-e a szövegben látható jel – betű, szám, írásjel vagy emoji (a vélemény lehet „👍” is) –, nem
 * csak szóköz, üresen megjelenő vagy hibás karakter.
 */
export const hasVisibleCharacter = (text: string): boolean =>
  [...text.replace(INVISIBLE_CHARACTERS, '')].some((character) => !isBlank(character));

/**
 * Egy teljes (RGI) emoji-sorozat (a csoport – megmarad), vagy egy láthatatlan karakter (törlődik).
 * Az emoji-sorozatok az összekötőjükkel (ZWJ), változatjelölőjükkel és címke-karaktereikkel (pl. az
 * angol zászló) együtt épek maradnak; minden más láthatatlan karakter kimarad – a sorozaton kívüli
 * összekötő és változatjelölő is, mert ezekkel is kódolható rejtett üzenet. Ismert ár: a nem latin
 * írások láthatatlan jelei (pl. a perzsa ZWNJ, a héber és arab irányjelek) is kimaradnak – magyar
 * felületen ez elfogadható. A karakterlánc-tulajdonsághoz (RGI_Emoji) a „v” (unicodeSets) kapcsoló
 * kell; a TypeScript ES2023-as célja miatt RegExp-konstruktorral.
 * Forrás: Unicode Technical Standard #51 – Unicode Emoji (RGI emoji-sorozatok),
 * https://www.unicode.org/reports/tr51/; MDN – RegExp.prototype.unicodeSets,
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/unicodeSets
 */
const EMOJI_OR_HIDDEN = new RegExp(
  String.raw`(\p{RGI_Emoji})|\p{Default_Ignorable_Code_Point}`,
  'gv',
);

/**
 * A szövegben rejtett karakterek eltávolítása: a láthatatlan karakterekkel – például a címke-
 * karakterekkel (U+E0000–E007F) – írt szöveg az olvasónak nem látszik, egy gépi feldolgozó (kereső,
 * nyelvi modell) viszont elolvassa. A párosítatlan helyettesítő helyére előbb cserekarakter kerül
 * (az adatbázis is ezt tárolná – így a válasz és a tárolt érték egyezik), és csak utána a törlés:
 * fordított sorrendben egy kettévágott pár a törléssel összeforrhatna.
 */
export const removeHiddenCharacters = (text: string): string =>
  text
    .replace(LONE_SURROGATES, REPLACEMENT_CHARACTER)
    .replace(EMOJI_OR_HIDDEN, (_match, emoji: string | undefined) => emoji ?? '');

/**
 * Két vagy több egymást követő üres sor. Üresnek számít a csak szóközt (a nem törhetőt és a többi
 * Unicode-szóközt is), tabulátort vagy Braille-üres mintát tartalmazó sor is.
 */
const BLANK_LINES = new RegExp(String.raw`\n(?:(?:[^\S\n]|${BRAILLE_PATTERN_BLANK})*\n)+`, 'gu');

/** Két bekezdés között legfeljebb egy üres sor maradjon (egy szöveg ne tolhassa szét a listát). */
export const collapseBlankLines = (text: string): string => text.replace(BLANK_LINES, '\n\n');
