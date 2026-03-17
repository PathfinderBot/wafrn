import { DataTypes, Sequelize, UUIDV4 } from "sequelize";
import { Migration } from "../migrate.js";
import { FederatedHost } from "../models/federatedHost.js";
import { User } from "../models/user.js";
import { DataType } from "sequelize-typescript";

export const up: Migration = async (params) => {
  const queryInterface = params.context;
  await queryInterface.sequelize.query(
    `CREATE INDEX users_federatedHostId ON "users" ("federatedHostId");
CREATE INDEX follows_follower_id_accepted ON "follows" ("followerId", "accepted");
CREATE INDEX serverBlocks_blockedServerId ON "serverBlocks" ("blockedServerId");
CREATE INDEX silencedPosts_userId ON "silencedPosts" ("userId");
CREATE INDEX silencedPosts_postId ON "silencedPosts" ("postId");
CREATE INDEX postReports_postId ON "postReports" ("postId");
CREATE INDEX inviteCodes_createdByUserId ON "inviteCodes" ("createdByUserId");
CREATE INDEX questionPollAnswers_questionPollQuestionId ON "questionPollAnswers" ("questionPollQuestionId");
CREATE INDEX questionPollAnswers_userId ON "questionPollAnswers" ("userId");
CREATE INDEX notifications_user_detached_date ON "notifications" ("notifiedUserId", "detached", "createdAt" DESC);`
  );
  

};
export const down: Migration = async (params) => {
  const queryInterface = params.context;
  await queryInterface.sequelize.query(`DROP INDEX bites_biter;`);
  await queryInterface.sequelize.query(`DROP INDEX bites_bited;`);
  await queryInterface.sequelize.query(`DROP INDEX userBitesPostRelations_biter`);
  await queryInterface.sequelize.query(`DROP INDEX userBitesPostRelations_post`);

};
