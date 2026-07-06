"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decryptMessageNode = exports.extractAddressingContext = exports.SERVER_ERROR_CODES = exports.NACK_REASONS = exports.DECRYPTION_RETRY_CONFIG = exports.ACCOUNT_RESTRICTED_TEXT = exports.MISSING_KEYS_ERROR_TEXT = exports.NO_MESSAGE_FOUND_ERROR_TEXT = exports.getDecryptionJid = void 0;
exports.decodeMessageNode = decodeMessageNode;
const boom_1 = require("@hapi/boom");
const index_js_1 = require("../../WAProto/index.js");
const index_js_2 = require("../WABinary/index.js");
const generics_js_1 = require("./generics.js");
const getDecryptionJid = async (sender, repository) => {
    if ((0, index_js_2.isLidUser)(sender) || (0, index_js_2.isHostedLidUser)(sender)) {
        return sender;
    }
    const mapped = await repository.lidMapping.getLIDForPN(sender);
    return mapped || sender;
};
exports.getDecryptionJid = getDecryptionJid;
const storeMappingFromEnvelope = async (stanza, sender, repository, decryptionJid, logger) => {
    // TODO: Handle hosted IDs
    const { senderAlt } = (0, exports.extractAddressingContext)(stanza);
    if (senderAlt && (0, index_js_2.isLidUser)(senderAlt) && (0, index_js_2.isPnUser)(sender) && decryptionJid === sender) {
        try {
            await repository.lidMapping.storeLIDPNMappings([{ lid: senderAlt, pn: sender }]);
            await repository.migrateSession(sender, senderAlt);
            logger.debug({ sender, senderAlt }, 'Stored LID mapping from envelope');
        }
        catch (error) {
            logger.warn({ sender, senderAlt, error }, 'Failed to store LID mapping');
        }
    }
};
exports.NO_MESSAGE_FOUND_ERROR_TEXT = 'Message absent from node';
exports.MISSING_KEYS_ERROR_TEXT = 'Key used already or never filled';
exports.ACCOUNT_RESTRICTED_TEXT = 'Your account has been restricted';
// Retry configuration for failed decryption
exports.DECRYPTION_RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 100,
    sessionRecordErrors: ['No session record', 'SessionError: No session record']
};
/** NACK reason codes we send to the server (client → server) */
exports.NACK_REASONS = {
    SenderReachoutTimelocked: 463,
    ParsingError: 487,
    UnrecognizedStanza: 488,
    UnrecognizedStanzaClass: 489,
    UnrecognizedStanzaType: 490,
    InvalidProtobuf: 491,
    InvalidHostedCompanionStanza: 493,
    MissingMessageSecret: 495,
    SignalErrorOldCounter: 496,
    MessageDeletedOnPeer: 499,
    UnhandledError: 500,
    UnsupportedAdminRevoke: 550,
    UnsupportedLIDGroup: 551,
    DBOperationFailed: 552
};
/**
 * Server-side error codes returned in ack stanzas (server → client) that we
 * currently have dedicated handlers for. Extend as more handlers are added.
 * Distinct from the client-side NackReason enum (WAWebCreateNackFromStanza).
 */
exports.SERVER_ERROR_CODES = {
    /**
     * 1:1 message missing privacy token (tctoken). Usually means the account is
     * restricted: WhatsApp blocks starting new chats but preserves existing ones,
     * since established chats already carry a tctoken.
     */
    MessageAccountRestriction: '463',
    /** Stanza validation failure (SMAX_INVALID) — likely stale device session */
    SmaxInvalid: '479'
};
const extractAddressingContext = (stanza) => {
    let senderAlt;
    let recipientAlt;
    const sender = stanza.attrs.participant || stanza.attrs.from;
    const addressingMode = stanza.attrs.addressing_mode || (sender?.endsWith('lid') ? 'lid' : 'pn');
    if (addressingMode === 'lid') {
        // Message is LID-addressed: sender is LID, extract corresponding PN
        // without device data
        senderAlt = stanza.attrs.participant_pn || stanza.attrs.sender_pn || stanza.attrs.peer_recipient_pn;
        recipientAlt = stanza.attrs.recipient_pn;
        // with device data
        //if (sender && senderAlt) senderAlt = transferDevice(sender, senderAlt)
    }
    else {
        // Message is PN-addressed: sender is PN, extract corresponding LID
        // without device data
        senderAlt = stanza.attrs.participant_lid || stanza.attrs.sender_lid || stanza.attrs.peer_recipient_lid;
        recipientAlt = stanza.attrs.recipient_lid;
        //with device data
        //if (sender && senderAlt) senderAlt = transferDevice(sender, senderAlt)
    }
    return {
        addressingMode,
        senderAlt,
        recipientAlt
    };
};
exports.extractAddressingContext = extractAddressingContext;
/**
 * Decode the received node as a message.
 * @note this will only parse the message, not decrypt it
 */
