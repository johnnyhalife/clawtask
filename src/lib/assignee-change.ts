export type AssigneeType = 'agent' | 'human' | null;

type AssigneePatch = (url: string, body: {
  assigneeId: string | null;
  assigneeType: AssigneeType;
}) => Promise<unknown>;

export type AssigneeChangeResult =
  | { ok: true }
  | { ok: false; error: string };

export async function executeAssigneeChange({
  taskId,
  assigneeId,
  assigneeType,
  patch,
}: {
  taskId: string;
  assigneeId: string | null;
  assigneeType: AssigneeType;
  patch: AssigneePatch;
}): Promise<AssigneeChangeResult> {
  try {
    await patch(`/api/v1/tasks/${taskId}`, { assigneeId, assigneeType });
    return { ok: true };
  } catch (error: unknown) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not update assignee',
    };
  }
}
