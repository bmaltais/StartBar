// The layout picker at the top of a floating Window's Item menu (docs/SPEC.md
// "Snap layouts"): one small thumbnail per layout of SnapLayouts.js, each zone
// of it lighting up under the pointer. Choosing a zone emits pick(zone), the
// zone as fractions of the monitor's usable area.
pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons
import "SnapLayouts.js" as SnapLayouts

Item {
  id: snap

  property color fg: "white"
  property color accent: "dodgerblue"
  property color hairline: "#1fffffff"
  signal pick(var zone)

  implicitHeight: grid.implicitHeight

  Grid {
    id: grid
    anchors.horizontalCenter: parent.horizontalCenter
    columns: 2
    spacing: Style.space(8)
    padding: Style.space(8)

    Repeater {
      model: SnapLayouts.LAYOUTS
      delegate: Rectangle {
        id: thumb
        required property var modelData
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
            readonly property int inset: 1
            x: Math.round(modelData.x * thumb.width) + inset
            y: Math.round(modelData.y * thumb.height) + inset
            width: Math.round(modelData.w * thumb.width) - inset * 2
            height: Math.round(modelData.h * thumb.height) - inset * 2
            radius: 2
            color: zoneMouse.containsMouse ? snap.accent : Qt.rgba(snap.fg.r, snap.fg.g, snap.fg.b, 0.4)

            MouseArea {
              id: zoneMouse
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: snap.pick(zone.modelData)
            }
          }
        }
      }
    }
  }
}
