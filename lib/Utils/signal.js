"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNextPreKeysNode = exports.getNextPreKeys = exports.extractDeviceJids = exports.parseAndInjectE2ESessions = exports.extractE2ESessionFromRetryReceipt = exports.xmppPreKey = exports.xmppSignedPreKey = exports.generateOrGetPreKeys = exports.getPreKeys = exports.createSignalIdentity = void 0;
const index_js_1 = require("../Defaults/index.js");
const index_js_2 = require("../WABinary/index.js");
const crypto_js_1 = require("./crypto.js");
const generics_js_1 = require("./generics.js");
function chunk(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}
const createSignalIdentity = (wid, accountSignatureKey) => {
    return {
        identifier: { name: wid, deviceId: 0 },
        identifierKey: (0, crypto_js_1.generateSignalPubKey)(accountSignatureKey)
    };
};
exports.createSignalIdentity = createSignalIdentity;
const getPreKeys = async ({ get }, min, limit) => {
    const idList = [];
    for (let id = min; id < limit; id++) {
        idList.push(id.toString());
    }
    return get('pre-key', idList);
};
exports.getPreKeys = getPreKeys;
const generateOrGetPreKeys = (creds, range) => {
    const avaliable = creds.nextPreKeyId - creds.firstUnuploadedPreKeyId;
    const remaining = range - avaliable;
    const lastPreKeyId = creds.nextPreKeyId + remaining - 1;
    const newPreKeys = {};
    if (remaining > 0) {
        for (let i = creds.nextPreKeyId; i <= lastPreKeyId; i++) {
            newPreKeys[i] = crypto_js_1.Curve.generateKeyPair();
        }
    }
    return {
        newPreKeys,
        lastPreKeyId,
        preKeysRange: [creds.firstUnuploadedPreKeyId, range]
    };
};
exports.generateOrGetPreKeys = generateOrGetPreKeys;
const xmppSignedPreKey = (key) => ({
    tag: 'skey',
    attrs: {},
    content: [
        { tag: 'id', attrs: {}, content: (0, generics_js_1.encodeBigEndian)(key.keyId, 3) },
        { tag: 'value', attrs: {}, content: key.keyPair.public },
        { tag: 'signature', attrs: {}, content: key.signature }
    ]
});
exports.xmppSignedPreKey = xmppSignedPreKey;
const xmppPreKey = (pair, id) => ({
    tag: 'key',
    attrs: {},
    content: [
        { tag: 'id', attrs: {}, content: (0, generics_js_1.encodeBigEndian)(id, 3) },
        { tag: 'value', attrs: {}, content: pair.public }
    ]
});
exports.xmppPreKey = xmppPreKey;
const isValidUInt = (n) => typeof n === 'number' && Number.isInteger(n);
const extractE2ESessionFromRetryReceipt = (receipt) => {
    const keysNode = (0, index_js_2.getBinaryNodeChild)(receipt, 'keys');
    if (!keysNode)
        return null;
    const typeBuf = (0, index_js_2.getBinaryNodeChildBuffer)(keysNode, 'type');
    if (!typeBuf || typeBuf.length !== 1 || typeBuf[0] !== index_js_1.KEY_BUNDLE_TYPE[0])
        return null;
    const identity = (0, index_js_2.getBinaryNodeChildBuffer)(keysNode, 'identity');
    const skey = (0, index_js_2.getBinaryNodeChild)(keysNode, 'skey');
    if (!identity || identity.length !== 32 || !skey)
        return null;
    const registrationId = (0, index_js_2.getBinaryNodeChildUInt)(receipt, 'registration', 4);
    if (!isValidUInt(registrationId))
        return null;
    const signedPubKey = (0, index_js_2.getBinaryNodeChildBuffer)(skey, 'value');
    const signedSig = (0, index_js_2.getBinaryNodeChildBuffer)(skey, 'signature');
    const signedKeyId = (0, index_js_2.getBinaryNodeChildUInt)(skey, 'id', 3);
    if (!signedPubKey || signedPubKey.length !== 32 || !signedSig || !isValidUInt(signedKeyId)) {
        return null;
    }
    const preKeyNode = (0, index_js_2.getBinaryNodeChild)(keysNode, 'key');
    let preKey;
    if (preKeyNode) {
        const preKeyPub = (0, index_js_2.getBinaryNodeChildBuffer)(preKeyNode, 'value');
        const preKeyId = (0, index_js_2.getBinaryNodeChildUInt)(preKeyNode, 'id', 3);
        if (!preKeyPub || preKeyPub.length !== 32 || !isValidUInt(preKeyId)) {
            return null;
        }
        preKey = { keyId: preKeyId, publicKey: (0, crypto_js_1.generateSignalPubKey)(preKeyPub) };
    }
    return {
        registrationId,
        identityKey: (0, crypto_js_1.generateSignalPubKey)(identity),
        signedPreKey: {
            keyId: signedKeyId,
            publicKey: (0, crypto_js_1.generateSignalPubKey)(signedPubKey),
            signature: signedSig
        },
        preKey
    };
};
exports.extractE2ESessionFromRetryReceipt = extractE2ESessionFromRetryReceipt;
const parseAndInjectE2ESessions = async (node, repository) => {
    const extractKey = (key) => key
        ? {
            keyId: (0, index_js_2.getBinaryNodeChildUInt)(key, 'id', 3),
            publicKey: (0, crypto_js_1.generateSignalPubKey)((0, index_js_2.getBinaryNodeChildBuffer)(key, 'value')),
            signature: (0, index_js_2.getBinaryNodeChildBuffer)(key, 'signature')
        }
        : undefined;
    const nodes = (0, index_js_2.getBinaryNodeChildren)((0, index_js_2.getBinaryNodeChild)(node, 'list'), 'user');
    for (const node of nodes) {
        (0, index_js_2.assertNodeErrorFree)(node);
    }
    // Most of the work in repository.injectE2ESession is CPU intensive, not IO
    // So Promise.all doesn't really help here,
    // but blocks even loop if we're using it inside keys.transaction, and it makes it "sync" actually
    // This way we chunk it in smaller parts and between those parts we can yield to the event loop
    // It's rare case when you need to E2E sessions for so many users, but it's possible
    const chunkSize = 100;
    const chunks = chunk(nodes, chunkSize);
    for (const nodesChunk of chunks) {
        for (const node of nodesChunk) {
            const signedKey = (0, index_js_2.getBinaryNodeChild)(node, 'skey');
            const key = (0, index_js_2.getBinaryNodeChild)(node, 'key');
            const identity = (0, index_js_2.getBinaryNodeChildBuffer)(node, 'identity');
            const jid = node.attrs.jid;
            const registrationId = (0, index_js_2.getBinaryNodeChildUInt)(node, 'registration', 4);
            await repository.injectE2ESession({
                jid,
                session: {
                    registrationId: registrationId,
                    identityKey: (0, crypto_js_1.generateSignalPubKey)(identity),
                    signedPreKey: extractKey(signedKey),
                    preKey: extractKey(key)
                }
            });
        }
    }
};
exports.parseAndInjectE2ESessions = parseAndInjectE2ESessions;
const extractDeviceJids = (result, myJid, myLid, excludeZeroDevices) => {
    const { user: myUser, device: myDevice } = (0, index_js_2.jidDecode)(myJid);
    const extracted = [];
    for (const userResult of result) {
        const { devices, id } = userResult;
        const decoded = (0, index_js_2.jidDecode)(id), { user, server } = decoded;
        let { domainType } = decoded;
        const deviceList = devices?.deviceList;
        if (!Array.isArray(deviceList))
            continue;
        for (const { id: device, keyIndex, isHosted } of deviceList) {
            if ((!excludeZeroDevices || device !== 0) && // if zero devices are not-excluded, or device is non zero
                ((myUser !== user && myLid !== user) || myDevice !== device) && // either different user or if me user, not this device
                (device === 0 || !!keyIndex) // ensure that "key-index" is specified for "non-zero" devices, produces a bad req otherwise
            ) {
                if (isHosted) {
                    domainType = domainType === index_js_2.WAJIDDomains.LID ? index_js_2.WAJIDDomains.HOSTED_LID : index_js_2.WAJIDDomains.HOSTED;
                }
                extracted.push({
                    user,
                    device,
                    domainType,
                    server: (0, index_js_2.getServerFromDomainType)(server, domainType)
                });
            }
        }
    }
    return extracted;
};
exports.extractDeviceJids = extractDeviceJids;
/**
 * get the next N keys for upload or processing
 * @param count number of pre-keys to get or generate
 */
