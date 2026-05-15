# External Search

The agent has two external search layers:

- Wiki search: `prts.wiki` and `arknights.wiki.gg` through MediaWiki API.
- Web search: Brave Search API.

Wiki search is enabled by default because it is targeted and does not require a key.

Brave search is disabled by default because it can spend API quota. Enable it in `.env`:

```env
WEB_SEARCH_ENABLED=true
WEB_SEARCH_PROVIDER=brave
BRAVE_SEARCH_API_KEY=your_key_here
WEB_SEARCH_MAX_RESULTS=5
```

Endpoints:

- `GET /api/web/wiki?q=Amiya&limit=6`
- `GET /api/web/brave?q=Arknights%20news&limit=5`

Chat request flags:

- `use_wiki_search`: include wiki context in the model prompt.
- `use_web_search`: include Brave web results in the model prompt.

The backend caches external search payloads in SQLite:

- wiki cache TTL: 24 hours
- Brave cache TTL: 3 hours
