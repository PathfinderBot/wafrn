import { logger } from "./logger.js";

export function isAdult(date?: string | Date): boolean {
  logger.debug(date);
  if (!date) {
    return false;
  }

  const birthDate = new Date(date);
  const minimumBirthDate = new Date();
  minimumBirthDate.setFullYear(minimumBirthDate.getFullYear() - 18);
  if (!birthDate) {
    return false;
  }
  return minimumBirthDate.getTime() > birthDate.getTime();
}
