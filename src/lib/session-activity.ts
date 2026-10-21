/** Interpret only supported Gateway activity evidence; absence is not idle.
 * A legacy boolean and a supplied status must both be valid and agree.
 * Shared by durable lifecycle control and the independent runtime transport.
 */
export function sessionHasActiveRun(session: any): boolean {
  const booleanPresent = session?.hasActiveRun !== undefined;
  const statusPresent = session?.status !== undefined;
  if (booleanPresent && typeof session.hasActiveRun !== 'boolean') throw new Error('missing_session_or_contract');
  let statusActive: boolean | undefined;
  if (statusPresent) {
    if (['queued','running'].includes(session.status)) statusActive=true;
    else if (['done','failed','interrupted','killed','timeout'].includes(session.status)) statusActive=false;
    else throw new Error('missing_session_or_contract');
  }
  if ((!booleanPresent && !statusPresent) ||
      (booleanPresent && statusPresent && session.hasActiveRun !== statusActive)) throw new Error('missing_session_or_contract');
  return booleanPresent ? session.hasActiveRun : statusActive!;
}
