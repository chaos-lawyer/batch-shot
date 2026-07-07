export function createScheduleState() {
  return {
    scheduledTasks: [],
    selectedTaskId: '',
    isScheduleEnabled: false,
    pendingUpdateTaskId: '',
    scheduleNameTouched: false,

    selectedTask() {
      return this.scheduledTasks.find((task) => task.id === this.selectedTaskId) || null;
    }
  };
}
