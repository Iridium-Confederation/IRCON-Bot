import { QueryInterface } from "sequelize";

module.exports = {
  async up(queryInterface: QueryInterface) {
    return queryInterface.addColumn("Users", "lastKnownDisplayName", {
      type: "VARCHAR"
    });
  }
};
