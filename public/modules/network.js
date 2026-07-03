export class NetworkClient {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.handlers = {};
    this.connected = false;

    this.ws.addEventListener('open', () => { this.connected = true; this.handlers.open?.(); });
    this.ws.addEventListener('close', () => { this.connected = false; this.handlers.close?.(); });
    this.ws.addEventListener('error', () => {});
    this.ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      this.handlers[msg.type]?.(msg);
    });
  }

  on(type, fn) { this.handlers[type] = fn; }

  send(obj) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }
}
