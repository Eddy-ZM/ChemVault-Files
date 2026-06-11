import { sanitizeVisibleName } from "./validation";

interface BuildR2KeyInput {
  projectSlug: string;
  fileId: string;
  originalName: string;
  now?: Date;
}

export function buildR2Key(input: BuildR2KeyInput): string {
  const now = input.now ?? new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return [
    "files",
    input.projectSlug,
    year,
    month,
    input.fileId,
    sanitizeVisibleName(input.originalName),
  ].join("/");
}
