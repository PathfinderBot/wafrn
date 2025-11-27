import { Application, Request, Response } from "express";
import crypto from "crypto";
import fs from "fs";
import axios, { AxiosResponse } from "axios";
import { logger } from "../utils/logger.js";
import optimizeMedia from "../utils/optimizeMedia.js";
import { Resolver } from "did-resolver";
import { getResolver } from "plc-did-resolver";
import { redisCache } from "../utils/redis.js";
import { getLinkPreview } from "link-preview-js";
import { linkPreviewRateLimiter } from "../utils/rateLimiters.js";
import { getMimeType } from "stream-mime-type";
import { completeEnvironment } from "../utils/backendOptions.js";
import { Media } from "../models/media.js";
import { Op } from "sequelize";
import { spawn } from "child_process";
import sequelize from "sequelize/lib/sequelize";
import { return404 } from "../utils/return404.js";
import { User } from "../models/user.js";
import { Emoji } from "../models/emoji.js";

function sendWithCache(res: Response, localFileName: string) {
  // Does the .mime file exist?
  if (fs.existsSync(localFileName + ".mime")) {
    let mime = fs.readFileSync(localFileName + ".mime").toString();
    res.contentType(mime);
  }
  // 1 hour of cache
  res.set("Cache-control", "public, max-age=3600");
  res.set(
    "Content-Disposition",
    `inline; filename="${localFileName.split("/").pop()}"`
  );
  res.sendFile(localFileName, { root: "." });
}

// converting the stream parsing to a promise to be able to use async/await and catch the errors with the try/catch blocks
function writeStream(
  stream: NodeJS.ReadableStream,
  localFileName: string,
  mime: string,
  altText: string
) {
  const writeStream = fs.createWriteStream(localFileName);
  fs.writeFileSync(localFileName + ".mime", mime);
  return new Promise((resolve, reject) => {
    writeStream.on("finish", async () => {
      writeStream.close();
      if (altText != "") {
        try {
          const updateAltText = spawn("exiv2", [
            "-M",
            `set Exif.Photo.UserComment charset=Ascii ${altText
              .replaceAll('"', "")
              .replaceAll("'", "")
              .replaceAll("\\", "")
              .replaceAll("$", "")
              .replaceAll("@", "")}`,
            localFileName,
          ]);
          updateAltText.on("close", () => {
            return resolve(localFileName);
          });
        } catch (error) {
          return resolve(localFileName);
        }
      } else {
        return resolve(localFileName);
      }
    });
    writeStream.on("error", (error) => {
      return reject(error);
    });
    stream.pipe(writeStream);
  });
}

async function getMediaFromUrl(mediaUrl: string, res: Response) {
  logger.trace({
    cachedUrl: mediaUrl,
  });
  const mediaLinkHash = crypto
    .createHash("sha256")
    .update(mediaUrl)
    .digest("hex");
  let localFileName = `cache/${mediaLinkHash}`;
  // if file exists
  if (fs.existsSync(localFileName)) {
    return await sendWithCache(res, localFileName);
  } else {
    try {
      if (mediaUrl.startsWith("?cid=")) {
        try {
          const did = decodeURIComponent(mediaUrl.split("&did=")[1]);
          const cid = decodeURIComponent(
            mediaUrl.split("&did=")[0].split("?cid=")[1]
          );
          if (!did || !cid) {
            return res.sendStatus(400);
          }
          const plcResolver = getResolver();
          const didResolver = new Resolver(plcResolver);
          const didData = await didResolver.resolve(did);
          if (didData?.didDocument?.service) {
            const url =
              didData.didDocument.service[0].serviceEndpoint +
              "/xrpc/com.atproto.sync.getBlob?did=" +
              encodeURIComponent(did) +
              "&cid=" +
              encodeURIComponent(cid);
            mediaUrl = url;
          } else if (did.startsWith("did:web")) {
            // get did doc first
            const docRes = await fetch(
              `https://${did.split("did:web:")[1]}/.well-known/did.json`
            );
            const didDoc = await docRes.json();
            const atProtoServer = didDoc.service.find(
              (x: any) =>
                x.id === "#atproto_pds" ||
                x.type === "AtprotoPersonalDataServer"
            );
            if (!atProtoServer) {
              return res.sendStatus(500);
            }
            const url =
              atProtoServer.serviceEndpoint +
              "/xrpc/com.atproto.sync.getBlob?did=" +
              encodeURIComponent(did) +
              "&cid=" +
              encodeURIComponent(cid);
            mediaUrl = url;
          }
        } catch (error) {
          return res.sendStatus(500);
        }
      }
      const response = await axios.get(mediaUrl, {
        responseType: "stream",
        headers: { "User-Agent": "wafrnCacher" },
      });
      let altText = "";
      /*
      let dbMediaUrl = String(req.query?.media).startsWith(
        completeEnvironment.mediaUrl
      )
        ? String(req.query?.media).split(completeEnvironment.mediaUrl)[1]
        : String(req.query?.media);
      // we are disabling this feature temporarily
      let media = true
        ? undefined
        : await Media.findOne({
            where: sequelize.where(
              sequelize.fn("md5", sequelize.col("url")),
              crypto.createHash("md5").update(dbMediaUrl).digest("hex")
            ),
          });
      if (media) {
        altText = media.description;
      }
      */

      const { stream, mime } = await getMimeType(response.data);
      res.contentType(mime);
      await writeStream(stream, localFileName, mime, altText);
      return await sendWithCache(res, localFileName);
    } catch (error) {
      return res.sendStatus(500);
    }
  }
}

