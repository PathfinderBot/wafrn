import { Request } from "express";

export default function getStartScrollParam(req: Request) {
  // read the date in ms from the url search params. if page = -1 date is NOW. yes this is ugly
  let page = Number(req.query.page);
  const dateMS = Number(req.query.startScroll);
  return new Date(dateMS || Date.now());
}
