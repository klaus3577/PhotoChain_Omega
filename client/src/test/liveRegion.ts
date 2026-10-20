// Az élő régió bejelentésének és a fókusz áthelyezésének sorrendje: a képernyőolvasó (JAWS, VoiceOver)
// a fókuszváltás előtt elkezdett udvarias bejelentést megszakíthatja – ezért előbb a fókusz kerül az új
// helyre, és csak utána hangzik el az üzenet. A figyelő megjegyzi, hol volt a fókusz, amikor az élő
// régióba először szöveg került.
import { screen } from '@testing-library/react';

export function focusAtFirstAnnouncement(): () => Element | null {
  const region = screen.getByRole('status');
  let focused: Element | null = null;
  const observer = new MutationObserver(() => {
    if (focused !== null || !region.textContent) return;
    focused = document.activeElement;
    observer.disconnect();
  });
  observer.observe(region, { childList: true, subtree: true, characterData: true });
  return () => focused;
}
