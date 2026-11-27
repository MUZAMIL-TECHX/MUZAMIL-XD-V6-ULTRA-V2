const axios = require('axios');
const { sleep } = require('../lib/myfunc');

// ═══════════════════════════════════════════════════════════
//                    🎯 CHANNEL INFO
// ═══════════════════════════════════════════════════════════
const channelInfo = {
    forwardingScore: 1,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
        newsletterJid: '120363426106687970@newsletter',
        newsletterName: '𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫',
        serverMessageId: -1
    }
};

// ═══════════════════════════════════════════════════════════
//                    🎯 REACT HELPER
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

// ═══════════════════════════════════════════════════════════
//                    🔗 API CONFIG
// ═══════════════════════════════════════════════════════════
const PAIRING_API = (
    process.env.PAIRING_API_URL ||
    process.env.PUBLIC_URL ||
    'https://muzamil-xd-v6-ultra-v2-production-8bf7ae3d.up.railway.app'
).replace(/\/+$/, '');

// ═══════════════════════════════════════════════════════════
//                    🚀 MAIN COMMAND
// ═══════════════════════════════════════════════════════════
async function pairCommand(sock, chatId, message, q) {
    try {
        // ❌ Missing input
        if (!q) {
            await addReaction(sock, message, '❌');
            return await sock.sendMessage(chatId, {
                text: "Please provide a valid WhatsApp number\nExample: .pair 92302395XXXX",
                contextInfo: channelInfo
            }, { quoted: message });
        }

        // 🧹 Parse & validate numbers
        const numbers = q.split(',')
            .map((v) => v.replace(/[^0-9]/g, ''))
            .filter((v) => v.length > 5 && v.length < 20);

        if (numbers.length === 0) {
            await addReaction(sock, message, '❌');
            return await sock.sendMessage(chatId, {
                text: "Invalid number❌️ Please use the correct format!",
                contextInfo: channelInfo
            }, { quoted: message });
        }

        // 🕐 Initial reaction — processing
        await addReaction(sock, message, '⏳');

        for (const number of numbers) {
            const whatsappID = number + '@s.whatsapp.net';

            let result;
            try {
                result = await sock.onWhatsApp(whatsappID);
            } catch (err) {
                console.error('onWhatsApp error:', err.message);
                await addReaction(sock, message, '❌');
                return await sock.sendMessage(chatId, {
                    text: "Failed to check WhatsApp number. Please try again.",
                    contextInfo: channelInfo
                }, { quoted: message });
            }

            // ❌ Not registered on WhatsApp
            if (!result?.[0]?.exists) {
                await addReaction(sock, message, '❌');
                return await sock.sendMessage(chatId, {
                    text: "That number is not registered on WhatsApp❗️",
                    contextInfo: channelInfo
                }, { quoted: message });
            }

            // ⏳ Wait message
            await sock.sendMessage(chatId, {
                text: "Wait a moment for the code...",
                contextInfo: channelInfo
            }, { quoted: message });

            try {
                const response = await axios.get(
                    `${PAIRING_API}/code?number=${encodeURIComponent(number)}`,
                    { timeout: 45000, validateStatus: () => true }
                );

                const data = response.data || {};
                const status = String(data.status || '').toLowerCase();
                const code = data.code;

                // ❌ API error / unavailable
                if (
                    response.status < 200 || response.status >= 300 ||
                    status !== 'success' ||
                    !code ||
                    code === 'Service Unavailable'
                ) {
                    throw new Error(
                        data.message ||
                        data.error ||
                        (code === 'Service Unavailable' ? 'Service Unavailable' : null) ||
                        `API returned HTTP ${response.status}`
                    );
                }

                // ✅ Success reaction
                await addReaction(sock, message, '✅');

                // 📋 Code message — easy to copy (monospace block)
                await sock.sendMessage(chatId, {
                    text:
`𝗣𝗔𝗜𝗥 𝗖𝗢𝗗𝗘 𝗚𝗘𝗡𝗘𝗥𝗔𝗧𝗘𝗗 𝗦𝗨𝗖𝗖𝗘𝗦𝗦𝗙𝗨𝗟𝗟𝗬 ✅

📱 𝗡𝘂𝗺𝗯𝗲𝗿: ${number}

📋 𝗬𝗼𝘂𝗿 𝗖𝗼𝗱𝗲:
\`\`\`${code}\`\`\`

👆 𝗧𝗮𝗽 & 𝗵𝗼𝗹𝗱 𝘁𝗵𝗲 𝗰𝗼𝗱𝗲 𝘁𝗼 𝗰𝗼𝗽𝘆

🔗 𝗜𝗻𝘀𝘁𝗿𝘂𝗰𝘁𝗶𝗼𝗻𝘀:
1. Open WhatsApp → Linked Devices
2. Tap "Link with phone number"
3. Enter the code above

👑 𝗕𝘆: 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫`,
                    contextInfo: channelInfo
                }, { quoted: message });

            } catch (apiError) {
                console.error('API Error:', apiError.message);

                // ❌ Failure reaction
                await addReaction(sock, message, '❌');

                const errorMessage = apiError.message === 'Service Unavailable'
                    ? "Service is currently unavailable. Please try again later."
                    : `Failed to generate pairing code.\n\n⚠️ Reason: ${apiError.message || 'Unknown error'}`;

                await sock.sendMessage(chatId, {
                    text: errorMessage,
                    contextInfo: channelInfo
                }, { quoted: message });
            }
        }
    } catch (error) {
        console.error('pairCommand fatal error:', error);
        await addReaction(sock, message, '❌');
        await sock.sendMessage(chatId, {
            text: "An error occurred. Please try again later.",
            contextInfo: channelInfo
        }, { quoted: message }).catch(() => {});
    }
}

module.exports = pairCommand;
