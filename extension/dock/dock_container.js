// SPDX-License-Identifier: GPL-3.0-or-later
// Screen-edge dock chrome actor, native Dash.Dash host, strut manager, and slide animator.

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Dash from 'resource:///org/gnome/shell/ui/dash.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as OverviewControls from 'resource:///org/gnome/shell/ui/overviewControls.js';
import { build_dock_background_css, build_separator_css, compute_dock_margins } from '../ui/dock_style.js';
import { AppActionsController, get_app_windows } from './app_actions.js';
import { EdgePressureController } from './edge_pressure.js';
import { IntellihideTracker } from './intellihide.js';

const SLIDE_DURATION_MS = 180;

export class DockContainer {
    constructor(monitor_index, settings, extension) {
        this.monitor_index = monitor_index;
        this.settings = settings;
        this.extension = extension;
        this._chrome_added = false;
        this._chrome_struts = false;
        this._edge_revealed = false;
        this._is_hidden = false;
        this._signals = [];
        this._overview_signals = [];

        this.actor = new St.BoxLayout({
            name: 'reef-dock',
            style_class: 'reef-dock-container reef-dock-pill',
            reactive: true,
            track_hover: true,
            clip_to_allocation: false,
            orientation: Clutter.Orientation.HORIZONTAL,
        });

        this.dash = new Dash.Dash();
        this._orig_redisplay = this.dash._redisplay.bind(this.dash);
        this.dash._redisplay = () => this._filtered_redisplay();
        this.actor.add_child(this.dash);

        this._bind_show_apps();
        this._bind_hover_and_allocation();
        this._bind_overview();
        this._sync_chrome();
        this.apply_layout_and_style();

        this.actions = new AppActionsController(this, this.settings, this.extension);
        this.pressure = new EdgePressureController(this, this.settings);
        this.intellihide = new IntellihideTracker(this, this.settings, () => this.sync_visibility());
    }

    get monitor() {
        const monitors = Main.layoutManager.monitors;
        return monitors[this.monitor_index] ?? Main.layoutManager.primaryMonitor ?? null;
    }

    _bind_show_apps() {
        const btn = this.dash.showAppsButton;
        if (!btn) return;
        this._signals.push([btn, btn.connect('notify::checked', () => {
            if (btn.checked) Main.overview.show(OverviewControls.ControlsState.APP_GRID);
            else if (Main.overview.visible) Main.overview.hide();
        })]);
    }

    _bind_hover_and_allocation() {
        this._signals.push(
            [this.actor, this.actor.connect('notify::hover', () => {
                if (this.actor.hover) this.pressure?.cancel_hide_timer();
                else this.pressure?.schedule_hide_check();
            })],
            [this.actor, this.actor.connect('notify::width', () => this._position_actor())],
            [this.actor, this.actor.connect('notify::height', () => this._position_actor())],
        );
    }

    _bind_overview() {
        this._overview_signals.push(
            Main.overview.connect('showing', () => this.sync_visibility()),
            Main.overview.connect('hidden', () => {
                if (this.dash.showAppsButton?.checked) this.dash.showAppsButton.checked = false;
                this.sync_visibility();
            }),
        );
    }

    _filtered_redisplay() {
        const app_sys = this.dash._appSystem, fav_obj = AppFavorites.getAppFavorites();
        const orig_get_fav = fav_obj.getFavoriteMap.bind(fav_obj);
        const orig_get_run = app_sys.get_running.bind(app_sys);

        if (!this.settings.show_favorites()) fav_obj.getFavoriteMap = () => ({});
        if (!this.settings.show_running()) app_sys.get_running = () => [];
        else if (this.settings.isolate_workspaces()) {
            app_sys.get_running = () => orig_get_run().filter((app) => get_app_windows(app, true).length > 0);
        }

        try {
            this._orig_redisplay();
        } finally {
            fav_obj.getFavoriteMap = orig_get_fav;
            app_sys.get_running = orig_get_run;
        }

        const icon_cap = this.settings.dash_max_icon_size();
        if (this.dash.iconSize > icon_cap) {
            this.dash.iconSize = icon_cap;
            for (const child of this.dash._box.get_children()) child?.child?._delegate?.icon?.setIconSize?.(icon_cap);
            this.dash._showAppsIcon?.icon?.setIconSize?.(icon_cap);
        }
        if (this.dash._separator) {
            this.dash._separator.style = build_separator_css(
                this.settings.is_vertical(), this.dash.iconSize, this.settings.is_dark(),
            );
        }
        this.actions?.sync_icons();
        this._position_actor();
    }

    _sync_chrome() {
        const want_struts = this.settings.dock_fixed();
        if (this._chrome_added && this._chrome_struts === want_struts) return;
        if (this._chrome_added) {
            try { Main.layoutManager.removeChrome(this.actor); } catch (_e) { /* ignore */ }
            this._chrome_added = false;
        }
        Main.layoutManager.addChrome(this.actor, { affectsStruts: want_struts, trackFullscreen: true });
        this._chrome_added = true;
        this._chrome_struts = want_struts;
    }

