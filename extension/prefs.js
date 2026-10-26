// SPDX-License-Identifier: GPL-3.0-or-later
// Multi-tab GTK4 / Libadwaita preferences UI for Reef dock behavior, appearance, and actions.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { format_rgba, parse_rgba } from './ui/settings/color.js';
import { ExtensionSettings, INTELLIHIDE_MODES } from './ui/settings/gsettings.js';
import {
    BORDER_PRESETS, build_about_page, build_clicks_page,
    make_combo_row, make_spin_row, make_switch_row,
} from './ui/settings/prefs_pages.js';

function build_behavior_page(ext_settings, settings, signals) {
    const page = new Adw.PreferencesPage({ title: 'Dock & Behavior', icon_name: 'preferences-system-symbolic' });
    const pos_group = new Adw.PreferencesGroup({
        title: 'Screen Edge &amp; Intelligent Auto-Hide',
        description: 'Configure bottom-edge auto-hide behavior and how Reef dodges open windows',
    });
    const [fixed_row, fixed_sw] = make_switch_row(
        'Fixed Dock (Always Visible)', 'Reserve a permanent workspace strut instead of auto-hiding',
        settings.dock_fixed(), (v) => settings.set_dock_fixed(v),
    );
    const [ih_row, ih_sw] = make_switch_row(
        'Intelligent Window Dodge (Intellihide)', 'Show dock on empty desktop and hide only when windows overlap',
        settings.intellihide(), (v) => settings.set_intellihide(v),
    );
    const ih_labels = [
        'All Windows — Kelp Friendly (Default)',
        'Focused Application Windows Only',
        'Maximized & Fullscreen Windows Only',
    ];
    const [mode_row, mode_combo] = make_combo_row(
        'Intellihide Dodge Mode', 'All Windows prevents the dock from covering unfocused tiled columns in Kelp',
        ih_labels, INTELLIHIDE_MODES.indexOf(settings.intellihide_mode()),
        (idx) => { if (idx >= 0 && idx < INTELLIHIDE_MODES.length) settings.set_intellihide_mode(INTELLIHIDE_MODES[idx]); },
    );
    for (const r of [fixed_row, ih_row, mode_row]) pos_group.add(r);
    page.add(pos_group);

    const edge_group = new Adw.PreferencesGroup({
        title: 'Edge Pressure &amp; Multi-Monitor Layout',
        description: 'Configure Wayland bottom-edge pressure reveal and full-width panel geometry',
    });
    const [press_row, press_sw] = make_switch_row(
        'Require Edge Pressure to Reveal', 'Push the pointer against the bottom screen edge to reveal the hidden dock',
        settings.require_pressure_to_show(), (v) => settings.set_require_pressure_to_show(v),
    );
    const [thresh_row, thresh_spin] = make_spin_row(
        'Edge Pressure Threshold (px)', 'Pointer travel distance required to trigger edge reveal (20–500 px)',
        settings.pressure_threshold(), 20, 500, 10, (v) => settings.set_pressure_threshold(v),
    );
    const [fs_row, fs_sw] = make_switch_row(
        'Allow Edge Reveal in Fullscreen', 'Permit edge pressure to reveal the dock while a fullscreen app is active',
        settings.autohide_in_fullscreen(), (v) => settings.set_autohide_in_fullscreen(v),
    );
    const [ext_row, ext_sw] = make_switch_row(
        'Extend Dock to Screen Edges (Panel Mode)', 'Stretch the dock across the full screen width instead of a pill',
        settings.extend_height(), (v) => settings.set_extend_height(v),
    );
    const [mm_row, mm_sw] = make_switch_row(
        'Show Dock on All Monitors', 'Display a Reef dock on every connected monitor',
        settings.multi_monitor(), (v) => settings.set_multi_monitor(v),
    );
    for (const r of [press_row, thresh_row, fs_row, ext_row, mm_row]) edge_group.add(r);

    const reset_row = new Adw.ActionRow({
        title: 'Reset to Reef Defaults (border=2, margin=6)',
        subtitle: 'Restore Bottom Auto-Hide, Kelp-friendly All Windows dodge, 48px icons, and Coral Red border',
    });
    const reset_btn = new Gtk.Button({ label: 'Reset Defaults', valign: Gtk.Align.CENTER, css_classes: ['suggested-action'] });
    reset_btn.connect('clicked', () => settings.reset_defaults());
    reset_row.add_suffix(reset_btn);
    reset_row.activatable_widget = reset_btn;
    edge_group.add(reset_row);
    page.add(edge_group);

    const sync_behavior = () => {
        if (fixed_sw.active !== settings.dock_fixed()) fixed_sw.active = settings.dock_fixed();
        if (ih_sw.active !== settings.intellihide()) ih_sw.active = settings.intellihide();
        const m_idx = Math.max(0, INTELLIHIDE_MODES.indexOf(settings.intellihide_mode()));
        if (mode_combo.get_active() !== m_idx) mode_combo.set_active(m_idx);
        if (press_sw.active !== settings.require_pressure_to_show()) press_sw.active = settings.require_pressure_to_show();
        if (thresh_spin.get_value_as_int() !== settings.pressure_threshold()) thresh_spin.set_value(settings.pressure_threshold());
        if (fs_sw.active !== settings.autohide_in_fullscreen()) fs_sw.active = settings.autohide_in_fullscreen();
        if (ext_sw.active !== settings.extend_height()) ext_sw.active = settings.extend_height();
        if (mm_sw.active !== settings.multi_monitor()) mm_sw.active = settings.multi_monitor();
    };
    const b_keys = [
        'dock-fixed', 'intellihide', 'intellihide-mode',
        'require-pressure-to-show', 'pressure-threshold', 'autohide-in-fullscreen', 'extend-height', 'multi-monitor',
    ];
    for (const k of b_keys) {
        if (ext_settings.settings_schema?.has_key(k)) signals.push([ext_settings, ext_settings.connect(`changed::${k}`, sync_behavior)]);
    }
    return page;
}

