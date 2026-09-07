import { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } from 'discord.js';

// Inicializar el cliente con los intents necesarios
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const PREFIX = '!'; // Prefijo para los comandos

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
});

// Reemplaza 'TU_TOKEN_AQUI' con el token de tu bot de Discord Developer Portal
client.login('MTU0NjM3ODI3NDYwMTQ0MzM1OA.GS3hdA.GC0qvwvuaPaev4unn6m4h0hHZ940RdQ2kUiBcM');
