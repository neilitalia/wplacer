class PaintEventListener {
  constructor() {
    this.eventSource = null;
    this.handlers = new Map();
    this.connect();
  }

  connect() {
    this.eventSource = new EventSource('/events');

    this.eventSource.onopen = () => {
      console.log('Connected to paint events stream');
    };

    this.eventSource.onerror = (error) => {
      console.error('Paint events connection error:', error);
      this.eventSource.close();
      // Attempt to reconnect after 5 seconds
      setTimeout(() => this.connect(), 5000);
    };

    this.eventSource.addEventListener('paint', (event) => {
      const data = JSON.parse(event.data);
      const handlers = this.handlers.get('paint') || [];
      handlers.forEach(handler => handler(data));
    });
  }

  on(type, handler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type).add(handler);
  }

  off(type, handler) {
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}

// Create global instance
window.paintEvents = new PaintEventListener();