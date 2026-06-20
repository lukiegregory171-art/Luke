/**
 * A fake {@link Connection} for a server-side bot. It implements the same
 * interface as a real WebSocket connection so a Room can't tell the difference,
 * but instead of writing to a socket it hands each server message to the bot's
 * brain ({@link ServerBot}). The bot is still a normal authoritative player: it
 * sends inputs the Room validates like any other — it cannot fake hits/position.
 */

import type { ServerMessage } from '@liquidate/shared';
import type { Connection } from './connection';

export function makeBotConnection(
  id: string,
  onSend: (msg: ServerMessage) => void,
): Connection {
  let open = true;
  return {
    id,
    send(msg) {
      if (open) onSend(msg);
    },
    isOpen() {
      return open;
    },
    close() {
      open = false;
    },
  };
}
