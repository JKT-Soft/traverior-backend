import type { IncomingMessage } from "node:http";
import { UnauthorizedError } from "../../../shared/http/errors.js";
import type { AuthProvider, AuthUser } from "../domain/ports.js";

type FirebaseAdminLike = {
  apps: unknown[];
  initializeApp: (options: { projectId?: string }) => void;
  auth: () => { verifyIdToken: (token: string) => Promise<{ uid: string; email?: string }> };
};

async function defaultLoadAdmin(): Promise<FirebaseAdminLike> {
  const mod = await import("firebase-admin");
  // firebase-admin publishes a CJS default export under NodeNext interop
  return (mod as { default: FirebaseAdminLike }).default;
}

export class FirebaseAuthProvider implements AuthProvider {
  readonly name = "firebase";

  constructor(
    private readonly projectId?: string,
    private readonly loadAdmin: () => Promise<FirebaseAdminLike> = defaultLoadAdmin,
  ) {}

  async resolve(req: IncomingMessage): Promise<AuthUser | undefined> {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return undefined;
    const token = header.slice("Bearer ".length).trim();

    const admin = await this.loadAdmin();
    if (!admin.apps.length) {
      admin.initializeApp({
        projectId: this.projectId,
      });
    }

    try {
      const decoded = await admin.auth().verifyIdToken(token);
      return { uid: decoded.uid, email: decoded.email };
    } catch {
      throw new UnauthorizedError("Invalid Firebase ID token");
    }
  }
}
