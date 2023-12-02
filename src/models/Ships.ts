import {
  AllowNull,
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
import { findShip } from "../utils";

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

  static bulkCreate(param: {
    discordUserId: string;
    guildId: string;
    shipname: string;
  }[]) {
    Ships.bulkCreate(param);
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

  static async count(guildId?: Snowflake) {
    if (guildId) {
      return Ships.count({
        where: {
          guildId: guildId,
        },
      });
    } else {
      return Ships.count();
    }
  }

  static sync() {
    Ships.sync();
  }
}

@Table
export class Ships extends Model {
  @Column
  shipname!: string;

  @Column
  @ForeignKey(() => User)
  discordUserId!: string;

  @BelongsTo(() => User)
  owner!: User;

  @Column
  guildId!: string;

  @AllowNull
  @Column("VARCHAR")
  fleetyardsId!: string | null;
}

export async function deleteShips(
  shipName: string,
  owner: string,
  guildId: Snowflake,
  deleteAll: boolean
) {
  const searchedShip = findShip(shipName);
  const removed = new Set<FleetViewShip>();
  const matches = await ShipDao.findShipsByOwner(owner, guildId);
  matches.find((m: Ships) => {
    const dbShip = findShip(m.shipname);

    if (
      dbShip &&
      (deleteAll || (searchedShip && searchedShip.slug === dbShip.slug))
    ) {
      m.destroy();
      removed.add(dbShip);

      if (!deleteAll) {
        return removed;
      }
    }
  });

  return removed;
}
