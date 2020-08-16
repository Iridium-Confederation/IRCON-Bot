import Discord from "discord.js";
import { getCommand, replyTo } from "../utils";
import { exec } from "child_process";
import { FleetBotCommand } from "./FleetBotCommand";

export class UpdateFleetBotCommand implements FleetBotCommand {
  async execute(message: Discord.Message): Promise<void> {
    const { commandArgs } = getCommand(message);

    if (commandArgs.includes("-docker")) {
      await replyTo(message, "Starting docker update. Party time.");
      console.log("Starting docker update...");
      exec("kill $(pidof npm)");
    }
  }
}
