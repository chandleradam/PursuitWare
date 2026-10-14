import { AttachmentBuilder } from 'discord.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { logger } from '../utils/logger.js';
import { logEvent, EVENT_TYPES } from './loggingService.js';
import { formatLogLine } from '../utils/logging/logEmbeds.js';
import { Mutex } from '../utils/mutex.js';
import { wrapServiceBoundary } from '../utils/errorHandler.js';

const DEFAULT_WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID || '1560032107470790696';

/**
 * Service to handle member welcome processing, canvas card generation, and event logging.
 * Returns metadata on completion or null when skipped/failed.
 */
export const handleMemberWelcome = wrapServiceBoundary(async function handleMemberWelcome(client, guild, member) {
  const lockKey = `welcome:${guild.id}:${member.user.id}`;
  return await Mutex.runExclusive(lockKey, async () => {
    const welcomeChannelId = DEFAULT_WELCOME_CHANNEL_ID;
    const channel = await guild.channels.fetch(welcomeChannelId).catch(() => null);

    if (!channel || !channel.isTextBased()) {
      logger.warn(`Welcome channel ${welcomeChannelId} not found or invalid in guild ${guild.id}`);
      return null;
    }

    const permissions = channel.permissionsFor(guild.members.me);
    if (!permissions || !permissions.has(['SendMessages', 'AttachFiles'])) {
      logger.warn(`Missing permissions to send welcome card in channel ${channel.id}`);
      return null;
    }

    // Render Canvas Banner Buffer
    const imageBuffer = await renderWelcomeBanner(member, guild);
    const attachment = new AttachmentBuilder(imageBuffer, { name: `welcome-${member.id}.png` });

    // Send Welcome Message
    const sentMessage = await channel.send({
      content: `Welcome to **${guild.name}**, <@${member.user.id}>!`,
      files: [attachment]
    });

    logger.info(`🎉 Successfully sent welcome card for ${member.user.tag} in ${guild.name}`);

    // Log Event via central LoggingService
    try {
      await logEvent({
        client,
        guildId: guild.id,
        eventType: EVENT_TYPES.GUILD_MEMBER_ADD || 'MEMBER_JOIN',
        data: {
          title: 'Member Joined',
          lines: [
            formatLogLine('Member', `${member.user.tag} (\`${member.user.id}\`)`),
            formatLogLine('Member Count', guild.memberCount.toString()),
            formatLogLine('Account Created', `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`),
          ],
          userId: member.user.id,
        },
      });
    } catch (logError) {
      logger.debug('Failed to log welcome event:', logError.message);
    }

    return {
      messageId: sentMessage.id,
      memberCount: guild.memberCount,
      userTag: member.user.tag
    };
  });
}, {
  service: 'guildWelcomeService',
  operation: 'handleMemberWelcome',
  userMessage: 'Failed to process welcome card for joining member.',
});

/**
 * Renders the rounded dark card background with gold accent rings and user avatar.
 */
async function renderWelcomeBanner(member, guild) {
  const width = 800;
  const height = 480;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 1. Dark Card Base Container
  ctx.fillStyle = '#111317';
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, 40);
  ctx.fill();

  // Subtle Wave Texture Lines
  ctx.strokeStyle = '#181a1f';
  ctx.lineWidth = 1.5;
  for (let r = 80; r <= 600; r += 45) {
    ctx.beginPath();
    ctx.arc(750, 420, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 2. Member Count Pill ("Member #4929")
  const pillWidth = 360;
  const pillHeight = 44;
  const pillX = (width - pillWidth) / 2;
  const pillY = 32;

  ctx.fillStyle = '#1c2026';
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillWidth, pillHeight, 12);
  ctx.fill();

  ctx.strokeStyle = '#262b33';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#9ca3af';
  ctx.font = '500 18px "SF Pro Display", -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Member #${guild.memberCount}`, width / 2, pillY + (pillHeight / 2));

  // 3. Dual Gold Accent Rings
  const avatarX = width / 2;
  const avatarY = 210;
  const avatarRadius = 82;

  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarRadius + 12, 0, Math.PI * 2);
  ctx.strokeStyle = '#3a2e12';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarRadius + 6, 0, Math.PI * 2);
  ctx.strokeStyle = '#f5b027';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarRadius + 2, 0, Math.PI * 2);
  ctx.strokeStyle = '#111317';
  ctx.lineWidth = 3;
  ctx.stroke();

  // 4. Circular Avatar Clipping & Drawing
  try {
    const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 512 });
    const avatarImg = await loadImage(avatarUrl);

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatarImg, avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
    ctx.restore();
  } catch (err) {
    ctx.fillStyle = '#2b2d31';
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // 5. Typography Text
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#ffffff';
  ctx.font = '600 38px "SF Pro Display", -apple-system, sans-serif';
  ctx.fillText(`Welcome ${member.user.username}`, width / 2, 355);

  ctx.fillStyle = '#9ca3af';
  ctx.font = '400 18px "SF Pro Display", -apple-system, sans-serif';
  ctx.fillText('to', width / 2, 392);

  ctx.fillStyle = '#e5e7eb';
  ctx.font = '500 22px "SF Pro Display", -apple-system, sans-serif';
  ctx.fillText(`${guild.name}`, width / 2, 428);

  return canvas.toBuffer('image/png');
}
