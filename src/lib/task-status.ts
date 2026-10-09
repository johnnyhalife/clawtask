export const VALID_STATUSES = ['backlog','todo','in_progress','blocked','done','archived'];

/** Mutate a PATCH body before its SQL update, including simultaneous assignment. */
export function applyStatusRules(body: any, currentStatus: string) {
  if ('status' in body && !VALID_STATUSES.includes(body.status)) return false;
  if ((body.status ?? currentStatus)==='blocked') {
    body.assigneeId=null;
    body.assigneeType=null;
  }
  return true;
}

export async function notifyTaskState(task: any) {
  const { getAdapterService } = await import('./adapter');
  // Synchronous part records cleanup before returning; background failures stay durable.
  getAdapterService().notifyTaskState(task).catch(() => {
    console.error('[adapter] task state recovery required',{taskId:task.id});
  });
}
