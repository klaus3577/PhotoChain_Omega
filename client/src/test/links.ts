import { createEvent, fireEvent } from '@testing-library/react';

/**
 * Kliensoldali-e a hivatkozás navigációja: a React Router a saját navigációjánál megakadályozza a
 * böngésző alapműveletét, a teljes újratöltésnél (reloadDocument) nem.
 */
export function isClientSideNavigation(link: HTMLElement): boolean {
  const click = createEvent.click(link);
  fireEvent(link, click);
  return click.defaultPrevented;
}
