// The map of the monitors in the "Move to monitor" flyout (docs/SPEC.md
// "Input"): one rectangle per monitor, laid out as they sit on the desk, the
// one under the pointer lit in the accent colour. Clicking one emits
// pick(name); the monitor the Window is on is dimmed and does nothing.
pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons
import "DockMonitors.js" as DockMonitors

Item {
  id: picker

  property var screens: []
  property string current: ""
  property color fg: "white"
  property color accent: "dodgerblue"
  property color hairline: "#1fffffff"
  property int boxWidth: Style.space(280)
  property int boxHeight: Style.space(120)
  property int gap: Style.space(6)
  signal pick(string name)

  readonly property var map: DockMonitors.monitorMap(picker.screens, picker.current, { w: picker.boxWidth, h: picker.boxHeight }, picker.gap)

  implicitWidth: picker.map.width
  implicitHeight: picker.map.height

  Repeater {
    model: picker.map.rects

    delegate: Rectangle {
      id: tile
      required property var modelData

      x: tile.modelData.x
      y: tile.modelData.y
      width: tile.modelData.w
      height: tile.modelData.h
      radius: Style.space(4)
      color: tile.modelData.current ? "transparent"
        : (tileMouse.containsMouse ? Qt.rgba(picker.accent.r, picker.accent.g, picker.accent.b, 0.35) : Qt.rgba(picker.fg.r, picker.fg.g, picker.fg.b, 0.08))
      border.width: 1
      border.color: tileMouse.containsMouse && !tile.modelData.current ? picker.accent : picker.hairline
      opacity: tile.modelData.current ? 0.5 : 1

      Text {
        textFormat: Text.PlainText
        anchors.centerIn: parent
        width: parent.width - Style.space(6)
        horizontalAlignment: Text.AlignHCenter
        elide: Text.ElideRight
        text: tile.modelData.name
        color: picker.fg
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
      }

      MouseArea {
        id: tileMouse
        anchors.fill: parent
        hoverEnabled: true
        enabled: !tile.modelData.current
        cursorShape: Qt.PointingHandCursor
        onClicked: picker.pick(tile.modelData.name)
      }
    }
  }
}
