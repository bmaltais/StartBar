# shellcheck shell=bash
# A short clip of the Super+Z picker: it opens under the pointer, a layout is chosen with the keys, then F maximizes the window. It ends
# with the window back where it began, so that the animation loops. Run it with scripts/tour.sh scripts/tours/super-z-clip.sh [--install].
#
# It runs in a sandbox, like the hero tour (see scripts/tours/common.sh).

# shellcheck source=tours/common.sh
source "$TOUR_DIR/common.sh"
TOUR_OUT=screenshots/super-z-clip.avif
# The whole screen, to an even size (the session reports 1280x801 and the encoder needs even sides).
TOUR_CROP=1280x800+0+0
TOUR_GIF_WIDTH=800
TOUR_MAX_SECONDS=150
with_settings '{"snapLayouts": true}'

tour_setup() {
  WIN=$(float_win org.gnome.Nautilus "Documents" 2a3550 380 180 520 330)
  settle_focus
  hyprctl dispatch "hl.dsp.focus({ window = \"address:$WIN\" })" >/dev/null
}

tour_play() {
  glide 600 330; sleep 1.0
  omarchy-shell "$ID" snapPicker
  wait_until snap_up 10; sleep 1.2
  pressed 4; sleep 0.8          # quarters
  pressed Right; sleep 0.6
  pressed Return; sleep 1.6
  glide 600 330; sleep 0.6
  omarchy-shell "$ID" snapPicker
  wait_until snap_up 10; sleep 1.2
  pressed f; sleep 1.8          # maximize
  hyprctl dispatch "hl.dsp.window.fullscreen({ mode = \"maximized\", action = \"unset\", window = \"address:$WIN\" })" >/dev/null
  hyprctl dispatch "hl.dsp.window.resize({ x = 520, y = 330, exact = true, window = \"address:$WIN\" })" >/dev/null
  hyprctl dispatch "hl.dsp.window.move({ x = 380, y = 180, window = \"address:$WIN\" })" >/dev/null
  sleep 1.0
}
