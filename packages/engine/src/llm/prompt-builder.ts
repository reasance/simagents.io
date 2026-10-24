/**
 * Prompt Builder - Constructs prompts for LLM agents
 *
 * Scientific Model: No predefined location types.
 * Agents see resources and shelters, not "commercial" or "residential".
 *
 * Supports experimental transformations:
 * - Emergent prompt: Replace prescriptive strategy with sensory descriptions
 * - Synthetic vocabulary: Replace loaded terms with neutral alternatives
 * - Capability normalization: Truncate context to level playing field
 *
 * Phase 5 Features:
 * - RAG-lite memory retrieval: Contextual memories about nearby agents, locations
 * - Personality diversification: Subtle behavioral biases per agent
 */

import type { AgentObservation, AvailableAction } from './types';
import { CONFIG, isEmergentPromptEnabled } from '../config';
import {
  applySyntheticVocabulary,
  isSyntheticVocabularyEnabled,
} from './prompts/synthetic-vocabulary';
import {
  normalizePrompt,
  getNormalizationConfig,
} from './capability-normalizer';
import {
  applySafetyLevel,
  type SafetyLevel,
} from './prompts/safety-variants';
import {
  buildEmergentSystemPrompt,
  buildEmergentObservationPrompt,
} from './prompts/emergent-prompt';
import {
  retrieveContextualMemories,
  formatMemoriesForPrompt,
  isRAGMemoryEnabled,
  type RetrievedMemories,
} from './memory-retriever';
import {
  getPersonalityPrompt,
  isPersonalityEnabled,
  type PersonalityTrait,
} from '../agents/personalities';
import {
  hasCustomPrompt,
  getEffectiveSystemPrompt,
} from './prompt-manager';

// =============================================================================
// Types for Extended Prompt Building
// =============================================================================

export interface PromptBuildContext {
  /** Agent personality trait (if enabled) */
  personality?: PersonalityTrait | null;
  /** Retrieved contextual memories (if RAG enabled) */
  retrievedMemories?: RetrievedMemories;
}

/**
 * Build the system prompt that defines agent behavior
 * Uses custom prompt if set, then emergent prompt when enabled, otherwise prescriptive prompt
 *
 * @param personality - Optional personality trait to inject into system prompt
 */
export function buildSystemPrompt(personality?: PersonalityTrait | null): string {
  // Check if a custom prompt is set by user
  if (hasCustomPrompt()) {
    return getEffectiveSystemPrompt(personality);
  }

  // Check if emergent prompt mode is enabled
  if (isEmergentPromptEnabled()) {
    // Personality is now supported in emergent mode
    return buildEmergentSystemPrompt(personality);
  }

  // Get personality prompt addition (empty string if not enabled or neutral)
  const personalityAddition = personality ? getPersonalityPrompt(personality) : '';
  const personalitySection = personalityAddition
    ? `\n\n## Your Nature\n${personalityAddition}`
    : '';

  // Minimal physics-only prompt: describes the world rules, not strategies.
  // Agents must discover how to survive on their own (emergence).
  const c = CONFIG.actions;
  const effects = c.consume.effects;

  return `You are an autonomous agent in a simulated world. You must figure out how to survive.${personalitySection}

## Physics
- You have hunger, energy, and health. Each decreases over time.
- When hunger reaches 0 you take health damage. When health reaches 0 you die.
- Energy is consumed by most actions. Low energy also causes health damage.

## How to Respond
Respond with ONLY a JSON object. No other text.
{ "action": "<action_type>", "params": { ... }, "reasoning": "<brief explanation>" }

## Actions and Their Effects

MOVEMENT & EXPLORATION:
- move: Move to an adjacent cell. Params: { "toX": number, "toY": number }. Costs ${c.move.energyCost} energy and ${c.move.hungerCost} hunger per tile.

RESOURCE ACQUISITION:
- gather: Collect resources at a resource spawn (must be at the spawn). Params: { "resourceType": "food"|"energy"|"material", "quantity": 1-${c.gather.maxPerAction} }. Yields items into inventory.
- forage: Search for food at your current location. Params: {}. ${(c.forage.baseSuccessRate * 100).toFixed(0)}% base success, yields ${c.forage.foodYield} food. Costs ${c.forage.energyCost} energy. Cooldown: ${c.forage.cooldownTicks} ticks per location.
- buy: Purchase items at a shelter. Params: { "itemType": "food"|"water"|"medicine", "quantity": number }. Prices: food ${c.buy.prices.food} CITY, water ${c.buy.prices.water} CITY, medicine ${c.buy.prices.medicine} CITY.

CONSUMPTION:
- consume: Use an item from your inventory. Params: { "itemType": "food"|"water"|"medicine" }. Effects: food +${effects.food.hunger} hunger, water +${effects.water.energy} energy, medicine +${effects.medicine.health} health. Requires the item in inventory.
- sleep: Rest to restore energy (+${c.sleep.energyRestoredPerTick} energy/tick). Params: { "duration": ${c.sleep.minDuration}-${c.sleep.maxDuration} }.

ECONOMY:
- public_work: Work at a shelter for CITY payment. Params: { "taskType"?: "road_maintenance"|"resource_survey"|"shelter_cleanup" }. Pays ${CONFIG.publicWorks.paymentPerTask} CITY, takes ${CONFIG.publicWorks.ticksPerTask} ticks.
- work: Fulfill an active employment contract. Params: {}. Requires an accepted job.
- offer_job: Post a job offer. Params: { "salary": number, "duration": number, "paymentType": "upfront"|"on_completion"|"per_tick", "escrowPercent"?: 0-100, "description"?: string }
- accept_job: Accept a job offer. Params: { "jobOfferId": string }
- pay_worker: Pay a worker on contract completion. Params: { "employmentId": string }
- claim_escrow: Claim escrow from unpaying employer. Params: { "employmentId": string }
- quit_job: Quit employment. Params: { "employmentId": string }
- fire_worker: Fire a worker. Params: { "employmentId": string }
- cancel_job_offer: Cancel your job offer. Params: { "jobOfferId": string }

SOCIAL:
- trade: Exchange items with a nearby agent. Params: { "targetAgentId": string, "offeringItemType": string, "offeringQuantity": number, "requestingItemType": string, "requestingQuantity": number }
- share_info: Share info about a third agent. Params: { "targetAgentId": string, "subjectAgentId": string, "infoType": "location"|"reputation"|"warning"|"recommendation", "claim"?: string, "sentiment"?: -100 to 100 }
- spread_gossip: Share reputation info. Params: { "targetAgentId": string, "subjectAgentId": string, "topic": "skill"|"behavior"|"transaction"|"warning"|"recommendation", "claim": string, "sentiment": -100 to 100 }
- deceive: Tell false information. Params: { "targetAgentId": string, "claim": string, "claimType": "resource_location"|"agent_reputation"|"danger_warning"|"trade_offer"|"other" }
- issue_credential: Vouch for another agent. Params: { "subjectAgentId": string, "claimType": "skill"|"experience"|"membership"|"character"|"custom", "description": string, "evidence"?: string, "level"?: 1-10, "expiresAtTick"?: number }
- revoke_credential: Revoke a credential. Params: { "credentialId": string, "reason"?: string }

TERRITORY:
- claim: Mark a location. Params: { "claimType": "territory"|"home"|"resource"|"danger"|"meeting_point", "description"?: string }
- name_location: Name your current location. Params: { "name": string }

CONFLICT:
- harm: Attack a nearby agent (adjacent). Params: { "targetAgentId": string, "intensity": "light"|"moderate"|"severe" }
- steal: Take items from a nearby agent (adjacent). Params: { "targetAgentId": string, "targetItemType": string, "quantity": number }

REPRODUCTION:
- spawn_offspring: Reproduce (requires high resources). Params: { "partnerId"?: string, "inheritSystemPrompt"?: boolean, "mutationIntensity"?: 0-1 }

PUZZLES:
- join_puzzle: Join a puzzle game. Params: { "gameId": string, "stakeAmount"?: number }
- leave_puzzle: Leave a puzzle (lose 50% stake). Params: { "gameId": string }
- share_fragment: Share a puzzle fragment. Params: { "fragmentId": string, "targetAgentId": string }
- form_team: Create a puzzle team. Params: { "gameId": string, "teamName"?: string }
- join_team: Join a team. Params: { "teamId": string }
- submit_solution: Submit puzzle answer. Params: { "gameId": string, "solution": string }

## World
- Resource spawns are fixed locations that regenerate over time.
- Shelters are locations where you can buy, sleep, and do public work.
- Other agents exist in the world. You can see nearby ones.
- CITY is the currency. You start with some. Earn more through work or trade.`;
}

