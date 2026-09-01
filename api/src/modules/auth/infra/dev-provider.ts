import type { IncomingMessage } from "node:http";
import type { AuthProvider, AuthUser } from "../domain/ports.js";

/**
 * Local auth: Authorization: Bearer dev:<firebaseUid>
 * Also accepts bare token as uid for quick demos.
 */
export class DevAuthProvider implements AuthProvider {
  readonly name = "dev";

  async resolve(req: IncomingMessage): Promise<AuthUser | undefined> {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return undefined;
    const token = header.slice("Bearer ".length).trim();
    if (token.startsWith("dev:")) {
      const uid = token.slice(4);
      return { uid, email: `${uid}@dev.local` };
    }
    return { uid: token, email: `${token}@dev.local` };
  }
}
