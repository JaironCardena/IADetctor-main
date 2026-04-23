import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

/**
 * Custom hook for Socket.IO connection with automatic cleanup.
 * Provides event listeners that re-connect if the component remounts.
 */
export function useSocket(events: Record<string, (...args: any[]) => void>) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(window.location.origin, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    for (const [event, handler] of Object.entries(events)) {
      socket.on(event, handler);
    }

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return socketRef;
}
