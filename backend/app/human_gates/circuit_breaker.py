import time
from enum import Enum
from dataclasses import dataclass
from typing import Callable, Any, Optional

class CircuitState(Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"

@dataclass
class CircuitMetrics:
    total_calls: int
    failures: int
    success_rate: float
    state: str
    last_failure: Optional[float]

class CircuitBreaker:
    def __init__(self, failure_threshold: float = 0.05, window_size: int = 60, recovery_timeout: int = 30):
        self.failure_threshold = failure_threshold
        self.window_size = window_size
        self.recovery_timeout = recovery_timeout
        self.state = CircuitState.CLOSED
        self.calls = []
        self.failures = []
        self.last_failure_time = None

    def execute(self, func: Callable, *args, **kwargs) -> Any:
        self._check_state()
        if self.state == CircuitState.OPEN:
            raise Exception("Circuit breaker is OPEN")
        
        now = time.time()
        self.calls.append(now)
        try:
            result = func(*args, **kwargs)
            if self.state == CircuitState.HALF_OPEN:
                self.reset()
            return result
        except Exception as e:
            self.failures.append(now)
            self.last_failure_time = now
            self._evaluate_state()
            raise e

    def _check_state(self):
        if self.state == CircuitState.OPEN:
            if time.time() - self.last_failure_time > self.recovery_timeout:
                self.state = CircuitState.HALF_OPEN
        self._cleanup_windows()

    def _cleanup_windows(self):
        now = time.time()
        self.calls = [t for t in self.calls if now - t <= self.window_size]
        self.failures = [t for t in self.failures if now - t <= self.window_size]

    def _evaluate_state(self):
        self._cleanup_windows()
        if len(self.calls) > 10:
            error_rate = len(self.failures) / len(self.calls)
            if error_rate > self.failure_threshold:
                self.state = CircuitState.OPEN

    def get_state(self) -> CircuitState:
        self._check_state()
        return self.state

    def get_metrics(self) -> CircuitMetrics:
        self._cleanup_windows()
        total = len(self.calls)
        fails = len(self.failures)
        success_rate = (total - fails) / total if total > 0 else 1.0
        return CircuitMetrics(
            total_calls=total,
            failures=fails,
            success_rate=success_rate,
            state=self.state.value,
            last_failure=self.last_failure_time
        )

    def force_open(self):
        self.state = CircuitState.OPEN
        self.last_failure_time = time.time()

    def reset(self):
        self.state = CircuitState.CLOSED
        self.calls = []
        self.failures = []
        self.last_failure_time = None
