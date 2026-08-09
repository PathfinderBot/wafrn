/* eslint-disable guard-for-in */
import { Post, sequelize } from '../models/index.js'
import { Op, QueryTypes } from 'sequelize'
import { Privacy } from '../models/post.js'

export default async function getPostGroupDetails(postGroup: any[]) {
  const postIds: string[] = postGroup.map((elem) => elem.rootId)

  // Get count of posts for each rootId
  const queryCounts = (await sequelize.query(
    `
    SELECT 
      "rootId",
      COUNT(*) as notes
    FROM posts
    WHERE "rootId" = ANY(ARRAY[:postIds]::uuid[])
      AND "isDeleted" = false
    GROUP BY "rootId"
    `,
    {
      replacements: { postIds: postIds },
      type: QueryTypes.SELECT
    }
  )) as Array<{ rootId: string; notes: number }>

  // Create a map for quick lookup
  const notesMap = new Map<string, number>()
  queryCounts.forEach((row: any) => {
    notesMap.set(row.rootId, row.notes)
  })

  // Add notes count to each post group element
  return postGroup.map((elem) => {
    let notes = notesMap.get(elem.rootId) || 1
    notes = notes - 1
    return { ...(elem.dataValues || elem), notes }
  })
}