function build_appearance_page(ext_settings, settings, signals) {
    const page = new Adw.PreferencesPage({ title: 'Icons & Appearance', icon_name: 'applications-graphics-symbolic' });
    const icon_group = new Adw.PreferencesGroup({
        title: 'Application Icons &amp; Launcher',
        description: 'Configure icon sizing, favorites, running indicators, and workspace isolation',
    });
    const [size_row, size_spin] = make_spin_row(
        'Max Icon Size (px)', 'Maximum application icon size in the dock (24–64 px)',
        settings.dash_max_icon_size(), 24, 64, 2, (v) => settings.set_dash_max_icon_size(v),
    );
    const [apps_row, apps_sw] = make_switch_row(
        'Show Apps Launcher Button', 'Display the Show Apps grid button in the dock',
        settings.show_show_apps_button(), (v) => settings.set_show_show_apps_button(v),
    );
    const [top_row, top_sw] = make_switch_row(
        'Place Show Apps Button at Start', 'Put Show Apps at the left edge instead of the right end',
        settings.show_apps_at_top(), (v) => settings.set_show_apps_at_top(v),
    );
    const [fav_row, fav_sw] = make_switch_row(
        'Show Pinned Favorite Apps', 'Display your pinned GNOME Shell favorite applications',
        settings.show_favorites(), (v) => settings.set_show_favorites(v),
    );
    const [run_row, run_sw] = make_switch_row(
        'Show Running Unpinned Apps', 'Display running applications that are not pinned to favorites',
        settings.show_running(), (v) => settings.set_show_running(v),
    );
    const [iso_row, iso_sw] = make_switch_row(
        'Isolate Workspaces', 'Only show running applications that have windows on the active workspace',
        settings.isolate_workspaces(), (v) => settings.set_isolate_workspaces(v),
    );
    for (const r of [size_row, apps_row, top_row, fav_row, run_row, iso_row]) icon_group.add(r);
    page.add(icon_group);

    const style_group = new Adw.PreferencesGroup({
        title: 'Dock Pill Styling &amp; Color Presets',
        description: 'Customize background opacity, border thickness, corner rounding, and 1-click Kelp color presets',
    });
    const [op_row, op_spin] = make_spin_row(
        'Background Opacity (%)', 'Opacity of the dock pill background (0–100%)',
        settings.background_opacity(), 0, 100, 5, (v) => settings.set_background_opacity(v),
    );
    const [bdr_row, bdr_sw] = make_switch_row(
        'Show Accent Border Ring', 'Draw a high-contrast border around the dock pill matching Kelp',
        settings.show_border(), (v) => settings.set_show_border(v),
    );
    const color_row = new Adw.ActionRow({
        title: 'Accent Border Color', subtitle: 'Pick a custom RGBA color or select a Kelp color preset below',
    });
    const rgba = new Gdk.RGBA();
    if (!rgba.parse(settings.border_color_rgba())) rgba.parse('rgb(255,0,0)');
    const color_btn = new Gtk.ColorButton({ rgba, use_alpha: true, valign: Gtk.Align.CENTER });
    color_btn.connect('color-set', () => settings.set_border_color_rgba(color_btn.get_rgba().to_string()));
    color_row.add_suffix(color_btn);

    const preset_labels = BORDER_PRESETS.map(([label]) => label);
    const match_preset = (color) => BORDER_PRESETS.findIndex(([, c]) => format_rgba(parse_rgba(c)) === color);
    const [preset_row, preset_combo] = make_combo_row(
        'Quick Color Presets', 'One-click color presets matching Kelp active window borders',
        preset_labels, match_preset(settings.border_color_rgba()),
        (idx) => {
            if (idx >= 0 && idx < BORDER_PRESETS.length) {
                const css_color = BORDER_PRESETS[idx][1];
                settings.set_border_color_rgba(css_color);
                const next_rgba = new Gdk.RGBA();
                if (next_rgba.parse(css_color)) color_btn.set_rgba(next_rgba);
            }
        },
    );
    const [bw_row, bw_spin] = make_spin_row(
        'Border Width (px)', 'Thickness of the dock border ring (0–8 px, default 2 px)',
        settings.border_width(), 0, 8, 1, (v) => settings.set_border_width(v),
    );
    const [br_row, br_spin] = make_spin_row(
        'Border Corner Radius (px)', 'Corner rounding of the floating dock pill (0–32 px)',
        settings.border_radius(), 0, 32, 2, (v) => settings.set_border_radius(v),
    );
    for (const r of [op_row, bdr_row, color_row, preset_row, bw_row, br_row]) style_group.add(r);
    page.add(style_group);

    const sync_style = () => {
        if (size_spin.get_value_as_int() !== settings.dash_max_icon_size()) size_spin.set_value(settings.dash_max_icon_size());
        if (apps_sw.active !== settings.show_show_apps_button()) apps_sw.active = settings.show_show_apps_button();
        if (top_sw.active !== settings.show_apps_at_top()) top_sw.active = settings.show_apps_at_top();
        if (fav_sw.active !== settings.show_favorites()) fav_sw.active = settings.show_favorites();
        if (run_sw.active !== settings.show_running()) run_sw.active = settings.show_running();
        if (iso_sw.active !== settings.isolate_workspaces()) iso_sw.active = settings.isolate_workspaces();
        if (op_spin.get_value_as_int() !== settings.background_opacity()) op_spin.set_value(settings.background_opacity());
        if (bdr_sw.active !== settings.show_border()) bdr_sw.active = settings.show_border();
        if (bw_spin.get_value_as_int() !== settings.border_width()) bw_spin.set_value(settings.border_width());
        if (br_spin.get_value_as_int() !== settings.border_radius()) br_spin.set_value(settings.border_radius());
        const next_color = settings.border_color_rgba();
        const next_rgba = new Gdk.RGBA();
        if (next_rgba.parse(next_color) && !color_btn.get_rgba().equal(next_rgba)) color_btn.set_rgba(next_rgba);
        const next_idx = match_preset(next_color);
        if (preset_combo.get_active() !== next_idx) preset_combo.set_active(next_idx);
    };
    const s_keys = [
        'dash-max-icon-size', 'show-show-apps-button', 'show-apps-at-top', 'show-favorites',
        'show-running', 'isolate-workspaces', 'background-opacity', 'show-border', 'border-width', 'border-radius', 'border-color-rgba',
    ];
    for (const k of s_keys) {
        if (ext_settings.settings_schema?.has_key(k)) signals.push([ext_settings, ext_settings.connect(`changed::${k}`, sync_style)]);
    }
    return page;
}

export default class ReefPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const ext_settings = this.getSettings();
        const settings = new ExtensionSettings(ext_settings);
        const signals = [];
        window.set_default_size(760, 680);
        window.add(build_behavior_page(ext_settings, settings, signals));
        window.add(build_appearance_page(ext_settings, settings, signals));
        window.add(build_clicks_page(ext_settings, settings, signals));
        window.add(build_about_page());
        window.connect('close-request', () => {
            for (const [obj, sig] of signals) obj.disconnect(sig);
            signals.length = 0;
            return false;
        });
    }
}
