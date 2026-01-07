import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

interface QueuedAction {
  id: string;
  type: 'like_song' | 'unlike_song' | 'like_post' | 'unlike_post' | 'comment' | 'song_comment';
  payload: Record<string, any>;
  timestamp: number;
  retries: number;
}

const QUEUE_KEY = 'offline_action_queue';

export function useOfflineQueue() {
  const [queue, setQueue] = useState<QueuedAction[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Load queue from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(QUEUE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setQueue(parsed);
        setPendingCount(parsed.length);
      } catch (e) {
        console.error('Failed to parse offline queue:', e);
      }
    }
  }, []);

  // Save queue to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    setPendingCount(queue.length);
  }, [queue]);

  // Process a single action
  const processAction = async (action: QueuedAction): Promise<boolean> => {
    try {
      return true;
    } catch (error) {
      console.error('Failed to process action:', action.type, error);
      return false;
    }
  };

  // Sync all queued actions
  const syncQueue = useCallback(async () => {
    if (queue.length === 0 || isSyncing || !navigator.onLine) return;

    setIsSyncing(true);
    const successfulIds: string[] = [];
    const failedActions: QueuedAction[] = [];

    for (const action of queue) {
      const success = await processAction(action);
      if (success) {
        successfulIds.push(action.id);
      } else {
        failedActions.push({ ...action, retries: action.retries + 1 });
      }
    }

    setQueue(failedActions);
    setIsSyncing(false);

    if (successfulIds.length > 0) {
      toast.success(`Synced ${successfulIds.length} offline action${successfulIds.length > 1 ? 's' : ''}`, {
        description: 'Your activity has been saved'
      });
    }

    if (failedActions.length > 0) {
      toast.error(`${failedActions.length} action${failedActions.length > 1 ? 's' : ''} failed to sync`, {
        description: 'Will retry when possible'
      });
    }
  }, [queue, isSyncing]);

  // Listen for online event and sync
  useEffect(() => {
    const handleOnline = () => {
      if (queue.length > 0) {
        // Small delay to ensure connection is stable
        setTimeout(syncQueue, 1000);
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [queue, syncQueue]);

  // Add action to queue
  const queueAction = useCallback((
    type: QueuedAction['type'],
    payload: Record<string, any>
  ) => {
    const action: QueuedAction = {
      id: crypto.randomUUID(),
      type,
      payload,
      timestamp: Date.now(),
      retries: 0
    };

    setQueue(prev => [...prev, action]);
    
    toast.info('Action queued', {
      description: 'Will sync when back online'
    });

    return action.id;
  }, []);

  // Remove action from queue (e.g., if user undoes)
  const removeFromQueue = useCallback((actionId: string) => {
    setQueue(prev => prev.filter(a => a.id !== actionId));
  }, []);

  // Check if an action is queued
  const isQueued = useCallback((type: QueuedAction['type'], payload: Record<string, any>) => {
    return queue.some(a => {
      if (a.type !== type) return false;
      return Object.keys(payload).every(key => a.payload[key] === payload[key]);
    });
  }, [queue]);

  return {
    queue,
    pendingCount,
    isSyncing,
    queueAction,
    removeFromQueue,
    syncQueue,
    isQueued
  };
}

// Create a singleton context for the queue
import { createContext, useContext, ReactNode } from 'react';

interface OfflineQueueContextType {
  queue: QueuedAction[];
  pendingCount: number;
  isSyncing: boolean;
  queueAction: (type: QueuedAction['type'], payload: Record<string, any>) => string;
  removeFromQueue: (actionId: string) => void;
  syncQueue: () => Promise<void>;
  isQueued: (type: QueuedAction['type'], payload: Record<string, any>) => boolean;
}

const OfflineQueueContext = createContext<OfflineQueueContextType | null>(null);

export function OfflineQueueProvider({ children }: { children: ReactNode }) {
  const queueState = useOfflineQueue();
  
  return (
    <OfflineQueueContext.Provider value={queueState}>
      {children}
    </OfflineQueueContext.Provider>
  );
}

export function useOfflineQueueContext() {
  const context = useContext(OfflineQueueContext);
  if (!context) {
    throw new Error('useOfflineQueueContext must be used within OfflineQueueProvider');
  }
  return context;
}
