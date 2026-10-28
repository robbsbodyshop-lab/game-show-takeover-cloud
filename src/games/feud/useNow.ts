import { useEffect, useState } from 'react';

const clockNow = (): number => Date.now();

/** The current time, refreshed every `stepMs` while `active`. */
export const useNow = (active: boolean, stepMs = 100): number => {
  const [now, setNow] = useState(clockNow);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setNow(clockNow());
    }, stepMs);
    return () => {
      clearInterval(id);
    };
  }, [active, stepMs]);
  return now;
};

/**
 * When this device received `value` (by identity). Clock displays extrapolate from the arrival time
 * rather than the stage's clock, so two machines with different clocks still agree on the countdown.
 */
export const useReceivedAt = (value: unknown): number => {
  const [stamp, setStamp] = useState(() => ({ value, at: clockNow() }));
  if (stamp.value !== value) {
    const next = { value, at: clockNow() };
    setStamp(next);
    return next.at;
  }
  return stamp.at;
};
