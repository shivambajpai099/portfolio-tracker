import { useEffect, useRef } from "react";
import { hasSupabaseConfig } from "../auth/supabaseClient";
import { fetchLatestSnapshot, pushSnapshot } from "./cloudSyncService";
import { useAuthStore } from "../../store/authStore";
import { usePortfolioStore } from "../../store/portfolioStore";
import type { PortfolioSnapshotData } from "./cloudSnapshot";

const isRemoteNewer = (remote: string, local: string): boolean =>
  new Date(remote).getTime() > new Date(local).getTime();

export function PortfolioCloudSyncBootstrap() {
  const cloudEnabled = hasSupabaseConfig;

  const authInitialized = useAuthStore((s) => s.initialized);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const hydrated = usePortfolioStore((s) => s.hydrated);

  const pushingRef = useRef(false);
  const applyingRemoteRef = useRef(false);
  const pullDoneForUserRef = useRef<string | null>(null);
  const pendingPushRef = useRef(false);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPush = async () => {
    if (!userId || pushingRef.current) {
      return;
    }

    pushingRef.current = true;
    const snapshot = usePortfolioStore.getState().getSnapshot();
    const error = await pushSnapshot(userId, snapshot);
    pushingRef.current = false;

    if (error) {
      pendingPushRef.current = true;
      return;
    }

    pendingPushRef.current = false;
  };

  const schedulePush = () => {
    if (!userId || applyingRemoteRef.current) {
      return;
    }

    pendingPushRef.current = true;
    if (pushTimerRef.current) {
      clearTimeout(pushTimerRef.current);
    }

    pushTimerRef.current = setTimeout(() => {
      void flushPush();
    }, 700);
  };

  useEffect(() => {
    if (!cloudEnabled || !authInitialized || !hydrated) {
      return;
    }

    if (!userId) {
      pullDoneForUserRef.current = null;
      pendingPushRef.current = false;
      return;
    }

    if (pullDoneForUserRef.current === userId) {
      return;
    }

    pullDoneForUserRef.current = userId;

    void (async () => {
      const remote = await fetchLatestSnapshot(userId);
      if (remote.error || !remote.data) {
        // If no remote snapshot exists yet, seed cloud with current local data.
        await flushPush();
        return;
      }

      const local = usePortfolioStore.getState().getSnapshot();
      const remoteUpdatedAt = remote.updatedAt ?? remote.data.snapshotUpdatedAt;
      const localUpdatedAt = local.snapshotUpdatedAt;

      if (isRemoteNewer(remoteUpdatedAt, localUpdatedAt)) {
        applyingRemoteRef.current = true;
        usePortfolioStore.getState().replaceFromSnapshot(remote.data as PortfolioSnapshotData);
        applyingRemoteRef.current = false;
        return;
      }

      // Local is newer or equal: push local to cloud.
      await flushPush();
    })();
  }, [cloudEnabled, authInitialized, hydrated, userId]);

  useEffect(() => {
    if (!cloudEnabled || !authInitialized || !hydrated || !userId) {
      return;
    }

    const unsubscribe = usePortfolioStore.subscribe(
      (state, prevState) => {
        if (state.snapshotUpdatedAt === prevState.snapshotUpdatedAt) {
          return;
        }
        schedulePush();
      }
    );

    return () => {
      unsubscribe();
    };
  }, [cloudEnabled, authInitialized, hydrated, userId]);

  useEffect(() => {
    if (!cloudEnabled || !authInitialized || !hydrated || !userId) {
      return;
    }

    const interval = setInterval(() => {
      if (!pendingPushRef.current) {
        return;
      }
      void flushPush();
    }, 15000);

    return () => {
      clearInterval(interval);
    };
  }, [cloudEnabled, authInitialized, hydrated, userId]);

  useEffect(() => {
    return () => {
      if (pushTimerRef.current) {
        clearTimeout(pushTimerRef.current);
      }
    };
  }, []);

  return null;
}




