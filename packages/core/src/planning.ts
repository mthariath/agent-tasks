import type { ProjectConfig, ProjectPlanning, PlanningWave, Ticket, TicketPlanningState } from "./types.js";

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function getEndStatuses(config: ProjectConfig): string[] {
  const configured = config.workflow.end ?? [];
  if (configured.length > 0) {
    return unique(configured);
  }

  const fallback = config.workflow.statuses.filter((status) => (config.workflow.transitions[status] ?? []).length === 0);
  return unique(fallback);
}

export function getBlockedStatuses(config: ProjectConfig): string[] {
  return unique(config.workflow.special?.blocked ?? []);
}

export function getActiveStatuses(config: ProjectConfig): string[] {
  const statuses = [
    ...(config.workflow.start ? [config.workflow.start] : []),
    ...(config.workflow.special?.active ?? [])
  ];
  return unique(statuses);
}

function buildWaveMap(waves: PlanningWave[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const wave of waves) {
    for (const ticketId of wave.ticketIds) {
      result.set(ticketId, wave.index);
    }
  }
  return result;
}

function buildWaves(
  tickets: Ticket[],
  endStatuses: Set<string>,
  allDependencies: Map<string, string[]>
): PlanningWave[] {
  const remainingTickets = tickets.filter((ticket) => !endStatuses.has(ticket.frontmatter.status));
  const remainingIds = new Set(remainingTickets.map((ticket) => ticket.frontmatter.id));
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const ticket of remainingTickets) {
    indegree.set(ticket.frontmatter.id, 0);
    dependents.set(ticket.frontmatter.id, []);
  }

  for (const ticket of remainingTickets) {
    const unresolvedDependencies = (allDependencies.get(ticket.frontmatter.id) ?? []).filter((dependency) => remainingIds.has(dependency));
    indegree.set(ticket.frontmatter.id, unresolvedDependencies.length);
    for (const dependency of unresolvedDependencies) {
      const existing = dependents.get(dependency) ?? [];
      existing.push(ticket.frontmatter.id);
      dependents.set(dependency, existing);
    }
  }

  const waves: PlanningWave[] = [];
  let frontier = remainingTickets
    .map((ticket) => ticket.frontmatter.id)
    .filter((ticketId) => (indegree.get(ticketId) ?? 0) === 0)
    .sort();
  let waveIndex = 0;

  while (frontier.length > 0) {
    waves.push({
      index: waveIndex,
      ticketIds: frontier,
      readyIds: []
    });

    const next = new Set<string>();
    for (const ticketId of frontier) {
      for (const dependent of dependents.get(ticketId) ?? []) {
        const nextIndegree = Math.max(0, (indegree.get(dependent) ?? 0) - 1);
        indegree.set(dependent, nextIndegree);
        if (nextIndegree === 0) {
          next.add(dependent);
        }
      }
    }

    frontier = [...next].sort();
    waveIndex += 1;
  }

  return waves;
}

function buildCriticalPath(
  tickets: Ticket[],
  endStatuses: Set<string>,
  allDependencies: Map<string, string[]>
): string[] {
  const remainingTickets = tickets.filter((ticket) => !endStatuses.has(ticket.frontmatter.status));
  const remainingIds = new Set(remainingTickets.map((ticket) => ticket.frontmatter.id));
  const depths = new Map<string, number>();
  const previous = new Map<string, string | null>();
  const visiting = new Set<string>();

  const depthOf = (ticketId: string): number => {
    if (depths.has(ticketId)) {
      return depths.get(ticketId) ?? 0;
    }
    if (visiting.has(ticketId)) {
      return 0;
    }

    visiting.add(ticketId);
    let bestDepth = 1;
    let bestPrevious: string | null = null;
    for (const dependency of allDependencies.get(ticketId) ?? []) {
      if (!remainingIds.has(dependency)) {
        continue;
      }
      const candidateDepth = depthOf(dependency) + 1;
      if (candidateDepth > bestDepth) {
        bestDepth = candidateDepth;
        bestPrevious = dependency;
      }
    }
    visiting.delete(ticketId);

    depths.set(ticketId, bestDepth);
    previous.set(ticketId, bestPrevious);
    return bestDepth;
  };

  let tail: string | null = null;
  let maxDepth = 0;
  for (const ticket of remainingTickets) {
    const depth = depthOf(ticket.frontmatter.id);
    if (depth > maxDepth) {
      maxDepth = depth;
      tail = ticket.frontmatter.id;
    }
  }

  const path: string[] = [];
  while (tail) {
    path.push(tail);
    tail = previous.get(tail) ?? null;
  }

  return path.reverse();
}

