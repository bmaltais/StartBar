# StartBar's UI standards

What is shared by every Start app (principles, the settings window's layout, controls, words, notifications) is in the devkit's [ui-standards.md](../scripts/devkit/docs/ui-standards.md); read it first, this page does not repeat it. This page is where StartBar differs, and the decision log. StartBar's settings window is the shared *design* reference; the code is in `Service.qml` (`settingsWindow`) and the pages are `DockConfig.settingsSchema()`.

A change to the settings window, the Dock's menus or the Start menu's look is not finished until this page and the settings tables in [SETTINGS.md](SETTINGS.md) match it.

## Where StartBar differs from the shared rules

- **No manager window.** The Dock and the Start menu are the app's surface; the shared Manager rows, scrim and click-outside-to-close do not apply (the kit says so too, under "Dismissing"). The settings window is a frame on a transparent overlay layer: only the frame takes input, so a click around it reaches the desktop and does not close it. Esc clears a search, then closes.
- **Size and place.** 780 × 620 (at most the screen minus 80), opens centred on the screen it was opened from, every time. It moves by its 60 high top strip (the hand pointer, at least 60 of it stays on screen). It does not resize and does not remember its place or size, so there are no *Remember size/position* switches.
- **Pages.** Taskbar, Windows, Start menu.
- **Footer.** The kit's line ("Changes apply instantly · Esc to close") on the left, the *Reset to defaults* pill (click twice) on the right, and no resize grip. Pins and the Start menu's own pins and recents survive a reset.
- **No first-run window.** Settings are never opened by themselves.
- **Controls only here.** Steppers (numbers), a slider (opacity) and a list editor (the Start menu's Places folders), next to the shared switch, choice and text field.
- **Menus.** The Item menu and the Bar menu are part of the Dock's surface, not cards, and close on a click outside or when the pointer leaves them ([SETTINGS.md](SETTINGS.md#menus)).

## Decision log

Newest first.

| Date | Decision | Why |
|---|---|---|
| 2026-10-15 | The settings window's title is "StartBar" over a small-caps "SETTINGS · <version>", in a 48 high title block and heading row (#90) | It was the last visible difference that nobody had chosen; StartDrive and StartAppImage have the same block, and the version is read from `manifest.json` |
| 2026-10-15 | The settings window has no scrim: it is a transparent full-screen layer that takes input only on its frame, so a click outside reaches the desktop | The window edits the Dock, so it must not dim it: you see the Dock change live as you adjust a setting. It began as a side effect of the input mask added for smooth dragging (#68); this records it as the intended behaviour. Esc and ✕ close the window. The kit's `ui-standards.md` (v0.2.3) documents this as an exception to its scrim rule |
| 2026-10-15 | The footer says "Esc to close" and a search with no match says "No setting matches …" | Esc does close the window (first clears a search), and the kit and both other Start apps use these words; StartBar alone differed |
| 2026-10-15 | This page exists, and says only where StartBar differs from the shared file | The kit asks each app for one; the settings window is the other apps' reference, so its differences have to be written down |
