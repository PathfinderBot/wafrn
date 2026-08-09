import { DataTypes, Sequelize, UUIDV4 } from 'sequelize'
import { Migration } from '../migrate.js'
import { FederatedHost } from '../models/federatedHost.js'
import { User } from '../models/user.js'
import { DataType } from 'sequelize-typescript'

export const up: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.removeColumn('posts', 'featured')

  await queryInterface.addColumn('posts', 'featured', {
    type: DataTypes.DATE,
    defaultValue: null,
    allowNull: true
  })
}
export const down: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.removeColumn('posts', 'featured')
  await queryInterface.addColumn('posts', 'featured', {
    type: DataType.BOOLEAN,
    defaultValue: false,
    allowNull: true
  })
}
