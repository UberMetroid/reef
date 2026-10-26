// SPDX-License-Identifier: GPL-3.0-or-later
// Inline CSS generator and margin calculator for Reef floating pill and panel dock modes.

import { format_rgba, parse_rgba } from './settings/color.js';

export const DOCK_EDGE_MARGIN = 6;

export const EDGE_GEOMETRY = Object.freeze({
    TOP: Object.freeze({
        margin_key: 'top', is_vert: false, slide_dx: 0, slide_dy: -1,
        box: (m, bw, bh, cx, _cy, mg) => ({ x: cx, y: m.y + mg.top, width: bw, height: bh }),
        hit: (m, b, p) => ({ x1: b.x - p, x2: b.x + b.width + p, y1: m.y, y2: b.y + b.height + p }),
        strip: (m, t) => ({ x: m.x, y: m.y, width: m.width, height: t }),
    }),
    BOTTOM: Object.freeze({
        margin_key: 'bottom', is_vert: false, slide_dx: 0, slide_dy: 1,
        box: (m, bw, bh, cx, _cy, mg) => ({ x: cx, y: m.y + m.height - bh - mg.bottom, width: bw, height: bh }),
        hit: (m, b, p) => ({ x1: b.x - p, x2: b.x + b.width + p, y1: b.y - p, y2: m.y + m.height }),
        strip: (m, t) => ({ x: m.x, y: m.y + m.height - t, width: m.width, height: t }),
    }),
    LEFT: Object.freeze({
        margin_key: 'left', is_vert: true, slide_dx: -1, slide_dy: 0,
        box: (m, bw, bh, _cx, cy, mg) => ({ x: m.x + mg.left, y: cy, width: bw, height: bh }),
        hit: (m, b, p) => ({ x1: m.x, x2: b.x + b.width + p, y1: b.y - p, y2: b.y + b.height + p }),
        strip: (m, t) => ({ x: m.x, y: m.y, width: t, height: m.height }),
    }),
    RIGHT: Object.freeze({
        margin_key: 'right', is_vert: true, slide_dx: 1, slide_dy: 0,
        box: (m, bw, bh, _cx, cy, mg) => ({ x: m.x + m.width - bw - mg.right, y: cy, width: bw, height: bh }),
        hit: (m, b, p) => ({ x1: b.x - p, x2: m.x + m.width, y1: b.y - p, y2: b.y + b.height + p }),
        strip: (m, t) => ({ x: m.x + m.width - t, y: m.y, width: t, height: m.height }),
    }),
});

export function compute_dock_margins(position, extend_height) {
    const out = { top: 0, right: 0, bottom: 0, left: 0 };
    if (!extend_height) {
        const edge = EDGE_GEOMETRY[position] ?? EDGE_GEOMETRY.BOTTOM;
        out[edge.margin_key] = DOCK_EDGE_MARGIN;
    }
    return out;
}

const SHARED_EDGE_CHECK = Object.freeze({
    TOP: (a, b) => Math.abs((b.y + b.height) - a.y) <= 1 && a.x < b.x + b.width && a.x + a.width > b.x,
    BOTTOM: (a, b) => Math.abs(b.y - (a.y + a.height)) <= 1 && a.x < b.x + b.width && a.x + a.width > b.x,
    LEFT: (a, b) => Math.abs((b.x + b.width) - a.x) <= 1 && a.y < b.y + b.height && a.y + a.height > b.y,
    RIGHT: (a, b) => Math.abs(b.x - (a.x + a.width)) <= 1 && a.y < b.y + b.height && a.y + a.height > b.y,
});

export function is_shared_monitor_edge(mon, monitors, pos) {
    if (!mon || !Array.isArray(monitors) || monitors.length <= 1) return false;
    const check = SHARED_EDGE_CHECK[pos] ?? SHARED_EDGE_CHECK.BOTTOM;
    for (const other of monitors) {
        if (!other || other === mon) continue;
        if (other.x === mon.x && other.y === mon.y && other.width === mon.width && other.height === mon.height) continue;
        if (check(mon, other)) return true;
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

export function build_separator_css(is_vertical, icon_size, is_dark) {
    const color = is_dark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.22)';
    const span = Math.max(16, Math.round((Number(icon_size) || 48) * 0.65));
    if (is_vertical) {
        return `background-color: ${color}; height: 1px; width: ${span}px; margin: 4px 0px;`;
    }
    return `background-color: ${color}; width: 1px; height: ${span}px; margin: 0px 4px;`;
}
