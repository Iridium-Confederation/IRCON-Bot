'use strict';

module.exports = {
  async up(queryInterface, Sequelize){
    await queryInterface.addColumn(
      'Ships',
      'discordUserId',
      {
        type: Sequelize.STRING,
      }
    );
  },
  async down(queryInterface, Sequelize){

  }
};
