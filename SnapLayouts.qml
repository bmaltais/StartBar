// The layout picker at the top of a Window's menu (docs/SPEC.md "Snap
// layouts"): one small thumbnail per layout of SnapLayouts.js, each zone of it
// lighting up under the pointer. Choosing a zone emits pick(zone, layout): the
// zone and the layout it is in, for SnapLayouts.js plan().
pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons
import "SnapLayouts.js" as SnapLayouts

Item {
  id: snap

  property color fg: "white"
  property color accent: "dodgerblue"
  property color hairline: "#1fffffff"
  property var layouts: SnapLayouts.LAYOUTS
  // The zone the keyboard has selected, lit like a hovered one: kbLayout < 0 for none.
  property int kbLayout: -1
  property int kbZone: 0
  signal pick(var zone, var layout)

  implicitHeight: grid.implicitHeight

  // Keyboard: choose a layout (its first zone), step through a layout's zones,
  // move a row (the grid has two columns), and pick the selected zone.
  function selectLayout(i) {
    if (i < 0 || i >= snap.layouts.length) return
    snap.kbLayout = i
    snap.kbZone = 0
  }
  function stepZone(by) {
    if (snap.kbLayout < 0) { snap.selectLayout(0); return }
    var n = snap.layouts[snap.kbLayout].length
    snap.kbZone = (snap.kbZone + by + n) % n
  }
  function stepRow(by) {
    if (snap.kbLayout < 0) { snap.selectLayout(0); return }
    snap.selectLayout(Math.max(0, Math.min(snap.layouts.length - 1, snap.kbLayout + by * 2)))
  }
  function pickSelected() {
    if (snap.kbLayout < 0 || snap.kbLayout >= snap.layouts.length) return
    var layout = snap.layouts[snap.kbLayout]
    snap.pick(layout[snap.kbZone], layout)
  }

  Grid {
    id: grid
    anchors.horizontalCenter: parent.horizontalCenter
    columns: 2
    spacing: Style.space(8)
    padding: Style.space(8)

    Repeater {
      model: snap.layouts
      delegate: Rectangle {
        id: thumb
        required property var modelData
        required property int index
        width: Style.space(74)
        height: Style.space(46)
        radius: Style.space(4)
        color: "transparent"
        border.width: 1
        border.color: snap.hairline

        Repeater {
          model: thumb.modelData
          delegate: Rectangle {
            id: zone
            required property var modelData
            required property int index
            readonly property bool selected: snap.kbLayout === thumb.index && snap.kbZone === zone.index
            readonly property int inset: 1
            x: Math.round(modelData.x * thumb.width) + inset
            y: Math.round(modelData.y * thumb.height) + inset
            width: Math.round(modelData.w * thumb.width) - inset * 2
            height: Math.round(modelData.h * thumb.height) - inset * 2
            radius: 2
            color: zoneMouse.containsMouse || zone.selected ? snap.accent : Qt.rgba(snap.fg.r, snap.fg.g, snap.fg.b, 0.4)

            MouseArea {
              id: zoneMouse
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: snap.pick(zone.modelData, thumb.modelData)
            }
          }
        }
      }
    }
  }
}
