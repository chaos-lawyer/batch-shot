export function createReportRow({ index, url, title = '', filename = '', status, error = '', ...extra }) {
  return {
    index: index + 1,
    url,
    title,
    filename,
    status,
    error,
    ...extra
  };
}

export async function runCaptureJobs(jobs, options, controls) {
  const rows = [];

  for (let index = 0; index < jobs.length; index += 1) {
    if (controls.shouldStop()) {
      break;
    }

    await controls.waitWhilePaused();
    const row = await controls.captureSingleJob(jobs[index], index, jobs.length, options);
    rows.push(row);
    if (controls.onJobComplete) {
      await controls.onJobComplete(row, index, jobs.length);
    }
  }

  return rows;
}

export function createBatchStatusState(onStatus = () => {}) {
  const stopListeners = new Set();
  let state = {
    running: false,
    paused: false,
    stopping: false,
    statusKey: 'idleStatus',
    statusArgs: [],
    statusText: '',
    logs: [],
    total: 0,
    completed: false
  };

  function emit(status, running = state.running, paused = state.paused) {
    const nextStatus = typeof status === 'string' ? { statusText: status } : status;
    state = {
      ...state,
      ...nextStatus,
      running,
      paused
    };
    onStatus({ ...state });
  }

  return {
    getState: () => ({ ...state }),
    setStatus: emit,
    start(statusKey, total = 0) {
      state = { running: true, paused: false, stopping: false, statusKey, statusArgs: [], statusText: '', logs: [], total, completed: false };
      emit({ statusKey, logs: [], total, completed: false }, true, false);
    },
    updateProgress(index, total, url) {
      emit({ statusKey: 'batchProgressStatus', statusArgs: [String(index + 1), String(total), url] }, true, state.paused);
    },
    addLog(url, status, error = '', title = '') {
      const logs = [...(state.logs || []), { url, status, error, title }];
      emit({ statusKey: 'batchLogUpdatedStatus', statusArgs: [], logs }, true, state.paused);
    },
    finish(rows, reportEnabled) {
      const successful = rows.filter((row) => row.status === 'ok').length;
      const failed = rows.length - successful;
      emit({
        statusKey: reportEnabled ? 'batchDoneWithReportStatus' : 'batchDoneStatus',
        statusArgs: [String(successful), String(failed)],
        completed: true
      }, false, false);
    },
    clearCompleted() {
      state = { ...state, completed: false, logs: [], total: 0 };
      emit({ completed: false, logs: [], total: 0 });
    },
    reset() {
      state = { ...state, running: false, paused: false, stopping: false };
    },
    requestStop() {
      state = { ...state, stopping: true };
      emit({ statusKey: 'stoppingStatus' }, true, false);
      stopListeners.forEach((listener) => listener());
    },
    onStop(listener) {
      if (state.stopping) {
        listener();
        return () => {};
      }
      stopListeners.add(listener);
      return () => stopListeners.delete(listener);
    },
    togglePause() {
      if (!state.running || state.stopping) {
        return false;
      }

      const paused = !state.paused;
      state = { ...state, paused };
      emit({ statusKey: paused ? 'pausedStatus' : 'runningStatus' }, true, paused);
      return true;
    }
  };
}
