function extractUriComponents(uri: string): {did: string, collection: string, rKey: string} {
    const did = uri.replace('at://', '').split('/')[0]
    const collection = uri.replace('at://', '').split('/')[1]
    const rKey = uri.replace('at://', '').split('/')[2];
    return {
        did, collection, rKey
    }
}

export {extractUriComponents}