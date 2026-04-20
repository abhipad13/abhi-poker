const RAW_API_BASE = (import.meta as any).env.VITE_API_BASE ?? "";
const API_BASE = String(RAW_API_BASE).replace(/\/$/, "");
// If API_BASE is empty, use relative paths so the browser uses same-origin (ideal for Spring Boot static hosting)
const WS_BASE = API_BASE ? API_BASE.replace(/^http/, 'ws') : "";

export async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function httpText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(`${API_BASE}${url}`, init);
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  return text;
}

// WebSocket support for real-time updates
export class GameWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(private gameId: string) {}

  connect(onSnapshot: (snapshot: any) => void, onError?: (error: Event) => void) {
    try {
      // If WS_BASE is empty, relative path resolves to current origin with proper ws/wss scheme
      this.ws = new WebSocket(`${WS_BASE}/api/game/${this.gameId}/snapshot`);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected to game snapshot');
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'snapshot') {
            onSnapshot(data.snapshot);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          setTimeout(() => this.connect(onSnapshot, onError), this.reconnectDelay * this.reconnectAttempts);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (onError) onError(error);
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}
