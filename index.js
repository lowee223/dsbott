import { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } from 'discord.js';
import fs from 'fs';
import { DisTube } from 'distube';
import { YouTubePlugin } from '@distube/youtube';

// Inicializar el cliente con los intents necesarios
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const PREFIX = '!'; // Prefijo para los comandos

// ==========================================
// SISTEMA DE WARNS (persistente en JSON)
// ==========================================
const WARNS_FILE = './warns.json';

function loadWarns() {
    if (!fs.existsSync(WARNS_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(WARNS_FILE, 'utf8'));
    } catch {
        return {};
    }
}

function saveWarns(data) {
    fs.writeFileSync(WARNS_FILE, JSON.stringify(data, null, 2));
}

function addWarn(guildId, userId, reason, moderator) {
    const warns = loadWarns();
    if (!warns[guildId]) warns[guildId] = {};
    if (!warns[guildId][userId]) warns[guildId][userId] = [];

    warns[guildId][userId].push({
        reason,
        moderator,
        date: new Date().toISOString()
    });

    saveWarns(warns);
    return warns[guildId][userId].length;
}

function getWarns(guildId, userId) {
    const warns = loadWarns();
    return warns[guildId]?.[userId] || [];
}

function clearWarns(guildId, userId) {
    const warns = loadWarns();
    if (warns[guildId]?.[userId]) {
        delete warns[guildId][userId];
        saveWarns(warns);
        return true;
    }
    return false;
}

// ==========================================
// HELPER: Convertir texto de tiempo a milisegundos (para mute)
// Ej: "10m", "1h", "2d"
// ==========================================
function parseDuration(input) {
    const match = input?.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2];

    const multipliers = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000
    };

    const ms = value * multipliers[unit];
    return ms > 28 * 24 * 60 * 60 * 1000 ? null : ms; // Discord limita el timeout a 28 días máx
}

// ==========================================
// SISTEMA DE MÚSICA
// ==========================================
const distube = new DisTube(client, {
    emitNewSongOnly: true,
    plugins: [new YouTubePlugin()]
});

// Eventos de DisTube (mensajes automáticos)
distube.on('playSong', (queue, song) => {
    queue.textChannel.send(`🎶 Reproduciendo ahora: **${song.name}** - \`${song.formatDuration()}\` (pedido por ${song.user})`);
});

distube.on('addSong', (queue, song) => {
    queue.textChannel.send(`✅ Agregado a la cola: **${song.name}** - \`${song.formatDuration()}\``);
});

distube.on('finish', (queue) => {
    queue.textChannel.send('🏁 Se terminó la cola de reproducción.');
});

distube.on('empty', (queue) => {
    queue.textChannel.send('👋 Todos salieron del canal de voz, dejando de reproducir.');
});

distube.on('error', (textChannel, error) => {
    console.error(error);
    textChannel?.send(`❌ Ocurrió un error: ${error.message.slice(0, 1900)}`);
});

client.once('ready', () => {
    console.log(`¡Bot conectado exitosamente como ${client.user.tag}!`);
    client.user.setActivity('Moderando el servidor', { type: 3 }); // Estado tipo "Viendo"
});

