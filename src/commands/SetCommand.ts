import {
  Communication,
  getCommand,
  getUserGuilds,
  getUserId,
  replyTo,
} from "../utils";
import { FleetBotCommand } from "./FleetBotCommand";
import { User } from "../models/User";
import { PREFIX } from "../handlers/DiscordHandlers";

export const SetCommand: FleetBotCommand = async (message: Communication) => {
  const { command, commandArgs } = await getCommand(message);

  const user = (await User.findById(getUserId(message)))[0];
  const re = /^\W*default_guild\W*(?<id>\d+)\W*$/;
  const match = commandArgs.match(re);
  const guilds = await getUserGuilds(message);

  if (command === "clear") {
    user.defaultGuildId = null;
    await user.save();
    replyTo(message, "default_guild successfully cleared.");
  } else if (match) {
    const guildId = match[1];
    if (guilds.get(guildId)) {
      user.defaultGuildId = guildId;
      await user.save();
      replyTo(message, "default_guild successfully saved.");
    } else {
      replyTo(message, "Invalid GUILD_ID.");
    }
  } else {
    replyTo(
      message,
      `**Usage**: ${await PREFIX(message)}{set|clear} default_guild [GUILD_ID]`
    );
  }
};
