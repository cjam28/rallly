#!/usr/bin/env bash
# session-end.sh — Cursor sessionEnd hook (project-level)
# - Counts new .specstory/history/*.md files since the last session-start log entry
# - If ≥1, appends a checkbox line to env _log/promotion-queue.md
# - Appends a session-end line to env _log/sessions.log
# Fails OPEN.

set -uo pipefail

PROJECT_ROOT="$(pwd)"
DEV_ROOT="$HOME/Dev"

parent="$(dirname "$PROJECT_ROOT")"
ENV_NAME="$(basename "$parent")"
PROJ_NAME="$(basename "$PROJECT_ROOT")"

ENV_LOG="$DEV_ROOT/$ENV_NAME/_shared/_log"
mkdir -p "$ENV_LOG" 2>/dev/null || true

# Consume stdin
cat >/dev/null 2>&1 || true

ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

HIST_DIR="$PROJECT_ROOT/.specstory/history"
QUEUE="$ENV_LOG/promotion-queue.md"

if [ -d "$HIST_DIR" ]; then
  # Find the last session-start time for this project
  last_start="$(grep -E "session-start project=$PROJ_NAME " "$ENV_LOG/sessions.log" 2>/dev/null | tail -1 | awk '{print $1}')"
  if [ -n "$last_start" ]; then
    last_epoch="$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$last_start" +%s 2>/dev/null || echo 0)"
    new_count=0
    while IFS= read -r f; do
      [ -f "$f" ] || continue
      f_epoch="$(stat -f '%m' "$f")"
      if [ "$f_epoch" -gt "$last_epoch" ]; then
        new_count=$((new_count+1))
        slug="$(basename "$f")"
        # Append to queue if not already present
        if ! grep -qF "$slug" "$QUEUE" 2>/dev/null; then
          echo "- [ ] $slug (project: $PROJ_NAME)" >> "$QUEUE"
        fi
      fi
    done < <(find "$HIST_DIR" -maxdepth 1 -name '*.md' -type f 2>/dev/null)
    if [ "$new_count" -gt 0 ]; then
      echo "$ts session-end project=$PROJ_NAME env=$ENV_NAME new_history_files=$new_count queued=yes" >> "$ENV_LOG/sessions.log" 2>/dev/null || true
      exit 0
    fi
  fi
fi

echo "$ts session-end project=$PROJ_NAME env=$ENV_NAME" >> "$ENV_LOG/sessions.log" 2>/dev/null || true
exit 0
