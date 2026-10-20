// A kiértékelő scriptek (L29) Markdown-jelentéseiből egyszerű, nyomtatható HTML-oldal – a dolgozat
// táblázat-ábráihoz a képgenerátor html módjával. Csak a jelentésekben használt elemeket ismeri:
// címsorok (#, ##), bekezdések, pipe-táblázatok, `kód` és **félkövér**. Nem általános Markdown-
// feldolgozó, és csak a saját scriptjeink által előállított szöveget kapja.
/** HTML-escape szöveghez és attribútumértékhez. */
export const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** Soron belüli jelölések: `kód` és **félkövér** (a szöveg előbb HTML-escape-elve) */
const inline = (text: string): string =>
  escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

const isTableRow = (line: string): boolean => line.startsWith('|');
const isDivider = (line: string): boolean => /^\|\s*-{3,}/.test(line);
const cellsOf = (line: string): string[] =>
  line
    .slice(1, line.endsWith('|') ? -1 : undefined)
    .split('|')
    .map((cell) => cell.trim());

function tableHtml(rows: string[]): string {
  const [header, ...body] = rows.filter((row) => !isDivider(row));
  if (!header) return '';
  const head = cellsOf(header)
    .map((cell) => `<th>${inline(cell)}</th>`)
    .join('');
  const lines = body.map(
    (row) =>
      `<tr>${cellsOf(row)
        .map((cell) => `<td>${inline(cell)}</td>`)
        .join('')}</tr>`,
  );
  return `<table><thead><tr>${head}</tr></thead><tbody>${lines.join('')}</tbody></table>`;
}

/** A Markdown-jelentés HTML-oldalként (cím, bekezdések, táblázatok). */
export function renderReportHtml(markdown: string): string {
  const lines = markdown.split('\n');
  const parts: string[] = [];
  let title = 'Jelentés';
  let paragraph: string[] = [];
  let table: string[] = [];
  let list: string[] = [];
  const flush = (): void => {
    if (paragraph.length > 0) parts.push(`<p>${inline(paragraph.join(' '))}</p>`);
    if (table.length > 0) parts.push(tableHtml(table));
    if (list.length > 0)
      parts.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`);
    paragraph = [];
    table = [];
    list = [];
  };
  for (const line of lines) {
    if (line.startsWith('# ')) {
      flush();
      title = line.slice(2);
      parts.push(`<h1>${inline(title)}</h1>`);
    } else if (line.startsWith('## ')) {
      flush();
      parts.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (isTableRow(line)) {
      if (paragraph.length > 0 || list.length > 0) flush();
      table.push(line);
    } else if (line.startsWith('- ')) {
      if (paragraph.length > 0 || table.length > 0) flush();
      list.push(line.slice(2).trim());
    } else if (line.trim() === '') {
      flush();
    } else if (list.length > 0 && line.startsWith('  ')) {
      // A felsorolás elemének folytató sora
      list[list.length - 1] = `${list[list.length - 1]} ${line.trim()}`;
    } else {
      if (table.length > 0 || list.length > 0) flush();
      paragraph.push(line.trim());
    }
  }
  flush();
  return `<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
body{margin:0;background:#fff;font-family:Arial,sans-serif;color:#111827;font-size:13px;line-height:1.45}
main{padding:16px 24px}h1{font-size:19px;margin:0 0 8px}h2{font-size:15px;margin:16px 0 6px}
p{margin:0 0 8px;color:#374151}ul{margin:0 0 8px 18px;padding:0;color:#374151}li{margin:2px 0}table{border-collapse:collapse;margin:4px 0 8px;font-size:12px}
th,td{border:1px solid #d1d5db;padding:3px 8px;text-align:left;vertical-align:top}th{background:#f3f4f6}
code{font-family:Consolas,monospace;font-size:11px;background:#f3f4f6;padding:0 3px;border-radius:3px}
</style></head><body><main>${parts.join('\n')}</main></body></html>`;
}
