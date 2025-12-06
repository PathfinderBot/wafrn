import { Op } from 'sequelize'
import { User } from '../../models/index.js'
import { Follows } from '../../models/follows.js'
import { v4 as uuidv4 } from 'uuid'
import { appendFileSync, createWriteStream, writeFileSync } from 'fs'
import { completeEnvironment } from '../backendOptions.js'

const localUser = await User.findOne({
    where: {
        url: process.argv[2],
        email: {
            [Op.ne]: null
        }
    }
})

if (localUser) {
    console.log(`processing follow export`)
    const localUserFollows = await Follows.findAll({
        where: {
            followerId: localUser.id
        },
        include: [{ all: true }]
    })

    const fileName = `follows-${localUser.url}-${Date.now()}-${uuidv4()}.csv`

    writeFileSync('uploads/' + fileName, `Account address,Show boosts,Notify on new posts,Languages\n`)

    localUserFollows.forEach(e => {
        let url = e.followed.url
        if (!url.startsWith('@')) {
            const host = new URL(completeEnvironment.frontendUrl).hostname
            url = host + '@' + url
        }
        url = url.replace(/^@/, '')
        appendFileSync('uploads/' + fileName, `${url},true,false,\n`)
    })

    console.log(`Exported to: ${completeEnvironment.mediaUrl}/${fileName}`)
} else {
    console.log(`can't find ${process.argv[2]}`)
}
