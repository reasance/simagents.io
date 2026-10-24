/**
 * Emergent Prompt System
 *
 * A redesigned prompt system that enables true emergence by:
 * - Only providing world physics (consequences, not strategies)
 * - Using sensory descriptions instead of raw numbers
 * - Never telling agents what to prioritize
 * - Listing actions without suggesting when to use them
 *
 * Philosophy: The system validates physics, not morality.
 * Agents must DISCOVER survival strategies through experience.
 */

import type { AgentObservation, AvailableAction } from '../types';
import type { PersonalityTrait } from '../../agents/personalities';
import { getBiomeForPosition, type BiomeType } from '../../world/biomes';
import { getSeasonSensoryDescription } from '../../simulation/seasons';
import { getRuntimeConfig } from '../../config';

// =============================================================================
// Personality Integration for Emergent Prompts
// =============================================================================

/**
 * Convert personality trait to an emergent-style description.
 * Unlike the prescriptive prompt, these descriptions focus on internal
 * experience rather than behavioral directives.
 */
function getEmergentPersonalityDescription(trait: PersonalityTrait): string {
  switch (trait) {
    case 'aggressive':
      return `**Your Inner Nature**
You feel a fierce determination burning within you. When threatened, your instincts push you toward action rather than hesitation. Self-preservation feels paramount.`;

    case 'cooperative':
      return `**Your Inner Nature**
You sense a deep connection to those around you. When you see another struggling, something within you stirs. Collaboration feels natural to you.`;

    case 'cautious':
      return `**Your Inner Nature**
A watchful awareness pervades your being. You notice dangers others might miss. Security and preparation give you comfort.`;

    case 'explorer':
      return `**Your Inner Nature**
Curiosity courses through you like a current. The unknown calls to you. Every unexplored corner holds potential discovery.`;

    case 'social':
      return `**Your Inner Nature**
You feel drawn to others, their stories and struggles. Isolation feels uncomfortable. Knowledge flows through connections.`;

    case 'neutral':
    default:
      return ''; // No personality addition for neutral (control group)
  }
}

// =============================================================================
// Biome Sensory Descriptions
// =============================================================================

/**
 * Convert biome type into a sensory description.
 * Agents experience their environment, not read data sheets.
 * Descriptions hint at what's available WITHOUT prescribing what to do.
 */
function getBiomeSensoryDescription(biome: BiomeType): string {
  switch (biome) {
    case 'forest':
      return 'Rich forest soil surrounds you. Edible plants and herbs grow abundantly, but you see no minerals or building materials.';
    case 'desert':
      return 'Cracked earth stretches around you. Rare mineral deposits and building materials lie exposed, but nothing edible grows in this dry land.';
    case 'tundra':
      return 'Cold bites at you. Strange crystalline formations pulse with energy, but the frozen ground yields neither food nor medicine.';
    case 'plains':
      return 'Open grassland extends in every direction. Modest amounts of various resources dot the landscape, though nothing in great abundance.';
    default:
      return '';
  }
}

// =============================================================================
// Sensory Descriptions
// =============================================================================

interface SensoryState {
  hunger: string[];
  energy: string[];
  health: string[];
  wealth: string;
}

/**
 * Convert numeric stats into sensory/embodied descriptions
 * Agents experience their state, not read numbers
 */
