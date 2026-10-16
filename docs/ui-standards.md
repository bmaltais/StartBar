# StartBar's UI standards

What is shared by every Start app (principles, the settings window's layout, controls, words, notifications) is in the devkit's [ui-standards.md](../scripts/devkit/docs/ui-standards.md); read it first, this page does not repeat it. This page is where StartBar differs, and the decision log. StartBar's settings window is the shared *design* reference; the code is in `Service.qml` (`settingsWindow`) and the pages are `DockConfig.settingsSchema()`.

A change to the settings window, the Dock's menus or the Start menu's look is not finished until this page and the settings tables in [SETTINGS.md](SETTINGS.md) match it.

## Where StartBar differs from the shared rules

- **No manager window.** The Dock and the Start menu are the app's surface; the shared Manager rows, scrim and click-outside-to-close do not apply. The settings window is a frame on a transparent overlay layer: only the frame takes input, so a click around it reaches the desktop and does not close it. Esc clears a search, then closes.
- **Size and place.** 780 × 620 (at most the screen minus 80), opens centred on the screen it was opened from, every time. It moves by its 60 high top strip (the hand pointer, at least 60 of it stays on screen). It does not resize and does not remember its place or size, so there are no *Remember size/position* switches.
- **Pages.** Taskbar, Windows, Start menu. The window is named "Taskbar settings"; there is no small-caps line under it.
- **Footer.** "Changes apply instantly" on the left (no "· Esc to close"), the *Reset to defaults* pill (click twice) on the right. Pins and the Start menu's own pins and recents survive a reset.
- **No first-run window.** Settings are never opened by themselves.
- **Controls only here.** Steppers (numbers), a slider (opacity) and a list editor (the Start menu's Places folders), next to the shared switch, choice and text field.
- **Menus.** The Item menu and the Bar menu are part of the Dock's surface, not cards, and close on a click outside or when the pointer leaves them ([SETTINGS.md](SETTINGS.md#menus)).

## Decision log

Newest first.

| Date | Decision | Why |
|---|---|---|
| 2026-10-15 | This page exists, and says only where StartBar differs from the shared file | The kit asks each app for one; the settings window is the other apps' reference, so its differences have to be written down |
