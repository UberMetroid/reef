// SPDX-License-Identifier: GPL-3.0-or-later
// Multi-monitor Reef dock coordinator, Overview Dash controller, and Ubuntu Dock coexistence.

import Gio from 'gi://Gio';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { ExtensionSettings } from '../ui/settings/gsettings.js';
import { DockContainer } from './dock_container.js';

const CONFLICTING_DOCK_UUIDS = Object.freeze([
    'ubuntu-dock@ubuntu.com',
    'dash-to-dock@micxgx.gmail.com',
]);

export class DockManager {
    constructor(extension) {
        this.extension = extension;
        this.ext_settings = extension.getSettings();
        this.settings = new ExtensionSettings(this.ext_settings);
        this.docks = [];
        this._signals = [];
        this._layout_signals = [];
        this._ext_mgr_sig = 0;
        this._overview_dash_hidden = false;
        this._current_style = null;

        this.load_theme();
        this._hide_overview_dash();
        this._bind_settings();
        this._bind_monitors();
        this.rebuild_docks();
    }

    load_theme() {
        this.unload_theme();
        try {
            const file = Gio.File.new_for_path(`${this.extension.path}/ui/stylesheet.css`);
            const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
            if (theme) {
                theme.load_stylesheet(file);
                this._current_style = file;
            }
        } catch (err) {
            console.error(err);
        }
    }

    unload_theme() {
        if (!this._current_style) return;
        try {
            const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
            if (theme) theme.unload_stylesheet(this._current_style);
        } catch (_e) { /* ignore */ }
        this._current_style = null;
    }

    has_conflicting_dock_active() {
        const mgr = Main.extensionManager;
        if (!mgr || typeof mgr.lookup !== 'function') return false;
        for (const uuid of CONFLICTING_DOCK_UUIDS) {
            const info = mgr.lookup(uuid);
            if (info && info.state === 1) return true;
        }
        return false;
    }

    _hide_overview_dash() {
        const overview_dash = Main.overview?.dash;
        if (!overview_dash) return;
        if (overview_dash.visible) {
            overview_dash.hide();
            this._overview_dash_hidden = true;
        }
    }

    _restore_overview_dash() {
        const overview_dash = Main.overview?.dash;
        if (!overview_dash) return;
        if (this._overview_dash_hidden && !this.has_conflicting_dock_active()) {
            overview_dash.show();
        }
        this._overview_dash_hidden = false;
    }

    _bind_monitors() {
        this._layout_signals.push(
            Main.layoutManager.connect('monitors-changed', () => this.rebuild_docks()),
        );
        const mgr = Main.extensionManager;
        if (mgr && typeof mgr.connect === 'function') {
            this._ext_mgr_sig = mgr.connect('extension-state-changed', (_mgr, ext) => {
                if (ext && CONFLICTING_DOCK_UUIDS.includes(ext.uuid)) {
                    this.rebuild_docks();
                }
            });
        }
    }

    _bind_settings() {
        const rebuild_keys = ['multi-monitor'];
        for (const k of rebuild_keys) {
            if (this.ext_settings.settings_schema?.has_key(k)) {
                this._signals.push([
                    this.ext_settings,
                    this.ext_settings.connect(`changed::${k}`, () => this.rebuild_docks()),
                ]);
            }
        }

        const update_keys = [
            'dock-position', 'dock-fixed', 'intellihide', 'intellihide-mode',
            'require-pressure-to-show', 'pressure-threshold', 'autohide-in-fullscreen',
            'extend-height', 'dash-max-icon-size', 'show-apps-at-top',
            'show-show-apps-button', 'show-favorites', 'show-running',
            'isolate-workspaces', 'background-opacity', 'show-border',
            'border-width', 'border-radius', 'border-color-rgba',
        ];
        for (const k of update_keys) {
            if (this.ext_settings.settings_schema?.has_key(k)) {
                this._signals.push([
                    this.ext_settings,
                    this.ext_settings.connect(`changed::${k}`, () => this.refresh_all()),
                ]);
            }
        }

        if (this.settings.int) {
            this._signals.push([
                this.settings.int,
                this.settings.int.connect('changed', () => this.refresh_all()),
            ]);
        }
    }

    rebuild_docks() {
        this._destroy_docks();
        if (this.has_conflicting_dock_active()) {
            this._overview_dash_hidden = false;
            return;
        }
        this._hide_overview_dash();
        const monitors = Main.layoutManager.monitors || [];
        if (monitors.length === 0) return;

        if (this.settings.multi_monitor()) {
            for (let idx = 0; idx < monitors.length; idx += 1) {
                this.docks.push(new DockContainer(idx, this.settings, this.extension));
            }
        } else {
            const primary = Main.layoutManager.primaryIndex ?? 0;
            this.docks.push(new DockContainer(primary, this.settings, this.extension));
        }
    }

    refresh_all() {
        if (this.has_conflicting_dock_active()) return;
        this._hide_overview_dash();
        for (const dock of this.docks) {
            dock.apply_layout_and_style();
            dock.sync_visibility();
        }
    }

    _destroy_docks() {
        for (const dock of this.docks) {
            try { dock.destroy(); } catch (err) { console.error(err); }
        }
        this.docks.length = 0;
    }

    destroy() {
        if (this._ext_mgr_sig > 0 && Main.extensionManager) {
            try { Main.extensionManager.disconnect(this._ext_mgr_sig); } catch (_e) { /* ignore */ }
            this._ext_mgr_sig = 0;
        }
        for (const id of this._layout_signals) {
            try { Main.layoutManager.disconnect(id); } catch (_e) { /* ignore */ }
        }
        this._layout_signals.length = 0;
        for (const [obj, sig] of this._signals) {
            try { obj.disconnect(sig); } catch (_e) { /* ignore */ }
        }
        this._signals.length = 0;
        this._destroy_docks();
        this._restore_overview_dash();
        this.unload_theme();
        this.settings = null;
        this.ext_settings = null;
    }
}

