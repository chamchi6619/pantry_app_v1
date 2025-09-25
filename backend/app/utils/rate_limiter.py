"""Simple in-memory rate limiter."""
import time
from collections import defaultdict
from typing import Dict, List


class RateLimiter:
    """Token bucket rate limiter."""

    def __init__(self, requests_per_minute: int = 300):
        self.requests_per_minute = requests_per_minute
        self.window_seconds = 60
        self.requests: Dict[str, List[float]] = defaultdict(list)

    def allow(self, client_id: str) -> bool:
        """Check if request is allowed for client."""
        now = time.time()
        window_start = now - self.window_seconds

        # Clean old requests
        self.requests[client_id] = [
            req_time for req_time in self.requests[client_id]
            if req_time > window_start
        ]

        # Check if under limit
        if len(self.requests[client_id]) >= self.requests_per_minute:
            return False

        # Add current request
        self.requests[client_id].append(now)
        return True

    def reset(self, client_id: str):
        """Reset rate limit for a client."""
        if client_id in self.requests:
            del self.requests[client_id]