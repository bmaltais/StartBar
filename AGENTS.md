# StartBar

A Windows 11-style taskbar with a Start menu, as a plugin for the Omarchy shell (Quickshell/QML). The agreed behaviour is in `docs/SPEC.md`; the vocabulary is in `CONTEXT.md`.

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
- After changing `Service.qml` or `StartMenuView.qml`: `scripts/smoke.sh` restarts the shell with this checkout, fails on anything the plugin logs, and screenshots the Dock, Start menu and settings window in each colour scheme. Read the screenshots.

## Releasing

Merging to `main` ships to every user. Read `docs/agents/release.md` before a merge, tag, or publish, and when a `release/<version>` branch is in question.
