import { DataType, PrimaryKey, Table, Unique } from "sequelize-typescript";
import { QueryInterface } from "sequelize";

module.exports = {
  async up(queryInterface: QueryInterface, sequalize: any) {
    return queryInterface.addColumn("ships", "fleetyardsId", {
      type: DataType.STRING,
    });
  },
};
