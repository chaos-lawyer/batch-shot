export function createReportRow({ index, url, title = '', filename = '', status, error = '' }) {
  return {
    index: index + 1,
    url,
    title,
    filename,
    status,
    error
  };
}

export async function runCaptureJobs(jobs, options, controls) {
  const rows = [];

  for (let index = 0; index < jobs.length; index += 1) {
    if (controls.shouldStop()) {
      break;
    }

    await controls.waitWhilePaused();
    rows.push(await controls.captureSingleJob(jobs[index], index, jobs.length, options));
  }

  return rows;
}

export function createBatchStatusState(onStatus = () => {}) {
  let state = {
    running: false,
    paused: false,
    stopping: false,
    statusKey: 'idleStatus',
    statusArgs: [],
    statusText: ''
  };

  function emit(status, running = state.running, paused = state.paused) {
    const nextStatus = typeof status === 'string' ? { statusText: status } : status;
    state = {
      ...state,
      statusKey: nextStatus.statusKey || '',
      statusArgs: nextStatus.statusArgs || [],
      statusText: nextStatus.statusText || '',
      running,
      paused
    };
    onStatus({ ...state });
  }

  return {
    getState: () => ({ ...state }),
    setStatus: emit,
    start(statusKey) {
      state = { running: true, paused: false, stopping: false, statusKey, statusArgs: [], statusText: '' };
      emit({ statusKey }, true, false);
    },
    updateProgress(index, total, url) {
      emit({ statusKey: 'batchProgressStatus', statusArgs: [String(index + 1), String(total), url] }, true, state.paused);
    },
    finish(rows, reportEnabled) {
      const successful = rows.filter((row) => row.status === 'ok').length;
      const failed = rows.length - successful;
      emit({
        statusKey: reportEnabled ? 'batchDoneWithReportStatus' : 'batchDoneStatus',
        statusArgs: [String(successful), String(failed)]
      }, false, false);
    },
    reset() {
      state = { ...state, running: false, paused: false, stopping: false };
    },
    requestStop() {
      state = { ...state, stopping: true };
      emit({ statusKey: 'stoppingStatus' }, true, false);
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
