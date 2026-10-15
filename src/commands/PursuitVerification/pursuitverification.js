import { 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    MessageFlags, 
    EmbedBuilder 
} from 'discord.js';
import axios from 'axios';
import { getColor } from '../../config/bot.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';

const CONFIG = {
    API_KEY: process.env.API_KEY || 'MountWare',
    CHANNEL_ID: process.env.PURSUIT_CHANNEL_ID || '1549884201694924860',
    VERIFIED_ROLE_ID: process.env.VERIFIED_ROLE_ID || '1549884565932216332',
    STAFF_ROLE_ID: process.env.STAFF_ROLE_ID || '1549908626527756349',
    WEBSITE_API_URL: process.env.WEBSITE_API_URL || 'https://www.interactivemountain.com/api'
};

const BUTTON_CUSTOM_ID = 'pv_update_roles';

export const pursuitVerificationCommand = {
    data: new SlashCommandBuilder()
        .setName('pursuitverification')
        .setDescription('Lookup or manage Pursuit Verification account details for a member.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addUserOption(option => 
            option.setName('target')
                .setDescription('The Discord member you want to look up')
                .setRequired(true)
        ),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferSuccess) return;

        if (CONFIG.STAFF_ROLE_ID && !interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) {
            return await InteractionHelper.safeEditReply(interaction, {
                content: '❌ You do not have permission to use pursuit verification lookup commands.'
            });
        }

        const targetUser = interaction.options.getUser('target');

        try {
            const response = await axios.get(`${CONFIG.WEBSITE_API_URL}/member/discord/${targetUser.id}`, {
                headers: { 'x-sf-api-key': CONFIG.API_KEY },
                timeout: 5000
            });

            const data = response.data;
            // Fallback hierarchy: Roblox Username -> Website Username -> Discord Username
            const displayName = data?.robloxUsername || data?.roblox_username || data?.username || data?.discordUsername || targetUser.username;
            const robloxId = data?.robloxId || data?.roblox_id;
            const isVerified = (data?.isVerified || data?.verified) ? 'Yes' : 'No';
            const verificationType = (data?.robloxUsername || data?.roblox_username) ? 'Roblox Linked' : 'Discord Verified Only';

            if (!data) {
                return await InteractionHelper.safeEditReply(interaction, {
                    content: `❌ **No Account Found:** <@${targetUser.id}> has not completed Pursuit Verification on \`interactivemountain.com\`.`
                });
            }

            let avatarUrl = targetUser.displayAvatarURL({ dynamic: true });

            if (robloxId && !isNaN(robloxId)) {
                try {
                    const thumbRes = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${robloxId}&size=150x150&format=Png&isCircular=false`);
                    if (thumbRes.data?.data?.[0]?.imageUrl) {
                        avatarUrl = thumbRes.data.data[0].imageUrl;
                    }
                } catch (tErr) {
                    logger.warn(`Could not fetch Roblox headshot for ${robloxId}:${tErr.message}`);
                }
            }

            const profileUrl = (robloxId && !isNaN(robloxId))
                ? `https://www.roblox.com/users/${robloxId}/profile`
                : `https://www.interactivemountain.com`;

            const staffEmbed = new EmbedBuilder()
                .setColor(getColor('info'))
                .setTitle(`Pursuit Verification Data — ${targetUser.tag}`)
                .setThumbnail(avatarUrl)
                .addFields(
                    { name: 'Discord User', value: `<@${targetUser.id}> (\`${targetUser.id}\`)`, inline: false },
                    { name: 'Assigned Nickname / Name', value: `\`${displayName}\``, inline: true },
                    { name: 'Verification Type', value: `\`${verificationType}\``, inline: true },
                    { name: 'Pursuit Verified', value: `\`${isVerified}\``, inline: true },
                    { name: 'Roblox User ID', value: `\`${robloxId || 'N/A (Discord Only)'}\``, inline: true },
                    { name: 'Profile Link', value: `[View Profile](${profileUrl})`, inline: false }
                )
                .setFooter({ text: 'Interactive Mountain™ Pursuit Verification System' })
                .setTimestamp();

            await InteractionHelper.safeEditReply(interaction, { embeds: [staffEmbed] });

        } catch (error) {
            if (error.response?.status === 404) {
                await InteractionHelper.safeEditReply(interaction, {
                    content: `❌ **No Data:** <@${targetUser.id}> is not registered in the Pursuit Verification database.`
                });
            } else {
                logger.error('API Pursuit Verification Lookup Error:', error);
                await InteractionHelper.safeEditReply(interaction, {
                    content: '⚠️ Failed to pull player info from the pursuit verification API.'
                });
            }
        }
    }
};

