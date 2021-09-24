import Discord from "discord.js";
import fs from "fs";
import { Communication, replyTo } from "../utils";
import { FleetBotCommand } from "./FleetBotCommand";
import fetch from "node-fetch";

export const DownloadDBCommand: FleetBotCommand = async (
  message: Communication
) => {
  if (!(message instanceof Discord.Message)) return;

  const attachment = message.attachments.find(() => true);

  if (attachment) {
    const response = await fetch(attachment.url);
    const body = await response.buffer();

    fs.writeFile("database.sqlite", body, () =>
      replyTo(message, "Successfully uploaded database.")
    );
  } else {
    const data = fs.readFileSync("database.sqlite");
    replyTo(
      message,
      "Successfully fetched database.",
      new Discord.MessageAttachment(data, "database.sqlite")
    );
  }
};
