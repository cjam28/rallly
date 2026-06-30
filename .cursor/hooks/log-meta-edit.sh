#!/usr/bin/env bash
# log-meta-edit.sh — Cursor afterFileEdit hook
# Logs edits to meta files (CLAUDE.md, .cursor/rules/*.mdc, instructions/*.md) for drift visibility.
# Fails OPEN; returns empty JSON so no agent-visible side effects.

set -uo pipefail

PROJECT_ROOT="$(pwd)"
DEV_ROOT="$HOME/Dev"

parent="$(dirname "$PROJECT_ROOT")"
ENV_NAME="$(basename "$parent")"
PROJ_NAME="$(basename "$PROJECT_ROOT")"

ENV_LOG="$DEV_ROOT/$ENV_NAME/_shared/_log"
mkdir -p "$ENV_LOG" 2>/dev/null || true

input="$(cat 2>/dev/null || true)"

# Extract file path from hook input JSON. Cursor passes the edited file path in tool_input.target_file or similar;
# be defensive about field shape.
fpath=""
if command -v jq >/dev/null 2>&1; then
  fpath="$(echo "$input" | jq -r '.tool_input.target_file // .tool_input.file_path // .tool_input.path // empty' 2>/dev/null)"
fi

if [ -n "$fpath" ]; then
  case "$fpath" in
    *CLAUDE.md|*.cursor/rules/*.mdc|*instructions/*.md|*INSTRUCTIONS_INDEX.md)
      ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
      echo "$ts $PROJ_NAME $fpath" >> "$ENV_LOG/meta-edits.log" 2>/dev/null || true
      ;;
  esac
fi

echo '{}'
exit 0
