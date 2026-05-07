import { useEffect, useRef, useState, useCallback } from "react";
import { io, type Socket } from "socket.io-client";

// Singleton socket shared across the entire app
let _socket: Socket | null = null;

function getSocket(): Socket {
  if (!_socket) {
    _socket = io(window.location.origin, {
      path: "/socket.io",
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      transports: ["websocket", "polling"],
    });
  }
  return _socket;
}

// Track which rooms we are currently subscribed to so we can re-join on reconnect
const _rooms = new Set<string>();

export type SocketEventHandler<T = unknown> = (data: T) => void;

export interface UseEventSocketReturn {
  connected: boolean;
  joinedRoom: boolean;
  /** Subscribe to a socket event. Returns an unsub function. */
  on: <T = unknown>(event: string, handler: SocketEventHandler<T>) => () => void;
  /** Emit a socket event */
  emit: (event: string, data?: unknown) => void;
}

/**
 * Connect to the Socket.IO server and join the room for `eventId`.
 * Returns `connected` state and `on`/`emit` helpers.
 */
export function useEventSocket(eventId: string | null | undefined): UseEventSocketReturn {
  const [connected, setConnected] = useState(false);
  const [joinedRoom, setJoinedRoom] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    const roomKey = eventId ? `event:${eventId}` : null;

    const joinRoom = () => {
      if (eventId) {
        socket.emit("join:event", eventId);
        _rooms.add(eventId);
        setJoinedRoom(true);
      }
    };

    const onConnect = () => {
      setConnected(true);
      // Re-join all rooms (including current one) on reconnect
      _rooms.forEach((id) => socket.emit("join:event", id));
      if (eventId) setJoinedRoom(true);
    };

    const onDisconnect = () => {
      setConnected(false);
      setJoinedRoom(false);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    if (socket.connected) {
      setConnected(true);
      joinRoom();
    } else {
      socket.connect();
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      if (eventId) {
        _rooms.delete(eventId);
        socket.emit("leave:event", eventId);
      }
      if (roomKey) setJoinedRoom(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const on = useCallback(<T = unknown>(event: string, handler: SocketEventHandler<T>) => {
    const socket = getSocket();
    socket.on(event, handler as (...args: unknown[]) => void);
    return () => socket.off(event, handler as (...args: unknown[]) => void);
  }, []);

  const emit = useCallback((event: string, data?: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  return { connected, joinedRoom, on, emit };
}
