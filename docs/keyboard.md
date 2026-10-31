# Keyboard and commands

StartBar binds a few **Command keys** itself, anywhere on the desktop, and answers commands you can bind to other keys yourself in your Hyprland configuration.

[README](../README.md) · [Snap layouts](snap-layouts.md) · [Windows and monitors](windows-and-monitors.md) · [Settings reference](SETTINGS.md)

## Command keys

These are bound at runtime, with no configuration of yours, and bound again after a Hyprland reload.

| Command | Does | Default key |
|---|---|---|
| `snapPicker` | Opens the snap picker for the active window, under the pointer ([details](snap-layouts.md#from-the-keyboard-superz)); Escape closes it | Super+Z, only while **Snap layouts** is on |
| `showDesktop` | Hides every window on every monitor; again to bring them back ([details](windows-and-monitors.md#show-desktop)) | Super+D |
| `startMenu` | Toggles the Start menu on the focused monitor | none |
| `settings` | Opens the settings window on the focused monitor | none |

Change or clear a key in the settings window, on the **Keyboard** page, **Commands**: click the row and press the key, such as `Ctrl+U` or `Super+Shift+F5`. It needs Super, Ctrl or Alt (Shift alone would take capital letters from every app). **Backspace** clears the row, **Escape** cancels. While a row waits for a key, StartBar lets go of its own keys, so you can press one it uses.

- A key already bound by you or by Omarchy always wins: StartBar does not bind it, and the row says what holds it ("Taken by ..."). So a Super+Z or Super+D bind of your own keeps working, and nothing fires twice.
- Two commands on one key: the first in the table keeps it.
- The keys are saved as `keySnapPicker`, `keyShowDesktop`, `keyStartMenu` and `keySettings`, as text such as `super+z` or `ctrl+u` ([SETTINGS.md](SETTINGS.md)). A key you never touched uses its default; an empty value leaves the command unbound.

## Other commands

Run `omarchy-shell io.github.bmaltais.startbar <command>`, for example from your own binding:

| Command | Does |
|---|---|
| `startMenu`, `closeStartMenu` | Toggle, close the Start menu |
| `settings`, `closeSettings` | Open, close the settings window |
| `showDesktop` | Toggle show desktop |
| `snapPicker`, `closeSnapPicker` | Toggle, close the snap picker (the Command key only opens it) |

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

Each action has a row in the settings window (Keyboard page, **In the snap picker**). Click it and press the key you want, with any Ctrl, Alt, Shift or Super: a letter, an arrow, `Ctrl+M`, `F5`. **Backspace** clears the row, **Escape** cancels.

- A key you bind wins over the picker's own use of it, so you can give an arrow or a digit a new job. Escape cannot be bound.
- Two actions on one key: the first in the table above keeps it.
- Close window has no key until you give it one.

The keys are saved as `snapKeyMaximize`, `snapKeyFullscreen`, `snapKeyFloat`, `snapKeyCenter`, `snapKeyPin`, `snapKeyScratchpad`, `snapKeyMoveLeft`, `snapKeyMoveDown`, `snapKeyMoveUp`, `snapKeyMoveRight` and `snapKeyClose`, as text such as `f`, `up` or `ctrl+m` (see [SETTINGS.md](SETTINGS.md)).

## In the Start menu

Type to search, ↑ ↓ to move, Return to launch, Escape to back out one step.
