export interface ClockVisibility {
  isHidden(): boolean;
  subscribe(listener: () => void): () => void;
}

export function documentVisibility(): ClockVisibility {
  if (typeof document === 'undefined') {
    return { isHidden: () => false, subscribe: () => () => {} };
  }
  return {
    isHidden: () => document.visibilityState === 'hidden',
    subscribe(listener) {
      document.addEventListener('visibilitychange', listener);
      return () => document.removeEventListener('visibilitychange', listener);
    },
  };
}
