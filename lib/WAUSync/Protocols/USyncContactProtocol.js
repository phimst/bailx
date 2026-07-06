"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.USyncContactProtocol = void 0;
const index_js_1 = require("../../WABinary/index.js");
const USyncUser_js_1 = require("../USyncUser.js");
class USyncContactProtocol {
    constructor() {
        this.name = 'contact';
    }
    getQueryElement() {
        return {
            tag: 'contact',
            attrs: {}
        };
    }
    getUserElement(user) {
        if (user.phone) {
            return {
                tag: 'contact',
                attrs: {},
                content: user.phone
            };
        }
        if (user.username) {
            return {
                tag: 'contact',
                attrs: {
                    username: user.username,
                    ...(user.usernameKey ? { pin: user.usernameKey } : {}),
                    ...(user.lid ? { lid: user.lid } : {})
                }
            };
        }
        if (user.type) {
            return {
                tag: 'contact',
                attrs: {
                    type: user.type
                }
            };
        }
        return {
            tag: 'contact',
            attrs: {}
        };
    }
    parser(node) {
        if (node.tag === 'contact') {
            (0, index_js_1.assertNodeErrorFree)(node);
            return node?.attrs?.type === 'in';
        }
        return false;
    }
}
exports.USyncContactProtocol = USyncContactProtocol;
