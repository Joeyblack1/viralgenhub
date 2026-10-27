// Account deletion (#393, privacy policy section 9): the name, email,
// password and channel tokens go at once; the content of the workspaces the
// account owned (posts, media, comments, channels) is hard-deleted by the
// daily account purge once this many days have passed.
export const ACCOUNT_PURGE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export const accountPurgeDate = (deletedAt: Date) =>
  new Date(deletedAt.getTime() + ACCOUNT_PURGE_DAYS * DAY_MS);
