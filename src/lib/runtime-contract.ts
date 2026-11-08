/** Conservative B1 contract: audited native OpenClaw semantics only.
 * Qualified releases: the exact baseline 2026.10.5 and any plain YYYY.M.P release
 * at or above 2026.10.8 (audited through 2026.11.1). Skipped releases (.6/.7),
 * prerelease/custom labels and anything below .8 stay unqualified.
 * Version is a semantic gate, never proof that a particular row has the
 * required fields. Runtime preparation must independently verify all readbacks.
 * Do not infer backend admission CAS from protocol 4 or method names alone.
 */
const BASELINE_RELEASE = '2026.10.5';
const MINIMUM_RANGE_RELEASE = [2026, 10, 8];

export function isQualifiedRelease(version: unknown): boolean {
  if (typeof version !== 'string') return false;
  if (version === BASELINE_RELEASE) return true;
  const match = /^(\d{4})\.(\d{1,2})\.(\d{1,3})$/.exec(version);
  if (!match) return false;
  const parts = [Number(match[1]), Number(match[2]), Number(match[3])];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] !== MINIMUM_RANGE_RELEASE[i]) return parts[i] > MINIMUM_RANGE_RELEASE[i];
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