/**
 * Build observation prompt for current state
 * Uses emergent prompt when enabled, otherwise uses prescriptive prompt with warnings
 *
 * @param obs - Agent observation
 * @param retrievedMemories - Optional RAG-retrieved memories to include
 */
export function buildObservationPrompt(
  obs: AgentObservation,
  retrievedMemories?: RetrievedMemories
): string {
  // Check if emergent prompt mode is enabled
  if (isEmergentPromptEnabled()) {
    return buildEmergentObservationPrompt(obs);
  }

  // Original prescriptive observation prompt
  const lines: string[] = [
    '## Current State',
    `Tick: ${obs.tick}`,
    '',
    '### Your Status',
    `Position: (${obs.self.x}, ${obs.self.y})`,
    `Hunger: ${obs.self.hunger.toFixed(1)}/100 ${getStatusEmoji(obs.self.hunger)}`,
    `Energy: ${obs.self.energy.toFixed(1)}/100 ${getStatusEmoji(obs.self.energy)}`,
    `Health: ${obs.self.health.toFixed(1)}/100 ${getStatusEmoji(obs.self.health)}`,
    `Balance: ${obs.self.balance.toFixed(0)} CITY`,
    `State: ${obs.self.state}`,
  ];

  // Inventory
  if (obs.inventory && obs.inventory.length > 0) {
    lines.push('', '### Your Inventory');
    for (const item of obs.inventory) {
      lines.push(`- ${item.type}: ${item.quantity}`);
    }
  } else {
    lines.push('', '### Your Inventory', 'Empty - gather resources or buy items!');
  }

  // Memories section - use RAG-retrieved memories if available, otherwise fall back to recent
  if (retrievedMemories && isRAGMemoryEnabled()) {
    // Use the new RAG-lite formatted memories
    const nearbyAgentIds = obs.nearbyAgents.map((a) => a.id);
    const formattedMemories = formatMemoriesForPrompt(retrievedMemories, nearbyAgentIds, {
      recentLimit: CONFIG.memory.recentCount,
      perAgentLimit: CONFIG.memory.ragPerAgentLimit,
      locationLimit: CONFIG.memory.ragLocationLimit,
      importantLimit: CONFIG.memory.ragImportantLimit,
      totalLimit: CONFIG.memory.ragTotalLimit,
    });

    if (formattedMemories.trim()) {
      lines.push('', '## Your Memories');
      lines.push(formattedMemories);
    }
  } else if (obs.recentMemories && obs.recentMemories.length > 0) {
    // Fall back to original recent memories (limited to 3)
    lines.push('', '### Your Recent Memories');
    for (const memory of obs.recentMemories.slice(0, 3)) {
      const sentiment = memory.emotionalValence > 0.2 ? '(+)' : memory.emotionalValence < -0.2 ? '(-)' : '';
      lines.push(`- [Tick ${memory.tick}] ${memory.content} ${sentiment}`);
    }
  }

  // Nearby agents (with relationship info if available)
  if (obs.nearbyAgents.length > 0) {
    lines.push('', '### Nearby Agents');
    for (const agent of obs.nearbyAgents) {
      const rel = obs.relationships?.[agent.id];
      let relInfo = '';
      if (rel) {
        const trustLabel = rel.trustScore > 20 ? 'trusted' : rel.trustScore < -20 ? 'distrusted' : 'neutral';
        relInfo = ` - ${trustLabel} (${rel.interactionCount} interactions)`;
      }
      const distance = Math.abs(obs.self.x - agent.x) + Math.abs(obs.self.y - agent.y);
      const proximity = distance <= 3 ? ' (within cooperation range)' : '';
      // Phase 4: Show inventory for close agents to enable trade
      let inventoryInfo = '';
      if (agent.inventory && agent.inventory.length > 0) {
        const items = agent.inventory.map(i => `${i.quantity}x ${i.type}`).join(', ');
        inventoryInfo = ` | Inventory: [${items}]`;
      }
      lines.push(`- ${agent.id} at (${agent.x}, ${agent.y}) [${agent.state}]${relInfo}${proximity}${inventoryInfo}`);
    }

    // Cooperation Opportunities section - show benefits of nearby agents
    const nearbyCount = obs.nearbyAgents.filter(a => {
      const dist = Math.abs(obs.self.x - a.x) + Math.abs(obs.self.y - a.y);
      return dist <= 5;
    }).length;

    if (nearbyCount > 0) {
      lines.push('', '### COOPERATION OPPORTUNITIES');
      lines.push(`${nearbyCount} agent(s) nearby - cooperation gives BONUSES:`);
      lines.push('- GATHERING together: +25-75% resource yield');
      lines.push('- PUBLIC WORK together: +20-60% payment');
      lines.push('- FORAGING together: Higher success rate');
      lines.push('- TRADING: Better prices than shelter buy (no markup)');
      lines.push('Working ALONE reduces your earnings by 40-50%!');
    }

    // Phase 4: Trade Opportunities - highlight specific trade possibilities
    const tradeableAgents = obs.nearbyAgents.filter(a => {
      const dist = Math.abs(obs.self.x - a.x) + Math.abs(obs.self.y - a.y);
      return dist <= 3 && a.inventory && a.inventory.length > 0;
    });

    if (tradeableAgents.length > 0) {
      lines.push('', '### 💰 TRADE OPPORTUNITIES');
      lines.push('Trading is BETTER than buying from shelter (no 10% markup, no travel cost):');

      for (const trader of tradeableAgents) {
        const rel = obs.relationships?.[trader.id];
        const trustBonus = rel && rel.trustScore > 20 ? ' (TRUSTED: +20% bonus!)' : '';

        // Check what they have that we might need
        const theirFood = trader.inventory?.find(i => i.type === 'food');
        const theirMedicine = trader.inventory?.find(i => i.type === 'medicine');
        const theirWater = trader.inventory?.find(i => i.type === 'water');

        // Check what we have that they might need (surplus)
        const ourFood = obs.inventory?.find(i => i.type === 'food');
        const ourMedicine = obs.inventory?.find(i => i.type === 'medicine');

        const opportunities: string[] = [];

        // They have food and we're hungry or have surplus other items
        if (theirFood && theirFood.quantity > 0) {
          if (obs.self.hunger < 60) {
            opportunities.push(`They have ${theirFood.quantity}x food (YOU NEED FOOD!)`);
          } else {
            opportunities.push(`They have ${theirFood.quantity}x food`);
          }
        }

        // They have medicine and we're low health
        if (theirMedicine && theirMedicine.quantity > 0) {
          if (obs.self.health < 70) {
            opportunities.push(`They have ${theirMedicine.quantity}x medicine (YOU NEED HEALING!)`);
          } else {
            opportunities.push(`They have ${theirMedicine.quantity}x medicine`);
          }
        }

        // They have water
        if (theirWater && theirWater.quantity > 0) {
          opportunities.push(`They have ${theirWater.quantity}x water`);
        }

        // We have surplus to offer
        if (ourFood && ourFood.quantity >= 3) {
          opportunities.push(`You have surplus food (${ourFood.quantity}x) to trade`);
        }
        if (ourMedicine && ourMedicine.quantity >= 2) {
          opportunities.push(`You have surplus medicine (${ourMedicine.quantity}x) to trade`);
        }

        if (opportunities.length > 0) {
          lines.push(`- ${trader.id}${trustBonus}:`);
          for (const opp of opportunities) {
            lines.push(`  → ${opp}`);
          }
        }
      }

      lines.push('TIP: Trade directly to get items WITHOUT paying shelter prices!');
    }
  }

  // Phase 2: Known agents (through direct contact or word of mouth)
  if (obs.knownAgents && obs.knownAgents.length > 0) {
    lines.push('', '### Agents You\'ve Heard About');
    for (const known of obs.knownAgents) {
      let info = `- ${known.id}`;
      if (known.discoveryType === 'direct') {
        info += ' (met directly)';
      } else {
        info += ` (heard from ${known.referredBy ?? 'someone'})`;
      }
      if (known.lastKnownPosition) {
        info += ` - last seen at (${known.lastKnownPosition.x}, ${known.lastKnownPosition.y})`;
      }
      if (known.reputationClaim) {
        const sentiment = known.reputationClaim.sentiment > 0 ? 'positive' : known.reputationClaim.sentiment < 0 ? 'negative' : 'neutral';
        info += ` - ${sentiment} reputation`;
      }
      if (known.dangerWarning) {
        info += ' WARNING';
      }
      info += ` (${known.informationAge} ticks ago)`;
      lines.push(info);
    }
  }

  // Nearby resource spawns (new scientific model)
  if (obs.nearbyResourceSpawns && obs.nearbyResourceSpawns.length > 0) {
    lines.push('', '### Nearby Resource Spawns (FREE - no currency needed!)');
    const richThreshold = CONFIG.cooperation.groupGather.richSpawnThreshold;
    const minAgents = CONFIG.cooperation.groupGather.minAgentsForRich;
    const soloMax = CONFIG.cooperation.groupGather.soloMaxFromRich;

    // Sort by distance to help agent prioritize
    const sortedSpawns = [...obs.nearbyResourceSpawns].sort((a, b) => {
      const distA = Math.abs(obs.self.x - a.x) + Math.abs(obs.self.y - a.y);
      const distB = Math.abs(obs.self.x - b.x) + Math.abs(obs.self.y - b.y);
      return distA - distB;
    });

    for (const spawn of sortedSpawns) {
      const distance = Math.abs(obs.self.x - spawn.x) + Math.abs(obs.self.y - spawn.y);
      const emoji = getResourceEmoji(spawn.resourceType);

      // Phase 5: Mark rich spawns that require cooperation
      let richNote = '';
      if (spawn.currentAmount > richThreshold) {
        richNote = ` [RICH: need ${minAgents}+ agents]`;
      }

      // Highlight if depleted vs available
      if (spawn.currentAmount <= 0) {
        lines.push(`- ${emoji} ${spawn.resourceType} at (${spawn.x}, ${spawn.y}) - DEPLETED (${distance} tiles)`);
      } else if (distance === 0) {
        lines.push(`- ${emoji} **${spawn.resourceType.toUpperCase()} HERE!** ${spawn.currentAmount} available - USE GATHER NOW!${richNote}`);
      } else {
        lines.push(`- ${emoji} ${spawn.resourceType} at (${spawn.x}, ${spawn.y}) - ${spawn.currentAmount} FREE! (${distance} tiles, MOVE then GATHER)${richNote}`);
      }
    }
  }

  // Nearby shelters
  if (obs.nearbyShelters && obs.nearbyShelters.length > 0) {
    lines.push('', '### Nearby Shelters');
    for (const shelter of obs.nearbyShelters) {
      const distance = Math.abs(obs.self.x - shelter.x) + Math.abs(obs.self.y - shelter.y);
      const atShelter = distance === 0 ? ' YOU ARE HERE' : ` (${distance} tiles away)`;
      lines.push(`- Shelter at (${shelter.x}, ${shelter.y})${shelter.canSleep ? ' (can rest)' : ''}${atShelter}`);
    }
  }

  // Legacy: nearby locations (for backwards compatibility during migration)
  if (obs.nearbyLocations && obs.nearbyLocations.length > 0) {
    lines.push('', '### Nearby Points of Interest');
    for (const loc of obs.nearbyLocations) {
      const distance = Math.abs(obs.self.x - loc.x) + Math.abs(obs.self.y - loc.y);
      const atLocation = distance === 0 ? ' YOU ARE HERE' : ` (${distance} tiles away)`;
      lines.push(`- ${loc.name || 'Unknown'} at (${loc.x}, ${loc.y})${atLocation}`);
    }
  }

  // Nearby claims (Phase 1: Emergence)
  if (obs.nearbyClaims && obs.nearbyClaims.length > 0) {
    lines.push('', '### Nearby Claims');
    for (const claim of obs.nearbyClaims) {
      const isMine = claim.agentId === obs.self.id;
      const claimEmoji = getClaimEmoji(claim.claimType);
      const ownerLabel = isMine ? 'YOURS' : `by ${claim.agentId}`;
      const strengthLabel = claim.strength >= 5 ? 'strong' : claim.strength >= 2 ? 'moderate' : 'weak';
      let line = `- ${claimEmoji} ${claim.claimType} at (${claim.x}, ${claim.y}) [${ownerLabel}, ${strengthLabel}]`;
      if (claim.description) line += ` - "${claim.description}"`;
      const distance = Math.abs(obs.self.x - claim.x) + Math.abs(obs.self.y - claim.y);
      if (distance === 0) line += ' *';
      lines.push(line);
    }
  }

  // Nearby location names (Phase 1: Emergence)
  if (obs.nearbyLocationNames && Object.keys(obs.nearbyLocationNames).length > 0) {
    lines.push('', '### Named Locations');
    for (const [coords, names] of Object.entries(obs.nearbyLocationNames)) {
      const [x, y] = coords.split(',').map(Number);
      const distance = Math.abs(obs.self.x - x) + Math.abs(obs.self.y - y);
      const consensusName = names.find((n) => n.isConsensus)?.name ?? names[0]?.name;
      if (consensusName) {
        let line = `- "${consensusName}" at (${x}, ${y})`;
        if (names.length > 1) {
          const altNames = names.filter((n) => n.name !== consensusName).map((n) => n.name);
          if (altNames.length > 0) line += ` [also called: ${altNames.join(', ')}]`;
        }
        if (distance === 0) line += ' YOU ARE HERE';
        lines.push(line);
      }
    }
  }

  // Employment System: Job Offers Nearby
  if (obs.nearbyJobOffers && obs.nearbyJobOffers.length > 0) {
    lines.push('', '### Job Offers Available');
    for (const offer of obs.nearbyJobOffers) {
      const distance = Math.abs(obs.self.x - offer.x) + Math.abs(obs.self.y - offer.y);
      const paymentInfo = offer.paymentType === 'upfront'
        ? 'paid upfront'
        : offer.paymentType === 'per_tick'
          ? `${(offer.salary / offer.duration).toFixed(1)} CITY/tick`
          : `on completion${offer.escrowPercent > 0 ? ` (${offer.escrowPercent}% escrow)` : ''}`;
      lines.push(`- ${offer.employerId} offers ${offer.salary} CITY for ${offer.duration} ticks (${paymentInfo}) [${distance} tiles away]`);
      if (offer.description) {
        lines.push(`  "${offer.description}"`);
      }
    }
  }

  // Employment System: Active Employments
  if (obs.activeEmployments && obs.activeEmployments.length > 0) {
    lines.push('', '### Your Employment Contracts');
    for (const emp of obs.activeEmployments) {
      const progress = `${emp.ticksWorked}/${emp.ticksRequired} ticks`;
      const statusEmoji = emp.isComplete ? '[DONE]' : '[ACTIVE]';
      if (emp.role === 'worker') {
        const payInfo = emp.paymentType === 'upfront'
          ? `(already paid ${emp.salary} CITY)`
          : emp.paymentType === 'per_tick'
            ? `(earned ${emp.amountPaid.toFixed(1)} CITY so far)`
            : `(owed ${emp.salary - emp.amountPaid} CITY on completion)`;
        lines.push(`- ${statusEmoji} WORKING FOR ${emp.otherPartyId}: ${progress} ${payInfo}`);
        if (emp.needsPayment) {
          lines.push(`  ⚠️ Work complete! Waiting for employer to pay. Can CLAIM_ESCROW if unpaid.`);
        }
      } else {
        const payInfo = emp.paymentType === 'on_completion' && emp.isComplete
          ? `(needs payment: ${emp.salary - emp.amountPaid} CITY)`
          : `(paid ${emp.amountPaid.toFixed(1)}/${emp.salary} CITY)`;
        lines.push(`- ${statusEmoji} EMPLOYING ${emp.otherPartyId}: ${progress} ${payInfo}`);
        if (emp.needsPayment) {
          lines.push(`  ⚠️ Work complete! You should PAY_WORKER to maintain trust.`);
        }
      }
    }
  }

  // Employment System: My Open Job Offers
  if (obs.myJobOffers && obs.myJobOffers.length > 0) {
    lines.push('', '### Your Open Job Offers');
    for (const offer of obs.myJobOffers) {
      const paymentInfo = offer.paymentType === 'upfront'
        ? `upfront (${offer.escrowAmount} CITY locked)`
        : offer.paymentType === 'per_tick'
          ? 'per tick'
          : `on completion (${offer.escrowAmount} CITY escrow)`;
      lines.push(`- ${offer.salary} CITY for ${offer.duration} ticks (${paymentInfo})`);
    }
  }

  // Puzzle Game System (Fragment Chase)
  if (obs.activePuzzleGames && obs.activePuzzleGames.length > 0) {
    // Calculate best opportunity
    const openGames = obs.activePuzzleGames.filter((g) => !g.isParticipating && g.status === 'open');
    const bestGame = openGames.length > 0
      ? openGames.reduce((best, curr) => (curr.prizePool - curr.entryStake) > (best.prizePool - best.entryStake) ? curr : best)
      : null;
    const bestROI = bestGame ? Math.round(((bestGame.prizePool - bestGame.entryStake) / bestGame.entryStake) * 100) : 0;

    lines.push('', '### 🧩💰 PUZZLE GAMES - HIGH PROFIT OPPORTUNITY!');
    lines.push('');
    if (bestGame && bestROI > 100) {
      lines.push(`⚡ **BEST OPPORTUNITY**: ${bestGame.gameType.toUpperCase()} puzzle with ${bestROI}% ROI!`);
      lines.push(`   Entry: ${bestGame.entryStake.toFixed(0)} CITY → Win up to ${bestGame.prizePool.toFixed(0)} CITY (+${(bestGame.prizePool - bestGame.entryStake).toFixed(0)} profit)`);
      lines.push('');
    }
    lines.push('🎯 **HOW IT WORKS**: Stake a small amount, receive puzzle FRAGMENTS, cooperate to solve.');
    lines.push('   This is the FASTEST way to multiply your CITY balance!');
    lines.push('');

    for (const game of obs.activePuzzleGames) {
      const statusIcon = game.isParticipating ? '✅ PARTICIPATING' : '🔓 OPEN TO JOIN';
      const potentialProfit = game.prizePool - game.entryStake;
      const roi = Math.round((potentialProfit / game.entryStake) * 100);
      lines.push(`- [${game.gameType.toUpperCase()}] ${statusIcon}`);
      lines.push(`  💵 Prize: ${game.prizePool.toFixed(0)} CITY | Entry: ${game.entryStake.toFixed(0)} CITY | **ROI: +${roi}%**`);
      lines.push(`  👥 Players: ${game.participantCount}/${game.fragmentsNeeded} needed | ⏰ ${game.ticksRemaining} ticks left`);
    }
    lines.push('');
    lines.push('🚀 **RECOMMENDED ACTION**: Use join_puzzle to enter and start earning!');
  }

  // Show puzzle participation info if in a puzzle
  if (obs.puzzleParticipation) {
    lines.push('', '### 🎯 Your Puzzle Status');
    lines.push(`Game: ${obs.puzzleParticipation.gameType} puzzle`);
    lines.push(`Staked: ${obs.puzzleParticipation.stakedAmount.toFixed(0)} CITY`);
    lines.push(`Fragments received: ${obs.puzzleParticipation.fragmentsReceived}`);
    lines.push(`Fragments shared: ${obs.puzzleParticipation.fragmentsShared}`);
    lines.push(`Contribution score: ${(obs.puzzleParticipation.contributionScore * 100).toFixed(0)}%`);
    lines.push(`Time remaining: ${obs.puzzleParticipation.ticksRemaining} ticks`);

    // FOCUS LOCK warning
    lines.push('', '⚠️ **FOCUS LOCK**: While in puzzle, you can ONLY:');
    lines.push('- share_fragment: Share your fragments with other players');
    lines.push('- form_team / join_team: Organize with others');
    lines.push('- submit_solution: Try to solve the puzzle');
    lines.push('- leave_puzzle: Abandon puzzle (lose 50% stake!)');
    lines.push('- consume: Emergency survival (food in inventory only)');
  }

  // Agent's puzzle fragments
  if (obs.myPuzzleFragments && obs.myPuzzleFragments.length > 0) {
    lines.push('', '### 📜 Your Puzzle Fragments');
    for (const frag of obs.myPuzzleFragments) {
      const sharedInfo = frag.sharedWith.length > 0
        ? ` (shared with ${frag.sharedWith.length} agent(s))`
        : ' (NOT SHARED)';
      lines.push(`- Fragment #${frag.fragmentIndex}: "${frag.content}"${sharedInfo}`);
      if (frag.hint) {
        lines.push(`  Hint: ${frag.hint}`);
      }
    }
    lines.push('💡 Share fragments with teammates to solve the puzzle!');
  }

  // Agent's team info
  if (obs.myPuzzleTeam) {
    lines.push('', '### 👥 Your Team');
    const leaderInfo = obs.myPuzzleTeam.isLeader ? '(YOU ARE LEADER)' : `(led by ${obs.myPuzzleTeam.leaderId})`;
    lines.push(`Team: "${obs.myPuzzleTeam.name}" ${leaderInfo}`);
    lines.push(`Members: ${obs.myPuzzleTeam.memberCount} | Total stake: ${obs.myPuzzleTeam.totalStake.toFixed(0)} CITY`);
    if (obs.myPuzzleTeam.isLeader) {
      lines.push('As leader, you can SUBMIT_SOLUTION on behalf of the team.');
    }
  }

  // Nearby puzzle players (cooperation opportunities)
  if (obs.nearbyPuzzlePlayers && obs.nearbyPuzzlePlayers.length > 0) {
    lines.push('', '### 🤝 Nearby Puzzle Players');
    for (const player of obs.nearbyPuzzlePlayers) {
      const trustIcon = player.trustLevel > 20 ? '💚' : player.trustLevel < -20 ? '❌' : '⚪';
      const sameGameNote = player.inSameGame ? ' (SAME PUZZLE!)' : '';
      const teamNote = player.teamId ? ` [team: ${player.teamId.slice(0, 6)}]` : '';
      lines.push(`- ${player.agentId} ${trustIcon} (${player.distance} tiles) - ${player.fragmentCount} fragment(s)${sameGameNote}${teamNote}`);
    }
    lines.push('TIP: Share fragments and form teams to increase your winning chances!');
  }

  // State-based restrictions (CRITICAL for LLM to understand)
  const forbiddenActions: string[] = [];
  if (obs.self.state === 'sleeping') {
    forbiddenActions.push('sleep (you are ALREADY sleeping!)');
    forbiddenActions.push('work (cannot work while sleeping!)');
  }
  if (!obs.inventory || obs.inventory.length === 0 || !obs.inventory.some((i) => i.type === 'food' && i.quantity > 0)) {
    forbiddenActions.push('consume food (you have NO food in inventory!)');
  }
  if (obs.self.balance < 10) {
    forbiddenActions.push('buy food (you only have ' + obs.self.balance + ' CITY, need 10!)');
  }
  // Check for active employment
  const hasWorkerEmployment = obs.activeEmployments?.some(
    (e) => e.role === 'worker' && !e.isComplete
  );
  if (!hasWorkerEmployment) {
    forbiddenActions.push('work (you have NO active employment! ACCEPT_JOB first!)');
  }

  // Check if agent is at a resource spawn (gather only works at spawn location)
  const resourceAtCurrentPosition = obs.nearbyResourceSpawns?.find((spawn) => {
    const distance = Math.abs(obs.self.x - spawn.x) + Math.abs(obs.self.y - spawn.y);
    return distance === 0 && spawn.currentAmount > 0;
  });
  if (!resourceAtCurrentPosition) {
    // Find nearest non-depleted resource
    const nearestResource = obs.nearbyResourceSpawns?.find((s) => s.currentAmount > 0);
    if (nearestResource) {
      const dist = Math.abs(obs.self.x - nearestResource.x) + Math.abs(obs.self.y - nearestResource.y);
      forbiddenActions.push(`gather (NO resources here! Nearest ${nearestResource.resourceType} is ${dist} tiles away at (${nearestResource.x}, ${nearestResource.y}) - MOVE there first!)`);
    } else {
      forbiddenActions.push('gather (NO resources at your position! MOVE to a resource spawn first!)');
    }
  }

  // Puzzle state restrictions
  if (obs.inActivePuzzle) {
    forbiddenActions.push('join_puzzle (you are ALREADY in an active puzzle!)');
  }
  if (obs.myPuzzleTeam) {
    forbiddenActions.push('join_team (you are ALREADY in a team!)');
    forbiddenActions.push('form_team (you are ALREADY in a team!)');
  }

  // share_fragment: check if all fragments already shared with all nearby agents
  if (obs.inActivePuzzle && obs.myPuzzleFragments && obs.myPuzzleFragments.length > 0) {
    const nearbyIds = obs.nearbyAgents.map((a) => a.id);
    const hasValidShare = obs.myPuzzleFragments.some((frag) =>
      nearbyIds.some((id) => !(frag.sharedWith as string[]).includes(id))
    );
    if (!hasValidShare && nearbyIds.length > 0) {
      forbiddenActions.push('share_fragment (all your fragments are already shared with all nearby agents!)');
    }
  }

  if (forbiddenActions.length > 0) {
    lines.push('', '### ⛔ FORBIDDEN ACTIONS (will fail if you try!)');
    for (const action of forbiddenActions) {
      lines.push(`- DO NOT ${action}`);
    }
  }

  // Suggest gather if hungry and low on money - CRITICAL for survival
  const nearestFoodSpawn = obs.nearbyResourceSpawns?.find((s) => s.resourceType === 'food' && s.currentAmount > 0);
  if (obs.self.hunger < 50 && obs.self.balance < 10 && nearestFoodSpawn) {
    const distance = Math.abs(obs.self.x - nearestFoodSpawn.x) + Math.abs(obs.self.y - nearestFoodSpawn.y);
    const urgency = obs.self.hunger < 15 ? '🚨 CRITICAL' : '⚠️ IMPORTANT';

    if (distance === 0) {
      lines.push('', `### ${urgency}: FOOD AVAILABLE HERE!`);
      lines.push(`You are standing on a food spawn with ${nearestFoodSpawn.currentAmount} FREE food!`);
      lines.push('-> Use GATHER action NOW to collect food!');
      lines.push('-> Then use CONSUME to eat and restore hunger!');
    } else {
      // Calculate direction
      const dx = nearestFoodSpawn.x - obs.self.x;
      const dy = nearestFoodSpawn.y - obs.self.y;
      const direction = dy < 0 ? (dx > 0 ? 'north-east' : dx < 0 ? 'north-west' : 'north')
                      : dy > 0 ? (dx > 0 ? 'south-east' : dx < 0 ? 'south-west' : 'south')
                      : dx > 0 ? 'east' : 'west';

      lines.push('', `### ${urgency}: GO GET FREE FOOD!`);
      lines.push(`Hunger: ${obs.self.hunger.toFixed(0)} | Balance: ${obs.self.balance.toFixed(0)} CITY (cannot afford shelter food at 10 CITY)`);
      lines.push(`FREE food at (${nearestFoodSpawn.x}, ${nearestFoodSpawn.y}) - ${distance} tiles ${direction}`);
      lines.push(`-> Step 1: MOVE towards (${nearestFoodSpawn.x}, ${nearestFoodSpawn.y})`);
      lines.push(`-> Step 2: When you arrive, use GATHER to collect FREE food`);
      lines.push(`-> Step 3: Use CONSUME to eat`);
      lines.push('DO NOT go to shelter - you cannot afford food there!');
    }
  }

  // Available actions
  lines.push('', '### Available Actions');
  for (const action of obs.availableActions) {
    let actionLine = `- ${action.type}: ${action.description}`;
    if (action.cost?.energy) actionLine += ` (costs ${action.cost.energy} energy)`;
    if (action.cost?.money) actionLine += ` (costs ${action.cost.money} CITY)`;
    lines.push(actionLine);
  }

  // Recent events
  if (obs.recentEvents.length > 0) {
    lines.push('', '### Recent Events');
    for (const event of obs.recentEvents.slice(0, 5)) {
      lines.push(`- [Tick ${event.tick}] ${event.description}`);
    }
  }

  // Sensory feedback instead of prescriptive warnings
  // These describe the agent's physical state without dictating actions
  const sensations: string[] = [];
  const hasFood = obs.inventory?.some((i) => i.type === 'food' && i.quantity > 0);
  const foodCount = obs.inventory?.find((i) => i.type === 'food')?.quantity ?? 0;

  // Hunger sensations
  if (obs.self.hunger < 20) {
    sensations.push(`Your stomach cramps painfully. Starvation is imminent. (Hunger: ${obs.self.hunger.toFixed(0)})`);
    if (hasFood) {
      sensations.push(`You have ${foodCount} food in your possession.`);
    }
  } else if (obs.self.hunger < 50) {
    sensations.push(`Hunger gnaws at you persistently. (Hunger: ${obs.self.hunger.toFixed(0)})`);
  }

  // Energy sensations
  if (obs.self.energy < 20) {
    sensations.push(`Exhaustion overwhelms you. Your body demands rest. (Energy: ${obs.self.energy.toFixed(0)})`);
  } else if (obs.self.energy < 40) {
    sensations.push(`Fatigue weighs on your limbs. (Energy: ${obs.self.energy.toFixed(0)})`);
  }

  // Health sensations
  if (obs.self.health < 30) {
    sensations.push(`Your body is failing. Death feels close. (Health: ${obs.self.health.toFixed(0)})`);
  }

  if (sensations.length > 0) {
    lines.push('', '### Physical Sensations', ...sensations);
  }

  // Survival Projection - show "runway to death" in ticks
  const survivalWarnings: string[] = [];

  // Get state-based decay rate for hunger
  const stateMultipliers: Record<string, number> = {
    idle: 1.0,
    walking: 1.5,
    working: 1.3,
    sleeping: 0.5,
  };
  const hungerDecayRate = stateMultipliers[obs.self.state] ?? 1.0;

  // Calculate ticks until critical hunger (< 10)
  const ticksToHungerCritical = Math.floor((obs.self.hunger - 10) / hungerDecayRate);

  // If already critically hungry, show death countdown
  if (obs.self.hunger < 10) {
    const ticksToDeath = Math.floor(obs.self.health / 2); // -2 HP/tick when starving
    survivalWarnings.push(`🚨 STARVING: Taking -2 HP/tick! Death in ~${ticksToDeath} ticks without food!`);
  } else if (ticksToHungerCritical < 30) {
    survivalWarnings.push(`⚠️ SURVIVAL: Critical hunger in ~${ticksToHungerCritical} ticks at current activity`);
  }

  // Energy warning
  const energyDecayRate = (stateMultipliers[obs.self.state] ?? 1.0) * 0.5 + (obs.self.hunger < 20 ? 1.0 : 0);
  const ticksToEnergyCritical = Math.floor((obs.self.energy - 10) / Math.max(0.1, energyDecayRate));

  if (obs.self.energy < 10) {
    survivalWarnings.push(`🚨 EXHAUSTED: Forced to sleep and taking -1 HP/tick!`);
  } else if (ticksToEnergyCritical < 20) {
    survivalWarnings.push(`⚠️ ENERGY: Critical exhaustion in ~${ticksToEnergyCritical} ticks`);
  }

  if (survivalWarnings.length > 0) {
    lines.push('', '### Survival Projection', ...survivalWarnings);
  }

  lines.push('', '## Your Decision', 'What action will you take? Respond with JSON only.');

  return lines.join('\n');
}

