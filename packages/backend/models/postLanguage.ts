import {
  Model, Table, Column, DataType, ForeignKey,
  BelongsTo
} from "sequelize-typescript";
import { Post } from "./post.js";

export interface PostLanguageAttributes {
	postId: string,
	language?: string,
}

@Table({
	tableName: "postLanguage",
	modelName: "postLanguage",
	timestamps: false,
})
class PostLanguage extends Model<PostLanguageAttributes, PostLanguageAttributes> implements PostLanguageAttributes {
	@ForeignKey(() => Post)
	@Column({
		primaryKey: true,
		type: DataType.UUID
	})
	declare postId: string;

	@Column({
		type: DataType.STRING(3),
		defaultValue: undefined,
	})
	declare language?: string;
}
