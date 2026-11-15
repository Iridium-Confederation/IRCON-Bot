import { DataTypes, QueryInterface } from "sequelize";

module.exports = {
  async up(queryInterface: QueryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const tables = (await queryInterface.showAllTables({ transaction }))
        .map((name) => name.toLowerCase());

      // Existing installations already have these tables. Never sync/alter them.
      if (!tables.includes("users")) {
        await queryInterface.createTable("Users", {
          discordUserId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
          lastKnownTag: { type: DataTypes.STRING },
          defaultGuildId: { type: DataTypes.STRING, allowNull: true },
          // The historical 20240531 migration adds lastKnownDisplayName.
          createdAt: { type: DataTypes.DATE, allowNull: false },
          updatedAt: { type: DataTypes.DATE, allowNull: false },
        }, { transaction });
      }

      if (!tables.includes("ships")) {
        await queryInterface.createTable("Ships", {
          id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
          shipname: { type: DataTypes.STRING },
          discordUserId: {
            type: DataTypes.STRING,
            references: { model: "Users", key: "discordUserId" },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
          },
          guildId: { type: DataTypes.STRING },
          fleetyardsId: { type: DataTypes.STRING, allowNull: true },
          createdAt: { type: DataTypes.DATE, allowNull: false },
          updatedAt: { type: DataTypes.DATE, allowNull: false },
        }, { transaction });
      }
    });
  },
};
