const { readSessionJson, writeSessionJson } = require('../lib/session_data');
const {
    getStoredMessage, extractText, unwrap, ownerJid, formatTime,
    vipBox, channelInfo, addReaction, ownerGuard, modeLabel, F, VALID_TARGETS
} = require('./antidelete');

// ═══════════════════════════════════════════════════════════
//                    ⚙️ CONFIG
// ═══════════════════════════════════════════════════════════
function loadConfig(sock) {
    const cfg = readSessionJson(sock, 'antiedit.json', {}) || {};
    return { enabled: cfg.enabled === true, mode: VALID_TARGETS.has(cfg.mode) ? cfg.mode : 'inbox' };
}

function saveConfig(sock, config) {
    try {
        writeSessionJson(sock, 'antiedit.json', config);
    } catch (err) {
        console.error('Antiedit config save error:', err);
    }
}

// ═══════════════════════════════════════════════════════════
//                    🚀 COMMANDS
// ═══════════════════════════════════════════════════════════
async function handleAntieditCommand(sock, chatId, message, match) {
    try {
        if (!(await ownerGuard(sock, chatId, message))) return;
        match = String(match || '').trim().toLowerCase();
        const config = loadConfig(sock);

        if (!match) {
            return sock.sendMessage(chatId, {
                text: vipBox('✏️ 𝙰𝙽𝚃𝙸𝙴𝙳𝙸𝚃 𝙼𝙴𝙽𝚄', [
                    `📊 𝚂𝚝𝚊𝚝𝚞𝚜 : ${config.enabled ? '🟢 𝙾𝙽' : '🔴 𝙾𝙵𝙵'}`,
                    `📤 𝙼𝚘𝚍𝚎 : ${modeLabel(config.mode)}`,
                    '📌 𝚄𝚜𝚊𝚐𝚎 :',
                    `• .antiedit on — ${F('Enable')}`,
                    `• .antiedit off — ${F('Disable')}`,
                    `• .antieditset inbox — ${F('Send to owner inbox')}`,
                    `• .antieditset same — ${F('Send in same chat')}`
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        if (match !== 'on' && match !== 'off') {
            await addReaction(sock, message, '❌');
            return sock.sendMessage(chatId, {
                text: vipBox('❌ 𝙸𝙽𝚅𝙰𝙻𝙸𝙳 𝙲𝙾𝙼𝙼𝙰𝙽𝙳', [`${F('Use')} .antiedit ${F('to see usage.')}`]),
                ...channelInfo
            }, { quoted: message });
        }

        config.enabled = match === 'on';
        saveConfig(sock, config);
        await addReaction(sock, message, config.enabled ? '✅' : '🔕');
        return sock.sendMessage(chatId, {
            text: vipBox('✏️ 𝙰𝙽𝚃𝙸𝙴𝙳𝙸𝚃 𝚄𝙿𝙳𝙰𝚃𝙴𝙳', [
                `📊 𝚂𝚝𝚊𝚝𝚞𝚜 : ${config.enabled ? '🟢 𝙾𝙽' : '🔴 𝙾𝙵𝙵'}`,
                `📤 𝙼𝚘𝚍𝚎 : ${modeLabel(config.mode)}`
            ]),
            ...channelInfo
        }, { quoted: message });
    } catch (err) {
        console.error('Antiedit command error:', err);
    }
}

async function handleAntieditSetCommand(sock, chatId, message, match) {
    try {
        if (!(await ownerGuard(sock, chatId, message))) return;
        match = String(match || '').trim().toLowerCase();
        const config = loadConfig(sock);

        if (!VALID_TARGETS.has(match)) {
            return sock.sendMessage(chatId, {
                text: vipBox('✏️ 𝙰𝙽𝚃𝙸𝙴𝙳𝙸𝚃 𝚂𝙴𝚃', [
                    `📤 𝙲𝚞𝚛𝚛𝚎𝚗𝚝 : ${modeLabel(config.mode)}`,
                    `• .antieditset inbox — ${F('Send to owner inbox from any chat')}`,
                    `• .antieditset same — ${F('Send in the chat it was edited in')}`
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        config.mode = match;
        saveConfig(sock, config);
        await addReaction(sock, message, '✅');
        return sock.sendMessage(chatId, {
            text: vipBox('✏️ 𝙰𝙽𝚃𝙸𝙴𝙳𝙸𝚃 𝙼𝙾𝙳𝙴 𝚂𝙴𝚃', [
                `📤 𝙼𝚘𝚍𝚎 : ${modeLabel(config.mode)}`,
                `📊 𝚂𝚝𝚊𝚝𝚞𝚜 : ${config.enabled ? '🟢 ON' : `🔴 𝙾𝙵𝙵 (${F('use')} .antiedit on)`}`
            ]),
            ...channelInfo
        }, { quoted: message });
    } catch (err) {
        console.error('Antiedit set command error:', err);
    }
}

// ═══════════════════════════════════════════════════════════
//                    ✏️ EDIT DETECTION
// ═══════════════════════════════════════════════════════════
const handledEdits = new Set(); // dedupe (upsert + messages.update both fire)

/**
 * @param key        key of the ORIGINAL message (id, remoteJid, participant, fromMe)
 * @param newMessage the new message body (conversation / extendedTextMessage / ...)
 */
async function processEdit(sock, key, newMessage) {
    try {
        const config = loadConfig(sock);
        if (!config.enabled || !key?.id) return;
        if (key.fromMe) return; // ignore our own edits

        const body = unwrap(newMessage);
        const newText = extractText(body);
        if (!newText) return;

        const dedupeKey = `${key.id}:${newText}`;
        if (handledEdits.has(dedupeKey)) return;
        handledEdits.add(dedupeKey);
        if (handledEdits.size > 2000) handledEdits.delete(handledEdits.values().next().value);

        const original = await getStoredMessage(key.id);
        const oldText = original?.content || '';
        if (oldText === newText) return;

        const chatJid = key.remoteJid;
        const sender = key.participant || original?.sender || chatJid;
        const senderName = sender.split('@')[0];

        let groupName = '';
        if (chatJid.endsWith('@g.us')) {
            try { groupName = (await sock.groupMetadata(chatJid)).subject; } catch { groupName = chatJid; }
        }

        const lines = [
            `👤 𝚂𝚎𝚗𝚍𝚎𝚛 : @${senderName}`,
            `📱 𝙽𝚞𝚖𝚋𝚎𝚛 : ${senderName}`,
            `🕐 𝚃𝚒𝚖𝚎 : ${formatTime()}`
        ];
        if (groupName) lines.push(`👥 𝙶𝚛𝚘𝚞𝚙 : ${groupName}`);
        lines.push(`❌ 𝙾𝚕𝚍 : ${oldText || F('(old text was not saved)')}`);
        lines.push(`✅ 𝙽𝚎𝚠 : ${newText}`);

        // Remember the latest text so a second edit compares against this one
        if (original) original.content = newText;

        const target = config.mode === 'same' ? chatJid : ownerJid(sock);
        await sock.sendMessage(target, {
            text: vipBox('✏️ 𝙰𝙽𝚃𝙸𝙴𝙳𝙸𝚃 𝙳𝙴𝚃𝙴𝙲𝚃𝙴𝙳', lines),
            mentions: [sender],
            ...channelInfo
        });
    } catch (err) {
        console.error('processEdit error:', err);
    }
}

// Called from main.js for every incoming message (messages.upsert path)
async function handleMessageEdit(sock, message) {
    const pm = message?.message?.protocolMessage ||
        message?.message?.editedMessage?.message?.protocolMessage;
    if (!pm || pm.type !== 14 || !pm.editedMessage) return false;
    // pm.key.fromMe is from the sender's point of view, so use the outer key
    const key = {
        id: pm.key?.id,
        remoteJid: message.key.remoteJid,
        participant: message.key.participant,
        fromMe: !!message.key.fromMe
    };
    await processEdit(sock, key, pm.editedMessage);
    return true;
}

// Called from index.js for the messages.update path
async function handleMessageUpdateEdit(sock, updates) {
    for (const u of updates || []) {
        const edited = u?.update?.message?.editedMessage?.message;
        if (!edited || !u.key) continue;
        await processEdit(sock, u.key, edited);
    }
}

module.exports = {
    handleAntieditCommand,
    handleAntieditSetCommand,
    handleMessageEdit,
    handleMessageUpdateEdit
};
