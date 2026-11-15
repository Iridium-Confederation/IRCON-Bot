// Escape literal text, including masked links; discord.js leaves those enabled by default.
export const escapeDiscordText = (value: string) => value.replace(/[\\`*_~|\[\]()<>#+\-.!]/g, "\\$&");

export const unescapeDiscordText = (value: string) => value.replace(/\\([\\`*_~|\[\]()<>#+\-.!])/g, "$1");
