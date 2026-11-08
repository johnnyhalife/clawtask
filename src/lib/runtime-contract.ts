/** Conservative B1 contract: audited native OpenClaw semantics only.
 * Qualified releases: any plain YYYY.M.P release at or above 2026.10.5, the
 * minimum semantic baseline (audited at .5, .8 and 2026.11.1). Releases below .5
 * and prerelease/custom labels stay unqualified.
 * Version is a semantic gate, never proof that a particular row has the
 * required fields. Runtime preparation must independently verify all readbacks.
 * Do not infer backend admission CAS from protocol 4 or method names alone.
 */
const MINIMUM_RELEASE = [2026, 10, 5];

export function isQualifiedRelease(version: unknown): boolean {
  if (typeof version !== 'string') return false;
  const match = /^(\d{4})\.(\d{1,2})\.(\d{1,3})$/.exec(version);
  if (!match) return false;
  const parts = [Number(match[1]), Number(match[2]), Number(match[3])];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] !== MINIMUM_RELEASE[i]) return parts[i] > MINIMUM_RELEASE[i];
  }
  return true;
}

export function verifyRuntimeContract(hello: any): void {
  const server=hello?.server;
  // See the source audits and rollout/legacy gates in docs/runtime-gateway-rollout.md.
  if (!isQualifiedRelease(server?.version) ||
      (server.buildId !== undefined && (typeof server.buildId !== 'string' || !server.buildId.trim() || server.buildId.length > 96)) ||
      !Array.isArray(hello.features?.methods) ||
      !['sessions.create','sessions.describe','sessions.patch','agent'].every(method=>hello.features.methods.includes(method))) {
    throw new Error('runtime_contract_unsupported');
  }
}
