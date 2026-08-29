# Port from yah-forge-direct → yah-forge

Poe-adapted sync from `Modzter3/yah-forge-direct` (main).

## Poe adaptations

- `poe-polyfill.js` → `/api/poe` (not OpenRouter)
- No `openrouter-models.js`
- Defaults use Poe bot names (`Gemini-3.6-Flash`)
- `api/poe.js` unchanged — needs `POE_API_KEY` on Vercel

## Push to yah-forge (from your account)

```bash
git clone https://github.com/Modzter3/yah-forge.git
cd yah-forge
git checkout -b cursor/port-forge-direct-features-34e9
cp -r /path/to/yah-forge-port/public/* public/
cp /path/to/yah-forge-port/vercel.json .
cp -r /path/to/yah-forge-port/scripts/* scripts/
git add -A && git commit -m "Port yah-forge-direct features (Poe-adapted)"
git push -u origin cursor/port-forge-direct-features-34e9
```

See commit `c82ec18` in local clone for full diff.
