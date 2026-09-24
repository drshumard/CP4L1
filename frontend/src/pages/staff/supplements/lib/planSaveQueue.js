export const clonePlan = (plan) => JSON.parse(JSON.stringify(plan));
export const mergeSavedPlan = (current, savedVersion, response) => current === savedVersion
  ? { ...savedVersion, ...response }
  : current;

export function assertPlanDosages(plan) {
  for (const month of plan.months || []) {
    for (const supplement of month.supplements || []) {
      if (supplement.dosage_error) {
        throw new Error(`${supplement.supplement_name || 'Supplement'}: ${supplement.dosage_error}`);
      }
    }
  }
}

// One writer per editor. Snapshot immediately so later edits cannot mutate an
// in-flight request, and recover the queue after rejection so retry remains possible.
export function createPlanSaveQueue(persist, onBusyChange = () => {}) {
  let tail = Promise.resolve();
  let pending = 0;
  return {
    save(plan) {
      const snapshot = clonePlan(plan);
      pending += 1;
      onBusyChange(true);
      const work = tail.then(async () => {
        assertPlanDosages(snapshot);
        return persist(snapshot);
      });
      const settled = work.finally(() => {
        pending -= 1;
        onBusyChange(pending > 0);
      });
      tail = settled.catch(() => {});
      return settled;
    },
  };
}

// The operation is never invoked if saving rejects. The caller locks editing
// before entering this barrier and releases it after the operation settles.
export async function afterLatestPlanSaved({ cancelPending, getLatest, save, action }) {
  cancelPending();
  const plan = getLatest();
  if (!plan) throw new Error('The plan is not loaded.');
  if (plan.status !== 'finalized') await save(plan);
  return action(getLatest());
}
