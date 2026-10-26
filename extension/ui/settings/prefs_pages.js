// SPDX-License-Identifier: GPL-3.0-or-later
// Libadwaita Preferences Clicks & Scroll and About & Support pages plus border color presets.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { CLICK_ACTIONS, MIDDLE_CLICK_ACTIONS, SCROLL_ACTIONS } from './gsettings.js';

export const BORDER_PRESETS = Object.freeze([
    ['Gruvbox Amber', 'rgb(251,184,108)'],
    ['Kelp Emerald', 'rgb(46,194,126)'],
    ['Ocean Cyan', 'rgb(106,215,225)'],
    ['Coral Red', 'rgb(255,0,0)'],
]);

const INTERACTION_GUIDE = Object.freeze([
    ['Left-Click Running App Icon', 'Focus window, cycle open windows, or toggle minimize', 'Left-Click'],
    ['Middle-Click App Icon', 'Launch a new window instance, minimize, or quit application', 'Middle-Click'],
    ['Scroll Wheel Over App Icon', 'Cycle through the application windows or switch workspaces', 'Scroll Wheel'],
    ['Right-Click Dock or Show Apps', 'Quick menu for Auto-Hide, Panel Mode, and Reef Settings &amp; About…', 'Right-Click'],
    ['Push Pointer to Screen Edge', 'Reveal auto-hidden dock via Wayland pressure barrier', 'Edge Pressure'],
]);

export function make_switch_row(title, subtitle, active, on_toggle) {
    const row = new Adw.ActionRow({ title, subtitle });
    const sw = new Gtk.Switch({ active: Boolean(active), valign: Gtk.Align.CENTER });
    sw.connect('notify::active', () => on_toggle(sw.active));
    row.add_suffix(sw);
    row.activatable_widget = sw;
    return [row, sw];
}

export function make_spin_row(title, subtitle, value, min, max, step, on_change) {
    const row = new Adw.ActionRow({ title, subtitle });
    const spin = Gtk.SpinButton.new_with_range(min, max, step);
    spin.set_value(value);
    spin.set_valign(Gtk.Align.CENTER);
    spin.connect('value-changed', () => on_change(spin.get_value_as_int()));
    row.add_suffix(spin);
    return [row, spin];
}

export function make_combo_row(title, subtitle, items, active_idx, on_change) {
    const row = new Adw.ActionRow({ title, subtitle });
    const combo = new Gtk.ComboBoxText({ valign: Gtk.Align.CENTER });
    for (const item of items) combo.append_text(item);
    combo.set_active(Math.max(0, active_idx));
    combo.connect('changed', () => on_change(combo.get_active()));
    row.add_suffix(combo);
    return [row, combo];
}

function add_link_row(group, title, subtitle, button_label, url, fallback_url = null) {
    const row = new Adw.ActionRow({ title, subtitle });
    const btn = new Gtk.Button({
        label: button_label,
        valign: Gtk.Align.CENTER,
        css_classes: ['pill'],
    });
    btn.connect('clicked', () => {
        let ok = false;
        try {
            ok = Boolean(Gio.AppInfo.launch_default_for_uri(url, null));
        } catch (_e) {
            ok = false;
        }
        if (!ok && fallback_url) {
            try { Gio.AppInfo.launch_default_for_uri(fallback_url, null); } catch (_e2) { /* ignore */ }
        }
    });
    row.add_suffix(btn);
    row.activatable_widget = btn;
    group.add(row);
}

