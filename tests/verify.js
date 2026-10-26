// SPDX-License-Identifier: GPL-3.0-or-later
// Zero-dependency GJS architectural lint, Page Rule, EGO boundary, GTK4/Adw, and behavioral test suite.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {
    boxes_overlap, evaluate_intellihide_overlap, is_candidate_window_type,
    is_window_maximized_or_fullscreen, MAX_TRACKED_WINDOWS,
} from '../extension/dock/intellihide.js';
import {
    build_dock_background_css, build_separator_css, compute_dock_margins,
    DOCK_EDGE_MARGIN, EDGE_GEOMETRY, is_shared_monitor_edge,
} from '../extension/ui/dock_style.js';
import { format_rgba, is_dark_rgba, parse_rgba, text_color_for_css } from '../extension/ui/settings/color.js';
import {
    CLICK_ACTIONS, DOCK_POSITIONS, ExtensionSettings, INTELLIHIDE_MODES,
    MIDDLE_CLICK_ACTIONS, SCROLL_ACTIONS,
} from '../extension/ui/settings/gsettings.js';
import {
    BORDER_PRESETS, build_about_page, build_clicks_page, make_combo_row, make_spin_row, make_switch_row,
} from '../extension/ui/settings/prefs_pages.js';

const BANNED_STEMS = new Set([
    'util', 'utils', 'lib', 'helper', 'helpers', 'common', 'misc', 'shared', 'base', 'core', 'types', 'mod',
]);
const DECODER = new TextDecoder('utf-8');
const REPO_ROOT = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_path();
const EXT_ROOT = GLib.build_filenamev([REPO_ROOT, 'extension']);

function assert(cond, msg) { if (!cond) throw new Error(`Verification failed: ${msg}`); }

function read_text(path) {
    const [ok, bytes] = GLib.file_get_contents(path);
    assert(ok, `failed to read ${path}`);
    return DECODER.decode(bytes);
}

function walk_repo(dir_path, js_files, dirs) {
    dirs.push(dir_path);
    const enumerator = Gio.File.new_for_path(dir_path).enumerate_children(
        'standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null,
    );
    let info;
    while ((info = enumerator.next_file(null)) !== null) {
        const name = info.get_name();
        if (name.startsWith('.') || name === 'dist' || name === 'target') continue;
        const full = GLib.build_filenamev([dir_path, name]);
        if (info.get_file_type() === Gio.FileType.DIRECTORY) walk_repo(full, js_files, dirs);
        else if (name.endsWith('.js')) js_files.push(full);
    }
    enumerator.close(null);
}

function verify_page_rules_and_lint(js_files, dirs) {
    assert(js_files.length === 12, `expected 12 .js files, found ${js_files.length}`);
    const legacy = [
        'imports.gi', 'imports.ui', 'imports.misc', 'ExtensionUtils',
        'Meta.LaterType', 'Clutter.Container', 'add_actor', 'remove_actor',
    ];
    for (const file of js_files) {
        const content = read_text(file);
        const lines = content.endsWith('\n') ? content.slice(0, -1).split('\n') : content.split('\n');
        assert(lines.length >= 16 && lines.length <= 256,
            `Page Rule violation: ${file} has ${lines.length} lines (16..=256)`);
        assert(lines[0] === '// SPDX-License-Identifier: GPL-3.0-or-later', `Missing SPDX header in ${file}`);
        assert(lines[1].startsWith('// ') && lines[1].length >= 12,
            `Missing concise module description on line 2 of ${file}`);
        if (file.startsWith(EXT_ROOT)) {
            for (const sym of legacy) {
                assert(!content.includes(sym), `Forbidden legacy symbol '${sym}' in ${file}`);
            }
        }
        for (let idx = 0; idx < lines.length; idx += 1) {
            const raw = lines[idx], ln = idx + 1, code = raw.split('//')[0];
            assert(raw.length <= 200, `Line ${ln} of ${file} exceeds 200 chars (${raw.length})`);
            if (!file.startsWith(EXT_ROOT)) continue;
            assert(!code.trimStart().startsWith('var ') && !code.includes(' var ') && !code.includes('(var '),
                `Forbidden var in ${file}:${ln}`);
            for (let i = 0; i < code.length - 1; i += 1) {
                const prev = i > 0 ? code[i - 1] : '';
                const prev_eq = prev === '=' || prev === '!' || prev === '<' || prev === '>';
                const next_eq = i + 2 < code.length && code[i + 2] === '=';
                assert(!(code[i] === '=' && code[i + 1] === '=' && !prev_eq && !next_eq), `Loose == in ${file}:${ln}`);
                assert(!(code[i] === '!' && code[i + 1] === '=' && !next_eq), `Loose != in ${file}:${ln}`);
            }
        }
    }
    for (const dir_path of dirs) {
        const enumerator = Gio.File.new_for_path(dir_path).enumerate_children(
            'standard::name', Gio.FileQueryInfoFlags.NONE, null,
        );
        const visible = [];
        let info;
        while ((info = enumerator.next_file(null)) !== null) {
            const name = info.get_name();
            if (!name.startsWith('.') && name !== 'dist' && name !== 'target') visible.push(name);
        }
        enumerator.close(null);
        assert(visible.length <= 8,
            `Directory density violation: ${dir_path} has ${visible.length} visible entries (max 8)`);
        for (const name of visible) {
            const stem = (name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name).toLowerCase();
            assert(!BANNED_STEMS.has(stem), `Banned generic name '${name}' in ${dir_path}`);
        }
    }
}

