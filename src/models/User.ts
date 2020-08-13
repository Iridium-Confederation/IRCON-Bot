import {
  Column,
  HasMany,
  Model,
  PrimaryKey,
  Table,
  Unique,
} from "sequelize-typescript";
import { Ships } from "./Ships";

@Table
export class User extends Model<User> {
  @PrimaryKey
  @Unique
  @Column
  discordUserId!: string;

  @Column
  lastKnownTag!: string;

  @HasMany(() => Ships)
  ownedShips!: Ships[];

  static async findByTag(tag: string): Promise<User[]> {
    return User.findAll({
      where: {
        lastKnownTag: tag,
      },
      include: [Ships],
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
