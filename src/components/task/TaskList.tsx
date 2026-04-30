'use client';

import { useCallback, useState } from 'react';
import { Task } from '@/types';
import { TaskRow } from './TaskRow';
import { TaskDrawer } from './TaskDrawer';

interface TaskListProps {
  tasks: Task[];
  emptyMessage?: string;
  onTaskUpdated?: () => void;
}

export function TaskList({ tasks, emptyMessage = 'No tasks found.', onTaskUpdated }: TaskListProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    setSelectedTaskId(null);
    onTaskUpdated?.();
  }, [onTaskUpdated]);

  return (
    <>
      <div className="overflow-x-auto">
        {tasks.length === 0 ? (
          <div className="py-16 text-center text-zinc-600 text-sm">{emptyMessage}</div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="py-2 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider w-24">ID</th>
                <th className="py-2 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Title</th>
                <th className="py-2 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider w-24">Priority</th>
                <th className="py-2 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider w-32">Status</th>
                <th className="py-2 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider w-36">Assignee</th>
                <th className="py-2 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider w-32">Project</th>
                <th className="py-2 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider w-40">Tags</th>
                <th className="py-2 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider w-24">Updated</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onClick={() => setSelectedTaskId(task.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedTaskId && (
        <TaskDrawer
          taskId={selectedTaskId}
          onClose={handleClose}
        />
      )}
    </>
  );
}
