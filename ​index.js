const express = require('express');
const pino = require('pino');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    downloadContentFromMessage,
    Browsers
} = require('@whiskeysockets/baileys');

const app = express();
app.use(express.json());
app.use(express.static(__dirname)); // index.html එක වෙබ් එකේ පෙන්වීමට

const PORT = process.env.PORT || 3000;
const messageStore = new Map();
const userConfigs = new Map();

// 1. Web එකෙන් ඉල්ලන 8-Digit Pairing Code එක සැබෑ ලෙසම WhatsApp වෙතින් ලබා දීම
app.get('/code', async (req, res) => {
    let num = (req.query.number || '').replace(/[^0-9]/g, '');
    if (!num) return res.status(400).json({ error: 'Invalid number' });

    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${num}`);
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Safari')
    });

    sock.ev.on('creds.update', saveCreds);

    if (!sock.authState.creds.registered) {
        await delay(1500);
        try {
            const code = await sock.requestPairingCode(num);
            const formatted = code?.match(/.{1,4}/g)?.join('-') || code;
            res.json({ code: formatted });
        } catch (err) {
            res.status(500).json({ error: 'Failed to generate code' });
        }
    } else {
        res.json({ code: 'ALREADY-PAIRED' });
    }

    // 2. Bot Connect වූ සැණින් Self-Chat එකට Password එක යැවීම
    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        if (connection === 'open') {
            const selfJid = `${num}@s.whatsapp.net`;
            let cfg = userConfigs.get(num);
            if (!cfg) {
                const pin = Math.floor(100000 + Math.random() * 900000);
                cfg = {
                    password: `Demon-X-${pin}`,
                    antiDelete: true,
                    viewOnce: true,
                    antiCall: true
                };
                userConfigs.set(num, cfg);
            }

            const welcomeMsg = `╭━━━〔 😈 *DEMON X MD CONNECTED* 😈 〕━━━┈⊷
┃ ✅ *ඔබේ WhatsApp බොට් සාර්ථකව සම්බන්ධ විය!*
┃
┃ 🔑 *SETTINGS PANEL LOGIN:*
┃ ▸ *Bot Number:* ${num}
┃ ▸ *Password:* \`${cfg.password}\`
┃
┃ 🔥 *ACTIVE FEATURES:*
┃ ▸ Anti-Delete : ON ✅
┃ ▸ ViewOnce Saver (.vv) : ON ✅
┃ ▸ Anti-Call Protection : ON ✅
╰━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`;

            await sock.sendMessage(selfJid, { text: welcomeMsg });
            console.log(`😈 DEMON X MD Connected for: ${num}`);
        }
    });

    setupBotFeatures(sock, num);
});

// 3. Anti-Delete, ViewOnce, Anti-Call සහ Commands
function setupBotFeatures(sock, botNum) {
    // Anti-Call
    sock.ev.on('call', async (calls) => {
        for (const c of calls) {
            if (c.status === 'offer') {
                await sock.rejectCall(c.id, c.from);
                await sock.sendMessage(c.from, {
                    text: '📵 *DEMON X MD — ANTI CALL SYSTEM*\n\nකරුණාකර බොට් අංකයට ඇමතුම් ගැනීමෙන් වළකින්න!'
                });
            }
        }
    });

    // Messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message) return;

        const jid = m.key.remoteJid;
        messageStore.set(m.key.id, m);

        // A. Anti-Delete Message Recovery
        if (m.message.protocolMessage && m.message.protocolMessage.type === 0) {
            const deletedId = m.message.protocolMessage.key.id;
            const oldMsg = messageStore.get(deletedId);
            if (oldMsg) {
                const sender = oldMsg.key.participant || oldMsg.key.remoteJid;
                const text = oldMsg.message.conversation || oldMsg.message.extendedTextMessage?.text || 'Media Message';
                await sock.sendMessage(jid, {
                    text: `🗑️ *DEMON X MD — ANTI DELETE* 😈\n\n👤 *Sender:* @${sender.split('@')[0]}\n💬 *Deleted Message:* ${text}`,
                    mentions: [sender]
                });
            }
        }

        const body = m.message.conversation || m.message.extendedTextMessage?.text || '';

        // B. .menu Command
        if (body.toLowerCase() === '.menu') {
            await sock.sendMessage(jid, {
                text: `╭━━━〔 😈 *DEMON X MD MENU* 😈 〕━━━┈⊷\n┃ ▸ *.vv* - Unlock ViewOnce\n┃ ▸ *.ping* - Bot Speed\n┃ ▸ *.alive* - Bot Status\n╰━━━━━━━━━━━━━━━━━━━┈⊷`
            }, { quoted: m });
        }

        // C. ViewOnce Unlock (.vv)
        const quoted = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
        if (body.toLowerCase() === '.vv' && quoted) {
            const vo = quoted.viewOnceMessageV2?.message || quoted.viewOnceMessage?.message;
            if (vo) {
                const isImg = !!vo.imageMessage;
                const media = vo.imageMessage || vo.videoMessage;
                const stream = await downloadContentFromMessage(media, isImg ? 'image' : 'video');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                await sock.sendMessage(jid, {
                    [isImg ? 'image' : 'video']: buffer,
                    caption: '🔓 *Unlocked by DEMON X MD* 😈'
                }, { quoted: m });
            }
        }
    });
}

app.listen(PORT, () => {
    console.log(`🚀 DEMON X MD Server Running on: http://localhost:${PORT}`);
});