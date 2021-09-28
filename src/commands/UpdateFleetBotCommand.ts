import { Communication, replyTo } from "../utils";
import { exec } from "child_process";
import { FleetBotCommand } from "./FleetBotCommand";

export const UpdateFleetBotCommand: FleetBotCommand = async (
  message: Communication
) => {
  await replyTo(message, "Starting docker update. Party time.");
  console.log("Starting docker update...");
  exec("kill $(pidof node)");
};
