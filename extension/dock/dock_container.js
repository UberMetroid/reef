// SPDX-License-Identifier: GPL-3.0-or-later
// Screen-edge dock chrome actor, native Dash.Dash host, strut manager, and slide animator.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
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
        this.monitor_index = monitor_index; this.settings = settings; this.extension = extension;
        this._chrome_added = false; this._chrome_struts = false;
        this._edge_revealed = false; this._is_hidden = false;
        this._signals = []; this._overview_signals = [];

        this.actor = new St.BoxLayout({
            name: 'reef-dock', style_class: 'reef-dock-container reef-dock-pill',
            reactive: true, track_hover: true, clip_to_allocation: false,
            orientation: Clutter.Orientation.HORIZONTAL,
        });

        this.dash = new Dash.Dash();
        this._orig_redisplay = this.dash._redisplay.bind(this.dash);
        this.dash._redisplay = () => this._filtered_redisplay();
        this.actor.add_child(this.dash);

        this._bind_show_apps(); this._bind_hover_and_allocation();
        this._bind_overview(); this._sync_chrome(); this.apply_layout_and_style();

        this.actions = new AppActionsController(this, this.settings, this.extension);
        this.pressure = new EdgePressureController(this, this.settings);
        this.intellihide = new IntellihideTracker(this, this.settings, () => this.sync_visibility());
    }

    get monitor() { return Main.layoutManager.monitors[this.monitor_index] ?? Main.layoutManager.primaryMonitor ?? null; }

    _bind_show_apps() {
        const btn = this.dash.showAppsButton;
        if (!btn) return;
        this._signals.push([btn, btn.connect('notify::checked', () => {
            if (btn.checked) Main.overview.show(OverviewControls.ControlsState.APP_GRID);
            else if (Main.overview.visible) Main.overview.hide();
        })]);
    }

    _bind_hover_and_allocation() {
        const on_hover = () => {
            if (this.actor.hover || this.dash?.hover) this.pressure?.cancel_hide_timer();
            else this.pressure?.schedule_hide_check();
        };
        const on_enter = () => { this.pressure?.cancel_hide_timer(); return Clutter.EVENT_PROPAGATE; };
        const on_leave = () => { this.pressure?.schedule_hide_check(); return Clutter.EVENT_PROPAGATE; };
        this._signals.push(
            [this.actor, this.actor.connect('notify::hover', on_hover)],
            [this.dash, this.dash.connect('notify::hover', on_hover)],
            [this.actor, this.actor.connect('enter-event', on_enter)],
            [this.actor, this.actor.connect('leave-event', on_leave)],
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
        const orig_get_fav = fav_obj.getFavoriteMap.bind(fav_obj), orig_get_run = app_sys.get_running.bind(app_sys);
        if (!this.settings.show_favorites()) fav_obj.getFavoriteMap = () => ({});
        if (!this.settings.show_running()) app_sys.get_running = () => [];
        else if (this.settings.isolate_workspaces()) {
            app_sys.get_running = () => orig_get_run().filter((app) => get_app_windows(app, true).length > 0);
        }
        try { this._orig_redisplay(); } finally {
            fav_obj.getFavoriteMap = orig_get_fav; app_sys.get_running = orig_get_run;
        }

        const icon_cap = this.settings.dash_max_icon_size(), align = Clutter.ActorAlign.CENTER;
        const center_base_icon = (bi) => {
            if (!bi) return;
            bi.x_align = align; bi.y_align = align;
            if (bi._box) { bi._box.x_align = align; bi._box.y_align = align; }
            if (bi._iconBin) { bi._iconBin.x_align = align; bi._iconBin.y_align = align; }
        };
        for (const item of this.dash._box.get_children()) {
            if (!item) continue;
            item.x_align = align; item.y_align = align;
            if (item.child) { item.child.x_align = align; item.child.y_align = align; }
            const base_icon = item.child?._delegate?.icon;
            center_base_icon(base_icon);
            if (this.dash.iconSize > icon_cap) base_icon?.setIconSize?.(icon_cap);
        }
        center_base_icon(this.dash._showAppsIcon?.icon);
        if (this.dash.iconSize > icon_cap) {
            this.dash.iconSize = icon_cap;
            this.dash._showAppsIcon?.icon?.setIconSize?.(icon_cap);
        }
        if (this.dash._separator) {
            this.dash._separator.x_align = align; this.dash._separator.y_align = align;
            this.dash._separator.style = build_separator_css(
                this.settings.is_vertical(), this.dash.iconSize, this.settings.is_dark(),
            );
        }
        this.actions?.sync_icons(); this._position_actor();
    }

    _sync_chrome() {
        const want_struts = this.settings.dock_fixed();
        if (this._chrome_added && this._chrome_struts === want_struts) return;
        if (this._chrome_added) {
            try { Main.layoutManager.removeChrome(this.actor); } catch (_e) { /* ignore */ }
            this._chrome_added = false;
        }
        Main.layoutManager.addChrome(this.actor, { affectsStruts: want_struts, trackFullscreen: true });
        this._chrome_added = true; this._chrome_struts = want_struts;
    }

    apply_layout_and_style() {
        this._sync_chrome();
        const is_vert = this.settings.is_vertical(), extend = this.settings.extend_height();
        const orient = is_vert ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL;
        const align = Clutter.ActorAlign.CENTER;
        const cls = ['reef-dock-container', extend ? 'reef-dock-panel' : 'reef-dock-pill'];
        cls.push(is_vert ? 'reef-dock-vertical' : 'reef-dock-horizontal');
        this.actor.style_class = cls.join(' ');
        this.actor.orientation = orient;

        if (this.dash._dashContainer) {
            this.dash._dashContainer.orientation = orient;
            this.dash._dashContainer.x_align = align; this.dash._dashContainer.y_align = align;
        }
        if (this.dash._box) {
            this.dash._box.x_align = align; this.dash._box.y_align = align;
            if (this.dash._box.layout_manager) this.dash._box.layout_manager.orientation = orient;
        }
        if (this.dash._showAppsIcon && this.dash._dashContainer) {
            this.dash._showAppsIcon.x_align = align; this.dash._showAppsIcon.y_align = align;
            this.dash._showAppsIcon.visible = this.settings.show_show_apps_button();
            this.dash._dashContainer.set_child_at_index(this.dash._showAppsIcon, this.settings.show_apps_at_top() ? 0 : 1);
        }
        if (this.dash._background) {
            this.dash._background.x_align = align; this.dash._background.y_align = align;
            this.dash._background.style = build_dock_background_css(this.settings);
        }
        const sizer = this.dash._background?.get_first_child?.();
        if (sizer && this.dash._showAppsIcon?.icon && this.dash._dashContainer) {
            const c_icon = is_vert ? Clutter.BindCoordinate.WIDTH : Clutter.BindCoordinate.HEIGHT;
            const c_dash = is_vert ? Clutter.BindCoordinate.HEIGHT : Clutter.BindCoordinate.WIDTH;
            sizer.clear_constraints();
            sizer.add_constraint(new Clutter.BindConstraint({ source: this.dash._showAppsIcon.icon, coordinate: c_icon }));
            sizer.add_constraint(new Clutter.BindConstraint({ source: this.dash._dashContainer, coordinate: c_dash }));
        }

        const mon = this.monitor, scale = St.ThemeContext.get_for_stage(global.stage).scale_factor || 1;
        const cross_px = Math.round((this.settings.dash_max_icon_size() + 28) * scale);
        const span_px = mon ? Math.round((is_vert ? mon.height : mon.width) * 0.92) : 640;
        if (mon) this.dash.setMaxSize(span_px, cross_px);
        this.dash._queueRedisplay(); this._position_actor();
        this.pressure?.rebuild(); this.intellihide?.update();
    }

    get_static_box() {
        const mon = this.monitor;
        if (!mon) return { x: 0, y: 0, width: 0, height: 0 };
        const pos = this.settings.dock_position(), extend = this.settings.extend_height();
        const margins = compute_dock_margins(pos, extend || this.settings.dock_fixed());
        const w = Math.max(64, this.actor.width || 320), h = Math.max(48, this.actor.height || 68);
        const bw = extend ? mon.width : w, bh = extend ? mon.height : h;
        const cx = extend ? mon.x : mon.x + Math.round((mon.width - bw) / 2);
        const cy = extend ? mon.y : mon.y + Math.round((mon.height - bh) / 2);
        if (pos === 'TOP') return { x: cx, y: mon.y + margins.top, width: bw, height: h };
        if (pos === 'LEFT') return { x: mon.x + margins.left, y: cy, width: w, height: bh };
        if (pos === 'RIGHT') return { x: mon.x + mon.width - w - margins.right, y: cy, width: w, height: bh };
        return { x: cx, y: mon.y + mon.height - h - margins.bottom, width: bw, height: h };
    }

    _position_actor() { const box = this.get_static_box(); this.actor.set_position(box.x, box.y); }

    is_pointer_inside() {
        if (this.actor.hover || this.dash?.hover || this.pressure?._edge_strip?.hover) return true;
        if (this.dash?.showAppsButton?.hover) return true;
        const children = this.dash?._box?.get_children?.() ?? [];
        for (const item of children) { if (item?.hover || item?.child?.hover) return true; }
        const [px, py] = global.get_pointer(), box = this.get_static_box(), mon = this.monitor;
        const pos = this.settings.dock_position(), pad = 16;
        const x1 = pos === 'LEFT' && mon ? mon.x : box.x - pad;
        const x2 = pos === 'RIGHT' && mon ? mon.x + mon.width : box.x + box.width + pad;
        const y1 = pos === 'TOP' && mon ? mon.y : box.y - pad;
        const y2 = pos === 'BOTTOM' && mon ? mon.y + mon.height : box.y + box.height + pad;
        return px >= x1 && px <= x2 && py >= y1 && py <= y2;
    }

    is_menu_open() { return Boolean(this.actions?.is_menu_open()); }
    reveal_from_edge() { this._edge_revealed = true; this._slide(true); }
    EndEdgeReveal() { this._edge_revealed = false; this.intellihide?.update(); this.sync_visibility(); }

    sync_visibility() {
        if (Main.overview.visible || this.settings.dock_fixed() || this._edge_revealed ||
            this.is_pointer_inside() || this.is_menu_open()) {
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
        this._is_hidden = !visible; this.actor.reactive = visible;
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
        if (this.dash?._showLabelTimeoutId > 0) GLib.source_remove(this.dash._showLabelTimeoutId);
        if (this.dash?._resetHoverTimeoutId > 0) GLib.source_remove(this.dash._resetHoverTimeoutId);
        if (this._chrome_added) {
            try { Main.layoutManager.removeChrome(this.actor); } catch (_e) { /* ignore */ }
            this._chrome_added = false;
        }
        this.actor?.destroy(); this.actor = null; this.dash = null;
    }
}

