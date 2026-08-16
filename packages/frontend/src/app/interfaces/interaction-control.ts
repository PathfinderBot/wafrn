export const InteractionControl = {
  Anyone: 0,
  Followers: 1,
  Following: 2,
  FollowersAndFollowing: 3,
  FollowersAndMentioned: 4,
  FollowingAndMentioned: 5,
  FollowersFollowingAndMentioned: 6,
  MentionedUsersOnly: 7,
  NoOne: 8,
  // manual-approval counterparts
  AnyoneManualApproval: 9,
  FollowersManualApproval: 10,
  FollowingManualApproval: 11,
  FollowersAndFollowingManualApproval: 12,
  FollowersAndMentionedManualApproval: 13,
  FollowingAndMentionedManualApproval: 14,
  FollowersFollowingAndMentionedManualApproval: 15,
  MentionedUsersOnlyManualApproval: 16,
  SameAsOp: 100 // this one is bsky exclusive and its gona be FUN (a headache). This only applies to REPLIES. Nothing else.
}

export type InteractionControlType = (typeof InteractionControl)[keyof typeof InteractionControl]

const manualApprovalControls = new Set<InteractionControlType>([
  InteractionControl.AnyoneManualApproval,
  InteractionControl.FollowersManualApproval,
  InteractionControl.FollowingManualApproval,
  InteractionControl.FollowersAndFollowingManualApproval,
  InteractionControl.FollowersAndMentionedManualApproval,
  InteractionControl.FollowingAndMentionedManualApproval,
  InteractionControl.FollowersFollowingAndMentionedManualApproval,
  InteractionControl.MentionedUsersOnlyManualApproval
])

export function requiresManualApproval(control: InteractionControlType | undefined | null): boolean {
  return control != null && manualApprovalControls.has(control)
}
