// The built-in Start menu's view (docs/SPEC.md "Start menu"), modelled on the
// Windows 11 one: search, a Pinned grid, an "All apps" A-Z list, Recommended
// (recently launched) apps, right-click to pin/unpin, and an account + power
// row. StartMenu.js decides everything; `model` is its state, `send(event)`
// runs a transition, and the timers and effects it asks for are carried out
// here (arm / perform). This Item only paints the state and reports what the
// pointer and keyboard did.
//
// It is an Item of the panel (a full-screen layer surface), not a popup
// window. A popup's keyboard grab needs a recent click inside our own
// window, which a menu opened by hover or by the keyboard command doesn't
// have, so the compositor refused it and typing went to whatever window was
// focused. The panel instead claims the keyboard itself while the menu is
// open (keyboardFocus on the panel), the way Omarchy's own menu does.
//
// Events come in through send(): the panel sends the Start button's
// (buttonClick, buttonHover) and the keyboard command (command) and
// itemHovered when the pointer reaches another Item; dismiss when the
// click-away catcher is pressed. `open` and `hoverMode` are read-only.

import QtQuick
import QtQuick.Effects
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "StartMenu.js" as StartMenu

Item {
  id: startMenu

  // What this needs from outside. The panel binds these where it
  // instantiates the menu; nothing here reaches for `root` or `panel`.
  required property var taskbar        // DockConfig taskbar view: startCommand, startHoverOpen, alignment, barHeight
  required property var settings       // dockSettings: startPins, recentApps, startPlaces, pins, apply(intent)
  required property real panelWidth
  required property real panelHeight
  required property real buttonX       // the Start button's x, for left-aligned icons
  required property bool buttonHovered // the pointer is on the Start button
  signal launchRequested(var entry)    // launch this desktop entry
  signal togglePinRequested(string appId, bool pinned) // Pin/Unpin on the Dock
  signal dockHoldRequested(bool held)  // keep the Dock Revealed while the menu is up

  // --- State machine (StartMenu.js) ---------------------------------

  property var model: StartMenu.initial()
  // Pieces of `model` the view binds to. Every transition replaces
  // `model`, so anything bound to it directly would re-evaluate (and
  // re-create its list) on every event; these only notify when they
  // really change.
  readonly property string query: startMenu.model.query
  property var overlay: null
  readonly property bool open: startMenu.model.open
  // Opened by resting on the Start button rather than a click, and not
  // yet used: it closes once the pointer is on neither the button nor
  // the menu, and a click-away does not dismiss it. A keystroke or a
  // click on the search box ends it.
  readonly property bool hoverMode: startMenu.model.hover
  readonly property bool searching: StartMenu.isSearching(startMenu.model)
  readonly property bool showAll: startMenu.model.view === "all"
  readonly property bool showLetters: startMenu.model.letters
  readonly property string overlayKind: startMenu.overlay ? startMenu.overlay.kind : ""
  readonly property string navSection: startMenu.model.nav.section
  readonly property int navIndex: startMenu.model.nav.index
  readonly property string dragPinId: startMenu.model.drag.id
  readonly property int dragPinSlot: startMenu.model.drag.slot
  readonly property bool pointerAround: startMenu.buttonHovered || startMenuHover.hovered

  // What the state machine needs to know that its state does not.
  readonly property var context: ({
    command: startMenu.taskbar.startCommand,
    hoverOpen: startMenu.taskbar.startHoverOpen,
    results: startMenu.results,
    pinned: startMenu.pinnedApps,
    recent: startMenu.recentApps,
    allFlat: startMenu.catalog.allFlat,
    letterRows: startMenu.catalog.letterRows,
    startPinIds: startMenu.settings.startPins,
    dockPinIds: startMenu.settings.pins,
  })

  function send(event) {
    var result = StartMenu.transition(startMenu.model, event, startMenu.context)
    var before = startMenu.model
    startMenu.model = result.state
    if (result.state.overlay !== before.overlay) startMenu.overlay = result.state.overlay
    // Imperative, after the lists have followed the new query: the lists
    // reset their own highlight when their model changes, and a binding to
    // an unchanged index would not put it back.
    resultList.currentIndex = result.state.resultIndex
    allList.currentIndex = result.state.allIndex
    startMenu.arm(result.timers)
    for (var i = 0; i < result.effects.length; i++) startMenu.perform(result.effects[i])
    return result.handled
  }

  function arm(timers) {
    if (timers.hoverOpen === "stop") hoverOpenTimer.stop()
    else if (timers.hoverOpen === "start") hoverOpenTimer.restart()
    if (timers.leave === "stop") leaveTimer.stop()
    else if (timers.leave === "start") leaveTimer.restart()
  }

  function perform(effect) {
    switch (effect.type) {
    case "holdDock": startMenu.dockHoldRequested(effect.held); break
    case "setQuery": searchInput.text = effect.text; break
    case "focusSearch":
      if (effect.deferred) Qt.callLater(function () { searchInput.forceActiveFocus() })
      else searchInput.forceActiveFocus()
      break
    case "scrollPinned": pinnedGrid.positionViewAtIndex(effect.index, GridView.Contain); break
    case "scrollAll":
      allList.positionViewAtIndex(effect.index, effect.position === "beginning" ? ListView.Beginning : ListView.Contain)
      break
    case "launch": startMenu.launchRequested(effect.app.entry); break
    case "apply": startMenu.settings.apply(effect.intent); break
    case "run": Quickshell.execDetached(["bash", "-lc", effect.command]); break
    case "open": Quickshell.execDetached(["xdg-open", effect.path]); break
    case "togglePin": startMenu.togglePinRequested(effect.appId, effect.pinned); break
    }
  }

  function keyName(key) {
    if (key === Qt.Key_Left) return "left"
    if (key === Qt.Key_Right) return "right"
    if (key === Qt.Key_Up) return "up"
    if (key === Qt.Key_Down) return "down"
    if (key === Qt.Key_Return || key === Qt.Key_Enter) return "enter"
    if (key === Qt.Key_Escape) return "escape"
    return "other"
  }

  Timer {
    id: hoverOpenTimer
    interval: StartMenu.HOVER_OPEN_DELAY_MS
    onTriggered: startMenu.send({ type: "hoverOpenFired" })
  }

  Timer {
    id: leaveTimer
    interval: StartMenu.LEAVE_DELAY_MS
    onTriggered: startMenu.send({ type: "leaveFired", pointerAround: startMenu.pointerAround })
  }

  // --- What the menu lists ------------------------------------------

  readonly property int menuMargin: Style.spacing.xs
  readonly property var allApps: {
    var values = DesktopEntries.applications.values
    var list = []
    for (var i = 0; i < values.length; i++) {
      var entry = values[i]
      list.push({
        id: entry.id,
        name: entry.name || entry.id,
        genericName: entry.genericName || "",
        keywords: entry.keywords || [],
        noDisplay: !!entry.noDisplay,
        icon: entry.icon,
        entry: entry,
      })
    }
    return list
  }
  readonly property var catalog: StartMenu.catalog(startMenu.allApps)
  readonly property var pinnedApps: StartMenu.resolveApps(startMenu.catalog, startMenu.settings.startPins)
  readonly property var recentApps: StartMenu.resolveApps(startMenu.catalog, startMenu.settings.recentApps)
  readonly property var results: StartMenu.filterApps(startMenu.allApps, startMenu.query)
  // Places column on the left (Home, Documents, Downloads...): from the
  // user's XDG folders or a `startPlaces` list (StartMenu.effectivePlaces).
  property string userDirsText: ""
  readonly property var places: StartMenu.effectivePlaces(startMenu.settings.startPlaces, startMenu.userDirsText, Quickshell.env("HOME") || "")
  readonly property real placesWidth: startMenu.places.length > 0 ? Style.space(150) : 0

  FileView {
    path: Quickshell.env("HOME") + "/.config/user-dirs.dirs"
    printErrors: false
    onLoaded: startMenu.userDirsText = text()
  }

  // Whether ~/.face exists, so the avatar never tries to load a missing file.
  property bool hasFace: false

  Process {
    running: true
    command: ["test", "-f", Quickshell.env("HOME") + "/.face"]
    onExited: function (exitCode) { startMenu.hasFace = exitCode === 0 }
  }

  Process {
    running: true
    command: ["getent", "passwd", Quickshell.env("USER") || ""]
    stdout: StdioCollector {
      onStreamFinished: startMenu.fullName = StartMenu.parseFullName(text, "")
    }
  }

  readonly property string userName: {
    var name = Quickshell.env("USER") || ""
    return name.length > 0 ? name.charAt(0).toUpperCase() + name.slice(1) : "User"
  }

  // Account: real name from the system account (falls back to the login).
  property string fullName: ""
  readonly property string accountName: startMenu.fullName.length > 0 ? startMenu.fullName : startMenu.userName

  // Drag to reorder a pinned app: tell the state machine where the
  // ghost's centre is, in the grid's own coordinates.
  function pinDragMoved() {
    if (startMenu.dragPinId === "") return
    var p = pinnedGrid.mapFromItem(pinGhost.parent, pinGhost.x + pinGhost.width / 2, pinGhost.y + pinGhost.height / 2)
    startMenu.send({
      type: "pinDragMove",
      point: p,
      grid: { width: pinnedGrid.width, height: pinnedGrid.height, cellWidth: pinnedGrid.cellWidth, cellHeight: pinnedGrid.cellHeight, contentY: pinnedGrid.contentY },
    })
  }

  function openAppMenu(app, item, mouse) {
    var point = item.mapToItem(card, mouse.x, mouse.y)
    startMenu.send({
      type: "appMenu",
      app: app,
      x: Math.min(point.x, card.width - Style.space(200)),
      y: Math.min(point.y, card.height - Style.space(130)),
    })
  }

  // --- Geometry -----------------------------------------------------

  visible: startMenu.open
  // Zero-sized while closed, so the panel's input mask (which goes by
  // item geometry) takes nothing from the windows beneath.
  readonly property real fullWidth: Style.space(600) + startMenu.placesWidth
  readonly property real fullHeight: Math.min(Style.space(640), Math.max(Style.space(240), startMenu.panelHeight - startMenu.taskbar.barHeight - startMenu.menuMargin * 2))
  width: startMenu.open ? startMenu.fullWidth : 0
  height: startMenu.open ? startMenu.fullHeight : 0
  // Centred icons: the menu is centred on the screen. Left-aligned: its
  // left edge lines up with the Start button. Either way it stays on screen.
  readonly property real anchorX: startMenu.taskbar.alignment === "left"
    ? startMenu.buttonX
    : (startMenu.panelWidth - startMenu.fullWidth) / 2
  x: Math.round(Math.max(startMenu.menuMargin, Math.min(startMenu.anchorX, startMenu.panelWidth - startMenu.fullWidth - startMenu.menuMargin)))
  y: Math.round(Math.max(startMenu.menuMargin, startMenu.panelHeight - startMenu.taskbar.barHeight - startMenu.fullHeight - startMenu.menuMargin))

  Rectangle {
    id: card
    anchors.fill: parent
    radius: Style.cornerRadius
    color: Color.popups.background
    border.width: Style.normalBorderWidth
    border.color: Color.popups.border

    HoverHandler {
      id: startMenuHover
      onHoveredChanged: startMenu.send({ type: "menuHover", hovered: hovered })
    }

    Rectangle {
      id: searchBox
      anchors.top: parent.top
      anchors.left: placesPane.right
      anchors.right: parent.right
      anchors.margins: Style.spacing.md
      height: Style.space(36)
      // A slight rounding of its own: Style.cornerRadius follows
      // Hyprland's window rounding, which many setups (this one
      // included) set to 0, and a sharp search box looks out of place.
      radius: Math.max(Style.cornerRadius, Style.space(6))
      color: Util.alpha(Color.popups.text, 0.08)

      // In a hover-opened menu, clicking the search box is how you say
      // "I want to type": it takes the focus grab (and the keyboard).
      MouseArea {
        anchors.fill: parent
        z: 2
        enabled: startMenu.hoverMode
        propagateComposedEvents: true
        onPressed: function (mouse) {
          startMenu.send({ type: "searchPressed" })
          mouse.accepted = false
        }
      }

      // The magnifier is the Material Design "magnify" glyph (U+F0349)
      // from the Nerd Font Omarchy already uses for its own icons, so it
      // matches the rest of the desktop.
      Text {
        id: searchGlyph
        anchors.verticalCenter: parent.verticalCenter
        anchors.left: parent.left
        anchors.leftMargin: Style.spacing.lg + 2
        text: "\uDB80\uDF49"
        color: Util.alpha(Color.popups.text, 0.7)
        font.family: Style.font.family
        font.pixelSize: Style.font.body + 4
      }

      Text {
        visible: searchInput.text.length === 0
        anchors.verticalCenter: parent.verticalCenter
        anchors.left: searchGlyph.right
        anchors.leftMargin: Style.spacing.md
        text: "Search..."
        color: Util.alpha(Color.popups.text, 0.5)
        font.family: Style.font.family
        font.pixelSize: Style.font.body
      }

      TextInput {
        id: searchInput
        anchors.fill: parent
        anchors.leftMargin: searchGlyph.x + searchGlyph.width + Style.spacing.md
        anchors.rightMargin: Style.spacing.md
        verticalAlignment: TextInput.AlignVCenter
        color: Color.popups.text
        font.family: Style.font.family
        font.pixelSize: Style.font.body
        clip: true
        focus: true
        onTextChanged: startMenu.send({ type: "queryChanged", text: searchInput.text })

        // Using the keyboard means you want the menu: StartMenu.js ends
        // hover mode on any key, then says whether it took this one
        // (otherwise the key goes into the box).
        Keys.onPressed: function (event) {
          event.accepted = startMenu.send({ type: "key", key: startMenu.keyName(event.key) })
        }
      }
    }

    // Places: one click opens the folder in the default file manager.
    Item {
      id: placesPane
      anchors.top: parent.top
      anchors.bottom: footer.top
      anchors.left: parent.left
      width: startMenu.placesWidth
      visible: startMenu.placesWidth > 0

      Column {
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.margins: Style.spacing.md
        spacing: 2

        Repeater {
          model: startMenu.places

          delegate: Rectangle {
            id: placeRow
            required property var modelData
            width: parent.width
            height: Style.space(38)
            radius: Style.cornerRadius
            color: placeMouse.containsMouse ? Style.hoverFillFor(Color.foreground, Color.accent) : "transparent"

            Image {
              id: placeIcon
              anchors.left: parent.left
              anchors.leftMargin: Style.spacing.sm
              anchors.verticalCenter: parent.verticalCenter
              width: Style.space(22)
              height: width
              fillMode: Image.PreserveAspectFit
              asynchronous: true
              sourceSize.width: width * Screen.devicePixelRatio
              sourceSize.height: height * Screen.devicePixelRatio
              source: Quickshell.iconPath(placeRow.modelData.icon, true)
            }

            Text {
              anchors.left: placeIcon.right
              anchors.leftMargin: Style.spacing.md
              anchors.right: parent.right
              anchors.rightMargin: Style.spacing.sm
              anchors.verticalCenter: parent.verticalCenter
              elide: Text.ElideRight
              text: placeRow.modelData.label
              color: Color.popups.text
              font.family: Style.font.family
              font.pixelSize: Style.font.body
            }

            MouseArea {
              id: placeMouse
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: startMenu.send({ type: "openPlace", path: placeRow.modelData.path })
            }
          }
        }
      }
    }

    // Settings: the way on to Omarchy's setup menu, like the gear on
    // Windows 10's left rail. Sits at the bottom of the Places column.
    Rectangle {
      visible: startMenu.placesWidth > 0
      anchors.left: placesPane.left
      anchors.bottom: placesPane.bottom
      anchors.margins: Style.spacing.md
      width: startMenu.placesWidth - Style.spacing.md * 2
      height: Style.space(38)
      radius: Style.cornerRadius
      color: settingsRailMouse.containsMouse ? Style.hoverFillFor(Color.foreground, Color.accent) : "transparent"

      Image {
        id: settingsRailIcon
        anchors.left: parent.left
        anchors.leftMargin: Style.spacing.sm
        anchors.verticalCenter: parent.verticalCenter
        width: Style.space(22)
        height: width
        fillMode: Image.PreserveAspectFit
        asynchronous: true
        sourceSize.width: width * Screen.devicePixelRatio
        sourceSize.height: height * Screen.devicePixelRatio
        source: Quickshell.iconPath("preferences-system", true)
      }

      Text {
        anchors.left: settingsRailIcon.right
        anchors.leftMargin: Style.spacing.md
        anchors.right: parent.right
        anchors.rightMargin: Style.spacing.sm
        anchors.verticalCenter: parent.verticalCenter
        elide: Text.ElideRight
        text: "Settings"
        color: Color.popups.text
        font.family: Style.font.family
        font.pixelSize: Style.font.body
      }

      MouseArea {
        id: settingsRailMouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: startMenu.send({ type: "openSettings" })
      }
    }

    Item {
      id: body
      anchors.top: searchBox.bottom
      anchors.topMargin: Style.spacing.sm
      anchors.bottom: footer.top
      anchors.left: placesPane.right
      anchors.right: parent.right
      anchors.leftMargin: Style.spacing.md
      anchors.rightMargin: Style.spacing.md

      // Search results.
      ListView {
        id: resultList
        visible: startMenu.searching
        anchors.fill: parent
        clip: true
        model: startMenu.results
        boundsBehavior: Flickable.StopAtBounds
        highlightMoveDuration: 0

        delegate: Rectangle {
          id: resultRow
          required property var modelData
          required property int index
          width: resultList.width
          height: Style.space(44)
          radius: Style.cornerRadius
          color: (resultList.currentIndex === index || resultMouse.containsMouse)
            ? Style.hoverFillFor(Color.foreground, Color.accent) : "transparent"

          Image {
            id: resultIcon
            anchors.left: parent.left
            anchors.leftMargin: Style.spacing.sm
            anchors.verticalCenter: parent.verticalCenter
            width: Style.space(28)
            height: width
            fillMode: Image.PreserveAspectFit
            asynchronous: true
            sourceSize.width: width * Screen.devicePixelRatio
            sourceSize.height: height * Screen.devicePixelRatio
            source: resultRow.modelData.icon ? Quickshell.iconPath(resultRow.modelData.icon, true) : ""
          }

          Text {
            anchors.left: resultIcon.right
            anchors.leftMargin: Style.spacing.md
            anchors.right: parent.right
            anchors.rightMargin: Style.spacing.sm
            anchors.verticalCenter: parent.verticalCenter
            elide: Text.ElideRight
            text: resultRow.modelData.name
            color: Color.popups.text
            font.family: Style.font.family
            font.pixelSize: Style.font.body
          }

          MouseArea {
            id: resultMouse
            anchors.fill: parent
            hoverEnabled: true
            acceptedButtons: Qt.LeftButton | Qt.RightButton
            cursorShape: Qt.PointingHandCursor
            onClicked: function (mouse) {
              if (mouse.button === Qt.RightButton) startMenu.openAppMenu(resultRow.modelData, resultMouse, mouse)
              else startMenu.send({ type: "launch", app: resultRow.modelData })
            }
          }
        }
      }

      // All apps: A-Z with letter headings.
      ListView {
        id: allList
        visible: !startMenu.searching && startMenu.showAll
        anchors.fill: parent
        clip: true
        model: startMenu.catalog.allFlat
        currentIndex: -1
        boundsBehavior: Flickable.StopAtBounds

        section.property: "letter"
        section.criteria: ViewSection.FullString
        section.delegate: Item {
          required property string section
          width: allList.width
          height: Style.space(30)

          Text {
            anchors.left: parent.left
            anchors.leftMargin: Style.spacing.sm
            anchors.verticalCenter: parent.verticalCenter
            text: parent.section
            color: Color.accent
            font.family: Style.font.family
            font.pixelSize: Style.font.body
            font.bold: true
          }

          // Click a letter heading for the A-Z jump grid.
          MouseArea {
            anchors.fill: parent
            cursorShape: Qt.PointingHandCursor
            onClicked: startMenu.send({ type: "letters", open: true })
          }
        }

        header: Item {
          width: allList.width
          height: Style.space(34)

          Text {
            anchors.left: parent.left
            anchors.leftMargin: Style.spacing.sm
            anchors.verticalCenter: parent.verticalCenter
            text: "‹  Back"
            color: Color.popups.text
            font.family: Style.font.family
            font.pixelSize: Style.font.body

            MouseArea {
              anchors.fill: parent
              anchors.margins: -Style.spacing.sm
              cursorShape: Qt.PointingHandCursor
              onClicked: startMenu.send({ type: "showView", view: "home" })
            }
          }
        }

        delegate: Rectangle {
          id: allRow
          required property var modelData
          required property int index
          width: allList.width
          height: Style.space(40)
          radius: Style.cornerRadius
          color: (allMouse.containsMouse || allList.currentIndex === allRow.index)
            ? Style.hoverFillFor(Color.foreground, Color.accent) : "transparent"

          Image {
            id: allIcon
            anchors.left: parent.left
            anchors.leftMargin: Style.spacing.sm
            anchors.verticalCenter: parent.verticalCenter
            width: Style.space(26)
            height: width
            fillMode: Image.PreserveAspectFit
            asynchronous: true
            sourceSize.width: width * Screen.devicePixelRatio
            sourceSize.height: height * Screen.devicePixelRatio
            source: allRow.modelData.icon ? Quickshell.iconPath(allRow.modelData.icon, true) : ""
          }

          Text {
            anchors.left: allIcon.right
            anchors.leftMargin: Style.spacing.md
            anchors.right: parent.right
            anchors.rightMargin: Style.spacing.sm
            anchors.verticalCenter: parent.verticalCenter
            elide: Text.ElideRight
            text: allRow.modelData.name
            color: Color.popups.text
            font.family: Style.font.family
            font.pixelSize: Style.font.body
          }

          MouseArea {
            id: allMouse
            anchors.fill: parent
            hoverEnabled: true
            acceptedButtons: Qt.LeftButton | Qt.RightButton
            cursorShape: Qt.PointingHandCursor
            onClicked: function (mouse) {
              if (mouse.button === Qt.RightButton) startMenu.openAppMenu(allRow.modelData, allMouse, mouse)
              else startMenu.send({ type: "launch", app: allRow.modelData })
            }
          }
        }
      }

      // The A-Z jump grid: letters that have apps are lit, the rest dim.
      Rectangle {
        id: lettersOverlay
        visible: startMenu.showLetters && startMenu.showAll && !startMenu.searching
        anchors.fill: parent
        z: 5
        color: Color.popups.background

        MouseArea { anchors.fill: parent; onClicked: startMenu.send({ type: "letters", open: false }) }

        Text {
          anchors.top: parent.top
          anchors.topMargin: Style.spacing.md
          anchors.horizontalCenter: parent.horizontalCenter
          text: "Jump to"
          color: Util.alpha(Color.popups.text, 0.6)
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }

        Grid {
          anchors.centerIn: parent
          columns: 6
          spacing: Style.spacing.md

          Repeater {
            model: ["#", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
                    "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"]

            delegate: Rectangle {
              id: letterCell
              required property string modelData
              readonly property bool present: startMenu.catalog.letterRows[letterCell.modelData] !== undefined
              width: Style.space(52)
              height: width
              radius: Style.cornerRadius
              color: letterCell.present && letterMouse.containsMouse
                ? Style.hoverFillFor(Color.foreground, Color.accent)
                : (letterCell.present ? Util.alpha(Color.popups.text, 0.08) : "transparent")

              Text {
                anchors.centerIn: parent
                text: letterCell.modelData
                color: letterCell.present ? Color.accent : Util.alpha(Color.popups.text, 0.25)
                font.family: Style.font.family
                font.pixelSize: Style.font.body + 2
                font.bold: letterCell.present
              }

              MouseArea {
                id: letterMouse
                anchors.fill: parent
                hoverEnabled: true
                enabled: letterCell.present
                cursorShape: Qt.PointingHandCursor
                onClicked: startMenu.send({ type: "jumpTo", letter: letterCell.modelData })
              }
            }
          }
        }
      }

      // Home: Pinned grid and Recommended list.
      Item {
        id: home
        visible: !startMenu.searching && !startMenu.showAll
        anchors.fill: parent

        Text {
          id: pinnedTitle
          anchors.top: parent.top
          anchors.left: parent.left
          anchors.leftMargin: Style.spacing.sm
          text: "Pinned"
          color: Color.popups.text
          font.family: Style.font.family
          font.pixelSize: Style.font.body
          font.bold: true
        }

        Rectangle {
          id: allAppsButton
          anchors.verticalCenter: pinnedTitle.verticalCenter
          anchors.right: parent.right
          width: allAppsLabel.implicitWidth + Style.spacing.md * 2
          height: Style.space(26)
          radius: Style.cornerRadius
          color: allAppsMouse.containsMouse ? Style.hoverFillFor(Color.foreground, Color.accent) : "transparent"

          Text {
            id: allAppsLabel
            anchors.centerIn: parent
            text: "All apps  ›"
            color: Color.popups.text
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
          }

          MouseArea {
            id: allAppsMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: startMenu.send({ type: "showView", view: "all" })
          }
        }

        GridView {
          id: pinnedGrid
          anchors.top: pinnedTitle.bottom
          anchors.topMargin: Style.spacing.sm
          anchors.bottom: recommendedTitle.top
          anchors.bottomMargin: Style.spacing.sm
          anchors.left: parent.left
          anchors.right: parent.right
          clip: true
          cellWidth: Math.floor(width / StartMenu.PINNED_COLUMNS)
          cellHeight: Style.space(88)
          model: startMenu.pinnedApps
          boundsBehavior: Flickable.StopAtBounds

          delegate: Item {
            id: pinnedTile
            required property var modelData
            required property int index
            width: pinnedGrid.cellWidth
            height: pinnedGrid.cellHeight
            opacity: startMenu.dragPinId === pinnedTile.modelData.id ? 0.25 : 1

            Rectangle {
              anchors.fill: parent
              anchors.margins: 2
              radius: Style.cornerRadius
              color: (pinnedMouse.containsMouse || (startMenu.navSection === "pinned" && startMenu.navIndex === pinnedTile.index))
                ? Style.hoverFillFor(Color.foreground, Color.accent) : "transparent"
            }

            Image {
              id: pinnedIcon
              anchors.top: parent.top
              anchors.topMargin: Style.spacing.md
              anchors.horizontalCenter: parent.horizontalCenter
              width: Style.space(36)
              height: width
              fillMode: Image.PreserveAspectFit
              asynchronous: true
              sourceSize.width: width * Screen.devicePixelRatio
              sourceSize.height: height * Screen.devicePixelRatio
              source: pinnedTile.modelData.icon ? Quickshell.iconPath(pinnedTile.modelData.icon, true) : ""
            }

            Text {
              anchors.top: pinnedIcon.bottom
              anchors.topMargin: Style.spacing.xs
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.leftMargin: 4
              anchors.rightMargin: 4
              horizontalAlignment: Text.AlignHCenter
              elide: Text.ElideRight
              text: pinnedTile.modelData.name
              color: Color.popups.text
              font.family: Style.font.family
              font.pixelSize: Style.font.caption
            }

            MouseArea {
              id: pinnedMouse
              anchors.fill: parent
              hoverEnabled: true
              acceptedButtons: Qt.LeftButton | Qt.RightButton
              cursorShape: Qt.PointingHandCursor
              // Left-drag a pin to reorder it: the ghost (a sibling of
              // the grid) follows the pointer, the slot under it is
              // outlined, and releasing writes the new order.
              preventStealing: true
              drag.target: pinGhost
              drag.threshold: 8
              // A drag still ends in a click event; this stops the drop
              // from also launching the app.
              property bool wasDragged: false

              onPressed: function (mouse) {
                pinnedMouse.wasDragged = false
                if (mouse.button !== Qt.LeftButton) {
                  pinnedMouse.drag.target = null
                  return
                }
                pinnedMouse.drag.target = pinGhost
                var origin = pinnedTile.mapToItem(home, 0, 0)
                pinGhost.x = origin.x
                pinGhost.y = origin.y
                pinGhost.width = pinnedTile.width
                pinGhost.height = pinnedTile.height
                pinGhost.app = pinnedTile.modelData
              }

              drag.onActiveChanged: {
                if (pinnedMouse.drag.active) {
                  pinnedMouse.wasDragged = true
                  startMenu.send({ type: "pinDragStart", id: pinnedTile.modelData.id })
                  pinGhost.visible = true
                  startMenu.pinDragMoved()
                } else if (startMenu.dragPinId === pinnedTile.modelData.id) {
                  pinGhost.visible = false
                  startMenu.send({ type: "pinDragEnd" })
                }
              }

              onClicked: function (mouse) {
                if (pinnedMouse.wasDragged) return
                if (mouse.button === Qt.RightButton) startMenu.openAppMenu(pinnedTile.modelData, pinnedMouse, mouse)
                else startMenu.send({ type: "launch", app: pinnedTile.modelData })
              }
            }
          }

          Text {
            visible: startMenu.pinnedApps.length === 0
            anchors.centerIn: parent
            text: "Right-click an app in All apps to pin it here"
            color: Util.alpha(Color.popups.text, 0.5)
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
          }
        }

        // The icon that follows the pointer while a pin is dragged, and
        // an outline on the slot it would land in.
        Item {
          id: pinGhost
          property var app: null
          visible: false
          z: 100
          opacity: 0.85
          onXChanged: startMenu.pinDragMoved()
          onYChanged: startMenu.pinDragMoved()

          Image {
            anchors.top: parent.top
            anchors.topMargin: Style.spacing.md
            anchors.horizontalCenter: parent.horizontalCenter
            width: Style.space(36)
            height: width
            fillMode: Image.PreserveAspectFit
            asynchronous: true
            sourceSize.width: width * Screen.devicePixelRatio
            sourceSize.height: height * Screen.devicePixelRatio
            source: pinGhost.app && pinGhost.app.icon ? Quickshell.iconPath(pinGhost.app.icon, true) : ""
          }
        }

        Rectangle {
          id: pinDropMark
          visible: startMenu.dragPinId !== "" && startMenu.dragPinSlot >= 0
          z: 99
          width: pinnedGrid.cellWidth - 4
          height: pinnedGrid.cellHeight - 4
          radius: Style.cornerRadius
          color: "transparent"
          border.width: 2
          border.color: Color.accent
          x: pinnedGrid.x + (startMenu.dragPinSlot % StartMenu.PINNED_COLUMNS) * pinnedGrid.cellWidth + 2
          y: pinnedGrid.y + Math.floor(startMenu.dragPinSlot / StartMenu.PINNED_COLUMNS) * pinnedGrid.cellHeight - pinnedGrid.contentY + 2
        }

        Text {
          id: recommendedTitle
          anchors.bottom: recommendedGrid.top
          anchors.bottomMargin: Style.spacing.sm
          anchors.left: parent.left
          anchors.leftMargin: Style.spacing.sm
          text: "Recommended"
          color: Color.popups.text
          font.family: Style.font.family
          font.pixelSize: Style.font.body
          font.bold: true
        }

        GridView {
          id: recommendedGrid
          anchors.bottom: parent.bottom
          anchors.left: parent.left
          anchors.right: parent.right
          height: Style.space(48) * 3
          clip: true
          cellWidth: Math.floor(width / StartMenu.RECENT_COLUMNS)
          cellHeight: Style.space(48)
          model: startMenu.recentApps
          interactive: false

          delegate: Item {
            id: recentTile
            required property var modelData
            required property int index
            width: recommendedGrid.cellWidth
            height: recommendedGrid.cellHeight

            Rectangle {
              anchors.fill: parent
              anchors.margins: 2
              radius: Style.cornerRadius
              color: (recentMouse.containsMouse || (startMenu.navSection === "recent" && startMenu.navIndex === recentTile.index))
                ? Style.hoverFillFor(Color.foreground, Color.accent) : "transparent"
            }

            Image {
              id: recentIcon
              anchors.left: parent.left
              anchors.leftMargin: Style.spacing.md
              anchors.verticalCenter: parent.verticalCenter
              width: Style.space(28)
              height: width
              fillMode: Image.PreserveAspectFit
              asynchronous: true
              sourceSize.width: width * Screen.devicePixelRatio
              sourceSize.height: height * Screen.devicePixelRatio
              source: recentTile.modelData.icon ? Quickshell.iconPath(recentTile.modelData.icon, true) : ""
            }

            Text {
              anchors.left: recentIcon.right
              anchors.leftMargin: Style.spacing.md
              anchors.right: parent.right
              anchors.rightMargin: Style.spacing.sm
              anchors.verticalCenter: parent.verticalCenter
              elide: Text.ElideRight
              text: recentTile.modelData.name
              color: Color.popups.text
              font.family: Style.font.family
              font.pixelSize: Style.font.body
            }

            MouseArea {
              id: recentMouse
              anchors.fill: parent
              hoverEnabled: true
              acceptedButtons: Qt.LeftButton | Qt.RightButton
              cursorShape: Qt.PointingHandCursor
              onClicked: function (mouse) {
                if (mouse.button === Qt.RightButton) startMenu.openAppMenu(recentTile.modelData, recentMouse, mouse)
                else startMenu.send({ type: "launch", app: recentTile.modelData })
              }
            }
          }

          Text {
            visible: startMenu.recentApps.length === 0
            anchors.left: parent.left
            anchors.leftMargin: Style.spacing.sm
            anchors.top: parent.top
            text: "Apps you open from here show up here"
            color: Util.alpha(Color.popups.text, 0.5)
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
          }
        }
      }
    }

    // Account and power row.
    Rectangle {
      id: footer
      anchors.bottom: parent.bottom
      anchors.left: parent.left
      anchors.right: parent.right
      height: Style.space(56)
      radius: Style.cornerRadius
      color: Util.alpha(Color.popups.text, 0.05)

      // Clicking the account (avatar or name) opens Lock / Sign out.
      Rectangle {
        id: userButton
        anchors.left: parent.left
        anchors.leftMargin: Style.spacing.xs
        anchors.verticalCenter: parent.verticalCenter
        width: userNameText.x + userNameText.width + Style.spacing.md
        height: Style.space(44)
        radius: Style.cornerRadius
        color: userMouse.containsMouse || startMenu.overlayKind === "user" ? Style.hoverFillFor(Color.foreground, Color.accent) : "transparent"

        MouseArea {
          id: userMouse
          anchors.fill: parent
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onClicked: startMenu.send({ type: "toggleOverlay", kind: "user" })
        }
      }

      Rectangle {
        id: avatar
        anchors.left: parent.left
        anchors.leftMargin: Style.spacing.md
        anchors.verticalCenter: parent.verticalCenter
        width: Style.space(32)
        height: width
        radius: width / 2
        color: Color.accent

        Text {
          anchors.centerIn: parent
          text: startMenu.accountName.charAt(0).toUpperCase()
          color: Color.background
          font.family: Style.font.family
          font.pixelSize: Style.font.body
          font.bold: true
        }

        // Your picture, ~/.face, cropped to a circle; the initial above
        // shows when there isn't one.
        Item {
          anchors.fill: parent
          visible: faceImage.status === Image.Ready
          layer.enabled: true
          layer.effect: MultiEffect {
            maskEnabled: true
            maskSource: avatarMask
            maskThresholdMin: 0.5
            maskSpreadAtMin: 1.0
          }

          Image {
            id: faceImage
            anchors.fill: parent
            source: startMenu.hasFace ? "file://" + Quickshell.env("HOME") + "/.face" : ""
            fillMode: Image.PreserveAspectCrop
            asynchronous: true
            cache: false
            sourceSize.width: width * Screen.devicePixelRatio
            sourceSize.height: height * Screen.devicePixelRatio
          }
        }

        Item {
          id: avatarMask
          anchors.fill: parent
          visible: false
          layer.enabled: true
          Rectangle { anchors.fill: parent; radius: width / 2 }
        }
      }

      Text {
        id: userNameText
        anchors.left: avatar.right
        anchors.leftMargin: Style.spacing.md
        anchors.verticalCenter: parent.verticalCenter
        text: startMenu.accountName
        color: Color.popups.text
        font.family: Style.font.family
        font.pixelSize: Style.font.body
      }

      Rectangle {
        id: powerButton
        anchors.right: parent.right
        anchors.rightMargin: Style.spacing.md
        anchors.verticalCenter: parent.verticalCenter
        width: Style.space(36)
        height: width
        radius: Style.cornerRadius
        color: powerMouse.containsMouse || startMenu.overlayKind === "power" ? Style.hoverFillFor(Color.foreground, Color.accent) : "transparent"

        Text {
          anchors.centerIn: parent
          text: "⏻"
          color: Color.popups.text
          font.pixelSize: Style.font.body + 4
        }

        MouseArea {
          id: powerMouse
          anchors.fill: parent
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onClicked: startMenu.send({ type: "toggleOverlay", kind: "power" })
        }
      }
    }

    // Click anywhere else closes an open overlay menu.
    MouseArea {
      anchors.fill: parent
      z: 20
      visible: startMenu.overlayKind !== ""
      acceptedButtons: Qt.LeftButton | Qt.RightButton
      onClicked: startMenu.send({ type: "closeOverlay" })
    }

    // Right-click menu on an app, and the power menu.
    Rectangle {
      id: overlayMenu
      z: 30
      visible: startMenu.overlayKind !== ""
      width: Style.space(190)
      height: overlayColumn.implicitHeight + Style.spacing.xxs * 2
      radius: Style.cornerRadius
      color: Color.popups.background
      border.width: Style.normalBorderWidth
      border.color: Color.popups.border
      readonly property bool system: startMenu.overlayKind === "power" || startMenu.overlayKind === "user"
      x: startMenu.overlayKind === "power" ? card.width - width - Style.spacing.md
        : (startMenu.overlayKind === "user" ? Style.spacing.md : (startMenu.overlay ? startMenu.overlay.x : 0))
      y: overlayMenu.system ? footer.y - height - Style.spacing.xs : (startMenu.overlay ? startMenu.overlay.y : 0)

      Column {
        id: overlayColumn
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.margins: Style.spacing.xxs

        Repeater {
          model: StartMenu.overlayRows(startMenu.overlay, startMenu.context)

          delegate: Rectangle {
            id: overlayRow
            required property var modelData
            width: overlayColumn.width
            height: Style.spacing.popupRowHeight
            radius: Style.cornerRadius
            color: overlayMouse.containsMouse ? Style.hoverFillFor(Color.foreground, Color.accent) : "transparent"

            Text {
              anchors.left: parent.left
              anchors.leftMargin: Style.spacing.controlPaddingX
              anchors.verticalCenter: parent.verticalCenter
              text: overlayRow.modelData.label
              color: Color.popups.text
              font.family: Style.font.family
              font.pixelSize: Style.font.body
            }

            MouseArea {
              id: overlayMouse
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              // The row is data; `send` runs inside startMenu, so it
              // finishes even though closing the overlay changes this
              // Repeater's model and destroys this delegate.
              onClicked: startMenu.send({ type: "choose", row: overlayRow.modelData })
            }
          }
        }
      }
    }
  }
}
