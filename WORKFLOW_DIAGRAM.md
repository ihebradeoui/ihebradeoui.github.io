# GitHub Actions Workflow Diagram

## Deployment Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Developer pushes to any branch (main, feature-*, etc.)     │
│  (Excludes: gh-pages)                                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  GitHub Actions Workflow Triggered                          │
│  File: .github/workflows/deploy.yml                         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 1: Checkout Repository                                │
│  Action: actions/checkout@v4                                │
│  - Clones the repository code                               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 2: Setup Node.js Environment                          │
│  Action: actions/setup-node@v4                              │
│  - Installs Node.js 14                                      │
│  - Configures npm cache for faster builds                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 3: Install Dependencies                               │
│  Command: npm ci                                            │
│  - Clean install from package-lock.json                     │
│  - Ensures consistent dependencies                          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 4: Build Angular Application                          │
│  Command: npm run build -- --configuration production \     │
│           --base-href https://ihebradeoui.github.io/        │
│  - Compiles TypeScript to JavaScript                        │
│  - Bundles and minifies code                                │
│  - Output: dist/sky-diver/                                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 5: Deploy to GitHub Pages                             │
│  Action: peaceiris/actions-gh-pages@v3                      │
│  - Takes built files from dist/sky-diver/                   │
│  - Pushes to gh-pages branch                                │
│  - Uses orphan commits (clean history)                      │
│  - Commit message: "Deploy to GitHub Pages [skip ci]"       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  GitHub Pages Updates                                        │
│  - Detects new commit on gh-pages branch                    │
│  - Publishes site to https://ihebradeoui.github.io/         │
│  - Usually takes 30-60 seconds to go live                   │
└─────────────────────────────────────────────────────────────┘
```

## Key Features

### 🔄 Automatic Trigger
- **Any push** to any branch triggers deployment
- **Except gh-pages** to prevent infinite loops
- **[skip ci]** in commit message prevents re-triggering

### 🔒 Security
- Uses built-in `GITHUB_TOKEN` (automatic, secure)
- No manual token management required
- Permissions: `contents: write` (minimal necessary)

### ⚡ Performance
- **npm cache** - Reuses dependencies between runs
- **Parallel steps** where possible
- **Typical runtime**: 2-3 minutes

### 📊 Monitoring
- View runs: https://github.com/{owner}/{repo}/actions
- Email notifications on failure
- Detailed logs for debugging

## Workflow Configuration

### Trigger Configuration
```yaml
on:
  push:
    branches-ignore:
      - gh-pages
```
This means:
- ✅ Push to `main` → deploys
- ✅ Push to `feature/new-feature` → deploys
- ✅ Push to `develop` → deploys
- ❌ Push to `gh-pages` → does NOT deploy (prevents loop)

### Permissions
```yaml
permissions:
  contents: write
```
Allows the workflow to:
- Create commits on gh-pages branch
- Push to the repository

### Deploy Step Details
```yaml
- name: Deploy to GitHub Pages
  uses: peaceiris/actions-gh-pages@v3
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    publish_dir: ./dist/sky-diver
    force_orphan: true
    user_name: 'github-actions[bot]'
    user_email: 'github-actions[bot]@users.noreply.github.com'
    commit_message: 'Deploy to GitHub Pages [skip ci]'
```

- `github_token`: Automatic GitHub authentication
- `publish_dir`: Directory containing built files
- `force_orphan`: Creates clean commits (no history pollution)
- `user_name/email`: Attributes commits to GitHub Actions bot
- `[skip ci]`: Prevents deployment from triggering itself

## What to Expect After Merging

1. **First deployment**: 2-3 minutes after merge
2. **Site live**: https://ihebradeoui.github.io/
3. **Future updates**: Automatic on every push
4. **No manual steps**: Ever again! 🎉

## Troubleshooting

### If deployment fails:

1. **Go to Actions tab**: https://github.com/{owner}/{repo}/actions
2. **Click on failed run**: See detailed logs
3. **Common issues**:
   - Build errors: Check TypeScript compilation
   - Permission errors: Verify repository settings
   - Network issues: GitHub will retry automatically

### Repository Settings

Ensure GitHub Pages is configured:
- **Settings** → **Pages**
- **Source**: Deploy from a branch
- **Branch**: gh-pages / (root)

## Summary

This workflow automates the entire deployment process, from code push to live site update. No manual intervention, tokens, or local setup required. Just push your code and let GitHub Actions handle the rest!
