import { Communication, getUserId, replyTo } from "../utils";
import { SelectHandler } from "./FleetBotCommand";
import { User } from "../models/User";
import { client } from "../handlers/DiscordHandlers";
import {
  ActionRowBuilder,
  ButtonInteraction,
  Guild,
  SelectMenuBuilder,
  SelectMenuInteraction,
} from "discord.js";

export const DefaultGuildSelect: SelectHandler = async (
  message: SelectMenuInteraction
) => {
  const user = (await User.findById(getUserId(message)))[0];
  const guildId = message.values[0];
  const guildName = client.guilds.cache.find((g) => g.id === guildId)?.name;

  if (guildName) {
    user.defaultGuildId = guildId;
    await user.save();

    await message.update({
      embeds: [],
      content: `Default guild set to **${guildName}**`,
      components: [],
    });
  }
};

export const SetDefaultGuild = async (
  message: Communication | ButtonInteraction | SelectMenuInteraction,
  guilds: Map<string, Guild>
) => {
  const row = new ActionRowBuilder<SelectMenuBuilder>();
  const menu = new SelectMenuBuilder().setCustomId("default_guild_select");

  if (guilds.size > 1) {
    guilds.forEach((g) => {
      menu.addOptions([
        {
          label: g.name,
          value: g.id,
        },
      ]);
    });
    row.addComponents(menu);

    replyTo(
      message,
      "You have joined multiple Discord guilds serviced by FleetBot. " +
        "Select one as your default for private messaging. You can change your default guild " +
        "by typing:\n **/options set_default_guild**.",
      undefined,
      undefined,
      [row]
    );
  } else {
    replyTo(
      message,
      "This command is for setting the default guild used when private messaging FleetBot" +
        "You have not joined more than one server serviced by FleetBot so this command is not needed."
    );
  }
};
