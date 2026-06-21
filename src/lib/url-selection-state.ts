"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

interface UrlSelectionOptions<T> {
  param: string;
  defaultValue: T;
  parse: (raw: string | null) => T;
  serialize: (value: T) => string | null;
}

function useUrlSelectionState<T>({
  param,
  defaultValue,
  parse,
  serialize,
}: UrlSelectionOptions<T>): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(defaultValue);
  const valueRef = useRef(value);
  const parseRef = useRef(parse);
  const serializeRef = useRef(serialize);
  parseRef.current = parse;
  serializeRef.current = serialize;

  useEffect(() => {
    const readUrl = () => {
      const nextValue = parseRef.current(new URL(window.location.href).searchParams.get(param));
      valueRef.current = nextValue;
      setValue(nextValue);
    };
    readUrl();
    window.addEventListener("popstate", readUrl);
    return () => window.removeEventListener("popstate", readUrl);
  }, [param]);

  const setUrlValue = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    const nextValue = typeof action === "function"
      ? (action as (current: T) => T)(valueRef.current)
      : action;
    valueRef.current = nextValue;
    setValue(nextValue);

    const url = new URL(window.location.href);
    const serialized = serializeRef.current(nextValue);
    if (serialized === null) url.searchParams.delete(param);
    else url.searchParams.set(param, serialized);
    if (url.href !== window.location.href) {
      window.history.pushState(window.history.state, "", url);
    }
  }, [param]);

  return [value, setUrlValue];
}

export function useDistrictUrlState(allValue = "ทั้งหมด") {
  return useUrlSelectionState<string>({
    param: "district",
    defaultValue: allValue,
    parse: (raw) => raw?.trim() || allValue,
    serialize: (value) => value === allValue ? null : value,
  });
}

export function useNullableNumberUrlState(param: string) {
  return useUrlSelectionState<number | null>({
    param,
    defaultValue: null,
    parse: (raw) => {
      if (!raw) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    },
    serialize: (value) => value === null ? null : String(value),
  });
}
