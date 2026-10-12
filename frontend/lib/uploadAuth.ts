export function assertCanUploadImages(role: string | undefined): void {
  if (role !== "admin" && role !== "lister") {
    throw new Error("Not authorized to upload images");
  }
}
