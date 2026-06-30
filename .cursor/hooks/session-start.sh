#!/usr/bin/env bash
# session-start.sh — Cursor sessionStart hook (project-level)
# - Surfaces unprocessed promotion-queue items as additional_context for the agent
# - Verifies hardlink integrity for this project; self-repairs divergent links (backing up first)
# - Appends a session-start line to env _log/sessions.log
# Fails OPEN: always exits 0; never blocks Cursor.

set -uo pipefail

PROJECT_ROOT="$(pwd)"
DEV_ROOT="$HOME/Dev"

# Discover env from project location: ~/Dev/<env>/<project>
parent="$(dirname "$PROJECT_ROOT")"
ENV_NAME="$(basename "$parent")"
PROJ_NAME="$(basename "$PROJECT_ROOT")"

ENV_LOG="$DEV_ROOT/$ENV_NAME/_shared/_log"
mkdir -p "$ENV_LOG" 2>/dev/null || true

# Read JSON stdin (we don't strictly need it; consume to avoid SIGPIPE)
input="$(cat 2>/dev/null || true)"

ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "$ts session-start project=$PROJ_NAME env=$ENV_NAME pid=$$" >> "$ENV_LOG/sessions.log" 2>/dev/null || true

ctx_lines=()

# Lazy Backlog.md init for internal Dev projects (once per repo, idempotent)
if [ -x "$DEV_ROOT/_shared/_scripts/ensure-backlog-init.sh" ]; then
  backlog_msg="$("$DEV_ROOT/_shared/_scripts/ensure-backlog-init.sh" "$PROJECT_ROOT" 2>&1 || true)"
  if echo "$backlog_msg" | grep -q 'Backlog.md initialized'; then
    ctx_lines+=("")
    ctx_lines+=("$backlog_msg")
    ctx_lines+=("Capture rule stub appended to 99-project-specific.mdc and CLAUDE.md if missing.")
  fi
fi

# Verify hardlinks for this project (self-repair on divergence)
if [ -x "$DEV_ROOT/_shared/_scripts/verify-hardlinks.sh" ]; then
  vh_output="$("$DEV_ROOT/_shared/_scripts/verify-hardlinks.sh" "$ENV_NAME" "$PROJ_NAME" --repair 2>&1 || true)"
  if echo "$vh_output" | grep -q "Divergent: [1-9]"; then
    ctx_lines+=("⚠ session-start: hardlink drift detected and repaired. Divergent files backed up as *.divergent-*.bak. Review before deleting.")
  fi
fi

# Surface promotion-queue items
QUEUE="$ENV_LOG/promotion-queue.md"
if [ -f "$QUEUE" ] && [ -s "$QUEUE" ]; then
  ctx_lines+=("")
  ctx_lines+=("Pending lesson promotions for $ENV_NAME (from $QUEUE):")
  while IFS= read -r line; do
    ctx_lines+=("  $line")
  done < "$QUEUE"
  ctx_lines+=("")
  ctx_lines+=("Consider running: ~/Dev/_shared/_scripts/promote-lesson.sh $ENV_NAME $PROJ_NAME")
fi

# Surface recent in-folder chat history (filenames only; a nudge, no content — keeps context cheap)
SPEC_HIST="$PROJECT_ROOT/.specstory/history"
if [ -d "$SPEC_HIST" ]; then
  recent="$(find "$SPEC_HIST" -name '*.md' -type f -mtime -7 2>/dev/null | sort | tail -10)"
  if [ -n "$recent" ]; then
    ctx_lines+=("")
    ctx_lines+=("Recent chat history (.specstory/history, last 7 days) — skim first lines if resuming related work:")
    while IFS= read -r f; do
      [ -n "$f" ] && ctx_lines+=("  $(basename "$f")")
    done <<< "$recent"
  fi
fi

if [ "${#ctx_lines[@]}" -gt 0 ]; then
  ctx="$(printf '%s\n' "${ctx_lines[@]}")"
  if command -v jq >/dev/null 2>&1; then
    jq -nc --arg c "$ctx" '{additional_context: $c}'
  else
    # Best-effort JSON
    esc="$(echo "$ctx" | sed 's/"/\\"/g' | tr '\n' ' ')"
    echo "{\"additional_context\": \"$esc\"}"
  fi
fi

exit 0
