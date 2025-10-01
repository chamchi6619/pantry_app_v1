import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SYNC_MODES } from '../config/syncModes';

export interface PresenceUser {
  userId: string;
  username?: string;
  lastSeen: number;
  isActive: boolean;
}

interface PresenceState {
  [key: string]: PresenceUser;
}

type PresenceCallback = (users: PresenceUser[]) => void;

class PresenceService {
  private channels = new Map<string, RealtimeChannel>();
  private activeUsers = new Map<string, Set<string>>(); // channelId -> Set<userId>
  private callbacks = new Map<string, Set<PresenceCallback>>();
  private heartbeatIntervals = new Map<string, NodeJS.Timeout>();
  private userId: string | null = null;
  private username: string | null = null;

  /**
   * Initialize presence service with user info
   */
  async initialize(userId: string, username?: string) {
    this.userId = userId;
    this.username = username || 'User';
  }

  /**
   * Join a presence channel (e.g., shopping list)
   */
  async joinChannel(channelId: string): Promise<number> {
    if (!this.userId) {
      console.error('Presence service not initialized');
      return 0;
    }

    // Clean up existing channel if any
    if (this.channels.has(channelId)) {
      await this.leaveChannel(channelId);
    }

    // Create new channel
    const channel = supabase.channel(`presence:${channelId}`, {
      config: {
        presence: {
          key: this.userId,
        },
      },
    });

    // Track presence state
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState() as PresenceState;
      this.handlePresenceSync(channelId, state);
    });

    channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      // Presence join event - disabled logging to reduce noise
      const state = channel.presenceState() as PresenceState;
      this.handlePresenceSync(channelId, state);
    });

    channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      // Presence leave event - disabled logging to reduce noise
      const state = channel.presenceState() as PresenceState;
      this.handlePresenceSync(channelId, state);
    });

    // Subscribe and track our presence
    await channel.subscribe();

    const userPresence: PresenceUser = {
      userId: this.userId,
      username: this.username,
      lastSeen: Date.now(),
      isActive: true,
    };

    await channel.track(userPresence);

    // Set up heartbeat to maintain presence
    const heartbeat = setInterval(async () => {
      await channel.track({
        ...userPresence,
        lastSeen: Date.now(),
      });
    }, SYNC_MODES.PRESENCE_CHECK_INTERVAL_MS);

    this.channels.set(channelId, channel);
    this.heartbeatIntervals.set(channelId, heartbeat);

    // Return current active users count
    return this.getActiveUsersCount(channelId);
  }

  /**
   * Leave a presence channel
   */
  async leaveChannel(channelId: string) {
    const channel = this.channels.get(channelId);
    if (channel) {
      await channel.untrack();
      await channel.unsubscribe();
      this.channels.delete(channelId);
    }

    const heartbeat = this.heartbeatIntervals.get(channelId);
    if (heartbeat) {
      clearInterval(heartbeat);
      this.heartbeatIntervals.delete(channelId);
    }

    this.activeUsers.delete(channelId);
    this.callbacks.delete(channelId);
  }

  /**
   * Handle presence sync events
   */
  private handlePresenceSync(channelId: string, state: PresenceState) {
    const now = Date.now();
    const activeUserIds = new Set<string>();
    const activeUsersList: PresenceUser[] = [];

    // Filter active users (seen within timeout period)
    Object.entries(state).forEach(([key, presences]) => {
      // presences might be an array, get the first/latest
      const presence = Array.isArray(presences) ? presences[0] : presences;

      if (presence && presence.lastSeen) {
        const timeSinceLastSeen = now - presence.lastSeen;

        if (timeSinceLastSeen < SYNC_MODES.PRESENCE_TIMEOUT_MS) {
          activeUserIds.add(presence.userId || key);
          activeUsersList.push({
            ...presence,
            isActive: true,
          });
        }
      }
    });

    this.activeUsers.set(channelId, activeUserIds);

    // Notify callbacks
    const channelCallbacks = this.callbacks.get(channelId);
    if (channelCallbacks) {
      channelCallbacks.forEach(callback => callback(activeUsersList));
    }
  }

  /**
   * Subscribe to presence changes
   */
  onPresenceChange(channelId: string, callback: PresenceCallback): () => void {
    if (!this.callbacks.has(channelId)) {
      this.callbacks.set(channelId, new Set());
    }

    this.callbacks.get(channelId)!.add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.callbacks.get(channelId);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }

  /**
   * Get count of active users in a channel
   */
  getActiveUsersCount(channelId: string): number {
    const users = this.activeUsers.get(channelId);
    return users ? users.size : 0;
  }

  /**
   * Get list of active users in a channel
   */
  getActiveUsers(channelId: string): string[] {
    const users = this.activeUsers.get(channelId);
    return users ? Array.from(users) : [];
  }

  /**
   * Check if multiple users are active (for smart sync decisions)
   */
  isCoPresent(channelId: string): boolean {
    return this.getActiveUsersCount(channelId) >= SYNC_MODES.MIN_USERS_FOR_REALTIME;
  }

  /**
   * Update user activity status
   */
  async updateActivity(channelId: string, isActive: boolean) {
    const channel = this.channels.get(channelId);
    if (channel && this.userId) {
      await channel.track({
        userId: this.userId,
        username: this.username,
        lastSeen: Date.now(),
        isActive,
      });
    }
  }

  /**
   * Clean up all channels
   */
  async cleanup() {
    for (const channelId of this.channels.keys()) {
      await this.leaveChannel(channelId);
    }
  }
}

// Export singleton instance
export const presenceService = new PresenceService();