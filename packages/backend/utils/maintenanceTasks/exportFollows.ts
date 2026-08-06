import { Op } from 'sequelize'
import { User } from '../../models/index.js'
import { Follows } from '../../models/follows.js'
import { v4 as uuidv4 } from 'uuid'
import { appendFileSync, writeFileSync } from 'fs'
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
    })

    const followedUsers = await User.scope('full').findAll({
        where: {
            id: {
                [Op.in]: localUserFollows.map(elem => elem.followedId)
            },
            [Op.or]: [
                {
                    email: {
                        [Op.ne]: null
                    }
                }, {
                    remoteId: {
                        [Op.ne]: null,
                        [Op.notILike]: 'https://bsky.brid.gy%'
                    }
                }
            ]
        }
    })

    const fileName = `follows-${localUser.url}-${Date.now()}-${uuidv4()}.csv`

    writeFileSync('uploads/' + fileName, `Account address,Show boosts,Notify on new posts,Languages\n`)

    followedUsers.forEach(e => {
        let url = e.url
        if (!url.startsWith('@')) {
            const host = new URL(completeEnvironment.frontendUrl).hostname
            url = url + '@' + host
        }
        url = url.replace(/^@/, '')
        appendFileSync('uploads/' + fileName, `${url},true,false,\n`)
    })

    console.log(`Exported to: ${completeEnvironment.mediaUrl}/${fileName}`)
} else {
    console.log(`can't find ${process.argv[2]}`)
}
