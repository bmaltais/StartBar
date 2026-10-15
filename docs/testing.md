# Testing StartBar

How a change gets checked, from the cheapest check to trying it in a live shell. The test session itself (`scripts/dev`), the recorder (`scripts/tour.sh`) and `scripts/sheet` are the shared devkit's, in `scripts/devkit`, a git submodule of [omarchy-plugin-devkit](https://github.com/bmaltais/omarchy-plugin-devkit) (development tooling, so it is not in what a user installs or what the marketplace reviews; clone with `--recurse-submodules`, or run `git submodule update --init`). Its guides say how the session works, what the guard refuses, and what went wrong on the way: [testing](../scripts/devkit/docs/testing.md), [how it works](../scripts/devkit/docs/how-it-works.md), [configuration](../scripts/devkit/docs/configuration.md). This page is what is StartBar's own.

| You want to | Use | Touches your desktop? |
|---|---|---|
| know the rules, the manifest, the QML and the scripts are not broken | `npm run check` (runs on every commit) | no |
| run only the rules | `npm test` | no |
| see the plugin run, hover it, click it, type into it | `scripts/dev` | no: a nested desktop out of reach of your mouse and keyboard, with a home of its own |
| check a change loads quietly and looks right in each colour scheme | `npm run smoke` | no: it runs in the same session |
| watch that session | `scripts/dev watch` | a view-only window |
| retake the README's screenshots | `scripts/screenshots.sh` | no |
| record the README's animations | `scripts/hero.sh`, `scripts/clips.sh` ([recording-tours.md](recording-tours.md)) | no |
| look over a recording | `scripts/sheet` | no |
| try it on your own shell | `scripts/reload`, `scripts/pointer.sh`, `scripts/try-setting.sh` | yes: restarts your shell, moves your pointer, edits your `shell.json` for a moment |

**The rule: test in `scripts/dev`, not on the real desktop.** A restart of the real shell makes the bar blink and puts the Dock's menus away; a click or key sent to it moves your pointer and types into your windows; the Dock acts on your real windows. The test session has none of that. Use `reload`, `pointer.sh` and `try-setting.sh` only when the person asks to see it on their real shell, or for what the session cannot do (a real mouse drag, a second monitor, the user's real Hyprland configuration).

## 1. Checks: `npm run check`

