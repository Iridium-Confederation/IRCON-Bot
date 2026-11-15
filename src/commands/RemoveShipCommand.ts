import { getGuildId, getUserId, replyTo } from "../utils";
import { ButtonHandler, FleetBotCommandInteraction } from "./FleetBotCommand";
import { deleteShip, ShipDao } from "../models/Ships";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
} from "discord.js";

export const ClearConfirmationHandler: ButtonHandler = async (
  interaction: ButtonInteraction
) => {
  const [, initiatorId, expectedGuildId] = interaction.customId.split("#");
  if (!initiatorId || !expectedGuildId || initiatorId !== getUserId(interaction)) {
    return replyTo(interaction, "This clear confirmation is no longer valid for you. Run /inventory clear again.", undefined, undefined, undefined, true);
  }
  await interaction.deferUpdate();
  const guildId = await getGuildId(interaction, false);
  if (guildId !== expectedGuildId) {
    return replyTo(interaction, "Your server selection has changed. Run /inventory clear again.", undefined, undefined, undefined, true);
  }

  await ShipDao.clearInventory(getUserId(interaction), guildId);

  await interaction.editReply({
    embeds: [],
    content: "Your inventory has been cleared",
    components: [],
  });
};
export const RemoveShipCommand: FleetBotCommandInteraction = async (
  message: CommandInteraction
) => {
  if (!message.isChatInputCommand()) return;
  const guildId = await getGuildId(message);
  if (guildId == null) return;

  if (message.options.getSubcommand() === "clear") {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`delete_inventory#${getUserId(message)}#${guildId}`)
        .setLabel("Clear My Inventory")
        .setStyle(ButtonStyle.Primary)
    );

    return replyTo(
      message,
      `Are you sure you want to do this?`,
      undefined,
      undefined,
      [row],
      true
    );
  }

  const shipName = message.options.getString("vehicle", true);
  if (shipName.length <= 1) return replyTo(message, "Could you be more specific?");

  const deletedShip = await deleteShip(shipName, getUserId(message), guildId);
  return replyTo(
    message,
    deletedShip
      ? `Removed **${deletedShip.rsiName}** from your inventory.`
      : "You do not own that ship."
  );
};
