// SPDX-License-Identifier: GPL-3.0-or-later
// Wayland Meta.Barrier + PressureBarrier edge reveal and named auto-hide dwell timer for Reef.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import { PressureBarrier } from 'resource:///org/gnome/shell/ui/layout.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const PRESSURE_TIMEOUT_MS = 1000;
const AUTOHIDE_DELAY_MS = 220;
const EDGE_STRIP_THICKNESS = 2;

export function compute_barrier_coords(monitor, position) {
    const x1 = monitor.x;
    const y1 = monitor.y;
    const x2 = monitor.x + monitor.width;
    const y2 = monitor.y + monitor.height;
    const inset = 16;

    if (position === 'TOP') {
        return {
            x1: x1 + inset, y1, x2: x2 - inset, y2: y1,
            direction: Meta.BarrierDirection.POSITIVE_Y,
        };
    }
    if (position === 'LEFT') {
        return {
            x1, y1: y1 + inset, x2: x1, y2: y2 - inset,
            direction: Meta.BarrierDirection.POSITIVE_X,
        };
    }
    if (position === 'RIGHT') {
        return {
            x1: x2, y1: y1 + inset, x2, y2: y2 - inset,
            direction: Meta.BarrierDirection.NEGATIVE_X,
        };
    }
    return {
        x1: x1 + inset, y1: y2, x2: x2 - inset, y2,
        direction: Meta.BarrierDirection.NEGATIVE_Y,
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

        if (this.settings.require_pressure_to_show()) {
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
        if (pos === 'TOP') {
            this._edge_strip.set_position(mon.x, mon.y);
            this._edge_strip.set_size(mon.width, EDGE_STRIP_THICKNESS);
        } else if (pos === 'LEFT') {
            this._edge_strip.set_position(mon.x, mon.y);
            this._edge_strip.set_size(EDGE_STRIP_THICKNESS, mon.height);
        } else if (pos === 'RIGHT') {
            this._edge_strip.set_position(mon.x + mon.width - EDGE_STRIP_THICKNESS, mon.y);
            this._edge_strip.set_size(EDGE_STRIP_THICKNESS, mon.height);
        } else {
            this._edge_strip.set_position(mon.x, mon.y + mon.height - EDGE_STRIP_THICKNESS);
            this._edge_strip.set_size(mon.width, EDGE_STRIP_THICKNESS);
        }
        Main.layoutManager.addChrome(this._edge_strip, {
            affectsStruts: false,
            trackFullscreen: false,
        });
        this._strip_sig = this._edge_strip.connect('notify::hover', () => {
            if (this._edge_strip.hover) this._on_edge_triggered();
        });
    }

    _on_edge_triggered() {
        if (this.dock.monitor?.inFullscreen && !this.settings.autohide_in_fullscreen()) {
            return;
        }
        this.cancel_hide_timer();
        this.dock.reveal_from_edge();
        this.schedule_hide_check(2000);
    }

    schedule_hide_check(delay_ms = AUTOHIDE_DELAY_MS) {
        this.cancel_hide_timer();
        if (this.settings.dock_fixed()) return;
        this._hide_timeout_id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay_ms, () => {
            this._hide_timeout_id = 0;
            if (!this.dock.is_pointer_inside() && !this.dock.is_menu_open()) {
                this.dock.EndEdgeReveal();
            } else {
                this.schedule_hide_check(AUTOHIDE_DELAY_MS);
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
