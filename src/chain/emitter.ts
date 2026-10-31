export interface Emitter<T> {
  subscribe(listener: (value: T) => void): () => void;
  emit(value: T): void;
  clear(): void;
}

export function createEmitter<T>(): Emitter<T> {
  let listeners: readonly ((value: T) => void)[] = [];
  return {
    subscribe(listener) {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((existing) => existing !== listener);
      };
    },
    emit(value) {
      for (const listener of listeners) {
        try {
          listener(value);
        } catch (error) {
          globalThis.reportError?.(error);
        }
      }
    },
    clear() {
      listeners = [];
    },
  };
}
