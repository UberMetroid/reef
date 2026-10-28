// SPDX-License-Identifier: GPL-3.0-or-later
// Left-click, middle-click, scroll-wheel window cycling, and right-click quick menu for Reef.

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { build_running_dot_css } from '../ui/dock_style.js';
import { MAX_TRACKED_WINDOWS } from './intellihide.js';

const POPUP_SIDE = St.Side.BOTTOM;

export function get_app_windows(app, isolate_workspaces) {
    if (!app || typeof app.get_windows !== 'function') return [];
    const raw = app.get_windows();
    if (!Array.isArray(raw)) return [];
    const ws = global.workspace_manager?.get_active_workspace?.() ?? null;
    const limit = Math.min(raw.length, MAX_TRACKED_WINDOWS), out = [];
    for (let i = 0; i < limit; i += 1) {
        const w = raw[i];
        if (!w || w.is_skip_taskbar?.()) continue;
        if (isolate_workspaces && ws && !w.is_on_all_workspaces?.() && w.get_workspace?.() !== ws) continue;
        out.push(w);
    }
    return out;
}

export class AppActionsController {
    constructor(dock_container, settings, extension) {
        this.dock = dock_container;
        this.settings = settings;
        this.extension = extension;
        this._icon_hooks = new Map();
        this._box_signals = [];
        this._bg_signals = [];
        this._context_menu = null;
        this._menu_manager = null;
        this._last_scroll_ms = 0;
        this._bind_dash_box();
        this._bind_dock_context_menu();
        this.sync_icons();
    }

    _bind_dash_box() {
        const box = this.dock.dash?._box;
        if (!box) return;
        this._box_signals.push(
            box.connect('child-added', () => this.sync_icons()),
            box.connect('child-removed', () => this.sync_icons()),
        );
    }

