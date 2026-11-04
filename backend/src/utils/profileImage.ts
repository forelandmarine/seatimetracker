/**
 * user.image is writable through better-auth's own update-user route, so it can
 * hold any text. Only sign or delete storage keys under the user's own folder;
 * a full http(s) URL (social sign-in avatar) is passed through by storage as-is.
 */
export function isOwnProfileImage(userId: string, image: string): boolean {
  return /^https?:\/\//i.test(image) || image.startsWith(`profile-images/${userId}/`);
}

/** Only keys we uploaded for this user may be deleted (never a URL or another user's key). */
export function isDeletableProfileImage(userId: string, image: string): boolean {
  return image.startsWith(`profile-images/${userId}/`);
}
