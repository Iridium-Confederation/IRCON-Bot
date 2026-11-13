import Discord, {
  AttachmentBuilder,
  ChannelType,
  EmbedBuilder,
} from "discord.js";
import fs from "fs";
import { replyTo } from "../utils";
import fetch from "node-fetch";
import { User } from "../models/User";

export const DownloadDBCommand = async (message: Discord.Message) => {
  if (
    !User.isAdmin(message.author.id) ||
    message.channel.type !== ChannelType.DM
  ) {
    return;
  }

  const attachment = message.attachments.find(() => true);

  if (attachment) {
    const response = await fetch(attachment.url);
    const body = await response.buffer();

    fs.writeFile("database.sqlite", body, () =>
      replyTo(message, "Successfully uploaded database.")
    );
  } else {
    const data = fs.readFileSync("database.sqlite");
    const embed = new EmbedBuilder()
      .setColor("#0099ff")
      .setDescription("Successfully fetched database.");

    message.author
      .send({
        embeds: [embed],
        files: [new AttachmentBuilder(data).setName("database.sqlite")],
      })
      .catch((e) => console.log(e))
      .then(() => {});
  }
};
