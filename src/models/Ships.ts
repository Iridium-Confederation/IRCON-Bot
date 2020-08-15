import {
  BelongsTo,
  Column,
  ForeignKey,
  Model,
  Sequelize,
  Table,
} from "sequelize-typescript";
import { Op } from "sequelize";
import { User } from "./User";
import { Snowflake } from "discord.js";

export class ShipDao {
  static async findShipsByName(
    name: string,
    guildId: Snowflake
  ): Promise<Ships[]> {
    return Ships.findAll({
      where: {
        shipname: {
          [Op.like]: name,
        },
        guildId: guildId,
      },
      include: [User],
    });
  }

  static async findShipsByOwnerLike(
    owner: string,
    guildId: Snowflake
  ): Promise<Ships[]> {
    return Ships.findAll({
      where: {
        guildId: guildId,
      },
      include: [
        {
          model: User,
          where: {
            lastKnownTag: {
              [Op.like]: owner,
            },
          },
        },
      ],
    });
  }

  static async findShipsByOwner(
    owner: string,
    guildId: Snowflake
  ): Promise<Ships[]> {
    return Ships.findAll({
      where: {
        guildId: guildId,
      },
      include: [
        {
          model: User,
          where: {
            lastKnownTag: owner,
          },
        },
      ],
    });
  }

  static async findShipsByOwnerId(
    owner: string,
    guildId: Snowflake | undefined
  ): Promise<Ships[]> {
    return Ships.findAll({
      where: {
        guildId: guildId ? guildId : "",
      },
      include: [
        {
          model: User,
          where: {
            discordUserId: owner,
          },
        },
      ],
    });
  }
  static initialize() {
    new Sequelize("database", "user", "password", {
      host: "localhost",
      dialect: "sqlite",
      logging: false,
      storage: "database.sqlite",
      models: [Ships, User],
    });
  }

  static create(param: {
    discordUserId: string;
    guildId: string | undefined;
    shipname: string;
  }) {
    Ships.create(param);
  }

  static async findAll(guildId: Snowflake) {
    return Ships.findAll({
      include: [User],
      where: {
        guildId: guildId,
      },
    });
  }

  static async count() {
    return Ships.count();
  }

  static sync() {
    Ships.sync();
  }
}

@Table
export class Ships extends Model<Ships> {
  @Column
  shipname!: string;

  @Column
  @ForeignKey(() => User)
  discordUserId!: string;

  @BelongsTo(() => User)
  owner!: User;

  @Column
  guildId!: string;
}
