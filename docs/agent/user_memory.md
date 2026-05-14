# User Memory

Memory is intentionally small. Store only stable preferences, for example:

- preferred answer language
- preferred comparison format
- favorite operators for image/search convenience

Do not store:

- secrets
- API keys
- large notes
- game facts that belong in the index

Memory is stored in the SQLite `memory` table.
