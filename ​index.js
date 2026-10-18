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
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
const messageStore = new Map();

app.get('/code', async (req, res) => {
    let num = (req.query.number || '').replace(/[^0-9]/g, '');
    if (!num) return res.status(400).json({ error: 'Invalid number' });

    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${num}`);
    
    // Fix: Updated browser headers to bypass WhatsApp pairing restrictions
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Chrome (Linux)', 'Chrome', '120.0.0.0'],
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    if (!sock.authState.creds.registered) {
        await delay(3000);
        try {
            let code = await sock.requestPairingCode(num);
            code = code?.match(/.{1,4}/g)?.join('-') || code;
            console.log(`🔑 PAIRING CODE FOR ${num}: ${code}`);
            res.json({ code });
        } catch (err) {
            console.error('Pairing error:', err);
            res.status(500).json({ error: 'Failed to generate code' });
        }
    } else {
        res.json({ code: 'ALREADY-PAIRED' });
    }

    sock.ev.on('connection.update', async ({ connection }) => {
        if (connection === 'open') {
            const pin = Math.floor(100000 + Math.random() * 900000);
            await sock.sendMessage(`${num}@s.whatsapp.net`, {
                text: `😈 *DEMON X MD CONNECTED!*\n\n🔑 *Panel Password:* \`Demon-X-${pin}\`\n✅ Anti-Delete & ViewOnce (.vv) Active!`
            });
            console.log(`✅ Connected: ${num}`);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message) return;
        const jid = m.key.remoteJid;
        messageStore.set(m.key.id, m);

        if (m.message.protocolMessage && m.message.protocolMessage.type === 0) {
            const old = messageStore.get(m.message.protocolMessage.key.id);
            if (old) {
                const txt = old.message.conversation || old.message.extendedTextMessage?.text || 'Media';
                await sock.sendMessage(jid, { text: `🗑️ *DEMON X ANTI-DELETE*\n💬 Message: ${txt}` });
            }
        }

        const body = m.message.conversation || m.message.extendedTextMessage?.text || '';
        const quoted = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
        if (body.toLowerCase() === '.vv' && quoted) {
            const vo = quoted.viewOnceMessageV2?.message || quoted.viewOnceMessage?.message;
            if (vo) {
                const isImg = !!vo.imageMessage;
                const stream = await downloadContentFromMessage(vo.imageMessage || vo.videoMessage, isImg ? 'image' : 'video');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                await sock.sendMessage(jid, { [isImg ? 'image' : 'video']: buffer, caption: '🔓 *Unlocked by DEMON X MD*' }, { quoted: m });
            }
        }
    });
});

app.listen(PORT, () => console.log(`😈 DEMON X MD Server Running on port: ${PORT}`));
