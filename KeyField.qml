// A settings field that records a key chord (SnapKeys.js) instead of text: click
// it, then press the key, with any of Ctrl, Alt, Shift and Super, that should
// do the job. Escape cancels; Backspace or Delete clears the key. It reads
// key events only, so it never touches the clipboard (PlainField.qml's reason).
import QtQuick
import "SnapKeys.js" as SnapKeys

Rectangle {
  id: field

  property string chord: ""
  property color fg: "white"
  property color accent: "dodgerblue"
  property string fontFamily: ""
  property int fontPixelSize: 14
  property real radiusSize: 4
  readonly property bool capturing: field.activeFocus
  signal captured(string next)

  implicitWidth: 160
  implicitHeight: 30
  radius: field.radiusSize
  color: Qt.rgba(field.fg.r, field.fg.g, field.fg.b, 0.08)
  border.width: field.capturing ? 1 : 0
  border.color: field.accent
  focus: false
  activeFocusOnTab: true

  Text {
    textFormat: Text.PlainText
    anchors.centerIn: parent
    text: field.capturing ? "Press a key…" : (field.chord.length > 0 ? SnapKeys.label(field.chord) : "None")
    color: field.fg
    opacity: field.capturing || field.chord.length === 0 ? 0.55 : 1
    font.family: field.fontFamily
    font.pixelSize: field.fontPixelSize
  }

  MouseArea {
    anchors.fill: parent
    cursorShape: Qt.PointingHandCursor
    onClicked: field.forceActiveFocus()
  }

  Keys.onPressed: function (event) {
    event.accepted = true
    if (event.key === Qt.Key_Escape) {
      field.focus = false
      return
    }
    if (event.key === Qt.Key_Backspace || event.key === Qt.Key_Delete) {
      field.captured("")
      field.focus = false
      return
    }
    var next = SnapKeys.chordOf(event.key, event.modifiers)
    // A modifier pressed on its own: wait for the key that goes with it.
    if (next === null) return
    field.captured(next)
    field.focus = false
  }
}
