// SPDX-License-Identifier: GPL-3.0-or-later
// GNOME Shell extension entrypoint (ReefExtension extends Extension) managing enable/disable.

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { DockManager } from './dock/dock_manager.js';

export default class ReefExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this.manager = null;
    }

    enable() {
        if (this.manager !== null) return;
        this.manager = new DockManager(this);
    }

    disable() {
        if (this.manager !== null) {
            this.manager.destroy();
            this.manager = null;
        }
    }
}
