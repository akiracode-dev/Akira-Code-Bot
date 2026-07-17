const fs = require('fs');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

// ===================== KONFIGURASI =====================
const OWNER_IDS = [
    '107636208980218',
    '120363409418959387'
];
const GROQ_API_KEY = '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';

let BOT_ACTIVE = true;
const mutedUsers = new Map();

// ===================== AUTO DELETE SESSION =====================
if (fs.existsSync('auth_info')) {
    console.log('🗑️  Hapus session lama...');
    fs.rmSync('auth_info', { recursive: true, force: true });
    console.log('✅ Session dihapus! QR akan muncul ulang.');
}

// ===================== REAKSI OTOMATIS =====================
const commandReactions = {
    '.ai': '🧠',
    '.spotify': '🎵',
    '.tt': '📱',
    '.dall': '🗑️',
    '.infobot': '🤖',
    '.ping': '🏓',
    '.owner': '👤',
    '.menu': '📋',
    '.listmember': '👥',
    '.infogrup': '📊',
    '.mute': '🔇',
    '.unmute': '🔊',
    '.off': '🛑',
    '.on': '✅',
    '.d': '🗑️',
    '.kick': '👢',
    '.admin': '👑',
    '.unadmin': '⬇️',
    '.test': '🧪'
};

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const bot = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ['Chrome (Linux)', '', ''],
    });

    bot.ev.on('creds.update', saveCreds);

    bot.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('📱 SCAN QR CODE INI:');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'open') {
            console.log('✅ Bot konek!');
            console.log(`📌 Owner IDs: ${OWNER_IDS.join(', ')}`);
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('🔄 Nyambung ulang...');
                startBot();
            } else {
                console.log('❌ Logout, scan ulang.');
            }
        }
    });

    bot.ev.on('messages.upsert', async (msgUpdate) => {
        const msg = msgUpdate.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        let target = msg.key.remoteJid;
        let senderId = target.split('@')[0];

        if (target.includes('@g.us')) {
            const participant = msg.key.participant || msg.participant;
            if (participant) {
                senderId = participant.split('@')[0];
            }
        }

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const lowerText = text.toLowerCase().trim();
        const isOwner = OWNER_IDS.includes(senderId);

        console.log(`📱 Target: ${target} | Owner: ${isOwner}`);

        // ===== CEK MUTE =====
        if (mutedUsers.has(senderId) && !OWNER_IDS.includes(senderId)) {
            try {
                await bot.sendMessage(target, { delete: msg.key });
                console.log(`🔇 Pesan dari ${senderId} dihapus (mute).`);
            } catch (error) {
                console.log('Gagal hapus pesan muted:', error);
            }
            return;
        }

        // ===== REAKSI OTOMATIS =====
        let isCommand = false;
        let reactionEmoji = '👀';
        for (const [cmd, emoji] of Object.entries(commandReactions)) {
            if (lowerText === cmd || lowerText.startsWith(cmd + ' ')) {
                isCommand = true;
                reactionEmoji = emoji;
                break;
            }
        }
        if (isCommand) {
            try {
                await bot.sendMessage(target, { react: { text: reactionEmoji, key: msg.key } });
            } catch (error) {}
        }

        // ===== OFF / ON =====
        if (lowerText === '.off') {
            if (!isOwner) {
                await bot.sendMessage(target, { text: '❌ *Perintah ini hanya untuk Owner!*' });
                return;
            }
            BOT_ACTIVE = false;
            await bot.sendMessage(target, { text: '🛑 Bot dimatikan oleh owner.' });
            return;
        }
        if (lowerText === '.on') {
            if (!isOwner) {
                await bot.sendMessage(target, { text: '❌ *Perintah ini hanya untuk Owner!*' });
                return;
            }
            BOT_ACTIVE = true;
            await bot.sendMessage(target, { text: '✅ Bot diaktifkan kembali.' });
            return;
        }

        // ===== CEK BOT ACTIVE =====
        if (!BOT_ACTIVE) {
            if (!lowerText.startsWith('.')) {
                return;
            }
            if (isOwner) {
                await bot.sendMessage(target, { text: '⛔ Bot sedang OFF. Ketik .on untuk menyalakan.' });
            } else {
                await bot.sendMessage(target, { text: '⛔ Bot sedang OFF.' });
            }
            return;
        }

        // ===================== .ai =====================
        if (lowerText === '.ai') {
            await bot.sendMessage(target, {
                text: `⚠️ *Cara Pakai AI*\n\nKirim: .ai [pertanyaan]\nContoh: .ai apa itu black hole?`
            });
            return;
        }
        if (lowerText.startsWith('.ai ')) {
            const promptText = text.replace(/^\.ai\s*/, '').trim();
            await bot.sendMessage(target, { text: '🤔 Lagi mikir...' });
            try {
                const response = await axios.post(
                    'https://api.groq.com/openai/v1/chat/completions',
                    { model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: promptText }] },
                    { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` } }
                );
                const reply = response.data.choices[0].message.content;
                await bot.sendMessage(target, { text: `🧠 *AI:*\n\n${reply}` });
            } catch (error) {
                console.error('AI error:', error);
                await bot.sendMessage(target, { text: '❌ Gagal panggil AI. Coba lagi nanti.' });
            }
        }

        // ===================== .spotify =====================
        if (lowerText.startsWith('.spotify ')) {
            const query = text.replace(/^\.spotify\s*/, '').trim();

            if (!query) {
                await bot.sendMessage(target, {
                    text: '⚠️ *Cara Pakai .spotify*\n\n.spotify [judul lagu / link spotify]\nContoh: .spotify denok'
                });
                return;
            }

            await bot.sendMessage(target, { text: '⏳ Mengambil data spotify...' });

            try {
                const { data } = await axios.get('https://api.ikyyxd.my.id/search/spotifyplay', {
                    params: { query: query }
                });

                if (!data.status || !data.result) {
                    throw new Error('Spotify gagal');
                }

                const res = data.result;
                const title = res.title || 'Unknown';
                const artist = res.artist || 'Unknown';
                const album = res.album || 'Unknown';
                const duration = res.duration || '-';
                const thumbnail = res.thumbnail;
                const audioUrl = res.download;

                if (!audioUrl || !audioUrl.startsWith('http')) {
                    await bot.sendMessage(target, { text: '❌ Link download tidak tersedia!' });
                    return;
                }

                if (thumbnail) {
                    await bot.sendMessage(target, {
                        image: { url: thumbnail },
                        caption: `🎵 *${title}*\n\n👤 Artist: ${artist}\n💿 Album: ${album}\n⏱️ Durasi: ${duration}\n🎧 Source: Spotify\n\n⬇️ Sedang mengirim audio...`
                    });
                }

                await bot.sendMessage(target, {
                    audio: { url: audioUrl },
                    mimetype: 'audio/mpeg',
                    caption: `✅ *${title}* - ${artist}`
                });

            } catch (error) {
                console.error('Spotify error:', error);
                await bot.sendMessage(target, { text: '❌ Terjadi kesalahan! Coba lagi nanti.' });
            }
        }

        // ===================== .tt =====================
        if (lowerText.startsWith('.tt ')) {
            const url = text.replace(/^\.tt\s*/, '').trim();

            if (!url || !url.includes('tiktok.com')) {
                await bot.sendMessage(target, {
                    text: '⚠️ *Cara Pakai .tt*\n\n.tt [url tiktok]\nContoh: .tt https://www.tiktok.com/@xxx/video/xxx'
                });
                return;
            }

            await bot.sendMessage(target, { text: '📥 Lagi download TikTok...' });

            try {
                const response = await axios.post(
                    'https://www.puruboy.kozow.com/api/downloader/tiktok',
                    { url: url },
                    {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 30000
                    }
                );

                console.log('📡 Response:', response.data);

                if (!response.data || !response.data.success) {
                    throw new Error('Gagal download');
                }

                const detail = response.data.result?.detail || {};

                const videoUrl = detail.download_url || detail.play_url;

                if (!videoUrl) {
                    throw new Error('Link video tidak ditemukan');
                }

                const title = detail.title || 'TikTok Video';
                const author = detail.author?.nickname || detail.author?.unique_id || 'Tidak diketahui';
                const duration = detail.duration || '-';

                await bot.sendMessage(target, {
                    video: { url: videoUrl },
                    caption: `✅ *TikTok berhasil di download!*\n\n📌 *Title:* ${title}\n👤 *Author:* ${author}\n⏱️ *Durasi:* ${duration}s`
                });

            } catch (error) {
                console.error('TT error:', error);
                await bot.sendMessage(target, {
                    text: '❌ Gagal download! Coba lagi nanti.'
                });
            }
        }

        // ===================== .dall =====================
        if (lowerText === '.dall') {
            if (!isOwner) {
                await bot.sendMessage(target, { text: '❌ *Perintah ini hanya untuk Owner!*' });
                return;
            }

            if (!target.includes('@g.us')) {
                await bot.sendMessage(target, { text: '⚠️ Perintah ini hanya bisa dipakai di grup!' });
                return;
            }

            await bot.sendMessage(target, { text: '🗑️ Lagi hapus semua pesan...' });

            try {
                const messages = await bot.loadMessages(target, 100);
                let deleted = 0;
                for (const msg of messages) {
                    try {
                        await bot.sendMessage(target, {
                            delete: {
                                remoteJid: target,
                                fromMe: false,
                                id: msg.key.id,
                                participant: msg.key.participant || msg.key.remoteJid,
                            }
                        });
                        deleted++;
                    } catch (e) {}
                }
                await bot.sendMessage(target, { 
                    text: `✅ *${deleted} pesan* berhasil dihapus!` 
                });
            } catch (error) {
                console.error('DALL error:', error);
                await bot.sendMessage(target, { text: '❌ Gagal hapus semua pesan! Pastikan bot admin.' });
            }
        }

        // ===================== .infobot =====================
        if (lowerText === '.infobot') {
            const uptime = process.uptime();
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);
            await bot.sendMessage(target, {
                text: `🤖 *INFO BOT*\n\n` +
                      `✅ Status: Aktif\n` +
                      `⏱️ Uptime: ${hours}h ${minutes}m ${seconds}s\n` +
                      `🔧 Fitur: .ai, .spotify, .tt, .dall, .ping, .menu, .listmember, .infogrup, .mute, .unmute`
            });
        }

        // ===================== .ping =====================
        if (lowerText === '.ping') {
            const start = Date.now();
            await bot.sendMessage(target, { text: '🏓 Pong!' });
            const end = Date.now();
            await bot.sendMessage(target, { text: `⏱️ ${end - start} ms` });
        }

        // ===================== .owner =====================
        if (lowerText === '.owner') {
            await bot.sendMessage(target, {
                text: `👤 *OWNER BOT*\n\n` +
                      `📌 Nama: Hafizh\n` +
                      `📱 WhatsApp: +62 857-7331-5590`
            });
        }

        // ===================== .menu =====================
        if (lowerText === '.menu') {
            await bot.sendMessage(target, {
                text: `📋 *MENU BOT*\n\n` +
                      `📌 *FITUR UMUM*\n` +
                      `➡️ .ai [pertanyaan] - Chat AI\n` +
                      `➡️ .spotify [judul/link] - Download lagu Spotify\n` +
                      `➡️ .tt [url] - Download TikTok\n` +
                      `➡️ .ping - Test kecepatan\n` +
                      `➡️ .owner - Info owner\n` +
                      `➡️ .infobot - Info bot\n` +
                      `\n` +
                      `🔐 *FITUR OWNER*\n` +
                      `➡️ .dall - Hapus semua pesan di grup\n` +
                      `➡️ .mute @user - Mute user\n` +
                      `➡️ .unmute @user - Unmute user\n` +
                      `➡️ .listmember - Daftar member\n` +
                      `➡️ .infogrup - Info grup\n` +
                      `➡️ .off - Matikan bot\n` +
                      `➡️ .on - Hidupkan bot\n` +
                      `➡️ .d (reply) - Hapus pesan\n` +
                      `➡️ .kick @user - Kick member\n` +
                      `➡️ .admin (reply) - Tambah admin\n` +
                      `➡️ .unadmin (reply) - Keluarkan admin`
            });
        }

        // ===================== .mute =====================
        if (lowerText === '.mute') {
            if (!isOwner) {
                await bot.sendMessage(target, { text: '❌ *Perintah ini hanya untuk Owner!*' });
                return;
            }
            let userToMute = null;
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quotedMsg) {
                userToMute = msg.message.extendedTextMessage.contextInfo.participant || 
                             msg.message.extendedTextMessage.contextInfo.mentionedJid?.[0];
            }
            if (!userToMute) {
                const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
                if (mentioned && mentioned.length > 0) {
                    userToMute = mentioned[0];
                }
            }
            if (!userToMute) {
                await bot.sendMessage(target, { text: '⚠️ Tag atau reply pesan user yang mau di-mute!' });
                return;
            }
            const userId = userToMute.split('@')[0];
            if (OWNER_IDS.includes(userId)) {
                await bot.sendMessage(target, { text: '❌ Tidak bisa mute Owner!' });
                return;
            }
            mutedUsers.set(userId, true);
            await bot.sendMessage(target, {
                text: `🔇 @${userId} berhasil di-mute!`,
                mentions: [userToMute]
            });
        }

        // ===================== .unmute =====================
        if (lowerText === '.unmute') {
            if (!isOwner) {
                await bot.sendMessage(target, { text: '❌ *Perintah ini hanya untuk Owner!*' });
                return;
            }
            let userToUnmute = null;
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quotedMsg) {
                userToUnmute = msg.message.extendedTextMessage.contextInfo.participant || 
                               msg.message.extendedTextMessage.contextInfo.mentionedJid?.[0];
            }
            if (!userToUnmute) {
                const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
                if (mentioned && mentioned.length > 0) {
                    userToUnmute = mentioned[0];
                }
            }
            if (!userToUnmute) {
                await bot.sendMessage(target, { text: '⚠️ Tag atau reply pesan user yang mau di-unmute!' });
                return;
            }
            const userId = userToUnmute.split('@')[0];
            if (!mutedUsers.has(userId)) {
                await bot.sendMessage(target, { text: `ℹ️ @${userId} tidak sedang di-mute.`, mentions: [userToUnmute] });
                return;
            }
            mutedUsers.delete(userId);
            await bot.sendMessage(target, {
                text: `🔊 @${userId} berhasil di-unmute!`,
                mentions: [userToUnmute]
            });
        }

        // ===================== .listmember =====================
        if (lowerText === '.listmember') {
            if (!isOwner) {
                await bot.sendMessage(target, { text: '❌ *Perintah ini hanya untuk Owner!*' });
                return;
            }
            try {
                const metadata = await bot.groupMetadata(target);
                let list = '👥 *DAFTAR MEMBER*\n\n';
                metadata.participants.forEach((p, i) => {
                    const isAdmin = p.admin ? '👑' : '👤';
                    list += `${i+1}. ${isAdmin} @${p.id.split('@')[0]}\n`;
                });
                await bot.sendMessage(target, {
                    text: list,
                    mentions: metadata.participants.map(p => p.id)
                });
            } catch (e) {
                await bot.sendMessage(target, { text: '❌ Gagal ambil data member!' });
            }
        }

        // ===================== .infogrup =====================
        if (lowerText === '.infogrup') {
            if (!isOwner) {
                await bot.sendMessage(target, { text: '❌ *Perintah ini hanya untuk Owner!*' });
                return;
            }
            try {
                const metadata = await bot.groupMetadata(target);
                const admins = metadata.participants.filter(p => p.admin);
                await bot.sendMessage(target, {
                    text: `📋 *INFO GRUP*\n\n` +
                          `📌 Nama: ${metadata.subject}\n` +
                          `👥 Anggota: ${metadata.participants.length}\n` +
                          `👑 Admin: ${admins.length}\n` +
                          `📅 Dibuat: ${new Date(metadata.creation * 1000).toLocaleDateString()}`
                });
            } catch (e) {
                await bot.sendMessage(target, { text: '❌ Gagal ambil info grup! Pastikan ini grup.' });
            }
        }

        // ===================== OWNER ONLY =====================
        if (!isOwner) {
            const ownerCommands = ['.d', '.kick', '.admin', '.unadmin', '.test'];
            if (ownerCommands.some(cmd => lowerText === cmd || lowerText.startsWith(cmd + ' '))) {
                await bot.sendMessage(target, { text: '❌ *Perintah ini hanya untuk Owner!*' });
            }
            return;
        }

        if (lowerText === '.test') {
            await bot.sendMessage(target, { text: '✅ Bot aktif dan owner terdeteksi!' });
        }

        if (lowerText === '.d') {
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quotedMsg) {
                await bot.sendMessage(target, { text: '⚠️ Reply pesan yang mau dihapus!' });
                return;
            }
            try {
                await bot.sendMessage(target, {
                    delete: {
                        remoteJid: target,
                        fromMe: false,
                        id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                        participant: msg.message.extendedTextMessage.contextInfo.participant || target,
                    }
                });
                await bot.sendMessage(target, { react: { text: '✅', key: msg.key } });
            } catch (e) {
                await bot.sendMessage(target, { text: '❌ Gagal hapus pesan!' });
            }
        }

        if (lowerText.startsWith('.kick ')) {
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
            if (!mentioned || mentioned.length === 0) {
                await bot.sendMessage(target, { text: '⚠️ Tag user! Contoh: .kick @user' });
                return;
            }
            const kickTarget = mentioned[0];
            if (OWNER_IDS.includes(kickTarget.split('@')[0])) {
                await bot.sendMessage(target, { text: '❌ Tidak bisa kick Owner!' });
                return;
            }
            try {
                await bot.groupParticipantsUpdate(target, [kickTarget], 'remove');
                await bot.sendMessage(target, {
                    text: `✅ @${kickTarget.split('@')[0]} di-kick!`,
                    mentions: [kickTarget],
                });
            } catch (e) {
                await bot.sendMessage(target, { text: '❌ Gagal kick! Pastikan bot admin.' });
            }
        }

        if (lowerText === '.admin') {
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quotedMsg) {
                await bot.sendMessage(target, { text: '⚠️ Reply pesan orang yang mau dijadikan admin!' });
                return;
            }
            const adminTarget = msg.message.extendedTextMessage.contextInfo.participant || 
                                msg.message.extendedTextMessage.contextInfo.mentionedJid?.[0];
            if (!adminTarget) {
                await bot.sendMessage(target, { text: '❌ Gagal dapatkan target!' });
                return;
            }
            if (OWNER_IDS.includes(adminTarget.split('@')[0])) {
                await bot.sendMessage(target, { text: '❌ Owner sudah admin!' });
                return;
            }
            try {
                await bot.groupParticipantsUpdate(target, [adminTarget], 'promote');
                const nama = adminTarget.split('@')[0];
                await bot.sendMessage(target, {
                    text: `✦AKIRA CODE ✦\n───────────── ⋆⋅☆⋅⋆ ─────────────\n✅ @${nama} Berhasil Di Tambahkan Ke Admin!`,
                    mentions: [adminTarget],
                });
            } catch (e) {
                await bot.sendMessage(target, { text: '❌ Gagal promote! Pastikan bot admin.' });
            }
        }

        if (lowerText === '.unadmin') {
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quotedMsg) {
                await bot.sendMessage(target, { text: '⚠️ Reply pesan orang yang mau dikeluarkan dari admin!' });
                return;
            }
            const unadminTarget = msg.message.extendedTextMessage.contextInfo.participant || 
                                  msg.message.extendedTextMessage.contextInfo.mentionedJid?.[0];
            if (!unadminTarget) {
                await bot.sendMessage(target, { text: '❌ Gagal dapatkan target!' });
                return;
            }
            if (OWNER_IDS.includes(unadminTarget.split('@')[0])) {
                await bot.sendMessage(target, { text: '❌ Tidak bisa mengeluarkan Owner dari admin!' });
                return;
            }
            try {
                await bot.groupParticipantsUpdate(target, [unadminTarget], 'demote');
                const nama = unadminTarget.split('@')[0];
                await bot.sendMessage(target, {
                    text: `✦AKIRA CODE ✦\n───────────── ⋆⋅☆⋅⋆ ─────────────\n✅ @${nama} Berhasil Di Keluarkan Dari Admin!`,
                    mentions: [unadminTarget],
                });
            } catch (e) {
                await bot.sendMessage(target, { text: '❌ Gagal demote! Pastikan bot admin.' });
            }
        }
    });
}

startBot();
console.log('🚀 BOT FINAL JALAN...');