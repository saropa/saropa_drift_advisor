/**
 * Super FAB — floating action menu UI controller.
 *
 * Self-contained module: handles open/close toggle, outside-click
 * dismiss, and Escape-key close.
 *
 * Individual FAB actions (share, sidebar, theme, mask) are wired by
 * app.js since they depend on application state and API helpers.
 *
 * DOM contract:
 *   #super-fab         — container (.open class toggles visibility)
 *   #super-fab-trigger — circular button that toggles the menu
 *   #super-fab-menu    — action list (aria-hidden toggled)
 *   #super-fab-icon    — Material icon inside the trigger
 */

/** Initialises the Super FAB menu. No-op if DOM elements are missing. */
export function initSuperFab(): void {
  const fab = document.getElementById('super-fab');
  const trigger = document.getElementById('super-fab-trigger');
  const menu = document.getElementById('super-fab-menu');
  const icon = document.getElementById('super-fab-icon');
  if (!fab || !trigger || !menu) return;

  /** Toggle the FAB open/closed state and update ARIA attributes. */
  function toggleFab(): void {
    const opening = !fab!.classList.contains('open');
    fab!.classList.toggle('open', opening);
    trigger!.setAttribute('aria-expanded', opening ? 'true' : 'false');
    menu!.setAttribute('aria-hidden', opening ? 'false' : 'true');
    // Swap between "tune" (settings gear) and "close" icons.
    if (icon) icon.textContent = opening ? 'close' : 'tune';
  }

  // Trigger button toggles the menu.
  trigger.addEventListener('click', (e: Event) => {
    e.stopPropagation();
    toggleFab();
  });

  // Close the FAB when clicking outside of it.
  document.addEventListener('click', (e: Event) => {
    if (fab.classList.contains('open') && !fab.contains(e.target as Node)) {
      toggleFab();
    }
  });

  // Close the FAB on Escape key and return focus to trigger.
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && fab.classList.contains('open')) {
      toggleFab();
      trigger.focus();
    }
  });
}
