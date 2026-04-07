/**
 * Super FAB — floating action menu UI controller.
 *
 * Self-contained module: handles open/close toggle, outside-click
 * dismiss, and Escape-key close. Loaded as a separate <script> by
 * html_content.dart.
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
(function initSuperFab() {
  'use strict';

  var fab = document.getElementById('super-fab');
  var trigger = document.getElementById('super-fab-trigger');
  var menu = document.getElementById('super-fab-menu');
  var icon = document.getElementById('super-fab-icon');
  if (!fab || !trigger || !menu) return;

  /** Toggle the FAB open/closed state and update ARIA attributes. */
  function toggleFab() {
    var opening = !fab.classList.contains('open');
    fab.classList.toggle('open', opening);
    trigger.setAttribute('aria-expanded', opening ? 'true' : 'false');
    menu.setAttribute('aria-hidden', opening ? 'false' : 'true');
    // Swap between "tune" (settings gear) and "close" icons.
    if (icon) icon.textContent = opening ? 'close' : 'tune';
  }

  // Trigger button toggles the menu.
  trigger.addEventListener('click', function (e) {
    e.stopPropagation();
    toggleFab();
  });

  // Close the FAB when clicking outside of it.
  document.addEventListener('click', function (e) {
    if (fab.classList.contains('open') && !fab.contains(/** @type {Node} */ (e.target))) {
      toggleFab();
    }
  });

  // Close the FAB on Escape key and return focus to trigger.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && fab.classList.contains('open')) {
      toggleFab();
      trigger.focus();
    }
  });
})();