export default function cacheRoutes(app: Application) {
  app.get("/api/cache", async (req: Request, res: Response) => {
    let mediaUrl = String(req.query?.media);
    const mediaLinkHash = crypto
      .createHash("sha256")
      .update(mediaUrl)
      .digest("hex");
    let localFileName = `cache/${mediaLinkHash}`;
    const avatarTransform = String(req.query?.avatar) === "true";

    if (!mediaUrl) {
      res.sendStatus(404);
      return;
    }
    logger.trace({
      message: `Old cache use: ${mediaUrl}`,
    });
    await getMediaFromUrl(mediaUrl, res);
  });

  app.get("/api/v2/cache/media/:id", async (req: Request, res: Response) => {
    let mediaId = req.params.id;
    const media = mediaId ? await Media.findByPk(mediaId) : undefined;
    if (media) {
      await getMediaFromUrl(
        media.external ? media.url : completeEnvironment.mediaUrl + media.url,
        res
      );
    } else {
      res.sendStatus(404);
    }
  });

  app.get("/api/v2/cache/avatar/:id", async (req: Request, res: Response) => {
    try {
      let userId = req.params.id;
      const user = userId ? await User.findByPk(userId) : undefined;
      if (user) {
        const url = user.email
          ? completeEnvironment.mediaUrl + user.avatar
          : user.avatar;
        logger.debug({
          message: `Avatar url: ${url}`,
          mediaUrl: completeEnvironment.mediaUrl,
        });
        await getMediaFromUrl(url, res);
      } else {
        res.sendStatus(404);
      }
    } catch (error) {
      logger.debug({
        message: `Error caching user avatar`,
        error: error,
      });
      res.sendStatus(500);
    }
  });

  app.get("/api/v2/cache/emoji/:id", async (req: Request, res: Response) => {
    let emojiUUID = req.params.id;
    const emoji = emojiUUID
      ? await Emoji.findOne({
          where: {
            uuid: emojiUUID,
          },
        })
      : undefined;
    if (emoji) {
      await getMediaFromUrl(
        emoji.external ? emoji.url : completeEnvironment.mediaUrl + emoji.url,
        res
      );
    } else {
      res.sendStatus(404);
    }
  });

  app.get("/api/v2/cache/youtube/:id", async (req: Request, res: Response) => {
    const youtubeId = decodeURIComponent(req.params.id);
    const ytRegex =
      /((?:https?:\/\/)?(www.|m.)?(youtube(\-nocookie)?\.com|youtu\.be)\/(v\/|watch\?v=|embed\/)?([\S]{11}))([^\S]|\?[\S]*|\&[\S]*|\b)/g;
    const match = youtubeId.matchAll(ytRegex).toArray();
    if (match && match.length >= 7) {
      await getMediaFromUrl(
        `https://img.youtube.com/vi/${match[6]}/hqdefault.jpg`,
        res
      );
    } else {
      res.sendStatus(404);
    }
  });

  app.get("/api/v2/cache/favicon/:id", async (req: Request, res: Response) => {
    try {
      const link = new URL(decodeURIComponent(req.params.id));
      await getMediaFromUrl("https://" + link.hostname + "/favicon.ico", res);
    } catch (error) {
      res.sendStatus(500);
    }
  });

  app.get("/api/v2/cache/imageurl/:id", async (req: Request, res: Response) => {
    try {
      const link = decodeURIComponent(req.params.id);

      const shasum = crypto.createHash("sha1");
      shasum.update(link.toLowerCase());
      const urlHash = shasum.digest("hex");
      // Here is the thing: for this to be asked, the link component has to load first so we can assume cache has been set
      const cacheResult = JSON.parse(
        (await redisCache.get("linkPreviewCache:" + urlHash)) || "{}"
      );
      if (cacheResult && cacheResult.images && cacheResult.images[0]) {
        await getMediaFromUrl(cacheResult.images[0], res);
      } else {
        res.sendStatus(404);
      }
    } catch (error) {
      res.sendStatus(500);
    }
  });

  app.get(
    "/api/linkPreview",
    linkPreviewRateLimiter,
    async (req: Request, res: Response) => {
      const url = String(req.query?.url);
      const shasum = crypto.createHash("sha1");
      shasum.update(url.toLowerCase());
      const urlHash = shasum.digest("hex");
      const cacheResult = await redisCache.get("linkPreviewCache:" + urlHash);
      if (cacheResult) {
        res.send(cacheResult);
      } else {
        let result = {};
        try {
          result = await getLinkPreview(url, {
            followRedirects: "follow",
            headers: { "User-Agent": completeEnvironment.instanceUrl },
          });
        } catch (error) {}
        // we cache the url 24 hours if success, 5 minutes if not
        await redisCache.set(
          "linkPreviewCache:" + urlHash,
          JSON.stringify(result),
          "EX",
          result ? 3600 * 24 : 300
        );
        res.send(result);
      }
    }
  );
}
