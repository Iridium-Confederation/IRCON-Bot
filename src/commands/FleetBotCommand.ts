import * as Discord from "discord.js";

export interface FleetBotCommand {
  execute: (message: Discord.Message) => void;
}
