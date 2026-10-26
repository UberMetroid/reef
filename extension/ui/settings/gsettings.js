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

const BOOL_KEYS = Object.freeze({
    'autohide-in-fullscreen': true,
    'dock-fixed': false,
    'extend-height': false,
    'intellihide': true,
    'isolate-workspaces': false,
    'multi-monitor': false,
    'require-pressure-to-show': true,
    'show-apps-at-top': false,
    'show-border': true,
    'show-favorites': true,
    'show-running': true,
    'show-show-apps-button': true,
});

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
        this._ext = ext_settings;
        this.int = settings_new_schema(INTERFACE_SCHEMA);

        for (const [key, def] of Object.entries(BOOL_KEYS)) {
            const prop = key.replace(/-/g, '_');
            this[prop] = () => (this.ext.settings_schema?.has_key(key) ? this.ext.get_boolean(key) : def);
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
        const all_keys = [
            ...Object.keys(BOOL_KEYS),
            ...Object.keys(UINT_BOUNDS),
            ...Object.keys(ENUM_SPEC),
            'border-color-rgba',
        ];
        if (typeof this._ext?.reset === 'function') {
            for (const key of all_keys) {
                if (this._ext.settings_schema?.has_key(key)) this._ext.reset(key);
            }
            return;
        }
        for (const [key, def] of Object.entries(BOOL_KEYS)) {
            this[`set_${key.replace(/-/g, '_')}`](def);
        }
        for (const [key, [, , def]] of Object.entries(UINT_BOUNDS)) {
            this[`set_${key.replace(/-/g, '_')}`](def);
        }
        for (const [key, [, def]] of Object.entries(ENUM_SPEC)) {
            this[`set_${key.replace(/-/g, '_')}`](def);
        }
        this.set_border_color_rgba('rgb(255,0,0)');
    }
}
