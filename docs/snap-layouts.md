# Snap layouts

Put a window in a zone of the screen in one click, as in Windows 11. Off by default: turn on **Snap layouts** in the settings window (Windows page), or set `snapLayouts` to `true`.

[README](../README.md) · [Keyboard and commands](keyboard.md) · [Settings reference](SETTINGS.md) · [Full specification](SPEC.md#input)

<img src="../screenshots/snap-layouts-clip.avif" alt="A window's menu opens with the layout picker; clicking the left half snaps the window there, then the lower right quarter" width="640">

## The picker

With Snap layouts on, the menu of a window (right-click its icon, or its preview) starts with a picker: one small thumbnail per layout, each zone lighting up under the pointer.

| Layout | Zones |
|---|---|
| Halves | left and right |
| Two stacked | top and bottom |
| Thirds | three columns |
| Quarters | a 2 × 2 grid |
| Main pane | one large zone with two stacked beside it |
| One over two | one on top, two side by side below |
| Wide and narrow | 2/3 and 1/3 |
| Full | the whole area; maximizes the window |

Click a zone and the window goes there. Zones keep a 6 px margin round the edge and between them, and stay clear of the bar (the Dock's own space, and Omarchy's bar while it shows).

## Floating and tiled windows

- **A floating window** is offered all the layouts, and is sized and moved into the zone you click.
- **A tiled window is never floated.** With two or three tiles on its workspace the picker offers the shapes that many tiles can take (side by side or stacked; one beside two, three columns, one over two, three rows), and a click reshapes the workspace and puts the window in that zone. With four or more tiles the picker shows the tiles as they are, and a click swaps places with one.
- **Move left / right / up / down** is added to a tiled window's menu: it swaps places with its neighbour on that side.
- **A window on one of Omarchy's window-mode workspaces** counts as floating, since every window there floats.

## Fill the other windows

**Snap fills the other windows** (`snapFillOthers`, off by default) makes a click fill the rest of the layout too: the workspace's other windows on the same monitor, most recently used first, take the remaining zones. They become floating (**Tile** puts one back). Windows beyond the zones are left alone.

## From the keyboard: Super+Z

<img src="../screenshots/super-z-clip.avif" alt="Super+Z opens the picker under the pointer; keys choose a layout, then F maximizes the window" width="640">

With **Snap layouts** on, **Super+Z** opens the same picker for the active window, under the pointer. StartBar binds the key itself (change or clear it on the Keyboard page of the settings window; a Super+Z that is already bound elsewhere is left alone). Then:

- **1–9** choose a layout, **← →** step through its zones, **↑ ↓** move a row, **Return** or **Space** applies it, **Escape** closes.
- **Letters act on the window** without choosing a layout: F maximizes, T floats or tiles, S sends it to the scratchpad, and so on. Every one is changeable. See [Keyboard and commands](keyboard.md#keys-in-the-picker).
- **M**, with more than one monitor, opens the map of your monitors (see [Move to monitor](windows-and-monitors.md#move-to-monitor)).

With a single tiled window and one monitor there is nothing to offer, so the picker does not open.

## Behind the scenes

The exact rules (how the area is measured, titlebars on window-mode workspaces, how a tiled workspace is reshaped by flipping Hyprland's splits and reading the result back) are in [SPEC.md, "Snap layouts"](SPEC.md#input). The decision is made in `SnapLayouts.js` and applied by `DockSnap.js`; both are covered by tests.
