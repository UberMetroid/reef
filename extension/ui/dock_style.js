// SPDX-License-Identifier: GPL-3.0-or-later
// Inline CSS generator and margin calculator for Reef floating pill and panel dock modes.

import { format_rgba, parse_rgba } from './settings/color.js';

export const DOCK_EDGE_MARGIN = 6;

export function compute_dock_margins(position, extend_height) {
    if (extend_height) {
        return { top: 0, right: 0, bottom: 0, left: 0 };
    }
    return {
        top: position === 'TOP' ? DOCK_EDGE_MARGIN : 0,
        right: position === 'RIGHT' ? DOCK_EDGE_MARGIN : 0,
        bottom: position === 'BOTTOM' ? DOCK_EDGE_MARGIN : 0,
        left: position === 'LEFT' ? DOCK_EDGE_MARGIN : 0,
    };
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
