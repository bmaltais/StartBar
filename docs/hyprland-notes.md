# Hyprland notes

Facts about the Hyprland 0.56 Lua dispatch API (`hyprctl dispatch "hl.dsp...."`) that its output does not state. Found by trying them; re-check after a Hyprland upgrade.

- **Try new calls on a spare window.** A dispatch that goes wrong can leave a window changed for good: a test that faded a window left it at an explicit opacity until it was reopened.
- **Window properties** (`hl.dsp.window.set_prop({ prop, value, window })`): the names are `opacity`, `opacity_inactive`, `opacity_fullscreen`, not `alpha`. There is no way to unset one: `"unset"` and `""` fail with `stof`, and `-1` makes the window invisible. Setting `"1"` is the closest to a reset, and it overrides the user's opacity rules.
- **Maximize and full screen**: `hl.dsp.window.fullscreen({ mode = "maximized" | "fullscreen", action = "set" | "unset" | "toggle", window = "address:0x..." })`. `hyprctl -j clients` reports it as `fullscreen`: 0 none, 1 maximized, 2 full screen. With the `scrolling` layout a maximized window can sit beside others instead of covering them.
- **Focus**: `hl.dsp.focus({ window = "address:0x..." })`, `hl.dsp.focus({ monitor = "DP-1" })` and `hl.dsp.focus({ workspace = "3" })`. Focusing a window on a hidden workspace switches that monitor to it. `misc:on_focus_under_fullscreen` decides what a focus request does to a covering window.
- **Pointer**: focusing can warp the pointer. Wrap it in `hyprctl eval 'hl.config({ cursor = { no_warps = true } })'` and put the old value back (see `focusWindow` in `Service.qml`).
- **Reading state**: `hyprctl -j clients`, `monitors` (each has `activeWorkspace.id`) and `activewindow`.
