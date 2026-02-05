import fs from 'fs'
import { completeEnvironment } from '../utils/backendOptions.js'

const packageJsonFile = JSON.parse(fs.readFileSync('package.json').toString())

export default function getUserAgent(subcomponent: string = "") {
  return `Wafrn/${packageJsonFile.version} (${completeEnvironment.frontendUrl}; +${completeEnvironment.adminEmail})${subcomponent? ' ' + subcomponent + '/' + packageJsonFile.version : ''}`
}