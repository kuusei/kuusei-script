const CS2_LISTING = /^\/market\/listings\/730\/[^/]+/;

export function isCs2Listing(path: string) {
  return CS2_LISTING.test(path);
}

export function listingAppId(path: string) {
  return Number(path.match(/\/market\/listings\/(\d+)\//)?.[1]);
}