export function buildProjectPlanning(
  config: ProjectConfig,
  tickets: Ticket[],
  reverseDependencies: Map<string, string[]>
): { dependencyGraph: Map<string, string[]>; planning: ProjectPlanning } {
  const dependencyGraph = new Map<string, string[]>();
  const ticketsById = new Map<string, Ticket>();
  for (const ticket of tickets) {
    dependencyGraph.set(ticket.frontmatter.id, [...(ticket.frontmatter.depends_on ?? [])]);
    ticketsById.set(ticket.frontmatter.id, ticket);
  }

  const endStatuses = new Set(getEndStatuses(config));
  const blockedStatuses = new Set(getBlockedStatuses(config));
  const activeStatuses = new Set(getActiveStatuses(config));
  const byTicket = new Map<string, TicketPlanningState>();
  const endedIds: string[] = [];
  const blockedIds: string[] = [];
  const activeIds: string[] = [];

  for (const ticket of tickets) {
    const satisfiedDependencies: string[] = [];
    const unsatisfiedDependencies: string[] = [];
    for (const dependency of dependencyGraph.get(ticket.frontmatter.id) ?? []) {
      const dependencyTicket = ticketsById.get(dependency);
      if (dependencyTicket && endStatuses.has(dependencyTicket.frontmatter.status)) {
        satisfiedDependencies.push(dependency);
      } else {
        unsatisfiedDependencies.push(dependency);
      }
    }

    const ended = endStatuses.has(ticket.frontmatter.status);
    const blocked = blockedStatuses.has(ticket.frontmatter.status);
    const active = activeStatuses.has(ticket.frontmatter.status);
    const ready = !ended && !blocked && !active && unsatisfiedDependencies.length === 0;

    if (ended) {
      endedIds.push(ticket.frontmatter.id);
    }
    if (blocked) {
      blockedIds.push(ticket.frontmatter.id);
    }
    if (active) {
      activeIds.push(ticket.frontmatter.id);
    }

    byTicket.set(ticket.frontmatter.id, {
      ticketId: ticket.frontmatter.id,
      ended,
      blocked,
      active,
      ready,
      wave: null,
      satisfiedDependencies,
      unsatisfiedDependencies,
      unblocks: []
    });
  }

  const waves = buildWaves(tickets, endStatuses, dependencyGraph);
  const waveMap = buildWaveMap(waves);
  for (const [ticketId, state] of byTicket.entries()) {
    state.wave = waveMap.get(ticketId) ?? null;
  }

  for (const wave of waves) {
    wave.readyIds = wave.ticketIds.filter((ticketId) => byTicket.get(ticketId)?.ready);
  }

  for (const ticket of tickets) {
    const state = byTicket.get(ticket.frontmatter.id);
    if (!state || state.ended) {
      continue;
    }

    const unblocks = (reverseDependencies.get(ticket.frontmatter.id) ?? []).filter((dependentId) => {
      const dependentState = byTicket.get(dependentId);
      return Boolean(
        dependentState
        && !dependentState.ended
        && dependentState.unsatisfiedDependencies.length === 1
        && dependentState.unsatisfiedDependencies[0] === ticket.frontmatter.id
      );
    });
    state.unblocks = unblocks.sort();
  }

  const readyIds = [...byTicket.values()]
    .filter((state) => state.ready)
    .map((state) => state.ticketId)
    .sort();

  const blockingTickets = [...byTicket.values()]
    .filter((state) => !state.ended && state.unblocks.length > 0)
    .map((state) => ({
      ticketId: state.ticketId,
      blocks: state.unblocks,
      count: state.unblocks.length
    }))
    .sort((left, right) => right.count - left.count || left.ticketId.localeCompare(right.ticketId));

  return {
    dependencyGraph,
    planning: {
      startStatus: config.workflow.start,
      endStatuses: [...endStatuses],
      blockedStatuses: [...blockedStatuses],
      activeStatuses: [...activeStatuses],
      readyIds,
      endedIds: endedIds.sort(),
      blockedIds: blockedIds.sort(),
      activeIds: activeIds.sort(),
      waves,
      criticalPathIds: buildCriticalPath(tickets, endStatuses, dependencyGraph),
      blockingTickets,
      byTicket
    }
  };
}
