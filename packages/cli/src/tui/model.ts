import type { Epic, ProjectIndex, Ticket } from "@agenttasks/core";

export const ALL_EPICS_ID = "__all__";
export const UNASSIGNED_ID = "__unassigned__";

export interface TicketFilters {
  epicId: string;
  search: string;
  assignedTo?: string;
}

export interface EpicEntry {
  id: string;
  label: string;
  count: number;
}

export interface AssigneeEntry {
  id: string;
  label: string;
  count: number;
  tickets: Ticket[];
}

export interface BoardColumn {
  status: string;
  tickets: Ticket[];
}

export interface WindowedBoardColumn extends BoardColumn {
  statusIndex: number;
}

export interface StatusCount {
  status: string;
  count: number;
}

export interface StatusStripItem {
  direction: "previous" | "current" | "next";
  status?: string;
  count: number;
  available: boolean;
}

export interface PlanBucket {
  id: string;
  label: string;
  description: string;
  count: number;
  tickets: Ticket[];
}

export function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function ticketHaystack(ticket: Ticket): string {
  return [
    ticket.frontmatter.id,
    ticket.frontmatter.title,
    ticket.frontmatter.assigned_to ?? "",
    ticket.frontmatter.kind ?? "",
    ticket.frontmatter.priority ?? "",
    ...(ticket.frontmatter.references ?? []),
    ...Object.values(ticket.customFields).map((value) => String(value)),
    ...(ticket.frontmatter.labels ?? [])
  ]
    .join(" ")
    .toLowerCase();
}

export function matchesTicket(ticket: Ticket, filters: TicketFilters): boolean {
  if (filters.epicId !== ALL_EPICS_ID && ticket.frontmatter.epic !== filters.epicId) {
    return false;
  }

  if (filters.assignedTo) {
    const assignee = ticket.frontmatter.assigned_to ?? UNASSIGNED_ID;
    if (assignee !== filters.assignedTo) {
      return false;
    }
  }

  const query = normalizeSearch(filters.search);
  if (!query) {
    return true;
  }

  return ticketHaystack(ticket).includes(query);
}

export function getVisibleTickets(index: ProjectIndex, filters: TicketFilters): Ticket[] {
  return index.tickets.filter((ticket) => matchesTicket(ticket, filters));
}

export function getBoardColumns(index: ProjectIndex, filters: TicketFilters): BoardColumn[] {
  const visible = getVisibleTickets(index, filters);
  return index.config.workflow.statuses.map((status) => ({
    status,
    tickets: visible.filter((ticket) => ticket.frontmatter.status === status)
  }));
}

export function getVisibleBoardColumns(
  columns: BoardColumn[],
  selectedStatusIndex: number,
  windowSize: number
): WindowedBoardColumn[] {
  if (columns.length === 0) {
    return [];
  }

  if (!Number.isFinite(windowSize) || windowSize >= columns.length) {
    return columns.map((column, statusIndex) => ({
      ...column,
      statusIndex
    }));
  }

  const size = Math.max(1, Math.min(columns.length, windowSize));
  const selected = Math.max(0, Math.min(columns.length - 1, selectedStatusIndex));
  const half = Math.floor(size / 2);
  const start = Math.max(0, Math.min(columns.length - size, selected - half));
  const end = start + size;

  return columns.slice(start, end).map((column, index) => ({
    ...column,
    statusIndex: start + index
  }));
}

export function getStatusStripItems(columns: BoardColumn[], selectedStatusIndex: number): StatusStripItem[] {
  const safeIndex = Math.max(0, Math.min(columns.length - 1, selectedStatusIndex));
  const previous = columns[safeIndex - 1];
  const current = columns[safeIndex];
  const next = columns[safeIndex + 1];

  return [
    {
      direction: "previous",
      status: previous?.status,
      count: previous?.tickets.length ?? 0,
      available: Boolean(previous)
    },
    {
      direction: "current",
      status: current?.status,
      count: current?.tickets.length ?? 0,
      available: Boolean(current)
    },
    {
      direction: "next",
      status: next?.status,
      count: next?.tickets.length ?? 0,
      available: Boolean(next)
    }
  ];
}

export function getStatusCounts(tickets: Ticket[], statuses: string[]): StatusCount[] {
  return statuses.map((status) => ({
    status,
    count: tickets.filter((ticket) => ticket.frontmatter.status === status).length
  }));
}

export function getEpicEntries(index: ProjectIndex): EpicEntry[] {
  const allCount = index.tickets.length;
  const epicEntries = index.epics.map((epic) => ({
    id: epic.frontmatter.id,
    label: epic.frontmatter.title,
    count: index.tickets.filter((ticket) => ticket.frontmatter.epic === epic.frontmatter.id).length
  }));

  return [
    { id: ALL_EPICS_ID, label: "All Tickets", count: allCount },
    ...epicEntries
  ];
}

