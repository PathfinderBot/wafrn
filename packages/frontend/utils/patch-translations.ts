import fs from 'fs'

/**
 * Options for patchObjects()
 */
type PatchOptions = { placeholderTransformer: (value: string) => string }

const defaultOptions: PatchOptions = {
  placeholderTransformer: (value) => '[FIXME] Patched value: ' + value
}

/**
 * Returns whether every value of two arrays are equal
 */
function arrayEqual<T>(first: T[], second: T[]): boolean {
  return first.every((val, index) => val === second[index])
}

/**
 * Recursively patch entries from {from} to {to} with given options
 */
function patchEntries(from: Object, to: Object, options: PatchOptions) {
  const fromEntries = Object.entries(from)
  const toEntries = Object.entries(to)

  for (let i = 0; i < fromEntries.length; i++) {
    const fromKey = fromEntries[i][0]
    const fromValue = fromEntries[i][1]

    const missingKey = fromKey !== toEntries.at(i)?.at(0)

    if (typeof fromValue === 'object') {
      if (missingKey) {
        toEntries.splice(i, 0, [fromKey, {}])
      }

      toEntries[i][1] = patchEntries(fromValue, toEntries[i][1], options)
    } else if (missingKey) {
      toEntries.splice(i, 0, [fromKey, options.placeholderTransformer(fromValue)])
    }
  }
  return Object.fromEntries(toEntries)
}

/**
 * Patch objectFrom on to objectTo so that all keys of objectFrom exist on objectTo
 *
 * Optionally includes a config to modify how the placeholder is transformed
 */
export function patchObjects(objectFrom: Object, objectTo: Object, options?: PatchOptions) {
  const combinedOpts = Object.assign(defaultOptions, options ?? {})

  const matchesKeys = arrayEqual(Object.keys(objectFrom), Object.keys(objectTo))
  if (!matchesKeys) {
    objectTo = patchEntries(objectFrom, objectTo, combinedOpts)
  }

  return objectTo
}

//
// CLI usage
//

// Prevent foot guns, hopefully
function cleanPath(path: string) {
  return path.trim().replaceAll(/^\./g, '').replaceAll('/', '')
}

// Options you may want to modify for your own instance
const cliOpts = {
  folderPath: 'src/assets/i18n/', // set to work from packages/frontend
  defaultLang: 'en.json'
}

const isScript = require.main === module
if (isScript) main()

function main(): void {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.warn('Not enough arguments given')
    return
  }

  // One argument, patch default language on to given language
  if (args.length === 1) {
    patchFile(cliOpts.defaultLang, cleanPath(args[0]))
  } else if (args.length === 2) {
    // Two arguments, patch first to second
    patchFile(cleanPath(args[0]), cleanPath(args[1]))
  } else {
    console.warn('Command not recognized')
    return
  }

  console.log("Patch complete! Now run 'npm run frontend:translations:format' and continue your translations")
}

function patchFile(sourceFileName: string, patchFileName: string): void {
  const sourceFile = cliOpts.folderPath + sourceFileName
  const patchFile = cliOpts.folderPath + patchFileName
  if (!fs.existsSync(patchFile)) {
    console.log("File to patch did not exist, creating file", patchFile);
    fs.copyFileSync(sourceFile, patchFile)
  }

  console.log('Patching', sourceFile, 'to', patchFile)

  const defaultLang = <Object>require(sourceFile)
  const patchLang = <Object>require(patchFile)

  const patched = patchObjects(defaultLang, patchLang)
  fs.writeFileSync(patchFile, JSON.stringify(patched))
}
