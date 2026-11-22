#!/bin/bash
REPO="https://$GITHUB_PERSONAL_ACCESS_TOKEN2@github.com/menoskar42-boop/bible.git"

echo "Creating fresh git history..."
git checkout --orphan fresh-start
git add -A
git commit -m "Initial commit - Bible Companion App"

echo "Pushing to GitHub..."
git push "$REPO" fresh-start:main --force

echo "Restoring main branch..."
git checkout main
git branch -D fresh-start 2>/dev/null || true

echo "Done!"
