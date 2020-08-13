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

@Table
export class Ships extends Model<Ships> {
  @Column
  shipname!: string;

  @Column
  @ForeignKey(() => User)
  discordUserId!: string;

  @BelongsTo(() => User)
  owner!: User;

  static initialize() {
    new Sequelize("database", "user", "password", {
      host: "localhost",
      dialect: "sqlite",
      logging: false,
      storage: "database.sqlite",
      models: [Ships, User],
    });
  }

  static async findShipsByName(name: string): Promise<Ships[]> {
    return Ships.findAll({
      where: {
        shipname: {
          [Op.like]: name,
        },
      },
      include: [User],
    });
  }

  static async findShipsByOwnerLike(owner: string): Promise<Ships[]> {
    return Ships.findAll({
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

  static async findShipsByOwner(owner: string): Promise<Ships[]> {
    return Ships.findAll({
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

  static async findShipsByOwnerId(owner: string): Promise<Ships[]> {
    return Ships.findAll({
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
}
