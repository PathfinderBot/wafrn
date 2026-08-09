/* eslint-disable @typescript-eslint/no-this-alias */
import { BaseError, Model } from 'sequelize'

class HierarchyError extends BaseError {
  constructor(message?: string) {
    super(message)
    this.name = 'SequelizeHierarchyError'
  }
}

function beforeFindAfterExpandIncludeAll(this: any, options: any) {
  const model: any = this

  // Check options do not include illegal hierarchies
  let hierarchyExists = false
  if (options.hierarchy) {
    if (!model.hierarchy) {
      throw new HierarchyError(`You cannot get hierarchy of '${model.name}' - it is not hierarchical`)
    }
    hierarchyExists = true
  }

  // Record whether `hierarchy` is set anywhere in includes, so expansion of
  // hierarchies can be skipped if their are none
  options.hierarchyExists = hierarchyExists || checkHierarchy(options, model)
}

function checkHierarchy(options: any, model: any): boolean | undefined {
  // Check options do not include illegal hierarchies - throw error if so
  if (!options.include) return undefined

  let hierarchyExists: boolean | undefined = false
  for (const include of options.include) {
    const includeModel = include.model

    // If hierarchy set, check is legal
    if (include.hierarchy) {
      if (!includeModel.hierarchy) {
        throw new HierarchyError(`You cannot get hierarchy of '${includeModel.name}' - it is not hierarchical`)
      }
      // Use model names rather than model references to compare,
      // as Model.scope() results in a new model object.
      if (includeModel.name.singular !== model.name.singular) {
        throw new HierarchyError(
          `You cannot get a hierarchy of '${includeModel.name}' without including it from a parent`
        )
      }
      if (include.as !== model.hierarchy.descendentsAs) {
        throw new HierarchyError(
          `You cannot set hierarchy on '${model.name}' without using the '${model.hierarchy.descendentsAs}' accessor`
        )
      }

      hierarchyExists = true
    }

    // Check includes
    hierarchyExists = hierarchyExists || checkHierarchy(include, includeModel)
  }

  return hierarchyExists
}

// Add transaction and logging from options to query options
function addOptions(queryOptions: any, options: any) {
  const { transaction, logging } = options
  if (transaction !== undefined) queryOptions.transaction = transaction
  if (logging !== undefined) queryOptions.logging = logging
  return queryOptions
}

// Check if field is in `fields` option
function inFields(fieldName: any, options: any) {
  const { fields } = options
  if (!fields) return true
  return fields.includes(fieldName)
}

// Get field value if is included in `options.fields`
function valueFilteredByFields(fieldName: any, item: any, options: any) {
  if (!inFields(fieldName, options)) return null
  return item.dataValues[fieldName]
}

// Add a field to `options.fields`.
// NB Clones `options.fields` before adding to it, to avoid options being mutated externally.
function addToFields(fieldName: any, options: any) {
  if (inFields(fieldName, options)) return
  options.fields = options.fields ? options.fields.concat([fieldName]) : [fieldName]
}

// Constants
const PARENT = Symbol('PARENT')

async function beforeCreate(this: any, item: any, options: any) {
  const model = this,
    { primaryKey, foreignKey, levelFieldName, rootIdFieldName } = model.hierarchy,
    values = item.dataValues,
    parentId = valueFilteredByFields(foreignKey, item, options)

  // If no parent, set level and exit
  if (!parentId) {
    values[levelFieldName] = 1
    addToFields(levelFieldName, options)
    return
  }

  // Check that not trying to make item a child of itself
  const itemId = valueFilteredByFields(primaryKey, item, options)
  if (parentId === itemId) throw new HierarchyError('Parent cannot be a child of itself')

  // Set level based on parent
  const parent = await model.findOne(
    addOptions({ where: { [primaryKey]: parentId }, attributes: [levelFieldName, rootIdFieldName] }, options)
  )
  if (!parent) throw new HierarchyError('Parent does not exist')

  // Set hierarchy level
  values[levelFieldName] = parent[levelFieldName] + 1
  addToFields(levelFieldName, options)

  // Set rootId from parent if parent has it
  if (parent[rootIdFieldName]) {
    values[rootIdFieldName] = parent[rootIdFieldName]
    addToFields(rootIdFieldName, options)
  }
}

async function afterCreate(this: any, item: any, options: any) {
  const model = this,
    { primaryKey, foreignKey, rootIdFieldName } = model.hierarchy,
    values = item.dataValues,
    parentId = valueFilteredByFields(foreignKey, item, options)

  // If no parent, set rootId for root post
  if (!parentId) {
    const itemId = values[primaryKey]
    values[rootIdFieldName] = itemId
    await model.update({ [rootIdFieldName]: itemId }, addOptions({ where: { [primaryKey]: itemId } }, options))
    return
  }
}

