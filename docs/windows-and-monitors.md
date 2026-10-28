# Windows and monitors

The bar acts on your windows, not only lists them. This page covers what each action does and which settings change it.

[README](../README.md) · [Snap layouts](snap-layouts.md) · [Keyboard and commands](keyboard.md) · [Settings reference](SETTINGS.md)

## Show desktop

<img src="../screenshots/show-desktop-clip.avif" alt="Three windows are hidden by one command and brought back to where they were by the next" width="640">

Hide every window on every monitor with one key, and bring each one back to where it was with the next. Bind `omarchy-shell io.github.bmaltais.startbar showDesktop` (for example to Super+D). It needs no setting and works with or without a Dock.

- Each window is hidden on a workspace of its own monitor, so it keeps its size and nothing is squeezed together.
- Restoring puts each window back on the workspace it came from, and refocuses the one that was active. It still works if a monitor was plugged in or out in between: a floating window's position is only restored if it would still be on a screen.
- **Click a hidden window's icon** (or its preview) to bring back just that one.
- Windows in the scratchpad or minimized by Omarchy are left alone.

## Move to monitor

With more than one monitor, a window's menu (on its icon or its preview) has a **Move to monitor** row. It opens a small map of your monitors, laid out as they sit on the desk. Click one and the window goes to the workspace that monitor is showing. Omarchy's workspace modes then float or tile it as they would any window there.

If a maximized or full-screen window is already on that workspace, it is taken out of that state first, so the window you moved can still be clicked.

The Super+Z picker has the same row (key **M**): see [Snap layouts](snap-layouts.md#from-the-keyboard-superz).

## Scratchpad

**Move to scratchpad** in a window's menu puts it away; its icon stays in the bar, and its menu then says **Restore from scratchpad**, which brings it back to the workspace now in view.

## Hover previews

Resting on an icon shows live thumbnails with a close button. A group's thumbnails are ordered left to right by where the windows are on screen. With **Show window on preview hover** (`previewPeek`, on by default) hovering a thumbnail brings that window into view, even from behind a maximized one, and moving away puts everything back; clicking keeps it. Related settings: `showPreviews`, `previewSlide`, `previewWarpPointer`.

## Focus and stacking

<img src="../screenshots/focus-clip.avif" alt="The pointer moves over the window behind, which comes to the front, then over the other one" width="640">

Two optional settings, both off by default:

- **Focus follows mouse** (`focusFollowsMouse`): hovering a window gives it keyboard focus, including between floating windows.
- **Raise window on focus** (`raiseOnFocus`): a floating window that gets focus, by hover or otherwise, comes to the front.

## Where windows open

- **New windows on their own workspace** (`newWindowWorkspace`): a window that opens tiled beside others moves to the lowest empty workspace, shown normally, maximized or full screen.
- **Reserve space** (`reserveSpace`, on by default): windows, maximized ones included, stop at the bar instead of running under it. It applies while auto-hide is off.

Every key and its default is in the [settings reference](SETTINGS.md). The behaviour is specified in [SPEC.md](SPEC.md#input).
