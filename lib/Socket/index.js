"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("../Defaults/index.js");
const communities_js_1 = require("./communities.js");
const risk_score_js_1 = require("../Utils/risk-score.js");
const adaptive_throttle_js_1 = require("../Utils/adaptive-throttle.js");
const session_health_js_1 = require("../Utils/session-health.js");
const donate_handler_js_1 = require("../Utils/donate-handler.js");
const jid_utils_js_1 = require("../WABinary/jid-utils.js");

// export the last socket layer
const makeWASocket = (config) => {
    const newConfig = {
        ...index_js_1.DEFAULT_CONNECTION_CONFIG,
        ...config
    };
    const sock = (0, communities_js_1.makeCommunitiesSocket)(newConfig);

    // --- seraphbail: anti-ban instrumentation -------------------------------
    const riskScore = (0, risk_score_js_1.createRiskScore)(newConfig.riskScoreOptions);
    const throttle = (0, adaptive_throttle_js_1.createAdaptiveThrottle)(newConfig.adaptiveThrottleOptions);
    const sessionHealth = (0, session_health_js_1.createSessionHealth)();

    const originalSendMessage = sock.sendMessage.bind(sock);
    sock.sendMessage = async (jid, content, options) => {
        if (newConfig.enableAdaptiveThrottle !== false) {
            const { level } = riskScore.getScore();
            await throttle.wait(level);
        }
        let isGroup = false;
        try {
            isGroup = (0, jid_utils_js_1.isJidGroup)(jid);
        } catch (_) { }
        try {
            const result = await originalSendMessage(jid, content, options);
            riskScore.recordSend({ isGroup, success: true });
            throttle.recordResult({ success: true });
            sessionHealth.recordSend(true);
            return result;
        } catch (err) {
            const statusCode = err?.output?.statusCode;
            riskScore.recordSend({ isGroup, success: false });
            throttle.recordResult({ success: false, statusCode });
            sessionHealth.recordSend(false, statusCode);
            throw err;
        }
    };

    sock.ev.on("connection.update", update => {
        if (update.connection === "close") {
            const statusCode = update.lastDisconnect?.error?.output?.statusCode;
            sessionHealth.recordReconnect(statusCode);
        }
    });

    sock.getRiskScore = () => riskScore.getScore();
    sock.getSessionHealth = () => sessionHealth.getHealth();
    sock.getAdaptiveDelay = riskLevel => throttle.getDelay(riskLevel ?? riskScore.getScore().level);

    // --- seraphbail: opt-in donate command -----------------------------------
    (0, donate_handler_js_1.attachDonateCommand)(sock, newConfig, sock.logger);

    return sock;
};
exports.default = makeWASocket;
