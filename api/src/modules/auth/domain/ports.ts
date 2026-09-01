import type { IncomingMessage } from "node:http";

export type AuthUser = {
  uid: string;
  email?: string;
};

/** Port — swap Firebase / Clerk / custom without touching routes */
export interface AuthProvider {
  readonly name: string;
  resolve(req: IncomingMessage): Promise<AuthUser | undefined>;
}
