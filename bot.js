const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

// ==================== CONFIGURATION ====================
// Railway environment variables ব্যবহার করুন
const CONFIG = {
    BOT_TOKEN: process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE',
    PREFIX: './',
    GUILD_ID: process.env.GUILD_ID || 'YOUR_SERVER_ID',
    ORDER_CHANNEL_ID: process.env.ORDER_CHANNEL_ID || 'ORDER_CHANNEL_ID'
};

const MESSAGES = {
    APPROVAL_SUCCESS: '🎉 **YOUR ORDER APPROVED!**\nYour purchase has been approved successfully!',
    ORDER_NOT_FOUND: '❌ Order ID not found in pending orders.',
    NO_PERMISSION: '❌ You do not have permission to approve orders.',
    INVALID_COMMAND: '❌ Usage: `./approved <order_id>`',
    NO_PENDING_ORDERS: '📭 No pending orders found.'
};

// ==================== BOT SETUP ====================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Memory storage (Railway এ restart হলে reset হবে)
const pendingOrders = new Map();

// ==================== BOT EVENTS ====================
client.on('ready', () => {
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    console.log(`📊 Bot is running on ${client.guilds.cache.size} servers`);
    console.log(`🚀 Drk Survraze Order Bot is ready!`);
    
    // Activity set করুন
    client.user.setActivity('./approved | Drk Survraze', { type: 'WATCHING' });
});

// Webhook message process
client.on('messageCreate', async (message) => {
    try {
        // Webhook messages process
        if (message.author.bot && message.webhookId) {
            await processWebhookOrder(message);
            return;
        }
        
        // Commands process
        if (message.content.startsWith(`${CONFIG.PREFIX}approved`)) {
            await handleApprovalCommand(message);
        } else if (message.content === `${CONFIG.PREFIX}orders`) {
            await handleOrdersCommand(message);
        } else if (message.content === `${CONFIG.PREFIX}ping`) {
            await message.reply(`🏓 Pong! Latency: ${Date.now() - message.createdTimestamp}ms`);
        } else if (message.content === `${CONFIG.PREFIX}help`) {
            await handleHelpCommand(message);
        }
    } catch (error) {
        console.error('Message processing error:', error);
    }
});

// ==================== FUNCTIONS ====================

async function processWebhookOrder(message) {
    try {
        if (message.embeds && message.embeds.length > 0) {
            const embed = message.embeds[0];
            const orderId = extractOrderId(embed);
            const discordUsername = extractDiscordUsername(embed);
            
            if (orderId && discordUsername) {
                // Order store করুন
                pendingOrders.set(orderId, {
                    discordUsername: discordUsername,
                    messageId: message.id,
                    channelId: message.channel.id,
                    timestamp: new Date(),
                    originalEmbed: embed
                });
                
                console.log(`📦 New order stored: ${orderId} for ${discordUsername}`);
                
                // Admin কে notify করুন
                try {
                    await message.channel.send(`📥 New order received: \`${orderId}\` for ${discordUsername}`);
                } catch (notifyError) {
                    console.log('Could not send notification message');
                }
            }
        }
    } catch (error) {
        console.error('Webhook processing error:', error);
    }
}

