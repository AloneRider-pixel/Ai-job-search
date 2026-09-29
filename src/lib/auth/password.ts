import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH, { N: 16_384, r: 8, p: 1 }).toString("hex");
  return ["scrypt", "16384", "8", "1", salt, hash].join("$");
}

export function verifyPassword(password: string, encoded: string) {
  const [algorithm, nText, rText, pText, salt, expected] = encoded.split("$");
  if (algorithm !== "scrypt" || !nText || !rText || !pText || !salt || !expected) return false;

  const actual = scryptSync(
    password,
    salt,
    KEY_LENGTH,
    { N: Number(nText), r: Number(rText), p: Number(pText) },
  );
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === actual.length && timingSafeEqual(expectedBuffer, actual);
}
