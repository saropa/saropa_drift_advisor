/**
 * Hamburger menu — consolidated tool launchers + app settings.
 *
 * Replaces both the old tools-toolbar and the floating action button.
 * Handles open/close toggle, outside-click dismiss, Escape-key close,
 * and wiring tool-launcher items to openTool().
 *
 * Individual settings actions (sidebar, theme, mask, share) are wired
 * by their respective modules (sidebar.ts, theme.ts, etc.) using the
 * new hamburger-* element IDs.
 *
 * DOM contract:
 *   #hamburger-trigger  — button that toggles the menu
 *   #hamburger-menu     — dropdown panel (shown/hidden via aria-expanded)
 *   .hamburger-item[data-tool] — tool launcher buttons
 */
import { openTool } from './tabs.ts';

/** Initializes the hamburger menu. No-op if DOM elements are missing. */
export function initHamburgerMenu(): void {
  const trigger = document.getElementById('hamburger-trigger');
  const menu = document.getElementById('hamburger-menu');
  if (!trigger || !menu) return;

  /** Toggle menu open/closed and update ARIA attributes. */
  function toggleMenu(forceOpen?: boolean): void {
    const opening = forceOpen !== undefined ? forceOpen : trigger!.getAttribute('aria-expanded') !== 'true';
    trigger!.setAttribute('aria-expanded', opening ? 'true' : 'false');
    menu!.setAttribute('aria-hidden', opening ? 'false' : 'true');
  }

  // Trigger button toggles the menu.
  trigger.addEventListener('click', (e: Event) => {
    e.stopPropagation();
    toggleMenu();
  });

  // Close on outside click.
  document.addEventListener('click', (e: Event) => {
    if (trigger.getAttribute('aria-expanded') === 'true') {
      const wrapper = trigger.parentElement;
      if (wrapper && !wrapper.contains(e.target as Node)) {
        toggleMenu(false);
      }
    }
  });

  // Close on Escape key.
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && trigger.getAttribute('aria-expanded') === 'true') {
      toggleMenu(false);
      trigger.focus();
    }
  });

  // Wire tool launcher items: clicking opens the tool tab and closes the menu.
  menu.querySelectorAll('.hamburger-item[data-tool]').forEach((btn) => {
    const toolId = btn.getAttribute('data-tool');
    if (toolId) {
      btn.addEventListener('click', () => {
        openTool(toolId);
        toggleMenu(false);
      });
    }
  });
}
