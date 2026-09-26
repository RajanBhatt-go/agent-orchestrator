import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { onWorkflowEvent, offWorkflowEvent } from '../queue/index.js';
import type { ExecutionEvent } from '../agents/executor.js';

let io: SocketIOServer;

export function setupWebSocket(httpServer: HTTPServer) {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);

    // Subscribe to a workflow run's events
    socket.on('subscribe:run', (runId: string) => {
      console.log(`[WS] ${socket.id} subscribing to run ${runId}`);
      socket.join(`run:${runId}`);

      // Register event handler
      onWorkflowEvent(runId, (event: ExecutionEvent) => {
        socket.emit('execution:event', event);
      });

      socket.emit('subscribed', { runId });
    });

    // Unsubscribe
    socket.on('unsubscribe:run', (runId: string) => {
      console.log(`[WS] ${socket.id} unsubscribing from run ${runId}`);
      socket.leave(`run:${runId}`);
      offWorkflowEvent(runId);
    });

    // Subscribe to workflow runs for a specific workflow
    socket.on('subscribe:workflow', (workflowId: string) => {
      console.log(`[WS] ${socket.id} subscribing to workflow ${workflowId}`);
      socket.join(`workflow:${workflowId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[WS] Client disconnected: ${socket.id}`);
    });
  });

  console.log('[WS] WebSocket server initialized');
  return io;
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error('WebSocket server not initialized');
  return io;
}

// ─── Broadcast to all listeners of a run ────────────────
export function broadcastRunEvent(runId: string, event: ExecutionEvent) {
  if (io) {
    io.to(`run:${runId}`).emit('execution:event', event);
  }
}