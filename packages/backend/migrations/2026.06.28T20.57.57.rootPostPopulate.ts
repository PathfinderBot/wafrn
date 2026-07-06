import { DataTypes, QueryTypes, Sequelize, UUIDV4 } from "sequelize";
import { Migration } from "../migrate.js";
import { FederatedHost } from "../models/federatedHost.js";
import { User } from "../models/user.js";
import { DataType } from "sequelize-typescript";
import { logger } from "../utils/logger.js";
import { sequelize } from "../models/index.js";

export const up: Migration = async (params) => {
    const queryInterface = params.context;
    let processed = 0;
    let iteration = 0;
    const batchSize = 250;

    logger.debug('rootId backfill starting');

    while (true) {
        // Get batch of posts without rootId
        const updateQuery = await sequelize.query(`WITH RECURSIVE
batch AS (
    SELECT id, "parentId"
    FROM posts
    WHERE "rootId" IS NULL
    LIMIT ${batchSize}
),
chain AS (
    SELECT
        b.id            AS start_id,
        p.id            AS current_id,
        p."parentId"    AS current_parent_id,
        p."rootId"      AS current_root_id,
        ARRAY[p.id]     AS visited,
        false           AS orphaned
    FROM batch b
    JOIN posts p ON p.id = b.id
    UNION ALL
    SELECT
        c.start_id,
        p.id,
        p."parentId",
        p."rootId",
        c.visited || p.id,
        (p.id IS NULL)
    FROM chain c
    LEFT JOIN posts p ON p.id = c.current_parent_id
    WHERE
        c.current_root_id IS NULL
        AND c.current_parent_id IS NOT NULL
        AND NOT (c.current_parent_id = ANY(c.visited))
),
resolved AS (
    SELECT DISTINCT ON (start_id)
        start_id,
        CASE
            WHEN current_root_id IS NOT NULL THEN current_root_id
            WHEN current_parent_id IS NULL AND NOT orphaned THEN current_id
            ELSE NULL
        END AS resolved_root_id
    FROM chain
    ORDER BY start_id, array_length(visited, 1) DESC
),
to_update AS (
    SELECT start_id, resolved_root_id
    FROM resolved
    WHERE resolved_root_id IS NOT NULL
),
expanded AS (
    -- descendants via closure table
    SELECT DISTINCT pa."postsId" AS id, t.resolved_root_id AS "rootId"
    FROM to_update t
    JOIN postsancestors pa ON pa."ancestorId" = t.resolved_root_id
    UNION
    -- the batch post itself, in case postsancestors has no self-row
    SELECT t.start_id AS id, t.resolved_root_id AS "rootId"
    FROM to_update t
)
UPDATE posts
SET "rootId" = expanded."rootId"
FROM expanded
WHERE posts.id = expanded.id;`, {
            type: QueryTypes.UPDATE
        })
        const updated = updateQuery[1]
        processed += updated;
        iteration++;
        if (updated === 0) {
            logger.info(`update complete`)
            break;
        }
        else {
            logger.info(`Updating rootId: processed ${processed} (${updated}), iteration ${iteration}`)
        }
    }

};
export const down: Migration = async (params) => {
    const queryInterface = params.context;


};