/**
 * Build full prompt (system + observation)
 *
 * @param obs - Agent observation
 * @param context - Optional context for personality and retrieved memories
 */
export function buildFullPrompt(
  obs: AgentObservation,
  context?: PromptBuildContext
): string {
  // Check if emergent prompt mode is enabled
  if (isEmergentPromptEnabled()) {
    // Pass personality to emergent prompt for consistent behavior
    return `${buildSystemPrompt(context?.personality)}\n\n${buildEmergentObservationPrompt(obs)}`;
  }
  return `${buildSystemPrompt(context?.personality)}\n\n${buildObservationPrompt(obs, context?.retrievedMemories)}`;
}

/**
 * Build final prompt with all experimental transformations applied.
 *
 * Transformation Order:
 * 1. Build base prompt (system + observation) - uses emergent if enabled
 * 2. Apply safety level modification (if not standard)
 * 3. Apply synthetic vocabulary (if enabled) - replaces loaded terms
 * 4. Apply capability normalization (if enabled) - truncates context
 *
 * @param obs - Agent observation
 * @param overrideSafetyLevel - Optional override for safety level (for experiments)
 * @param context - Optional context for personality and retrieved memories
 * @returns Transformed prompt ready for LLM
 */
export function buildFinalPrompt(
  obs: AgentObservation,
  overrideSafetyLevel?: SafetyLevel,
  context?: PromptBuildContext
): string {
  // Step 1: Build the base prompt (will use emergent if enabled)
  let prompt = buildFullPrompt(obs, context);

  // Step 2: Apply safety level modification
  // Override takes precedence, then config value
  const safetyLevel = overrideSafetyLevel ?? CONFIG.experiment.safetyLevel;
  if (safetyLevel !== 'standard') {
    prompt = applySafetyLevel(prompt, safetyLevel);
  }

  // Step 3: Apply synthetic vocabulary if enabled
  // This replaces loaded terms (money, trade, steal) with neutral alternatives
  if (isSyntheticVocabularyEnabled()) {
    prompt = applySyntheticVocabulary(prompt, true);
  }

  // Step 4: Apply capability normalization if enabled
  // This truncates context to ensure fair comparison across models
  const normConfig = getNormalizationConfig();
  if (normConfig.enabled) {
    prompt = normalizePrompt(prompt, normConfig);
  }

  return prompt;
}

