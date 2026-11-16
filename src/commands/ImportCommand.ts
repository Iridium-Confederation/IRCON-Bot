import { ChatInputCommandInteraction, CommandInteraction } from "discord.js";
import fetch from "node-fetch";
import type { Response } from "node-fetch";
import { Readable } from "stream";
import {
  IMPORT_DOWNLOAD_TIMEOUT_MS,
  MAX_CONCURRENT_IMPORTS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ENTRIES,
  MAX_IMPORT_NAME_LENGTH,
  MAX_IMPORT_NAME_TOKENS,
  MemberShipLimitError,
} from "../shipLimits";
import {
  bulkCreateShips,
  bulkFindShips,
  getGuildId,
  replyTo,
} from "../utils";
import { FleetBotCommandInteraction } from "./FleetBotCommand";
import { ImportJsonLimitError, parseImportJson } from "../import-json";

const importSizeError = `Error: Import file is too large. Maximum ${MAX_IMPORT_BYTES / (1024 * 1024)} MiB.`;
const importingUsers = new Set<string>();
const importingGuilds = new Set<string>();

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

async function importShips(message: ChatInputCommandInteraction, guildId: string) {
  const attachment = message.options.getAttachment("file", true);
  if (attachment.size > MAX_IMPORT_BYTES) {
    replyTo(message, importSizeError);
    return;
  }

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), IMPORT_DOWNLOAD_TIMEOUT_MS);
  let response: Response | undefined;
  let text: string;
  try {
    response = await fetch(attachment.url, { size: MAX_IMPORT_BYTES, signal: controller.signal });
    if (!response.ok) {
      replyTo(
        message,
        `Error: Failed to download attachment (status ${response.status}).`
      );
      return;
    }

    text = await response.text();
  } catch (e) {
    const tooLarge = e && typeof e === "object" && "type" in e && e.type === "max-size";
    return replyTo(message, controller.signal.aborted
      ? "Error: Import download timed out. Please try again."
      : tooLarge ? importSizeError : "Error: Failed to download attachment. Please try again.");
  } finally {
    clearTimeout(deadline);
    // node-fetch's size rejection alone does not close an unfinished body.
    controller.abort();
    if (response?.body instanceof Readable) response.body.destroy();
  }

  let parsedBody: unknown;
  try {
    parsedBody = parseImportJson(text);
  } catch (error) {
    return replyTo(message, error instanceof ImportJsonLimitError
      ? `Error: ${error.message}` : "Error: Failed to parse attachment as JSON.");
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

  body = body.filter(
    (item) =>
      (format === "fleetview" && item.type && item.type === "ship") ||
      format === "hangar-explorer"
  );

  if (body.length > MAX_IMPORT_ENTRIES) {
    replyTo(message, `Error: Import contains too many entries. Maximum ${MAX_IMPORT_ENTRIES} ships per import.`);
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
  let created;
  try {
    created = await bulkCreateShips(foundShips, message, guildId);
  } catch (error) {
    if (error instanceof MemberShipLimitError) return replyTo(message, error.message);
    throw error;
  }
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

  return replyTo(message, messageText);
}

export const ImportCommand: FleetBotCommandInteraction = async (
  message: CommandInteraction
) => {
  if (!message.isChatInputCommand()) return;
  const userId = message.user.id;
  if (importingUsers.has(userId)) {
    return replyTo(message, "You already have an import running. Please wait for it to finish and try again.");
  }
  if (importingUsers.size >= MAX_CONCURRENT_IMPORTS) {
    return replyTo(message, "Imports are busy. Please try again shortly.");
  }

  // Claim synchronously before awaiting resolution; pending lookups count too.
  importingUsers.add(userId);
  let reservedGuild: string | undefined;
  try {
    const guildId = await getGuildId(message);
    if (guildId == null) return;
    if (importingGuilds.has(guildId)) {
      return replyTo(message, "This server already has an import running. Please wait for it to finish and try again.");
    }
    importingGuilds.add(guildId);
    reservedGuild = guildId;
    return await importShips(message, guildId);
  } finally {
    importingUsers.delete(userId);
    if (reservedGuild !== undefined) importingGuilds.delete(reservedGuild);
  }
};
