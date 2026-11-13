import { CommandInteraction } from "discord.js";
import fetch from "node-fetch";
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ENTRIES,
  MAX_IMPORT_NAME_LENGTH,
  MAX_IMPORT_NAME_TOKENS,
} from "../shipLimits";
import {
  addShipCheck,
  bulkCreateShips,
  bulkFindShips,
  getGuildId,
  replyTo,
} from "../utils";
import { FleetBotCommandInteraction } from "./FleetBotCommand";

const isImportShip = (
  item: unknown
): item is { name: string; type?: string } => {
  if (typeof item !== "object" || item == null) {
    return false;
  }

  const ship = item as { name?: unknown; type?: unknown };
  return (
    typeof ship.name === "string" &&
    (ship.type == null || typeof ship.type === "string")
  );
};

const hasBoundedShipName = (item: { name: string }): boolean => {
  const name = item.name.trim();
  const tokenCount = name.length === 0 ? 0 : name.split(/\s+/).length;
  return (
    item.name.length <= MAX_IMPORT_NAME_LENGTH &&
    tokenCount <= MAX_IMPORT_NAME_TOKENS
  );
};

export const ImportCommand: FleetBotCommandInteraction = async (
  message: CommandInteraction
) => {
  const guildId = await getGuildId(message);
  if (!message.isChatInputCommand()) return;
  if (guildId == null) return;

  const attachment = message.options.getAttachment("file", true);
  if (attachment.size > MAX_IMPORT_BYTES) {
    replyTo(message, "Error: Import file is too large.");
    return;
  }

  let parsedBody: unknown;

  try {
    const response = await fetch(attachment.url, { size: MAX_IMPORT_BYTES });
    if (!response.ok) {
      replyTo(
        message,
        `Error: Failed to download attachment (status ${response.status}).`
      );
      return;
    }

    parsedBody = await response.json();
  } catch (e) {
    replyTo(message, "Error: Failed to parse attachment as JSON.");
    return;
  }

  if (!Array.isArray(parsedBody)) {
    replyTo(message, "Error: Supported file formats are fleetyards.net and Hangar XPLORer.");
    return;
  }

  let body = parsedBody.filter(isImportShip);
  if (body.length === 0) {
    replyTo(message, "Error: No valid ship entries found in import file.");
    return;
  }

  const format = body.find((item) => item.type)
    ? "fleetview"
    : "hangar-explorer";

  const valid = await addShipCheck(message, guildId);
  if (!valid) {
    return;
  }

  body = body.filter(
    (item) =>
      (format === "fleetview" && item.type && item.type === "ship") ||
      format === "hangar-explorer"
  );

  if (body.length > MAX_IMPORT_ENTRIES) {
    replyTo(message, "Error: Import contains too many entries.");
    return;
  }

  if (body.length === 0) {
    replyTo(message, "Error: No importable ships found after filtering.");
    return;
  }

  if (body.some((item) => !hasBoundedShipName(item))) {
    replyTo(message, "Error: Import contains an invalid ship name.");
    return;
  }

  const shipNames = body.map((item) => item.name.toLowerCase().trim());
  const foundShips = bulkFindShips(shipNames);
  const created = await bulkCreateShips(foundShips, message, guildId);
  if (!created) {
    replyTo(
      message,
      "Org limit reached. Contact developers to increase limit."
    );
    return;
  }

  const successCount = foundShips.length;
  const failureCount = shipNames.length - foundShips.length;

  let messageText = `Importing **${successCount}** ships.`;
  if (failureCount > 0) {
    messageText += ` Failed to handle **${failureCount}** entries.`;
  }

  replyTo(message, messageText);
};
