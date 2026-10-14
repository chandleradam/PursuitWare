import { Events } from 'discord.js';
import { handleMemberWelcome } from '../services/guildWelcomeService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildMemberAdd,
  once: false,
  /**
   * Triggers when a new member joins the guild.
   * Delegates handling to the guildWelcomeService boundary pipeline.
   */
  async execute(member, client) {
    try {
      const activeClient = client || member.client;
      await handleMemberWelcome(activeClient, member.guild, member);
    } catch (error) {
      logger.error(`[WelcomeEvent] Execution failed for member ${member.user?.tag || member.id}:`, error);
    }
  }
};
