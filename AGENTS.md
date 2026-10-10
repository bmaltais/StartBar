# StartBar

A Windows 11-style taskbar with a Start menu, as a plugin for the Omarchy shell (Quickshell/QML). The agreed behaviour is in `docs/SPEC.md`; the vocabulary is in `CONTEXT.md`.

## Checking changes

- Editing `Service.qml` or `StartMenuView.qml`: the shell does not reload on save. Run `npm run smoke` (it restarts the live shell and fails on any StartBar QML error in the journal) before saying the change works. `CONTRIBUTING.md` has the rest of the loop.
- Calling Hyprland (`hyprctl dispatch`, `hl.dsp.*`): read `docs/hyprland-notes.md` first, and try new calls on a spare window, not the user's.

## Agent skills

### Issue tracker

Issues are GitHub Issues on bmaltais/StartBar, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage labels, unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the root, ADRs under `docs/adr/`. See `docs/agents/domain.md`.