function decodeMessageNode(stanza, meId, meLid) {
    let msgType;
    let chatId;
    let author;
    let fromMe = false;
    const msgId = stanza.attrs.id;
    const from = stanza.attrs.from;
    const participant = stanza.attrs.participant;
    const recipient = stanza.attrs.recipient;
    if (!msgId) {
        throw new boom_1.Boom('Invalid message stanza: missing id attribute', { data: stanza });
    }
    if (!from) {
        throw new boom_1.Boom('Invalid message stanza: missing from attribute', { data: stanza });
    }
    const addressingContext = (0, exports.extractAddressingContext)(stanza);
    const isMe = (jid) => (0, index_js_2.areJidsSameUser)(jid, meId);
    const isMeLid = (jid) => (0, index_js_2.areJidsSameUser)(jid, meLid);
    if ((0, index_js_2.isPnUser)(from) || (0, index_js_2.isLidUser)(from) || (0, index_js_2.isHostedLidUser)(from) || (0, index_js_2.isHostedPnUser)(from)) {
        if (recipient && !(0, index_js_2.isJidMetaAI)(recipient)) {
            if (!isMe(from) && !isMeLid(from)) {
                throw new boom_1.Boom('receipient present, but msg not from me', { data: stanza });
            }
            if (isMe(from) || isMeLid(from)) {
                fromMe = true;
            }
            chatId = recipient;
        }
        else {
            // Peer-routed self stanzas (history sync, app-state sync, etc.) arrive
            // with `from` set to our own device but no `recipient` attribute —
            // still mark as fromMe so self-only protocolMessage handlers run.
            if (isMe(from) || isMeLid(from)) {
                fromMe = true;
            }
            chatId = from;
        }
        msgType = 'chat';
        author = from;
    }
    else if ((0, index_js_2.isJidGroup)(from)) {
        if (!participant) {
            throw new boom_1.Boom('No participant in group message');
        }
        if (isMe(participant) || isMeLid(participant)) {
            fromMe = true;
        }
        msgType = 'group';
        author = participant;
        chatId = from;
    }
    else if ((0, index_js_2.isJidBroadcast)(from)) {
        if (!participant) {
            throw new boom_1.Boom('No participant in group message');
        }
        const isParticipantMe = isMe(participant);
        if ((0, index_js_2.isJidStatusBroadcast)(from)) {
            msgType = isParticipantMe ? 'direct_peer_status' : 'other_status';
        }
        else {
            msgType = isParticipantMe ? 'peer_broadcast' : 'other_broadcast';
        }
        fromMe = isParticipantMe;
        chatId = from;
        author = participant;
    }
    else if ((0, index_js_2.isJidNewsletter)(from)) {
        msgType = 'newsletter';
        chatId = from;
        author = from;
        if (isMe(from) || isMeLid(from)) {
            fromMe = true;
        }
    }
    else {
        throw new boom_1.Boom('Unknown message type', { data: stanza });
    }
    const pushname = stanza?.attrs?.notify;
    const key = {
        remoteJid: chatId,
        remoteJidAlt: !(0, index_js_2.isJidGroup)(chatId) ? addressingContext.senderAlt : undefined,
        remoteJidUsername: !(0, index_js_2.isJidGroup)(chatId)
            ? stanza.attrs.peer_recipient_username || stanza.attrs.recipient_username
            : undefined,
        fromMe,
        id: msgId,
        participant,
        participantAlt: (0, index_js_2.isJidGroup)(chatId) ? addressingContext.senderAlt : undefined,
        participantUsername: stanza.attrs.participant ? stanza.attrs.participant_username : undefined,
        addressingMode: addressingContext.addressingMode,
        ...(msgType === 'newsletter' && stanza.attrs.server_id ? { server_id: stanza.attrs.server_id } : {})
    };
    const fullMessage = {
        key,
        category: stanza.attrs.category,
        messageTimestamp: +stanza.attrs.t,
        pushName: pushname,
        broadcast: (0, index_js_2.isJidBroadcast)(from)
    };
    if (key.fromMe) {
        fullMessage.status = index_js_1.proto.WebMessageInfo.Status.SERVER_ACK;
    }
    return {
        fullMessage,
        author,
        sender: msgType === 'chat' ? author : chatId
    };
}
const decryptMessageNode = (stanza, meId, meLid, repository, logger) => {
    const { fullMessage, author, sender } = decodeMessageNode(stanza, meId, meLid);
    return {
        fullMessage,
        category: stanza.attrs.category,
        author,
        async decrypt() {
            let decryptables = 0;
            if (Array.isArray(stanza.content)) {
                for (const { tag, attrs, content } of stanza.content) {
                    if (tag === 'verified_name' && content instanceof Uint8Array) {
                        const cert = index_js_1.proto.VerifiedNameCertificate.decode(content);
                        const details = index_js_1.proto.VerifiedNameCertificate.Details.decode(cert.details);
                        fullMessage.verifiedBizName = details.verifiedName;
                    }
                    if (tag === 'unavailable' && attrs.type === 'view_once') {
                        fullMessage.key.isViewOnce = true; // TODO: remove from here and add a STUB TYPE
                    }
                    if (attrs.count && tag === 'enc') {
                        fullMessage.retryCount = Number(attrs.count);
                    }
                    if (tag !== 'enc' && tag !== 'plaintext') {
                        continue;
                    }
                    if (!(content instanceof Uint8Array)) {
                        continue;
                    }
                    decryptables += 1;
                    let msgBuffer;
                    const decryptionJid = await (0, exports.getDecryptionJid)(author, repository);
                    if (tag !== 'plaintext') {
                        // TODO: Handle hosted devices
                        await storeMappingFromEnvelope(stanza, author, repository, decryptionJid, logger);
                    }
                    try {
                        const e2eType = tag === 'plaintext' ? 'plaintext' : attrs.type;
                        switch (e2eType) {
                            case 'skmsg':
                                msgBuffer = await repository.decryptGroupMessage({
                                    group: sender,
                                    authorJid: author,
                                    msg: content
                                });
                                break;
                            case 'pkmsg':
                            case 'msg':
                                msgBuffer = await repository.decryptMessage({
                                    jid: decryptionJid,
                                    type: e2eType,
                                    ciphertext: content
                                });
                                break;
                            case 'plaintext':
                                msgBuffer = content;
                                break;
                            default:
                                throw new Error(`Unknown e2e type: ${e2eType}`);
                        }
                        let msg = index_js_1.proto.Message.decode(e2eType !== 'plaintext' ? (0, generics_js_1.unpadRandomMax16)(msgBuffer) : msgBuffer);
                        msg = msg.deviceSentMessage?.message || msg;
                        if (msg.senderKeyDistributionMessage) {
                            //eslint-disable-next-line max-depth
                            try {
                                await repository.processSenderKeyDistributionMessage({
                                    authorJid: author,
                                    item: msg.senderKeyDistributionMessage
                                });
                            }
                            catch (err) {
                                logger.error({ key: fullMessage.key, err }, 'failed to process sender key distribution message');
                            }
                        }
                        if (fullMessage.message) {
                            Object.assign(fullMessage.message, msg);
                        }
                        else {
                            fullMessage.message = msg;
                        }
                    }
                    catch (err) {
                        const errorContext = {
                            key: fullMessage.key,
                            err,
                            messageType: tag === 'plaintext' ? 'plaintext' : attrs.type,
                            sender,
                            author,
                            isSessionRecordError: isSessionRecordError(err)
                        };
                        logger.error(errorContext, 'failed to decrypt message');
                        fullMessage.messageStubType = index_js_1.proto.WebMessageInfo.StubType.CIPHERTEXT;
                        fullMessage.messageStubParameters = [err.message.toString()];
                    }
                }
            }
            // if nothing was found to decrypt
            if (!decryptables && !fullMessage.key?.isViewOnce) {
                fullMessage.messageStubType = index_js_1.proto.WebMessageInfo.StubType.CIPHERTEXT;
                fullMessage.messageStubParameters = [exports.NO_MESSAGE_FOUND_ERROR_TEXT];
            }
        }
    };
};
exports.decryptMessageNode = decryptMessageNode;
/**
 * Utility function to check if an error is related to missing session record
 */
function isSessionRecordError(error) {
    const errorMessage = error?.message || error?.toString() || '';
    return exports.DECRYPTION_RETRY_CONFIG.sessionRecordErrors.some(errorPattern => errorMessage.includes(errorPattern));
}
