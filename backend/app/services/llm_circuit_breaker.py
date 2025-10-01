"""
Circuit breaker for LLM calls with timeout and failure handling
"""

import asyncio
import time
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Callable, Dict, List, Optional
from collections import deque
import logging

logger = logging.getLogger(__name__)

class CircuitState(Enum):
    """Circuit breaker states"""
    CLOSED = "closed"        # Normal operation
    OPEN = "open"           # Failing, reject all calls
    HALF_OPEN = "half_open" # Testing recovery

class CircuitBreakerError(Exception):
    """Exception raised when circuit is open"""
    pass

class TimeoutError(Exception):
    """Exception raised when LLM call times out"""
    pass

class LLMCircuitBreaker:
    """
    Circuit breaker for LLM calls with automatic recovery
    """

    def __init__(
        self,
        failure_threshold: float = 0.5,      # 50% failure rate opens circuit
        timeout_seconds: float = 2.0,        # LLM timeout
        recovery_timeout: int = 30,          # Seconds before attempting recovery
        window_size: int = 20,               # Size of sliding window
        min_calls: int = 5,                  # Min calls before evaluating
        alert_callback: Optional[Callable] = None
    ):
        self.state = CircuitState.CLOSED
        self.failure_threshold = failure_threshold
        self.timeout = timeout_seconds
        self.recovery_timeout = recovery_timeout
        self.window_size = window_size
        self.min_calls = min_calls
        self.alert_callback = alert_callback

        # Sliding window for tracking failures
        self.call_history: deque = deque(maxlen=window_size)
        self.last_failure_time: Optional[datetime] = None
        self.consecutive_successes = 0
        self.state_changed_at = datetime.now()

        # Metrics
        self.total_calls = 0
        self.total_failures = 0
        self.total_timeouts = 0
        self.circuit_opens = 0

    async def call(
        self,
        func: Callable,
        *args,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Execute function with circuit breaker protection

        Args:
            func: Async function to call
            *args: Function arguments
            **kwargs: Function keyword arguments

        Returns:
            Dict with 'source' and 'data' keys
        """
        self.total_calls += 1

        # Check circuit state
        if self.state == CircuitState.OPEN:
            if self._should_attempt_reset():
                logger.info("Circuit breaker attempting recovery (HALF_OPEN)")
                self._transition_to(CircuitState.HALF_OPEN)
            else:
                logger.warning(f"Circuit breaker OPEN, rejecting call")
                return {
                    "source": "circuit_open",
                    "data": None,
                    "error": "LLM circuit breaker is open"
                }

        try:
            # Call with timeout
            start_time = time.time()
            result = await asyncio.wait_for(
                func(*args, **kwargs),
                timeout=self.timeout
            )
            elapsed = time.time() - start_time

            # Record success
            self._record_success(elapsed)

            return {
                "source": "llm",
                "data": result,
                "latency_ms": int(elapsed * 1000)
            }

        except asyncio.TimeoutError:
            self.total_timeouts += 1
            self._record_failure("timeout")
            logger.error(f"LLM call timeout after {self.timeout}s")

            return {
                "source": "timeout",
                "data": None,
                "error": f"LLM timeout after {self.timeout}s"
            }

        except Exception as e:
            self._record_failure(str(e))
            logger.error(f"LLM call failed: {e}")

            return {
                "source": "error",
                "data": None,
                "error": str(e)
            }

    def _record_success(self, latency: float):
        """Record successful call"""
        self.call_history.append({
            "success": True,
            "timestamp": datetime.now(),
            "latency": latency
        })

        if self.state == CircuitState.HALF_OPEN:
            self.consecutive_successes += 1
            if self.consecutive_successes >= 3:  # Need 3 successes to close
                logger.info("Circuit breaker recovering (CLOSED)")
                self._transition_to(CircuitState.CLOSED)
                self.consecutive_successes = 0

    def _record_failure(self, reason: str):
        """Record failed call and check if circuit should open"""
        self.total_failures += 1
        self.last_failure_time = datetime.now()

        self.call_history.append({
            "success": False,
            "timestamp": datetime.now(),
            "reason": reason
        })

        # Reset consecutive successes
        self.consecutive_successes = 0

        # Check if we should open circuit
        if self.state == CircuitState.HALF_OPEN:
            logger.warning("Circuit breaker tripping again (OPEN)")
            self._transition_to(CircuitState.OPEN)

        elif self.state == CircuitState.CLOSED:
            if len(self.call_history) >= self.min_calls:
                failure_rate = self._calculate_failure_rate()

                if failure_rate >= self.failure_threshold:
                    logger.error(
                        f"Circuit breaker opening: {failure_rate:.1%} failure rate"
                    )
                    self._transition_to(CircuitState.OPEN)
                    self.circuit_opens += 1

                    # Send alert
                    if self.alert_callback:
                        self.alert_callback({
                            "event": "circuit_open",
                            "failure_rate": failure_rate,
                            "reason": reason
                        })

    def _calculate_failure_rate(self) -> float:
        """Calculate failure rate in sliding window"""
        if not self.call_history:
            return 0.0

        failures = sum(1 for call in self.call_history if not call["success"])
        return failures / len(self.call_history)

    def _should_attempt_reset(self) -> bool:
        """Check if enough time has passed to attempt recovery"""
        if not self.last_failure_time:
            return True

        time_since_failure = datetime.now() - self.last_failure_time
        return time_since_failure > timedelta(seconds=self.recovery_timeout)

    def _transition_to(self, new_state: CircuitState):
        """Transition to new state"""
        old_state = self.state
        self.state = new_state
        self.state_changed_at = datetime.now()

        logger.info(f"Circuit breaker state change: {old_state.value} -> {new_state.value}")

    def get_status(self) -> Dict:
        """Get current circuit breaker status"""
        return {
            "state": self.state.value,
            "failure_rate": self._calculate_failure_rate(),
            "total_calls": self.total_calls,
            "total_failures": self.total_failures,
            "total_timeouts": self.total_timeouts,
            "circuit_opens": self.circuit_opens,
            "state_duration_seconds": (
                datetime.now() - self.state_changed_at
            ).total_seconds(),
            "window_size": len(self.call_history)
        }

    def reset(self):
        """Manually reset circuit breaker"""
        logger.info("Circuit breaker manually reset")
        self.state = CircuitState.CLOSED
        self.call_history.clear()
        self.consecutive_successes = 0
        self.state_changed_at = datetime.now()

    def force_open(self):
        """Manually open circuit (for testing/emergency)"""
        logger.warning("Circuit breaker manually opened")
        self._transition_to(CircuitState.OPEN)

class CircuitBreakerManager:
    """
    Manages multiple circuit breakers for different services
    """

    def __init__(self):
        self.breakers: Dict[str, LLMCircuitBreaker] = {}

    def get_or_create(
        self,
        name: str,
        **config
    ) -> LLMCircuitBreaker:
        """Get existing or create new circuit breaker"""
        if name not in self.breakers:
            self.breakers[name] = LLMCircuitBreaker(**config)

        return self.breakers[name]

    def get_all_status(self) -> Dict[str, Dict]:
        """Get status of all circuit breakers"""
        return {
            name: breaker.get_status()
            for name, breaker in self.breakers.items()
        }

    def reset_all(self):
        """Reset all circuit breakers"""
        for breaker in self.breakers.values():
            breaker.reset()

# Global circuit breaker manager
circuit_manager = CircuitBreakerManager()

# Convenience function for getting circuit breaker
def get_circuit_breaker(
    name: str = "default",
    **config
) -> LLMCircuitBreaker:
    """
    Get or create a circuit breaker

    Args:
        name: Circuit breaker name
        **config: Configuration overrides

    Returns:
        LLMCircuitBreaker instance
    """
    defaults = {
        "failure_threshold": 0.5,
        "timeout_seconds": 2.0,
        "recovery_timeout": 30,
        "window_size": 20,
        "min_calls": 5
    }
    defaults.update(config)

    return circuit_manager.get_or_create(name, **defaults)