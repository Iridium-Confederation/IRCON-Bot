import { CommandInteraction } from "discord.js";
import fetch from "node-fetch";
import { addShip, addShipCheck, getGuildId, replyTo } from "../utils";
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

  let successCount = 0;
  let failureCount = 0;
  let failures = new Set();

  const format = body.find((item) => item.type)
    ? "fleetview"
    : "hangar-explorer";

  const valid = await addShipCheck(message, guildId);
  if (!valid) {
    return;
  }

  let result = body
    .filter(
      (item: any) =>
        (format === "fleetview" && item.type && item.type === "ship") ||
        format === "hangar-explorer"
    )
    .map(async (item: any) => {
      let isSuccess = await addShip(
        item.name.toLowerCase().trim(),
        message,
        guildId
      );

      if (!isSuccess) {
        failures.add(item.name.trim());
        failureCount++;
      } else {
        successCount++;
      }
    });

  await Promise.all(result);

  if (successCount) {
    replyTo(message, `Successfully imported **${successCount}** items.`);
  }
  if (failureCount) {
    replyTo(message, `Failed to import **${failureCount}** items.`);

    replyTo(message, Array.from(failures).join(", "));
  }
};
