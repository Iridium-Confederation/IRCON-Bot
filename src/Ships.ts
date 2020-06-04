import {Column, Model, Sequelize, Table} from "sequelize-typescript";
import {Op} from "sequelize";

@Table
export class Ships extends Model<Ships> {
  @Column
  username!: string;

  @Column
  shipname!: string;

  @Column
  discordUserId!: string

  static initialize (){
    new Sequelize('database', 'user', 'password', {
      host: 'localhost',
      dialect: 'sqlite',
      logging: false,
      storage: 'database.sqlite',
      models: [Ships]
    });
  }

  static async findShipsByName(name: string) {
    return Ships.findAll({
      where: {
        shipname: {
          [Op.like]: name
        }
      }
    });
  }

  static async findShipsByOwnerLike(owner: string) {
    return Ships.findAll({
      where: {
        username: {
          [Op.like]: owner
        }
      }
    });
  }

  static async findShipsByOwner(owner: string) {
    return Ships.findAll({
      where: {
        username: owner
      }
    });
  }
}

