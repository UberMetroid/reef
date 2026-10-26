// SPDX-License-Identifier: GPL-3.0-or-later
// Pure window-dodge overlap evaluator and active-workspace geometry tracker for Reef.

import GLib from 'gi://GLib';

export const MAX_TRACKED_WINDOWS = 128;

export function is_candidate_window_type(wtype) {
    return wtype === 0 || wtype === 3 || wtype === 4;
}

export function boxes_overlap(a, b) {
    if (!a || !b) return false;
    if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    );
}

export function is_window_maximized_or_fullscreen(meta_win) {
    if (!meta_win) return false;
    if (typeof meta_win.is_fullscreen === 'function' && meta_win.is_fullscreen()) {
        return true;
    }
    if (Boolean(meta_win.fullscreen)) {
        return true;
    }
    if (typeof meta_win.is_maximized === 'function') {
        return Boolean(meta_win.is_maximized());
    }
    return Boolean(meta_win.maximized_horizontally || meta_win.maximized_vertically);
}

export function evaluate_intellihide_overlap(static_box, windows, mode = 'ALL_WINDOWS', focus_app_id = null) {
    if (!static_box || !Array.isArray(windows)) return false;
    const limit = Math.min(windows.length, MAX_TRACKED_WINDOWS);
    for (let i = 0; i < limit; i += 1) {
        const w = windows[i];
        if (!w || !w.visible || w.minimized || w.skip_taskbar) continue;
        if (mode === 'FOCUSED_WINDOW') {
            const matches_focus = Boolean(w.focused) || (focus_app_id !== null && w.app_id === focus_app_id);
            if (!matches_focus) continue;
        } else if (mode === 'MAXIMIZED_ONLY') {
            if (!w.maximized && !w.fullscreen) continue;
        }
        if (boxes_overlap(static_box, w.rect)) {
            return true;
        }
    }
    return false;
}

export class IntellihideTracker {
    constructor(dock_container, settings, on_change) {
        this.dock = dock_container;
        this.settings = settings;
        this.on_change = on_change;
        this._display_signals = [];
        this._wm_signals = [];
        this._window_signals = new Map();
        this._idle_id = 0;
        this.overlapping = false;

        this._bind_compositor();
        this.update();
    }

    _bind_compositor() {
        if (typeof global === 'undefined' || !global.display) return;
        const d = global.display;
        this._display_signals.push(
            d.connect('restacked', () => this.queue_update()),
            d.connect('notify::focus-window', () => this.update()),
            d.connect('window-created', (_disp, win) => {
                this._track_window(win);
                this.queue_update();
            }),
            d.connect('grab-op-end', () => this.update()),
        );
        const wm = global.workspace_manager;
        if (wm) {
            this._wm_signals.push(
                wm.connect('active-workspace-changed', () => {
                    this._sync_tracked_windows();
                    this.update();
                }),
            );
        }
        this._sync_tracked_windows();
    }

    queue_update() {
        if (this._idle_id > 0) return;
        this._idle_id = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._idle_id = 0;
            this.update();
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(this._idle_id, '[reef] intellihide-coalesce');
    }

    _cancel_queued_update() {
        if (this._idle_id > 0) {
            GLib.source_remove(this._idle_id);
            this._idle_id = 0;
        }
    }

    _track_window(meta_win) {
        if (!meta_win || this._window_signals.has(meta_win)) return;
        const wtype = meta_win.get_window_type?.() ?? 0;
        if (!is_candidate_window_type(wtype) || meta_win.is_skip_taskbar?.()) return;
        if (this._window_signals.size >= MAX_TRACKED_WINDOWS) return;
        const ids = [
            meta_win.connect('position-changed', () => this.queue_update()),
            meta_win.connect('size-changed', () => this.queue_update()),
            meta_win.connect('notify::minimized', () => this.update()),
            meta_win.connect('unmanaged', () => {
                this._untrack_window(meta_win);
                this.queue_update();
            }),
        ];
        this._window_signals.set(meta_win, ids);
    }

