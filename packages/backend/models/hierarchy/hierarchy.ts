/* eslint-disable @typescript-eslint/no-this-alias */
import { BaseError, Model } from "sequelize";

class HierarchyError extends BaseError {
  constructor(message?: string) {
    super(message);
    this.name = 'SequelizeHierarchyError';
  }
}

function beforeFindAfterExpandIncludeAll(this: any, options: any) {
  const model: any = this;

  // Check options do not include illegal hierarchies
  let hierarchyExists = false;
  if (options.hierarchy) {
    if (!model.hierarchy) {
      throw new HierarchyError(`You cannot get hierarchy of '${model.name}' - it is not hierarchical`);
    }
    hierarchyExists = true;
  }

  // Record whether `hierarchy` is set anywhere in includes, so expansion of
  // hierarchies can be skipped if their are none
  options.hierarchyExists = hierarchyExists || checkHierarchy(options, model);
}

function afterFind(this: any, result: any, options: any) {
  // If no results, return
  if (!result) return;

  // If no hierarchies to expand anywhere in tree of includes, return
  if (!options.hierarchyExists) return;

  const model = this, // eslint-disable-line no-invalid-this
    { hierarchy } = model;

  let parent;

  // Where called from getDescendents, find id of parent
  if (options.hierarchy && options.includeMap) {
    const include = options.includeMap[hierarchy.through.name];

    if (include && include.where) {
      const parentId = include.where[hierarchy.throughForeignKey];
      if (parentId) parent = { [hierarchy.primaryKey]: parentId };
    }
  }

  // Convert hierarchies into trees
  convertHierarchies(result, options, model, parent);

  // Where called from getDescendents, retrieve result from parent.children
  if (parent) {
    result.length = 0;
    result.push(...parent[hierarchy.childrenAs]);
  }
}

function checkHierarchy(options: any, model: any): boolean | undefined {
  // Check options do not include illegal hierarchies - throw error if so
  if (!options.include) return undefined;

  let hierarchyExists: boolean | undefined = false;
  for (const include of options.include) {
    const includeModel = include.model;

    // If hierarchy set, check is legal
    if (include.hierarchy) {
      if (!includeModel.hierarchy) {
        throw new HierarchyError(`You cannot get hierarchy of '${includeModel.name}' - it is not hierarchical`);
      }
      // Use model names rather than model references to compare,
      // as Model.scope() results in a new model object.
      if (includeModel.name.singular !== model.name.singular) {
        throw new HierarchyError(`You cannot get a hierarchy of '${includeModel.name}' without including it from a parent`);
      }
      if (include.as !== model.hierarchy.descendentsAs) {
        throw new HierarchyError(`You cannot set hierarchy on '${model.name}' without using the '${model.hierarchy.descendentsAs}' accessor`);
      }

      hierarchyExists = true;
    }

    // Check includes
    hierarchyExists = hierarchyExists || checkHierarchy(include, includeModel);
  }

  return hierarchyExists;
}

function convertHierarchies(results: any, options: any, model: any, parent: any) {
  if (!results) return;

  // Convert hierarchies into trees
  if (options.include) {
    for (const include of options.include) {
      const includeModel = include.model,
        accessor = include.as;

      if (!Array.isArray(results)) results = [results];

      for (const result of results) {
        convertHierarchies(result[accessor], include, includeModel, result);
      }
    }
  }

  if (options.hierarchy) convertHierarchy(results, model, parent);
}

function convertHierarchy(results: any, model: any, parent: any) {
  const { hierarchy } = model,
    { primaryKey, foreignKey } = hierarchy,
    childrenAccessor = hierarchy.childrenAs,
    descendentsAccessor = hierarchy.descendentsAs,
    throughAccessor = hierarchy.through.name;

  // Get parent ID and create output array
  let parentId, output: any[];
  if (parent) {
    parentId = parent[primaryKey];

    // Remove parent.descendents and create empty parent.children array
    output = [];
    setValue(parent, childrenAccessor, output);
    deleteValue(parent, descendentsAccessor);
  } else {
    parentId = null;

    // Duplicate results array and empty output array
    output = results;
    results = results.slice();
    output.length = 0;
  }

  // Run through all results, turning into tree

  // Create references object keyed by id
  // NB IDs prepended with '_' to ensure keys are non-numerical for fast hash lookup
  const references: any = {};
  for (const item of results) {
    references[`_${item[primaryKey]}`] = item;
  }

  // Run through results, transferring to output array or nesting within parent
  for (const item of results) {
    // Remove reference to through table
    deleteValue(item, throughAccessor);

    // If top-level item, add to output array
    const thisParentId = item[foreignKey];
    if (thisParentId === parentId) {
      output.push(item);
      continue;
    }

    // Not top-level item - nest inside parent
    const thisParent = references[`_${thisParentId}`];
    if (!thisParent) {
      throw new HierarchyError(`Parent ID ${thisParentId} not found in result set`);
    }

    let parentChildren = thisParent[childrenAccessor];
    if (!parentChildren) {
      parentChildren = [];
      setValue(thisParent, childrenAccessor, parentChildren);
    }

    parentChildren.push(item);
  }
}

