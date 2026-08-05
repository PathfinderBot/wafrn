import axios from 'axios'
import { FederatedHost, User, sequelize } from '../models/index.js'
import { completeEnvironment } from '../utils/backendOptions.js'
//const { csv } = require("csv-parse");

async function blockHosts() {
  // At some point this will get cooler and will offer the user the option to use THEBADSPACE. It doesnt matter if I do have opinions. Users need choices.
  const remoteData = await axios.get('https://seirdy.one/pb/FediNuke.txt')
  const iftasData = await axios.get('https://about.iftas.org/wp-content/uploads/2025/10/iftas-dni-latest.csv')
  console.log('remote data obtained')
  let hostLines: string[] = remoteData.data.split('\n')
  const iftasHosts: string[] = iftasData.data.split('\n')
  iftasHosts.shift()
  hostLines = hostLines.concat(iftasHosts.map((elem) => elem.split(',')[0]))

  //hostLines.forEach(async (line, index) => {
  let index = 0
  console.log('initiating marking of problematic hosts')
  for await (const line of hostLines) {
    if (index !== 0) {
      const urlToBlock = line.split(',')[0]
      const hostToBlock = await FederatedHost.findOne({
        where: {
          displayName: urlToBlock
        }
      })
      if (hostToBlock) {
        hostToBlock.blocked = true
        hostToBlock.updatedAt = new Date()
        hostToBlock.detail = 'Blocked by selected blocklist'
        await hostToBlock.save()
      } else {
        const tmp = await FederatedHost.create({
          displayName: urlToBlock,
          blocked: true,
          detail: 'Blocked by selected blocklist'
        })
        console.log(tmp.displayName)
      }
    }
    index = index + 1
  }
  console.log('cleanup done')
}

blockHosts()
  .then(() => {
    console.log('done')
  })
  .catch((error) => {
    console.error(error)
  })
