<p align="center">
  <picture>
    <img alt="A tour of StartBar: two windows snapped side by side from their icons' menus, the Super+Z picker moving one into a quarter and F maximizing it, Show desktop hiding everything and bringing it back, the bar's menu opening the settings window, and the Dock on the left in the light colours with a window preview" src="screenshots/hero.avif" width="100%" />
  </picture>
</p>

<h1 align="center">StartBar</h1>

<p align="center">
  <b>A taskbar with a Start menu for Omarchy.</b><br>
  Every open window on every workspace and monitor, your pinned apps, and a Start menu
  with search, all a click away.
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#tour">Tour</a> ·
  <a href="#configure">Configure</a> ·
  <a href="#commands">Commands</a> ·
  <a href="docs/README.md">Docs</a>
</p>

> **Omarchy 4.5:** StartBar is compatible with the windowed mode coming in Omarchy 4.5.

## Install

```sh
omarchy plugin add https://github.com/bmaltais/StartBar --enable
```

It shows a taskbar along the bottom of every monitor, or any other edge you choose (top, left or right). Everything it needs comes with Omarchy; there is nothing else to install. The Start button opens StartBar's own Start menu. To open the Omarchy menu instead, right-click the bar, open **Start button** and choose **Open the Omarchy menu**.

## Tour

### The taskbar

<img src="screenshots/taskbar-clip.avif" alt="The taskbar with a Start button, pinned apps and open windows: the pointer goes over the icons, and resting on a group of two windows shows a live preview of each, with a thumbnail peeked" width="640">

- **Every window.** One icon per open window, across all workspaces and monitors. Click to jump to it.
- **Pins.** Keep apps in the bar whether or not they are running. Drag to reorder, drag out to unpin.
- **Grouped windows.** Optionally stack an app's windows into one icon and pick the window from the previews, as on Windows.
- **Any edge.** Bottom (the default), top, left or right, as a row or a column. Menus and previews open toward the screen, as on Windows 11.
- **Extras.** Auto-hide, a clock, workspace badges, a transparent bar, reserved space so maximized windows stop at the bar.

### The Start menu

<img src="screenshots/start-menu-clip.avif" alt="The Start menu opening from the Start button with pinned apps, recommended apps and folders; typing filters every installed app, the arrow keys move, Escape backs out, and All apps lists them A to Z" width="640">

Search every installed app, a Pinned grid you can reorder, an A-Z list, recent apps, your folders, and lock, sign out and power. Bind a key to toggle it, type to search, arrows to move, Enter to launch.

### Hover previews

<img src="screenshots/preview.png" alt="Hovering a grouped icon shows one thumbnail per window to pick from" width="473">

Live thumbnails with a close button, ordered as the windows sit on screen. Hovering one shows that window, even from behind a maximized one; moving away puts things back.

### Colours

<table>
  <tr>
    <th>Light</th>
    <th>Dark</th>
  </tr>
  <tr valign="top">
    <td><img src="screenshots/start-menu-light.png" alt="The taskbar and Start menu with the fixed light colours"></td>
    <td><img src="screenshots/start-menu-dark.png" alt="The taskbar and Start menu with the fixed dark colours"></td>
  </tr>
</table>

Colours and fonts follow the current Omarchy theme live, or pick a fixed light or dark bar.

### Right-click an icon

Every icon has its own menu: the app's actions, window actions (Maximize, Full screen, Float, Move to monitor, Move to scratchpad), Pin or Unpin, and Close window. With more than one monitor, **Move to monitor** opens a small map of your screens: click one to send the window there ([details](docs/windows-and-monitors.md#move-to-monitor)).

<img src="screenshots/icon-menu-clip.avif" alt="The menu of a running app that is not pinned, with its window actions, Close window, the app and Pin to taskbar, then the menu of a pinned app that is not running, with the app's actions, the app and Unpin from taskbar" width="640">

### Snap layouts

<img src="screenshots/snap-layouts-clip.avif" alt="A window's menu opens with the layout picker; clicking the left half snaps the window there, then the lower right quarter" width="640">

Place a window in a zone of the screen, as in Windows 11: halves, thirds, quarters, a main pane and more. A floating window goes to the zone; tiled windows are reshaped, never floated. Turn on **Snap layouts** in the settings. [Read more](docs/snap-layouts.md).

### The Super+Z picker

<img src="screenshots/super-z-clip.avif" alt="Super+Z opens the picker under the pointer; keys choose a layout, then F maximizes the window" width="640">

