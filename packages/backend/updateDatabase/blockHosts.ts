import axios from 'axios'
import { Op } from 'sequelize'
import { FederatedHost, User, sequelize } from '../models/index.js'
import { completeEnvironment } from '../utils/backendOptions.js'
import { redisCache } from '../utils/redis.js'
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

  const currentBlocklistHosts = new Set<string>()

  //hostLines.forEach(async (line, index) => {
  let index = 0
  console.log('initiating marking of problematic hosts')
  for await (const line of hostLines) {
    if (index !== 0) {
      const urlToBlock = line.split(',')[0]
      if (urlToBlock) {
        currentBlocklistHosts.add(urlToBlock)
        const hostToBlock = await FederatedHost.findOne({
          where: {
            displayName: urlToBlock
          }
        })
        if (hostToBlock) {
          if (!hostToBlock.ignoreAutomatedBlocklist) {
            hostToBlock.blocked = true
            hostToBlock.blockedByAutomatedBlocklist = true
            hostToBlock.updatedAt = new Date()
            hostToBlock.detail = 'Blocked by selected blocklist'
            await hostToBlock.save()
            redisCache.set('server:' + urlToBlock, 'true')
          }
        } else {
          const tmp = await FederatedHost.create({
            displayName: urlToBlock,
            blocked: true,
            ignoreAutomatedBlocklist: false,
            blockedByAutomatedBlocklist: true,
            detail: 'Blocked by selected blocklist'
          })
          redisCache.set('server:' + urlToBlock, 'true')
          console.log(tmp.displayName)
        }
      }
    }
    index = index + 1
  }
  console.log('cleanup done')

  // if blocklist is empty: something is wrong
  if (currentBlocklistHosts.size === 0) {
    console.log('current blocklists came back empty, skipping unblock step')
    return
  }

  console.log('unblocking hosts that dropped off the blocklists')
  const hostsToUnblock = await FederatedHost.findAll({
    where: {
      blocked: true,
      blockedByAutomatedBlocklist: true,
      ignoreAutomatedBlocklist: false,
      displayName: {
        [Op.notIn]: Array.from(currentBlocklistHosts)
      }
    }
  })
  for await (const hostToUnblock of hostsToUnblock) {
    hostToUnblock.blocked = false
    hostToUnblock.blockedByAutomatedBlocklist = false
    hostToUnblock.updatedAt = new Date()
    hostToUnblock.detail = 'Automatically unblocked: removed from selected blocklist'
    await hostToUnblock.save()
    redisCache.set('server:' + hostToUnblock.displayName, 'false')
    console.log(`unblocked ${hostToUnblock.displayName}`)
  }

  await redisCache.del('allBlockedServers')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  blockHosts()
    .then(() => {
      console.log('done')
    })
    .catch((error) => {
      console.error(error)
    })
}

export { blockHosts }
