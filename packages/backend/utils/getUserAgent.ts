import fs from 'fs'
import { completeEnvironment } from '../utils/backendOptions.js'

const packageJsonFile = JSON.parse(fs.readFileSync('package.json').toString())

// subcomponent should be ComponentName/Version
export default function getUserAgent(subcomponent: string = "") {
  return `Wafrn/${packageJsonFile.version} (${completeEnvironment.frontendUrl}; +${completeEnvironment.adminEmail})${subcomponent? ' ' + subcomponent + '/' + packageJsonFile.version : ''}`
}