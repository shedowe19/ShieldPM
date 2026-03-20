const processes = new Map();

const getProcess = (id) => processes.get(id);
const setProcess = (id, child) => processes.set(id, child);
const deleteProcess = (id) => processes.delete(id);
const hasProcess = (id) => processes.has(id);

export { deleteProcess, getProcess, hasProcess, processes, setProcess };
