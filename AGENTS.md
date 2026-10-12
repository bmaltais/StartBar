# StartBar

A Windows 11-style taskbar with a Start menu, as a plugin for the Omarchy shell (Quickshell/QML). The agreed behaviour is in `docs/SPEC.md`; the vocabulary is in `CONTEXT.md`.

## Checking changes

- Editing `Service.qml` or `StartMenuView.qml`: the shell does not reload on save. Run `npm run smoke` before saying the change works: it restarts the live shell with this checkout, fails on anything the plugin logs, and screenshots the Dock, Start menu and settings window in each colour scheme. Read the screenshots. It cannot hover or click: to try a Preview, the Item menu or the Bar menu, drive the real pointer with `scripts/pointer.sh` (needs `ydotool`; `docs/hyprland-notes.md` "Moving the pointer"), and say what you could not try. `CONTRIBUTING.md` has the rest of the loop.
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
