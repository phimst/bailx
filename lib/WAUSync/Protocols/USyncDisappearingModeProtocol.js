"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.USyncDisappearingModeProtocol = void 0;
const index_js_1 = require("../../WABinary/index.js");
class USyncDisappearingModeProtocol {
    constructor() {
        this.name = 'disappearing_mode';
    }
    getQueryElement() {
        return {
            tag: 'disappearing_mode',
            attrs: {}
        };
    }
    getUserElement() {
        return null;
    }
    parser(node) {
        if (node.tag === 'disappearing_mode') {
            (0, index_js_1.assertNodeErrorFree)(node);
            const duration = +node?.attrs.duration;
            const setAt = new Date(+(node?.attrs.t || 0) * 1000);
            return {
                duration,
                setAt
            };
        }
    }
}
exports.USyncDisappearingModeProtocol = USyncDisappearingModeProtocol;
