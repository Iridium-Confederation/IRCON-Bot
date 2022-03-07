import { replyTo } from "../utils";
import { exec } from "child_process";
import Discord from "discord.js";

export const UpdateFleetBotCommand = async (
  message: Discord.Message
) => {
  await replyTo(message, "Starting docker update. Party time.");
  console.log("Starting docker update...");
  exec("kill $(pidof node)");
};
