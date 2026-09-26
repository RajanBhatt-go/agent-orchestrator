import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useStore } from '../stores/useStore';

export function useWorkflowSocket() {
  const socketRef = useRef<Socket | null>(null);
  const addExecutionEvent = useStore((s) => s.addExecutionEvent);

  useEffect(() => {
    const socket = io('/', {
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('[WS] Connected:', socket.id);
    });

    socket.on('execution:event', (event) => {
      addExecutionEvent(event);
    });

    socket.on('disconnect', () => {
      console.log('[WS] Disconnected');
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [addExecutionEvent]);

  const subscribeToRun = (runId: string) => {
    socketRef.current?.emit('subscribe:run', runId);
  };

  const unsubscribeFromRun = (runId: string) => {
    socketRef.current?.emit('unsubscribe:run', runId);
  };

  return { subscribeToRun, unsubscribeFromRun, socket: socketRef };
}