#!/usr/bin/env bash
# Auto-restart ingest — reads last offset from log and resumes on crash
LOG="/tmp/traffy-ingest.log"
DONE_MARKER="/tmp/traffy-ingest-done"

rm -f "$DONE_MARKER"

while true; do
  LAST=$(grep -oE 'fetched=[0-9,]+' "$LOG" 2>/dev/null | tail -1 | tr -d ',' | sed 's/fetched=//')
  OFFSET=${LAST:-0}
  echo "" >> "$LOG"
  echo "=== [$(date '+%H:%M:%S')] resume offset=$OFFSET ===" >> "$LOG"

  node scripts/ingest-traffy-bq.mjs "$OFFSET" 2>&1 | tee -a "$LOG"

  if grep -qE '✅ เสร็จ|✅ ดึงข้อมูลครบ' "$LOG" 2>/dev/null; then
    echo "=== DONE ===" | tee -a "$LOG"
    touch "$DONE_MARKER"
    break
  fi

  echo "=== crashed, restart in 10s ===" >> "$LOG"
  sleep 10
done
