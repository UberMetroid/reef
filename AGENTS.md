# AGENTS.md — Reef Architectural Invariants & Engineering Standards

## 1. Global Engineering Philosophy

Reef (`reef@studio2201.github.io`) is built on four uncompromising engineering pillars:

1. **Linus Torvalds' "Good Taste"**: Eliminate special-case branching through clean data representation (immutable frozen enums, pure rectangle overlap predicates, and unified horizontal/vertical dock axis transforms).
2. **UNIX Philosophy**: Each module ("page") does one thing well, composes cleanly via explicit imports, and avoids hidden global state.
3. **NASA JPL Power-of-10 Safety Rules**:
   - All window-list and actor scans (`intellihide.js`, `app_actions.js`) enforce an explicit upper iteration bound (`MAX_TRACKED_WINDOWS = 128`).
   - Zero dynamic code evaluation (`eval`, `Function`) and zero synchronous subprocess or blocking disk I/O in the compositor.
   - All `GLib.timeout_add` sources are deterministically named via `GLib.Source.set_name_by_id` and removed on teardown.
4. **OWASP Zero-Trust & Multi-Distro Security**:
   - Zero shell subprocesses (`GLib.spawn_*`, `Gio.Subprocess`) or `systemctl`/`pkexec` calls; integrates natively with `systemd-logind` lock/suspend via `"session-modes": ["user"]` and Mutter compositor signals across Fedora, Debian, Ubuntu, Arch, openSUSE, and NixOS.
   - All CSS color inputs (`extension/ui/settings/color.js`) are clamped and sanitized before style generation.

---

## 2. The Page Rule & Directory Density (Enforced by `tests/verify.js`)

- **File Line Bounds**: Every `.js` source file in the repository (`extension/`, `tests/`) **must** be between **16 and 256 lines** (`16..=256`), and every line **must** be at most **200 characters** (`<= 200`).
- **Directory Density**: Every directory in the repository (`root`, `tests/`, `extension/`, and all subdirectories) **must** contain **at most 8 visible entries** (`<= 8`).
- **Banned Generic Names**: Generic grab-bag names (`util`, `utils`, `lib`, `helper`, `helpers`, `common`, `misc`, `shared`, `base`, `core`, `types`, `mod`) are strictly forbidden.
- **2-Line SPDX + Concise Module Header**:
   - Line 1 of every `.js` file must be `// SPDX-License-Identifier: GPL-3.0-or-later`.
   - Line 2 of every `.js` file must be a concise single-line module description (`// <Concise module description>`).

---

## 3. Process-Boundary & GNOME Shell / EGO Lifecycle Invariants (`tests/verify.js`)

- **ES2022 Strictness**: Zero `var` declarations (`const`/`let` only) and zero loose equality operators (`===`/`!==` only).
- **Process Boundary Separation**: `extension/prefs.js` runs in the GTK4 `gnome-extensions-app` process. Neither `prefs.js` nor any module in its import chain (`dock/intellihide.js`, `ui/dock_style.js`, `ui/settings/gsettings.js`, `ui/settings/color.js`, `ui/settings/prefs_pages.js`) may import compositor-only typelibs (`gi://Meta`, `gi://Clutter`, `gi://St`, `gi://Shell`, `resource:///org/gnome/shell/*`).
- **Deterministic EGO Teardown**: `extension/extension.js` performs zero top-level work at import time and deterministically cleans up all `Meta.Barrier` / `PressureBarrier` instances, chrome actors, struts, named `GLib` timers, and signals while restoring `Main.overview.dash` on `disable()`.

---

## 4. Functional Page Map

### Verification & Test Suite (`tests/` — 1 page)
- [`tests/verify.js`](tests/verify.js): Zero-dependency GJS architectural lint, Page Rule (`16..=256` lines, `<= 8` entries/dir), process-boundary check, GTK4/Libadwaita Preferences inspection, and headless behavioral test suite (`gjs -m tests/verify.js`).

### GNOME Shell Extension (`extension/` — 11 JS pages across 2 domain trees)
- **Root Entrypoints**:
  - [`extension/extension.js`](extension/extension.js): `ReefExtension extends Extension` EGO lifecycle entrypoint.
  - [`extension/prefs.js`](extension/prefs.js): `ReefPreferences extends ExtensionPreferences` 4-tab GTK4 / Libadwaita preferences UI.
- **Dock Engine (`extension/dock/` — 5 pages)**:
  - [`dock_manager.js`](extension/dock/dock_manager.js): Multi-monitor dock lifecycle coordinator, overview dash restoration, and Ubuntu Dock / Dash to Dock safe coexistence.
  - [`dock_container.js`](extension/dock/dock_container.js): Screen-edge dock chrome actor (`St.BoxLayout` + native `Dash.Dash`), workspace strut management, and slide animations.
  - [`intellihide.js`](extension/dock/intellihide.js): Pure window-dodge overlap evaluator (`ALL_WINDOWS`, `FOCUSED_WINDOW`, `MAXIMIZED_ONLY`) and active-workspace geometry tracker.
  - [`edge_pressure.js`](extension/dock/edge_pressure.js): Wayland `Meta.Barrier` + `LayoutManager.PressureBarrier` edge reveal and named auto-hide dwell timer.
  - [`app_actions.js`](extension/dock/app_actions.js): Left-click focus/cycle/minimize, middle-click launch/minimize/quit, scroll-wheel window/workspace cycling, and quick context menu.
- **UI, Styling & Settings (`extension/ui/` — 4 JS pages + stylesheet)**:
  - [`dock_style.js`](extension/ui/dock_style.js), `stylesheet.css`
  - `settings/`: [`color.js`](extension/ui/settings/color.js), [`gsettings.js`](extension/ui/settings/gsettings.js), [`prefs_pages.js`](extension/ui/settings/prefs_pages.js)
