export type AuthPolicy =
  "anonymous_allowed" | "token_optional" | "token_required";

export interface TokenProvider {
  resolve(policy: AuthPolicy): Promise<string | undefined>;
}
