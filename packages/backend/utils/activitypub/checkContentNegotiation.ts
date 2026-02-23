import { Response, NextFunction } from "express";
import { SignedRequest } from "../../interfaces/fediverse/signedRequest.js";

const defaultAllowedContentTypes = [
  '*/*',
  'text/html',
];

function getCheckContentNegotiation(allowedContentTypes: string[] = ...defaultAllowedContentTypes) {

  return async function checkContentNegotiation(
    req: SignedRequest,
    res: Response,
    next: NextFunction,
  ) {
    if (req.fediData
        && req.fediData?.valid
        && req.headers.accept
        && !allowedContentTypes.some(type => req.headers.accept?.includes(type))) {
      // Respond with a 401 if the request did not include an Accept header for a HTML response.
      res.sendStatus(401);
    }

    next();
  }
}

export { getCheckContentNegotiation };
