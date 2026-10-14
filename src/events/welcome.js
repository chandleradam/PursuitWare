import { Events, AttachmentBuilder } from 'discord.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { logger } from '../utils/logger.js';

const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID || '1560032107470790696';

export default {
    name: Events.GuildMemberAdd,
    once: false,
    async execute(member) {
        try {
            logger.info(`[Welcome] Member joined: ${member.user.tag} in ${member.guild.name}`);

            const channel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
            if (!channel || !channel.isTextBased()) {
                logger.error(`[Welcome] Channel ${WELCOME_CHANNEL_ID} not found or is not text-based.`);
                return;
            }

            // Canvas Dimensions
            const width = 800;
            const height = 480;
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');

            // 1. Dark Main Container Card
            ctx.fillStyle = '#111317';
            ctx.beginPath();
            ctx.roundRect(0, 0, width, height, 40);
            ctx.fill();

            // Background Subtle Wave Texture Lines
            ctx.strokeStyle = '#181a1f';
            ctx.lineWidth = 1.5;
            for (let r = 80; r <= 600; r += 45) {
                ctx.beginPath();
                ctx.arc(750, 420, r, 0, Math.PI * 2);
                ctx.stroke();
            }

            // 2. Top Member Pill ("Member #4929")
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

            // Pill Text
            ctx.fillStyle = '#9ca3af';
            ctx.font = '500 18px "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`Member #${member.guild.memberCount}`, width / 2, pillY + (pillHeight / 2));

            // 3. Avatar Section with Dual Gold Rings
            const avatarX = width / 2;
            const avatarY = 210;
            const avatarRadius = 82;

            // Outer Outer Subtle Glow Ring
            ctx.beginPath();
            ctx.arc(avatarX, avatarY, avatarRadius + 12, 0, Math.PI * 2);
            ctx.strokeStyle = '#3a2e12';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Primary Gold Ring
            ctx.beginPath();
            ctx.arc(avatarX, avatarY, avatarRadius + 6, 0, Math.PI * 2);
            ctx.strokeStyle = '#f5b027';
            ctx.lineWidth = 4;
            ctx.stroke();

            // Inner Dark Border Gap Ring
            ctx.beginPath();
            ctx.arc(avatarX, avatarY, avatarRadius + 2, 0, Math.PI * 2);
            ctx.strokeStyle = '#111317';
            ctx.lineWidth = 3;
            ctx.stroke();

            // 4. Clip & Draw Actual Member Discord Avatar
            try {
                const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 512 });
                const avatarImg = await loadImage(avatarUrl);

                ctx.save();
                ctx.beginPath();
                ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(avatarImg, avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
                ctx.restore();
            } catch (e) {
                ctx.fillStyle = '#2b2d31';
                ctx.beginPath();
                ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
                ctx.fill();
            }

            // 5. Typography Text Below Avatar
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';

            // "Welcome <username>"
            ctx.fillStyle = '#ffffff';
            ctx.font = '600 38px "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillText(`Welcome ${member.user.username}`, width / 2, 355);

            // "to"
            ctx.fillStyle = '#9ca3af';
            ctx.font = '400 18px "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillText('to', width / 2, 392);

            // Server Name
            ctx.fillStyle = '#e5e7eb';
            ctx.font = '500 22px "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillText(`${member.guild.name}`, width / 2, 428);

            // 6. Create Attachment & Send
            const attachment = new AttachmentBuilder(canvas.toBuffer('image/png'), { name: `welcome-${member.id}.png` });

            await channel.send({
                content: `Welcome to **${member.guild.name}**, <@${member.id}>!`,
                files: [attachment]
            });

            logger.info(`[Welcome] Successfully sent welcome card for ${member.user.tag}`);
        } catch (err) {
            logger.error('[Welcome Event Error]:', err);
        }
    }
};
