const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Order storage (in production, use database)
const pendingOrders = new Map();

client.on('ready', () => {
    console.log(`✅ Bot logged in as ${client.user.tag}`);
});

// Webhook message listener
client.on('messageCreate', async (message) => {
    // Ignore bot messages and check if it's from webhook
    if (message.author.bot && message.webhookId) {
        try {
            // Parse order information from webhook embed
            if (message.embeds && message.embeds.length > 0) {
                const embed = message.embeds[0];
                const orderId = extractOrderId(embed);
                const discordUsername = extractDiscordUsername(embed);
                
                if (orderId && discordUsername) {
                    // Store order information
                    pendingOrders.set(orderId, {
                        discordUsername: discordUsername,
                        messageId: message.id,
                        channelId: message.channel.id,
                        timestamp: new Date()
                    });
                    
                    console.log(`📦 Order stored: ${orderId} for ${discordUsername}`);
                }
            }
        } catch (error) {
            console.error('Error processing webhook message:', error);
        }
    }
    
    // Handle approval command
    if (message.content.startsWith('./approved')) {
        await handleApprovalCommand(message);
    }
});

function extractOrderId(embed) {
    if (embed.fields) {
        const orderField = embed.fields.find(field => 
            field.name.includes('Order ID') || field.name.includes('🆔')
        );
        if (orderField && orderField.value) {
            // Extract order ID from code format `ORD_123456`
            const match = orderField.value.match(/`([^`]+)`/);
            return match ? match[1] : orderField.value.trim();
        }
    }
    return null;
}

function extractDiscordUsername(embed) {
    if (embed.fields) {
        const discordField = embed.fields.find(field => 
            field.name.includes('Discord') || field.name.includes('👤')
        );
        if (discordField && discordField.value) {
            return discordField.value.trim();
        }
    }
    return null;
}

async function handleApprovalCommand(message) {
    // Check if user has permission to approve
    if (!message.member.permissions.has('ADMINISTRATOR')) {
        return message.reply('❌ You do not have permission to approve orders.');
    }

    const args = message.content.split(' ');
    if (args.length < 2) {
        return message.reply('❌ Usage: `./approved <order_id>`');
    }

    const orderId = args[1];
    const orderInfo = pendingOrders.get(orderId);

    if (!orderInfo) {
        return message.reply(`❌ Order ID \`${orderId}\` not found in pending orders.`);
    }

    try {
        // Send DM to the user
        const user = await findUserByUsername(orderInfo.discordUsername);
        
        if (user) {
            const dmEmbed = new EmbedBuilder()
                .setTitle('🎉 ORDER APPROVED!')
                .setDescription('Your purchase has been approved successfully!')
                .addFields(
                    { name: '🆔 Order ID', value: `\`${orderId}\``, inline: true },
                    { name: '⭐ Status', value: '✅ Approved', inline: true },
                    { name: '⏰ Approved At', value: new Date().toLocaleString(), inline: true }
                )
                .setColor(0x00FF00)
                .setFooter({ text: 'Drk Survraze SMP - Thank you for your purchase!' });

            await user.send({ embeds: [dmEmbed] });
            
            // Update the original webhook message
            const channel = await client.channels.fetch(orderInfo.channelId);
            const originalMessage = await channel.messages.fetch(orderInfo.messageId);
            
            const approvedEmbed = EmbedBuilder.from(originalMessage.embeds[0])
                .setColor(0x00FF00)
                .addFields(
                    { name: '✅ Approved By', value: message.author.tag, inline: true },
                    { name: '🕒 Approved At', value: new Date().toLocaleString(), inline: true }
                );

            await originalMessage.edit({ 
                embeds: [approvedEmbed],
                components: [] // Remove buttons after approval
            });

            // Remove from pending orders
            pendingOrders.delete(orderId);

            await message.reply(`✅ Order \`${orderId}\` approved successfully! DM sent to ${orderInfo.discordUsername}`);
            
            console.log(`✅ Order ${orderId} approved for ${orderInfo.discordUsername}`);
        } else {
            await message.reply(`❌ Could not find user: ${orderInfo.discordUsername}`);
        }
    } catch (error) {
        console.error('Error approving order:', error);
        await message.reply('❌ Error approving order. Please try again.');
    }
}

async function findUserByUsername(username) {
    try {
        // Remove formatting and extract username
        const cleanUsername = username.replace(/[`*_~|]/g, '').trim();
        
        // Search in all guilds the bot is in
        for (const guild of client.guilds.cache.values()) {
            await guild.members.fetch(); // Ensure members are cached
            
            const member = guild.members.cache.find(member => 
                member.user.tag === cleanUsername || 
                member.user.username === cleanUsername ||
                member.displayName === cleanUsername
            );
            
            if (member) {
                return member.user;
            }
        }
        
        return null;
    } catch (error) {
        console.error('Error finding user:', error);
        return null;
    }
}

// Command to list pending orders
client.on('messageCreate', async (message) => {
    if (message.content === './orders' && message.member.permissions.has('ADMINISTRATOR')) {
        if (pendingOrders.size === 0) {
            return message.reply('📭 No pending orders found.');
        }

        const ordersList = Array.from(pendingOrders.entries())
            .map(([orderId, info]) => 
                `• **${orderId}** - ${info.discordUsername} (${new Date(info.timestamp).toLocaleString()})`
            )
            .join('\n');

        const embed = new EmbedBuilder()
            .setTitle('📦 Pending Orders')
            .setDescription(ordersList)
            .setColor(0xFFA500)
            .setFooter({ text: `Total: ${pendingOrders.size} orders` });

        await message.reply({ embeds: [embed] });
    }
});

// Bot login
client.login('YOUR_BOT_TOKEN_HERE');
