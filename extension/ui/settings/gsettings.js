// SPDX-License-Identifier: GPL-3.0-or-later
// Typed wrapper (ExtensionSettings) around Reef and GNOME desktop GSettings schemas.

import Gio from 'gi://Gio';
import { format_rgba, parse_rgba } from './color.js';

const INTERFACE_SCHEMA = 'org.gnome.desktop.interface';
const INTERFACE_KEY = 'gtk-theme';

function settings_new_schema(schema) {
    const source = Gio.SettingsSchemaSource.get_default();
    if (!source) return null;
    return source.lookup(schema, true) ? new Gio.Settings({ schema_id: schema }) : null;
}

export const DOCK_POSITIONS = Object.freeze(['BOTTOM', 'LEFT', 'RIGHT', 'TOP']);
export const INTELLIHIDE_MODES = Object.freeze(['ALL_WINDOWS', 'FOCUSED_WINDOW', 'MAXIMIZED_ONLY']);
export const CLICK_ACTIONS = Object.freeze(['focus-or-cycle', 'focus-or-minimize', 'launch']);
export const MIDDLE_CLICK_ACTIONS = Object.freeze(['launch', 'minimize', 'quit']);
export const SCROLL_ACTIONS = Object.freeze(['cycle-windows', 'switch-workspace', 'none']);

const BOOL_KEYS = Object.freeze([
    'autohide-in-fullscreen',
    'dock-fixed',
    'extend-height',
    'intellihide',
    'isolate-workspaces',
    'multi-monitor',
    'require-pressure-to-show',
    'show-apps-at-top',
    'show-border',
    'show-favorites',
    'show-running',
    'show-show-apps-button',
]);

const UINT_BOUNDS = Object.freeze({
    'background-opacity': [0, 100, 80],
    'border-radius': [0, 32, 16],
    'border-width': [0, 8, 2],
    'dash-max-icon-size': [24, 64, 48],
    'pressure-threshold': [20, 500, 100],
});

const ENUM_SPEC = Object.freeze({
    'click-action': [CLICK_ACTIONS, 'focus-or-cycle'],
    'dock-position': [DOCK_POSITIONS, 'BOTTOM'],
    'intellihide-mode': [INTELLIHIDE_MODES, 'ALL_WINDOWS'],
    'middle-click-action': [MIDDLE_CLICK_ACTIONS, 'launch'],
    'scroll-action': [SCROLL_ACTIONS, 'cycle-windows'],
});

export class ExtensionSettings {
    constructor(ext_settings) {
        this.ext = ext_settings;
        this.int = settings_new_schema(INTERFACE_SCHEMA);

        for (const key of BOOL_KEYS) {
            const prop = key.replace(/-/g, '_');
            this[prop] = () => (this.ext.settings_schema?.has_key(key) ? this.ext.get_boolean(key) : false);
            this[`set_${prop}`] = (v) => {
                if (this.ext.settings_schema?.has_key(key)) this.ext.set_boolean(key, Boolean(v));
            };
        }

        for (const [key, [min, max, def]] of Object.entries(UINT_BOUNDS)) {
            const prop = key.replace(/-/g, '_');
            this[prop] = () => {
                if (!this.ext.settings_schema?.has_key(key)) return def;
                const raw = this.ext.get_uint(key);
                return Math.max(min, Math.min(max, raw));
            };
            this[`set_${prop}`] = (v) => {
                if (!this.ext.settings_schema?.has_key(key)) return;
                const clamped = Math.max(min, Math.min(max, Math.round(Number(v) || 0)));
                this.ext.set_uint(key, clamped);
            };
        }

        for (const [key, [allowed, def]] of Object.entries(ENUM_SPEC)) {
            const prop = key.replace(/-/g, '_');
            this[prop] = () => {
                if (!this.ext.settings_schema?.has_key(key)) return def;
                const raw = this.ext.get_string(key);
                return allowed.includes(raw) ? raw : def;
            };
            this[`set_${prop}`] = (v) => {
                if (!this.ext.settings_schema?.has_key(key)) return;
                const valid = allowed.includes(v) ? v : def;
                if (this.ext.get_string(key) !== valid) this.ext.set_string(key, valid);
            };
        }
    }

    border_color_rgba() {
        if (!this.ext.settings_schema?.has_key('border-color-rgba')) {
            return format_rgba(parse_rgba('rgb(255,0,0)'));
        }
        return format_rgba(parse_rgba(this.ext.get_string('border-color-rgba')));
    }

    set_border_color_rgba(css_str) {
        if (this.ext.settings_schema?.has_key('border-color-rgba')) {
            this.ext.set_string('border-color-rgba', format_rgba(parse_rgba(css_str)));
        }
    }

    is_vertical() {
        const pos = this.dock_position();
        return pos === 'LEFT' || pos === 'RIGHT';
    }

    is_dark() {
        if (!this.int) return true;
        const theme = this.int.get_string(INTERFACE_KEY).toLowerCase();
        const scheme = this.int.settings_schema?.has_key('color-scheme')
            ? this.int.get_string('color-scheme')
            : '';
        return theme.endsWith('dark') || theme.endsWith('inverse') || scheme === 'prefer-dark';
    }

    reset_defaults() {
        this.set_dock_position('BOTTOM');
        this.set_dock_fixed(false);
        this.set_intellihide(true);
        this.set_intellihide_mode('ALL_WINDOWS');
        this.set_require_pressure_to_show(true);
        this.set_pressure_threshold(100);
        this.set_autohide_in_fullscreen(true);
        this.set_extend_height(false);
        this.set_multi_monitor(false);
        this.set_dash_max_icon_size(48);
        this.set_show_apps_at_top(false);
        this.set_show_show_apps_button(true);
        this.set_show_favorites(true);
        this.set_show_running(true);
        this.set_isolate_workspaces(false);
        this.set_click_action('focus-or-cycle');
        this.set_middle_click_action('launch');
        this.set_scroll_action('cycle-windows');
        this.set_background_opacity(80);
        this.set_show_border(true);
        this.set_border_width(2);
        this.set_border_radius(16);
        this.set_border_color_rgba('rgb(255,0,0)');
    }
}