async function beforeUpdate(this: any, item: any, options: any) {
  const model = this,
    { sequelize } = model,
    { primaryKey, foreignKey, levelFieldName, rootIdFieldName } = model.hierarchy,
    values = item.dataValues

  // If parent not being updated, exit
  if (!inFields(foreignKey, options)) return

  const itemId = values[primaryKey],
    parentId = values[foreignKey]
  let oldParentId = item._previousDataValues[foreignKey],
    oldLevel = item._previousDataValues[levelFieldName],
    oldRootId = item._previousDataValues[rootIdFieldName]

  if (oldParentId === undefined || oldLevel === undefined) {
    const itemRecord = await model.findOne(
      addOptions(
        {
          where: { [primaryKey]: itemId }
        },
        options
      )
    )
    oldParentId = itemRecord[foreignKey]
    oldLevel = itemRecord[levelFieldName]
    oldRootId = itemRecord[rootIdFieldName]
  }

  // If parent not changing, exit
  if (parentId === oldParentId) return

  // Get level (1 more than parent)
  let level
  let newRootId = itemId

  if (parentId === null) {
    level = 1
  } else {
    // Check that not trying to make item a child of itself
    if (parentId === itemId) throw new HierarchyError('Parent cannot be a child of itself')

    let parent = options[PARENT]
    if (!parent) {
      parent = await model.findOne(
        addOptions(
          {
            where: { [primaryKey]: parentId },
            attributes: [levelFieldName, foreignKey, rootIdFieldName]
          },
          options
        )
      )
      if (!parent) throw new HierarchyError('Parent does not exist')
    }

    level = parent[levelFieldName] + 1
    newRootId = parent[rootIdFieldName] || parent[primaryKey]

    // Check that not trying to make item a child of one of its own descendents
    let illegal
    if (parent[foreignKey] === itemId) {
      illegal = true
    } else if (level > oldLevel + 2) {
      // New style: check if newParent is descendant of itemId using recursive CTE
      const result = await sequelize.query(
        `
            WITH RECURSIVE descendants AS (
              SELECT id FROM ${model.getTableName()}
              WHERE id = :itemId
              UNION ALL
              SELECT p.id
              FROM ${model.getTableName()} p
              INNER JOIN descendants d ON p."${foreignKey}" = d.id
            )
            SELECT COUNT(*) as count FROM descendants WHERE id = :parentId
          `,
        addOptions({ replacements: { itemId: itemId, parentId: parentId }, type: 'SELECT' }, options)
      )
      illegal = (result as any)[0].count > 0
    }
    if (illegal) throw new HierarchyError('Parent cannot be a descendent of itself')
  }

  // Set hierarchy level
  if (level !== oldLevel) {
    values[levelFieldName] = level
    addToFields(levelFieldName, options)

    // Update hierarchy level for all descendents
    const levelDiff = level - oldLevel

    // New style: use recursive CTE to find descendants
    const sql = `
        WITH RECURSIVE descendants AS (
          SELECT id FROM ${model.getTableName()}
          WHERE id = :itemId
          UNION ALL
          SELECT p.id
          FROM ${model.getTableName()} p
          INNER JOIN descendants d ON p."${foreignKey}" = d.id
        )
        UPDATE ${model.getTableName()}
        SET "${levelFieldName}" = "${levelFieldName}" + :levelDiff
        WHERE id IN (SELECT id FROM descendants)
      `

    await sequelize.query(sql, addOptions({ replacements: { itemId: itemId, levelDiff: levelDiff } }, options))
  }

  // Update rootId if changed
  if (newRootId !== oldRootId && oldRootId) {
    values[rootIdFieldName] = newRootId
    addToFields(rootIdFieldName, options)

    const sql = `
      WITH RECURSIVE descendants AS (
        SELECT id FROM ${model.getTableName()}
        WHERE id = :itemId
        UNION ALL
        SELECT p.id
        FROM ${model.getTableName()} p
        INNER JOIN descendants d ON p."${foreignKey}" = d.id
      )
      UPDATE ${model.getTableName()}
      SET "${rootIdFieldName}" = :newRootId
      WHERE id IN (SELECT id FROM descendants)
        AND "${rootIdFieldName}" IS NOT NULL
    `

    await sequelize.query(sql, addOptions({ replacements: { itemId: itemId, newRootId: newRootId } }, options))
  }
}

function beforeBulkCreate(daos: any, options: any) {
  // Set individualHooks = true so that beforeCreate and afterCreate hooks run
  options.individualHooks = true
}

async function beforeBulkUpdate(this: any, options: any) {
  const model = this,
    { primaryKey, foreignKey, levelFieldName } = model.hierarchy

  // If not updating `parentId`, exit
  if (!inFields(foreignKey, options)) return

  // Fetch items to be updated
  const items = await model.findAll(
    addOptions(
      {
        where: options.where,
        attributes: [primaryKey, foreignKey, levelFieldName]
      },
      options
    )
  )

  // Get level
  const { attributes } = options,
    parentId = attributes[foreignKey]
  let level
  if (parentId === null) {
    level = 1
  } else {
    const parent = await model.findOne(
      addOptions(
        {
          where: { [primaryKey]: parentId },
          attributes: [levelFieldName, foreignKey]
        },
        options
      )
    )
    if (!parent) throw new HierarchyError('Parent does not exist')

    level = parent[levelFieldName] + 1

    // Record parent on options to be used by `beforeUpdate`
    options[PARENT] = parent
  }

  // Set level
  attributes[levelFieldName] = level
  addToFields(levelFieldName, options)

  // Run `beforeUpdate` hook on each item in series
  options = Object.assign({}, options)
  delete options.where
  delete options.attributes

  for (const item of items) {
    Object.assign(item, attributes)
    await beforeUpdate.call(model, item, options)
  }
}

export { beforeFindAfterExpandIncludeAll, beforeCreate, afterCreate, beforeUpdate, beforeBulkCreate, beforeBulkUpdate }
