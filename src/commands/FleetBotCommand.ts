import { Communication } from "../utils";
import Discord from "discord.js";

export type FleetBotCommand = (message: Communication) => Promise<any>;

export type ButtonHandler = (
  interaction: Discord.ButtonInteraction
) => Promise<any>;