export function getAssigneeEntries(index: ProjectIndex, search: string): AssigneeEntry[] {
  const query = normalizeSearch(search);
  const buckets = new Map<string, Ticket[]>();

  for (const ticket of index.tickets) {
    if (query && !ticketHaystack(ticket).includes(query)) {
      continue;
    }
    const assignee = ticket.frontmatter.assigned_to ?? UNASSIGNED_ID;
    const existing = buckets.get(assignee) ?? [];
    existing.push(ticket);
    buckets.set(assignee, existing);
  }

  if (!buckets.has(UNASSIGNED_ID)) {
    buckets.set(UNASSIGNED_ID, []);
  }

  return [...buckets.entries()]
    .map(([id, tickets]) => ({
      id,
      label: id === UNASSIGNED_ID ? "Unassigned" : id,
      count: tickets.length,
      tickets: [...tickets].sort((left, right) => left.frontmatter.id.localeCompare(right.frontmatter.id))
    }))
    .sort((left, right) => {
      if (left.id === UNASSIGNED_ID) {
        return 1;
      }
      if (right.id === UNASSIGNED_ID) {
        return -1;
      }
      return right.count - left.count || left.label.localeCompare(right.label);
    });
}

export function summarizeAssignments(tickets: Ticket[]): string[] {
  const counts = new Map<string, number>();

  for (const ticket of tickets) {
    const assignee = ticket.frontmatter.assigned_to;
    if (!assignee) {
      continue;
    }

    counts.set(assignee, (counts.get(assignee) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([assignee, count]) => `${assignee} ${count}`);
}

export function getEpicStatusSummary(index: ProjectIndex, epicId: string): StatusCount[] {
  const tickets = epicId === ALL_EPICS_ID
    ? index.tickets
    : index.tickets.filter((ticket) => ticket.frontmatter.epic === epicId);
  return getStatusCounts(tickets, index.config.workflow.statuses).filter((item) => item.count > 0);
}

export function getEpicAssigneeSummary(index: ProjectIndex, epicId: string): string[] {
  const tickets = epicId === ALL_EPICS_ID
    ? index.tickets
    : index.tickets.filter((ticket) => ticket.frontmatter.epic === epicId);
  return summarizeAssignments(tickets);
}

export function getEpicById(index: ProjectIndex, epicId?: string): Epic | undefined {
  if (!epicId || epicId === ALL_EPICS_ID) {
    return undefined;
  }

  const entity = index.byId.get(epicId);
  return entity?.kind === "epic" ? entity : undefined;
}

export function getTicketById(index: ProjectIndex, ticketId?: string): Ticket | undefined {
  if (!ticketId) {
    return undefined;
  }

  const entity = index.byId.get(ticketId);
  return entity?.kind === "ticket" ? entity : undefined;
}

export function getReverseDependencyCount(index: ProjectIndex, ticketId: string): number {
  return (index.reverseDependencies.get(ticketId) ?? []).length;
}

export function getPlanBuckets(index: ProjectIndex): PlanBucket[] {
  const byId = new Map(index.tickets.map((ticket) => [ticket.frontmatter.id, ticket]));
  const buckets: PlanBucket[] = [
    {
      id: "ready",
      label: "Ready Now",
      description: "Tickets whose dependencies are fully satisfied.",
      count: index.planning.readyIds.length,
      tickets: index.planning.readyIds.map((ticketId) => byId.get(ticketId)).filter((ticket): ticket is Ticket => Boolean(ticket))
    },
    {
      id: "blockers",
      label: "Biggest Blockers",
      description: "Tickets that unblock the most downstream work.",
      count: index.planning.blockingTickets.length,
      tickets: index.planning.blockingTickets.map((item) => byId.get(item.ticketId)).filter((ticket): ticket is Ticket => Boolean(ticket))
    },
    {
      id: "critical-path",
      label: "Critical Path",
      description: "Longest unfinished dependency chain.",
      count: index.planning.criticalPathIds.length,
      tickets: index.planning.criticalPathIds.map((ticketId) => byId.get(ticketId)).filter((ticket): ticket is Ticket => Boolean(ticket))
    },
    ...index.planning.waves.map((wave) => ({
      id: `wave-${wave.index + 1}`,
      label: `Wave ${wave.index + 1}`,
      description: wave.readyIds.length > 0
        ? `${wave.readyIds.length} ready now in this wave.`
        : "Parallelizable once earlier waves are cleared.",
      count: wave.ticketIds.length,
      tickets: wave.ticketIds.map((ticketId) => byId.get(ticketId)).filter((ticket): ticket is Ticket => Boolean(ticket))
    }))
  ];

  return buckets.filter((bucket) => bucket.count > 0);
}
