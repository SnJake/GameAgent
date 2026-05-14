# Updating Data

Use this when the user asks to update Arknights data.

## Safe Update Order

1. Pull only known data repositories:
   - `ArknightsGamedata`
   - `ArknightsGameData_Zh_CN`
   - `ArknightsStoryJson`
   - `Arknight-Images`
2. Use fast-forward only:
   - `git -C <repo> pull --ff-only`
3. Rebuild the SQLite index:
   - `rebuild_index.bat`

## UI Route

The backend exposes:

- `POST /api/admin/git-pull?repo=ArknightsGamedata`
- `POST /api/index/rebuild`

The API intentionally accepts only whitelisted repository names.