    _bind_dock_context_menu() {
        const target = this.dock.dash?._showAppsIcon?.toggleButton ?? this.dock.actor;
        if (!target) return;
        this._menu_manager = new PopupMenu.PopupMenuManager(target);
        this._context_menu = new PopupMenu.PopupMenu(target, 0.5, this._popup_side());
        Main.uiGroup.add_child(this._context_menu.actor);
        this._context_menu.actor.hide();
        this._menu_manager.addMenu(this._context_menu);

        const handler = (_actor, event) => {
            if (event.get_button() === Clutter.BUTTON_SECONDARY) {
                this._open_quick_menu();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        };
        const btn = this.dock.dash?._showAppsIcon?.toggleButton;
        if (btn) this._bg_signals.push([btn, btn.connect('button-press-event', handler)]);
        const bg = this.dock.dash?._background;
        if (bg) {
            bg.reactive = true;
            this._bg_signals.push([bg, bg.connect('button-press-event', handler)]);
        }
    }

    _popup_side() {
        return POPUP_SIDE;
    }

    is_menu_open() {
        if (this._context_menu?.isOpen) return true;
        for (const app_icon of this._icon_hooks.keys()) {
            if (app_icon._menu?.isOpen) return true;
        }
        return false;
    }

    _open_quick_menu() {
        if (!this._context_menu) return;
        this._context_menu._arrowSide = this._popup_side();
        this._context_menu.removeAll();
        const ah_item = new PopupMenu.PopupSwitchMenuItem(_('Intelligent Auto-Hide'), !this.settings.dock_fixed());
        ah_item.connect('toggled', (_item, state) => {
            this._context_menu.close(BoxPointer.PopupAnimation.FULL);
            this.settings.set_dock_fixed(!state);
        });
        this._context_menu.addMenuItem(ah_item);

        const ext_item = new PopupMenu.PopupSwitchMenuItem(
            _('Extend to Screen Edges (Panel Mode)'), this.settings.extend_height(),
        );
        ext_item.connect('toggled', (_item, state) => {
            this._context_menu.close(BoxPointer.PopupAnimation.FULL);
            this.settings.set_extend_height(state);
        });
        this._context_menu.addMenuItem(ext_item);
        this._context_menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const prefs_item = new PopupMenu.PopupMenuItem(_('Reef Settings & About…'));
        prefs_item.connect('activate', () => {
            this._context_menu.close(BoxPointer.PopupAnimation.FULL);
            this.extension?.openPreferences?.();
        });
        this._context_menu.addMenuItem(prefs_item);
        this._context_menu.open(BoxPointer.PopupAnimation.FULL);
    }

    sync_icons() {
        const box = this.dock.dash?._box;
        if (!box) return;
        const side = this._popup_side(), current = new Set();
        for (const item of box.get_children()) {
            const app_icon = item?.child;
            if (!app_icon || !app_icon.app) continue;
            current.add(app_icon);
            app_icon._popupMenuSide = side;
            if (app_icon._menu) app_icon._menu._arrowSide = side;
            const sync_dot = () => {
                if (!app_icon._dot) return;
                const iso = this.settings.isolate_workspaces(), wins = get_app_windows(app_icon.app, iso);
                app_icon._dot.style = build_running_dot_css(this.settings, wins.length);
                app_icon._dot.translation_y = 0;
                app_icon._dot.visible = iso ? wins.length > 0 : (app_icon.app.state !== 0 || wins.length > 0);
            };
            sync_dot();
            if (this._icon_hooks.has(app_icon)) continue;
            const orig_activate = app_icon.activate.bind(app_icon);
            const orig_update_dot = app_icon._updateRunningStyle?.bind(app_icon) ?? null;
            if (orig_update_dot) app_icon._updateRunningStyle = () => { orig_update_dot(); sync_dot(); };
            app_icon.activate = (button) => this._handle_activate(app_icon, button, orig_activate);
            const scroll_sig = app_icon.connect('scroll-event', (_actor, ev) => this._handle_scroll(app_icon, ev));
            const destroy_sig = app_icon.connect('destroy', () => this._icon_hooks.delete(app_icon));
            this._icon_hooks.set(app_icon, { orig_activate, orig_update_dot, scroll_sig, destroy_sig });
        }
        for (const [app_icon, hook] of Array.from(this._icon_hooks.entries())) {
            if (!current.has(app_icon)) this._unhook_icon(app_icon, hook);
        }
    }

    _handle_activate(app_icon, button, orig_activate) {
        const app = app_icon.app;
        if (!app) return orig_activate(button);
        const event = Clutter.get_current_event(), mods = event ? event.get_state() : 0;
        if (button === Clutter.BUTTON_MIDDLE) {
            this._run_middle_click(app_icon, app);
            return;
        }
        if ((mods & Clutter.ModifierType.CONTROL_MASK) !== 0) {
            orig_activate(button);
            return;
        }
        const wins = get_app_windows(app, this.settings.isolate_workspaces());
        if (wins.length === 0) {
            app_icon.animateLaunch?.(); app.activate(); Main.overview.hide(); return;
        }
        const action = this.settings.click_action();
        if (action === 'launch' && app.can_open_new_window()) {
            app_icon.animateLaunch?.(); app.open_new_window(-1); Main.overview.hide(); return;
        }
        const focus_win = global.display?.get_focus_window?.() ?? null;
        if (!wins.includes(focus_win)) Main.activateWindow(wins[0]);
        else if (action === 'focus-or-minimize') focus_win.minimize?.();
        else Main.activateWindow(wins[wins.length - 1]);
        Main.overview.hide();
    }

    _run_middle_click(app_icon, app) {
        const action = this.settings.middle_click_action();
        const wins = get_app_windows(app, this.settings.isolate_workspaces());
        if (action === 'quit') { for (const w of wins) w.delete?.(global.get_current_time()); return; }
        if (action === 'minimize') {
            const focus_win = global.display?.get_focus_window?.() ?? wins[0];
            if (focus_win && wins.includes(focus_win)) focus_win.minimize?.();
            return;
        }
        if (app.can_open_new_window()) { app_icon.animateLaunch?.(); app.open_new_window(-1); }
        else app.activate();
        Main.overview.hide();
    }

    _handle_scroll(app_icon, event) {
        const action = this.settings.scroll_action();
        if (action === 'none') return Clutter.EVENT_PROPAGATE;
        const dir = event.get_scroll_direction();
        const up = dir === Clutter.ScrollDirection.UP || dir === Clutter.ScrollDirection.LEFT;
        const down = dir === Clutter.ScrollDirection.DOWN || dir === Clutter.ScrollDirection.RIGHT;
        if (!up && !down) return Clutter.EVENT_PROPAGATE;
        const now = Date.now();
        if (now - this._last_scroll_ms < 140) return Clutter.EVENT_STOP;
        this._last_scroll_ms = now;

        if (action === 'switch-workspace') {
            const wm = global.workspace_manager;
            const active = wm?.get_active_workspace_index?.() ?? 0, total = wm?.get_n_workspaces?.() ?? 1;
            const next_idx = Math.max(0, Math.min(total - 1, active + (up ? -1 : 1)));
            wm?.get_workspace_by_index?.(next_idx)?.activate(global.get_current_time());
            return Clutter.EVENT_STOP;
        }
        const wins = get_app_windows(app_icon.app, this.settings.isolate_workspaces());
        if (wins.length === 0) return Clutter.EVENT_STOP;
        const focus_win = global.display?.get_focus_window?.() ?? null;
        const cur_idx = Math.max(0, wins.indexOf(focus_win));
        const next_idx = up ? (cur_idx + 1) % wins.length : (cur_idx - 1 + wins.length) % wins.length;
        Main.activateWindow(wins[next_idx]);
        return Clutter.EVENT_STOP;
    }

    _unhook_icon(app_icon, hook) {
        try {
            app_icon.activate = hook.orig_activate;
            if (hook.orig_update_dot) app_icon._updateRunningStyle = hook.orig_update_dot;
            app_icon.disconnect(hook.scroll_sig);
            app_icon.disconnect(hook.destroy_sig);
        } catch (_e) { /* ignore */ }
        this._icon_hooks.delete(app_icon);
    }

    destroy() {
        const box = this.dock.dash?._box;
        if (box) { for (const id of this._box_signals) { try { box.disconnect(id); } catch (_e) { /* ignore */ } } }
        this._box_signals.length = 0;
        for (const [actor, sig] of this._bg_signals) { try { actor.disconnect(sig); } catch (_e) { /* ignore */ } }
        this._bg_signals.length = 0;
        for (const [app_icon, hook] of Array.from(this._icon_hooks.entries())) this._unhook_icon(app_icon, hook);
        this._context_menu?.destroy();
        this._context_menu = null;
        this._menu_manager = null;
    }
}
