import { DataTypes, Sequelize, UUIDV4 } from 'sequelize'
import { Migration } from '../migrate.js'
import { FederatedHost } from '../models/federatedHost.js'
import { User } from '../models/user.js'
import { DataType } from 'sequelize-typescript'

export const up: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.addColumn('posts', 'rootId', {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'posts',
      key: 'id'
    }
  })

  await queryInterface.addIndex('posts', ['rootId'], {
    name: 'posts_rootId_idx',
    unique: false
  })

  await queryInterface.addIndex('posts', ['hierarchyLevel', 'rootId'], {
    name: 'posts_hierarchy_root_idx',
    unique: false
  })
}
export const down: Migration = async (params) => {
  const queryInterface = params.context
  try {
    await queryInterface.removeIndex('posts', 'posts_hierarchy_root_idx')
  } catch (e) {}
  try {
    await queryInterface.removeIndex('posts', 'posts_rootId_idx')
  } catch (e) {}

  await queryInterface.removeColumn('posts', 'rootId')
}
