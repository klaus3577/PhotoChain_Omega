// Foglalt megjelenített nevek (L30): a platformra vagy a moderátorokra emlékeztető név (pl.
// „Adminisztrátor”, „PhotoChain ügyfélszolgálat”) megtévesztésre – adathalászatra, hamis
// „hivatalos” értékelésre – adna módot. Az összevetés egy egyszerűsített „csontváz” alakon történik:
// a kis- és nagybetű, az ékezet, a láthatatlan karakter, a szóköz és az írásjel, a kompatibilitási
// alak (pl. teljes szélességű betű), a latin betűre hasonlító cirill és görög betű és a gyakori
// számjegy-helyettesítés (0 → o, 1 → i) nem számít. Ez az UTS #39 confusables-táblájának csak egy kis
// része: a teljes táblát (és a felhasználók neveinek egymással való összetéveszthetőségét) nem
// vizsgáljuk – a dolgozatban elfogadott korlát.
// Forrás: Unicode Technical Standard #39 – Unicode Security Mechanisms (skeleton, confusables),
// https://www.unicode.org/reports/tr39/ (egyszerűsítve); Unicode Standard Annex #15 – Unicode
// Normalization Forms (NFKC, NFD), https://www.unicode.org/reports/tr15/

const INVISIBLE_CHARACTERS = /\p{Default_Ignorable_Code_Point}/gu;
const COMBINING_MARKS = /\p{M}/gu;
const NOT_LETTER_OR_DIGIT = /[^\p{L}\p{N}]/gu;

/**
 * A latin kisbetűre hasonlító cirill és görög kisbetűk (a nagybetűk a kisbetűsítés után ezekké
 * válnak), és a gyakori számjegy-helyettesítések. A kódpontokkal adjuk meg, hogy a forrásfájlban ne
 * szerepeljenek összetéveszthető betűk.
 */
const LOOKALIKES: ReadonlyMap<string, string> = new Map(
  (
    [
      // cirill betűk (a latin megfelelőjük a második oszlopban)
      [0x430, 'a'],
      [0x435, 'e'],
      [0x43e, 'o'],
      [0x440, 'p'],
      [0x441, 'c'],
      [0x445, 'x'],
      [0x443, 'y'],
      [0x456, 'i'],
      [0x458, 'j'],
      [0x455, 's'],
      [0x4bb, 'h'],
      [0x43a, 'k'],
      [0x43c, 'm'],
      [0x442, 't'],
      [0x43d, 'h'],
      [0x432, 'b'],
      // görög betűk
      [0x3b1, 'a'],
      [0x3b5, 'e'],
      [0x3bf, 'o'],
      [0x3c1, 'p'],
      [0x3b9, 'i'],
      [0x3ba, 'k'],
      [0x3bd, 'v'],
      [0x3c4, 't'],
      [0x3c5, 'u'],
      [0x3c7, 'x'],
      // számjegyek
      [0x30, 'o'],
      [0x31, 'i'],
      [0x33, 'e'],
      [0x34, 'a'],
      [0x35, 's'],
      [0x37, 't'],
    ] as const
  ).map(([codePoint, latin]) => [String.fromCodePoint(codePoint), latin]),
);

/** A név összevetésre szánt alakja (lásd a fájl elején). */
export function nameSkeleton(name: string): string {
  const folded = name
    .normalize('NFKC')
    .replace(INVISIBLE_CHARACTERS, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '');
  return [...folded]
    .map((character) => LOOKALIKES.get(character) ?? character)
    .join('')
    .replace(NOT_LETTER_OR_DIGIT, '');
}

/**
 * Rövid foglalt szavak: a név egészeként vagy annak önálló szavaként foglaltak („Admin Kati”), egy
 * hosszabb szó részeként szabadok („Badminton Béla”, „Supporter Zsófi”).
 */
const RESERVED_WORDS: ReadonlySet<string> = new Set(
  ['admin', 'root', 'support', 'system', 'rendszer'].map(nameSkeleton),
);

/** Szóhatár: szóköz, írásjel vagy szimbólum (pl. „Kiss-Admin”, „Az.Admin”). */
const WORD_SEPARATORS = /[\s\p{P}\p{S}]+/u;

/** A név szavainak csontváza (a láthatatlan karakterek nem választanak el: „Ad[ZWSP]min” egy szó). */
const wordSkeletons = (name: string): string[] =>
  name
    .normalize('NFKC')
    .replace(INVISIBLE_CHARACTERS, '')
    .split(WORD_SEPARATORS)
    .map(nameSkeleton)
    .filter(Boolean);

/** A névben bárhol foglalt kifejezések: a platform és a kezelő szerepkörök nevei. */
const RESERVED_TERMS: readonly string[] = [
  'PhotoChain',
  'adminisztrátor',
  'administrator',
  'moderátor',
  'rendszergazda',
  'ügyfélszolgálat',
].map(nameSkeleton);

export const RESERVED_NAME_MESSAGE =
  'ez a név foglalt (a platform vagy a moderátorok nevére emlékeztet)';

/** Foglalt-e a név (a platformra vagy a moderátorokra emlékeztet)? */
export function isReservedDisplayName(name: string): boolean {
  const skeleton = nameSkeleton(name);
  return (
    RESERVED_WORDS.has(skeleton) ||
    wordSkeletons(name).some((word) => RESERVED_WORDS.has(word)) ||
    RESERVED_TERMS.some((term) => skeleton.includes(term))
  );
}
