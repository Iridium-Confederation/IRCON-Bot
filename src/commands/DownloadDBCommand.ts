import Discord from "discord.js";
import fs from "fs";
import { replyTo } from "../utils";
import { FleetBotCommand } from "./FleetBotCommand";

export class DownloadDBCommand implements FleetBotCommand {
  async execute(message: Discord.Message): Promise<void> {
    const data = fs.readFileSync("database.sqlite");
    replyTo(message, new Discord.MessageAttachment(data, "database.sqlite"));
  }
}