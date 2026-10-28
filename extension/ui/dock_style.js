// SPDX-License-Identifier: GPL-3.0-or-later
// Inline CSS generator and margin calculator for Reef floating pill and panel dock modes.

import { format_rgba, parse_rgba } from './settings/color.js';

export const DOCK_EDGE_MARGIN = 6;

export const EDGE_GEOMETRY = Object.freeze({
    BOTTOM: Object.freeze({
        margin_key: 'bottom', is_vert: false, slide_dx: 0, slide_dy: 1,
        box: (m, bw, bh, cx, _cy, mg) => ({ x: cx, y: m.y + m.height - bh - mg.bottom, width: bw, height: bh }),
        hit: (m, b, p) => ({ x1: b.x - p, x2: b.x + b.width + p, y1: b.y - p, y2: m.y + m.height }),
        strip: (m, t) => ({ x: m.x, y: m.y + m.height - t, width: m.width, height: t }),
    }),
});

export function compute_dock_margins(_position, extend_height, margin_px = DOCK_EDGE_MARGIN) {
    const num = Number(margin_px ?? DOCK_EDGE_MARGIN);
    const gap = Math.max(0, Math.min(24, Math.round(Number.isFinite(num) ? num : DOCK_EDGE_MARGIN)));
    return { top: 0, right: 0, bottom: extend_height ? 0 : gap, left: 0 };
}

export function is_shared_monitor_edge(mon, monitors, _pos = 'BOTTOM') {
    if (!mon || !Array.isArray(monitors) || monitors.length <= 1) return false;
    for (const other of monitors) {
        if (!other || other === mon) continue;
        if (other.x === mon.x && other.y === mon.y && other.width === mon.width && other.height === mon.height) continue;
        if (Math.abs(other.y - (mon.y + mon.height)) <= 1 && mon.x < other.x + other.width && mon.x + mon.width > other.x) {
            return true;
        }
    }
    return false;
}

export function build_dock_background_css(settings) {
    const is_dark = settings.is_dark();
    const opacity = Math.max(0, Math.min(100, Number(settings.background_opacity()) || 0)) / 100;
    const bg_rgb = is_dark ? '24, 24, 28' : '246, 246, 250';
    const bg_alpha = Number(opacity.toFixed(2));
    const extend = Boolean(settings.extend_height());
    const show_bdr = Boolean(settings.show_border());
    const bdr_width = show_bdr ? Math.max(0, Math.min(8, Number(settings.border_width()) | 0)) : 0;
    const bdr_radius = extend ? 0 : Math.max(0, Math.min(32, Number(settings.border_radius()) | 0));
    const bdr_color = format_rgba(parse_rgba(settings.border_color_rgba()));

    const rules = [
        `background-color: rgba(${bg_rgb}, ${bg_alpha});`,
        `border-radius: ${bdr_radius}px;`,
    ];

    if (bdr_width > 0) {
        rules.push(`border: ${bdr_width}px solid ${bdr_color};`);
    } else {
        rules.push('border: 0px solid transparent;');
    }

    rules.push('box-shadow: 0 4px 14px rgba(0, 0, 0, 0.32);');
    return rules.join(' ');
}

export function build_running_dot_css(settings, win_count) {
    const raw = Number(win_count);
    const count = Number.isFinite(raw) ? Math.floor(raw) : 0;
    if (count <= 0) return '';
    const color = format_rgba(parse_rgba(settings.border_color_rgba()));
    const width = count >= 2 ? 14 : 6;
    return `background-color: ${color}; width: ${width}px; height: 6px; border-radius: 99px; offset-y: 0px; margin-bottom: 1px;`;
}

export function build_separator_css(is_vertical, icon_size, is_dark) {
    const color = is_dark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.22)';
    const span = Math.max(16, Math.round((Number(icon_size) || 48) * 0.65));
    if (is_vertical) {
        return `background-color: ${color}; height: 1px; width: ${span}px; margin: 4px 0px;`;
    }
    return `background-color: ${color}; width: 1px; height: ${span}px; margin: 0px 4px;`;
}