function extractOrderId(embed) {
    if (!embed.fields) return null;
    
    for (let field of embed.fields) {
        if (field.value && field.value.includes('ORD_')) {
            const match = field.value.match(/(ORD_[\w]+)/);
            if (match) return match[1];
        }
        if (field.name.includes('Order') || field.name.includes('🆔')) {
            const match = field.value.match(/(ORD_[\w]+)/);
            if (match) return match[1];
            return field.value.replace(/[`]/g, '').trim();
        }
    }
    return null;
}

function extractDiscordUsername(embed) {
    if (!embed.fields) return null;
    
    for (let field of embed.fields) {
        if (field.name.includes('Discord') || field.name.includes('👤') || field.name.includes('Username')) {
            return field.value.replace(/[`]/g, '').trim();
        }
    }
    
    // Fallback: সব fields check করুন
    for (let field of embed.fields) {
        if (field.value && (field.value.includes('#') || field.value.toLowerCase().includes('discord'))) {
            return field.value.replace(/[`]/g, '').trim();
        }
    }
    
    return null;
}

async function handleApprovalCommand(message) {
    // Permission check
    if (!message.member.permissions.has('ADMINISTRATOR')) {
        return message.reply(MESSAGES.NO_PERMISSION);
    }

    const args = message.content.split(' ');
    if (args.length < 2) {
        return message.reply(MESSAGES.INVALID_COMMAND);
    }

    const orderId = args[1];
    const orderInfo = pendingOrders.get(orderId);

    if (!orderInfo) {
        return message.reply(MESSAGES.ORDER_NOT_FOUND);
    }

    try {
        // User খুঁজুন
        const user = await findUserByUsername(orderInfo.discordUsername);
        
        if (user) {
            // User কে DM পাঠান
            const dmEmbed = new EmbedBuilder()
                .setTitle('🎉 ORDER APPROVED!')
                .setDescription(MESSAGES.APPROVAL_SUCCESS)
                .addFields(
                    { name: '🆔 Order ID', value: `\`${orderId}\``, inline: true },
                    { name: '⭐ Status', value: '✅ Approved', inline: true },
                    { name: '⏰ Approved At', value: new Date().toLocaleString(), inline: true }
                )
                .setColor(0x00FF00)
                .setFooter({ text: 'Drk Survraze SMP - Thank you for your purchase!' });

            await user.send({ embeds: [dmEmbed] });
            
            // Original message update করুন
            try {
                const channel = await client.channels.fetch(orderInfo.channelId);
                const originalMessage = await channel.messages.fetch(orderInfo.messageId);
                
                const approvedEmbed = EmbedBuilder.from(orderInfo.originalEmbed)
                    .setColor(0x00FF00)
                    .addFields(
                        { name: '✅ Approved By', value: message.author.tag, inline: true },
                        { name: '🕒 Approved At', value: new Date().toLocaleString(), inline: true }
                    );

                await originalMessage.edit({ 
                    embeds: [approvedEmbed],
                    components: []
                });
            } catch (editError) {
                console.log('Original message edit failed, but order was approved');
            }

            // Order remove করুন
            pendingOrders.delete(orderId);

            await message.reply(`✅ Order \`${orderId}\` approved! DM sent to ${orderInfo.discordUsername}`);
            
            console.log(`✅ Order ${orderId} approved for ${orderInfo.discordUsername}`);
        } else {
            await message.reply(`❌ User not found: ${orderInfo.discordUsername}`);
            pendingOrders.delete(orderId);
        }
    } catch (error) {
        console.error('Approval error:', error);
        await message.reply('❌ Error approving order.');
    }
}

async function findUserByUsername(username) {
    try {
        const cleanUsername = username.replace(/[`*_~|]/g, '').trim();
        console.log(`🔍 Searching user: ${cleanUsername}`);
        
        for (const guild of client.guilds.cache.values()) {
            try {
                await guild.members.fetch();
                
                const member = guild.members.cache.find(member => 
                    member.user.tag === cleanUsername ||
                    member.user.username === cleanUsername ||
                    member.displayName === cleanUsername
                );
                
                if (member) {
                    console.log(`✅ Found: ${member.user.tag}`);
                    return member.user;
                }
            } catch (guildError) {
                console.log(`Guild error: ${guild.name}`);
            }
        }
        
        return null;
    } catch (error) {
        console.error('Find user error:', error);
        return null;
    }
}

async function handleOrdersCommand(message) {
    if (!message.member.permissions.has('ADMINISTRATOR')) {
        return message.reply(MESSAGES.NO_PERMISSION);
    }

    if (pendingOrders.size === 0) {
        return message.reply(MESSAGES.NO_PENDING_ORDERS);
    }

    const ordersList = Array.from(pendingOrders.entries())
        .map(([orderId, info]) => 
            `• **${orderId}** - ${info.discordUsername} (${new Date(info.timestamp).toLocaleTimeString()})`
        )
        .join('\n');

    const embed = new EmbedBuilder()
        .setTitle('📦 Pending Orders')
        .setDescription(ordersList)
        .setColor(0xFFA500)
        .setFooter({ text: `Total: ${pendingOrders.size} orders` });

    await message.reply({ embeds: [embed] });
}

async function handleHelpCommand(message) {
    const helpEmbed = new EmbedBuilder()
        .setTitle('🤖 Drk Order Bot Help')
        .setDescription('Available commands:')
        .addFields(
            { name: './approved <order_id>', value: 'Approve an order and send DM to user', inline: false },
            { name: './orders', value: 'List all pending orders', inline: false },
            { name: './ping', value: 'Check bot latency', inline: false }
        )
        .setColor(0x0099FF)
        .setFooter({ text: 'Drk Survraze SMP - Order Management System' });

    await message.reply({ embeds: [helpEmbed] });
}

// ==================== ERROR HANDLING ====================
client.on('error', (error) => {
    console.error('❌ Client error:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
});

// ==================== START BOT ====================
console.log('🚀 Starting Drk Survraze Order Bot on Railway...');
client.login(CONFIG.BOT_TOKEN)
    .catch((error) => {
        console.error('❌ Login failed:', error);
        process.exit(1);
    });
