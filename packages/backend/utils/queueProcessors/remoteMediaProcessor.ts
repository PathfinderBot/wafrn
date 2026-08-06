import crypto from "node:crypto";
import fs from "fs";
import axios from "axios";
import type { Job } from "bullmq";
import mime from "mime";
import { Media } from "../../models/index.js";
import { completeEnvironment } from "../backendOptions.js";
import { fileTypeFromFile } from "file-type";
import sharp from "sharp";
import { Model } from "sequelize";
import { redisCache } from "../redis.js";
import { getMediaFromUrl } from "../../routes/remoteCache.js";

async function processRemoteMedia(job: Job) {
  try {
    const media = await Media.findByPk(job.data.mediaId);
    if (!media) return;
    const mediaUrl = media.external
      ? media.url
      : completeEnvironment.mediaUrl + media.url;
    let fileLocation = "";
    await getMediaFromUrl(mediaUrl, undefined, false, { priority: 2097151, parentData: { id: job.id as string, queue: 'processRemoteMediaData' } });
    // get the local file name from redis using the hash of the media url
    const mediaLinkHash = crypto
      .createHash("sha256")
      .update(mediaUrl)
      .digest("hex");
    const localFilename = `cache/${mediaLinkHash}`;
    fileLocation = localFilename;

    if (fs.existsSync(fileLocation)) {
      const fileType = await fileTypeFromFile(fileLocation);
      if (fileType?.mime) {
        media.mediaType = fileType?.mime;
        if (fileType.mime.startsWith("image")) {
          const metadata = await sharp(fileLocation).metadata();
          media.height = metadata.height || 0;
          media.width = metadata.width || 0;
          media.updatedAt = new Date();
        }
        await media.save();
      }
    }
  } catch (error) { }
}

export { processRemoteMedia };
