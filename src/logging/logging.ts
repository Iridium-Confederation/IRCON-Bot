import { configure, getLogger } from "log4js";

export const logger = getLogger();
export const commandsLogger = getLogger("commands");

export function initializeLogging() {
  configure({
    appenders: {
      commands: {
        type: "file",
        filename: "logs/commands.log",
        backups: 3,
        maxLogSize: 10_000_000,
      },
      default: {
        type: "file",
        filename: "logs/application.log",
        backups: 3,
        maxLogSize: 10_000_000,
      },
    },
    categories: {
      default: { appenders: ["default"], level: "info" },
      commands: { appenders: ["commands"], level: "info" },
    },
  });
}
