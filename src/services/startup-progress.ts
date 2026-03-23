export const INITIAL_STARTUP_STEPS = [
  { id: 'load_config', label: 'Load config' },
  { id: 'connect_database', label: 'Connect database' },
  { id: 'sync_exchange_metadata', label: 'Sync exchange metadata' },
  { id: 'sync_coin_catalog', label: 'Sync coin catalog' },
  { id: 'sync_chain_catalog', label: 'Sync chain catalog' },
  { id: 'build_market_snapshots', label: 'Build market snapshots' },
  { id: 'start_ohlcv_worker', label: 'Start OHLCV worker' },
  { id: 'seed_reference_data', label: 'Seed reference data' },
  { id: 'rebuild_search_index', label: 'Rebuild search index' },
  { id: 'start_http_listener', label: 'Start HTTP listener' },
] as const;

export type StartupStepId = typeof INITIAL_STARTUP_STEPS[number]['id'];

type StepStatus = 'pending' | 'active' | 'done';

type StepFailure = {
  stepId: StartupStepId;
  message: string;
};

type OhlcvProgress = {
  current: number;
  total: number;
};

export type StartupProgressReporter = {
  start: () => void;
  begin: (stepId: StartupStepId, ohlcvProgress?: OhlcvProgress) => void;
  complete: (stepId: StartupStepId) => void;
  fail: (stepId: StartupStepId, message: string) => void;
  failCurrent: (message: string) => void;
  updateOhlcvProgress: (current: number, total: number) => void;
};

type CreateStartupProgressTrackerOptions = {
  write?: (value: string) => void;
};

export function createStartupProgressTracker(
  options: CreateStartupProgressTrackerOptions = {},
): StartupProgressReporter {
  const write = options.write ?? ((value: string) => process.stdout.write(value));
  const statuses = new Map<StartupStepId, StepStatus>(
    INITIAL_STARTUP_STEPS.map((step) => [step.id, 'pending']),
  );
  let activeStepId: StartupStepId | null = null;
  let ohlcvProgress: OhlcvProgress | null = null;
  let failure: StepFailure | null = null;
  let hasRendered = false;

  function render() {
    const completedCount = INITIAL_STARTUP_STEPS.filter((step) => statuses.get(step.id) === 'done').length;
    const percent = Math.floor((completedCount / INITIAL_STARTUP_STEPS.length) * 100);
    const filled = Math.floor((completedCount / INITIAL_STARTUP_STEPS.length) * 10);
    const bar = `[${'#'.repeat(filled)}${'-'.repeat(10 - filled)}] ${percent}%`;
    const lines = INITIAL_STARTUP_STEPS.map((step) => {
      const status = statuses.get(step.id);
      const marker = failure?.stepId === step.id ? '!' : status === 'done' ? 'x' : status === 'active' ? '>' : ' ';
      const detail = step.id === 'start_ohlcv_worker' && ohlcvProgress
        ? ` (${ohlcvProgress.current}/${ohlcvProgress.total})`
        : '';
      const errorSuffix = failure?.stepId === step.id ? ` - ${failure.message}` : '';

      return `[${marker}] ${step.label}${detail}${errorSuffix}`;
    });

    const frame = `Server starting...\n\n${bar}\n\n${lines.join('\n')}\n`;
    write(`${hasRendered ? '\u001bc' : ''}${frame}`);
    hasRendered = true;
  }

  return {
    start() {
      render();
    },
    begin(stepId, nextOhlcvProgress) {
      failure = null;

      if (activeStepId && activeStepId !== stepId && statuses.get(activeStepId) === 'active') {
        statuses.set(activeStepId, 'done');
      }

      activeStepId = stepId;
      statuses.set(stepId, 'active');
      ohlcvProgress = stepId === 'start_ohlcv_worker' ? nextOhlcvProgress ?? ohlcvProgress : null;
      render();
    },
    complete(stepId) {
      statuses.set(stepId, 'done');

      if (activeStepId === stepId) {
        activeStepId = null;
      }

      if (stepId === 'start_ohlcv_worker') {
        ohlcvProgress = null;
      }

      render();
    },
    fail(stepId, message) {
      statuses.set(stepId, 'active');
      activeStepId = stepId;
      failure = { stepId, message };
      render();
    },
    failCurrent(message) {
      if (!activeStepId) {
        this.fail('start_http_listener', message);
        return;
      }

      this.fail(activeStepId, message);
    },
    updateOhlcvProgress(current, total) {
      ohlcvProgress = { current, total };

      if (statuses.get('start_ohlcv_worker') !== 'active') {
        this.begin('start_ohlcv_worker', ohlcvProgress);
        return;
      }

      render();
    },
  };
}
