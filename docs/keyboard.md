# Keyboard and commands

StartBar has no keybindings of its own. It answers commands, and you bind those to the keys you like in your Hyprland configuration.

[README](../README.md) · [Snap layouts](snap-layouts.md) · [Windows and monitors](windows-and-monitors.md) · [Settings reference](SETTINGS.md)

## Commands

Run `omarchy-shell io.github.bmaltais.startbar <command>`:

| Command | Does | Suggested key |
|---|---|---|
| `startMenu` | Toggles the Start menu on the focused monitor | |
| `closeStartMenu` | Closes it | |
| `settings` | Opens the settings window on the focused monitor | |
| `closeSettings` | Closes it | |
| `showDesktop` | Hides every window on every monitor; again to bring them back ([details](windows-and-monitors.md#show-desktop)) | Super+D |
| `snapPicker` | Opens the snap picker for the active window, under the pointer ([details](snap-layouts.md#from-the-keyboard-superz)); needs **Snap layouts** on | Super+Z |
| `closeSnapPicker` | Closes it | |

## Keys in the picker

While the picker is open it holds the keyboard.

| Key | Does |
|---|---|
| 1–9 | Choose a layout |
| ← → | Step through the layout's zones |
| ↑ ↓ | Move a row |
| Return, Space | Apply the selected zone |
| M | Open the monitor map (more than one monitor); ← → then Return sends the window there |
| Escape | Close the map, then the picker |

### Window keys

A key pressed in the picker can act on the window straight away and close the picker. These are the defaults:

| Key | Action | For |
|---|---|---|
| F | Maximize (toggle) | any window |
| X | Full screen (toggle) | any window |
| T | Float or tile | any window |
| C | Center | floating |
| P | Pin on top | floating |
| S | Move to scratchpad | any window |
| H J K L | Move left, down, up, right | tiled |
| none | Close window | any window |

A key the window does not offer does nothing.

### Choose your own keys

Each action has a **Super+Z key** row in the settings window (Windows page, under Snap layouts). Click it and press the key you want, with any Ctrl, Alt, Shift or Super: a letter, an arrow, `Ctrl+M`, `F5`. **Backspace** clears the row, **Escape** cancels.

- A key you bind wins over the picker's own use of it, so you can give an arrow or a digit a new job. Escape cannot be bound.
- Two actions on one key: the first in the table above keeps it.
- Close window has no key until you give it one.

The keys are saved as `snapKeyMaximize`, `snapKeyFullscreen`, `snapKeyFloat`, `snapKeyCenter`, `snapKeyPin`, `snapKeyScratchpad`, `snapKeyMoveLeft`, `snapKeyMoveDown`, `snapKeyMoveUp`, `snapKeyMoveRight` and `snapKeyClose`, as text such as `f`, `up` or `ctrl+m` (see [SETTINGS.md](SETTINGS.md)).

## In the Start menu

Type to search, ↑ ↓ to move, Return to launch, Escape to back out one step.