One command, no running shell needed. The pre-commit hook runs it (`git config core.hooksPath .githooks`). What it runs, and the Node tests, are described in [CONTRIBUTING.md](../CONTRIBUTING.md#checks). Two parts are about the session:

- `scripts/lint-sh.sh`: `bash -n` and shellcheck over every script (the rules are in `.shellcheckrc`, with the reason for each one disabled).
- `scripts/lint-rules.sh`: project rules no linter knows, each one a mistake that cost a session: a background launch (`setsid -f`) must redirect its own output (see section 6), and a tour must not copy or link the real `shell.json`. `test/lintRules.test.js` proves each rule catches what it is for.
- `test/nestedGuard.test.js`: builds the guard (below) in a throwaway folder and checks it refuses every power command the Start menu can run, with `systemctl` and `loginctl` replaced by stand-ins that only say they were reached.

What it cannot catch: a layout that looks wrong, a click that misses, anything about the live shell. That is what the test session is for.

## 2. The test session: `scripts/dev`

`scripts/dev` is the devkit's `dev`, run for this checkout; `devkit.conf` tells it the plugin's id and layer, that it is a service (no bar widget), the settings the session starts with, and the commands below.

```sh
scripts/dev up                       # 10 s. a nested desktop, out of your mouse's reach, and a window showing it live
scripts/dev run foot -a foot sleep 600     # a window for the Dock to show (a throwaway terminal; run it twice for a group)
scripts/dev startmenu                # open the Start menu there (settings opens the settings window, close closes both)
scripts/dev shot /tmp/a.png          # screenshot it, then look at the file
scripts/dev layout | jq .            # where the Dock's Items and any open menu are, in pixels of that screenshot
scripts/dev click 31 776             # click the pixel you saw (rclick for the right button, scroll PX PY N for the wheel)
scripts/dev move 78 776              # move the pointer there: the Preview opens when it rests on an Item
scripts/dev type fo                  # type into the Start menu or the settings window; key Return presses a key
scripts/dev set '{"colorScheme":"light","position":"left"}'    # change the Dock's settings; the Dock follows at once
scripts/dev errors                   # what the plugin logged, noise removed (0 = clean)
# edit a .qml file ...
scripts/dev reload                   # restarts the nested shell only; loads uncommitted files
scripts/dev down                     # always, when done
```

- **The Dock starts from its defaults**, plus the clock: no Pins, no Start Pins, no Placed positions. `dev set` changes that, and `dev run` gives it windows. The Start menu lists the apps installed on the machine.
- **The guard** keeps a click on the Start menu's Lock, Sign out, Sleep, Restart or Shut down from acting on your machine (`omarchy-system-lock`, `omarchy-system logout`, `systemctl suspend`, `omarchy-system reboot`, `omarchy-system shutdown` are refused in the session; `dev status` counts the refusals). `test/nestedGuard.test.js` takes the commands from `StartMenu.overlayRows`, so a new Start menu row the guard does not hold fails it. How the guard works: the devkit's [how-it-works](../scripts/devkit/docs/how-it-works.md#the-guard).
- Pixels, the time limit, `dev env`, the view window: the devkit's [testing guide](../scripts/devkit/docs/testing.md).

### Retaking the README screenshots: `scripts/screenshots.sh`

Runs the whole thing in the session: `up`, the Dock set to the state the README shows (`scripts/tours/common.sh`: icons on the left, the theme's colours, five Pins) with terminals posing as apps for its windows, then each image in turn, each framed as before: the subject plus a 32 px margin of wallpaper, the Dock and what stands on it running on to the screen's bottom edge. `--only NAME,NAME` takes some, `--install` copies them over `screenshots/`, `--out DIR` says where they go. It finds the Items and menus with `dev layout`, so nothing is found by comparing pictures. Then `scripts/make-preview.sh` rebuilds `preview.png`, the marketplace's picture, from them.

### The smoke test: `npm run smoke`

`scripts/smoke.sh` starts the session, opens the Dock, the Start menu and the settings window in each colour scheme (`--position EDGE`, `--type` to type into the search), screenshots each, and fails if the plugin logged anything. Read the screenshots: it only knows the plugin loaded quietly. It cannot hover or drag; for a Preview or a menu, drive the session by hand (above) or run a tour.

## 3. Your real desktop: `scripts/reload`, `scripts/pointer.sh`, `scripts/try-setting.sh`

For when someone wants to see the change in their own shell, or for what a nested session cannot do.

- `scripts/reload [--check]` restarts your shell so it loads this checkout (the plugin in `~/.config/omarchy/plugins/` is a link to it, `CONTRIBUTING.md` "Development install"; the script refuses otherwise) and reports what the plugin logged: `reload ok release/1.5.0@93575aa restart 4.1s plugin-errors 0`. The bar blinks. Your windows, settings and Pins are untouched. Changes to `Service.qml` and `StartMenuView.qml` need this restart; the shell does not reload them on save.
- `scripts/pointer.sh`, `scripts/try-setting.sh` and `scripts/spare.sh` are the old tools for the real desktop: a real pointer through `ydotool`, StartBar's settings changed for one command and put back, and a spare window to try Hyprland calls on. See `docs/hyprland-notes.md`. `pointer.sh` moves your real pointer: only when asked.

## StartBar's own lessons

The devkit's [how-it-works](../scripts/devkit/docs/how-it-works.md#what-went-wrong-on-the-way-and-the-rule-it-left) has the general ones. These were found here:

- **A shell that starts before its window has its final size reports the wrong screen** (StartBar's). `layout` put the Items 188 px left and 38 px high of where they were, and the first version of the tour clicked next to its targets. The shell now starts after the resize; see section 5.
- **A window moved off the workspace in view is still the "active window"** (StartBar's). A Peek puts the focus back to the window that had it, and if that was a window of another workspace the compositor switched there, so the film stayed on the wrong workspace for good. After posing windows on other workspaces, `settle_focus` in `scripts/tours/common.sh` switches to them and back, which clears it.
- **A popup that closes itself a moment after it opens, on a Dock at the top or left edge** (StartBar's, fixed in 1.6.1). The Item menu opened and closed again 300 ms later. With a popup grab (`grabFocus`) the compositor sends the popup an enter at its corner the moment it opens, before it has placed it, whether or not the pointer is near, and the menu's hover handler read that as the pointer entering and then leaving. The Wayland log showed it (`WAYLAND_DEBUG=1` on the session's shell: `wl_pointer.leave` of the Dock, `wl_pointer.enter` of the popup at -0.0078,-0.0078, then `xdg_popup.configure` placing it). The menu now ignores hover changes for 250 ms after it opens (`menuSettleTimer` in `Service.qml`). It was in the plugin, not the session; it showed on those edges, probably because the popup opens next to the pointer there.
- **The Peek kept its state in a file in `$XDG_RUNTIME_DIR` that the session shared with the real shell** (StartBar's, fixed in 1.6.1). A Peek in the session while the user hovered a Preview on their real desktop could put back the wrong workspace. The state file and its lock are now named for the Hyprland instance (`startbar-peek-$HYPRLAND_INSTANCE_SIGNATURE`).

## Limits

- **One monitor.** The Dock puts an Item for every window on every monitor and has a Dock on each; the session has one screen. A second monitor needs the real desktop.
- **The apps are the machine's.** The Start menu lists what is installed here and the tours pin five apps that must be installed (`TOUR_PINS` in `scripts/tours/common.sh`; the tour says which is missing), so the images differ from machine to machine.
- **No drag.** `vptr` can drag (the recorder uses it for windows) and `dev` has no `drag` yet: dragging an Item or a Pin on the Dock is on the manual checklist.

## Where the files are

| Path | What it is |
|---|---|
| `package.json` `check`, `scripts/lint-sh.sh`, `scripts/lint-rules.sh`, `scripts/qmllint-check.js`, `scripts/qmllint-baseline.txt`, `.shellcheckrc` | the checks |
| `.githooks/pre-commit`, `.github/workflows/check.yml` | the hook and the CI job |
| `test/*.test.js` | the Node tests (`nestedGuard` and the modules') |
| `devkit.conf` | what the devkit needs to know about this plugin: its id, that it is a service, the starting settings, the Start menu's window check, the commands |
| `scripts/devkit/` | the devkit, a git submodule (update with `git -C scripts/devkit checkout vX.Y.Z`, then commit) |
| `scripts/dev`, `scripts/tour.sh`, `scripts/sheet` | wrappers of the devkit's `dev`, `tour`, `sheet` for this checkout |
| `scripts/smoke.sh`, `scripts/screenshots.sh`, `scripts/make-preview.sh` | the smoke test, the README screenshots, the marketplace picture |
| `scripts/tours/`, `scripts/hero.sh`, `scripts/clips.sh` | the tours ([recording-tours.md](recording-tours.md)) |
| `scripts/reload`, `scripts/pointer.sh`, `scripts/try-setting.sh`, `scripts/spare.sh`, `scripts/hypr-events.sh` | for the real desktop |
