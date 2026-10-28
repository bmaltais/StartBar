# shellcheck shell=bash
# A short clip of snap layouts: a floating window's menu opens with the layout picker, and a zone is clicked; then another layout. It ends
# with the window back where it began, so that the animation loops. Run it with scripts/tour.sh scripts/tours/snap-layouts-clip.sh [--install].
#
# It runs in a sandbox, like the hero tour (see scripts/tours/common.sh).

# shellcheck source=tours/common.sh
source "$TOUR_DIR/common.sh"
TOUR_OUT=screenshots/snap-layouts-clip.avif
# The whole screen, to an even size (the session reports 1280x801 and the encoder needs even sides).
TOUR_CROP=1280x800+0+0
TOUR_GIF_WIDTH=800
TOUR_MAX_SECONDS=150
with_settings '{"snapLayouts": true}'

tour_setup() {
  WIN=$(float_win org.gnome.Nautilus "Documents" 2a3550 380 180 520 330)
  settle_focus
  item_center '.appId == "org.gnome.Nautilus"' >/dev/null
}

# zone_click LAYOUT-COLUMN LAYOUT-ROW FX FY: click inside a thumbnail of the open menu's picker, at that fraction of it.
zone_click() {
  local mx my mw mh
  read -r mx my mw mh < <(menu_rect item)
  # 74 x 46 thumbnails, two to a row, 8 px apart, centred in the menu, 8 px below its top and 8 px of padding.
  local tx=$((mx + mw / 2 - 4 - 74 + $1 * 82)) ty=$((my + 8 + 8 + $2 * 54))
  click "$((tx + 74 * $3 / 100))" "$((ty + 46 * $4 / 100))" 1.4
}

tour_play() {
  local x y
  glide 640 "$((H - 200))"; sleep 1.0
  read -r x y < <(item_center '.appId == "org.gnome.Nautilus"')
  rclick "$x" "$y" 0.8
  sleep 0.8
  zone_click 0 0 25 50          # halves, the left one
  sleep 1.2
  rclick "$x" "$y" 0.8
  sleep 0.6
  zone_click 1 1 75 75          # quarters, the lower right one
  sleep 1.4
  hyprctl dispatch "hl.dsp.window.resize({ x = 520, y = 330, exact = true, window = \"address:$WIN\" })" >/dev/null
  hyprctl dispatch "hl.dsp.window.move({ x = 380, y = 180, window = \"address:$WIN\" })" >/dev/null
  glide 640 "$((H - 200))"; sleep 1.0
}
