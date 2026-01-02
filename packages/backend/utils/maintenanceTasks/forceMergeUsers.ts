import { User } from '../../models/index.js'
import { completeEnvironment } from '../backendOptions.js'
import { Queue } from 'bullmq'

const mergeUsersQueue = new Queue("mergeUsers", {
    connection: completeEnvironment.bullmqConnection,
    defaultJobOptions: {
        removeOnComplete: true,
        attempts: 6,
        backoff: {
            type: "exponential",
            delay: 25000,
        },
        removeOnFail: false,
    },
});

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