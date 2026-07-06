"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPairingQRData = exports.getCompanionPlatformId = exports.getCompanionWebClientType = exports.CompanionWebClientType = void 0;
(function (CompanionWebClientType) {
    CompanionWebClientType[CompanionWebClientType["UNKNOWN"] = 0] = "UNKNOWN";
    CompanionWebClientType[CompanionWebClientType["CHROME"] = 1] = "CHROME";
    CompanionWebClientType[CompanionWebClientType["EDGE"] = 2] = "EDGE";
    CompanionWebClientType[CompanionWebClientType["FIREFOX"] = 3] = "FIREFOX";
    CompanionWebClientType[CompanionWebClientType["IE"] = 4] = "IE";
    CompanionWebClientType[CompanionWebClientType["OPERA"] = 5] = "OPERA";
    CompanionWebClientType[CompanionWebClientType["SAFARI"] = 6] = "SAFARI";
    CompanionWebClientType[CompanionWebClientType["ELECTRON"] = 7] = "ELECTRON";
    CompanionWebClientType[CompanionWebClientType["UWP"] = 8] = "UWP";
    CompanionWebClientType[CompanionWebClientType["OTHER_WEB_CLIENT"] = 9] = "OTHER_WEB_CLIENT";
})(exports.CompanionWebClientType || (exports.CompanionWebClientType = {}));
const BROWSER_TO_COMPANION_WEB_CLIENT = {
    Chrome: exports.CompanionWebClientType.CHROME,
    Edge: exports.CompanionWebClientType.EDGE,
    Firefox: exports.CompanionWebClientType.FIREFOX,
    IE: exports.CompanionWebClientType.IE,
    Opera: exports.CompanionWebClientType.OPERA,
    Safari: exports.CompanionWebClientType.SAFARI
};
const getCompanionWebClientType = ([os, browserName]) => {
    if (browserName === 'Desktop') {
        return os === 'Windows' ? exports.CompanionWebClientType.UWP : exports.CompanionWebClientType.ELECTRON;
    }
    return BROWSER_TO_COMPANION_WEB_CLIENT[browserName] || exports.CompanionWebClientType.OTHER_WEB_CLIENT;
};
exports.getCompanionWebClientType = getCompanionWebClientType;
const getCompanionPlatformId = (browser) => {
    return (0, exports.getCompanionWebClientType)(browser).toString();
};
exports.getCompanionPlatformId = getCompanionPlatformId;
const buildPairingQRData = (ref, noiseKeyB64, identityKeyB64, advB64, browser) => {
    return ('https://wa.me/settings/linked_devices#' +
        [ref, noiseKeyB64, identityKeyB64, advB64, (0, exports.getCompanionPlatformId)(browser)].join(','));
};
exports.buildPairingQRData = buildPairingQRData;
