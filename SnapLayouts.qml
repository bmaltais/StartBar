// The layout picker at the top of a Window's menu (docs/SPEC.md "Snap
// layouts"): one small thumbnail per layout of SnapLayouts.js, each zone of it
// lighting up under the pointer. Choosing a zone emits pick(zone, others): the
// zone as fractions of the monitor's usable area, and the layout's other zones.
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
  signal pick(var zone, var others)

  implicitHeight: grid.implicitHeight

  // A layout's other zones, as plain {x, y, w, h}. Zones are told apart by
  // value: the model hands out a copy each time, so identity does not hold.
  function othersOf(layout, zone) {
    var out = []
    for (var i = 0; i < layout.length; i++) {
      var z = layout[i]
      if (z.x === zone.x && z.y === zone.y && z.w === zone.w && z.h === zone.h) continue
      out.push({ x: z.x, y: z.y, w: z.w, h: z.h })
    }
    return out
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
              onClicked: snap.pick(zone.modelData, snap.othersOf(thumb.modelData, zone.modelData))
            }
          }
        }
      }
    }
  }
}