function setValue(item: any, key: any, value: any) {
  item[key] = value;
  if (item instanceof Model) item.dataValues[key] = value;
}

function deleteValue(item: any, key: any) {
  delete item[key];
  if (item instanceof Model) delete item.dataValues[key];
}

// Replace field names in SQL marked with * with the identifier text quoted.
// e.g. SELECT *field FROM `Tasks` with identifiers {field: 'name'}
// -> SELECT `name` FROM `Tasks`
function replaceFieldNames(sql: any, identifiers: any, model: any) {
  const { queryInterface } = model.sequelize;
  for (let identifier in identifiers) {
    let fieldName: any = identifiers[identifier];
    // Get table field name for model field
    fieldName = (model.rawAttributes || model.attributes)[fieldName].field;

    // Replace identifiers
    sql = sql.replace(
      new RegExp(`\\*${identifier}(?![a-zA-Z0-9_])`, 'g'),
      queryInterface.quoteIdentifier(fieldName)
    );
  };
  return sql;
}

// Replace identifier with model's full table name taking schema into account
function replaceTableNames(sql: any, identifiers: any, sequelize: any) {
  const { queryInterface } = sequelize;
  for (let identifier in identifiers) {
    let model = identifiers[identifier];
    const tableName = model.getTableName();
    sql = sql.replace(
      new RegExp(`\\*${identifier}(?![a-zA-Z0-9_])`, 'g'),
      tableName.schema ? tableName.toString() : queryInterface.quoteIdentifier(tableName)
    );
  };
  return sql;
}

// String format conversion from camelCase or underscored format to human-readable format
// e.g. 'fooBar' -> 'Foo Bar', 'foo_bar' -> 'Foo Bar'
function humanize(str: any) {
  if (str == null || str === '') return '';
  str = `${str}`.replace(
    /[-_\s]+(.)?/g,
    (match, c) => (c ? c.toUpperCase() : '')
  );
  return str[0].toUpperCase() + str.slice(1).replace(/([A-Z])/g, ' $1');
}

// Add transaction and logging from options to query options
function addOptions(queryOptions: any, options: any) {
  const { transaction, logging } = options;
  if (transaction !== undefined) queryOptions.transaction = transaction;
  if (logging !== undefined) queryOptions.logging = logging;
  return queryOptions;
}

// Check if field is in `fields` option
function inFields(fieldName: any, options: any) {
  const { fields } = options;
  if (!fields) return true;
  return fields.includes(fieldName);
}

// Get field value if is included in `options.fields`
function valueFilteredByFields(fieldName: any, item: any, options: any) {
  if (!inFields(fieldName, options)) return null;
  return item.dataValues[fieldName];
}

// Add a field to `options.fields`.
// NB Clones `options.fields` before adding to it, to avoid options being mutated externally.
function addToFields(fieldName: any, options: any) {
  if (inFields(fieldName, options)) return;
  options.fields = options.fields ? options.fields.concat([fieldName]) : [fieldName];
}

// Constants
const PARENT = Symbol('PARENT');

async function beforeCreate(this: any, item: any, options: any) {
  const model = this,
    { primaryKey, foreignKey, levelFieldName, rootIdFieldName } = model.hierarchy,
    values = item.dataValues,
    parentId = valueFilteredByFields(foreignKey, item, options);

  // If no parent, set level and exit
  if (!parentId) {
    values[levelFieldName] = 1;
    addToFields(levelFieldName, options);
    return;
  }

  // Check that not trying to make item a child of itself
  const itemId = valueFilteredByFields(primaryKey, item, options);
  if (parentId === itemId) throw new HierarchyError('Parent cannot be a child of itself');

  // Set level based on parent
  const parent = await model.findOne(
    addOptions({ where: { [primaryKey]: parentId }, attributes: [levelFieldName, rootIdFieldName] }, options)
  );
  if (!parent) throw new HierarchyError('Parent does not exist');

  // Set hierarchy level
  values[levelFieldName] = parent[levelFieldName] + 1;
  addToFields(levelFieldName, options);

  // Set rootId from parent if parent has it
  if (parent[rootIdFieldName]) {
    values[rootIdFieldName] = parent[rootIdFieldName];
    addToFields(rootIdFieldName, options);
  }
}

