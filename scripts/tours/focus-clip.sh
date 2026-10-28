# shellcheck shell=bash
# A short clip of Focus follows mouse and Raise window on focus: the pointer moves over the window behind, which comes to the front. Run it with scripts/tour.sh scripts/tours/focus-clip.sh [--install].
#
# It runs in a sandbox, like the hero tour (see scripts/tours/common.sh).

# shellcheck source=tours/common.sh
source "$TOUR_DIR/common.sh"
TOUR_OUT=screenshots/focus-clip.avif
# The whole screen, to an even size (the session reports 1280x801 and the encoder needs even sides).
TOUR_CROP=1280x800+0+0
TOUR_GIF_WIDTH=800
TOUR_MAX_SECONDS=150
with_settings '{"focusFollowsMouse": true, "raiseOnFocus": true}'

tour_setup() {
  float_win com.mitchellh.ghostty "Terminal" 1f3b2d 640 220 520 340 >/dev/null
  float_win org.gnome.Nautilus "Documents" 2a3550 220 140 520 340 >/dev/null
  settle_focus
}

tour_play() {
  glide 640 "$((H - 200))"; sleep 1.2
  glide 300 220; sleep 1.8      # the documents window, behind: it comes to the front
  glide 1000 300; sleep 1.8     # the terminal, now behind: front again, as the clip began
  glide 640 "$((H - 200))"; sleep 0.8
}
