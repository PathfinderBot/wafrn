export interface statsReply {
  sendPostAwaiting: number;
  prepareSendPostAwaiting: number;
  inboxAwaiting: number;
  updateUserAwaiting: number;
  deletePostAwaiting: number;
  atProtoAwaiting: number;
  createKeyPairWaiting: number;
  sendPostBskyAwaiting: number;
  socketPending: number;
  getRemoteActorWaiting: number;
  mergeUsersAwaiting: number;
}
