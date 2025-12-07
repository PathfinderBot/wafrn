import { logger } from "./logger.js";

export function isAdult(date?: string | Date): boolean {
  if (!date) {
    return false;
  }

  const birthDate = new Date(date);
  const minimumBirthDate = new Date();
  minimumBirthDate.setFullYear(minimumBirthDate.getFullYear() - 18);

  if (!birthDate) {
    return false;
  }
  logger.info({ birthDate, minimumBirthDate }, "birth date")
  const res = minimumBirthDate.getTime() > birthDate.getTime();
  return !res;
}