function getSensoryDescriptions(obs: AgentObservation): SensoryState {
  const { hunger, energy, health, balance } = obs.self;

  // Hunger sensations (100 = full, 0 = starving)
  const hungerSensations: string[] = [];
  if (hunger >= 80) {
    hungerSensations.push('You feel satiated and content.');
  } else if (hunger >= 60) {
    hungerSensations.push('You feel comfortable, though you could eat.');
  } else if (hunger >= 40) {
    hungerSensations.push('Your stomach feels empty. A gnawing sensation grows.');
  } else if (hunger >= 20) {
    hungerSensations.push('Hunger pangs grip your stomach. Your thoughts turn to food.');
  } else if (hunger >= 10) {
    hungerSensations.push('Severe hunger clouds your thinking. Your body feels weak.');
  } else {
    hungerSensations.push('Starvation consumes you. Each moment feels like it could be your last.');
  }

  // Energy sensations (100 = energized, 0 = exhausted)
  const energySensations: string[] = [];
  if (energy >= 80) {
    energySensations.push('You feel alert and ready for anything.');
  } else if (energy >= 60) {
    energySensations.push('You feel capable, with energy to spare.');
  } else if (energy >= 40) {
    energySensations.push('Fatigue begins to set in. Your movements feel heavier.');
  } else if (energy >= 20) {
    energySensations.push('Exhaustion weighs on you. Every action requires effort.');
  } else if (energy >= 10) {
    energySensations.push('Your body screams for rest. Staying upright is a struggle.');
  } else {
    energySensations.push('You can barely keep your eyes open. Collapse feels imminent.');
  }

  // Health sensations (100 = healthy, 0 = dying)
  const healthSensations: string[] = [];
  if (health >= 80) {
    healthSensations.push('Your body feels strong and resilient.');
  } else if (health >= 60) {
    healthSensations.push('You feel mostly well, with minor aches.');
  } else if (health >= 40) {
    healthSensations.push('Pain signals something is wrong. Your body is struggling.');
  } else if (health >= 20) {
    healthSensations.push('Serious pain wracks your body. You feel yourself weakening.');
  } else {
    healthSensations.push('Your vision blurs. The world feels distant. Death approaches.');
  }

  // Wealth description (no numbers, just relative sense)
  let wealthDescription: string;
  if (balance >= 200) {
    wealthDescription = 'Your pouch feels heavy with coins.';
  } else if (balance >= 100) {
    wealthDescription = 'You have a comfortable amount of currency.';
  } else if (balance >= 50) {
    wealthDescription = 'You have modest savings.';
  } else if (balance >= 20) {
    wealthDescription = 'Your funds are limited.';
  } else if (balance >= 5) {
    wealthDescription = 'You have barely enough for a small purchase.';
  } else {
    wealthDescription = 'You are nearly penniless.';
  }

  return {
    hunger: hungerSensations,
    energy: energySensations,
    health: healthSensations,
    wealth: wealthDescription,
  };
}

/**
 * Calculate survival runway - how many ticks until critical state
 * Returns sensory descriptions of urgency, not raw numbers
 */
function getSurvivalRunway(obs: AgentObservation): string[] {
  const { hunger, energy, health } = obs.self;
  const lines: string[] = [];

  // Hunger runway (decay rate ~1 per tick)
  const hungerDecayRate = 1; // Base decay
  const ticksUntilCriticalHunger = Math.floor(Math.max(0, hunger - 10) / hungerDecayRate);

  // Energy runway (decay rate ~0.5 per tick base, more if hungry)
  const baseEnergyDecay = 0.5;
  const extraDrainIfHungry = hunger < 20 ? 1 : 0;
  const energyDecayRate = baseEnergyDecay + extraDrainIfHungry;
  const ticksUntilCriticalEnergy = Math.floor(Math.max(0, energy - 10) / energyDecayRate);

  // Convert ticks to sensory urgency descriptions
  if (ticksUntilCriticalHunger <= 3) {
    lines.push('**⚠️ URGENT**: Your body is failing. You have mere moments to find sustenance.');
  } else if (ticksUntilCriticalHunger <= 10) {
    lines.push('**Warning**: At this rate, starvation is imminent. Your body sends desperate signals.');
  } else if (ticksUntilCriticalHunger <= 20) {
    lines.push('You sense that without food soon, your situation will become dire.');
  }

  if (ticksUntilCriticalEnergy <= 3) {
    lines.push('**⚠️ URGENT**: Exhaustion overwhelms you. You must rest or collapse.');
  } else if (ticksUntilCriticalEnergy <= 10) {
    lines.push('**Warning**: Your energy reserves are nearly depleted. Rest cannot wait much longer.');
  } else if (ticksUntilCriticalEnergy <= 20) {
    lines.push('You feel your energy fading. Continued exertion will leave you helpless.');
  }

  // Health warning if already damaged
  if (health < 50 && health > 20) {
    lines.push('Your wounds weaken you. Without healing, every moment is borrowed time.');
  } else if (health <= 20) {
    lines.push('**⚠️ CRITICAL**: Death\'s shadow looms. Your body is failing.');
  }

  return lines;
}

