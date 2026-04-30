"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const STORAGE_KEY = "traffy_ingest_offset";
const BATCH_SIZE = 500;
const MAX_LOG = 50;

interface BatchResult {
  start: number;
  fetched: number;
  upserted: number;
  total: number;
  nextStart: number;
  done: boolean;
  elapsed: number;
  error?: string;
  ts: string;
}

type Status = "idle" | "running" | "paused" | "done" | "error";

export default function TraffyIngestPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [offset, setOffset] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [totalUpserted, setTotalUpserted] = useState<number>(0);
  const [log, setLog] = useState<BatchResult[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [batchSize, setBatchSize] = useState<number>(BATCH_SIZE);
  const [delayMs, setDelayMs] = useState<number>(0);

  const runningRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Restore offset from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setOffset(parseInt(saved));
  }, []);

  // Scroll log to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  const appendLog = useCallback((entry: BatchResult) => {
    setLog(prev => [...prev.slice(-MAX_LOG + 1), entry]);
  }, []);

  const runLoop = useCallback(async (startOffset: number) => {
    runningRef.current = true;
    let currentOffset = startOffset;

    while (runningRef.current) {
      try {
        const res = await fetch(
          `/api/traffy/ingest?start=${currentOffset}&batchSize=${batchSize}`
        );
        const json = await res.json();

        const entry: BatchResult = { ...json, ts: new Date().toLocaleTimeString("th-TH") };

        if (!res.ok || json.error) {
          entry.error = json.error || `HTTP ${res.status}`;
          appendLog(entry);
          setErrorMsg(entry.error!);
          setStatus("error");
          runningRef.current = false;
          return;
        }

        appendLog(entry);
        setOffset(json.nextStart);
        setTotal(json.total);
        setTotalUpserted(prev => prev + (json.upserted ?? 0));
        localStorage.setItem(STORAGE_KEY, String(json.nextStart));

        if (json.done) {
          setStatus("done");
          runningRef.current = false;
          return;
        }

        currentOffset = json.nextStart;

        // Optional delay between batches to avoid hammering the API
        if (delayMs > 0) {
          await new Promise(r => setTimeout(r, delayMs));
        }

      } catch (err) {
        const msg = String(err);
        setErrorMsg(msg);
        setStatus("error");
        runningRef.current = false;
        return;
      }
    }

    // Loop exited because runningRef was set false externally (pause)
    setStatus("paused");
  }, [batchSize, delayMs, appendLog]);

  const handleStart = () => {
    setErrorMsg("");
    setStatus("running");
    runLoop(offset);
  };

  const handleResume = () => {
    setErrorMsg("");
    setStatus("running");
    runLoop(offset);
  };

  const handlePause = () => {
    runningRef.current = false;
    setStatus("paused");
  };

  const handleReset = () => {
    runningRef.current = false;
    setStatus("idle");
    setOffset(0);
    setTotal(0);
    setTotalUpserted(0);
    setLog([]);
    setErrorMsg("");
    localStorage.removeItem(STORAGE_KEY);
  };

  const pct = total > 0 ? Math.min(100, (offset / total) * 100) : 0;

  const avgSpeed = log.length > 0
    ? Math.round(log.reduce((s, e) => s + (e.fetched / (e.elapsed / 1000)), 0) / log.length)
    : 0;

  const eta = avgSpeed > 0 && total > 0
    ? Math.round((total - offset) / avgSpeed)
    : null;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 font-mono">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-emerald-400">Traffy Fondue → Supabase</h1>
          <p className="text-gray-400 text-sm mt-1">
            ดึงข้อมูล offset-by-offset จาก publicapi.traffy.in.th เข้าตาราง traffy_complaints
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Total (API)" value={total > 0 ? total.toLocaleString() : "—"} />
          <Stat label="Offset ปัจจุบัน" value={offset.toLocaleString()} />
          <Stat label="Upserted รอบนี้" value={totalUpserted.toLocaleString()} />
          <Stat label="ETA" value={eta != null ? formatEta(eta) : "—"} />
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>{pct.toFixed(1)}%</span>
            <span>{avgSpeed > 0 ? `~${avgSpeed} records/s` : ""}</span>
          </div>
          <div className="h-4 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Batch size</label>
            <input
              type="number"
              value={batchSize}
              min={50} max={1000} step={50}
              disabled={status === "running"}
              onChange={e => setBatchSize(Math.min(1000, Math.max(50, parseInt(e.target.value) || 500)))}
              className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-center"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Delay ระหว่าง batch (ms)</label>
            <input
              type="number"
              value={delayMs}
              min={0} max={5000} step={100}
              disabled={status === "running"}
              onChange={e => setDelayMs(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-center"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">เริ่มจาก offset</label>
            <input
              type="number"
              value={offset}
              min={0}
              disabled={status === "running"}
              onChange={e => {
                const v = Math.max(0, parseInt(e.target.value) || 0);
                setOffset(v);
                localStorage.setItem(STORAGE_KEY, String(v));
              }}
              className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-center"
            />
          </div>

          <div className="flex gap-2 mt-auto">
            {status === "idle" && (
              <Button color="emerald" onClick={handleStart}>▶ Start</Button>
            )}
            {status === "running" && (
              <Button color="yellow" onClick={handlePause}>⏸ Pause</Button>
            )}
            {(status === "paused" || status === "error") && (
              <Button color="emerald" onClick={handleResume}>▶ Resume</Button>
            )}
            {status !== "idle" && (
              <Button color="red" onClick={handleReset}>✕ Reset</Button>
            )}
            {status === "done" && (
              <span className="px-3 py-2 bg-emerald-900 text-emerald-300 rounded text-sm font-bold">
                ✓ เสร็จสมบูรณ์
              </span>
            )}
          </div>
        </div>

        {/* Error */}
        {errorMsg && (
          <div className="bg-red-900/40 border border-red-700 rounded p-3 text-red-300 text-sm">
            {errorMsg}
          </div>
        )}

        {/* Batch log */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-sm font-semibold text-gray-300">Batch Log</h2>
            <span className="text-xs text-gray-500">{log.length} batches</span>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded h-72 overflow-y-auto text-xs p-2 space-y-1">
            {log.length === 0 && (
              <p className="text-gray-600 italic">รอเริ่มดึงข้อมูล...</p>
            )}
            {log.map((entry, i) => (
              <div
                key={i}
                className={`flex gap-3 ${entry.error ? "text-red-400" : "text-gray-300"}`}
              >
                <span className="text-gray-600 shrink-0">{entry.ts}</span>
                {entry.error ? (
                  <span>❌ offset={entry.start} — {entry.error}</span>
                ) : (
                  <span>
                    ✓ offset={entry.start.toLocaleString()} → +{entry.upserted}
                    {" "}({entry.elapsed}ms)
                    {" "}<span className="text-gray-500">
                      [{entry.nextStart.toLocaleString()}/{entry.total.toLocaleString()}]
                    </span>
                  </span>
                )}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>

      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded p-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-lg font-bold text-white">{value}</div>
    </div>
  );
}

function Button({
  children,
  color,
  onClick,
}: {
  children: React.ReactNode;
  color: "emerald" | "yellow" | "red";
  onClick: () => void;
}) {
  const cls =
    color === "emerald" ? "bg-emerald-700 hover:bg-emerald-600 text-white"
    : color === "yellow" ? "bg-yellow-700 hover:bg-yellow-600 text-white"
    : "bg-red-800 hover:bg-red-700 text-white";
  return (
    <button onClick={onClick} className={`px-4 py-2 rounded text-sm font-semibold ${cls} transition-colors`}>
      {children}
    </button>
  );
}

function formatEta(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}