    apply_layout_and_style() {
        this._sync_chrome();
        const is_vert = this.settings.is_vertical(), extend = this.settings.extend_height();
        const orient = is_vert ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL;

        this.actor.style_class = [
            'reef-dock-container',
            extend ? 'reef-dock-panel' : 'reef-dock-pill',
            is_vert ? 'reef-dock-vertical' : 'reef-dock-horizontal',
        ].join(' ');
        this.actor.orientation = orient;

        if (this.dash._dashContainer) {
            this.dash._dashContainer.orientation = orient;
            this.dash._dashContainer.x_align = Clutter.ActorAlign.CENTER;
            this.dash._dashContainer.y_align = Clutter.ActorAlign.CENTER;
        }
        if (this.dash._box?.layout_manager) this.dash._box.layout_manager.orientation = orient;
        if (this.dash._showAppsIcon && this.dash._dashContainer) {
            this.dash._showAppsIcon.visible = this.settings.show_show_apps_button();
            this.dash._dashContainer.set_child_at_index(this.dash._showAppsIcon, this.settings.show_apps_at_top() ? 0 : 1);
        }
        if (this.dash._background) this.dash._background.style = build_dock_background_css(this.settings);

        const mon = this.monitor, scale = St.ThemeContext.get_for_stage(global.stage).scale_factor || 1;
        const cross_px = Math.round((this.settings.dash_max_icon_size() + 28) * scale);
        if (mon) {
            if (is_vert) this.dash.setMaxSize(cross_px, Math.round(mon.height * 0.92));
            else this.dash.setMaxSize(Math.round(mon.width * 0.92), cross_px);
        }
        this.dash._queueRedisplay();
        this._position_actor();
        this.pressure?.rebuild();
        this.intellihide?.update();
    }

    get_static_box() {
        const mon = this.monitor;
        if (!mon) return { x: 0, y: 0, width: 0, height: 0 };
        const pos = this.settings.dock_position(), extend = this.settings.extend_height();
        const margins = compute_dock_margins(pos, extend);
        const w = Math.max(64, this.actor.width || 320), h = Math.max(48, this.actor.height || 68);

        if (pos === 'TOP') {
            const bw = extend ? mon.width : w;
            return { x: extend ? mon.x : mon.x + Math.round((mon.width - bw) / 2), y: mon.y + margins.top, width: bw, height: h };
        }
        if (pos === 'LEFT') {
            const bh = extend ? mon.height : h;
            return { x: mon.x + margins.left, y: extend ? mon.y : mon.y + Math.round((mon.height - bh) / 2), width: w, height: bh };
        }
        if (pos === 'RIGHT') {
            const bh = extend ? mon.height : h;
            return { x: mon.x + mon.width - w - margins.right, y: extend ? mon.y : mon.y + Math.round((mon.height - bh) / 2), width: w, height: bh };
        }
        const bw = extend ? mon.width : w;
        return { x: extend ? mon.x : mon.x + Math.round((mon.width - bw) / 2), y: mon.y + mon.height - h - margins.bottom, width: bw, height: h };
    }

    _position_actor() {
        const box = this.get_static_box();
        this.actor.set_position(box.x, box.y);
    }

    is_pointer_inside() {
        if (this.actor.hover) return true;
        const [px, py] = global.get_pointer(), box = this.get_static_box();
        return px >= box.x && px <= box.x + box.width && py >= box.y && py <= box.y + box.height;
    }

    is_menu_open() { return Boolean(this.actions?.is_menu_open()); }
    reveal_from_edge() { this._edge_revealed = true; this._slide(true); }

    EndEdgeReveal() { this._edge_revealed = false; this.intellihide?.update(); this.sync_visibility(); }

    sync_visibility() {
        if (Main.overview.visible || this.settings.dock_fixed() || this._edge_revealed ||
            this.actor.hover || this.is_menu_open()) {
            this._slide(true);
            return;
        }
        this._slide(this.settings.intellihide() && !this.intellihide?.overlapping);
    }

    _slide(visible) {
        const pos = this.settings.dock_position(), box = this.get_static_box();
        let tx = 0, ty = 0;
        if (!visible) {
            const pad = 12;
            if (pos === 'TOP') ty = -(box.height + pad);
            else if (pos === 'LEFT') tx = -(box.width + pad);
            else if (pos === 'RIGHT') tx = box.width + pad;
            else ty = box.height + pad;
        }
        this._is_hidden = !visible;
        this.actor.reactive = visible;
        this.actor.remove_all_transitions();
        this.actor.ease({
            translation_x: tx, translation_y: ty, opacity: visible ? 255 : 0,
            duration: SLIDE_DURATION_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    destroy() {
        for (const id of this._overview_signals) { try { Main.overview.disconnect(id); } catch (_e) { /* ignore */ } }
        this._overview_signals.length = 0;
        for (const [obj, sig] of this._signals) { try { obj.disconnect(sig); } catch (_e) { /* ignore */ } }
        this._signals.length = 0;
        this.pressure?.destroy(); this.intellihide?.destroy(); this.actions?.destroy();
        this.pressure = null; this.intellihide = null; this.actions = null;
        if (this._chrome_added) {
            try { Main.layoutManager.removeChrome(this.actor); } catch (_e) { /* ignore */ }
            this._chrome_added = false;
        }
        this.actor?.destroy(); this.actor = null; this.dash = null;
    }
}
