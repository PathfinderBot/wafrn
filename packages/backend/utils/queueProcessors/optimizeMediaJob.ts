import { Job } from 'bullmq'
import optimizeMedia from '../optimizeMedia.js'

export type OptimizeMediaJobPayload = {
  inputPath: string
}
export type OptimizeMediaJobResult = {
  outputPath: string
}

export async function optimizeMediaJob(job: Job<OptimizeMediaJobPayload>): Promise<OptimizeMediaJobResult> {
  const outputPath = await optimizeMedia(job.data.inputPath)
  return { outputPath }
}
