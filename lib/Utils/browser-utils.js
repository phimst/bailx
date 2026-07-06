"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPlatformId = exports.Browsers = void 0;
const os_1 = require("os");
const index_js_1 = require("../../WAProto/index.js");
const PLATFORM_MAP = {
    aix: 'AIX',
    darwin: 'Mac OS',
    win32: 'Windows',
    android: 'Android',
    freebsd: 'FreeBSD',
    openbsd: 'OpenBSD',
    sunos: 'Solaris',
    linux: undefined,
    haiku: undefined,
    cygwin: undefined,
    netbsd: undefined
};
exports.Browsers = {
    ubuntu: browser => ['Ubuntu', browser, '22.04.4'],
    macOS: browser => ['Mac OS', browser, '14.4.1'],
    baileys: browser => ['Baileys', browser, '6.5.0'],
    windows: browser => ['Windows', browser, '10.0.22631'],
    /** The appropriate browser based on your OS & release */
    appropriate: browser => [PLATFORM_MAP[(0, os_1.platform)()] || 'Ubuntu', browser, (0, os_1.release)()]
};
const getPlatformId = (browser) => {
    const platformType = index_js_1.proto.DeviceProps.PlatformType[browser.toUpperCase()];
    return platformType ? platformType.toString() : '1'; //chrome
};
exports.getPlatformId = getPlatformId;
