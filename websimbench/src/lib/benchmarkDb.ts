import type { BenchmarkReport } from '@/types/benchmark';

const DB_NAME = 'websimbench';
const DB_VERSION = 1;
const STORE_NAME = 'benchmarkReports';

const openDatabase = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
  });
};

const runTransaction = async <T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<T>
): Promise<T> => {
  const db = await openDatabase();

  try {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const result = await operation(store);

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    });

    return result;
  } finally {
    db.close();
  }
};

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> => {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
};

export const listBenchmarkReports = async (): Promise<BenchmarkReport[]> => {
  return runTransaction('readonly', async (store) => {
    const reports = await requestToPromise(store.getAll() as IDBRequest<BenchmarkReport[]>);
    return reports.sort((a, b) => b.timestamp - a.timestamp);
  });
};

export const saveBenchmarkReport = async (report: BenchmarkReport): Promise<void> => {
  await runTransaction('readwrite', async (store) => {
    await requestToPromise(store.put(report));
  });
};

export const renameBenchmarkReport = async (id: string, name: string): Promise<void> => {
  await runTransaction('readwrite', async (store) => {
    const report = await requestToPromise(store.get(id) as IDBRequest<BenchmarkReport | undefined>);

    if (!report) {
      throw new Error(`Benchmark report ${id} not found.`);
    }

    report.name = name;
    await requestToPromise(store.put(report));
  });
};

export const clearBenchmarkReports = async (): Promise<void> => {
  await runTransaction('readwrite', async (store) => {
    await requestToPromise(store.clear());
  });
};
