import Discord from "discord.js";
import fetch from "node-fetch";
import { addShip, getGuildId, replyTo } from "../utils";
import { FleetBotCommand } from "./FleetBotCommand";
import { PREFIX } from "../handlers/DiscordHandlers";

export const ImportCommand: FleetBotCommand = async (
  message: Discord.Message
) => {
  const guildId = await getGuildId(message);
  if (guildId == null) return;

  const attachment = message.attachments.find(() => true);

  if (attachment) {
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

    body
      .filter(
        (item: any) =>
          (format === "fleetview" && item.type && item.type === "ship") ||
          format === "hangar-explorer"
      )
      .map(async (item: any) => {
        let isSuccess = addShip(
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

    if (successCount) {
      replyTo(message, `Successfully imported **${successCount}** items.`);
    }
    if (failureCount) {
      replyTo(message, `Failed to import **${failureCount}** items.`);

      replyTo(message, Array.from(failures).join(", "));
    }
  } else {
    replyTo(
      message,
      `Uplaod a **FleetView** or **Hangar XPLORer** json file here with a description of **${PREFIX()}import**\n\n` +
        "**FleetView**: Click <https://www.starship42.com/fleetview/> -> (Select your fleet) -> Start -> Download JSON.\n" +
        "**Hangar XPLORer**: Install the Chrome/Firefox plugin -> RSI -> Accounts -> My Hanger -> Download JSON."
    );
  }
};
