#!/bin/bash
cd "$(dirname "$0")"
for combo in "webkit:iPhone 14" "chromium:iPhone 14" "webkit:iPhone SE" "chromium:desktop" "webkit:desktop"; do
  for s in qa1 qa2 qa3; do
    echo "##### $s $combo"
    timeout 1000 node $s.cjs "$combo" 2>&1 | grep -E "^===|FAIL|✗|tests passed|CRASHED"
  done
done
for p in "iPhone 14" "iPhone SE"; do echo "##### qa4 chromium:$p"; timeout 600 node qa4.cjs "$p" 2>&1 | grep -E "^===|FAIL|✗|tests passed|CRASHED"; done
echo "##### ALL DONE"
