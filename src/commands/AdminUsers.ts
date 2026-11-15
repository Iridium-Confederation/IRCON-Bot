import {
  Communication,
  authorizeGuildOwner,
  getGuildUser,
  getUserId,
  replyTo,
  update
} from "../utils";
import {
  ButtonHandler,
  FleetBotCommand,
  FleetBotCommandInteraction,
  SelectHandler
} from "./FleetBotCommand";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  SelectMenuBuilder,
  SelectMenuInteraction
} from "discord.js";
import { User } from "../models/User";
import { ShipDao, Ships } from "../models/Ships";

async function authorizeAdminComponent(
  message: ButtonInteraction | SelectMenuInteraction,
  initiatorId: string | undefined,
  guildId: string | undefined
): Promise<string | null> {
  if (initiatorId && getUserId(message) === initiatorId && guildId && message.guildId === guildId) {
    return authorizeGuildOwner(message);
  }

  await replyTo(
    message,
    "This admin control can only be used by the administrator who opened it.",
    undefined,
    undefined,
    undefined,
    true
  );
  return null;
}

export const AdminUsersDeleteButton: ButtonHandler = async (
    message: ButtonInteraction
  ) => {
    const [, userId, initiatorId, expectedGuildId] = message.customId.split("#");
    const guildId = await authorizeAdminComponent(message, initiatorId, expectedGuildId);
    if (!guildId || !userId) return;

    const count = await Ships.destroy({
      where: {
        guildId: guildId,
        discordUserId: userId
      }
    });

    update(message, {
      content: `${count} ships deleted.`,
      components: []
    });
  }
;

export const AdminUsersSelect: SelectHandler = async (
  message: SelectMenuInteraction
) => {
  const [, initiatorId, expectedGuildId] = message.customId.split("#");
  const guildId = await authorizeAdminComponent(message, initiatorId, expectedGuildId);
  if (!guildId) return;

  const userId: string = message.values[0];
  const matches = await User.findById(userId);
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
    `ID: ${userId}\n` +
    `Ships Owned: ${ships.length}\n` +
    `Status: ${discordUser ? "Connected" : "Disconnected"}\n`;

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`delete_user_button#${userId}#${initiatorId}#${guildId}`)
      .setLabel("Delete User")
      .setStyle(ButtonStyle.Primary)
  );
  update(message, { content: content, components: [row] });
};

export const AdminClearButton: ButtonHandler = async (
  message: ButtonInteraction
) => {
  const [, initiatorId, expectedGuildId] = message.customId.split("#");
  const guildId = await authorizeAdminComponent(message, initiatorId, expectedGuildId);
  if (!guildId) return;

  await Ships.destroy({
    where: {
      guildId: guildId
    }}
  )

  const replyStr = "All guild data cleared.";
  return update(message, { content: replyStr, components: [] });
};

export const AdminClearCommand: FleetBotCommand = async (
  message: Communication
) => {
  const guildId = await authorizeGuildOwner(message);
  if (!guildId) return;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`delete_guild#${getUserId(message)}#${guildId}`)
      .setLabel("Delete Everything")
      .setStyle(ButtonStyle.Danger)
  );

  const replyStr =
    "**Warning: This will delete ALL data owned by your organization.**";

  return replyTo(message, replyStr, undefined, undefined, [row], true);
};

export const AdminUsersCommand: FleetBotCommandInteraction = async (
  message: CommandInteraction
) => {
  const guildId = await authorizeGuildOwner(message);
  if (!guildId) return;

  const ships = await ShipDao.findAll(guildId);
  let users = await User.findByGuild(guildId);

  // filter users to ones that have ships in this guild
  users = users.filter((user) => {
    return ships.some((ship) => ship.discordUserId == user.discordUserId);
  });

  let current = 0;
  let results = await Promise.all(
    users.map(async (user) => {
      const userId = user.discordUserId;
      const discordGuildId = await getGuildUser(user.discordUserId, guildId, true);

      if (current < 25 && !discordGuildId){
        current++;
        const label = "Tag: " + user.lastKnownTag + " (ID: " + userId + ")";
        return {
          label: label,
          value: userId,
          guildId: discordGuildId
        };
      }else{
        return null;
      }
    })
  );
  results = results.filter((result) => result && !result.guildId);

  if (results.length == 0)
    return replyTo(message, "No disconnected users to manage.");

  const row = new ActionRowBuilder<SelectMenuBuilder>();
  const menu = new SelectMenuBuilder().setCustomId(
    `delete_user_select#${getUserId(message)}#${guildId}`
  );
  results.splice(0, 25).forEach((result) => result ? menu.addOptions(result) : null);
  row.addComponents(menu);
  return replyTo(
    message,
    "List of disconnected users.",
    undefined,
    undefined,
    [row],
    true
  );
};
