import Discord from "discord.js";
import fetch from "node-fetch";
import { addShip, replyTo } from "../utils";
import { FleetBotCommand } from "./FleetBotCommand";

export class ImportCommand implements FleetBotCommand {
  async execute(message: Discord.Message): Promise<void> {
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
        .map((item: any) => {
          let isSuccess = addShip(item.name.toLowerCase().trim(), message);

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
        "Attach a fleetview or hangar explorer json file with a description of **!import**"
      );
    }
  }
}
