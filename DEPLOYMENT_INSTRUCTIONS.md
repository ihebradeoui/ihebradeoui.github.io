# Deployment Instructions

## Current Status
✅ The Angular application has been successfully built with production configuration.
✅ Built files are located in `dist/sky-diver/` directory.
✅ Build includes the leaderboard feature implementation.

## Build Details
- **Build Command Used**: `ng build --configuration production --base-href https://ihebradeoui.github.io/`
- **Output Directory**: `dist/sky-diver/`
- **Build Size**: ~4.55 MB total
- **Main Bundle**: `main.e9e5b39e762fe6da.js` (4.38 MB)
- **Build Hash**: dcec4b07754445a0

## Deployment to GitHub Pages

### Option 1: Using angular-cli-ghpages (ngh) - Recommended
This is the method specified in the README.md file.

```bash
# Install ngh globally (if not already installed)
npm install -g angular-cli-ghpages

# Deploy to gh-pages branch
ngh --dir=dist/sky-diver --branch=gh-pages
```

**Note**: This requires a GitHub personal access token with repo permissions. When prompted:
1. Enter a name for your token (e.g., "NGH Deployment")
2. The tool will guide you through creating a token if needed
3. The token will be used to push to the gh-pages branch

### Option 2: Manual Git Commands
If you prefer manual deployment or the automated tool isn't available:

```bash
# Navigate to the built files
cd dist/sky-diver

# Initialize git (if not already a repo)
git init
git add .
git commit -m "Deploy leaderboard feature update"

# Add remote (use your repository URL)
git remote add origin https://github.com/ihebradeoui/ihebradeoui.github.io.git

# Force push to gh-pages branch
git push -f origin HEAD:gh-pages

# Return to main project directory
cd ../..
```

### Option 3: Using GitHub Actions (Automated CI/CD)
For automated deployments, consider setting up a GitHub Actions workflow. Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '14'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Build
      run: npm run build -- --configuration production --base-href https://ihebradeoui.github.io/
      
    - name: Deploy to GitHub Pages
      uses: peaceiris/actions-gh-pages@v3
      with:
        github_token: ${{ secrets.GITHUB_TOKEN }}
        publish_dir: ./dist/sky-diver
```

## Verification After Deployment
After deploying, verify the changes at:
- **Main Site**: https://ihebradeoui.github.io/
- **Planets Page**: https://ihebradeoui.github.io/planets

Check that:
1. The leaderboard toggle button (🏆) appears in the top right
2. Clicking the button opens/closes the leaderboard panel
3. The panel slides smoothly from the right
4. The styling matches the space theme
5. Empty state message displays when no planets are claimed

## Current PR Status
The leaderboard feature has been implemented and committed to the `copilot/add-leaderboard-for-planets` branch. The production build is ready and includes:

- ✅ Retractable leaderboard panel
- ✅ Trophy toggle button with animations
- ✅ Timestamp tracking for planet ownership
- ✅ Days-owned calculation and display
- ✅ Top 3 special styling (gold, silver, bronze)
- ✅ Responsive design
- ✅ Code review feedback addressed
- ✅ Production build completed

## Next Steps
1. Merge the PR to the main branch
2. Deploy the built files to gh-pages branch using one of the methods above
3. Verify the deployment on the live site
4. Monitor for any issues

## Troubleshooting

### Issue: "ngh requires a token"
**Solution**: You need to create a GitHub personal access token:
1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate new token with 'repo' scope
3. Copy the token and provide it when ngh prompts

### Issue: "Permission denied" when pushing
**Solution**: Ensure you have write access to the repository and use appropriate authentication (HTTPS with token or SSH key).

### Issue: "Cannot read files after deployment"
**Solution**: Check that the base-href is set correctly and matches your GitHub Pages URL.

## Contact
For deployment assistance or issues with the leaderboard feature, refer to the implementation in:
- `src/app/planets/planet-scene.ts` (TypeScript logic)
- `src/app/planets/planets.component.html` (HTML structure)
- `src/app/planets/planets.component.scss` (Styling)
- `LEADERBOARD_FEATURE.md` (Feature documentation)
