const axios = require('axios');

const API_URL = 'https://muzamil-react-api.vercel.app/react';

// ═══════════════════════════════════════════════════════════
//                    🎯 INLINE REACT HELPER
// ═══════════════════════════════════════════════════════════
async function addReaction(sock, message, emoji) {
    try {
        if (!message?.key?.remoteJid) return;
        await sock.sendMessage(message.key.remoteJid, {
            react: { text: emoji, key: message.key }
        });
    } catch (err) {
        console.error('Reaction error:', err.message);
    }
}

function parseArguments(rawText) {
    const match = String(rawText || '').match(/^\.chreact\b\s*(\S+)/i);
    if (!match) return null;
    return { link: match[1].trim() };
}

function isValidChannelLink(link) {
    try {
        const url = new URL(link);
        return url.protocol === 'https:' &&
            (url.hostname === 'whatsapp.com' || url.hostname.endsWith('.whatsapp.com')) &&
            /\/channel\/[^/]+\/\d+/i.test(url.pathname);
    } catch (_) {
        return false;
    }
}

async function chreactCommand(sock, chatId, rawText, message) {
    const args = parseArguments(rawText);

    // ❌ Invalid / missing link
    if (!args || !isValidChannelLink(args.link)) {
        await addReaction(sock, message, '❌');
        await sock.sendMessage(chatId, {
            text: '╭━━━〔 ⚙️ 𝗖𝗛𝗔𝗡𝗡𝗘𝗟 𝗥𝗘𝗔𝗖𝗧 〕━━━╮\n┃ 𝗨𝘀𝗲:\n┃ *.chreact <channel-post-link>*\n┃\n┃ 𝗘𝘅𝗮𝗺𝗽𝗹𝗲:\n┃ *.chreact https://whatsapp.com/channel/xxx/850*\n╰━━━━━━━━━━━━━━━━━━━━━━╯'
        }, { quoted: message });
        return;
    }

    // 🕐 Processing reaction
    await addReaction(sock, message, '⏳');

    try {
        const response = await axios.get(API_URL, {
            params: { link: args.link },
            timeout: 30000,
            validateStatus: () => true
        });

        const body = response.data;
        const status = body && typeof body === 'object'
            ? String(body.Status || body.status || '')
            : '';
        const ok = response.status >= 200 && response.status < 300 &&
            /done|success|✅/i.test(status);

        if (!ok) {
            throw new Error(
                (body && (body.message || body.error)) ||
                status ||
                `API returned HTTP ${response.status}`
            );
        }

        // ✅ Success
        await addReaction(sock, message, '✅');
        await sock.sendMessage(chatId, {
            text: `╭━━━〔 ✅ 𝗥𝗘𝗔𝗖𝗧 𝗦𝗘𝗡𝗧 𝗦𝗨𝗖𝗖𝗘𝗦𝗦𝗙𝗨𝗟𝗟𝗬 〕━━━╮\n┃ 𝗣𝗼𝘀𝘁: ${args.link}\n┃ 𝗦𝘁𝗮𝘁𝘂𝘀: ${status}\n┃\n┃ 𝗕𝘆 : 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫\n╰━━━━━━━━━━━━━━━━━━━━━━━━╯`
        }, { quoted: message });
    } catch (error) {
        console.error('Channel react error:', error.response?.data || error.message);

        // ❌ Failed
        await addReaction(sock, message, '❌');
        await sock.sendMessage(chatId, {
            text: `╭━━━〔 ❌ 𝗥𝗘𝗔𝗖𝗧 𝗙𝗔𝗜𝗟𝗘𝗗 〕━━━╮\n┃ ${error.message || 'API request failed'}\n┃ 𝗖𝗵𝗲𝗰𝗸 𝘁𝗵𝗲 𝗹𝗶𝗻𝗸 𝗮𝗻𝗱 𝘁𝗿𝘆 𝗮𝗴𝗮𝗶𝗻.\n╰━━━━━━━━━━━━━━━━━━━━━━━━╯`
        }, { quoted: message });
    }
}

module.exports = chreactCommand;
