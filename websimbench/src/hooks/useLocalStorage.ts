import { useState, useEffect } from "react";

/**
 * A generic hook for managing state synchronized with window.localStorage.
 * Parses and stringifies JSON values automatically.
 *
 * @param key - The localStorage key.
 * @param initialValue - The default value if the key does not exist.
 * @returns A tuple containing the stored value and a setter function.
 */
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
      const valueToStore =
        storedValue instanceof Function
          ? storedValue(storedValue)
          : storedValue;
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  }, [key, storedValue]);

  return [storedValue, setStoredValue] as const;
}

/**
 * A specialized localStorage hook for managing primitive string values directly.
 * Bypasses JSON parsing to store raw strings like raw code editor content.
 *
 * @param key - The localStorage key.
 * @param initialValue - The default string value if the key does not exist.
 * @returns A tuple containing the stored string and a setter function.
 */
export function useLocalStorageString(key: string, initialValue: string) {
  const [storedValue, setStoredValue] = useState<string>(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }

    const item = window.localStorage.getItem(key);
    return item !== null ? item : initialValue;
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(key, storedValue);
  }, [key, storedValue]);

  return [storedValue, setStoredValue] as const;
}
