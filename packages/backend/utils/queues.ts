import { Queue, FlowProducer } from "bullmq"
import { completeEnvironment } from "./backendOptions.js"

const queues = new Map<string, Queue>()
let flowProducer: FlowProducer | null = null

export const QUEUE_CONFIGS: any = {
  "getRemoteActorId": {
    removeOnComplete: { count: 100, age: 3600 },
    removeOnFail: { count: 1000, age: 24 * 3600 },
    attempts: 2,
    "backoff": {
      "type": "exponential",
      "delay": 1000
    }
  },
  "sendPostToInboxes": {
    removeOnComplete: { count: 100, age: 3600 },
    attempts: 15,
    "backoff": {
      "type": "exponential",
      "delay": 60000
    },
    removeOnFail: { count: 1000, age: 24 * 3600 },
  },
  "prepareSendPost": {
    removeOnComplete: { count: 100, age: 3600 },
    attempts: 3,
    "backoff": {
      "type": "exponential",
      "delay": 1000
    },
    removeOnFail: { count: 1000, age: 24 * 3600 },
  },
  "sendPostBsky": {
    removeOnComplete: { count: 100, age: 3600 },
    attempts: 3,
    "backoff": {
      "type": "fixed",
      "delay": 5000
    },
    removeOnFail: { count: 1000, age: 24 * 3600 },
  },
  "processRemoteMediaData": {
    removeOnComplete: { count: 100, age: 3600 },
    attempts: 3,
    "backoff": {
      "type": "exponential",
      "delay": 1000
    },
    removeOnFail: { count: 1000, age: 24 * 3600 },
  },
  "inbox": {
    removeOnComplete: { count: 100, age: 3600 },
    attempts: 15,
    "backoff": {
      "type": "exponential",
      "delay": 60000
    },
    removeOnFail: { count: 1000, age: 24 * 3600 },
  },
  "deletePostQueue": {
    removeOnComplete: { count: 100, age: 3600 },
    attempts: 15,
    "backoff": {
      "type": "exponential",
      "delay": 60000
    },
    removeOnFail: { count: 1000, age: 24 * 3600 },
  },
  "generateUserKeyPair": {
    removeOnComplete: { count: 100, age: 3600 },
    attempts: 3,
    "backoff": {
      "type": "exponential",
      "delay": 1000
    },
    removeOnFail: { count: 1000, age: 24 * 3600 },
  },
  "forceUpdateDids": {
    removeOnComplete: { count: 100, age: 3600 },
    attempts: 3,
    "backoff": {
      "type": "exponential",
      "delay": 1000
    }
  },
  "firehoseQueue": {
    removeOnComplete: { count: 100, age: 3600 },
    attempts: 3,
    "backoff": {
      "type": "exponential",
      "delay": 60000
    },
    removeOnFail: { count: 1000, age: 24 * 3600 },
  },
  "lowPriorityFirehoseQueue": {
    removeOnComplete: { count: 100, age: 3600 },
    attempts: 3,
    "backoff": {
      "type": "exponential",
      "delay": 60000
    },
    removeOnFail: { count: 1000, age: 24 * 3600 },
  },
  "mergeUsers": {
    removeOnComplete: { count: 100, age: 3600 },
    attempts: 6,
    "backoff": {
      "type": "exponential",
      "delay": 25000
    },
    "removeOnFail": false
  },
  "mergePosts": {
    removeOnComplete: { count: 100, age: 3600 },
    attempts: 6,
    "backoff": {
      "type": "exponential",
      "delay": 25000
    },
    "removeOnFail": false
  },
  "processSinglePost": {
    removeOnComplete: { count: 100, age: 3600 },
    attempts: 6,
    "backoff": {
      "type": "exponential",
      "delay": 2500
    },
    "removeOnFail": false
  },
  "processRemoteView": {
    removeOnComplete: { count: 100, age: 3600 },
    attempts: 3,
    "backoff": {
      "type": "exponential",
      "delay": 25000
    },
    removeOnFail: { count: 1000, age: 24 * 3600 },
  },
  "processFediPostQueue": {
    removeOnComplete: { count: 100, age: 3600 },
    attempts: 6,
    "backoff": {
      "type": "exponential",
      "delay": 2500
    },
    "removeOnFail": false
  },
  "doFollow": {
    removeOnComplete: { count: 100, age: 3600 },
    attempts: 3,
    "backoff": {
      "type": "exponential",
      "delay": 1000
    },
    removeOnFail: { count: 1000, age: 24 * 3600 },
  },
  "checkPushNotificationDelivery": {
    removeOnComplete: { count: 100, age: 3600 },
    attempts: 3,
    "backoff": {
      "type": "exponential",
      "delay": 1000
    }
  },
  "updateNotificationsSocket": {
    removeOnComplete: { count: 100, age: 3600 },
    attempts: 3,
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

export function getFlowProducer(): FlowProducer {
  if (!flowProducer) {
    flowProducer = new FlowProducer({
      connection: completeEnvironment.bullmqConnection
    })
  }
  return flowProducer
}