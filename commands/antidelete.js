const fs = require('fs');
const path = require('path');
const { tmpdir } = require('os');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { writeFile } = require('fs/promises');
const { readSessionJson, writeSessionJson } = require('../lib/session_data');

const messageStore = new Map();
const BASE_TEMP_MEDIA_DIR = path.join(__dirname, '../tmp');
const TEMP_MEDIA_DIR = BASE_TEMP_MEDIA_DIR;

// ═══════════════════════════════════════════════════════════
//                    🎯 CHANNEL INFO (FORWARD ON)
// ═══════════════════════════════════════════════════════════
const channelInfo = {
    contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: '120363426106687970@newsletter',
            newsletterName: '𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫',
            serverMessageId: -1
        }
    }
};

// Ensure tmp dir exists
if (!fs.existsSync(BASE_TEMP_MEDIA_DIR)) {
    fs.mkdirSync(BASE_TEMP_MEDIA_DIR, { recursive: true });
}

// ═══════════════════════════════════════════════════════════
//                    🛠️ HELPERS
// ═══════════════════════════════════════════════════════════
async function addReaction(sock, message, emoji) {
    try {
        await sock.sendMessage(message.key.remoteJid, {
            react: { text: emoji, key: message.key }
        });
    } catch (error) {
        console.error('Reaction error:', error);
    }
}

// ═══════════════════════════════════════════════════════════
//                    💎 VIP DESIGN FRAME (CLEAN)
// ═══════════════════════════════════════════════════════════
function vipBox(title, lines = []) {
    let out = `╭━━━━━━━━━━━━━━━╮\n`;
    out += `   ✦ ${title} ✦\n`;
    out += `╰━━━━━━━━━━━━━━━╯\n`;
    for (const l of lines) out += `▸ ${l}\n`;
    out += `━━━━━━━━━━━━━━━━\n`;
    out += `👑 𝗕𝘆 : 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫`;
    return out;
}

// ═══════════════════════════════════════════════════════════
//                    🧹 TEMP FOLDER UTILS
// ═══════════════════════════════════════════════════════════
const getFolderSizeInMB = (folderPath) => {
    try {
        const files = fs.readdirSync(folderPath);
        let totalSize = 0;
        for (const file of files) {
            const filePath = path.join(folderPath, file);
            if (fs.statSync(filePath).isFile()) {
                totalSize += fs.statSync(filePath).size;
            }
        }
        return totalSize / (1024 * 1024);
    } catch (err) {
        console.error('Error getting folder size:', err);
        return 0;
    }
};

const cleanTempFolderIfLarge = () => {
    try {
        const sizeMB = getFolderSizeInMB(TEMP_MEDIA_DIR);
        if (sizeMB > 200) {
            const files = fs.readdirSync(TEMP_MEDIA_DIR);
            for (const file of files) {
                const filePath = path.join(TEMP_MEDIA_DIR, file);
                fs.unlinkSync(filePath);
            }
        }
    } catch (err) {
        console.error('Temp cleanup error:', err);
    }
};

setInterval(cleanTempFolderIfLarge, 60 * 1000);

// ═══════════════════════════════════════════════════════════
//                    ⚙️ CONFIG LOAD/SAVE
// ═══════════════════════════════════════════════════════════
const VALID_TARGETS = new Set(['inbox', 'same']);

function loadAntideleteConfig(sock) {
    const cfg = readSessionJson(sock, 'antidelete.json', {}) || {};
    return {
        ...cfg,
        enabled: cfg.enabled === true,
        mode: VALID_TARGETS.has(cfg.mode) ? cfg.mode : 'inbox'
    };
}

function saveAntideleteConfig(sock, config) {
    try {
        writeSessionJson(sock, 'antidelete.json', config);
    } catch (err) {
        console.error('Config save error:', err);
    }
}

function loadAntieditConfig(sock) {
    const cfg = readSessionJson(sock, 'antiedit.json', {}) || {};
    return { enabled: cfg.enabled === true, mode: VALID_TARGETS.has(cfg.mode) ? cfg.mode : 'inbox' };
}

// True when any feature that needs incoming messages to be remembered is on.
function isAntiActive(sock) {
    try {
        return loadAntideleteConfig(sock).enabled || loadAntieditConfig(sock).enabled;
    } catch (_) {
        return false;
    }
}

const isOwnerOrSudo = require('../lib/isOwner');