The same layouts from the keyboard, under the pointer. Letters act on the window: <kbd>F</kbd> maximizes, <kbd>T</kbd> floats, <kbd>S</kbd> puts it in the scratchpad, and you can give any action the key you like (arrows and <kbd>Ctrl</kbd> chords included) by pressing it in the settings. [Read more](docs/keyboard.md).

### Show desktop

<img src="screenshots/show-desktop-clip.avif" alt="Three windows are hidden by one command and brought back to where they were by the next" width="640">

One key hides every window on every monitor, and the next brings each one back where it was, even if monitors came or went in between. Bind `omarchy-shell io.github.bmaltais.startbar showDesktop`, for example to Super+D. [Read more](docs/windows-and-monitors.md#show-desktop).

### Focus and stacking

<img src="screenshots/focus-clip.avif" alt="The pointer moves over the window behind, which comes to the front, then over the other one" width="640">

Focus can follow the mouse, floating windows can rise when they get focus, and new windows can open on a workspace of their own. [Read more](docs/windows-and-monitors.md#focus-and-stacking).

## Configure

Changes apply as you make them. There are two ways in.

### Right-click the bar

The common options, kept short: icon alignment, position (bottom, top, left or right), colours, the Start button and window previews open a submenu beside them, and the everyday toggles (auto-hide, clock, group windows, workspace badge, transparent background) sit below. Options that mean nothing while another is off are dimmed. The last row, **Settings…**, opens the full window.

<img src="screenshots/bar-menu-clip.avif" alt="The bar's right-click menu: the pointer goes down its rows, and Icon alignment, Position, Colors, Start button and Window previews each open a submenu beside them" width="640">

### The settings window

A control for every option, laid out like the Windows 11 settings: a search box at the top, the pages down the left (Taskbar, Windows, Start menu) and the chosen page on the right. Drag the title bar to move it. Options that follow another one are indented and dimmed while it is off.

<img src="screenshots/settings-clip.avif" alt="The settings window: the Taskbar, Windows and Start menu pages, a search for icon listing the matching settings from every page, and the clock switched on and off" width="640">

Type in the search box to find a setting on any page: every word must appear in a setting's name or description, or in its page's name.

### shell.json

Everything is saved in StartBar's own entry in `~/.config/omarchy/shell.json`, which you can also edit by hand:

```json
{
  "plugins": [
    {
      "id": "io.github.bmaltais.startbar",
      "alignment": "center",
      "position": "left",
      "startCommand": "builtin"
    }
  ]
}
```

Every key, its default, and how pinning and dragging behave are in [docs/SETTINGS.md](docs/SETTINGS.md).

## Commands

StartBar answers commands; you bind them to the keys you like. Run them with `omarchy-shell io.github.bmaltais.startbar <command>`:

| Command | Does |
|---|---|
| `startMenu` | Toggles the Start menu on the focused monitor |
| `showDesktop` | Hides every window; run it again to bring them back |
| `snapPicker` | Opens the snap picker for the active window (needs **Snap layouts** on) |
| `settings` | Opens the settings window |

`closeStartMenu`, `closeSettings` and `closeSnapPicker` close the matching one. The picker's own keys and how to change them are in [Keyboard and commands](docs/keyboard.md).

## Update and remove

```sh
omarchy plugin update io.github.bmaltais.startbar --yes && omarchy restart shell
```

Your settings and pins are kept, since they live in `shell.json` and not in the plugin folder. See the [releases page](https://github.com/bmaltais/StartBar/releases) for what changed.

```sh
omarchy plugin remove io.github.bmaltais.startbar
```

## Documentation

| | |
|---|---|
| [Snap layouts](docs/snap-layouts.md) | Layouts, tiled and floating windows, the Super+Z picker |
| [Windows and monitors](docs/windows-and-monitors.md) | Show desktop, Move to monitor, scratchpad, previews, focus |
| [Keyboard and commands](docs/keyboard.md) | Every command, the picker's keys, choosing your own |
| [Settings reference](docs/SETTINGS.md) | Every setting and its default |
| [Specification](docs/SPEC.md) | Exactly how it behaves |

Everything is indexed in [docs/README.md](docs/README.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development install, the tests and the manual checklist, and [docs/testing.md](docs/testing.md) for the test session that runs the plugin in a second desktop your mouse and keyboard cannot reach.

## License

MIT
