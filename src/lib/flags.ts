// Future features. All off for the MVP (prompt section 1).
export const flags = {
  virtualTryOn: false,
  threeD: false,
  fullBodyPhotos: false,
  socialFeed: false,
  shoppingLinks: false,
  serverPush: false,
  sync: false,
} as const;

export type Flag = keyof typeof flags;
