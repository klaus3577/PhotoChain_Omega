/** Tailwind-osztálynevek összefűzése; a hamis értékeket (feltételes osztályok) kihagyja. */
export function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}