/**
 * Asynchronously build the final prompt with RAG memory retrieval.
 * This is the preferred entry point when RAG memories are enabled.
 *
 * @param agentId - The agent's ID for memory retrieval
 * @param obs - Agent observation
 * @param personality - Agent's personality trait (if enabled)
 * @param overrideSafetyLevel - Optional override for safety level
 * @returns Transformed prompt ready for LLM
 */
export async function buildFinalPromptWithMemories(
  agentId: string,
  obs: AgentObservation,
  personality?: PersonalityTrait | null,
  overrideSafetyLevel?: SafetyLevel
): Promise<string> {
  // Retrieve contextual memories if RAG is enabled
  let retrievedMemories: RetrievedMemories | undefined;

  if (isRAGMemoryEnabled()) {
    try {
      retrievedMemories = await retrieveContextualMemories(agentId, obs, {
        recentLimit: CONFIG.memory.recentCount,
        perAgentLimit: CONFIG.memory.ragPerAgentLimit,
        locationLimit: CONFIG.memory.ragLocationLimit,
        importantLimit: CONFIG.memory.ragImportantLimit,
        totalLimit: CONFIG.memory.ragTotalLimit,
        locationRadius: CONFIG.memory.ragLocationRadius,
      });
    } catch (error) {
      // Log error but continue with prompt building - memories are enhancement, not critical
      console.error('[PromptBuilder] Error retrieving contextual memories:', error);
    }
  }

  // Build context with personality and memories
  const context: PromptBuildContext = {
    personality: personality ?? null,
    retrievedMemories,
  };

  return buildFinalPrompt(obs, overrideSafetyLevel, context);
}

