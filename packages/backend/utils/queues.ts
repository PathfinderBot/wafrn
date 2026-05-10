import { Queue } from "bullmq"
import { completeEnvironment } from "./backendOptions.js"

const queues = new Map<string, Queue>()

export const QUEUE_CONFIGS: any = {
  "getRemoteActorId": {
    "removeOnComplete": true,
    "removeOnFail": true,
    "attempts": 2,
    "backoff": {
      "type": "exponential",
      "delay": 1000
    }
  },
  "sendPostToInboxes": {
    "removeOnComplete": true,
    "attempts": 3,
    "backoff": {
      "type": "exponential",
      "delay": 1000
    },
    "removeOnFail": true
  },
  "prepareSendPost": {
    "removeOnComplete": true,
    "attempts": 3,
    "backoff": {
      "type": "exponential",
      "delay": 1000
    },
    "removeOnFail": true
  },
  "sendPostBsky": {
    "removeOnComplete": true,
    "attempts": 3,
    "backoff": {
      "type": "fixed",
      "delay": 5000
    },
    "removeOnFail": true
  },
  "processRemoteMediaData": {
    "removeOnComplete": true,
    "attempts": 3,
    "backoff": {
      "type": "exponential",
      "delay": 1000
    },
    "removeOnFail": true
  },
  "inbox": {
    "removeOnComplete": true,
    "attempts": 3,
    "backoff": {
      "type": "exponential",
      "delay": 1000
    },
    "removeOnFail": true
  },
  "deletePostQueue": {
    "removeOnComplete": true,
    "attempts": 3,
    "backoff": {
      "type": "exponential",
      "delay": 1000
    },
    "removeOnFail": true
  },
  "generateUserKeyPair": {
    "removeOnComplete": true,
    "attempts": 3,
    "backoff": {
      "type": "exponential",
      "delay": 1000
    },
    "removeOnFail": true
  },
  "forceUpdateDids": {
    "removeOnComplete": true,
    "attempts": 3,
    "backoff": {
      "type": "exponential",
      "delay": 1000
    }
  },
  "firehoseQueue": {
    "removeOnComplete": true,
    "attempts": 2,
    "removeOnFail": true
  },
  "lowPriorityFirehoseQueue": {
    "removeOnComplete": true,
    "attempts": 2,
    "removeOnFail": true
  },
  "mergeUsers": {
    "removeOnComplete": true,
    "attempts": 6,
    "backoff": {
      "type": "exponential",
      "delay": 25000
    },
    "removeOnFail": false
  },
  "mergePosts": {
    "removeOnComplete": true,
    "attempts": 6,
    "backoff": {
      "type": "exponential",
      "delay": 25000
    },
    "removeOnFail": false
  },
  "processSinglePost": {
    "removeOnComplete": true,
    "attempts": 6,
    "backoff": {
      "type": "exponential",
      "delay": 2500
    },
    "removeOnFail": false
  },
  "processRemoteView": {
    "removeOnComplete": true,
    "attempts": 3,
    "backoff": {
      "type": "exponential",
      "delay": 25000
    },
    "removeOnFail": true
  },
  "processFediPostQueue": {
    "removeOnComplete": true,
    "attempts": 6,
    "backoff": {
      "type": "exponential",
      "delay": 2500
    },
    "removeOnFail": false
  },
  "doFollow": {
    "removeOnComplete": true,
    "attempts": 3,
    "backoff": {
      "type": "exponential",
      "delay": 1000
    },
    "removeOnFail": true
  },
  "checkPushNotificationDelivery": {
    "removeOnComplete": true,
    "attempts": 3,
    "backoff": {
      "type": "exponential",
      "delay": 1000
    }
  },
  "updateNotificationsSocket": {
    "removeOnComplete": true,
    "attempts": 3,
    "backoff": {
      "type": "exponential",
      "delay": 1000
    }
  }
}


export function getQueue<T = any>(name: string): Queue<T> {
  if (!queues.has(name)) {
    queues.set(name, new Queue(name, {
      connection: completeEnvironment.bullmqConnection,
      defaultJobOptions: QUEUE_CONFIGS[name] || {
        removeOnComplete: true,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000
        },
        removeOnFail: true
      }
    }))
  }
  return queues.get(name) as Queue<T>
}