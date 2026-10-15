# Recording tours

`screenshots/hero.avif` (the tour at the top of the README) and the clips further down it are recorded with the shared devkit's recorder, in the nested test session. How the recorder works, every variable and helper of a tour file, human-like input, reading time and troubleshooting are in the devkit's guide: [scripts/devkit/docs/recording-tours.md](../scripts/devkit/docs/recording-tours.md). This page is what is StartBar's own: the tours, what they share, and what is different for a Dock.

## Run the tours

```sh
scripts/hero.sh              # records the hero, leaves the result in /tmp/hero.avif for a look
scripts/hero.sh --install    # records it and copies it to screenshots/hero.avif
scripts/clips.sh             # records the five clips and installs them in screenshots/ (or: scripts/clips.sh start-menu settings)
scripts/tour.sh scripts/tours/start-menu-clip.sh      # one tour, to look at it first (/tmp/start-menu-clip.avif)
```

`scripts/hero.sh` is a shortcut for `scripts/tour.sh scripts/tours/hero.sh`. It takes about three minutes, of which the tour itself is a minute and a half. A red strip appears along the top of your screen with a **Cancel recording** button, and a view-only window below it shows the recording as it happens. **Your mouse and keyboard stay yours** and nothing of yours is changed: the tour runs in a sandbox, and the Start menu's power commands are refused there ([testing.md](testing.md#the-guard-what-a-click-in-the-session-cannot-do)). Cancel any time (the button, or Ctrl+C in the terminal): the run stops within a step, the sandbox is thrown away and nothing is kept.

Do not run two at once.

Retake a tour when a step of it changes (a menu row moves, a label is renamed), and look at the result before you commit it: it clicks the real Dock, so a changed layout can make it miss. `scripts/sheet /tmp/hero.avif` makes a contact sheet of it.

## What is StartBar's

- **`devkit.conf`** (repo root): the plugin (`io.github.bmaltais.startbar`, a service, so not on the bar), its settings window's layer, what a recording must leave unchanged (`TOUR_REAL_UNCHANGED`: the real `shell.json` and `~/.local/share/applications`), and the commands `dev startmenu | settings | close | layout`.
- **The Pins.** The tours pin five apps, which must be installed (`TOUR_PINS` in `scripts/tours/common.sh`: Files, Ghostty, Edge, VS Code, Obsidian); the recorder says which one is missing.
- **Windows for the Dock** are terminals posing as apps (`pose` in `common.sh`), one per workspace so a Peek shows that window alone.

## The helpers every StartBar tour has

`scripts/tours/common.sh`

It sets what the StartBar tours share (the plugin, its sandbox and `TOUR_REAL_UNCHANGED` are in `devkit.conf`): `TOUR_PLUGIN_ENTRY` (the Dock as the README shows it, with the Pins), `tour_requires` and `tour_keys_ok`, and the helpers:

| Helper | Does |
|---|---|
| `item_center 'JQ-TEST'` | prints `X Y`, the centre of the first Dock Item the test picks (`.appId == "btop"`, `.kind == "pin"`, `true` for the first), waiting up to 5 s |
| `menu_rect NAME` | prints `X Y W H` of an open menu (`start`, `item`, `bar`, `barSub`, `preview`) once it has stopped sliding, waiting up to 5 s |
| `start_button` | prints `X Y` of the Start button on a bottom Dock with the icons on the left |
| `pose CLASS TITLE COLOUR WORKSPACE` | a terminal posing as an app of that class: the Dock gives it that app's icon, and its Preview shows the title on the colour |
| `close_windows CLASS` | closes the windows of that class |
| `settle_focus` | no window is the active one (see [testing.md](testing.md#6-what-went-wrong-on-the-way-and-the-rule-it-left)); call it at the end of `tour_setup` after posing windows |
| `settings_up` | is the settings window up |

The positions come from the Dock itself (`omarchy-shell io.github.bmaltais.startbar layout`), so they follow the Pins and the windows. The settings window's are fixed: it opens at its default size, centred (search box at 640,120 on the 1280×800 screen, pages at x=299 and y=213 for Taskbar, 253 Windows, 293 Start menu, Colors and Position in the Taskbar page at y=293 and y=251; `scripts/dev settings` and `scripts/dev shot` show them).

## Keys, and the window they go to

Keys and typing are only sent while the Start menu or the settings window is up, so they can never land on anything else. The Start menu is part of the Dock's own surface, so it is not a layer of its own: the tour defines `tour_keys_ok` (in `common.sh`: the settings layer is mapped, or the Dock reports an open Start menu), which the recorder uses instead of `TOUR_LAYER`.

## Clips

A tour with `TOUR_CROP=WxH+X+Y` keeps only that box of the session's screen, so a short tour of one part can stand in for a still image. The README's clips are `scripts/tours/taskbar-clip.sh`, `icon-menu-clip.sh`, `start-menu-clip.sh`, `bar-menu-clip.sh` and `settings-clip.sh`, each 14 to 21 seconds and 50 to 220 KB as an AVIF. `scripts/clips.sh` records them all.

- **No captions**: the crop is small. A clip is meant to be read as a picture.
- **Loop it.** Start and end on the same picture: the Dock idle, the menu closed, or (the settings clip) the window opened in `tour_setup` and the page it began on.
- **The wallpaper stays.** The flat backdrop (`TOUR_BACKDROP=plain`) the other Start apps use is a full-screen window, which Hyprland may draw over the Dock (a Top layer); it was not tried here. The clips show the theme's wallpaper, as the stills do.
- Run it like any tour: `scripts/tour.sh scripts/tours/settings-clip.sh [--install]`. Each run starts its own session (about a minute of set-up and encoding).

## Decision log

Newest first.

| Date | Decision | Why |
|---|---|---|
| 2026-10-15 | The test session and the recorder moved to the shared devkit, a git submodule (`scripts/devkit`), configured by `devkit.conf` | One place fixes the three Start apps' copies; as a submodule it is development tooling that a user does not install and the marketplace's review does not read, and an update is a pointer change, not the merge commits of a subtree |
| 2026-10-15 | StartBar adopted StartDrive's test session and recorder (it had filmed a virtual monitor with the real pointer and the shell restarted) | The old way moved the maintainer's pointer, restarted their shell and acted on their windows; the nested session does none of it, and the three Start apps keep one set of scripts |
| 2026-10-15 | The session runs behind a guard that refuses the Start menu's power commands, and does not start without it | A nested session shares the user's systemd and login session: a click on Shut down would have shut the machine down |
| 2026-10-15 | The README's tour and clips are animated AVIFs in `<picture>` tags, replacing `hero.gif` (3.7 MB) | About a seventh of the size, sharper, and GitHub does not link a `<picture>` to the file |
| 2026-10-15 | The recorder removes its frames when it ends | Each run left 1.5 GB in `/tmp`, which is memory: a few runs made everything that wrote there fail |
| 2026-10-15 | The shell in the session starts after the window has its final size | Started before, it reported the first size as its screen's and `layout` answered with wrong pixels |
