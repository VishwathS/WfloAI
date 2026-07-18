"use client";

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";

const COMMIT_DELAY_MS = 300;

const registeredFlushes = new Set<() => void>();

export function flushAllBufferedFields() {
  registeredFlushes.forEach((flush) => flush());
}

export function useBufferedField(committed: string, commit: (value: string) => void) {
  const [value, setValue] = useState(committed);
  const valueRef = useRef(committed);
  const committedRef = useRef(committed);
  const commitRef = useRef(commit);
  const focusedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushRef = useRef<() => void>(() => {});

  commitRef.current = commit;
  committedRef.current = committed;
  flushRef.current = flush;

  useEffect(() => {
    const flushField = () => flushRef.current();
    registeredFlushes.add(flushField);
    return () => {
      registeredFlushes.delete(flushField);
    };
  }, []);

  useEffect(() => {
    if (!focusedRef.current && committed !== valueRef.current) {
      valueRef.current = committed;
      setValue(committed);
    }
  }, [committed]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        if (valueRef.current !== committedRef.current) {
          commitRef.current(valueRef.current);
        }
      }
    };
  }, []);

  function flush() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (valueRef.current !== committedRef.current) {
      commitRef.current(valueRef.current);
    }
  }

  function onChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const next = event.target.value;
    valueRef.current = next;
    setValue(next);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      if (valueRef.current !== committedRef.current) {
        commitRef.current(valueRef.current);
      }
    }, COMMIT_DELAY_MS);
  }

  function onFocus() {
    focusedRef.current = true;
  }

  function onBlur() {
    focusedRef.current = false;
    flush();
  }

  function onEnterKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      flush();
    }
  }

  return { value, onChange, onFocus, onBlur, onEnterKeyDown };
}
