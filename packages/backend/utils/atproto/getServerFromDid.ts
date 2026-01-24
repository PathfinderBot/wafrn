import { Resolver } from "did-resolver";
import { getResolver } from "plc-did-resolver";
import { redisCache } from "../redis.js";

async function getServerFromDid(did: string): Promise<string> {
    const cacheRes = await redisCache.get('didServer:' + did)
    if(cacheRes) {
        return cacheRes
    }
    let res = ''
    if(did.startsWith('did:web')){
        const docRes = await fetch(
          `https://${did.split("did:web:")[1]}/.well-known/did.json`
        );
        const didDoc = await docRes.json();
        const atProtoServer = didDoc.service.find(
            (x: any) =>
              x.id === "#atproto_pds" ||
              x.type === "AtprotoPersonalDataServer"
          );
        res = atProtoServer.serviceEndpoint
    } else {
        const plcResolver = getResolver();
        const didResolver = new Resolver(plcResolver);
        const didData = await didResolver.resolve(did);
        if (didData?.didDocument?.service) {
            res = didData.didDocument.service[0].serviceEndpoint as string
        }
    }
    if(res) {
        redisCache.set('didServer:' + did, res, 'EX', 300)
    }
    return res;
}

export { getServerFromDid }