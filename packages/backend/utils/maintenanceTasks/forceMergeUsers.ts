import { User } from '../../models/index.js'
import { completeEnvironment } from '../backendOptions.js'
import { Queue } from 'bullmq'
import { getQueue } from '../queues.js'

const mergeUsersQueue = getQueue('mergeUsers')

const primaryUser = await User.findOne({
    where: {
        url: process.argv[2]
    }
})

const userToMerge = await User.findOne({
    where: {
        url: process.argv[3]
    }
})

if (primaryUser && userToMerge) {
    await mergeUsersQueue.add("mergeUsers", {
        primaryUserId: primaryUser.id,
        userToMergeId: userToMerge.id
    });
}