// SPDX-License-Identifier: GPL-3.0-or-later
// Screen-edge dock chrome actor, native Dash.Dash host, strut manager, and slide animator.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Dash from 'resource:///org/gnome/shell/ui/dash.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as OverviewControls from 'resource:///org/gnome/shell/ui/overviewControls.js';
import { build_dock_background_css, build_separator_css, compute_dock_margins, EDGE_GEOMETRY } from '../ui/dock_style.js';
import { AppActionsController, get_app_windows } from './app_actions.js';
import { EdgePressureController } from './edge_pressure.js';
import { IntellihideTracker } from './intellihide.js';

const SLIDE_DURATION_MS = 180;

export class DockContainer {
    constructor(monitor_index, settings, extension) {
        this.monitor_index = monitor_index; this.settings = settings; this.extension = extension;
        this._chrome_added = false; this._chrome_struts = false;
        this._edge_revealed = false; this._is_hidden = false; this._pos_idle_id = 0;
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
        this.intellihide = new IntellihideTracker(this, this.settings, () => { this.actions?.sync_icons(); this.sync_visibility(); });
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
        const q_pos = () => this._queue_position();
        for (const a of [this.actor, this.dash, this.dash._dashContainer, this.dash._background]) {
            if (a) this._signals.push([a, a.connect('notify::width', q_pos)], [a, a.connect('notify::height', q_pos)]);
        }
        this._signals.push(
            [this.actor, this.actor.connect('notify::hover', on_hover)],
            [this.dash, this.dash.connect('notify::hover', on_hover)],
            [this.actor, this.actor.connect('enter-event', on_enter)],
            [this.actor, this.actor.connect('leave-event', on_leave)],
        );
    }
    _queue_position() {
        if (this._pos_idle_id > 0) return;
        this._pos_idle_id = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._pos_idle_id = 0; this._position_actor(); return GLib.SOURCE_REMOVE;
        });
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
        const target_sz = Math.min(this.dash.iconSize, icon_cap);
        this.dash.iconSize = target_sz;
        const center_base_icon = (bi) => {
            if (!bi) return;
            bi.x_align = align; bi.y_align = align;
            if (bi._box) { bi._box.x_align = align; bi._box.y_align = align; }
            if (bi._iconBin) { bi._iconBin.x_align = align; bi._iconBin.y_align = align; }
            bi.setIconSize?.(target_sz);
        };
        for (const item of this.dash._box.get_children()) {
            if (!item) continue;
            item.x_align = align; item.y_align = align;
            if (item.child) { item.child.x_align = align; item.child.y_align = align; }
            center_base_icon(item.child?._delegate?.icon);
        }
        center_base_icon(this.dash._showAppsIcon?.icon);
        if (this.dash._separator) {
            this.dash._separator.x_align = align; this.dash._separator.y_align = align;
            this.dash._separator.style = build_separator_css(false, this.dash.iconSize, this.settings.is_dark());
        }
        this.actions?.sync_icons(); this._sync_sizer_constraints(); this._position_actor(); this._queue_position();
    }
    _sync_sizer_constraints() {
        const sizer = this.dash._background?.get_first_child?.(), dc = this.dash._dashContainer;
        const first = this.dash._box?.get_first_child?.()?.child, sa = this.dash._showAppsIcon?.toggleButton ?? this.dash._showAppsIcon?.icon;
        const icon_src = (this.settings.show_show_apps_button() ? sa : first) ?? sa;
        if (!sizer || !icon_src || !dc) return;
        const extend = this.settings.extend_height();
        sizer.clear_constraints();
        sizer.add_constraint(new Clutter.BindConstraint({ source: dc, coordinate: Clutter.BindCoordinate.HEIGHT }));
        sizer.add_constraint(new Clutter.BindConstraint({ source: extend ? this.actor : dc, coordinate: Clutter.BindCoordinate.WIDTH }));
    }
    _sync_chrome() {
        const want_struts = this.settings.dock_fixed();
        if (this._chrome_added && this._chrome_struts === want_struts) return;
        if (this._chrome_added) {
            try { Main.layoutManager.removeChrome(this.actor); } catch (_e) { /* ignore */ }
            this._chrome_added = false;
        }
        Main.layoutManager.addChrome(this.actor, { affectsStruts: want_struts, trackFullscreen: false });
        this._chrome_added = true; this._chrome_struts = want_struts;
    }
    apply_layout_and_style() {
        this._sync_chrome();
        const extend = this.settings.extend_height(), tiles = this.settings.show_icon_background(), orient = Clutter.Orientation.HORIZONTAL;
        const align = Clutter.ActorAlign.CENTER, fill = Clutter.ActorAlign.FILL, light = !this.settings.is_dark();
        this.actor.style_class = `reef-dock-container ${extend ? 'reef-dock-panel' : 'reef-dock-pill'} reef-dock-horizontal${tiles ? ' reef-icon-tiles' : ''}${light ? ' reef-dock-light' : ''}`;
        this.actor.orientation = orient;
        if (!extend) {
            for (const a of [this.actor, this.dash, this.dash._dashContainer, this.dash._background]) {
                a?.set_width(-1); a?.set_height(-1); a?.queue_relayout?.();
            }
        }
        this.dash.x_expand = extend; this.dash.y_expand = false;
        this.dash.x_align = extend ? fill : align; this.dash.y_align = align;
        if (this.dash._dashContainer) {
            this.dash._dashContainer.orientation = orient;
            this.dash._dashContainer.x_expand = extend; this.dash._dashContainer.y_expand = false;
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
            this.dash._background.x_expand = extend; this.dash._background.y_expand = false;
            this.dash._background.x_align = extend ? fill : align; this.dash._background.y_align = align;
            this.dash._background.style = build_dock_background_css(this.settings);
        }
        this._sync_sizer_constraints();
        const mon = this.monitor, scale = St.ThemeContext.get_for_stage(global.stage).scale_factor || 1;
        const cross_px = Math.round((this.settings.dash_max_icon_size() + 36) * scale);
        const span_px = mon ? Math.round(mon.width * (extend ? 1.0 : 0.92)) : 640;
        this.dash.iconSize = 0;
        if (mon) this.dash.setMaxSize(span_px, cross_px);
        this.dash._queueRedisplay(); this._position_actor(); this._queue_position();
        this.pressure?.rebuild(); this.intellihide?.update();
    }
    get_static_box() {
        const mon = this.monitor;
        if (!mon) return { x: 0, y: 0, width: 0, height: 0 };
        const extend = this.settings.extend_height(), edge = EDGE_GEOMETRY.BOTTOM;
        const margins = compute_dock_margins('BOTTOM', extend, this.settings.dock_margin());
        const dc = this.dash?._dashContainer, bg = this.dash?._background, bx = this.dash?._box, sa = this.dash?._showAppsIcon;
        const [, bx_w] = bx?.get_preferred_width?.(-1) ?? [0, 0];
        const [, sa_w] = (sa?.visible ? sa?.get_preferred_width?.(-1) : null) ?? [0, 0];
        const [, dc_w] = dc?.get_preferred_width?.(-1) ?? [0, 0], [, dc_h] = dc?.get_preferred_height?.(-1) ?? [0, 0];
        const [, bg_w] = bg?.get_preferred_width?.(-1) ?? [0, 0], [, bg_h] = bg?.get_preferred_height?.(-1) ?? [0, 0];
        const inner_w = (bx_w + sa_w) > 0 ? (bx_w + sa_w) : (dc_w > 0 && dc_w < mon.width ? dc_w : 0);
        const pad_w = bg_w > inner_w && bg_w < mon.width ? bg_w - inner_w : 20;
        const alloc_w = (dc?.width > 0 && dc.width < mon.width) ? dc.width + 20 : 0;
        const raw_w = (inner_w > 0 ? inner_w + pad_w : 0) || alloc_w;
        const raw_h = Math.max(dc_h || 0, bg_h || 0, dc?.height || 0, bg?.height || 0);
        const nat_w = Math.max(64, raw_w || 320), nat_h = Math.max(48, raw_h || 68);
        const bw = extend ? mon.width : nat_w, bh = nat_h;
        const cx = extend ? mon.x : mon.x + Math.round((mon.width - bw) / 2);
        return edge.box(mon, bw, bh, cx, mon.y, margins);
    }
    _position_actor() {
        if (!this.actor) return;
        const extend = this.settings.extend_height();
        if (!extend) { this.actor.set_width(-1); this.dash?.set_width(-1); this.dash?._dashContainer?.set_width(-1); }
        this.actor.set_height(-1);
        const box = this.get_static_box();
        if (extend && this.actor.width !== box.width) this.actor.set_width(box.width);
        if (this.actor.x !== box.x || this.actor.y !== box.y) this.actor.set_position(box.x, box.y);
    }
    is_pointer_inside() {
        if (!this._is_hidden) {
            if (this.actor.hover || this.dash?.hover || this.pressure?._edge_strip?.hover) return true;
            if (this.dash?.showAppsButton?.hover) return true;
            for (const item of this.dash?._box?.get_children?.() ?? []) { if (item?.hover || item?.child?.hover) return true; }
        }
        const [px, py] = global.get_pointer(), box = this.get_static_box(), mon = this.monitor;
        const edge = EDGE_GEOMETRY.BOTTOM;
        const pad = 8, fallback = { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 };
        const { x1, x2, y1, y2 } = edge.hit(mon ?? fallback, box, pad);
        return px >= x1 && px <= x2 && py >= y1 && py <= y2;
    }
    is_menu_open() { return Boolean(this.actions?.is_menu_open()); }
    reveal_from_edge() { this._edge_revealed = true; this._slide(true); }
    EndEdgeReveal() { this._edge_revealed = false; this.intellihide?.update(); this.sync_visibility(); }
    sync_visibility() {
        if (this.monitor?.inFullscreen && !this.settings.autohide_in_fullscreen() && !Main.overview.visible) {
            this._slide(false); return;
        }
        const show = Main.overview.visible || this.settings.dock_fixed() || this._edge_revealed ||
            (!this._is_hidden && this.is_pointer_inside()) || this.is_menu_open() ||
            (this.settings.intellihide() && !this.intellihide?.overlapping);
        this._slide(show);
    }
    _slide(visible) {
        this._position_actor();
        const edge = EDGE_GEOMETRY.BOTTOM, box = this.get_static_box(), pad = 12;
        const tx = visible ? 0 : edge.slide_dx * (box.width + pad), ty = visible ? 0 : edge.slide_dy * (box.height + pad);
        if (this._is_hidden === !visible && this.actor.translation_x === tx && this.actor.translation_y === ty) return;
        this._is_hidden = !visible; this.actor.reactive = visible;
        this.actor.remove_all_transitions();
        this.actor.ease({
            translation_x: tx, translation_y: ty, opacity: visible ? 255 : 0,
            duration: SLIDE_DURATION_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }
    destroy() {
        if (this._pos_idle_id > 0) { GLib.source_remove(this._pos_idle_id); this._pos_idle_id = 0; }
        for (const id of this._overview_signals) { try { Main.overview.disconnect(id); } catch (_e) { /* ignore */ } }
        this._overview_signals.length = 0;
        for (const [obj, sig] of this._signals) { try { obj.disconnect(sig); } catch (_e) { /* ignore */ } }
        this._signals.length = 0;
        this.pressure?.destroy(); this.intellihide?.destroy(); this.actions?.destroy();
        this.pressure = null; this.intellihide = null; this.actions = null;
        if (this.dash?._showLabelTimeoutId > 0) GLib.source_remove(this.dash._showLabelTimeoutId);
        if (this.dash?._resetHoverTimeoutId > 0) GLib.source_remove(this.dash._resetHoverTimeoutId);
        if (this._chrome_added) { try { Main.layoutManager.removeChrome(this.actor); } catch (_e) { /* ignore */ } }
        this._chrome_added = false; this.actor?.destroy(); this.actor = null; this.dash = null;
    }
}