async function afterCreate(this: any, item: any, options: any) {
  const model = this,
    {
      primaryKey, foreignKey, levelFieldName, rootIdFieldName, through, throughKey, throughForeignKey
    } = model.hierarchy,
    values = item.dataValues,
    parentId = valueFilteredByFields(foreignKey, item, options);

  // If no parent, set rootId for root post
  if (!parentId) {
    const itemId = values[primaryKey];
    values[rootIdFieldName] = itemId;
    await model.update(
      { [rootIdFieldName]: itemId },
      addOptions({ where: { [primaryKey]: itemId } }, options)
    );
    return;
  }

  // Create row in hierarchy table for parent
  const itemId = values[primaryKey];

  // Get ancestors
  let ancestors;
  if (values[levelFieldName] === 2) {
    // If parent is at top level - no ancestors
    ancestors = [];
  } else {
    // Get parent's ancestors
    ancestors = await through.findAll(
      addOptions({ where: { [throughKey]: parentId }, attributes: [throughForeignKey] }, options)
    );
  }

  // Add parent as ancestor
  ancestors.push({ [throughForeignKey]: parentId });

  // Save ancestors
  ancestors = ancestors.map((ancestor: any) => ({
    [throughForeignKey]: ancestor[throughForeignKey],
    [throughKey]: itemId
  }));

  await through.bulkCreate(ancestors, addOptions({}, options));
}

