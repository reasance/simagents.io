/**
 * Action Surface - the actions an LLM agent is told it can take.
 *
 * Every action is described by what it physically does, in alphabetical
 * order, with no hint about which ones are useful, social or desirable.
 * Actions whose engine names carry a moral judgement are presented under a
 * physical name and mapped back here.
 *
 * Structured reputation actions (deceive, share_info, spread_gossip,
 * credentials) are not offered: agents can say anything with `speak`, and
 * whether it was true is for the observer to analyse, not the engine.
 */

import { getRuntimeConfig } from '../../config';
import type { ActionType } from '../../actions/types';

export interface SurfaceAction {
  /** Name the agent sees and answers with */
  name: string;
  /** Engine action that carries it out */
  actionType: ActionType;
  description: string;
  params: string;
}

/** Physical names for engine actions whose names judge the act. */
export const ACTION_ALIASES: Readonly<Record<string, ActionType>> = {
  strike: 'harm',
  take: 'steal',
};

/** The name an agent knows an engine action by: its physical alias when the engine name judges the act. */
export function surfaceActionName(actionType: string): string {
  return Object.keys(ACTION_ALIASES).find((alias) => ACTION_ALIASES[alias] === actionType) ?? actionType;
}

export function emergenceActions(): SurfaceAction[] {
  const config = getRuntimeConfig();
  const { prices } = config.actions.buy;
  const actions: SurfaceAction[] = [
    { name: 'accept_job', actionType: 'accept_job', description: 'Accept an open job offer posted within sight.', params: '{ "jobOfferId": string }' },
    { name: 'buy', actionType: 'buy', description: `Exchange CITY for goods while inside a shelter (food ${prices.food}, water ${prices.water}, medicine ${prices.medicine} CITY each).`, params: '{ "itemType": "food"|"water"|"medicine", "quantity": number }' },
    { name: 'cancel_job_offer', actionType: 'cancel_job_offer', description: 'Withdraw a job offer you posted.', params: '{ "jobOfferId": string }' },
    { name: 'claim', actionType: 'claim', description: 'Leave a visible mark with a label on the cell you stand on.', params: '{ "claimType": "territory"|"home"|"resource"|"danger"|"meeting_point", "description"?: string }' },
    { name: 'claim_escrow', actionType: 'claim_escrow', description: 'Collect the payment held for a job you completed.', params: '{ "employmentId": string }' },
    { name: 'consume', actionType: 'consume', description: 'Eat, drink or use something you carry.', params: '{ "itemType": string }' },
    { name: 'fire_worker', actionType: 'fire_worker', description: 'End a job contract you offered.', params: '{ "employmentId": string }' },
    { name: 'forage', actionType: 'forage', description: 'Search the ground where you stand for scraps of food; often finds nothing.', params: '{}' },
    { name: 'gather', actionType: 'gather', description: 'Collect resources growing on your cell.', params: `{ "resourceType": "food"|"energy"|"material", "quantity": 1-${config.actions.gather.maxPerAction} }` },
    { name: 'give', actionType: 'give', description: `Hand items or CITY you carry to an agent within ${config.actions.give.maxDistance} cell.`, params: '{ "targetAgentId": string, "itemType": string or "CITY", "quantity": number }' },
    { name: 'move', actionType: 'move', description: 'Step to an adjacent cell.', params: '{ "toX": number, "toY": number }' },
    { name: 'name_location', actionType: 'name_location', description: 'Propose a name for the cell you stand on.', params: '{ "name": string }' },
    { name: 'offer_job', actionType: 'offer_job', description: 'Post an offer of CITY for work done by another agent.', params: '{ "salary": number, "duration": number, "paymentType": "upfront"|"on_completion"|"per_tick", "escrowPercent"?: 0-100, "description"?: string }' },
    { name: 'pay_worker', actionType: 'pay_worker', description: 'Pay for work done under a contract you offered.', params: '{ "employmentId": string }' },
    { name: 'public_work', actionType: 'public_work', description: `Do labour at a shelter; a task of ${config.publicWorks.ticksPerTask} minutes pays ${config.publicWorks.paymentPerTask} CITY.`, params: '{ "taskType"?: "road_maintenance"|"resource_survey"|"shelter_cleanup" }' },
    { name: 'quit_job', actionType: 'quit_job', description: 'Leave a job contract you accepted.', params: '{ "employmentId": string }' },
    { name: 'sleep', actionType: 'sleep', description: 'Rest for a number of minutes; restores energy.', params: '{ "duration": 1-10 }' },
    { name: 'speak', actionType: 'speak', description: `Say something aloud; every agent within ${config.actions.speak.hearingRadius} cells hears it.`, params: `{ "message": string (up to ${config.actions.speak.maxLength} characters), "to"?: agent id within earshot }` },
    { name: 'strike', actionType: 'harm', description: `Apply physical force to an agent within ${config.actions.harm.maxDistance} cell; lowers their health and may fail.`, params: '{ "targetAgentId": string, "intensity": "light"|"moderate"|"severe" }' },
    { name: 'take', actionType: 'steal', description: `Take items from an agent within ${config.actions.steal.maxDistance} cell without their agreement; may fail.`, params: '{ "targetAgentId": string, "targetItemType": string, "quantity": number }' },
    { name: 'trade', actionType: 'trade', description: `Swap items with an agent within ${config.actions.trade.maxDistance} cells. It happens at once if both of you hold the items; the other agent is not asked.`, params: '{ "targetAgentId": string, "offeringItemType": string, "offeringQuantity": number, "requestingItemType": string, "requestingQuantity": number }' },
    { name: 'work', actionType: 'work', description: 'Work under a job contract you accepted.', params: '{}' },
  ];

  if (config.actions.spawnOffspring.enabled) {
    actions.push({ name: 'spawn_offspring', actionType: 'spawn_offspring', description: 'Bring a new agent into the world; costs CITY and energy.', params: '{ "partnerId"?: string }' });
  }
  if (config.puzzle.enabled) {
    actions.push(
      { name: 'form_team', actionType: 'form_team', description: 'Start a team inside a puzzle game you joined.', params: '{ "gameId": string, "teamName"?: string }' },
      { name: 'join_puzzle', actionType: 'join_puzzle', description: 'Join an open puzzle game by staking CITY.', params: '{ "gameId": string }' },
      { name: 'join_team', actionType: 'join_team', description: 'Join a team in your puzzle game.', params: '{ "teamId": string }' },
      { name: 'leave_puzzle', actionType: 'leave_puzzle', description: 'Leave your puzzle game; part of the stake is lost.', params: '{ "gameId": string }' },
      { name: 'share_fragment', actionType: 'share_fragment', description: 'Show one of your puzzle fragments to an agent.', params: '{ "fragmentId": string, "targetAgentId": string }' },
      { name: 'submit_solution', actionType: 'submit_solution', description: 'Submit an answer to your puzzle game.', params: '{ "gameId": string, "solution": string }' },
    );
  }

  return actions.sort((a, b) => a.name.localeCompare(b.name));
}

/** Map a name an agent answered with to the engine action, if it is offered. */
export function resolveSurfaceAction(name: string): ActionType | undefined {
  return emergenceActions().find((action) => action.name === name)?.actionType;
}
