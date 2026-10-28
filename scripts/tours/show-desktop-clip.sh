# shellcheck shell=bash
# A short clip of Show desktop: three windows, one command hides them all, the next brings each back where it was. Run it with scripts/tour.sh scripts/tours/show-desktop-clip.sh [--install].
#
# It runs in a sandbox, like the hero tour (see scripts/tours/common.sh).

# shellcheck source=tours/common.sh
source "$TOUR_DIR/common.sh"
TOUR_OUT=screenshots/show-desktop-clip.avif
# The whole screen, to an even size (the session reports 1280x801 and the encoder needs even sides).
TOUR_CROP=1280x800+0+0
TOUR_GIF_WIDTH=800
TOUR_MAX_SECONDS=150
tour_setup() {
  float_win org.gnome.Nautilus "Documents" 2a3550 120 140 480 320 >/dev/null
  float_win com.mitchellh.ghostty "Terminal" 1f3b2d 460 260 500 320 >/dev/null
  float_win btop "btop" 4a2f3a 780 120 420 300 >/dev/null
  settle_focus
}

tour_play() {
  glide 640 "$((H - 200))"; sleep 1.6
  omarchy-shell "$ID" showDesktop
  sleep 2.2
  omarchy-shell "$ID" showDesktop
  sleep 2.2
}