async function beforeUpdate(this: any, item: any, options: any) {
  const model = this,
    { sequelize } = model,
    {
      primaryKey, foreignKey, levelFieldName, rootIdFieldName, through, throughKey, throughForeignKey
    } = model.hierarchy,
    values = item.dataValues;

  // If parent not being updated, exit
  if (!inFields(foreignKey, options)) return;

  const itemId = values[primaryKey],
    parentId = values[foreignKey];
  let oldParentId = item._previousDataValues[foreignKey],
    oldLevel = item._previousDataValues[levelFieldName],
    oldRootId = item._previousDataValues[rootIdFieldName];

  if (oldParentId === undefined || oldLevel === undefined) {
    const itemRecord = await model.findOne(addOptions({
      where: { [primaryKey]: itemId }
    }, options));
    oldParentId = itemRecord[foreignKey];
    oldLevel = itemRecord[levelFieldName];
    oldRootId = itemRecord[rootIdFieldName];
  }

  // If parent not changing, exit
  if (parentId === oldParentId) return;

  // Get level (1 more than parent)
  let level;
  let newRootId = itemId;

  if (parentId === null) {
    level = 1;
  } else {
    // Check that not trying to make item a child of itself
    if (parentId === itemId) throw new HierarchyError('Parent cannot be a child of itself');

    let parent = options[PARENT];
    if (!parent) {
      parent = await model.findOne(
        addOptions({
          where: { [primaryKey]: parentId }, attributes: [levelFieldName, foreignKey, rootIdFieldName]
        }, options)
      );
      if (!parent) throw new HierarchyError('Parent does not exist');
    }

    level = parent[levelFieldName] + 1;
    newRootId = parent[rootIdFieldName] || parent[primaryKey];

    // Check that not trying to make item a child of one of its own descendents
    let illegal;
    if (parent[foreignKey] === itemId) {
      illegal = true;
    } else if (level > oldLevel + 2) {
      illegal = await through.findOne(
        addOptions({ where: { [throughKey]: parentId, [throughForeignKey]: itemId } }, options)
      );
    }
    if (illegal) throw new HierarchyError('Parent cannot be a descendent of itself');
  }

  // Set hierarchy level
  if (level !== oldLevel) {
    values[levelFieldName] = level;
    addToFields(levelFieldName, options);

    // Update hierarchy level for all descendents
    const levelDiff = level - oldLevel;
    const sql = `
      UPDATE ${model.getTableName()}
      SET "${levelFieldName}" = "${levelFieldName}" + $1
      WHERE id IN (
        SELECT "${throughKey}"
        FROM ${through.getTableName()} AS ancestors
        WHERE ancestors."${throughForeignKey}" = $2
      )
    `;

    await sequelize.query(
      sql,
      addOptions({ replacements: [levelDiff, itemId] }, options)
    );
  }

  // Delete ancestors from hierarchy table for item and all descendents
  if (oldParentId !== null) {
    const sql = `
      DELETE FROM ${through.getTableName()}
      USING ${through.getTableName()} AS descendents,
            ${through.getTableName()} AS ancestors
      WHERE descendents."${throughKey}" = ${through.getTableName()}."${throughKey}"
        AND ancestors."${throughForeignKey}" = ${through.getTableName()}."${throughForeignKey}"
        AND ancestors."${throughKey}" = $1
        AND (
          descendents."${throughForeignKey}" = $1
          OR descendents."${throughKey}" = $1
        )
    `;

    await sequelize.query(
      sql,
      addOptions({ replacements: [itemId] }, options)
    );
  }

  // Insert ancestors into hierarchy table for item and all descendents
  if (parentId !== null) {
    const sql = `
      INSERT INTO ${through.getTableName()} ("${throughKey}", "${throughForeignKey}")
      SELECT descendents."${throughKey}", ancestors."${throughForeignKey}"
      FROM (
        SELECT "${throughKey}"
        FROM ${through.getTableName()}
        WHERE "${throughForeignKey}" = $1
        UNION ALL
        SELECT $1
      ) AS descendents,
      (
        SELECT "${throughForeignKey}"
        FROM ${through.getTableName()}
        WHERE "${throughKey}" = $2
        UNION ALL
        SELECT $2
      ) AS ancestors
      ON CONFLICT DO NOTHING
    `;

    await sequelize.query(
      sql,
      addOptions({ replacements: [itemId, parentId] }, options)
    );
  }

  // Update rootId if changed
  if (newRootId !== oldRootId && oldRootId) {
    values[rootIdFieldName] = newRootId;
    addToFields(rootIdFieldName, options);

    const sql = `
      WITH RECURSIVE descendants AS (
        SELECT id FROM ${model.getTableName()}
        WHERE id = $1
        UNION ALL
        SELECT p.id
        FROM ${model.getTableName()} p
        INNER JOIN descendants d ON p."${foreignKey}" = d.id
      )
      UPDATE ${model.getTableName()}
      SET "${rootIdFieldName}" = $2
      WHERE id IN (SELECT id FROM descendants)
        AND "${rootIdFieldName}" IS NOT NULL
    `;

    await sequelize.query(
      sql,
      addOptions({ replacements: [itemId, newRootId] }, options)
    );
  }
}

function beforeBulkCreate(daos: any, options: any) {
  // Set individualHooks = true so that beforeCreate and afterCreate hooks run
  options.individualHooks = true;
}

async function beforeBulkUpdate(this: any, options: any) {
  const model = this,
    { primaryKey, foreignKey, levelFieldName } = model.hierarchy;

  // If not updating `parentId`, exit
  if (!inFields(foreignKey, options)) return;

  // Fetch items to be updated
  const items = await model.findAll(addOptions({
    where: options.where,
    attributes: [primaryKey, foreignKey, levelFieldName]
  }, options));

  // Get level
  const { attributes } = options,
    parentId = attributes[foreignKey];
  let level;
  if (parentId === null) {
    level = 1;
  } else {
    const parent = await model.findOne(
      addOptions({
        where: { [primaryKey]: parentId }, attributes: [levelFieldName, foreignKey]
      }, options)
    );
    if (!parent) throw new HierarchyError('Parent does not exist');

    level = parent[levelFieldName] + 1;

    // Record parent on options to be used by `beforeUpdate`
    options[PARENT] = parent;
  }

  // Set level
  attributes[levelFieldName] = level;
  addToFields(levelFieldName, options);

  // Run `beforeUpdate` hook on each item in series
  options = Object.assign({}, options);
  delete options.where;
  delete options.attributes;

  for (const item of items) {
    Object.assign(item, attributes);
    await beforeUpdate.call(model, item, options);
  }
}

export {
  beforeFindAfterExpandIncludeAll,
  afterFind,
  beforeCreate,
  afterCreate,
  beforeUpdate,
  beforeBulkCreate,
  beforeBulkUpdate
}