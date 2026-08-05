import { DataTypes } from 'sequelize'
import { Migration } from '../migrate.js'

export const up: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.addColumn('posts', 'slug', {
    type: DataTypes.STRING,
    allowNull: true
  })

  await queryInterface.sequelize.query(
    `ALTER TABLE posts ADD CONSTRAINT "posts_userId_slug_unique" UNIQUE ("userId", "slug");`
  )
}
export const down: Migration = async (params) => {
  const queryInterface = params.context

  await queryInterface.sequelize.query(`ALTER TABLE posts DROP CONSTRAINT IF EXISTS "posts_userId_slug_unique";`)
  await queryInterface.removeColumn('posts', 'slug')
}
