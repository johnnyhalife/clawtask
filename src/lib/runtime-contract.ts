/** Conservative B1 contract: audited native OpenClaw 2026.10.5 semantics only.
 * Version is a semantic allowlist, never proof that a particular row has the
 * required fields. Runtime preparation must independently verify all readbacks.
 * Do not infer backend admission CAS from protocol 4 or method names alone.
 */
export function verifyRuntimeContract(hello: any): void {
  const server=hello?.server;
  if (server?.version !== '2026.10.5' ||
      (server.buildId !== undefined && (typeof server.buildId !== 'string' || !server.buildId.trim() || server.buildId.length > 96)) ||
      !Array.isArray(hello.features?.methods) ||
      !['sessions.create','sessions.describe','sessions.patch','agent'].every(method=>hello.features.methods.includes(method))) {
    throw new Error('runtime_contract_unsupported');
  }
}