export function build_clicks_page(ext_settings, settings, signals) {
    const page = new Adw.PreferencesPage({
        title: 'Clicks & Scroll',
        icon_name: 'input-mouse-symbolic',
    });

    const action_group = new Adw.PreferencesGroup({
        title: 'Icon Click &amp; Scroll Actions',
        description: 'Configure how left-click, middle-click, and mouse wheel scroll behave on dock icons',
    });

    const click_labels = [
        'Focus or Cycle Windows (Default)',
        'Focus or Minimize Window',
        'Launch New Window Instance',
    ];
    const [click_row, click_combo] = make_combo_row(
        'Left-Click Action',
        'Behavior when left-clicking a running application icon in the dock',
        click_labels,
        CLICK_ACTIONS.indexOf(settings.click_action()),
        (idx) => { if (idx >= 0 && idx < CLICK_ACTIONS.length) settings.set_click_action(CLICK_ACTIONS[idx]); },
    );
    action_group.add(click_row);

    const middle_labels = [
        'Launch New Window (Default)',
        'Minimize Focused Window',
        'Quit Application',
    ];
    const [mid_row, mid_combo] = make_combo_row(
        'Middle-Click Action',
        'Behavior when middle-clicking an application icon in the dock',
        middle_labels,
        MIDDLE_CLICK_ACTIONS.indexOf(settings.middle_click_action()),
        (idx) => {
            if (idx >= 0 && idx < MIDDLE_CLICK_ACTIONS.length) {
                settings.set_middle_click_action(MIDDLE_CLICK_ACTIONS[idx]);
            }
        },
    );
    action_group.add(mid_row);

    const scroll_labels = [
        'Cycle Application Windows (Default)',
        'Switch Active Workspace',
        'Disabled (Do Nothing)',
    ];
    const [scroll_row, scroll_combo] = make_combo_row(
        'Scroll Wheel Action',
        'Behavior when scrolling the mouse wheel or touchpad over an application icon',
        scroll_labels,
        SCROLL_ACTIONS.indexOf(settings.scroll_action()),
        (idx) => { if (idx >= 0 && idx < SCROLL_ACTIONS.length) settings.set_scroll_action(SCROLL_ACTIONS[idx]); },
    );
    action_group.add(scroll_row);
    page.add(action_group);

    const sync_actions = () => {
        const c_idx = Math.max(0, CLICK_ACTIONS.indexOf(settings.click_action()));
        if (click_combo.get_active() !== c_idx) click_combo.set_active(c_idx);
        const m_idx = Math.max(0, MIDDLE_CLICK_ACTIONS.indexOf(settings.middle_click_action()));
        if (mid_combo.get_active() !== m_idx) mid_combo.set_active(m_idx);
        const s_idx = Math.max(0, SCROLL_ACTIONS.indexOf(settings.scroll_action()));
        if (scroll_combo.get_active() !== s_idx) scroll_combo.set_active(s_idx);
    };

    for (const key of ['click-action', 'middle-click-action', 'scroll-action']) {
        if (ext_settings.settings_schema?.has_key(key)) {
            signals.push([ext_settings, ext_settings.connect(`changed::${key}`, sync_actions)]);
        }
    }

    const guide_group = new Adw.PreferencesGroup({
        title: 'Quick Interaction Reference',
        description: 'Everyday mouse and edge gestures built into Reef',
    });
    for (const [gesture, desc, badge_text] of INTERACTION_GUIDE) {
        const row = new Adw.ActionRow({ title: gesture, subtitle: desc });
        const badge = new Gtk.Label({
            label: badge_text,
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label', 'monospace'],
        });
        row.add_suffix(badge);
        guide_group.add(row);
    }
    page.add(guide_group);
    return page;
}

export function build_about_page() {
    const page = new Adw.PreferencesPage({
        title: 'About & Support',
        icon_name: 'help-about-symbolic',
    });

    const header_group = new Adw.PreferencesGroup({
        title: 'Reef — Wayland-Native Intelligent Dock for GNOME 45–50',
        description: 'Fast screen-edge dock with pressure barriers, Kelp-friendly window-dodge intellihide, ' +
            'scroll window cycling, and custom pill styling.',
    });

    const ver_row = new Adw.ActionRow({
        title: 'Reef Release Version',
        subtitle: 'Zero-subprocess, zero-telemetry Wayland dock extension for GNOME Shell',
    });
    ver_row.add_suffix(new Gtk.Label({
        label: 'v1.0.6', valign: Gtk.Align.CENTER, css_classes: ['monospace'],
    }));
    header_group.add(ver_row);

    const lic_row = new Adw.ActionRow({
        title: 'Open-Source License',
        subtitle: 'Derived from Dash to Dock (Michele Gaio, Canonical Ltd., &amp; contributors) — free software forever',
    });
    lic_row.add_suffix(new Gtk.Label({
        label: 'GPL-3.0-or-later', valign: Gtk.Align.CENTER, css_classes: ['monospace'],
    }));
    header_group.add(lic_row);
    page.add(header_group);

    const support_group = new Adw.PreferencesGroup({
        title: 'Support &amp; Community',
        description: 'If Reef improves your daily workflow alongside Kelp, starring the repository or sponsoring ' +
            'development helps keep GNOME 45–50 support fast and rock-solid.',
    });

    add_link_row(
        support_group,
        'Star Reef on GitHub',
        'Star UberMetroid/reef to help other GNOME &amp; Linux users discover Reef',
        'Star on GitHub',
        'https://github.com/UberMetroid/reef',
    );
    add_link_row(
        support_group,
        'Tuition, Not Coffee — Help send my daughter to college',
        "Skip the coffee — 100% of sponsorships go toward my daughter's college &amp; future fund",
        'Tuition, Not Coffee',
        'https://ubermetroid.github.io/tuition-not-coffee',
        'https://github.com/UberMetroid/reef',
    );
    add_link_row(
        support_group,
        'Project Website &amp; Documentation',
        'Explore the Reef feature guide, Kelp integration overview, and configuration reference',
        'Open Website',
        'https://ubermetroid.github.io/reef/',
    );
    add_link_row(
        support_group,
        'Report an Issue or Request a Feature',
        'Found a bug or have a feature request? Open an issue on GitHub',
        'Report Issue',
        'https://github.com/UberMetroid/reef/issues',
    );

    page.add(support_group);
    return page;
}
