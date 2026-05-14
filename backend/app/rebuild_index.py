from __future__ import annotations

from .indexer import rebuild_index


if __name__ == "__main__":
    result = rebuild_index()
    print(f"Index rebuild completed: documents={result['documents']} images={result['images']}")
