import Discord from "discord.js";
import fs from "fs";
import { replyTo } from "../utils";
import { FleetBotCommand } from "./FleetBotCommand";

export const DownloadDBCommand: FleetBotCommand = async (
  message: Discord.Message
) => {
  const data = fs.readFileSync("database.sqlite");
  replyTo(message, new Discord.MessageAttachment(data, "database.sqlite"));
};
