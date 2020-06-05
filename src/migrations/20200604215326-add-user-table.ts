import {DataType, PrimaryKey, Table, Unique} from "sequelize-typescript";
import {QueryInterface} from "sequelize";

module.exports = {
  async up(queryInterface: QueryInterface, sequalize: any){
    // return queryInterface.changeColumn(
    // 'ships',
    // 'discordUserId',
    // {
    //   type: DataType.STRING,
    //   references: {
    //     model: 'Users',
    //     key: 'discordUserId'
    //   },
    //   onUpdate: 'CASCADE',
    //   onDelete: 'SET NULL'
    // });
  },
};
