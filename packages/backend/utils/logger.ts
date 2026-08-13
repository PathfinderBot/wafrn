import { pino } from 'pino'
import { completeEnvironment } from './backendOptions.js'

const transport = pino.transport(completeEnvironment.pinoTransportOptions)

export const logger = pino(
  {
    level: completeEnvironment.logLevel,
    timestamp: pino.stdTimeFunctions.isoTime
  },
  transport
)

// Axios errors can be a bit special
export function summarizeAxiosEror(error: unknown) {
  if (error && typeof error === 'object' && (error as any).isAxiosError) {
    const err = error as any
    return {
      message: err.message,
      code: err.code,
      url: err.config?.url,
      status: err.response?.status,
      statusText: err.response?.statusText,
      responseSize: describeDataSize(err.response?.data)
    }
  }
  return error
}

function describeDataSize(data: unknown): string | undefined {
  if (data === undefined || data === null) return undefined
  if (Buffer.isBuffer(data)) return `${data.length} bytes`
  if (typeof data === 'string') return `${Buffer.byteLength(data)} bytes`
  if (typeof (data as any).pipe === 'function') return 'stream'
  return undefined
}
