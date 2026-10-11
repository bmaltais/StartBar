# Hyprland notes

Facts about the Hyprland 0.56 Lua dispatch API (`hyprctl dispatch "hl.dsp...."`) that its output does not state. Found by trying them; re-check after a Hyprland upgrade.

- **Try new calls on a spare window.** A dispatch that goes wrong can leave a window changed for good: a test that faded a window left it at an explicit opacity until it was reopened.
- **Window properties** (`hl.dsp.window.set_prop({ prop, value, window })`): the names are `opacity`, `opacity_inactive`, `opacity_fullscreen`, not `alpha`. There is no way to unset one: `"unset"` and `""` fail with `stof`, and `-1` makes the window invisible. Setting `"1"` is the closest to a reset, and it overrides the user's opacity rules.
- **Maximize and full screen**: `hl.dsp.window.fullscreen({ mode = "maximized" | "fullscreen", action = "set" | "unset" | "toggle", window = "address:0x..." })`. `hyprctl -j clients` reports it as `fullscreen`: 0 none, 1 maximized, 2 full screen. With the `scrolling` layout a maximized window can sit beside others instead of covering them.
- **Focus**: `hl.dsp.focus({ window = "address:0x..." })`, `hl.dsp.focus({ monitor = "DP-1" })` and `hl.dsp.focus({ workspace = "3" })`. Focusing a window on a hidden workspace switches that monitor to it. `misc:on_focus_under_fullscreen` decides what a focus request does to a covering window.
- **Pointer**: focusing can warp the pointer. Wrap it in `hyprctl eval 'hl.config({ cursor = { no_warps = true } })'` and put the old value back (see `focusWindow` in `Service.qml`).
- **Reading state**: `hyprctl -j clients`, `monitors` (each has `activeWorkspace.id`) and `activewindow`.
- **Raising**: `hl.dsp.focus` focuses a floating window without raising it, so one under another floating window is focused but hidden. `hl.dsp.window.alter_zorder({ mode = "top", window = "address:0x..." })` raises it (see `raiseFloating` in `Service.qml`).
- **Moving the pointer** with `hl.dsp.cursor.move` does not make Hyprland follow it with focus, and does not trigger a hover on the Dock or its Previews. Only real pointer motion does, so a hover or right click still needs a human. The one thing it does do is reveal an auto-hidden Dock: warp to the bottom edge.
- **Finding who changed focus**: `scripts/hypr-events.sh start`, reproduce by hand, read the log, `scripts/hypr-events.sh stop`. It keeps its PID in a file because `pkill -f` matches the shell that runs it and kills it.
- **A spare window to test on**: `foot -a spare-test sleep 600`, then `hl.dsp.window.float({ action = "set", ... })` and `hl.dsp.window.move({ workspace = "2", follow = false, ... })`; close it with `hl.dsp.window.close`. Launching the user's own apps to see what they do opens windows on their session.
- **Screenshots**: `grim -o DP-1 file.png` takes one monitor; a bare `grim` takes both side by side at twice the width. `grim -o` and `-g` cannot be combined: crop with `magick`.
