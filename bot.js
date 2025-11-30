const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');

// ==================== CONFIGURATION ====================
const CONFIG = {
    BOT_TOKEN: process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE',
    PREFIX: './',
    GUILD_ID: process.env.GUILD_ID || 'YOUR_SERVER_ID',
    ORDER_CHANNEL_ID: process.env.ORDER_CHANNEL_ID || 'ORDER_CHANNEL_ID',
    ALLOWED_COMMAND_CHANNEL_ID: process.env.ALLOWED_CHANNEL_ID || 'YOUR_ALLOWED_CHANNEL_ID',
    ANNOUNCEMENT_CHANNEL_ID: '1444273009069129811', // ✅ নতুন অ্যানাউন্সমেন্ট চ্যানেল
    DISCORD_INVITE_LINK: 'https://discord.gg/SjefnHedt'
};

const MESSAGES = {
    APPROVAL_SUCCESS: '🎉 **YOUR ORDER APPROVED!**\nYour purchase has been approved successfully!',
    REJECTION_MESSAGE: '❌ **YOUR ORDER REJECTED**\nIf you have any problem, please create a ticket on our Discord server.',
    DISMISS_SUCCESS: '🗑️ **ORDER DISMISSED**\nThe order has been dismissed without notification to user.',
    ORDER_NOT_FOUND: '❌ Order ID not found in pending orders.',
    NO_PERMISSION: '❌ You do not have permission to manage orders.',
    INVALID_COMMAND: '❌ Usage: `./approved <order_id>` or `./rejected <order_id>` or `./dismiss <order_id>`',
    NO_PENDING_ORDERS: '📭 No pending orders found.',
    WRONG_CHANNEL: `❌ Commands are only allowed in <#${CONFIG.ALLOWED_COMMAND_CHANNEL_ID}> channel.`
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

// Memory storage
const pendingOrders = new Map();

// ==================== BOT EVENTS ====================
client.on('ready', () => {
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    console.log(`📊 Bot is running on ${client.guilds.cache.size} servers`);
    console.log(`🚀 Drk Survraze Order Bot is ready!`);
    console.log(`📁 Command Channel: ${CONFIG.ALLOWED_COMMAND_CHANNEL_ID}`);
    console.log(`📢 Announcement Channel: ${CONFIG.ANNOUNCEMENT_CHANNEL_ID}`);
    
    client.user.setActivity('./help | Drk Survraze', { type: 'WATCHING' });
});

client.on('messageCreate', async (message) => {
    try {
        // Ignore other bots (except webhooks)
        if (message.author.bot && !message.webhookId) return;
        
        // Webhook messages process (সব চ্যানেলে ওয়েবহুক কাজ করবে)
        if (message.author.bot && message.webhookId) {
            await processWebhookOrder(message);
            return;
        }
        
        // ✅ শুধুমাত্র নির্দিষ্ট চ্যানেলে কমান্ড allow করবে
        if (message.channel.id !== CONFIG.ALLOWED_COMMAND_CHANNEL_ID) {
            // যদি ভুল চ্যানেলে কমান্ড দেওয়া হয়
            if (message.content.startsWith(CONFIG.PREFIX)) {
                await message.reply(MESSAGES.WRONG_CHANNEL);
                // ভুল চ্যানেলের মেসেজ 5 সেকেন্ড পর ডিলিট হবে
                setTimeout(async () => {
                    try {
                        await message.delete();
                    } catch (error) {
                        console.log('Cannot delete message:', error.message);
                    }
                }, 5000);
            }
            return;
        }
        
        // ✅ শুধুমাত্র allowed চ্যানেলে কমান্ড প্রসেস করবে
        if (message.content.startsWith(`${CONFIG.PREFIX}approved`)) {
            await handleApprovalCommand(message);
        } else if (message.content.startsWith(`${CONFIG.PREFIX}rejected`)) {
            await handleRejectionCommand(message);
        } else if (message.content.startsWith(`${CONFIG.PREFIX}dismiss`)) {
            await handleDismissCommand(message);
        } else if (message.content === `${CONFIG.PREFIX}orders`) {
            await handleOrdersCommand(message);
        } else if (message.content === `${CONFIG.PREFIX}ping`) {
            await message.reply(`🏓 Pong! Latency: ${Date.now() - message.createdTimestamp}ms`);
        } else if (message.content === `${CONFIG.PREFIX}help`) {
            await handleHelpCommand(message);
        } else if (message.content === `${CONFIG.PREFIX}channel`) {
            await handleChannelCommand(message);
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
            const orderDetails = extractOrderDetails(embed);
            
            if (orderId && discordUsername) {
                pendingOrders.set(orderId, {
                    discordUsername: discordUsername,
                    webhookMessageId: message.id,
                    channelId: message.channel.id,
                    timestamp: new Date(),
                    originalEmbed: embed,
                    orderDetails: orderDetails // ✅ অর্ডারের ডিটেইলস স্টোর করা
                });
                
                console.log(`📦 New order stored: ${orderId} for ${discordUsername}`);
                console.log(`📝 Webhook Message ID: ${message.id}`);
                
                // ✅ New order notification send করবে allowed চ্যানেলে
                try {
                    const allowedChannel = await client.channels.fetch(CONFIG.ALLOWED_COMMAND_CHANNEL_ID);
                    await allowedChannel.send(`📥 New order received: \`${orderId}\` for ${discordUsername}`);
                    console.log(`📢 Notification sent to command channel for order: ${orderId}`);
                } catch (notifyError) {
                    console.log('Could not send notification to command channel:', notifyError.message);
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
    
    for (let field of embed.fields) {
        if (field.value && (field.value.includes('#') || field.value.toLowerCase().includes('discord'))) {
            return field.value.replace(/[`]/g, '').trim();
        }
    }
    
    return null;
}

function extractOrderDetails(embed) {
    if (!embed.fields) return 'No details available';
    
    let details = '';
    for (let field of embed.fields) {
        if (field.name.includes('Product') || field.name.includes('Item') || field.name.includes('📦') || field.name.includes('Package')) {
            details = field.value.replace(/[`]/g, '').trim();
            break;
        }
    }
    
    // যদি Product field না পাওয়া যায়, তাহলে Description থেকে খোঁজা
    if (!details && embed.description) {
        const descMatch = embed.description.match(/(Product|Item|Package):?\s*([^\n]+)/i);
        if (descMatch) {
            details = descMatch[2].trim();
        }
    }
    
    return details || 'Product details not specified';
}

async function handleApprovalCommand(message) {
    // ✅ Channel check already done above, so directly check permissions
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
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
        const user = await findUserByUsername(orderInfo.discordUsername);
        
        if (user) {
            // ✅ REAL-TIME TIMESTAMP - DM পাঠানোর সময়ের টাইমস্ট্যাম্প
            const approvalTime = new Date();
            const bangladeshTime = formatBangladeshTime(approvalTime);
            
            // Send approval DM to user
            const dmEmbed = new EmbedBuilder()
                .setTitle('🎉 ORDER APPROVED!')
                .setDescription(MESSAGES.APPROVAL_SUCCESS)
                .addFields(
                    { name: '🆔 Order ID', value: `\`${orderId}\``, inline: true },
                    { name: '⭐ Status', value: '✅ Approved', inline: true },
                    { name: '⏰ Approved At', value: bangladeshTime, inline: true }
                )
                .setColor(0x00FF00)
                .setFooter({ text: 'Drk Survraze SMP - Thank you for your purchase!' })
                .setTimestamp(approvalTime);

            await user.send({ embeds: [dmEmbed] });
            
            // ✅ ANNOUNCEMENT CHANNEL এ মেসেজ পাঠানো - SIMPLE VERSION
            try {
                const announcementChannel = await client.channels.fetch(CONFIG.ANNOUNCEMENT_CHANNEL_ID);
                
                // @everyone সহ মেসেজ পাঠানো
                const announcementMessage = await announcementChannel.send({
                    content: `@everyone\n🎉 **NEW ORDER APPROVED!**`,
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x00FF00)
                            .addFields(
                                { name: '👤 Customer', value: `\`${orderInfo.discordUsername}\``, inline: true },
                                { name: '📦 Purchase Type', value: orderInfo.orderDetails, inline: true }
                            )
                            .setFooter({ text: 'Drk Survraze SMP - Order System' })
                            .setTimestamp(approvalTime)
                    ]
                });
                
                console.log(`📢 Announcement sent for approved order: ${orderId}`);
            } catch (announcementError) {
                console.log('❌ Could not send announcement:', announcementError.message);
            }
            
            // ✅ Webhook notification delete করবে
            try {
                const channel = await client.channels.fetch(orderInfo.channelId);
                const webhookMessage = await channel.messages.fetch(orderInfo.webhookMessageId);
                
                setTimeout(async () => {
                    try {
                        await webhookMessage.delete();
                        console.log(`🗑️ Webhook notification deleted for order: ${orderId}`);
                    } catch (deleteError) {
                        console.log('❌ Could not delete webhook notification:', deleteError.message);
                    }
                }, 10000);

            } catch (webhookError) {
                console.log('❌ Could not find webhook message to delete:', webhookError.message);
            }

            await message.reply(`✅ Order \`${orderId}\` approved! DM sent to ${orderInfo.discordUsername}`);
            
            // Remove from pending orders
            pendingOrders.delete(orderId);
            
            console.log(`✅ Order ${orderId} approved for ${orderInfo.discordUsername} at ${bangladeshTime}`);
            
        } else {
            await message.reply(`❌ User not found: ${orderInfo.discordUsername}`);
            pendingOrders.delete(orderId);
        }
    } catch (error) {
        console.error('Approval error:', error);
        await message.reply('❌ Error approving order.');
    }
}

async function handleRejectionCommand(message) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
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
        const user = await findUserByUsername(orderInfo.discordUsername);
        
        if (user) {
            // ✅ REAL-TIME TIMESTAMP - DM পাঠানোর সময়ের টাইমস্ট্যাম্প
            const rejectionTime = new Date();
            const bangladeshTime = formatBangladeshTime(rejectionTime);
            
            // Send rejection DM to user with Discord link
            const dmEmbed = new EmbedBuilder()
                .setTitle('❌ ORDER REJECTED')
                .setDescription(MESSAGES.REJECTION_MESSAGE)
                .addFields(
                    { name: '🆔 Order ID', value: `\`${orderId}\``, inline: true },
                    { name: '⭐ Status', value: '❌ Rejected', inline: true },
                    { name: '⏰ Rejected At', value: bangladeshTime, inline: true },
                    { name: '📞 Need Help?', value: `[Create Ticket on Discord](${CONFIG.DISCORD_INVITE_LINK})`, inline: false }
                )
                .setColor(0xFF0000)
                .setFooter({ text: 'Drk Survraze SMP - Contact support if you have questions' })
                .setTimestamp(rejectionTime);

            await user.send({ embeds: [dmEmbed] });
            
            // ❌ REJECTED হলে ANNOUNCEMENT CHANNEL এ কিছু পাঠানো হবে না
            
            // ✅ Webhook notification delete করবে
            try {
                const channel = await client.channels.fetch(orderInfo.channelId);
                const webhookMessage = await channel.messages.fetch(orderInfo.webhookMessageId);
                
                setTimeout(async () => {
                    try {
                        await webhookMessage.delete();
                        console.log(`🗑️ Webhook notification deleted for order: ${orderId}`);
                    } catch (deleteError) {
                        console.log('❌ Could not delete webhook notification:', deleteError.message);
                    }
                }, 10000);

            } catch (webhookError) {
                console.log('❌ Could not find webhook message to delete:', webhookError.message);
            }

            await message.reply(`❌ Order \`${orderId}\` rejected! DM sent to ${orderInfo.discordUsername}`);
            
            // Remove from pending orders
            pendingOrders.delete(orderId);
            
            console.log(`❌ Order ${orderId} rejected for ${orderInfo.discordUsername} at ${bangladeshTime}`);
            
        } else {
            await message.reply(`❌ User not found: ${orderInfo.discordUsername}`);
            pendingOrders.delete(orderId);
        }
    } catch (error) {
        console.error('Rejection error:', error);
        await message.reply('❌ Error rejecting order.');
    }
}

async function handleDismissCommand(message) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
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
        // ✅ Webhook notification delete করবে
        try {
            const channel = await client.channels.fetch(orderInfo.channelId);
            const webhookMessage = await channel.messages.fetch(orderInfo.webhookMessageId);
            
            setTimeout(async () => {
                try {
                    await webhookMessage.delete();
                    console.log(`🗑️ Webhook notification deleted for dismissed order: ${orderId}`);
                } catch (deleteError) {
                    console.log('❌ Could not delete webhook notification:', deleteError.message);
                }
            }, 10000);

        } catch (webhookError) {
            console.log('❌ Could not find webhook message to delete:', webhookError.message);
        }

        await message.reply(`🗑️ Order \`${orderId}\` dismissed! No DM sent to user.`);
        
        // Remove from pending orders
        pendingOrders.delete(orderId);
        
        console.log(`🗑️ Order ${orderId} dismissed without notification`);
        
    } catch (error) {
        console.error('Dismiss error:', error);
        await message.reply('❌ Error dismissing order.');
    }
}

