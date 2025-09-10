/**
 * Simple circuit breaker pattern for Story feature
 * Prevents cascade failures when LLM services are down
 */

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half-open';
}

class CircuitBreaker {
  private state: CircuitBreakerState = {
    failures: 0,
    lastFailureTime: 0,
    state: 'closed'
  };

  constructor(
    private failureThreshold: number = 3,
    private resetTimeoutMs: number = 60000 // 1 minute
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state.state === 'open') {
      if (Date.now() - this.state.lastFailureTime > this.resetTimeoutMs) {
        this.state.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is OPEN - service temporarily unavailable');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.state.failures = 0;
    this.state.state = 'closed';
  }

  private onFailure() {
    this.state.failures++;
    this.state.lastFailureTime = Date.now();
    
    if (this.state.failures >= this.failureThreshold) {
      this.state.state = 'open';
    }
  }

  getState() {
    return { ...this.state };
  }

  reset() {
    this.state = {
      failures: 0,
      lastFailureTime: 0,
      state: 'closed'
    };
  }
}

// Global circuit breakers for Story APIs
export const storyCircuitBreakers = {
  chat: new CircuitBreaker(3, 60000),
  create: new CircuitBreaker(3, 60000), 
  update: new CircuitBreaker(3, 60000),
  quickRun: new CircuitBreaker(2, 30000), // More sensitive for quick runs
} as const;

export { CircuitBreaker };
