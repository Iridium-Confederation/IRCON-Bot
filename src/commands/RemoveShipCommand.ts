import {
  Communication,
  getCommand,
  getGuildId,
  getUserTag,
  replyTo,
} from "../utils";
import { ButtonHandler, FleetBotCommand } from "./FleetBotCommand";
import { deleteShips } from "../models/Ships";
import Discord, {
  ButtonInteraction,
  MessageActionRow,
  MessageButton,
} from "discord.js";

export const ClearConfirmationHandler: ButtonHandler = async (
  interaction: ButtonInteraction
) => {
  const guildId = await getGuildId(interaction);

  if (guildId == null) return;

  await deleteShips("", getUserTag(interaction), guildId, true);

  interaction.update({
    embeds: [],
    content: "Your inventory has been cleared",
    components: [],
  });
};
export const RemoveShipCommand: FleetBotCommand = async (
  message: Communication
) => {
  let { command, commandArgs } = await getCommand(message);

  const guildId = await getGuildId(message);
  if (guildId == null) return;

  if (message instanceof Discord.Interaction) {
    const clear = message.options.getSubcommand(false) === "clear";
    if (clear) {
      commandArgs = "clear";
    }
  }

  let shipName =
    message instanceof Discord.Message
      ? commandArgs.toLowerCase()
      : message.options.getString("vehicle", false);

  if (!shipName) {
    shipName = "";
  }

  if (commandArgs === "clear") {
    const row = new MessageActionRow().addComponents(
      new MessageButton()
        .setCustomId("delete_inventory")
        .setLabel("Clear My Inventory")
        .setStyle("PRIMARY")
    );

    replyTo(
      message,
      `Are you sure you want to do this?`,
      undefined,
      undefined,
      [row],
      true
    );
  } else if (command === "delete_inventory") {
    const removedShips = await deleteShips(
      shipName,
      getUserTag(message),
      guildId,
      true
    );
  } else if (commandArgs === "-all") {
    await deleteShips(
      shipName,
      getUserTag(message),
      guildId,
      commandArgs === "-all"
    );

    replyTo(message, `Your inventory has been cleared.`);
  } else if (shipName.length <= 1) {
    replyTo(message, "Could you be more specific?");
  } else {
    const removedShips = await deleteShips(
      shipName,
      getUserTag(message),
      guildId,
      commandArgs === "-all"
    );
    const deletedShip = removedShips.values().next().value;
    replyTo(
      message,
      deletedShip
        ? `Removed **${deletedShip.rsiName}** from your inventory.`
        : "You do not own that ship."
    );
  }
};
