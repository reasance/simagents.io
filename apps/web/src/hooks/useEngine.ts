import { formatIssue } from '../i18n/errors';
import { useLocale } from '../i18n';
import type { AppIssue } from '@simagents/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SimEngineState } from '@simagents/engine/engine/engine';
import { getEngineClient } from '../engine-host/engine-client';
import { startPersistenceSync } from '../services/persistence';
import { startReplayFramePersistence } from '../services/replayFrames';
import { processWorldEvent } from '../services/process-event';
import { useAgentStatsStore } from '../stores/agentStats';
import { useWorldStore, type Agent, type ResourceSpawn, type Shelter } from '../stores/world';
import { useSessionLimitsStore } from '../stores/sessionLimits';
import { useEditorStore } from '../stores/editor';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

function mapEngineState(state: SimEngineState): {
  tick: number;
  agents: Agent[];
  resourceSpawns: ResourceSpawn[];
  shelters: Shelter[];
} {
  return {
    tick: state.tick,
    agents: state.agents.map((agent) => ({
      id: agent.id,
      name: (agent as Agent).name,
      llmType: agent.llmType,
      x: agent.x,
      y: agent.y,
      hunger: agent.hunger,
      energy: agent.energy,
      health: agent.health,
      balance: agent.balance,
      state: agent.state,
      color: agent.color,
      personality: agent.personality,
      rosterEntryId: agent.rosterEntryId,
      privateNotes: agent.privateNotes,
    })),
    resourceSpawns: state.resources.map((spawn) => ({
      id: spawn.id,
      x: spawn.x,
      y: spawn.y,
      resourceType: spawn.resourceType as ResourceSpawn['resourceType'],
      currentAmount: spawn.currentAmount,
      maxAmount: spawn.maxAmount,
      biome: spawn.biome as ResourceSpawn['biome'],
    })),
    shelters: state.shelters.map((shelter) => ({
      id: shelter.id,
      x: shelter.x,
      y: shelter.y,
      canSleep: shelter.canSleep,
    })),
  };
}

export function engineStateToWorldState(state: SimEngineState): ReturnType<typeof mapEngineState> {
  return mapEngineState(state);
}

export function useEngine() {
  useLocale();
  const [issue, setIssue] = useState<AppIssue>();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const processedEventIds = useRef<Set<string>>(new Set());
  const { updateWorldState, setTick, updateAgent, addEvent, addBubble } = useWorldStore();

  useEffect(() => {
    const client = getEngineClient();
    const stopPersistence = startPersistenceSync(client);
    const stopReplayPersistence = startReplayFramePersistence();
    const unsubscribeStatus = client.onStatus((nextStatus) => {
      setStatus(nextStatus);
      if (nextStatus === 'disconnected') { setIssue(undefined); setError(null); }
    });
    const unsubscribeEvent = client.onEvent((event) => {
      processWorldEvent(event, {
        processedEventIds: processedEventIds.current,
        addEvent,
        addBubble,
        setTick,
        updateAgent,
      });
    });
    const unsubscribeWarning = client.onWarning((message, problem) => {
      setIssue(problem);
      setError(message);
      useEditorStore.getState().setPaused(true);
    });
    const unsubscribeState = client.onState((state) => {
      useSessionLimitsStore.getState().setUsage(state.usage);
      useAgentStatsStore.getState().syncMetrics(state.metrics, state.simTimeMs);
      useEditorStore.getState().setPaused(state.lifecycle !== 'running');
      if (state.lifecycle === 'running') { setIssue(undefined); setError(null); }
      updateWorldState(mapEngineState(state));
      useWorldStore.getState().setSimTime(state.simTimeMs);
    });

    return () => {
      unsubscribeStatus();
      unsubscribeEvent();
      unsubscribeState();
      unsubscribeWarning();
      stopPersistence();
      stopReplayPersistence();
    };
  }, [addEvent, addBubble, setTick, updateAgent, updateWorldState]);

  const connect = useCallback(() => {
    setStatus(getEngineClient().getStatus());
  }, []);

  const disconnect = useCallback(() => {
    setStatus(getEngineClient().getStatus());
  }, []);

  return { status, error: issue ? formatIssue(issue) : error, mode: 'worker' as const, connect, disconnect };
}