// ==========================================
// SISTEMA DE BIENVENIDAS
// ==========================================
client.on('guildMemberAdd', (member) => {
    // ID del canal donde se enviará la bienvenida (cámbialo por el tuyo)
    const channelId = '1546378750361608202';
    const channel = member.guild.channels.cache.get(channelId);

    if (!channel) return;

    // Crear un mensaje visualmente atractivo (Embed)
    const welcomeEmbed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('¡Nuevo miembro en la tripulación! 🎉')
        .setDescription(`¡Hola ${member}, bienvenido/a a **${member.guild.name}**! Esperamos que disfrutes tu estancia aquí.`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: 'Reglas', value: 'Por favor, lee las reglas del servidor.', inline: true },
            { name: 'Total de miembros', value: `${member.guild.memberCount}`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Sistema de Bienvenidas' });

    channel.send({ embeds: [welcomeEmbed] });
});

// ==========================================
// SISTEMA DE MODERACIÓN Y COMANDOS
// ==========================================
client.on('messageCreate', async (message) => {
    // Ignorar mensajes de bots o que no empiecen con el prefijo
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Comando !kick (Expulsar)
    if (command === 'kick') {
        // Verificar permisos del usuario que ejecuta el comando
        if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
            return message.reply('❌ No tienes permisos para expulsar miembros.');
        }

        const user = message.mentions.users.first();
        const reason = args.slice(1).join(' ') || 'No se especificó una razón';

        if (!user) return message.reply('⚠️ Debes mencionar a un usuario para expulsar.');

        const member = message.guild.members.cache.get(user.id);

        if (!member) return message.reply('❌ Usuario no encontrado en el servidor.');
        if (!member.kickable) return message.reply('❌ No puedo expulsar a este usuario (su rol es superior al mío o es admin).');

        try {
            await member.kick(reason);
            message.channel.send(`✅ **${user.tag}** ha sido expulsado del servidor. Razón: ${reason}`);
        } catch (error) {
            console.error(error);
            message.reply('❌ Ocurrió un error al intentar expulsar al usuario.');
        }
    }

    // Comando !ban (Banear)
    if (command === 'ban') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            return message.reply('❌ No tienes permisos para banear miembros.');
        }

        const user = message.mentions.users.first();
        const reason = args.slice(1).join(' ') || 'No se especificó una razón';

        if (!user) return message.reply('⚠️ Debes mencionar a un usuario para banear.');

        const member = message.guild.members.cache.get(user.id);

        if (!member) return message.reply('❌ Usuario no encontrado en el servidor.');
        if (!member.bannable) return message.reply('❌ No puedo banear a este usuario.');

        try {
            await member.ban({ reason });
            message.channel.send(`🔨 **${user.tag}** ha sido baneado del servidor. Razón: ${reason}`);
        } catch (error) {
            console.error(error);
            message.reply('❌ Ocurrió un error al intentar banear al usuario.');
        }
    }

    // Comando !purge / !clear (Borrar mensajes)
    if (command === 'purge' || command === 'clear') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return message.reply('❌ No tienes permisos para gestionar mensajes.');
        }

        const amount = parseInt(args[0]);

        if (isNaN(amount) || amount <= 0 || amount > 100) {
            return message.reply('⚠️ Por favor, introduce un número válido de mensajes a borrar (entre 1 y 100).');
        }

        try {
            await message.channel.bulkDelete(amount, true);
            const confirmation = await message.channel.send(`🧹 Se han borrado **${amount}** mensajes correctamente.`);
            setTimeout(() => confirmation.delete().catch(() => {}), 4000); // Borra el aviso a los 4s
        } catch (error) {
            console.error(error);
            message.reply('❌ No se pudieron borrar los mensajes (es posible que sean más antiguos de 14 días).');
        }
    }

    // Comando !mute (Timeout temporal)
    if (command === 'mute') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
            return message.reply('❌ No tienes permisos para mutear miembros.');
        }

        const user = message.mentions.users.first();
        const durationInput = args[1];
        const reason = args.slice(2).join(' ') || 'No se especificó una razón';

        if (!user) return message.reply('⚠️ Debes mencionar a un usuario para mutear.');
        if (!durationInput) return message.reply('⚠️ Debes indicar una duración. Ej: `!mute @usuario 10m Spam`');

        const durationMs = parseDuration(durationInput);
        if (!durationMs) return message.reply('⚠️ Formato de duración inválido. Usa: `10s`, `10m`, `1h`, `1d` (máximo 28 días).');

        const member = message.guild.members.cache.get(user.id);

        if (!member) return message.reply('❌ Usuario no encontrado en el servidor.');
        if (!member.moderatable) return message.reply('❌ No puedo mutear a este usuario (su rol es superior al mío o es admin).');

        try {
            await member.timeout(durationMs, reason);
            message.channel.send(`🔇 **${user.tag}** ha sido muteado por \`${durationInput}\`. Razón: ${reason}`);
        } catch (error) {
            console.error(error);
            message.reply('❌ Ocurrió un error al intentar mutear al usuario.');
        }
    }

    // Comando !unmute (Quitar timeout)
    if (command === 'unmute') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
            return message.reply('❌ No tienes permisos para desmutear miembros.');
        }

        const user = message.mentions.users.first();
        if (!user) return message.reply('⚠️ Debes mencionar a un usuario para desmutear.');

        const member = message.guild.members.cache.get(user.id);
        if (!member) return message.reply('❌ Usuario no encontrado en el servidor.');

        try {
            await member.timeout(null);
            message.channel.send(`🔊 **${user.tag}** ha sido desmuteado correctamente.`);
        } catch (error) {
            console.error(error);
            message.reply('❌ Ocurrió un error al intentar desmutear al usuario.');
        }
    }

    // Comando !warn (Advertir usuario)
    if (command === 'warn') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
            return message.reply('❌ No tienes permisos para advertir miembros.');
        }

        const user = message.mentions.users.first();
        const reason = args.slice(1).join(' ') || 'No se especificó una razón';

        if (!user) return message.reply('⚠️ Debes mencionar a un usuario para advertir.');

        const totalWarns = addWarn(message.guild.id, user.id, reason, message.author.tag);

        const warnEmbed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('⚠️ Usuario Advertido')
            .setDescription(`${user} ha recibido una advertencia.`)
            .addFields(
                { name: 'Razón', value: reason },
                { name: 'Advertencias totales', value: `${totalWarns}`, inline: true },
                { name: 'Moderador', value: message.author.tag, inline: true }
            )
            .setTimestamp();

        message.channel.send({ embeds: [warnEmbed] });
    }

    // Comando !warns (Ver advertencias de un usuario)
    if (command === 'warns') {
        const user = message.mentions.users.first() || message.author;
        const userWarns = getWarns(message.guild.id, user.id);

        if (userWarns.length === 0) {
            return message.reply(`✅ **${user.tag}** no tiene advertencias.`);
        }

        const warnsList = userWarns
            .map((w, i) => `**${i + 1}.** ${w.reason} — *por ${w.moderator}* (${new Date(w.date).toLocaleDateString()})`)
            .join('\n');

        const listEmbed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle(`Advertencias de ${user.tag}`)
            .setDescription(warnsList)
            .setFooter({ text: `Total: ${userWarns.length}` });

        message.channel.send({ embeds: [listEmbed] });
    }

    // Comando !clearwarns (Borrar todas las advertencias de un usuario)
    if (command === 'clearwarns') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
            return message.reply('❌ No tienes permisos para limpiar advertencias.');
        }

        const user = message.mentions.users.first();
        if (!user) return message.reply('⚠️ Debes mencionar a un usuario.');

        const cleared = clearWarns(message.guild.id, user.id);

        if (cleared) {
            message.channel.send(`🧹 Se han eliminado todas las advertencias de **${user.tag}**.`);
        } else {
            message.reply(`ℹ️ **${user.tag}** no tenía advertencias registradas.`);
        }
    }

    // Comando !play (Reproducir música)
    if (command === 'play') {
        const query = args.join(' ');

        if (!message.member.voice.channel) {
            return message.reply('⚠️ Debes estar en un canal de voz para reproducir música.');
        }
        if (!query) {
            return message.reply('⚠️ Debes indicar el nombre de una canción o un link. Ej: `!play never gonna give you up`');
        }

        try {
            await distube.play(message.member.voice.channel, query, {
                member: message.member,
                textChannel: message.channel,
                message
            });
        } catch (error) {
            console.error(error);
            message.reply('❌ No se pudo reproducir esa canción.');
        }
    }

    // Comando !skip (Saltar canción)
    if (command === 'skip') {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply('⚠️ No hay ninguna canción sonando.');

        try {
            await queue.skip();
            message.channel.send('⏭️ Canción saltada.');
        } catch (error) {
            message.reply('❌ No hay más canciones en la cola para saltar.');
        }
    }

    // Comando !stop (Detener y limpiar la cola)
    if (command === 'stop') {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply('⚠️ No hay ninguna canción sonando.');

        queue.stop();
        message.channel.send('⏹️ Reproducción detenida y cola limpiada.');
    }

    // Comando !pause (Pausar)
    if (command === 'pause') {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply('⚠️ No hay ninguna canción sonando.');

        queue.pause();
        message.channel.send('⏸️ Música pausada.');
    }

    // Comando !resume (Reanudar)
    if (command === 'resume') {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply('⚠️ No hay ninguna canción sonando.');

        queue.resume();
        message.channel.send('▶️ Música reanudada.');
    }

    // Comando !queue (Ver la cola)
    if (command === 'queue') {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply('⚠️ No hay ninguna cola activa.');

        const list = queue.songs
            .map((song, i) => `${i === 0 ? '▶️' : `${i}.`} **${song.name}** - \`${song.formatDuration()}\``)
            .slice(0, 10)
            .join('\n');

        const queueEmbed = new EmbedBuilder()
            .setColor('#1DB954')
            .setTitle('🎵 Cola de reproducción')
            .setDescription(list);

        message.channel.send({ embeds: [queueEmbed] });
    }

    // Comando !volume (Cambiar volumen, 0-100)
    if (command === 'volume') {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply('⚠️ No hay ninguna canción sonando.');

        const vol = parseInt(args[0]);
        if (isNaN(vol) || vol < 0 || vol > 100) {
            return message.reply('⚠️ Indica un volumen válido entre 0 y 100.');
        }

        queue.setVolume(vol);
        message.channel.send(`🔊 Volumen ajustado a **${vol}%**.`);
    }
});