import {
  AllowNull,
  Column,
  HasMany,
  Model,
  PrimaryKey,
  Table,
  Unique,
} from "sequelize-typescript";
import { Ships } from "./Ships";
import { Snowflake } from "discord.js";

const admins = require("../../admins.json");

@Table
export class User extends Model<User> {
  @PrimaryKey
  @Unique
  @Column
  discordUserId!: string;

  @Column
  lastKnownTag!: string;

  // Currently bugged. Needs to be specified per guild.
  @Column
  lastKnownDisplayName!: string;

  @AllowNull
  @Column("VARCHAR")
  defaultGuildId!: string | null;

  @HasMany(() => Ships)
  ownedShips!: Ships[];

  static isAdmin(discordUserId: Snowflake) {
    return admins
      .map((a: any) => a.discordId)
      .find((id: string) => id == discordUserId);
  }

  static async findByTag(tag: string): Promise<User[]> {
    return User.findAll({
      where: {
        lastKnownTag: tag,
      },
      include: [Ships],
    });
  }

  static async findByGuild(guildId: string): Promise<User[]> {
    return User.findAll({
      include: [
        {
          model: Ships,
          required: true,
          where: {
            guildId: guildId,
          },
        },
      ],
    });
  }

  static async findById(discordUserId: string): Promise<User[]> {
    return User.findAll({
      where: {
        discordUserId: discordUserId,
      },
    });
  }
}
