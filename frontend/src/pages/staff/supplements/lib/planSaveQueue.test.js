import { afterLatestPlanSaved, createPlanSaveQueue, mergeSavedPlan } from './planSaveQueue';

const plan = (quantity) => ({ status: 'draft', months: [{ supplements: [{ supplement_name: 'Example', quantity_per_dose: quantity }] }] });
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test.each(['finalize', 'patient PDF', 'HC PDF', 'Dropbox', 'template', 'duplicate'])('a failed save stops %s and can be retried', async () => {
  const persist = jest.fn().mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce({});
  const queue = createPlanSaveQueue(persist);
  const action = jest.fn();
  const current = plan(2);
  const options = { cancelPending: jest.fn(), getLatest: () => current, save: queue.save, action };
  await expect(afterLatestPlanSaved(options)).rejects.toThrow('Connection lost');
  expect(action).not.toHaveBeenCalled();
  expect(current.months[0].supplements[0].quantity_per_dose).toBe(2);
  await afterLatestPlanSaved(options);
  expect(action).toHaveBeenCalledTimes(1);
});

test('requests are serialized snapshots and the latest save precedes the operation', async () => {
  const first = deferred();
  const order = [];
  const busy = jest.fn();
  const persist = jest.fn(async snapshot => {
    const quantity = snapshot.months[0].supplements[0].quantity_per_dose;
    order.push(`save ${quantity}`);
    if (quantity === 1) await first.promise;
    return { ...snapshot, total_program_cost: quantity * 10 };
  });
  const queue = createPlanSaveQueue(persist, busy);
  const oldVersion = plan(1);
  let current = oldVersion;
  const save = async snapshot => {
    const response = await queue.save(snapshot);
    current = mergeSavedPlan(current, snapshot, response);
  };
  const savingOld = save(oldVersion);
  current = plan(2);
  const operation = afterLatestPlanSaved({ cancelPending: jest.fn(), getLatest: () => current, save,
    action: latest => { order.push('export'); expect(latest.total_program_cost).toBe(20); } });
  await Promise.resolve();
  expect(persist).toHaveBeenCalledTimes(1);
  first.resolve();
  await savingOld;
  expect(current.months[0].supplements[0].quantity_per_dose).toBe(2);
  await operation;
  expect(order).toEqual(['save 1', 'save 2', 'export']);
  expect(busy).toHaveBeenLastCalledWith(false);
});

test('queued data cannot be mutated before transmission', async () => {
  const persist = jest.fn().mockResolvedValue({});
  const queue = createPlanSaveQueue(persist);
  const source = plan(1);
  const pending = queue.save(source);
  source.months[0].supplements[0].quantity_per_dose = 99;
  await pending;
  expect(persist.mock.calls[0][0].months[0].supplements[0].quantity_per_dose).toBe(1);
});

test('the action cancels a pending debounce so it cannot write after finalization', async () => {
  jest.useFakeTimers();
  const staleAutosave = jest.fn();
  const timer = setTimeout(staleAutosave, 800);
  const current = plan(2);
  await afterLatestPlanSaved({ cancelPending: () => clearTimeout(timer), getLatest: () => current,
    save: jest.fn().mockResolvedValue({}), action: () => { current.status = 'finalized'; } });
  jest.runAllTimers();
  expect(staleAutosave).not.toHaveBeenCalled();
  jest.useRealTimers();
});

test('unsupported dosage never reaches persistence or export', async () => {
  const current = plan(2);
  current.months[0].supplements[0].dosage_error = 'Enter exact doses';
  const persist = jest.fn();
  const action = jest.fn();
  await expect(afterLatestPlanSaved({ cancelPending: jest.fn(), getLatest: () => current,
    save: createPlanSaveQueue(persist).save, action })).rejects.toThrow('Example: Enter exact doses');
  expect(persist).not.toHaveBeenCalled();
  expect(action).not.toHaveBeenCalled();
});
