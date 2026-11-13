import {
  AllowNull,
  BelongsTo,
  Column,
  ForeignKey,
  Model,
  Sequelize,
  Table,
} from "sequelize-typescript";
import { Op, Transaction } from "sequelize";
import { User } from "./User";
import { Snowflake } from "discord.js";
import { findShip } from "../utils";
import { MAX_SHIPS_PER_GUILD } from "../shipLimits";

type ShipCreateAttributes = {
  discordUserId: string;
  guildId: string;
  shipname: string;
};

export class ShipDao {
  static sequelize: Sequelize;

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
    this.sequelize = new Sequelize("database", "user", "password", {
      host: "localhost",
      dialect: "sqlite",
      logging: false,
      storage: "database.sqlite",
      models: [Ships, User],
    });
  }

  private static async createWithinLimit(
    param: ShipCreateAttributes[]
  ): Promise<boolean> {
    if (param.length === 0) {
      return true;
    }

    const guildId = param[0].guildId;
    if (param.some((ship) => ship.guildId !== guildId)) {
      throw new Error("Cannot create ships for multiple guilds in one batch.");
    }

    return this.sequelize.transaction(
      { type: Transaction.TYPES.IMMEDIATE },
      async (transaction) => {
        const orgCount = await Ships.count({
          where: { guildId: guildId },
          transaction: transaction,
        });

        if (orgCount + param.length > MAX_SHIPS_PER_GUILD) {
          return false;
        }

        await Ships.bulkCreate(param, { transaction: transaction });
        return true;
      }
    );
  }

  static bulkCreate(param: ShipCreateAttributes[]): Promise<boolean> {
    return this.createWithinLimit(param);
  }

  static create(param: ShipCreateAttributes): Promise<boolean> {
    return this.createWithinLimit([param]);
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
  discordUserId: Snowflake,
  guildId: Snowflake,
  deleteAll: boolean
) {
  const searchedShip = findShip(shipName);
  const removed = new Set<FleetViewShip>();
  const matches = await ShipDao.findShipsByOwnerId(discordUserId, guildId);
  for (const m of matches) {
    const dbShip = findShip(m.shipname);

    if (
      dbShip &&
      (deleteAll || (searchedShip && searchedShip.slug === dbShip.slug))
    ) {
      await m.destroy();
      removed.add(dbShip);

      if (!deleteAll) {
        break;
      }
    }
  }

  return removed;
}
