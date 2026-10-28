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
  // The monitor the keyboard has selected (by name, "" for none), lit like a hovered one.
  property string kbName: ""
  signal pick(string name)

  readonly property var map: DockMonitors.monitorMap(picker.screens, picker.current, { w: picker.boxWidth, h: picker.boxHeight }, picker.gap)

  // The monitors left to right, then top to bottom, that a click could send a Window to.
  readonly property var choices: {
    var list = picker.map.rects.filter(function (r) { return !r.current })
    list.sort(function (a, b) { return a.x - b.x || a.y - b.y })
    return list.map(function (r) { return r.name })
  }
  function step(by) {
    var n = picker.choices.length
    if (n === 0) return
    var i = picker.choices.indexOf(picker.kbName)
    picker.kbName = picker.choices[i < 0 ? (by > 0 ? 0 : n - 1) : (i + by + n) % n]
  }
  function pickSelected() {
    if (picker.kbName !== "" && picker.choices.indexOf(picker.kbName) >= 0) picker.pick(picker.kbName)
  }

  implicitWidth: picker.map.width
  implicitHeight: picker.map.height

  Repeater {
    model: picker.map.rects

    delegate: Rectangle {
      id: tile
      required property var modelData
      readonly property bool lit: tileMouse.containsMouse || tile.modelData.name === picker.kbName

      x: tile.modelData.x
      y: tile.modelData.y
      width: tile.modelData.w
      height: tile.modelData.h
      radius: Style.space(4)
      color: tile.modelData.current ? "transparent"
        : (tile.lit ? Qt.rgba(picker.accent.r, picker.accent.g, picker.accent.b, 0.35) : Qt.rgba(picker.fg.r, picker.fg.g, picker.fg.b, 0.08))
      border.width: 1
      border.color: tile.lit && !tile.modelData.current ? picker.accent : picker.hairline
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
