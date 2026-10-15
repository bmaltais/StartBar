# StartBar

A Windows 11-style taskbar with a Start menu, as a plugin for the Omarchy shell (Quickshell/QML). The agreed behaviour is in `docs/SPEC.md`; the vocabulary is in `CONTEXT.md`.

## Checking changes

- Editing `Service.qml` or `StartMenuView.qml`: the shell does not reload them on save. `Service.qml` is large; `CONTRIBUTING.md` "Where things are in `Service.qml`" maps it. Try the change in the test session, not on the user's desktop (`docs/testing.md`): `scripts/dev up`, then `run`, `startmenu`, `settings`, `move`, `click`, `rclick`, `type`, `set`, `shot FILE` (look at it), `layout`, `errors` (0 = clean); after an edit `scripts/dev reload` (it loads uncommitted files); finish with `scripts/dev down`. The session is a second Hyprland out of reach of the user's pointer and keyboard, with a home of its own and a guard that refuses the Start menu's power commands, so a click on Shut down there does nothing. `scripts/dev --help` lists the rest. Run `npm run smoke` before saying the change works: it starts the session, fails on anything the plugin logs, and screenshots the Dock, Start menu and settings window in each colour scheme. Read the screenshots. It cannot hover or drag: use `scripts/dev move` and `rclick` for a Preview, the Item menu (on a bottom Dock: on the top and left edges the session closes it at once) and the Bar menu, and say what you could not try. Do not use `scripts/pointer.sh`, `scripts/try-setting.sh` or restart the user's shell unless they ask to see it there; `scripts/reload` is how they see a change on their own shell, and the user wants the shell left running this checkout when you hand over, so run it at the end. `CONTRIBUTING.md` has the rest of the loop.
- **Waiting.** A command run in a herdr pane (the recorder, `scripts/screenshots.sh`) is waited for with `herdr pane wait-output` on a fresh marker; the harness blocks a `sleep` poll. Recordings (`scripts/hero.sh`, `scripts/clips.sh`, `scripts/tour.sh`) take minutes and use a lot of `/tmp`; do not delete anything in `/tmp` you did not make, the recorder removes its own frames.
- README animations and images: `docs/recording-tours.md`, and `CONTRIBUTING.md` "Retaking screenshots and animations".
- Calling Hyprland (`hyprctl dispatch`, `hl.dsp.*`): read `docs/hyprland-notes.md` first, and try new calls on a spare window, not the user's.

## Agent skills

### Issue tracker

Issues are GitHub Issues on bmaltais/StartBar, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

Candidates that are not issues yet live in `docs/IDEAS.md`.

### Triage labels

The five default triage labels, unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the root, ADRs under `docs/adr/`. See `docs/agents/domain.md`.

## Checks

- Before committing: `npm run check` (tests, manifest, new QML warnings). The pre-commit hook runs it once `git config core.hooksPath .githooks` is set.

## Releasing

Merging to `main` ships to every user. Read `docs/agents/release.md` before opening a PR (it targets the open `release/<version>`, which `scripts/open-release.sh` names, never `main`), merging, tagging or publishing, and when a `release/<version>` branch is in question.
