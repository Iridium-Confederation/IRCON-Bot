import { Communication } from "../utils";
import Discord, {
  CommandInteraction,
  Interaction,
  SelectMenuInteraction,
} from "discord.js";

export type FleetBotCommand = (message: Communication) => Promise<any>;

export type FleetBotCommandInteraction = (
  message: CommandInteraction
) => Promise<any>;

export type ButtonHandler = (
  interaction: Discord.ButtonInteraction
) => Promise<any>;

export type SelectHandler = (
  interaction: SelectMenuInteraction
) => Promise<any>;
