// CSV-sorok a kiértékelő scriptekhez (L29): a vesszőt, idézőjelet vagy sortörést tartalmazó cellát
// idézőjelbe teszi (RFC 4180), a többit változatlanul írja.
export type CsvValue = string | number | boolean | bigint;

export const csvCell = (value: CsvValue): string =>
  typeof value === 'string' && /[",\r\n]/.test(value)
    ? `"${value.replaceAll('"', '""')}"`
    : String(value);

export const csvLine = (cells: CsvValue[]): string => cells.map(csvCell).join(',');

/** Fejléc és sorok fájltartalomként (LF sorvég, záró sortöréssel). */
export const csvFile = (header: string[], rows: CsvValue[][]): string =>
  `${[csvLine(header), ...rows.map(csvLine)].join('\n')}\n`;
