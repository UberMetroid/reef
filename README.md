# Reef

[![CI & EGO Bundle Verification](https://github.com/UberMetroid/reef/actions/workflows/ci.yml/badge.svg)](https://github.com/UberMetroid/reef/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/UberMetroid/reef)](https://github.com/UberMetroid/reef/releases/latest)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](LICENSE)
[![Sponsor: Tuition, Not Coffee](https://img.shields.io/badge/Sponsor-Tuition%2C%20Not%20Coffee%20%F0%9F%8E%93-2ec27e)](https://ubermetroid.github.io/tuition-not-coffee)
[![Star on GitHub](https://img.shields.io/github/stars/UberMetroid/reef?style=social)](https://github.com/UberMetroid/reef)

**Reef** (`reef@ubermetroid.github.io`) is a fast, Wayland-native intelligent dock extension for **GNOME Shell 45–50**. It turns GNOME's Overview Dash into a responsive screen-edge dock with **Wayland pressure barriers**, **Kelp-friendly window-dodge intellihide**, **mouse-wheel window & workspace cycling**, **floating pill or full-edge panel styling**, and a **4-tab Libadwaita Settings & About dialog**.

Derived from [Dash to Dock](https://github.com/ubuntu/dash-to-dock) (`micheleg/dash-to-dock` / `ubuntu/dash-to-dock`) — stripped of ~85% of legacy Ubuntu Unity and GNOME 3 bloat, and engineered under the same strict [`AGENTS.md`](AGENTS.md) Page Rule and EGO standards as [**Kelp**](https://github.com/UberMetroid/kelp).

> 🎓 **Support Reef — [Tuition, Not Coffee — Help send my daughter to college](https://ubermetroid.github.io/tuition-not-coffee)** · 🌐 [**Project Website (`ubermetroid.github.io/reef`)**](https://ubermetroid.github.io/reef/) · ⭐ [**Star UberMetroid/reef on GitHub**](https://github.com/UberMetroid/reef)

---

## Designed to Pair with Kelp (and Standalone GNOME)

| Feature | Default | Why It Matters |
| :--- | :--- | :--- |
| **Kelp-Friendly Intellihide (`ALL_WINDOWS`)** | **Active** | Stays visible on an empty desktop and automatically slides away whenever *any* window on the active workspace overlaps the dock — so Reef never pops up over unfocused tiled columns in **Kelp Seahorse** (`1 → 1/2 → 1/3`) or **Octopus** (`2D Grid`) modes. |
| **Wayland Edge Pressure Reveal** | **`100 px`** | Push your pointer against the screen edge (`Bottom`, `Left`, `Right`, or `Top`) to smoothly slide the hidden dock into view over tiled or maximized windows. |
| **Unified Visual Language** | **`2 px` border · `6 px` margin** | Matches Kelp out of the box with a `2 px` Coral Red border (`rgb(255,0,0)`), `6 px` floating screen-edge gap, `16 px` pill radius, `80%` dark/light adaptive opacity, and the same 4 quick color presets (*Gruvbox Amber*, *Kelp Emerald*, *Ocean Cyan*, *Coral Red*). |
| **Scroll-Wheel Window Cycling** | **`cycle-windows`** | Scroll up or down over any running application icon in the dock to cycle through its open windows on the fly (or switch workspaces). |
| **Right-Click Quick Menu** | **Built-in** | Right-click the dock background or the **Show Apps** button to toggle **Intelligent Auto-Hide**, toggle **Panel Mode**, switch **Screen Edge (`Bottom` / `Left` / `Right` / `Top`)**, or open **Reef Settings & About…**. |

---

## Quick Install

Download `reef@ubermetroid.github.io.shell-extension.zip` from [**GitHub Releases (`v1.0.0`)**](https://github.com/UberMetroid/reef/releases/latest):

```bash
gnome-extensions install --force reef@ubermetroid.github.io.shell-extension.zip
gnome-extensions enable reef@ubermetroid.github.io
```

Open the 4-tab Libadwaita Preferences window anytime by right-clicking the dock and choosing **Reef Settings & About…**, or by running:

```bash
gnome-extensions prefs reef@ubermetroid.github.io
```

---

## 4-Tab Libadwaita Settings & About Window

| Tab | Controls Included |
| :--- | :--- |
| **1. Dock & Behavior** | Screen Edge (`Bottom`, `Left`, `Right`, `Top`), Fixed Dock vs. Intelligent Auto-Hide, Intellihide Dodge Mode (`All Windows — Kelp Friendly`, `Focused Application Windows Only`, `Maximized & Fullscreen Windows Only`), Edge Pressure toggle & threshold (`20–500 px`), Fullscreen Reveal toggle, Extend to Screen Edges (`Panel Mode`), Multi-Monitor toggle, and **Reset to Reef Defaults**. |
| **2. Icons & Appearance** | Max Icon Size (`24–64 px`), Show Apps Button visibility & start/end placement, Pinned Favorites toggle, Running Unpinned Apps toggle, Workspace Isolation toggle, Background Opacity (`0–100%`), Accent Border toggle, Border Width (`0–8 px`), Corner Radius (`0–32 px`), Custom RGBA Color Picker, and **Quick Color Presets** (*Gruvbox Amber*, *Kelp Emerald*, *Ocean Cyan*, *Coral Red*). |
| **3. Clicks & Scroll** | Left-Click Action (`Focus or Cycle Windows`, `Focus or Minimize`, `Launch New Window`), Middle-Click Action (`Launch New Window`, `Minimize`, `Quit Application`), Scroll Wheel Action (`Cycle Application Windows`, `Switch Active Workspace`, `Disabled`), and Quick Interaction Reference. |
| **4. About & Support** | Release version (`v1.0.0`), `GPL-3.0-or-later` license & Dash to Dock attribution, **Star Reef on GitHub**, **Tuition, Not Coffee — Help send my daughter to college**, **Project Website**, and **Report an Issue**. |

---

## Multi-Distro & `systemd` Integration

Reef works out of the box across **GNOME Shell 45, 46, 47, 48, 49, and 50** on **Fedora, Debian, Ubuntu, Arch Linux, openSUSE, and NixOS**:

- **`systemd-logind` Lock & Suspend Lifecycle**: Cleanly tears down all `Meta.Barrier` / `PressureBarrier` instances, workspace struts, chrome actors, and named `GLib` timers on screen lock (`unlock-dialog`) or suspend, and restores GNOME's native Overview Dash on disable.
- **Ubuntu Dock & Dash to Dock Safe Coexistence**: Automatically detects `ubuntu-dock@ubuntu.com` and `dash-to-dock@micxgx.gmail.com` via `Main.extensionManager` so Overview Dash visibility is never corrupted.
- **Universal Packaging Support (`.rpm`, `.deb`, `pacman`, Flatpak, Snap, AppImage)**: Uses `Shell.AppSystem.get_default()` and `Shell.WindowTracker` rather than hardcoded `/usr/share/applications` paths.
- **Zero Subprocesses or Telemetry**: Never spawns external processes (`GLib.spawn_*` / `Gio.Subprocess`) or makes network calls.

---

## Verification & Development

Reef enforces strict architectural invariants (`16..=256` lines per `.js` file, `<= 200` chars per line, `<= 8` visible entries per directory, zero banned filenames, and strict process-boundary separation between `prefs.js` and compositor modules) verified by `tests/verify.js`:

```bash
xmllint --noout extension/schemas/*.xml
glib-compile-schemas --strict --dry-run extension/schemas
gjs -m tests/verify.js
gnome-extensions pack extension --force --out-dir=dist \
  --schema=schemas/org.gnome.shell.extensions.reef.gschema.xml \
  --extra-source=dock --extra-source=ui
pipx run shexli dist/reef@ubermetroid.github.io.shell-extension.zip
```

---

## 🎓 Sponsor / Support — Tuition, Not Coffee

If Reef and Kelp improve your daily Linux workflow, please consider supporting development:

- 🎓 **Sponsor / Donate**: [**Tuition, Not Coffee — Help send my daughter to college**](https://ubermetroid.github.io/tuition-not-coffee)
- 🌐 **Project Website**: [**ubermetroid.github.io/reef**](https://ubermetroid.github.io/reef/)
- ⭐ **Star on GitHub**: [**github.com/UberMetroid/reef**](https://github.com/UberMetroid/reef)

---

## License & Attribution

Released under the [GNU General Public License v3.0 or later](LICENSE) (`GPL-3.0-or-later`).

Derived from [Dash to Dock](https://github.com/micheleg/dash-to-dock) / [Ubuntu Dock](https://github.com/ubuntu/dash-to-dock) (`GPL-2.0-or-later`), Copyright (C) Michele Gaio `<micxgx@gmail.com>`, Canonical Ltd. / Marco Trevisan, and Dash to Dock contributors. Redistributed under `GPL-3.0-or-later` pursuant to Section 9 of GPLv2.