function verify_process_boundaries_and_invariants() {
    const shared = [
        'prefs.js', 'dock/intellihide.js', 'ui/dock_style.js',
        'ui/settings/gsettings.js', 'ui/settings/color.js', 'ui/settings/prefs_pages.js',
    ];
    const compositor_only = ['gi://Meta', 'gi://Clutter', 'gi://St', 'gi://Shell', 'resource:///org/gnome/shell/'];
    for (const rel of shared) {
        for (const raw of read_text(GLib.build_filenamev([EXT_ROOT, rel])).split('\n')) {
            const code = raw.split('//')[0];
            for (const sym of compositor_only) {
                assert(!code.includes(sym), `Process-boundary violation: ${rel} imports '${sym}'`);
            }
        }
    }
    const check_files = [
        'extension.js', 'prefs.js', 'ui/settings/prefs_pages.js', 'dock/dock_manager.js',
        'dock/dock_container.js', 'dock/intellihide.js', 'dock/edge_pressure.js',
        'dock/app_actions.js', 'ui/stylesheet.css', 'metadata.json',
        'schemas/org.gnome.shell.extensions.reef.gschema.xml',
    ];
    const combined = check_files.map((rel) => read_text(GLib.build_filenamev([EXT_ROOT, rel]))).join('\n');
    const reqs = [
        'export default class ReefExtension extends Extension', 'this.manager.destroy()',
        'fillPreferencesWindow(window)', 'Adw.PreferencesPage', 'close-request',
        'Reef Settings & About…', 'openPreferences', 'Star Reef on GitHub',
        'Tuition, Not Coffee — Help send my daughter to college',
        'https://ubermetroid.github.io/tuition-not-coffee',
        'Derived from Dash to Dock', 'ubuntu-dock@ubuntu.com', 'dash-to-dock@micxgx.gmail.com',
        '[reef] autohide-delay', '[reef] intellihide-coalesce', 'extension-state-changed',
        'is_shared_monitor_edge', 'PressureBarrier', 'Meta.Barrier', 'ALL_WINDOWS',
        'FOCUSED_WINDOW', 'MAXIMIZED_ONLY', '"45"', '"50"', '"settings-schema": "org.gnome.shell.extensions.reef"',
        'name="dock-position"', 'name="intellihide-mode"', 'name="border-color-rgba"',
        "'rgb(255,0,0)'", 'Gruvbox Amber', 'Kelp Emerald', 'Ocean Cyan', 'Coral Red',
        'v1.0.3', 'match_preset(', 'Screen Edge &amp; Intelligent Auto-Hide',
        'Support &amp; Community', 'Adw.ActionRow({ title: gesture, subtitle: desc })',
        'this.unload_theme()', 'load_stylesheet(file)', 'sizer.clear_constraints()',
        '.reef-dock-container #dash .dash-item-container .overview-tile',
        'this.dash._background.style = build_dock_background_css', 'center_base_icon(',
    ];
    for (const req of reqs) assert(combined.includes(req), `Missing invariant: ${req}`);
    assert(!combined.includes('Rust installer') && !combined.includes('cargo install'), 'No Rust CLI reference');
    const prefs_pages = read_text(GLib.build_filenamev([EXT_ROOT, 'ui/settings/prefs_pages.js']));
    assert(!/new Gtk\.Label\(\{[^}]*&amp;/s.test(prefs_pages), 'Gtk.Label must not contain raw &amp; without use_markup');
}

async function verify_behavioral_and_gtk_suite() {
    const tmp_dir = GLib.dir_make_tmp('reef-verify-XXXXXX');
    const schema_xml = 'org.gnome.shell.extensions.reef.gschema.xml';
    const dst_xml = Gio.File.new_for_path(GLib.build_filenamev([tmp_dir, schema_xml]));
    Gio.File.new_for_path(GLib.build_filenamev([EXT_ROOT, 'schemas', schema_xml]))
        .copy(dst_xml, Gio.FileCopyFlags.OVERWRITE, null, null);
    assert(Gio.Subprocess.new(['glib-compile-schemas', tmp_dir], Gio.SubprocessFlags.NONE).wait_check(null),
        'glib-compile-schemas');
    const src = Gio.SettingsSchemaSource.new_from_directory(tmp_dir, Gio.SettingsSchemaSource.get_default(), false);
    const ext_settings = new Gio.Settings({
        settings_schema: src.lookup('org.gnome.shell.extensions.reef', true),
        backend: Gio.memory_settings_backend_new(),
    });
    const s = new ExtensionSettings(ext_settings);

    assert(s.dock_position() === 'BOTTOM' && !s.is_vertical() && !s.dock_fixed() && s.intellihide(), 'defaults');
    assert(s.intellihide_mode() === 'ALL_WINDOWS' && s.dash_max_icon_size() === 48 && s.border_width() === 2, 'sizes');
    assert(DOCK_POSITIONS.length === 4 && INTELLIHIDE_MODES.length === 3 && BORDER_PRESETS.length === 4, 'enums');
    assert(CLICK_ACTIONS.length === 3 && MIDDLE_CLICK_ACTIONS.length === 3 && SCROLL_ACTIONS.length === 3, 'actions');
    assert(typeof make_switch_row === 'function' && typeof make_spin_row === 'function' && typeof make_combo_row === 'function', 'shared builders');

    s.set_dock_position('LEFT');
    assert(s.dock_position() === 'LEFT' && s.is_vertical(), 'vertical left');
    s.set_dock_position('INVALID');
    assert(s.dock_position() === 'BOTTOM' && !s.is_vertical(), 'invalid position fallback');
    s.set_dash_max_icon_size(999);
    assert(s.dash_max_icon_size() === 64, 'clamp max icon size');
    s.set_dash_max_icon_size(10);
    assert(s.dash_max_icon_size() === 24, 'clamp min icon size');
    s.set_border_color_rgba('#2ec27e');
    assert(s.border_color_rgba() === 'rgba(46, 194, 126, 1)', 'hex color normalization');
    s.reset_defaults();
    assert(s.dash_max_icon_size() === 48 && s.border_color_rgba() === 'rgba(255, 0, 0, 1)', 'reset defaults');
    const mock_store = {};
    const mock_s = new ExtensionSettings({
        settings_schema: { has_key: () => true },
        get_boolean: (k) => mock_store[k] ?? false, set_boolean: (k, v) => { mock_store[k] = v; },
        get_uint: (k) => mock_store[k] ?? 0, set_uint: (k, v) => { mock_store[k] = v; },
        get_string: (k) => mock_store[k] ?? '', set_string: (k, v) => { mock_store[k] = v; },
    });
    mock_s.reset_defaults();
    assert(mock_s.intellihide() && mock_s.dash_max_icon_size() === 48 && mock_s.dock_position() === 'BOTTOM', 'mock reset fallback');

    const c_short = parse_rgba('#f00');
    assert(c_short.red === 255 && c_short.green === 0 && c_short.blue === 0 && is_dark_rgba({ red: 10, green: 10, blue: 10 }), 'color parse');
    assert(text_color_for_css('rgb(0,0,0)') === '#ffffff' && format_rgba(c_short) === 'rgba(255, 0, 0, 1)', 'contrast');

    const m_pill = compute_dock_margins('BOTTOM', false), m_panel = compute_dock_margins('BOTTOM', true);
    assert(m_pill.bottom === DOCK_EDGE_MARGIN && m_pill.top === 0 && m_panel.bottom === 0, 'dock margins');
    const mon_l = { x: 0, y: 0, width: 1920, height: 1080 }, mon_r = { x: 1920, y: 0, width: 1920, height: 1080 };
    const mon_b = { x: 0, y: 1080, width: 1920, height: 1080 }, mon_diag = { x: 1920, y: 1080, width: 1920, height: 1080 };
    assert(is_shared_monitor_edge(mon_l, [mon_l, mon_r], 'RIGHT') && !is_shared_monitor_edge(mon_l, [mon_l, mon_diag], 'RIGHT'), 'shared H / diag');
    assert(is_shared_monitor_edge(mon_r, [mon_l, mon_r], 'LEFT') && is_shared_monitor_edge(mon_l, [mon_l, mon_b], 'BOTTOM'), 'shared V/H2 edge');
    assert(is_shared_monitor_edge(mon_b, [mon_l, mon_b], 'TOP') && !is_shared_monitor_edge(mon_l, [mon_l, mon_diag], 'BOTTOM'), 'shared TOP / diag');
    assert(!is_shared_monitor_edge(null, [mon_l], 'TOP') && EDGE_GEOMETRY.TOP.slide_dy === -1 && EDGE_GEOMETRY.RIGHT.slide_dx === 1, 'edge geometry');
    assert(EDGE_GEOMETRY.LEFT.box(mon_l, 64, 400, 0, 340, { left: 6 }).x === 6, 'edge geometry box');
    const css = build_dock_background_css(s);
    assert(css.includes('border: 2px solid rgba(255, 0, 0, 1);') && css.includes('border-radius: 16px;'), 'pill css');
    const sep_h = build_separator_css(false, 48, true), sep_v = build_separator_css(true, 48, false);
    assert(sep_h.includes('width: 1px;') && sep_v.includes('height: 1px;'), 'separator css');

    const dock_box = { x: 640, y: 1006, width: 640, height: 68 };
    const seahorse_cols = [
        { rect: { x: 6, y: 38, width: 632, height: 1036 }, visible: true, minimized: false, focused: true, app_id: 'a', maximized: false },
        { rect: { x: 644, y: 38, width: 632, height: 1036 }, visible: true, minimized: false, focused: false, app_id: 'b', maximized: false },
        { rect: { x: 1282, y: 38, width: 632, height: 1036 }, visible: true, minimized: false, focused: false, app_id: 'c', maximized: false },
    ];
    assert(boxes_overlap(dock_box, seahorse_cols[1].rect) && !boxes_overlap(dock_box, { x: 0, y: 0, width: 100, height: 100 }), 'box overlap');
    assert(evaluate_intellihide_overlap(dock_box, seahorse_cols, 'ALL_WINDOWS', 'a') === true, 'Kelp Seahorse middle column triggers ALL_WINDOWS dodge');
    assert(evaluate_intellihide_overlap(dock_box, seahorse_cols, 'FOCUSED_WINDOW', 'a') === false, 'unfocused middle column ignored in FOCUSED_WINDOW mode');
    assert(evaluate_intellihide_overlap(dock_box, seahorse_cols, 'MAXIMIZED_ONLY', 'a') === false, 'unmaximized columns ignored in MAXIMIZED_ONLY mode');
    assert(is_window_maximized_or_fullscreen({ is_maximized: () => 3 }) && MAX_TRACKED_WINDOWS === 128, 'maximized shim');
    assert(is_candidate_window_type(0) && is_candidate_window_type(3) && is_candidate_window_type(4) && !is_candidate_window_type(1), 'candidate window types');

    try {
        const Gtk = (await import('gi://Gtk?version=4.0')).default;
        const Adw = (await import('gi://Adw?version=1')).default;
        if (Gtk.init_check()) {
            Adw.init();
            const signals = [], p1 = build_clicks_page(ext_settings, s, signals), p2 = build_about_page();
            assert(p1.get_title() === 'Clicks & Scroll' && p2.get_title() === 'About & Support', 'GTK4 pages built');
            const walk_labels = (w) => {
                if (!w) return;
                if (w instanceof Gtk.Label) assert(!w.get_text().includes('&amp;'), `Unescaped &amp;: ${w.get_text()}`);
                for (let c = w.get_first_child?.(); c; c = c.get_next_sibling?.()) walk_labels(c);
            };
            walk_labels(p1); walk_labels(p2);
            for (const [obj, sig] of signals) obj.disconnect(sig);
        }
    } catch (e) { if (String(e).includes('Verification failed')) throw e; }

    dst_xml.delete(null);
    Gio.File.new_for_path(GLib.build_filenamev([tmp_dir, 'gschemas.compiled'])).delete(null);
    Gio.File.new_for_path(tmp_dir).delete(null);
}

const js_files = [], dirs = [];
walk_repo(REPO_ROOT, js_files, dirs);
verify_page_rules_and_lint(js_files, dirs);
verify_process_boundaries_and_invariants();
await verify_behavioral_and_gtk_suite();
print(`OK: verified ${js_files.length} JS pages across ${dirs.length} directories and all headless behavioral suites.`);

