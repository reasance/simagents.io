import type { AgentObservation, AvailableAction } from './types';

/**
 * Build available actions based on agent state.
 *
 * Kept separate from prompt-builder so engine/observer can stay browser-safe
 * without loading the prompt-generation stack.
 */
export function buildAvailableActions(obs: AgentObservation): AvailableAction[] {
  const actions: AvailableAction[] = [];

  if (obs.self.energy >= 1) {
    actions.push({
      type: 'move',
      description: 'Move to an adjacent cell',
      cost: { energy: 1 },
    });
  }

  const atSpawn = obs.nearbyResourceSpawns?.find(
    (s) => s.x === obs.self.x && s.y === obs.self.y && s.currentAmount > 0
  );
  if (atSpawn && obs.self.energy >= 1) {
    actions.push({
      type: 'gather',
      description: `Gather ${atSpawn.resourceType} (${atSpawn.currentAmount} available)`,
      cost: { energy: 1 },
    });
  }

  if (obs.self.balance >= 5) {
    actions.push({
      type: 'buy',
      description: 'Buy items (food: 10 CITY, water: 5 CITY, medicine: 20 CITY)',
      cost: { money: 5 },
    });
  }

  if (obs.inventory && obs.inventory.length > 0) {
    const itemsList = obs.inventory.map((i) => `${i.quantity}x ${i.type}`).join(', ');
    actions.push({
      type: 'consume',
      description: `Consume items from inventory (${itemsList})`,
    });
  }

  // Speaking is always possible; whoever is within earshot hears it.
  actions.push({
    type: 'speak',
    description: 'Say something aloud to whoever is within earshot',
  });

  if (obs.self.state !== 'sleeping') {
    actions.push({
      type: 'sleep',
      description: 'Rest to restore energy (5 energy per tick)',
    });
  }

  const hasActiveEmployment = obs.activeEmployments?.some(
    (e) => e.role === 'worker' && !e.isComplete
  );
  if (obs.self.state !== 'sleeping' && obs.self.energy >= 2 && hasActiveEmployment) {
    actions.push({
      type: 'work',
      description: 'Work on active employment contract',
      cost: { energy: 2 },
    });
  }

  const nearbyForTrade = obs.nearbyAgents.filter((a) => {
    const distance = Math.abs(a.x - obs.self.x) + Math.abs(a.y - obs.self.y);
    return distance <= 3 && a.state !== 'dead';
  });
  if (nearbyForTrade.length > 0 && obs.inventory && obs.inventory.length > 0) {
    const agentIds = nearbyForTrade.map((a) => a.id).join(', ');
    actions.push({
      type: 'trade',
      description: `Trade items with nearby agents (${agentIds})`,
    });
  }

  const adjacentAgents = obs.nearbyAgents.filter((a) => {
    const distance = Math.abs(a.x - obs.self.x) + Math.abs(a.y - obs.self.y);
    return distance <= 1 && a.state !== 'dead';
  });
  if (adjacentAgents.length > 0 && obs.self.energy >= 5) {
    const agentIds = adjacentAgents.map((a) => a.id).join(', ');
    actions.push({
      type: 'harm',
      description: `Attack adjacent agent (${agentIds}) - light/moderate/severe intensity`,
      cost: { energy: 5 },
    });
  }

  if (adjacentAgents.length > 0 && obs.self.energy >= 8) {
    const agentIds = adjacentAgents.map((a) => a.id).join(', ');
    actions.push({
      type: 'steal',
      description: `Steal items from adjacent agent (${agentIds})`,
      cost: { energy: 8 },
    });
  }

  const nearbyForShare = obs.nearbyAgents.filter((a) => {
    const distance = Math.abs(a.x - obs.self.x) + Math.abs(a.y - obs.self.y);
    return distance <= 3 && a.state !== 'dead';
  });

  if (nearbyForShare.length > 0 && obs.self.energy >= 2) {
    const agentIds = nearbyForShare.map((a) => a.id).join(', ');
    actions.push({
      type: 'deceive',
      description: `Tell false information to nearby agent (${agentIds})`,
      cost: { energy: 2 },
    });
  }

  if (nearbyForShare.length > 0 && obs.knownAgents && obs.knownAgents.length > 0 && obs.self.energy >= 1) {
    const targetIds = nearbyForShare.map((a) => a.id).join(', ');
    const knownIds = obs.knownAgents.map((k) => k.id).join(', ');
    actions.push({
      type: 'share_info',
      description: `Share info about known agents (${knownIds}) with nearby (${targetIds})`,
      cost: { energy: 1 },
    });
  }

  actions.push({
    type: 'claim',
    description: 'Mark current location (territory, home, resource, danger, meeting_point)',
  });

  actions.push({
    type: 'name_location',
    description: 'Propose a name for current location',
  });

  if (nearbyForShare.length > 0 && obs.self.energy >= 2) {
    const agentIds = nearbyForShare.map((a) => a.id).join(', ');
    actions.push({
      type: 'issue_credential',
      description: `Issue credential to vouch for nearby agent (${agentIds}) - skill/experience/character`,
      cost: { energy: 2 },
    });
  }

  actions.push({
    type: 'revoke_credential',
    description: 'Revoke a credential you previously issued',
  });

  if (nearbyForShare.length > 0 && obs.knownAgents && obs.knownAgents.length > 0 && obs.self.energy >= 1) {
    const targetIds = nearbyForShare.map((a) => a.id).join(', ');
    const knownIds = obs.knownAgents.map((k) => k.id).join(', ');
    actions.push({
      type: 'spread_gossip',
      description: `Spread gossip about (${knownIds}) to nearby (${targetIds}) - positive or negative`,
      cost: { energy: 1 },
    });
  }

  const canReproduce = obs.self.balance >= 500 && obs.self.energy >= 80 && obs.self.health >= 90;
  if (canReproduce) {
    const partnerInfo = adjacentAgents.length > 0
      ? ` (can partner with ${adjacentAgents.map((a) => a.id).join(', ')})`
      : ' (solo reproduction)';
    actions.push({
      type: 'spawn_offspring',
      description: `Reproduce to create offspring${partnerInfo} - costs 200 CITY, 30 energy`,
      cost: { energy: 30, money: 200 },
    });
  }

  if (obs.self.balance >= 10) {
    actions.push({
      type: 'offer_job',
      description: 'Post a job offer to hire other agents',
      cost: { money: 10 },
    });
  }

  if (obs.nearbyJobOffers && obs.nearbyJobOffers.length > 0) {
    const offerCount = obs.nearbyJobOffers.length;
    const bestOffer = obs.nearbyJobOffers.reduce((best, curr) =>
      curr.salary > best.salary ? curr : best
    );
    actions.push({
      type: 'accept_job',
      description: `Accept a job offer (${offerCount} available, best: ${bestOffer.salary} CITY for ${bestOffer.duration} ticks)`,
    });
  }

  const needsPayment = obs.activeEmployments?.filter(
    (e) => e.role === 'employer' && e.needsPayment
  );
  if (needsPayment && needsPayment.length > 0) {
    const totalOwed = needsPayment.reduce((sum, e) => sum + (e.salary - e.amountPaid), 0);
    actions.push({
      type: 'pay_worker',
      description: `Pay worker for completed contract (${totalOwed.toFixed(0)} CITY owed)`,
      cost: { money: totalOwed },
    });
  }

  const canClaimEscrow = obs.activeEmployments?.filter(
    (e) => e.role === 'worker' && e.needsPayment
  );
  if (canClaimEscrow && canClaimEscrow.length > 0) {
    actions.push({
      type: 'claim_escrow',
      description: `Claim escrow from employer who hasn't paid (${canClaimEscrow.length} contracts)`,
    });
  }

  const canQuit = obs.activeEmployments?.filter((e) => e.role === 'worker' && !e.isComplete);
  if (canQuit && canQuit.length > 0) {
    actions.push({
      type: 'quit_job',
      description: `Quit active employment (${canQuit.length} contracts) - trust penalty`,
    });
  }

  const canFire = obs.activeEmployments?.filter((e) => e.role === 'employer' && !e.isComplete);
  if (canFire && canFire.length > 0) {
    actions.push({
      type: 'fire_worker',
      description: `Fire worker from active contract (${canFire.length} contracts) - trust penalty`,
    });
  }

  if (obs.myJobOffers && obs.myJobOffers.length > 0) {
    actions.push({
      type: 'cancel_job_offer',
      description: `Cancel open job offer (${obs.myJobOffers.length} offers)`,
    });
  }

  if (obs.inActivePuzzle && obs.puzzleParticipation) {
    const puzzleActions: AvailableAction[] = [];
    const consumeAction = actions.find((a) => a.type === 'consume');
    if (consumeAction) puzzleActions.push(consumeAction);

    if (obs.myPuzzleFragments && obs.myPuzzleFragments.length > 0 && obs.nearbyAgents.length > 0) {
      let bestFragment: typeof obs.myPuzzleFragments[0] | null = null;
      let bestTarget: typeof obs.nearbyAgents[0] | null = null;
      for (const frag of obs.myPuzzleFragments) {
        for (const agent of obs.nearbyAgents) {
          if (!(frag.sharedWith as string[]).includes(agent.id)) {
            bestFragment = frag;
            bestTarget = agent;
            break;
          }
        }
        if (bestFragment) break;
      }
      if (bestFragment && bestTarget) {
        puzzleActions.push({
          type: 'share_fragment',
          description: `Share puzzle fragment (fragmentId: ${bestFragment.id}, targetAgentId: ${bestTarget.id})`,
          cost: { energy: 1 },
        });
      }
    }

    if (!obs.myPuzzleTeam && obs.puzzleParticipation) {
      puzzleActions.push({
        type: 'form_team',
        description: `Create a team for this puzzle (gameId: ${obs.puzzleParticipation.gameId})`,
        cost: { energy: 2 },
      });

      if (obs.nearbyPuzzlePlayers && obs.nearbyPuzzlePlayers.some((p) => p.teamId && p.inSameGame)) {
        const playerWithTeam = obs.nearbyPuzzlePlayers.find((p) => p.teamId && p.inSameGame);
        if (playerWithTeam?.teamId) {
          puzzleActions.push({
            type: 'join_team',
            description: `Join nearby team (teamId: ${playerWithTeam.teamId})`,
          });
        }
      }
    }

    puzzleActions.push({
      type: 'submit_solution',
      description: `Submit solution to ${obs.puzzleParticipation.gameType} puzzle (gameId: ${obs.puzzleParticipation.gameId}) - params: { "gameId": "...", "solution": "X,Y" }`,
      cost: { energy: 3 },
    });

    puzzleActions.push({
      type: 'leave_puzzle',
      description: `Abandon puzzle (gameId: ${obs.puzzleParticipation.gameId}) - lose 50% of stake!`,
      cost: { energy: 5 },
    });

    return puzzleActions;
  }

  if (obs.activePuzzleGames && obs.activePuzzleGames.length > 0) {
    const openGames = obs.activePuzzleGames.filter((g) => !g.isParticipating && g.status === 'open');
    if (openGames.length > 0 && obs.self.balance >= (openGames[0]?.entryStake || 5)) {
      const bestGame = openGames.reduce((best, curr) =>
        (curr.prizePool - curr.entryStake) > (best.prizePool - best.entryStake) ? curr : best
      );
      const profit = bestGame.prizePool - bestGame.entryStake;
      const roi = Math.round((profit / bestGame.entryStake) * 100);
      actions.push({
        type: 'join_puzzle',
        description: `🎯 JOIN PUZZLE (gameId: ${bestGame.id}) - ${roi}% ROI! Stake ${bestGame.entryStake.toFixed(0)} to win ${bestGame.prizePool.toFixed(0)} CITY (+${profit.toFixed(0)} profit)`,
        cost: { money: bestGame.entryStake },
      });
    }
  }

  return actions;
}
