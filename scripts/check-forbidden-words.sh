#!/bin/sh
# Fails if any tracked file mentions a word from FORBIDDEN_WORDS (comma-separated, case-insensitive).
# CI logs are public, so only file:line is printed, never the word or the line text.
set -eu
set -f

if [ -z "$(printf '%s' "${FORBIDDEN_WORDS:-}" | tr -d ' ,')" ]; then
  echo "::warning::FORBIDDEN_WORDS is empty, skipping the forbidden words check"
  exit 0
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
: > "$tmp/hits"
paths=0

IFS=,
for w in $FORBIDDEN_WORDS; do
  w=$(printf '%s' "$w" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  [ -n "$w" ] || continue
  # git grep exits 1 when nothing matches; anything above 1 is a real error.
  git grep -i -I -n -F -e "$w" > "$tmp/out" || [ $? -eq 1 ]
  # shortcut: cut breaks on paths containing ':', none exist; switch to `git grep -z` if that changes.
  cut -d: -f1,2 "$tmp/out" >> "$tmp/hits"
  n=$(git ls-files | grep -i -F -c -e "$w" || true)
  paths=$((paths + n))
done

# Sorted so the log does not reveal the order of words in the list.
sort -u "$tmp/hits" | while IFS=: read -r file line; do
  echo "::error file=$file,line=$line::forbidden word found"
done

if [ "$paths" -gt 0 ]; then
  echo "::error::$paths tracked path(s) contain a forbidden word"
fi

if [ -s "$tmp/hits" ] || [ "$paths" -gt 0 ]; then
  exit 1
fi
echo "No forbidden words found"
