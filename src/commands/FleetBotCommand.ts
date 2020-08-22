import * as Discord from "discord.js";

export type FleetBotCommand = (message: Discord.Message) => Promise<any>;
