# shellcheck shell=bash
# StartBar's tour: the animation at the top of the README (screenshots/hero.avif).
# Run it with scripts/tour.sh scripts/tours/hero.sh --install (or scripts/hero.sh --install).
#
# The story, in the order a person would show it: two windows are snapped side by side from their icons' menus; Super+Z on the keyboard
# re-snaps one into a quarter and F maximizes it and puts it back; Show desktop hides everything and returns it; the bar's menu opens the
# settings window, where the colours and the edge change at once; then the Dock on the left, in the light colours, with a Preview beside
# it. Each feature has its own clip too (scripts/tours/*-clip.sh); this is the short version, kept under a minute (the Start menu is left
# to its clip).
#
# It runs in a nested session in a sandbox (scripts/tours/common.sh): nothing of yours is touched, and the Start menu's power
# commands are refused. The windows are terminals posing as apps (the Dock gives them those apps' icons).
#
# Coordinates in the settings window are those of the window at its default size and place, centred on the 1280x800 screen
# (Service.qml, settingsWindow): the page list on the left, then the rows of the Taskbar page.

# shellcheck source=tours/common.sh
source "$TOUR_DIR/common.sh"
TOUR_OUT=screenshots/hero.avif
TOUR_STEPS=5
TOUR_MAX_SECONDS=360
with_settings '{"snapLayouts": true}'

tour_setup() {
  DOCS=$(float_win org.gnome.Nautilus "Documents" 2a3550 120 110 560 340)
  TERM_WIN=$(float_win com.mitchellh.ghostty "Terminal" 1f3b2d 520 290 560 340)
  pose btop "btop" 4a2f3a 5
  settle_focus
  item_center '.appId == "btop"' >/dev/null
}

# zone_click LAYOUT-COLUMN LAYOUT-ROW FX FY: click inside a thumbnail of the open icon menu's layout picker, at that fraction of it.
zone_click() {
  local mx my mw mh
  read -r mx my mw mh < <(menu_rect item)
  # 74 x 46 thumbnails, two to a row, 8 px apart, centred in the menu, 8 px below its top and 8 px of padding.
  local tx=$((mx + mw / 2 - 4 - 74 + $1 * 82)) ty=$((my + 8 + 8 + $2 * 54))
  glide "$((tx + 74 * $3 / 100))" "$((ty + 46 * $4 / 100))"; sleep 0.5
  click "$((tx + 74 * $3 / 100))" "$((ty + 46 * $4 / 100))" 1.4
}

# super_z: the key the picker opens on, as the shell's own command (the recorder sends no chords), once the window has the focus.
super_z() { omarchy-shell "$ID" snapPicker; wait_until snap_up 10; sleep 1.2; }

tour_play() {
  local x y bx by bw bh px py pw ph

  # 1. Snap two windows side by side from their icons' menus.
  cap "Snap windows into layouts from the icon menu"
  glide 640 420; sleep 0.8
  read -r x y < <(item_center '.appId == "org.gnome.Nautilus"')
  rclick "$x" "$y" 0.8
  sleep 0.6
  zone_click 0 0 25 50          # halves, the left one
  sleep 1.0
  read -r x y < <(item_center '.appId == "com.mitchellh.ghostty"')
  rclick "$x" "$y" 0.8
  sleep 0.6
  zone_click 0 0 75 50          # halves, the right one
  sleep 1.0

  # 2. Super+Z: a layout from the keyboard, then F maximizes and puts the window back.
  cap "Super+Z for layouts from the keyboard; F maximizes"
  click 940 330 0.8             # the window on the right takes the focus
  super_z
  pressed 4; sleep 0.8          # quarters
  pressed Right; sleep 0.6
  pressed Return; sleep 1.2
  glide 940 220; sleep 0.3
  super_z
  pressed f; sleep 1.4          # maximize
  super_z
  pressed f; sleep 1.2          # and back

  # 3. Show desktop, and everything back where it was.
  cap "Show desktop hides everything, then brings it back"
  omarchy-shell "$ID" showDesktop
  sleep 2.4
  omarchy-shell "$ID" showDesktop
  sleep 2.2

  # 4. The bar's menu opens the settings window; colours and the edge change as they are clicked.
  cap "Right-click the bar for every setting. Changes apply as you click"
  read -r x y < <(start_button)
  rclick 640 "$y" 0.8
  read -r bx by bw bh < <(menu_rect bar)
  sleep 1.0
  glide "$((bx + bw / 2))" "$((by + bh - 20))"; sleep 0.6
  click "$((bx + bw / 2))" "$((by + bh - 20))" 1.6                                              # Settings...
  click 299 253 1.0          # Windows
  click 299 213 0.8          # Taskbar
  click 987 293 1.6          # Colors: Light
  click 889 251 1.8          # Position: Left
  esc; sleep 1.2

  # 5. The Dock on the left, in the light colours: a Preview beside it.
  cap "Any edge, light or dark, with live previews"
  read -r x y < <(item_center '.appId == "org.gnome.Nautilus"')
  glide 3 "$y"; glide "$x" "$y"
  read -r px py pw ph < <(menu_rect preview)
  sleep 1.8
  glide "$((px + pw / 4))" "$((py + ph / 2))"; sleep 1.4
  glide 700 300; sleep 0.8
}
