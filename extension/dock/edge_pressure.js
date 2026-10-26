// SPDX-License-Identifier: GPL-3.0-or-later
// Wayland Meta.Barrier + PressureBarrier edge reveal and named auto-hide dwell timer for Reef.

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import { PressureBarrier } from 'resource:///org/gnome/shell/ui/layout.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { EDGE_GEOMETRY, is_shared_monitor_edge } from '../ui/dock_style.js';

export { is_shared_monitor_edge };

const PRESSURE_TIMEOUT_MS = 1000;
const AUTOHIDE_DELAY_MS = 220;
const EDGE_STRIP_THICKNESS = 2;

const BARRIER_DIRS = Object.freeze({
    TOP: Meta.BarrierDirection.POSITIVE_Y,
    BOTTOM: Meta.BarrierDirection.NEGATIVE_Y,
    LEFT: Meta.BarrierDirection.POSITIVE_X,
    RIGHT: Meta.BarrierDirection.NEGATIVE_X,
});

const BARRIER_COORDS = Object.freeze({
    TOP: (x1, y1, x2, _y2, ins) => ({ x1: x1 + ins, y1, x2: x2 - ins, y2: y1 }),
    BOTTOM: (x1, _y1, x2, y2, ins) => ({ x1: x1 + ins, y1: y2, x2: x2 - ins, y2 }),
    LEFT: (x1, y1, _x2, y2, ins) => ({ x1, y1: y1 + ins, x2: x1, y2: y2 - ins }),
    RIGHT: (_x1, y1, x2, y2, ins) => ({ x1: x2, y1: y1 + ins, x2, y2: y2 - ins }),
});

export function compute_barrier_coords(monitor, position) {
    const x1 = monitor.x, y1 = monitor.y, x2 = monitor.x + monitor.width, y2 = monitor.y + monitor.height;
    const fn = BARRIER_COORDS[position] ?? BARRIER_COORDS.BOTTOM;
    return {
        ...fn(x1, y1, x2, y2, 16),
        direction: BARRIER_DIRS[position] ?? BARRIER_DIRS.BOTTOM,
    };
}

export class EdgePressureController {
    constructor(dock_container, settings) {
        this.dock = dock_container;
        this.settings = settings;
        this._pressure_barrier = null;
        this._barrier = null;
        this._barrier_sig = 0;
        this._edge_strip = null;
        this._strip_sig = 0;
        this._hide_timeout_id = 0;

        this.rebuild();
    }

    rebuild() {
        this._destroy_barrier();
        this._destroy_edge_strip();

        if (this.settings.dock_fixed()) return;

        const mon = this.dock.monitor;
        if (!mon) return;
        const pos = this.settings.dock_position();
        const monitors = Main.layoutManager?.monitors ?? [];

        if (this.settings.require_pressure_to_show() && !is_shared_monitor_edge(mon, monitors, pos)) {
            try {
                const threshold = this.settings.pressure_threshold();
                this._pressure_barrier = new PressureBarrier(
                    threshold,
                    PRESSURE_TIMEOUT_MS,
                    Shell.ActionMode.NORMAL,
                );
                this._barrier_sig = this._pressure_barrier.connect('trigger', () => {
                    this._on_edge_triggered();
                });
                const coords = compute_barrier_coords(mon, pos);
                this._barrier = new Meta.Barrier({
                    backend: global.backend,
                    x1: coords.x1,
                    y1: coords.y1,
                    x2: coords.x2,
                    y2: coords.y2,
                    directions: coords.direction,
                });
                this._pressure_barrier.addBarrier(this._barrier);
            } catch (_e) {
                this._destroy_barrier();
            }
        }

        this._build_edge_strip(mon, pos);
    }

    _build_edge_strip(mon, pos) {
        this._edge_strip = new St.Widget({
            name: 'reef-edge-strip',
            reactive: true,
            track_hover: true,
            opacity: 0,
        });
        const edge = EDGE_GEOMETRY[pos] ?? EDGE_GEOMETRY.BOTTOM;
        const rect = edge.strip(mon, EDGE_STRIP_THICKNESS);
        this._edge_strip.set_position(rect.x, rect.y);
        this._edge_strip.set_size(rect.width, rect.height);
        Main.layoutManager.addChrome(this._edge_strip, {
            affectsStruts: false,
            trackFullscreen: false,
        });
        this._strip_sig = this._edge_strip.connect('notify::hover', () => {
            if (this._edge_strip.hover) this._on_edge_triggered();
            else this.schedule_hide_check();
        });
    }

    _on_edge_triggered() {
        if (this.dock.monitor?.inFullscreen && !this.settings.autohide_in_fullscreen()) {
            return;
        }
        this.cancel_hide_timer();
        this.dock.reveal_from_edge();
        if (!this.dock.actor?.hover && !this.dock.dash?.hover) {
            this.schedule_hide_check(2000);
        }
    }

    schedule_hide_check(delay_ms = AUTOHIDE_DELAY_MS) {
        this.cancel_hide_timer();
        if (this.settings.dock_fixed() || this.dock.actor?.hover || this.dock.dash?.hover) return;
        this._hide_timeout_id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay_ms, () => {
            this._hide_timeout_id = 0;
            if (!this.dock.is_pointer_inside() && !this.dock.is_menu_open()) {
                this.dock.EndEdgeReveal();
            }
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(this._hide_timeout_id, '[reef] autohide-delay');
    }

    cancel_hide_timer() {
        if (this._hide_timeout_id > 0) {
            GLib.source_remove(this._hide_timeout_id);
            this._hide_timeout_id = 0;
        }
    }

    _destroy_barrier() {
        if (this._pressure_barrier && this._barrier) {
            try { this._pressure_barrier.removeBarrier(this._barrier); } catch (_e) { /* ignore */ }
        }
        if (this._barrier) {
            try { this._barrier.destroy(); } catch (_e) { /* ignore */ }
            this._barrier = null;
        }
        if (this._pressure_barrier) {
            if (this._barrier_sig > 0) {
                try { this._pressure_barrier.disconnect(this._barrier_sig); } catch (_e) { /* ignore */ }
                this._barrier_sig = 0;
            }
            try { this._pressure_barrier.destroy(); } catch (_e) { /* ignore */ }
            this._pressure_barrier = null;
        }
    }

    _destroy_edge_strip() {
        if (!this._edge_strip) return;
        if (this._strip_sig > 0) {
            this._edge_strip.disconnect(this._strip_sig);
            this._strip_sig = 0;
        }
        try { Main.layoutManager.removeChrome(this._edge_strip); } catch (_e) { /* ignore */ }
        this._edge_strip.destroy();
        this._edge_strip = null;
    }

    destroy() {
        this.cancel_hide_timer();
        this._destroy_barrier();
        this._destroy_edge_strip();
    }
}
