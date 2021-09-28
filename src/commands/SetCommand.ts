import { Communication, getUserId, replyTo } from "../utils";
import { FleetBotCommand, SelectHandler } from "./FleetBotCommand";
import { User } from "../models/User";
import { client } from "../handlers/DiscordHandlers";
import { SelectMenuInteraction } from "discord.js";

export const DefaultGuildSelect: SelectHandler = async (
  message: SelectMenuInteraction
) => {
  const user = (await User.findById(getUserId(message)))[0];
  const guildId = message.values[0];
  const guildName = client.guilds.cache.find((g) => g.id === guildId)?.name;
  if (guildName) {
    user.defaultGuildId = guildId;
    await user.save();

    await message.update({
      embeds: [],
      content: `Default guild set to **${guildName}**`,
      components: [],
    });
  }
};

export const ClearDefaultGuild: FleetBotCommand = async (
  message: Communication
) => {
  const user = (await User.findById(getUserId(message)))[0];
  user.defaultGuildId = null;
  await user.save();
  replyTo(message, "Default guild successfully cleared.");
};
