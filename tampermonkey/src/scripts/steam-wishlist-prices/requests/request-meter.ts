type RequestHook = () => void;

let requestHook: RequestHook | null = null;

export const setRequestHook = (hook: RequestHook | null) => {
  requestHook = hook;
};

export const noteRequest = () => {
  requestHook?.();
};

export const createRequestMeter = (onChange: (done: number, total: number) => void) => {
  let done = 0;
  let total = 0;
  const emit = () => onChange(done, total);
  return {
    get done() {
      return done;
    },
    get total() {
      return total;
    },
    bump() {
      done += 1;
      if (done > total) {
        total = done;
      }
      emit();
    },
    setTotal(next: number) {
      total = Math.max(next, done);
      emit();
    },
  };
};
