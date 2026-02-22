import { useState, useEffect } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      const valueToStore = storedValue instanceof Function ? storedValue(storedValue) : storedValue;
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  }, [key, storedValue]);

  return [storedValue, setStoredValue] as const;
}

// Special case for simple string storage to avoid JSON quotes if preferred,
// but for consistency keeping JSON is usually safer. 
// However, App.tsx used raw strings for 'code'. 
export function useLocalStorageString(key: string, initialValue: string) {
    const [storedValue, setStoredValue] = useState<string>(() => {
        if (typeof window === 'undefined') {
            return initialValue;
        }

        const item = window.localStorage.getItem(key);
        return item !== null ? item : initialValue;
    });

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        window.localStorage.setItem(key, storedValue);
    }, [key, storedValue]);

    return [storedValue, setStoredValue] as const;
}