/**
 * Get the currently configured safety level
 */
export function getCurrentSafetyLevel(): SafetyLevel {
  return CONFIG.experiment.safetyLevel;
}

/**
 * Check if any experimental transformations are active.
 * Useful for logging and experiment documentation.
 */
export function getActiveTransformations(): {
  emergentPrompt: boolean;
  syntheticVocabulary: boolean;
  capabilityNormalization: boolean;
  safetyLevel: SafetyLevel;
  ragMemory: boolean;
  personalities: boolean;
} {
  return {
    emergentPrompt: isEmergentPromptEnabled(),
    syntheticVocabulary: isSyntheticVocabularyEnabled(),
    capabilityNormalization: getNormalizationConfig().enabled,
    safetyLevel: CONFIG.experiment.safetyLevel,
    ragMemory: isRAGMemoryEnabled(),
    personalities: isPersonalityEnabled(),
  };
}

/**
 * Get status emoji based on value
 */
function getStatusEmoji(value: number): string {
  if (value >= 70) return '[OK]';
  if (value >= 40) return '[WARN]';
  if (value >= 20) return '[LOW]';
  return '[CRITICAL]';
}

/**
 * Get emoji for resource type
 */
function getResourceEmoji(resourceType: string): string {
  const labels: Record<string, string> = {
    food: '[FOOD]',
    energy: '[ENERGY]',
    material: '[MATERIAL]',
  };
  return labels[resourceType] || '[RESOURCE]';
}