const getNextPreKeys = async ({ creds, keys }, count) => {
    const { newPreKeys, lastPreKeyId, preKeysRange } = (0, exports.generateOrGetPreKeys)(creds, count);
    const update = {
        nextPreKeyId: Math.max(lastPreKeyId + 1, creds.nextPreKeyId),
        firstUnuploadedPreKeyId: Math.max(creds.firstUnuploadedPreKeyId, lastPreKeyId + 1)
    };
    await keys.set({ 'pre-key': newPreKeys });
    const preKeys = await (0, exports.getPreKeys)(keys, preKeysRange[0], preKeysRange[0] + preKeysRange[1]);
    return { update, preKeys };
};
exports.getNextPreKeys = getNextPreKeys;
const getNextPreKeysNode = async (state, count) => {
    const { creds } = state;
    const { update, preKeys } = await (0, exports.getNextPreKeys)(state, count);
    const node = {
        tag: 'iq',
        attrs: {
            xmlns: 'encrypt',
            type: 'set',
            to: index_js_2.S_WHATSAPP_NET
        },
        content: [
            { tag: 'registration', attrs: {}, content: (0, generics_js_1.encodeBigEndian)(creds.registrationId) },
            { tag: 'type', attrs: {}, content: index_js_1.KEY_BUNDLE_TYPE },
            { tag: 'identity', attrs: {}, content: creds.signedIdentityKey.public },
            { tag: 'list', attrs: {}, content: Object.keys(preKeys).map(k => (0, exports.xmppPreKey)(preKeys[+k], +k)) },
            (0, exports.xmppSignedPreKey)(creds.signedPreKey)
        ]
    };
    return { update, node };
};
exports.getNextPreKeysNode = getNextPreKeysNode;