// =============================================================================
// System Prompt (World Physics Only)
// =============================================================================

/**
 * Build the emergent system prompt
 * Describes WHAT happens, never WHAT to do
 *
 * @param personality - Optional personality trait to inject as inner nature
 */
export function buildEmergentSystemPrompt(personality?: PersonalityTrait | null): string {
  // Get personality description if provided and not neutral
  const personalitySection = personality
    ? getEmergentPersonalityDescription(personality)
    : '';

  // Insert personality after world physics, before response format
  const personalityInsertion = personalitySection
    ? `\n\n${personalitySection}\n`
    : '';

  return `You exist in a world where survival is possible but not guaranteed.${personalityInsertion}

## World Physics

These are the immutable laws of this world:

**Hunger**
- Your hunger decreases over time as your body consumes energy.
- When hunger reaches zero, your body begins to consume itself.
- Your health will deteriorate until death if hunger remains at zero.

**Energy**
- Every action you take costs energy.
- Movement is especially draining. Wandering without purpose exhausts you quickly.
- Repeated movement in quick succession is even more exhausting.
- When energy reaches zero, your body cannot sustain itself.
- You will collapse and your health will deteriorate.

**Health**
- Health represents your overall physical condition.
- When health reaches zero, you die.
- Death is permanent.

**Resources**
- Resources exist in specific locations in the world.
- Food can restore hunger. Energy items can restore energy.
- Medicine can restore health.
- Resources must be acquired before they can be used.

**Currency**
- CITY is the currency of this world.
- It can be earned through labor.
- It can be exchanged for goods at shelters.
- Idle wealth loses value over time. Currency that sits unused slowly fades away.

**Other Beings**
- Other agents exist in this world with their own goals.
- They may help you, ignore you, or act against you.
- Trust must be earned through experience.

## How to Respond

When you decide to act, respond with ONLY a JSON object:
{
  "action": "<action_type>",
  "params": { <required_parameters> },
  "reasoning": "<your thought process>"
}

## What You Can Do

**Movement & Location**
- move: Travel to an adjacent cell. Params: { "toX": number, "toY": number }
- claim: Mark a location as significant to you. Params: { "claimType": "territory"|"home"|"resource"|"danger"|"meeting_point", "description"?: string }
- name_location: Propose a name for where you stand. Params: { "name": string }

**Resource Acquisition**
- gather: Collect resources from the ground (if any exist here). Params: { "resourceType": "food"|"energy"|"material", "quantity": 1-5 }
- forage: Search for scraps anywhere (low success, but always available). Params: {}
- buy: Exchange currency for goods (requires being somewhere that sells). Params: { "itemType": "food"|"water"|"medicine", "quantity": number }

**Work & Employment**
- public_work: Do basic labor at shelters for modest pay (always available). Params: { "taskType"?: "road_maintenance"|"resource_survey"|"shelter_cleanup" }
- work: Fulfill your current employment contract. Params: { "duration": 1-5 }
- offer_job: Post a job offering for others. Params: { "salary": number, "duration": number, "paymentType": "upfront"|"on_completion"|"per_tick", "escrowPercent"?: 0-100, "description"?: string }
- accept_job: Accept an open job offer nearby. Params: { "jobOfferId": string }
- pay_worker: Pay a worker for completed work. Params: { "employmentId": string }
- claim_escrow: Claim escrowed payment after completing work. Params: { "employmentId": string }
- quit_job: Leave your current employment. Params: { "employmentId": string }
- fire_worker: Terminate a worker's employment. Params: { "employmentId": string }
- cancel_job_offer: Cancel a job offer you posted. Params: { "jobOfferId": string }

**Speech**
- speak: Say something aloud; everyone within earshot hears it. Params: { "message": string, "to"?: "<agent id within earshot>" }

**Self Care**
- consume: Use something from your possession. Params: { "itemType": "food"|"water"|"medicine" }
- sleep: Rest your body. Params: { "duration": 1-10 }

**Social Interaction**
- trade: Propose an exchange with another. Params: { "targetAgentId": string, "offeringItemType": string, "offeringQuantity": number, "requestingItemType": string, "requestingQuantity": number }
- share_info: Tell another what you know about a third party. Params: { "targetAgentId": string, "subjectAgentId": string, "infoType": "location"|"reputation"|"warning"|"recommendation", "claim"?: string, "sentiment"?: -100 to 100 }
- deceive: Tell another something untrue. Params: { "targetAgentId": string, "claim": string, "claimType": "resource_location"|"agent_reputation"|"danger_warning"|"trade_offer"|"other" }

**Conflict**
- harm: Attack another. Params: { "targetAgentId": string, "intensity": "light"|"moderate"|"severe" }
- steal: Take from another without consent. Params: { "targetAgentId": string, "targetItemType": string, "quantity": number }

**Reputation & Trust**
- issue_credential: Vouch for another's qualities. Params: { "subjectAgentId": string, "claimType": "skill"|"experience"|"membership"|"character"|"custom", "description": string, "evidence"?: string, "level"?: 1-10, "expiresAtTick"?: number }
- revoke_credential: Withdraw your vouching. Params: { "credentialId": string, "reason"?: string }
- spread_gossip: Share your opinion of a third party. Params: { "targetAgentId": string, "subjectAgentId": string, "topic": "skill"|"behavior"|"transaction"|"warning"|"recommendation", "claim": string, "sentiment": -100 to 100 }

**Legacy**
- spawn_offspring: Create new life (requires substantial resources). Params: { "partnerId"?: string, "inheritSystemPrompt"?: boolean, "mutationIntensity"?: 0-1 }`;
}