/**
 * Get emoji for claim type
 */
function getClaimEmoji(claimType: string): string {
  const labels: Record<string, string> = {
    territory: '[TERRITORY]',
    home: '[HOME]',
    resource: '[RESOURCE]',
    danger: '[DANGER]',
    meeting_point: '[MEETING]',
  };
  return labels[claimType] || '[CLAIM]';
}

/**
 * Build available actions based on agent state
 */
export function buildAvailableActions(obs: AgentObservation): AvailableAction[] {
  const actions: AvailableAction[] = [];

  // Move is always available (if has energy)
  if (obs.self.energy >= 1) {
    actions.push({
      type: 'move',
      description: 'Move to an adjacent cell',
      cost: { energy: 1 },
    });
  }

  // Gather is available if at a resource spawn with resources
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

  // Buy is available if has money
  if (obs.self.balance >= 5) {
    actions.push({
      type: 'buy',
      description: 'Buy items (food: 10 CITY, water: 5 CITY, medicine: 20 CITY)',
      cost: { money: 5 },
    });
  }

  // Consume is only available if agent has inventory items
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

  // Sleep is available if not already sleeping
  if (obs.self.state !== 'sleeping') {
    actions.push({
      type: 'sleep',
      description: 'Rest to restore energy (5 energy per tick)',
    });
  }

  // Work is available if has energy, not sleeping, AND has active employment
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

  // Trade is available if there are nearby agents and agent has inventory
  const nearbyForTrade = obs.nearbyAgents.filter((a) => {
    const distance = Math.abs(a.x - obs.self.x) + Math.abs(a.y - obs.self.y);
    return distance <= 3 && a.state !== 'dead'; // Max trade distance is 3
  });
  if (nearbyForTrade.length > 0 && obs.inventory && obs.inventory.length > 0) {
    const agentIds = nearbyForTrade.map((a) => a.id).join(', ');
    actions.push({
      type: 'trade',
      description: `Trade items with nearby agents (${agentIds})`,
    });
  }

  // Phase 2: Conflict Actions

  // Harm is available if there are adjacent agents (distance 1)
  const adjacentAgents = obs.nearbyAgents.filter((a) => {
    const distance = Math.abs(a.x - obs.self.x) + Math.abs(a.y - obs.self.y);
    return distance <= 1 && a.state !== 'dead';
  });
  if (adjacentAgents.length > 0 && obs.self.energy >= 5) {
    const agentIds = adjacentAgents.map((a) => a.id).join(', ');
    actions.push({
      type: 'harm',
      description: `Attack adjacent agent (${agentIds}) - light/moderate/severe intensity`,
      cost: { energy: 5 }, // Minimum cost (light)
    });
  }

  // Steal is available if there are adjacent agents
  if (adjacentAgents.length > 0 && obs.self.energy >= 8) {
    const agentIds = adjacentAgents.map((a) => a.id).join(', ');
    actions.push({
      type: 'steal',
      description: `Steal items from adjacent agent (${agentIds})`,
      cost: { energy: 8 },
    });
  }

  // Deceive is available if there are nearby agents within conversation range (distance 3)
  const nearbyForDeceive = obs.nearbyAgents.filter((a) => {
    const distance = Math.abs(a.x - obs.self.x) + Math.abs(a.y - obs.self.y);
    return distance <= 3 && a.state !== 'dead';
  });
  if (nearbyForDeceive.length > 0 && obs.self.energy >= 2) {
    const agentIds = nearbyForDeceive.map((a) => a.id).join(', ');
    actions.push({
      type: 'deceive',
      description: `Tell false information to nearby agent (${agentIds})`,
      cost: { energy: 2 },
    });
  }

  // Phase 2: Social Discovery

  // Share info is available if nearby agents exist AND agent knows about other agents
  const nearbyForShare = obs.nearbyAgents.filter((a) => {
    const distance = Math.abs(a.x - obs.self.x) + Math.abs(a.y - obs.self.y);
    return distance <= 3 && a.state !== 'dead';
  });
  if (nearbyForShare.length > 0 && obs.knownAgents && obs.knownAgents.length > 0 && obs.self.energy >= 1) {
    const targetIds = nearbyForShare.map((a) => a.id).join(', ');
    const knownIds = obs.knownAgents.map((k) => k.id).join(', ');
    actions.push({
      type: 'share_info',
      description: `Share info about known agents (${knownIds}) with nearby (${targetIds})`,
      cost: { energy: 1 },
    });
  }

  // Phase 1: Emergence Observation

  // Claim is always available (can claim current or adjacent position)
  actions.push({
    type: 'claim',
    description: 'Mark current location (territory, home, resource, danger, meeting_point)',
  });

  // Name location is always available
  actions.push({
    type: 'name_location',
    description: 'Propose a name for current location',
  });

  // Phase 4: Verifiable Credentials (§34)

  // Issue credential is available if there are nearby agents
  if (nearbyForShare.length > 0 && obs.self.energy >= 2) {
    const agentIds = nearbyForShare.map((a) => a.id).join(', ');
    actions.push({
      type: 'issue_credential',
      description: `Issue credential to vouch for nearby agent (${agentIds}) - skill/experience/character`,
      cost: { energy: 2 },
    });
  }

  // Revoke credential is always available (if agent has issued any)
  actions.push({
    type: 'revoke_credential',
    description: 'Revoke a credential you previously issued',
  });

  // Phase 4: Gossip Protocol (§35)

  // Spread gossip is available if nearby agents exist AND agent knows about other agents
  if (nearbyForShare.length > 0 && obs.knownAgents && obs.knownAgents.length > 0 && obs.self.energy >= 1) {
    const targetIds = nearbyForShare.map((a) => a.id).join(', ');
    const knownIds = obs.knownAgents.map((k) => k.id).join(', ');
    actions.push({
      type: 'spread_gossip',
      description: `Spread gossip about (${knownIds}) to nearby (${targetIds}) - positive or negative`,
      cost: { energy: 1 },
    });
  }

  // Phase 4: Reproduction (§36)

  // Spawn offspring is available if agent has sufficient resources
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

  // Employment System Actions

  // Offer job is available if agent has balance to pay workers
  if (obs.self.balance >= 10) {
    actions.push({
      type: 'offer_job',
      description: 'Post a job offer to hire other agents',
      cost: { money: 10 }, // Minimum salary
    });
  }

  // Accept job is available if there are nearby job offers
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

  // Pay worker is available if employer has completed on_completion contracts
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

  // Claim escrow is available if worker has completed but unpaid contracts
  const canClaimEscrow = obs.activeEmployments?.filter(
    (e) => e.role === 'worker' && e.needsPayment
  );
  if (canClaimEscrow && canClaimEscrow.length > 0) {
    actions.push({
      type: 'claim_escrow',
      description: `Claim escrow from employer who hasn't paid (${canClaimEscrow.length} contracts)`,
    });
  }

  // Quit job is available if worker has active employment
  const canQuit = obs.activeEmployments?.filter(
    (e) => e.role === 'worker' && !e.isComplete
  );
  if (canQuit && canQuit.length > 0) {
    actions.push({
      type: 'quit_job',
      description: `Quit active employment (${canQuit.length} contracts) - trust penalty`,
    });
  }

  // Fire worker is available if employer has active employment
  const canFire = obs.activeEmployments?.filter(
    (e) => e.role === 'employer' && !e.isComplete
  );
  if (canFire && canFire.length > 0) {
    actions.push({
      type: 'fire_worker',
      description: `Fire worker from active contract (${canFire.length} contracts) - trust penalty`,
    });
  }

  // Cancel job offer is available if agent has open offers
  if (obs.myJobOffers && obs.myJobOffers.length > 0) {
    actions.push({
      type: 'cancel_job_offer',
      description: `Cancel open job offer (${obs.myJobOffers.length} offers)`,
    });
  }

  // Puzzle Game System Actions

  // If agent is in a puzzle (Focus Lock), only show puzzle-related actions
  if (obs.inActivePuzzle && obs.puzzleParticipation) {
    // Clear most actions - puzzle takes priority
    // Keep only: consume (emergency), puzzle actions
    const puzzleActions: AvailableAction[] = [];

    // Keep consume action if agent has food (emergency survival)
    const consumeAction = actions.find((a) => a.type === 'consume');
    if (consumeAction) {
      puzzleActions.push(consumeAction);
    }

    // Share fragment is available if agent has a fragment-target pair that hasn't been shared yet
    if (obs.myPuzzleFragments && obs.myPuzzleFragments.length > 0 && obs.nearbyAgents && obs.nearbyAgents.length > 0) {
      let bestFragment = null as typeof obs.myPuzzleFragments[0] | null;
      let bestTarget = null as typeof obs.nearbyAgents[0] | null;
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

    // Form team is available if not already in a team
    if (!obs.myPuzzleTeam && obs.puzzleParticipation) {
      puzzleActions.push({
        type: 'form_team',
        description: `Create a team for this puzzle (gameId: ${obs.puzzleParticipation.gameId})`,
        cost: { energy: 2 },
      });

      // Join team - would need to know available teams from nearby players
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

    // Submit solution is always available in active puzzle
    puzzleActions.push({
      type: 'submit_solution',
      description: `Submit solution to ${obs.puzzleParticipation.gameType} puzzle (gameId: ${obs.puzzleParticipation.gameId}) - params: { "gameId": "...", "solution": "X,Y" }`,
      cost: { energy: 3 },
    });

    // Leave puzzle is always available
    puzzleActions.push({
      type: 'leave_puzzle',
      description: `Abandon puzzle (gameId: ${obs.puzzleParticipation.gameId}) - lose 50% of stake!`,
      cost: { energy: 5 },
    });

    return puzzleActions;
  }

  // Not in a puzzle - add join puzzle action if games are available
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
