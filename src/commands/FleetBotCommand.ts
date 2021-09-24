import { Communication } from "../utils";

export type FleetBotCommand = (message: Communication) => Promise<any>;