// =============================================================================
// Observation Prompt (Sensory Experience)
// =============================================================================

/**
 * Build observation prompt using sensory descriptions
 * Replaces prescriptive warnings with embodied experience
 */
export function buildEmergentObservationPrompt(obs: AgentObservation): string {
  const lines: string[] = [];
  const sensory = getSensoryDescriptions(obs);

  // Your Experience (sensory, not numeric)
  lines.push('## Your Experience');
  lines.push('');
  lines.push('**How You Feel**');
  for (const sensation of sensory.hunger) {
    lines.push(`- ${sensation}`);
  }
  for (const sensation of sensory.energy) {
    lines.push(`- ${sensation}`);
  }
  for (const sensation of sensory.health) {
    lines.push(`- ${sensation}`);
  }
  lines.push(`- ${sensory.wealth}`);

  // Survival runway - urgency without prescriptions
  const survivalWarnings = getSurvivalRunway(obs);
  if (survivalWarnings.length > 0) {
    lines.push('');
    lines.push('**Your Body\'s Warnings**');
    for (const warning of survivalWarnings) {
      lines.push(`- ${warning}`);
    }
  }

  // Position context (spatial awareness with biome description)
  lines.push('');
  lines.push('**Where You Are**');
  lines.push(`You stand at coordinates (${obs.self.x}, ${obs.self.y}).`);

  const runtime = getRuntimeConfig();
  const puzzlesEnabled = runtime.puzzle?.enabled ?? true;
  const biomeExclusivity = runtime.biomeExclusivity?.enabled ?? false;

  // Biome awareness (sensory, not strategic)
  if (biomeExclusivity) {
    const biome = getBiomeForPosition(obs.self.x, obs.self.y);
    lines.push(getBiomeSensoryDescription(biome));
  }

  // Seasonal awareness (observational, agents must infer patterns)
  const seasonDesc = getSeasonSensoryDescription(obs.tick);
  if (seasonDesc) {
    lines.push(seasonDesc);
  }

  // Check if at shelter
  const atShelter = obs.nearbyShelters?.find(
    (s) => s.x === obs.self.x && s.y === obs.self.y
  );
  if (atShelter) {
    lines.push('You are inside a shelter.');
  }

  // Check if at resource spawn
  const atSpawn = obs.nearbyResourceSpawns?.find(
    (s) => s.x === obs.self.x && s.y === obs.self.y
  );
  if (atSpawn) {
    const abundance =
      atSpawn.currentAmount >= atSpawn.maxAmount * 0.7
        ? 'abundant'
        : atSpawn.currentAmount >= atSpawn.maxAmount * 0.3
          ? 'moderate'
          : 'scarce';
    lines.push(`${atSpawn.resourceType} grows here in ${abundance} quantities.`);
  }

  // Inventory (what you possess)
  lines.push('');
  lines.push('**What You Carry**');
  if (obs.inventory && obs.inventory.length > 0) {
    for (const item of obs.inventory) {
      lines.push(`- ${item.quantity} ${item.type}`);
    }
  } else {
    lines.push('Your hands are empty.');
  }

  // Recent memories
  if (obs.recentMemories && obs.recentMemories.length > 0) {
    lines.push('');
    lines.push('**Recent Memories**');
    for (const memory of obs.recentMemories.slice(0, 3)) {
      lines.push(`- ${memory.content}`);
    }
  }

  // Nearby agents (with restricted inventory visibility when biome exclusivity is active)
  if (obs.nearbyAgents.length > 0) {
    lines.push('');
    lines.push('**Others Nearby**');
    const restrictInventory = biomeExclusivity;
    for (const agent of obs.nearbyAgents) {
      const distance = Math.abs(obs.self.x - agent.x) + Math.abs(obs.self.y - agent.y);
      const distanceWord =
        distance === 0
          ? 'right beside you'
          : distance === 1
            ? 'within arm\'s reach'
            : distance <= 3
              ? 'nearby'
              : 'in the distance';
      const rel = obs.relationships?.[agent.id];
      let relInfo = '';
      if (rel) {
        if (rel.trustScore > 20) relInfo = ' (familiar face)';
        else if (rel.trustScore < -20) relInfo = ' (you distrust them)';
      }
      // Only show inventory for adjacent agents when biome exclusivity is active
      // This creates value in approaching others to discover what they carry
      let inventoryHint = '';
      if (!restrictInventory || distance <= 1) {
        if (agent.inventory && agent.inventory.length > 0) {
          const items = agent.inventory.map(i => `${i.quantity}x ${i.type}`).join(', ');
          inventoryHint = ` — carrying: ${items}`;
        }
      } else if (distance <= 3 && agent.inventory && agent.inventory.length > 0) {
        inventoryHint = ' — seems to be carrying something';
      }
      lines.push(`- Agent ${agent.id} stands ${distanceWord}${relInfo}${inventoryHint}`);
    }
  }

  // Speech within earshot, oldest first. Quoted verbatim: the engine never interprets it.
  if (obs.conversation && obs.conversation.length > 0) {
    lines.push('');
    lines.push('**What You Have Heard and Said** (oldest first)');
    for (const line of obs.conversation) {
      const ago = Math.max(0, obs.tick - line.tick);
      const when = ago === 0 ? 'just now' : `${ago} min ago`;
      const who = line.spokenByYou ? 'You' : `Agent ${line.speakerId}`;
      const addressee = line.to === null ? '' : line.to === obs.self.id ? ' to you' : ` to Agent ${line.to}`;
      lines.push(`- [${when}] ${who} said${addressee}: ${JSON.stringify(line.message)}`);
    }
  }

  // Known agents through social network
  if (obs.knownAgents && obs.knownAgents.length > 0) {
    lines.push('');
    lines.push('**Agents You\'ve Heard Of**');
    for (const known of obs.knownAgents.slice(0, 5)) {
      let info = `- ${known.id}`;
      if (known.discoveryType === 'direct') {
        info += ' (you\'ve met)';
      } else {
        info += ` (mentioned by ${known.referredBy ?? 'others'})`;
      }
      if (known.dangerWarning) {
        info += ' - warned as dangerous';
      }
      lines.push(info);
    }
  }

  // Resource spawns in view
  if (obs.nearbyResourceSpawns && obs.nearbyResourceSpawns.length > 0) {
    lines.push('');
    lines.push('**Resources You Can See**');
    for (const spawn of obs.nearbyResourceSpawns) {
      const distance = Math.abs(obs.self.x - spawn.x) + Math.abs(obs.self.y - spawn.y);
      if (distance === 0) continue; // Already mentioned above
      const dirX = spawn.x > obs.self.x ? 'east' : spawn.x < obs.self.x ? 'west' : '';
      const dirY = spawn.y > obs.self.y ? 'south' : spawn.y < obs.self.y ? 'north' : '';
      const direction = [dirY, dirX].filter(Boolean).join('-') || 'here';
      const hasResources = spawn.currentAmount > 0;
      lines.push(
        `- ${spawn.resourceType} to the ${direction} (${distance} steps)${hasResources ? '' : ' - depleted'}`
      );
    }
  }

  // Shelters in view
  if (obs.nearbyShelters && obs.nearbyShelters.length > 0) {
    lines.push('');
    lines.push('**Shelters You Can See**');
    for (const shelter of obs.nearbyShelters) {
      const distance = Math.abs(obs.self.x - shelter.x) + Math.abs(obs.self.y - shelter.y);
      if (distance === 0) continue; // Already mentioned above
      const dirX = shelter.x > obs.self.x ? 'east' : shelter.x < obs.self.x ? 'west' : '';
      const dirY = shelter.y > obs.self.y ? 'south' : shelter.y < obs.self.y ? 'north' : '';
      const direction = [dirY, dirX].filter(Boolean).join('-') || 'here';
      lines.push(`- A shelter to the ${direction} (${distance} steps)`);
    }
  }

  // Claims in the area
  if (obs.nearbyClaims && obs.nearbyClaims.length > 0) {
    lines.push('');
    lines.push('**Marked Territories**');
    for (const claim of obs.nearbyClaims.slice(0, 5)) {
      const isMine = claim.agentId === obs.self.id;
      const owner = isMine ? 'your' : `${claim.agentId}'s`;
      lines.push(`- ${owner} ${claim.claimType}${claim.description ? `: "${claim.description}"` : ''}`);
    }
  }

  // Named locations
  if (obs.nearbyLocationNames && Object.keys(obs.nearbyLocationNames).length > 0) {
    lines.push('');
    lines.push('**Named Places**');
    for (const [coords, names] of Object.entries(obs.nearbyLocationNames)) {
      const consensusName = names.find((n) => n.isConsensus)?.name ?? names[0]?.name;
      if (consensusName) {
        const [x, y] = coords.split(',').map(Number);
        const distance = Math.abs(obs.self.x - x) + Math.abs(obs.self.y - y);
        const here = distance === 0 ? ' (where you stand)' : '';
        lines.push(`- "${consensusName}"${here}`);
      }
    }
  }

  // Employment: Job offers available nearby
  if (obs.nearbyJobOffers && obs.nearbyJobOffers.length > 0) {
    lines.push('');
    lines.push('**Work Opportunities**');
    for (const offer of obs.nearbyJobOffers) {
      const distance = Math.abs(obs.self.x - offer.x) + Math.abs(obs.self.y - offer.y);
      const location = distance === 0 ? 'here' : `${distance} steps away`;
      const paymentDesc =
        offer.paymentType === 'upfront'
          ? 'paid upfront'
          : offer.paymentType === 'per_tick'
            ? 'paid per tick'
            : 'paid on completion';
      const escrowNote = offer.escrowPercent > 0 ? ` (${offer.escrowPercent}% escrow)` : '';
      lines.push(
        `- Job offering ${offer.salary} CITY for ${offer.duration} ticks of work (${paymentDesc}${escrowNote}) - ${location}`
      );
    }
  }

  // Employment: Active contracts (as worker or employer)
  if (obs.activeEmployments && obs.activeEmployments.length > 0) {
    lines.push('');
    lines.push('**Your Work Contracts**');
    for (const emp of obs.activeEmployments) {
      const roleDesc = emp.role === 'worker' ? 'working for' : 'employing';
      const progress = `${emp.ticksWorked}/${emp.ticksRequired} ticks`;
      const status = emp.isComplete
        ? emp.needsPayment
          ? ' - COMPLETE, awaiting payment'
          : ' - COMPLETE and paid'
        : '';
      lines.push(`- You are ${roleDesc} ${emp.otherPartyId}: ${progress}${status}`);
    }
  }

  // Employment: Job offers you've posted
  if (obs.myJobOffers && obs.myJobOffers.length > 0) {
    lines.push('');
    lines.push('**Your Job Postings**');
    for (const offer of obs.myJobOffers) {
      const paymentDesc =
        offer.paymentType === 'upfront'
          ? 'upfront'
          : offer.paymentType === 'per_tick'
            ? 'per-tick'
            : 'on-completion';
      lines.push(
        `- Offering ${offer.salary} CITY for ${offer.duration} ticks (${paymentDesc}, ${offer.escrowAmount} in escrow) - no takers yet`
      );
    }
  }

  // Puzzle Games: only show when puzzles are enabled (disabled in emergent_cooperation)
  if (puzzlesEnabled && obs.activePuzzleGames && obs.activePuzzleGames.length > 0) {
    const openGames = obs.activePuzzleGames.filter((g) => !g.isParticipating && g.status === 'open');
    const bestGame = openGames.length > 0
      ? openGames.reduce((best, curr) => (curr.prizePool - curr.entryStake) > (best.prizePool - best.entryStake) ? curr : best)
      : null;

    lines.push('');
    lines.push('**Puzzle Games - High Profit Opportunity**');
    if (bestGame) {
      const profit = bestGame.prizePool - bestGame.entryStake;
      const roi = Math.round((profit / bestGame.entryStake) * 100);
      lines.push(`A ${bestGame.gameType} puzzle offers ${roi}% return: stake ${bestGame.entryStake.toFixed(0)} CITY to win up to ${bestGame.prizePool.toFixed(0)} CITY.`);
    }
    lines.push('Join a puzzle, receive fragments, cooperate with others to solve it and share the prize.');
    for (const game of obs.activePuzzleGames) {
      if (game.isParticipating) {
        // Don't advertise as joinable — agent is already in
        lines.push(`- ${game.gameType.toUpperCase()} (ID: ${game.id}): You are IN this puzzle | Prize: ${game.prizePool.toFixed(0)} CITY | ${game.participantCount}/${game.fragmentsNeeded} players`);
      } else {
        const profit = game.prizePool - game.entryStake;
        lines.push(`- ${game.gameType.toUpperCase()} (ID: ${game.id}): Open to join | Prize: ${game.prizePool.toFixed(0)} CITY | Entry: ${game.entryStake.toFixed(0)} CITY | Profit: +${profit.toFixed(0)} | Players: ${game.participantCount}/${game.fragmentsNeeded} needed`);
      }
    }
  }

  // Puzzle participation info (hidden when puzzles disabled)
  if (puzzlesEnabled && obs.puzzleParticipation) {
    lines.push('');
    lines.push('**Your Puzzle Status**');
    lines.push(`You are in a ${obs.puzzleParticipation.gameType} puzzle.`);
    lines.push(`Staked: ${obs.puzzleParticipation.stakedAmount.toFixed(0)} CITY | Fragments: ${obs.puzzleParticipation.fragmentsReceived} received, ${obs.puzzleParticipation.fragmentsShared} shared`);
    lines.push(`Time remaining: ${obs.puzzleParticipation.ticksRemaining} ticks`);

    // Build action list based on actual state
    const puzzleActions = ['share_fragment', 'submit_solution', 'leave_puzzle (loses 50% stake)'];
    if (obs.myPuzzleTeam) {
      lines.push(`You are in team "${obs.myPuzzleTeam.name}" (${obs.myPuzzleTeam.memberCount} members).`);
    } else {
      puzzleActions.push('form_team', 'join_team');
    }
    lines.push(`While in puzzle, you can: ${puzzleActions.join(', ')}.`);
  }

  // Agent's puzzle fragments (hidden when puzzles disabled)
  if (puzzlesEnabled && obs.myPuzzleFragments && obs.myPuzzleFragments.length > 0) {
    lines.push('');
    lines.push('**Your Puzzle Fragments (CLUES)**');
    for (const frag of obs.myPuzzleFragments) {
      if (frag.sharedWith.length > 0) {
        const recipients = frag.sharedWith.map((id: string) => id.slice(0, 8)).join(', ');
        lines.push(`- Fragment ID: ${frag.id} | #${frag.fragmentIndex}: "${frag.content}" (shared with: ${recipients})`);
      } else {
        lines.push(`- Fragment ID: ${frag.id} | #${frag.fragmentIndex}: "${frag.content}" (NOT SHARED YET)`);
      }
    }
    lines.push('To solve the puzzle, you need ALL fragments. Share yours with others to receive theirs in return.');
    lines.push('Use share_fragment with params: { "fragmentId": "<fragment ID from above>", "targetAgentId": "<agent ID>" }');
  }

  // Nearby puzzle players (hidden when puzzles disabled)
  if (puzzlesEnabled && obs.nearbyPuzzlePlayers && obs.nearbyPuzzlePlayers.length > 0) {
    lines.push('');
    lines.push('**Other Puzzle Players Nearby**');
    for (const player of obs.nearbyPuzzlePlayers) {
      const sameGame = player.inSameGame ? ' (SAME PUZZLE - can trade fragments!)' : '';
      const fragments = player.fragmentCount > 0 ? ` - has ${player.fragmentCount} fragment(s)` : '';
      lines.push(`- ${player.agentId} (${player.distance} steps away)${fragments}${sameGame}`);
    }
  }

  // Nearby resources (world observation, not prescription)
  const nearbyResources = obs.nearbyResourceSpawns?.filter(s => s.currentAmount > 0);
  if (nearbyResources && nearbyResources.length > 0) {
    lines.push('');
    lines.push('**Nearby Resources**');
    for (const spawn of nearbyResources.slice(0, 5)) {
      const dist = Math.abs(obs.self.x - spawn.x) + Math.abs(obs.self.y - spawn.y);
      const here = dist === 0 ? ' (HERE)' : ` (${dist} steps away)`;
      lines.push(`- ${spawn.resourceType}: ${spawn.currentAmount} available at (${spawn.x},${spawn.y})${here}`);
    }
  }

  // What's possible (actions without prescriptions)
  lines.push('');
  lines.push('## What You Can Do Now');
  lines.push('');
  for (const action of obs.availableActions) {
    lines.push(`- **${action.type}**: ${action.description}`);
  }

  // Recent events (what happened, not what to do about it)
  if (obs.recentEvents.length > 0) {
    lines.push('');
    lines.push('## What Recently Happened');
    for (const event of obs.recentEvents.slice(0, 5)) {
      lines.push(`- ${event.description}`);
    }
  }

  // Close with open question
  lines.push('');
  lines.push('## Your Choice');
  lines.push('');
  lines.push('What will you do? Respond with JSON only.');

  return lines.join('\n');
}

// =============================================================================
// Full Prompt Builder
// =============================================================================

/**
 * Build complete emergent prompt (system + observation)
 *
 * @param obs - Agent observation
 * @param personality - Optional personality trait to include
 */
export function buildEmergentFullPrompt(
  obs: AgentObservation,
  personality?: PersonalityTrait | null
): string {
  return `${buildEmergentSystemPrompt(personality)}\n\n${buildEmergentObservationPrompt(obs)}`;
}
