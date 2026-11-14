"""Small counter/once-only store shared by all workers when SHARED_STORE_URL (Redis) is set.

Used for rate limits and DPoP proof replay protection. If Redis is not configured, or becomes
unreachable, it degrades to a per-process in-memory store and logs a warning - it never takes the
API down. With several workers and no Redis, limits are per worker (documented in .env.example).
"""
import logging
import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional

from .config import settings

logger = logging.getLogger("shared_store")


class _MemoryStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)
        self._seen: Dict[str, float] = {}

    def allow(self, key: str, limit: int, window: int) -> bool:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > window:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(now)
            return True

    def once(self, key: str, ttl: int) -> bool:
        now = time.monotonic()
        with self._lock:
            if len(self._seen) > 10_000:
                self._seen = {k: v for k, v in self._seen.items() if v > now}
            if self._seen.get(key, 0) > now:
                return False
            self._seen[key] = now + ttl
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
            self._seen.clear()


class _RedisStore:
    def __init__(self, client) -> None:
        self._r = client

    def allow(self, key: str, limit: int, window: int) -> bool:
        k = f"rl:{key}"
        pipe = self._r.pipeline()
        pipe.incr(k)
        pipe.expire(k, window, nx=True)
        count = pipe.execute()[0]
        return int(count) <= limit

    def once(self, key: str, ttl: int) -> bool:
        return bool(self._r.set(f"once:{key}", 1, nx=True, ex=ttl))

    def reset(self) -> None:
        for k in self._r.scan_iter("rl:*"):
            self._r.delete(k)
        for k in self._r.scan_iter("once:*"):
            self._r.delete(k)


class SharedStore:
    def __init__(self, redis_client=None) -> None:
        self._memory = _MemoryStore()
        self._redis: Optional[_RedisStore] = _RedisStore(redis_client) if redis_client is not None else None
        self._warned = False

    @classmethod
    def from_settings(cls) -> "SharedStore":
        url = settings.SHARED_STORE_URL
        if not url:
            if not settings.DEBUG:
                # Config already refuses to boot without a URL in production; this guards
                # direct constructions and keeps the posture if that validator ever moves.
                raise RuntimeError(
                    "SHARED_STORE_URL (Redis) is required when DEBUG is false: rate limits and "
                    "replay protection must be shared across workers."
                )
            return cls()
        try:
            import redis

            client = redis.Redis.from_url(url, socket_timeout=0.5, socket_connect_timeout=0.5)
            if not settings.DEBUG:
                client.ping()  # production boots only against a reachable store
            return cls(client)
        except Exception as exc:  # noqa: BLE001
            if not settings.DEBUG:
                raise RuntimeError(f"SHARED_STORE_URL is unreachable in production: {exc}") from exc
            logger.warning("SHARED_STORE_URL unusable (%s); using per-process memory.", exc)
            return cls()

    def _fallback(self, exc: Exception) -> None:
        if not self._warned:
            logger.warning("Shared store unavailable (%s); degrading to per-process memory.", exc)
            self._warned = True

    def allow(self, key: str, limit: int, window: int = 60) -> bool:
        if self._redis is not None:
            try:
                return self._redis.allow(key, limit, window)
            except Exception as exc:  # noqa: BLE001
                self._fallback(exc)
        return self._memory.allow(key, limit, window)

    def once(self, key: str, ttl: int) -> bool:
        """True the first time `key` is seen within `ttl` seconds, False on replays."""
        if self._redis is not None:
            try:
                return self._redis.once(key, ttl)
            except Exception as exc:  # noqa: BLE001
                self._fallback(exc)
        return self._memory.once(key, ttl)

    def reset(self) -> None:
        self._memory.reset()
        if self._redis is not None:
            try:
                self._redis.reset()
            except Exception:  # noqa: BLE001
                pass


_store: Optional[SharedStore] = None
_store_lock = threading.Lock()


def get_store() -> SharedStore:
    global _store
    if _store is None:
        with _store_lock:
            if _store is None:
                _store = SharedStore.from_settings()
    return _store


def set_store(store: Optional[SharedStore]) -> None:
    global _store
    _store = store