// ✅ বাংলাদেশের সময় ফরম্যাট করার ফাংশন
function formatBangladeshTime(date) {
    return date.toLocaleString('en-BD', {
        timeZone: 'Asia/Dhaka',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
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
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
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
        .setFooter({ text: `Total: ${pendingOrders.size} orders - Use ./approved or ./rejected or ./dismiss <order_id>` });

    await message.reply({ embeds: [embed] });
}

async function handleHelpCommand(message) {
    const helpEmbed = new EmbedBuilder()
        .setTitle('🤖 Drk Order Bot Help')
        .setDescription(`Available commands for administrators in <#${CONFIG.ALLOWED_COMMAND_CHANNEL_ID}>:`)
        .addFields(
            { name: './approved <order_id>', value: 'Approve an order and send DM to user\n📢 Announcement will be sent to members channel with @everyone\n⚠️ Webhook notification will be deleted after 10 seconds', inline: false },
            { name: './rejected <order_id>', value: 'Reject an order and send DM to user\n❌ No announcement will be sent\n⚠️ Webhook notification will be deleted after 10 seconds', inline: false },
            { name: './dismiss <order_id>', value: 'Dismiss an order without sending DM\n❌ No announcement will be sent\n⚠️ Webhook notification will be deleted after 10 seconds', inline: false },
            { name: './orders', value: 'List all pending orders', inline: false },
            { name: './ping', value: 'Check bot latency', inline: false },
            { name: './channel', value: 'Show current command channel', inline: false }
        )
        .setColor(0x0099FF)
        .setFooter({ text: 'Drk Survraze SMP - Order Management System' });

    await message.reply({ embeds: [helpEmbed] });
}

async function handleChannelCommand(message) {
    const channelEmbed = new EmbedBuilder()
        .setTitle('📁 Command Channel Info')
        .setDescription(`All bot commands are restricted to this channel: <#${CONFIG.ALLOWED_COMMAND_CHANNEL_ID}>`)
        .addFields(
            { name: 'Channel ID', value: `\`${CONFIG.ALLOWED_COMMAND_CHANNEL_ID}\``, inline: true },
            { name: 'Channel Name', value: `\`${message.channel.name}\``, inline: true },
            { name: 'Announcement Channel', value: `<#${CONFIG.ANNOUNCEMENT_CHANNEL_ID}>`, inline: false },
            { name: 'Status', value: '✅ Commands Enabled', inline: true }
        )
        .setColor(0x00FF00)
        .setFooter({ text: 'Drk Survraze SMP - Restricted Command System' });

    await message.reply({ embeds: [channelEmbed] });
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
console.log(`📁 Command Channel Restriction: ${CONFIG.ALLOWED_COMMAND_CHANNEL_ID}`);
console.log(`📢 Announcement Channel: ${CONFIG.ANNOUNCEMENT_CHANNEL_ID}`);
client.login(CONFIG.BOT_TOKEN)
    .catch((error) => {
        console.error('❌ Login failed:', error);
        process.exit(1);
    })
