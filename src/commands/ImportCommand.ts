import { CommandInteraction } from "discord.js";
import fetch from "node-fetch";
import { addShipCheck, bulkCreateShips, bulkFindShips, getGuildId, replyTo } from "../utils";
import { FleetBotCommandInteraction } from "./FleetBotCommand";

export const ImportCommand: FleetBotCommandInteraction = async (
  message: CommandInteraction
) => {
  const guildId = await getGuildId(message);
  if (!message.isChatInputCommand()) return;
  if (guildId == null) return;

  const attachment = message.options.getAttachment("file", true);

  let body: FleetViewShip[];

  try {
    const response = await fetch(attachment.url);
    body = await response.json();
  } catch (e) {
    replyTo(message, "Error: Failed to parse attachment.\n " + e);
    return;
  }

  const format = body.find((item) => item.type)
    ? "fleetview"
    : "hangar-explorer";

  const valid = await addShipCheck(message, guildId);
  if (!valid) {
    return;
  }

  body = body.filter((item) => (format === "fleetview" && item.type && item.type === "ship") || format === "hangar-explorer");

  const shipNames = body.map((item) => item.name.toLowerCase().trim());
  const foundShips = bulkFindShips(shipNames)
  bulkCreateShips(foundShips, message, guildId)

  const successCount = foundShips.length;
  const failureCount = shipNames.length - foundShips.length;

  let messageText = `Importing **${successCount}** ships.`;
  if (failureCount > 0) {
    messageText += ` Failed to handle **${failureCount}** entries.`
  }

  replyTo(message, messageText);

};
