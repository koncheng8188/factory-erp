import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);
const saltBytes = 16;
const keyLength = 64;
const hashPrefix = "scrypt:v1";

export function validatePassword(password: string) {
  return password.length >= 8;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(saltBytes);
  const derivedKey = (await scryptAsync(password, salt, keyLength)) as Buffer;
  return `${hashPrefix}:${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  try {
    const [algorithm, version, saltHex, hashHex] = storedHash.split(":");
    if (`${algorithm}:${version}` !== hashPrefix || !saltHex || !hashHex) return false;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    if (salt.length !== saltBytes || expected.length !== keyLength) return false;
    const derivedKey = (await scryptAsync(password, salt, keyLength)) as Buffer;
    return timingSafeEqual(derivedKey, expected);
  } catch {
    return false;
  }
}