    _untrack_window(meta_win) {
        const ids = this._window_signals.get(meta_win);
        if (!ids) return;
        for (const id of ids) {
            try { meta_win.disconnect(id); } catch (_e) { /* ignore disposed window */ }
        }
        this._window_signals.delete(meta_win);
    }

    _sync_tracked_windows() {
        if (typeof global === 'undefined' || !global.get_window_actors) return;
        const actors = global.get_window_actors();
        const active = new Set();
        for (let i = 0; i < actors.length && active.size < MAX_TRACKED_WINDOWS; i += 1) {
            const meta_win = actors[i]?.get_meta_window?.();
            if (!meta_win) continue;
            const wtype = meta_win.get_window_type?.() ?? 0;
            if (!is_candidate_window_type(wtype) || meta_win.is_skip_taskbar?.()) continue;
            active.add(meta_win);
            this._track_window(meta_win);
        }
        for (const tracked of Array.from(this._window_signals.keys())) {
            if (!active.has(tracked)) this._untrack_window(tracked);
        }
    }

    collect_workspace_windows() {
        if (typeof global === 'undefined' || !global.get_window_actors) return [];
        const ws = global.workspace_manager?.get_active_workspace?.() ?? null;
        const focus_win = global.display?.get_focus_window?.() ?? null;
        const mon_idx = this.dock.monitor_index;
        const actors = global.get_window_actors();
        const list = [];

        for (let i = 0; i < actors.length && list.length < MAX_TRACKED_WINDOWS; i += 1) {
            const actor = actors[i];
            const meta = actor?.get_meta_window?.();
            if (!meta || !actor.visible) continue;
            const wtype = meta.get_window_type?.() ?? 0;
            if (!is_candidate_window_type(wtype) || meta.is_skip_taskbar?.()) continue;
            if (typeof meta.get_monitor === 'function' && meta.get_monitor() !== mon_idx) continue;
            const on_ws = Boolean(meta.is_on_all_workspaces?.()) || (!ws || meta.get_workspace?.() === ws);
            if (!on_ws) continue;
            const rect = meta.get_frame_rect ? meta.get_frame_rect() : { x: 0, y: 0, width: 0, height: 0 };
            list.push({
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                visible: Boolean(actor.visible),
                minimized: Boolean(meta.minimized),
                skip_taskbar: false,
                focused: meta === focus_win,
                app_id: meta.get_gtk_application_id?.() || meta.get_wm_class?.() || null,
                maximized: is_window_maximized_or_fullscreen(meta),
                fullscreen: Boolean(meta.is_fullscreen?.() || meta.fullscreen),
            });
        }
        return list;
    }

    update() {
        this._cancel_queued_update();
        if (this.settings.dock_fixed() || !this.settings.intellihide()) {
            this.overlapping = !this.settings.dock_fixed() && !this.settings.intellihide();
            this.on_change(this.overlapping);
            return;
        }
        const static_box = this.dock.get_static_box();
        const windows = this.collect_workspace_windows();
        let focus_app_id = null;
        for (let i = 0; i < windows.length; i += 1) {
            if (windows[i].focused) { focus_app_id = windows[i].app_id; break; }
        }
        this.overlapping = evaluate_intellihide_overlap(
            static_box,
            windows,
            this.settings.intellihide_mode(),
            focus_app_id,
        );
        this.on_change(this.overlapping);
    }

    destroy() {
        this._cancel_queued_update();
        if (typeof global !== 'undefined' && global.display) {
            for (const id of this._display_signals) global.display.disconnect(id);
        }
        this._display_signals.length = 0;
        if (typeof global !== 'undefined' && global.workspace_manager) {
            for (const id of this._wm_signals) global.workspace_manager.disconnect(id);
        }
        this._wm_signals.length = 0;
        for (const meta_win of Array.from(this._window_signals.keys())) {
            this._untrack_window(meta_win);
        }
    }
}
