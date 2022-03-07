import {
  Communication,
  getGuildId,
  getGuildUser,
  replyNew,
  replyTo,
} from "../utils";
import {
  ButtonHandler,
  FleetBotCommand,
  FleetBotCommandInteraction,
  SelectHandler,
} from "./FleetBotCommand";
import {
  ButtonInteraction,
  CommandInteraction,
  MessageActionRow,
  MessageButton,
  MessageSelectMenu,
  SelectMenuInteraction,
} from "discord.js";
import { User } from "../models/User";
import { ShipDao } from "../models/Ships";

export const AdminUsersDeleteButton: ButtonHandler = async (
  message: ButtonInteraction
) => {
  const guildId = await getGuildId(message);
  if (!guildId) return;
  const userId = message.customId.split("#")[1];

  const ships = await ShipDao.findShipsByOwnerId(userId, guildId);

  let count = 0;
  ships.map((s) => {
    count++;
    s.destroy();
  });

  replyNew(
    message,
    { content: `${count} ships deleted.`, components: [] },
    true
  );
};

export const AdminUsersSelect: SelectHandler = async (
  message: SelectMenuInteraction
) => {
  const userId: string = message.values[0];
  const matches = await User.findById(userId);
  const guildId = await getGuildId(message);
  if (!guildId) return;
  if (matches.length != 1) return;
  const ships = await ShipDao.findShipsByOwnerId(userId, guildId);
  const user = matches[0];
  const discordUser = await getGuildUser(user.discordUserId, guildId);

  const content =
    "**User Details**\n" +
    `Display Name: ${
      discordUser?.displayName ? discordUser?.displayName : user.lastKnownTag
    }\n` +
    `Tag: ${
      discordUser?.user.tag ? discordUser?.user.tag : user.lastKnownTag
    }\n` +
    `Ships Owned: ${ships.length}\n` +
    `Status: ${discordUser ? "Connected" : "Disconnected"}\n`;

  const row = new MessageActionRow().addComponents(
    new MessageButton()
      .setCustomId("delete_user_button#" + userId)
      .setLabel("Delete User")
      .setStyle("PRIMARY")
  );

  replyNew(message, { content: content, components: [row] }, true);
};

export const AdminClearButton: ButtonHandler = async (
  message: ButtonInteraction
) => {
  const guildId = await getGuildId(message);
  if (!guildId) return;

  const ships = await ShipDao.findAll(guildId);

  ships.map((s) => {
    s.destroy();
  });

  const replyStr = "All guild data cleared.";
  return replyNew(message, { content: replyStr, components: [] }, true);
};

export const AdminClearCommand: FleetBotCommand = async (
  message: Communication
) => {
  const row = new MessageActionRow().addComponents(
    new MessageButton()
      .setCustomId("delete_guild")
      .setLabel("Delete Everything")
      .setStyle("DANGER")
  );

  const replyStr =
    "**Warning: This will delete ALL data owned by your organization.**";

  return replyTo(message, replyStr, undefined, undefined, [row], true);
};

export const AdminUsersCommand: FleetBotCommandInteraction = async (
  message: CommandInteraction
) => {
  const guildId = await getGuildId(message);
  if (!guildId) return;

  const users = await User.findByGuild(guildId);

  Promise.all(
    users.map(async (user) => {
      const userId = user.discordUserId;
      const discordGuildId = await getGuildUser(user.discordUserId, guildId);

      return {
        label: user.lastKnownTag,
        value: userId,
        guildId: discordGuildId,
      };
    })
  ).then((results) => {
    results = results.filter((result) => !result.guildId);

    if (results.length == 0)
      return replyTo(message, "No disconnected users to manage.");

    const row = new MessageActionRow();
    const menu = new MessageSelectMenu().setCustomId("delete_user_select");
    results.splice(0, 25).forEach((result) => menu.addOptions(result));
    row.addComponents(menu);
    return replyTo(
      message,
      "List of disconnected users.",
      undefined,
      undefined,
      [row],
      true
    );
  });
};
