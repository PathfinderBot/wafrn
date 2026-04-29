import { DataTypes } from "sequelize";
import { Migration } from "../migrate.js";

export const up: Migration = async (params) => {
	const queryInterface = params.context;

	await queryInterface.addColumn('posts', 'language', {
		type: DataTypes.STRING(3),
		defaultValue: null,
		allowNull: true,
	});

	// await queryInterface.createTable('postLanguage', {
	// 	"postId": {
	// 		type: DataTypes.UUID,
	// 		onUpdate: "CASCADE",
	// 		onDelete: "CASCADE",
	// 		references: {
	// 			model: "posts",
	// 			key: "id",
	// 		},
	// 		unique: "postLanguage_postId_unique",
	// 		field: "postId",
	// 		primaryKey: true,
	// 		allowNull: false,
	// 	},
	// 	"language": {
	// 		type: DataTypes.STRING(3),
	// 		field: "language",
	// 		allowNull: false,
	// 	}
	// });

	// await queryInterface.addIndex('postLanguage',
	// 	["language"],
	// 	{
	// 		name: "postLanguage_language",
	// 		unique: false,
	// 	}
	// )
}

export const down: Migration = async (params) => {
	const queryInterface = params.context;
	await queryInterface.removeColumn('posts', 'language');
	// await queryInterface.dropTable('postLanguage');
}