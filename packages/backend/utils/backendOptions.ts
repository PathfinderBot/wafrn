/*
 * We expand the env
 */

import { baseEnvironment } from '../environment.js'
import { Environment } from '../interfaces/environment.js'

export const completeEnvironment = {
  ...baseEnvironment,
  bskyPdsUrl: baseEnvironment.bskyPdsUrl ? baseEnvironment.bskyPdsUrl : baseEnvironment.bskyPds,
  frontendEnvironment: {
    ...baseEnvironment.frontendEnvironment,
    frontUrl: baseEnvironment.frontendUrl,
    instanceName: baseEnvironment.instanceUrl,
    enableBsky: baseEnvironment.enableBsky,
    registrationLevel: baseEnvironment.registrationLevel,
    bskyPDSUrl: baseEnvironment.bskyPdsUrl ? baseEnvironment.bskyPdsUrl : baseEnvironment.bskyPds
    // the 'satisfies' keyword is used to tell typescript that this object is fits with type Environment but can extend it
    // for example, to make the 'bskyPdsUrl' property not optional
  } satisfies Environment
}
