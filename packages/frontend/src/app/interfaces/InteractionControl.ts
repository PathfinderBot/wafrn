export const InteractionControl = {
  Anyone: 0,
  Followers: 1,
  Following: 2,
  FollowersAndFollowing: 3,
  FollowersAndMentioned: 4,
  FollowingAndMentioned: 5,
  FollowersFollowersAndMentioned: 6,
  MentionedUsersOnly: 7,
  NoOne: 8,
  SameAsOp: 100, // this one is bsky exclusive and its gona be FUN (a headache). This only applies to REPLIES. Nothing else.
};


export type InteractionControlType =
  typeof InteractionControl[keyof typeof InteractionControl];