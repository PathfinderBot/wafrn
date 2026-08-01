import fs from 'fs'
import path from 'path'
import child_process from 'child_process'
import packageJson from '../../../package.json'

function execSyncSafe(command: string) {
  let out = null
  try {
    out = child_process.execSync(command).toString().trim()
  } catch (error) {
    console.error(error)
  }
  return out
}

const isScript = require.main === module
if (isScript) main()

function main(): void {
  // Load build data (git and stuff)
  const buildData = {
    version: packageJson.version,
    git: {
      branch: execSyncSafe('git rev-parse --abbrev-ref HEAD'),
      hash: execSyncSafe('git rev-parse --short=7 HEAD'),
      fullHash: execSyncSafe('git rev-parse HEAD')
    },
    timestamp: new Date().getTime()
  }

  const filePath = path.resolve('src', 'buildData.json')
  const fileContents = JSON.stringify(buildData)

  fs.writeFileSync(filePath, fileContents)
}