// Monospace "designed" font for static text (letters only, digits/mentions untouched)
function F(str) {
    return String(str).replace(/[A-Za-z]/g, c => String.fromCodePoint(
        (c <= 'Z' ? 0x1D670 + c.charCodeAt(0) - 65 : 0x1D68A + c.charCodeAt(0) - 97)));
}

function modeLabel(mode) {
    return mode === 'same' ? `📍 ${F('SAME (same chat)')}` : `📥 ${F('INBOX (owner inbox)')}`;
}

// ═══════════════════════════════════════════════════════════
//                    🚀 COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════
async function ownerGuard(sock, chatId, message) {
    const senderId = message.key.participant || message.key.remoteJid;
    const isOwner = await isOwnerOrSudo(senderId, sock, chatId);
    if (!message.key.fromMe && !isOwner) {
        await addReaction(sock, message, '⛔');
        await sock.sendMessage(chatId, {
            text: vipBox('⛔ 𝙰𝙲𝙲𝙴𝚂𝚂 𝙳𝙴𝙽𝙸𝙴𝙳', [F('Only the bot owner can use this command.')]),
            ...channelInfo
        }, { quoted: message });
        return false;
    }
    return true;
}

async function handleAntideleteCommand(sock, chatId, message, match) {
    try {
        await addReaction(sock, message, '🛡️');
        if (!(await ownerGuard(sock, chatId, message))) return;

        match = String(match || '').trim().toLowerCase();
        const config = loadAntideleteConfig(sock);

        if (!match) {
            const status = config.enabled ? '🟢 𝙾𝙽' : '🔴 𝙾𝙵𝙵';
            await addReaction(sock, message, '📋');
            return sock.sendMessage(chatId, {
                text: vipBox('🛡️ 𝙰𝙽𝚃𝙸𝙳𝙴𝙻𝙴𝚃𝙴 𝙼𝙴𝙽𝚄', [
                    `📊 𝚂𝚝𝚊𝚝𝚞𝚜 : ${status}`,
                    `📤 𝙼𝚘𝚍𝚎 : ${modeLabel(config.mode)}`,
                    '📌 𝚄𝚜𝚊𝚐𝚎 :',
                    `• .antidelete on — ${F('Enable')}`,
                    `• .antidelete off — ${F('Disable')}`,
                    `• .antideleteset inbox — ${F('Send to owner inbox')}`,
                    `• .antideleteset same — ${F('Send in same chat')}`
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        if (match === 'on') {
            config.enabled = true;
            await addReaction(sock, message, '✅');
        } else if (match === 'off') {
            config.enabled = false;
            await addReaction(sock, message, '🔕');
        } else {
            await addReaction(sock, message, '❌');
            return sock.sendMessage(chatId, {
                text: vipBox('❌ 𝙸𝙽𝚅𝙰𝙻𝙸𝙳 𝙲𝙾𝙼𝙼𝙰𝙽𝙳', [`${F('Use')} .antidelete ${F('to see usage.')}`]),
                ...channelInfo
            }, { quoted: message });
        }

        saveAntideleteConfig(sock, config);
        return sock.sendMessage(chatId, {
            text: vipBox('🛡️ 𝙰𝙽𝚃𝙸𝙳𝙴𝙻𝙴𝚃𝙴 𝚄𝙿𝙳𝙰𝚃𝙴𝙳', [
                `📊 𝚂𝚝𝚊𝚝𝚞𝚜 : ${config.enabled ? '🟢 𝙾𝙽' : '🔴 𝙾𝙵𝙵'}`,
                `📤 𝙼𝚘𝚍𝚎 : ${modeLabel(config.mode)}`
            ]),
            ...channelInfo
        }, { quoted: message });
    } catch (error) {
        console.error('Antidelete command error:', error);
        await addReaction(sock, message, '❌');
        return sock.sendMessage(chatId, {
            text: vipBox('❌ 𝙴𝚁𝚁𝙾𝚁', [F('Error processing command.')]),
            ...channelInfo
        }, { quoted: message });
    }
}

async function handleAntideleteSetCommand(sock, chatId, message, match) {
    try {
        if (!(await ownerGuard(sock, chatId, message))) return;
        match = String(match || '').trim().toLowerCase();
        const config = loadAntideleteConfig(sock);

        if (!VALID_TARGETS.has(match)) {
            return sock.sendMessage(chatId, {
                text: vipBox('🛡️ 𝙰𝙽𝚃𝙸𝙳𝙴𝙻𝙴𝚃𝙴 𝚂𝙴𝚃', [
                    `📤 𝙲𝚞𝚛𝚛𝚎𝚗𝚝 : ${modeLabel(config.mode)}`,
                    `• .antideleteset inbox — ${F('Send to owner inbox from any chat')}`,
                    `• .antideleteset same — ${F('Send in the chat it was deleted from')}`
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        config.mode = match;
        saveAntideleteConfig(sock, config);
        await addReaction(sock, message, '✅');
        return sock.sendMessage(chatId, {
            text: vipBox('🛡️ 𝙰𝙽𝚃𝙸𝙳𝙴𝙻𝙴𝚃𝙴 𝙼𝙾𝙳𝙴 𝚂𝙴𝚃', [
                `📤 𝙼𝚘𝚍𝚎 : ${modeLabel(config.mode)}`,
                `📊 𝚂𝚝𝚊𝚝𝚞𝚜 : ${config.enabled ? '🟢 ON' : `🔴 𝙾𝙵𝙵 (${F('use')} .antidelete on)`}`
            ]),
            ...channelInfo
        }, { quoted: message });
    } catch (error) {
        console.error('Antideleteset command error:', error);
    }
}

// ═══════════════════════════════════════════════════════════
//                    📥 MESSAGE STORE
// ═══════════════════════════════════════════════════════════
const MAX_STORED = 4000;
const MAX_MEDIA_BYTES = 60 * 1024 * 1024; // skip files bigger than 60MB
const pending = new Map(); // messageId -> Promise (store still in progress)

function ownerJid(sock) {
    return sock.user.id.split(':')[0].split('@')[0] + '@s.whatsapp.net';
}

function unwrap(msg) {
    let m = msg;
    for (let i = 0; i < 5 && m; i++) {
        const inner = m.ephemeralMessage?.message ||
            m.viewOnceMessage?.message ||
            m.viewOnceMessageV2?.message ||
            m.viewOnceMessageV2Extension?.message ||
            m.documentWithCaptionMessage?.message ||
            m.editedMessage?.message;
        if (!inner) break;
        m = inner;
    }
    return m;
}

function isViewOnceWrapped(msg) {
    return !!(msg?.viewOnceMessage || msg?.viewOnceMessageV2 || msg?.viewOnceMessageV2Extension);
}

// Pull plain text / caption out of any message body (used by antiedit too)
function extractText(m) {
    if (!m) return '';
    return m.conversation ||
        m.extendedTextMessage?.text ||
        m.imageMessage?.caption ||
        m.videoMessage?.caption ||
        m.documentMessage?.caption ||
        '';
}

function trimStore() {
    while (messageStore.size > MAX_STORED) {
        const oldestKey = messageStore.keys().next().value;
        const old = messageStore.get(oldestKey);
        if (old?.mediaPath) { try { fs.unlinkSync(old.mediaPath); } catch {} }
        messageStore.delete(oldestKey);
    }
}

async function saveMedia(node, type, filePath) {
    const size = Number(node?.fileLength?.low ?? node?.fileLength ?? 0);
    if (size && size > MAX_MEDIA_BYTES) return false;
    const stream = await downloadContentFromMessage(node, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    await writeFile(filePath, Buffer.concat(chunks));
    return true;
}

async function doStore(sock, message) {
    const deleteOn = loadAntideleteConfig(sock).enabled;
    const editOn = loadAntieditConfig(sock).enabled;
    if (!deleteOn && !editOn) return;
    if (!message.key?.id || !message.message) return;
    if (message.message.protocolMessage) return; // revoke/edit notifications themselves

    const messageId = message.key.id;
    const sender = message.key.participant || message.key.remoteJid;
    const viewOnce = isViewOnceWrapped(message.message);
    const m = unwrap(message.message);
    if (!m) return;

    const entry = {
        content: '',
        mediaType: '',
        mediaPath: '',
        mimetype: '',
        fileName: '',
        ptt: false,
        gif: false,
        extra: null,
        sender,
        chat: message.key.remoteJid,
        fromMe: !!message.key.fromMe,
        group: message.key.remoteJid.endsWith('@g.us') ? message.key.remoteJid : null,
        timestamp: new Date().toISOString()
    };

    entry.content = extractText(m);
    const mediaDefs = [
        ['imageMessage', 'image', 'jpg'],
        ['videoMessage', 'video', 'mp4'],
        ['audioMessage', 'audio', 'mp3'],
        ['stickerMessage', 'sticker', 'webp'],
        ['documentMessage', 'document', 'bin'],
        ['ptvMessage', 'video', 'mp4']
    ];

    for (const [key, type, defExt] of mediaDefs) {
        const node = m[key];
        if (!node) continue;
        entry.mediaType = type;
        entry.mimetype = node.mimetype || '';
        entry.fileName = node.fileName || '';
        entry.ptt = !!node.ptt;
        entry.gif = !!node.gifPlayback;
        if (key === 'ptvMessage') entry.ptv = true;

        // media is downloaded only when antidelete needs it
        if (deleteOn) {
            let ext = defExt;
            if (type === 'audio') {
                const mime = entry.mimetype;
                ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') || mime.includes('aac') ? 'm4a' : mime.includes('wav') ? 'wav' : 'mp3';
            } else if (type === 'document') {
                ext = (entry.fileName.split('.').pop() || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
            }
            const filePath = path.join(TEMP_MEDIA_DIR, `${messageId}.${ext}`);
            try {
                if (await saveMedia(node, type, filePath)) entry.mediaPath = filePath;
            } catch (e) {
                console.error('Antidelete media download failed:', e.message);
            }
        }
        break;
    }

    if (m.contactMessage) {
        entry.mediaType = 'contact';
        entry.extra = { displayName: m.contactMessage.displayName, vcard: m.contactMessage.vcard };
    } else if (m.contactsArrayMessage) {
        entry.mediaType = 'contacts';
        entry.extra = { contacts: (m.contactsArrayMessage.contacts || []).map(c => ({ displayName: c.displayName, vcard: c.vcard })) };
    } else if (m.locationMessage || m.liveLocationMessage) {
        const loc = m.locationMessage || m.liveLocationMessage;
        entry.mediaType = 'location';
        entry.extra = { latitude: loc.degreesLatitude, longitude: loc.degreesLongitude, name: loc.name || '' };
    }

    // Nothing recognisable (reaction, poll update, etc.)
    if (!entry.content && !entry.mediaType) return;

    messageStore.set(messageId, entry);
    trimStore();

    // Anti-ViewOnce: forward to owner right away
    if (deleteOn && viewOnce && entry.mediaPath && fs.existsSync(entry.mediaPath) &&
        (entry.mediaType === 'image' || entry.mediaType === 'video')) {
        try {
            const senderName = sender.split('@')[0];
            const caption = vipBox(`🛡️ 𝙰𝙽𝚃𝙸-𝚅𝙸𝙴𝚆𝙾𝙽𝙲𝙴 ${entry.mediaType.toUpperCase()}`, [
                `👤 𝙵𝚛𝚘𝚖 : @${senderName}`
            ]);
            const opts = { caption, mentions: [sender], ...channelInfo };
            await sock.sendMessage(ownerJid(sock), entry.mediaType === 'image'
                ? { image: { url: entry.mediaPath }, ...opts }
                : { video: { url: entry.mediaPath }, ...opts });
        } catch (e) {
            console.error('Anti-viewonce forward failed:', e.message);
        }
    }
}

function storeMessage(sock, message) {
    const id = message?.key?.id;
    const p = doStore(sock, message).catch(err => console.error('storeMessage error:', err));
    if (id) {
        pending.set(id, p);
        p.finally(() => { if (pending.get(id) === p) pending.delete(id); });
    }
    return p;
}

async function getStoredMessage(messageId) {
    if (pending.has(messageId)) { try { await pending.get(messageId); } catch {} }
    return messageStore.get(messageId);
}

// ═══════════════════════════════════════════════════════════
//                    📤 RECOVERY SENDER (shared with antiedit)
// ═══════════════════════════════════════════════════════════
function formatTime() {
    return new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Karachi',
        hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit',
        day: '2-digit', month: '2-digit', year: 'numeric'
    });
}

async function sendRecovered(sock, target, original, title, lines, mentions) {
    const headerCaption = vipBox(title, lines);
    const base = { mentions, ...channelInfo };
    const hasFile = original.mediaPath && fs.existsSync(original.mediaPath);

    if (hasFile) {
        const url = { url: original.mediaPath };
        switch (original.mediaType) {
            case 'image':
                return sock.sendMessage(target, { image: url, caption: headerCaption, ...base });
            case 'video':
                return sock.sendMessage(target, { video: url, caption: headerCaption, gifPlayback: original.gif, ...base });
            case 'document':
                return sock.sendMessage(target, {
                    document: url,
                    mimetype: original.mimetype || 'application/octet-stream',
                    fileName: original.fileName || path.basename(original.mediaPath),
                    caption: headerCaption,
                    ...base
                });
            case 'audio':
                await sock.sendMessage(target, { text: headerCaption, ...base });
                return sock.sendMessage(target, {
                    audio: url,
                    mimetype: original.mimetype || 'audio/mpeg',
                    ptt: original.ptt
                });
            case 'sticker':
                await sock.sendMessage(target, { text: headerCaption, ...base });
                return sock.sendMessage(target, { sticker: url });
        }
    }

    // Text-ish content
    const textLines = [...lines];
    if (original.content) textLines.push(`💬 𝙼𝚎𝚜𝚜𝚊𝚐𝚎 : ${original.content}`);
    else if (original.mediaType && !hasFile && ['image', 'video', 'audio', 'sticker', 'document'].includes(original.mediaType)) {
        textLines.push(`📎 𝚃𝚢𝚙𝚎 : ${F(original.mediaType.toUpperCase())} (${F('media could not be saved')})`);
    }
    await sock.sendMessage(target, { text: vipBox(title, textLines), ...base });

    if (original.mediaType === 'contact' && original.extra?.vcard) {
        await sock.sendMessage(target, { contacts: { displayName: original.extra.displayName || 'Contact', contacts: [{ vcard: original.extra.vcard }] } });
    } else if (original.mediaType === 'contacts' && original.extra?.contacts?.length) {
        await sock.sendMessage(target, { contacts: { displayName: 'Contacts', contacts: original.extra.contacts.map(c => ({ vcard: c.vcard })) } });
    } else if (original.mediaType === 'location' && original.extra) {
        await sock.sendMessage(target, { location: { degreesLatitude: original.extra.latitude, degreesLongitude: original.extra.longitude, name: original.extra.name } });
    }
}

// ═══════════════════════════════════════════════════════════
//                    🗑️ HANDLE DELETION
// ═══════════════════════════════════════════════════════════
async function handleMessageRevocation(sock, revocationMessage) {
    try {
        const config = loadAntideleteConfig(sock);
        if (!config.enabled) return;

        const messageId = revocationMessage.message.protocolMessage.key.id;
        const chatJid = revocationMessage.key.remoteJid;
        const deletedBy = revocationMessage.participant || revocationMessage.key.participant || chatJid;
        const owner = ownerJid(sock);

        // Ignore deletes done by the bot account itself
        if (revocationMessage.key.fromMe || deletedBy.includes(sock.user.id) || deletedBy.split('@')[0] === owner.split('@')[0]) return;

        const original = await getStoredMessage(messageId);
        if (!original) return;

        const sender = original.sender;
        const senderName = sender.split('@')[0];
        let groupName = '';
        if (original.group) {
            try { groupName = (await sock.groupMetadata(original.group)).subject; } catch { groupName = original.group; }
        }

        const lines = [
            `🗑️ 𝙳𝚎𝚕𝚎𝚝𝚎𝚍 𝙱𝚢 : @${deletedBy.split('@')[0]}`,
            `👤 𝚂𝚎𝚗𝚍𝚎𝚛 : @${senderName}`,
            `📱 𝙽𝚞𝚖𝚋𝚎𝚛 : ${sender.split('@')[0]}`,
            `🕐 𝚃𝚒𝚖𝚎 : ${formatTime()}`
        ];
        if (groupName) lines.push(`👥 𝙶𝚛𝚘𝚞𝚙 : ${groupName}`);

        // inbox = owner's inbox, same = the chat where it was deleted
        const target = config.mode === 'same' ? chatJid : owner;

        try {
            await sendRecovered(sock, target, original, '🛡️ 𝙰𝙽𝚃𝙸𝙳𝙴𝙻𝙴𝚃𝙴 𝙳𝙴𝚃𝙴𝙲𝚃𝙴𝙳', lines, [deletedBy, sender]);
        } catch (err) {
            console.error('Antidelete send error:', err);
            await sock.sendMessage(owner, {
                text: vipBox('⚠️ 𝙼𝙴𝙳𝙸𝙰 𝙴𝚁𝚁𝙾𝚁', [err.message]),
                ...channelInfo
            }).catch(() => {});
        }

        if (original.mediaPath) { try { fs.unlinkSync(original.mediaPath); } catch {} }
        messageStore.delete(messageId);
    } catch (err) {
        console.error('handleMessageRevocation error:', err);
    }
}

module.exports = {
    handleAntideleteCommand,
    handleAntideleteSetCommand,
    handleMessageRevocation,
    storeMessage,
    isAntiActive,
    // shared helpers for antiedit
    getStoredMessage,
    extractText,
    unwrap,
    ownerJid,
    formatTime,
    vipBox,
    channelInfo,
    addReaction,
    ownerGuard,
    modeLabel,
    F,
    VALID_TARGETS
};
