# Recording tours

`screenshots/hero.avif` (the tour at the top of the README) and the clips further down it are recorded with the shared devkit's recorder, in the nested test session. How the recorder works, every variable and helper of a tour file, human-like input, reading time and troubleshooting are in the devkit's guide: [scripts/devkit/docs/recording-tours.md](../scripts/devkit/docs/recording-tours.md). This page is what is StartBar's own: the tours, what they share, and what is different for a Dock.

## Run the tours

```sh
scripts/hero.sh              # the hero, left in /tmp/hero.avif for a look (--install copies it to screenshots/hero.avif)
scripts/clips.sh             # the five clips, installed in screenshots/ (or: scripts/clips.sh start-menu settings)
scripts/tour.sh scripts/tours/start-menu-clip.sh      # one tour, to look at it first (/tmp/start-menu-clip.avif)
```

`scripts/hero.sh` is a shortcut for `scripts/tour.sh scripts/tours/hero.sh`. The Start menu's power commands are refused in the session ([testing.md](testing.md#the-guard-what-a-click-in-the-session-cannot-do)). What a run does to your desktop (nothing), cancelling, retaking a tour and `scripts/sheet` are in the [devkit's guide](../scripts/devkit/docs/recording-tours.md).

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

The README's clips are `scripts/tours/taskbar-clip.sh`, `icon-menu-clip.sh`, `start-menu-clip.sh`, `bar-menu-clip.sh` and `settings-clip.sh`; `scripts/clips.sh` records them all and installs them in `screenshots/`. How a clip is made (`TOUR_CROP`, no captions, looping) is in the [devkit's guide](../scripts/devkit/docs/recording-tours.md#clips). What is different here:

- **The wallpaper stays.** The flat backdrop (`TOUR_BACKDROP=plain`) the other Start apps use is a full-screen window, which Hyprland may draw over the Dock (a Top layer); it was not tried here. The clips show the theme's wallpaper, as the stills do.
- **The settings clip** starts and ends on the page the window opened on, opened in `tour_setup`.

## Decision log

Newest first.

| Date | Decision | Why |
|---|---|---|
| 2026-10-15 | This page keeps only what is StartBar's; the recorder's how-to is the devkit's (v0.2.2) | The same text was in both and would drift |
| 2026-10-15 | The test session and the recorder moved to the shared devkit, a git submodule (`scripts/devkit`), configured by `devkit.conf` | One place fixes the three Start apps' copies; as a submodule it is development tooling that a user does not install and the marketplace's review does not read, and an update is a pointer change, not the merge commits of a subtree |
| 2026-10-15 | `pointer`, `reload`, `try-setting`, `spare`, `hypr-events`, `release-branch`, the shell and rule checks, the pre-commit hook and the CI job moved to the devkit (v0.2.1) | The same reason: three apps carried copies. StartBar's `pointer move X Y` (global coordinates) is now `warp X Y`; `move` takes screenshot pixels |
| 2026-10-15 | StartBar adopted StartDrive's test session and recorder (it had filmed a virtual monitor with the real pointer and the shell restarted) | The old way moved the maintainer's pointer, restarted their shell and acted on their windows; the nested session does none of it, and the three Start apps keep one set of scripts |
| 2026-10-15 | The session runs behind a guard that refuses the Start menu's power commands, and does not start without it | A nested session shares the user's systemd and login session: a click on Shut down would have shut the machine down |
| 2026-10-15 | The README's tour and clips are animated AVIFs in `<picture>` tags, replacing `hero.gif` (3.7 MB) | About a seventh of the size, sharper, and GitHub does not link a `<picture>` to the file |
| 2026-10-15 | The recorder removes its frames when it ends | Each run left 1.5 GB in `/tmp`, which is memory: a few runs made everything that wrote there fail |
| 2026-10-15 | The shell in the session starts after the window has its final size | Started before, it reported the first size as its screen's and `layout` answered with wrong pixels |