export async function handlePursuitVerificationButton(interaction) {
    if (!interaction.isButton() || interaction.customId !== BUTTON_CUSTOM_ID) return;

    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (deferErr) {
        logger.error('Failed to defer verification button interaction:', deferErr);
        return;
    }

    const userId = interaction.user.id;

    try {
        const response = await axios.get(`${CONFIG.WEBSITE_API_URL}/member/discord/${userId}`, {
            headers: { 'x-sf-api-key': CONFIG.API_KEY },
            timeout: 5000
        });

        const data = response.data;
        
        if (!data || (!data.verified && !data.isVerified)) {
            return await interaction.editReply({
                content: '❌ **Unverified!** You have not completed Pursuit Verification on our website yet.\n\nClick **Link Account** above, log in with your account, and link your profile.'
            });
        }

        // Determine nickname: Prefer Roblox name, fallback to website username or Discord username
        const nickName = data?.robloxUsername || data?.roblox_username || data?.username || interaction.user.globalName || interaction.user.username;

        const member = interaction.member;
        let nicknameUpdated = true;

        try {
            await member.setNickname(nickName);
        } catch (nickErr) {
            nicknameUpdated = false;
            logger.warn(`Could not change nickname for ${interaction.user.tag}: ${nickErr.message}`);
        }

        if (CONFIG.VERIFIED_ROLE_ID) {
            try {
                await member.roles.add(CONFIG.VERIFIED_ROLE_ID);
            } catch (roleErr) {
                logger.warn(`Could not add pursuit verified role to ${interaction.user.tag}: ${roleErr.message}`);
            }
        }

        if (nicknameUpdated) {
            await interaction.editReply({
                content: `✅ **Pursuit Verified!** Your server nickname has been updated to **${nickName}** and your verified role has been assigned!`
            });
        } else {
            await interaction.editReply({
                content: `✅ **Pursuit Verified!** Roles synced for **${nickName}**! *(Note: Server owner or admin nicknames cannot be modified by bots).*`
            });
        }

        try {
            await logEvent({
                client: interaction.client,
                guildId: interaction.guildId,
                eventType: EVENT_TYPES.USER_VERIFY,
                data: {
                    description: `User ${interaction.user.tag} completed Pursuit Verification as ${nickName}`,
                    userId: interaction.user.id,
                    nickName: nickName
                }
            });
        } catch (logErr) {
            logger.warn('Failed to log pursuit verification event:', logErr);
        }

    } catch (error) {
        if (error.response?.status === 404) {
            await interaction.editReply({
                content: '❌ **Account Not Found!** Please go to `interactivemountain.com/settings` and complete the Pursuit Verification step first.'
            });
        } else {
            logger.error('Pursuit Verification Button API Error:', error);
            await interaction.editReply({
                content: '⚠️ Pursuit Verification service unavailable or taking too long to respond. Please try again in a moment.'
            });
        }
    }
}

export async function setupPursuitVerificationPanel(client) {
    const channelId = CONFIG.CHANNEL_ID;
    console.log(`[Pursuit Setup] Attempting panel setup for Channel ID: ${channelId}`);

    try {
        const channel = await client.channels.fetch(channelId).catch(err => {
            console.error(`[Pursuit Setup Error] Failed to fetch channel ${channelId}:`, err.message);
            return null;
        });

        if (!channel) {
            logger.error(`[Pursuit Setup Error] Channel ${channelId} could not be found or bot lacks access.`);
            return;
        }

        const verifyEmbed = new EmbedBuilder()
            .setColor(getColor('info'))
            .setTitle('Verify your Interactive Mountain account')
            .setDescription(
                'Linking your account unlocks your member roles here, keeps your groups in sync, and ties your purchases and support access to this server.\n\n' +
                '**How to verify**\n' +
                '1. Create your account on our website\n' +
                '2. Link your Discord account (and optionally Roblox if available)\n' +
                '3. Click **Update Roles** below to sync your profile, nickname, and roles\n\n' +
                'Stuck? Open a support ticket and the team will sort you out.'
            )
            .setFooter({ text: 'Interactive Mountain™ account verification' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Get started')
                .setStyle(ButtonStyle.Link)
                .setURL('https://www.roblox.com/communities/805966808/Mountain-Community'),
            new ButtonBuilder()
                .setLabel('Link Account')
                .setStyle(ButtonStyle.Link)
                .setURL('https://www.interactivemountain.com/settings'),
            new ButtonBuilder()
                .setCustomId(BUTTON_CUSTOM_ID)
                .setLabel('Update Roles')
                .setStyle(ButtonStyle.Primary)
        );

        try {
            const messages = await channel.messages.fetch({ limit: 20 });
            const oldPanels = messages.filter(m => m.author.id === client.user.id && m.embeds.length > 0);

            for (const [, oldMsg] of oldPanels) {
                await oldMsg.ched().catch(() => {}); // handled safely
            }
        } catch (fetchErr) {
            console.warn(`[Pursuit Setup Warning] Could not delete previous panels: ${fetchErr.message}`);
        }

        const sentMessage = await channel.send({ embeds: [verifyEmbed], components: [row] });
        console.log(`[Pursuit Setup Success] Verification panel posted! Message ID: ${sentMessage.id}`);

    } catch (panelErr) {
        console.error('[Pursuit Setup Error] Critical error during panel generation:', panelErr);
    }
}
