/** Ordered, explicit-value writes per switch. Different settings can save in parallel.
 * Sequence checks protect the optimistic value; ordering protects the persisted value,
 * even when an older request is already executing and cannot safely be aborted.
 */
export function createSwitchWriter<K extends string>(
  initial: Record<K, boolean>,
  persist: (key: K, value: boolean) => Promise<void>,
  changed: (values: Record<K, boolean>, pending: ReadonlySet<K>) => void,
  failed: (error: unknown) => void,
) {
  const confirmed = { ...initial };
  const values = { ...initial };
  const pending = new Set<K>();
  const sequences = new Map<K, number>();
  const tails = new Map<K, Promise<boolean>>();
  const emit = () => changed({ ...values }, new Set(pending));

  return (key: K, value: boolean): Promise<boolean> => {
    const sequence = (sequences.get(key) ?? 0) + 1;
    sequences.set(key, sequence);
    values[key] = value;
    pending.add(key);
    emit();
    const write = async () => {
      try {
        await persist(key, value);
        confirmed[key] = value;
        return true;
      } catch (error) {
        if (sequences.get(key) === sequence) {
          values[key] = confirmed[key];
          failed(error);
        }
        return false;
      } finally {
        if (sequences.get(key) === sequence) {
          pending.delete(key);
          tails.delete(key);
          emit();
        }
      }
    };
    const tail = (tails.get(key) ?? Promise.resolve()).then(write);
    tails.set(key, tail);
    return tail;
  };
}
