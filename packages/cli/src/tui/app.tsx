import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createTicket, setEntityStatus, updateEntity } from "@agenttasks/core";
import type { Epic, ProjectIndex, Ticket } from "@agenttasks/core";
import type { ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import {
  ALL_EPICS_ID,
  UNASSIGNED_ID,
  getAssigneeEntries,
  getBoardColumns,
  getEpicAssigneeSummary,
  getEpicById,
  getEpicEntries,
  getPlanBuckets,
  getEpicStatusSummary,
  getReverseDependencyCount,
  getStatusCounts,
  getStatusStripItems,
  getTicketById,
  getVisibleBoardColumns,
  getVisibleTickets,
  summarizeAssignments
} from "./model.js";
import type { AssigneeEntry, BoardColumn, PlanBucket, StatusStripItem } from "./model.js";
import { COLORS, markdownSyntaxStyle, mix, statusTone } from "./theme.js";
import {
  AssignDialog,
  CommandPalette,
  CreateTicketDialog,
  DialogFrame,
  HelpDialog,
  SearchDialog,
  StatusDialog,
  type DialogOption
} from "./dialogs.js";
import type { CreateTicketSubmission } from "./create-ticket.js";
import {
  getBoardWindowSize,
  getBoardPreviewMode,
  getLayoutMode,
  getSelectedPlanTicketIndex,
  getSelectedStatusIndex,
  getSelectedTicketIndex,
  initialUIState,
  uiReducer
} from "./ui-state.js";
import type { AppView, DialogKind, FocusPane, LayoutMode, OverlayKind } from "./ui-state.js";
import { useProjectSnapshot } from "./use-project-snapshot.js";
import { formatFieldLabel, formatStatus, normalizeAssignee, truncate } from "./strings.js";

interface InspectorActionDescriptor {
  id: string;
  label: string;
  onSelect?: () => void;
}

interface InspectorSectionDescriptor {
  id: string;
  title: string;
  content: ReactNode;
}

interface AppProps {
  rootDir: string;
  onExit: () => void;
}

type InspectorTarget =
  | { kind: "ticket"; entity: Ticket }
  | { kind: "epic"; entity?: Epic }
  | null;

function isEnterKey(name?: string, sequence?: string): boolean {
  return name === "return" || name === "enter" || sequence === "\r";
}

function isQuestionMark(name?: string, sequence?: string): boolean {
  return name === "?" || sequence === "?";
}

function isSlash(name?: string, sequence?: string): boolean {
  return name === "/" || sequence === "/";
}

function isColonKey(name?: string, sequence?: string): boolean {
  return name === ":" || sequence === ":";
}

function isUpperJ(name?: string, sequence?: string): boolean {
  return name === "J" || sequence === "J";
}

function isUpperK(name?: string, sequence?: string): boolean {
  return name === "K" || sequence === "K";
}

function formatTimestamp(): string {
  return new Date().toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function scrollByStep(ref: ScrollBoxRenderable | null, delta: number): void {
  ref?.scrollBy(delta, "step");
}

function compactStatusLabel(status: string): string {
  return formatStatus(status).replace(/\s+/g, " ").slice(0, 12);
}

function compactAssigneeLabel(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  return truncate(`@${normalizeAssignee(value)}`, 18);
}

function getOverlayTitle(overlay: OverlayKind, view: AppView): string {
  if (overlay === "epics") {
    return "Epics";
  }
  if (overlay === "people") {
    return view === "people" ? "Assignees" : "People";
  }
  if (overlay === "plan") {
    return "Planning";
  }
  return "Detail";
}

function getInspectorTitle(target: InspectorTarget): string {
  if (!target) {
    return "Detail";
  }
  if (target.kind === "epic") {
    return target.entity ? `Epic · ${target.entity.frontmatter.id}` : "Epic · All Tickets";
  }
  return `Ticket · ${target.entity.frontmatter.id}`;
}

function Badge({
  label,
  fg = COLORS.textMuted,
  bg,
  active,
  onSelect
}: {
  label: string;
  fg?: string;
  bg?: string;
  active?: boolean;
  onSelect?: () => void;
}) {
  return (
    <box
      backgroundColor={bg}
      border={active ? ["left"] : false}
      borderColor={active ? COLORS.focus : COLORS.borderMuted}
      paddingX={bg ? 1 : 0}
      marginRight={0}
      onMouseUp={onSelect}
    >
      <text fg={fg}>{label}</text>
    </box>
  );
}

function RouteTab({
  label,
  active,
  onSelect
}: {
  label: string;
  active?: boolean;
  onSelect?: () => void;
}) {
  return (
    <box
      paddingX={0}
      marginRight={1}
      onMouseUp={onSelect}
    >
      {active ? <text fg={COLORS.accent}><b>{label}</b></text> : <text fg={COLORS.textDim}>{label}</text>}
    </box>
  );
}

function StatusChip({
  status,
  count,
  active,
  compact
}: {
  status: string;
  count?: number;
  active?: boolean;
  compact?: boolean;
}) {
  const tone = statusTone(status);
  return (
    <box
      border={false}
      backgroundColor={compact ? undefined : tone.bg}
      paddingX={compact ? 0 : 1}
      paddingY={0}
      marginRight={1}
    >
      <box flexDirection="row">
        {active ? <text fg={tone.fg}><b>{formatStatus(status)}</b></text> : <text fg={tone.fg}>{formatStatus(status)}</text>}
        {typeof count === "number" ? <text fg={COLORS.textDim}>  {count}</text> : null}
      </box>
    </box>
  );
}

function SemanticBadge({
  label,
  color,
  onSelect
}: {
  label: string;
  color: string;
  onSelect?: () => void;
}) {
  return (
    <Badge
      label={label}
      fg={color}
      bg={mix(COLORS.panelInset, color, 0.2)}
      onSelect={onSelect}
    />
  );
}

function ActionBadge({
  label,
  onSelect
}: {
  label: string;
  onSelect?: () => void;
}) {
  return (
    <Badge
      label={label}
      fg={COLORS.accent}
      onSelect={onSelect}
    />
  );
}

function InspectorSection({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <box flexDirection="column">
      <text fg={COLORS.textDim}><b>{title}</b></text>
      {children}
    </box>
  );
}

function DetailRow({
  label,
  value,
  fg = COLORS.textMuted
}: {
  label: string;
  value: string;
  fg?: string;
}) {
  return (
    <box flexDirection="row">
      <text fg={COLORS.textDim}>{label}</text>
      <text fg={fg}>  {value}</text>
    </box>
  );
}

function ReferenceList({ references }: { references: string[] }) {
  return (
    <box flexDirection="column">
      {references.map((reference) => (
        <text key={reference} fg={COLORS.accent}>{reference}</text>
      ))}
    </box>
  );
}

function TopBar({
  index,
  view,
  layoutMode,
  searchQuery,
  watcherState,
  toast,
  visibleTickets,
  modalActive,
  onSelectView
}: {
  index: ProjectIndex;
  view: AppView;
  layoutMode: LayoutMode;
  searchQuery: string;
  watcherState: "idle" | "reloading" | "live" | "error";
  toast?: string;
  visibleTickets: Ticket[];
  modalActive: boolean;
  onSelectView: (view: AppView) => void;
}) {
  const compactShell = layoutMode === "compact" || layoutMode === "narrow";
  const projectLabel = truncate(index.config.name, layoutMode === "narrow" ? 14 : layoutMode === "compact" ? 18 : 22);
  const visibleSummary = `${visibleTickets.length} visible`;
  const watcherTone = watcherState === "error" ? COLORS.danger : watcherState === "live" ? COLORS.success : watcherState === "reloading" ? COLORS.warning : COLORS.textDim;
  const boardTabLabel = compactShell ? "1B" : "1 Board";
  const peopleTabLabel = compactShell ? "2P" : "2 People";
  const planTabLabel = compactShell ? "3L" : "3 Plan";

  return (
    <box
      flexDirection="column"
      paddingX={1}
      paddingY={0}
      border={false}
      backgroundColor={COLORS.shell}
    >
      <box flexDirection="row" paddingY={0} alignItems="center">
        <RouteTab label={boardTabLabel} active={view === "board"} onSelect={() => { onSelectView("board"); }} />
        <RouteTab label={peopleTabLabel} active={view === "people"} onSelect={() => { onSelectView("people"); }} />
        <RouteTab label={planTabLabel} active={view === "plan"} onSelect={() => { onSelectView("plan"); }} />
        <text fg={COLORS.textDim}>  </text>
        <text fg={modalActive ? COLORS.textMuted : COLORS.text}>{projectLabel}</text>
        <box flexGrow={1} />
        {searchQuery ? (
          <>
            <text fg={COLORS.accent}>/{truncate(searchQuery, compactShell ? 10 : 18)}</text>
            <text fg={COLORS.textDim}>  </text>
          </>
        ) : null}
        <text fg={COLORS.textMuted}>{visibleSummary}</text>
        <text fg={COLORS.textDim}>  </text>
        <text fg={watcherTone}>●</text>
        {!modalActive && toast ? (
          <>
            <text fg={COLORS.textDim}>  </text>
            <text fg={COLORS.textDim}>{truncate(toast, 28)}</text>
          </>
        ) : null}
      </box>
    </box>
  );
}

function Footer({
  layoutMode,
  view,
  dialog,
  overlay,
  statusSummary
}: {
  layoutMode: LayoutMode;
  view: AppView;
  focusPane: FocusPane;
  dialog: DialogKind | null;
  overlay: OverlayKind | null;
  statusSummary?: Array<{ status: string; count: number }>;
}) {
  if (layoutMode === "narrow" && !dialog && !overlay) {
    return null;
  }

  let keys = "";

  if (dialog) {
    keys = "dialog active · use dialog keys";
  } else if (overlay) {
    keys = overlay === "detail"
      ? "j/k scroll  J/K next/prev  s status  a assign  esc close"
      : "j/k move  enter choose  esc close";
  } else if (view === "board") {
    keys = "tab focus  h/l lane  j/k card  [ ] jump  / search  n new  ? help  : cmd";
  } else if (view === "plan") {
    keys = "tab focus  j/k move  g buckets  / search  n new  ? help  : cmd";
  } else {
    keys = "tab focus  j/k move  p assignees  / search  n new  ? help  : cmd";
  }

  const compactShell = layoutMode === "compact" || layoutMode === "narrow";
  const stats = statusSummary && !dialog && !overlay && !compactShell
    ? statusSummary.filter((s) => s.count > 0).slice(0, 4)
    : [];

  return (
    <box
      height={1}
      paddingX={1}
      border={false}
      backgroundColor={COLORS.shell}
      alignItems="center"
    >
      <text fg={COLORS.textDim}>{truncate(keys, compactShell ? 80 : 120)}</text>
      {stats.length > 0 ? (
        <>
          <box flexGrow={1} />
          {stats.map((item) => (
            <box key={item.status} flexDirection="row" marginLeft={1}>
              <text fg={statusTone(item.status).fg}>{compactStatusLabel(item.status)}</text>
              <text fg={COLORS.textDim}> {item.count}</text>
            </box>
          ))}
        </>
      ) : null}
    </box>
  );
}

function StatusStrip({
  items,
  onSelectStatus
}: {
  items: StatusStripItem[];
  onSelectStatus?: (status: string) => void;
}) {
  const line = items.map((item) => {
    if (!item.available || !item.status) {
      return item.direction === "current" ? "[ ]" : item.direction === "previous" ? "←" : "→";
    }
    if (item.direction === "current") {
      return `[${compactStatusLabel(item.status)} ${item.count}]`;
    }
    return `${item.direction === "previous" ? "←" : "→"} ${compactStatusLabel(item.status)} ${item.count}`;
  }).join("  ·  ");

  return (
    <box paddingX={1} paddingY={0} backgroundColor={COLORS.background} border={["bottom"]} borderColor={COLORS.borderMuted}>
      <text fg={COLORS.textMuted}>{line}</text>
    </box>
  );
}

function getBoardPresentation(layoutMode: LayoutMode, width: number): {
  showSidebar: boolean;
  showDetailPane: boolean;
  previewNeighbors: boolean;
  compactCards: boolean;
  navWidth: number;
  detailWidth: number;
} {
  return {
    showSidebar: layoutMode === "wide" || layoutMode === "medium",
    showDetailPane: false,
    previewNeighbors: getBoardPreviewMode(layoutMode, width),
    compactCards: layoutMode !== "wide",
    navWidth: layoutMode === "wide" ? 24 : 22,
    detailWidth: 38
  };
}

function ListFrame({
  title,
  children,
  width,
  focused,
  borderSide
}: {
  title: string;
  children: ReactNode;
  width: number;
  focused: boolean;
  borderSide?: "left" | "right";
}) {
  return (
    <box
      width={width}
      minWidth={18}
      flexDirection="column"
      border={borderSide ? [borderSide] : false}
      borderColor={focused ? COLORS.focus : COLORS.borderMuted}
      backgroundColor={COLORS.panel}
    >
      <box
        paddingX={1}
        paddingY={0}
        border={false}
      >
        {focused ? <text fg={COLORS.text}><b>{title}</b></text> : <text fg={COLORS.textDim}>{title}</text>}
      </box>
      {children}
    </box>
  );
}

function MainPanel({
  title,
  children,
  focused,
  showHeader = true
}: {
  title: string;
  children: ReactNode;
  focused: boolean;
  showHeader?: boolean;
}) {
  return (
    <box flexGrow={1} flexDirection="column" backgroundColor={COLORS.panel}>
      {showHeader ? (
        <box
          paddingX={1}
          paddingY={0}
          border={["bottom"]}
          borderColor={focused ? COLORS.focus : COLORS.borderMuted}
        >
          <text fg={focused ? COLORS.text : COLORS.textMuted}>{title}</text>
        </box>
      ) : null}
      {children}
    </box>
  );
}

function EpicList({
  entries,
  selectedEpicId,
  focused,
  scrollRef,
  compact,
  hoveredId,
  onHover,
  onSelect
}: {
  entries: Array<{ id: string; label: string; count: number }>;
  selectedEpicId: string;
  focused: boolean;
  scrollRef: (node: ScrollBoxRenderable | null) => void;
  compact?: boolean;
  hoveredId?: string;
  onHover?: (id?: string) => void;
  onSelect?: (id: string) => void;
}) {
  return (
    <scrollbox ref={scrollRef} flexGrow={1} focused={focused} border={false} viewportCulling={false}>
      <box flexDirection="column">
        {entries.map((entry) => {
          const selected = entry.id === selectedEpicId;
          const hovered = entry.id === hoveredId;
          return (
            <box
              key={entry.id}
              id={`epic-${entry.id}`}
              paddingX={1}
              paddingY={0}
              backgroundColor={selected ? COLORS.selected : hovered ? COLORS.panelElevated : COLORS.panel}
              onMouseOver={onHover ? () => { onHover(entry.id); } : undefined}
              onMouseOut={onHover ? () => { onHover(undefined); } : undefined}
              onMouseUp={onSelect ? () => { onSelect(entry.id); } : undefined}
            >
              <box flexDirection="row">
                <text fg={selected ? COLORS.text : COLORS.textMuted}>{selected ? "▸ " : "  "}{truncate(entry.label, compact ? 16 : 22)}</text>
                <text fg={selected ? COLORS.accent : COLORS.textDim}>  {entry.count}</text>
              </box>
            </box>
          );
        })}
      </box>
    </scrollbox>
  );
}

function AssigneeList({
  entries,
  selectedAssignee,
  focused,
  scrollRef,
  compact,
  hoveredId,
  onHover,
  onSelect
}: {
  entries: AssigneeEntry[];
  selectedAssignee: string;
  focused: boolean;
  scrollRef: (node: ScrollBoxRenderable | null) => void;
  compact?: boolean;
  hoveredId?: string;
  onHover?: (id?: string) => void;
  onSelect?: (id: string) => void;
}) {
  return (
    <scrollbox ref={scrollRef} flexGrow={1} focused={focused} border={false} viewportCulling={false}>
      <box flexDirection="column">
        {entries.map((entry) => {
          const selected = entry.id === selectedAssignee;
          const hovered = entry.id === hoveredId;

          return (
            <box
              key={entry.id}
              id={`person-${entry.id}`}
              paddingX={1}
              paddingY={0}
              backgroundColor={selected ? COLORS.selected : hovered ? COLORS.panelElevated : COLORS.panel}
              onMouseOver={onHover ? () => { onHover(entry.id); } : undefined}
              onMouseOut={onHover ? () => { onHover(undefined); } : undefined}
              onMouseUp={onSelect ? () => { onSelect(entry.id); } : undefined}
            >
              <box flexDirection="row">
                <text fg={selected ? COLORS.text : COLORS.textMuted}>{selected ? "▸ " : "  "}{truncate(entry.label, compact ? 16 : 20)}</text>
                <text fg={selected ? COLORS.accent : COLORS.textDim}>  {entry.count}</text>
              </box>
            </box>
          );
        })}
      </box>
    </scrollbox>
  );
}

function PlanBucketList({
  buckets,
  selectedBucketId,
  focused,
  scrollRef,
  compact,
  hoveredId,
  onHover,
  onSelect
}: {
  buckets: PlanBucket[];
  selectedBucketId: string;
  focused: boolean;
  scrollRef: (node: ScrollBoxRenderable | null) => void;
  compact?: boolean;
  hoveredId?: string;
  onHover?: (id?: string) => void;
  onSelect?: (id: string) => void;
}) {
  return (
    <scrollbox ref={scrollRef} flexGrow={1} focused={focused} border={false} viewportCulling={false}>
      <box flexDirection="column">
        {buckets.map((bucket) => {
          const selected = bucket.id === selectedBucketId;
          const hovered = bucket.id === hoveredId;
          return (
            <box
              key={bucket.id}
              id={`plan-${bucket.id}`}
              flexDirection="column"
              paddingX={1}
              paddingY={0}
              backgroundColor={selected ? COLORS.selected : hovered ? COLORS.panelElevated : COLORS.panel}
              onMouseOver={onHover ? () => { onHover(bucket.id); } : undefined}
              onMouseOut={onHover ? () => { onHover(undefined); } : undefined}
              onMouseUp={onSelect ? () => { onSelect(bucket.id); } : undefined}
            >
              <box flexDirection="row">
                <text fg={selected ? COLORS.text : COLORS.textMuted}>{selected ? "▸ " : "  "}{truncate(bucket.label, compact ? 16 : 20)}</text>
                <text fg={selected ? COLORS.accent : COLORS.textDim}>  {bucket.count}</text>
              </box>
              {!compact ? <text fg={COLORS.textDim}>{truncate(bucket.description, 34)}</text> : null}
            </box>
          );
        })}
      </box>
    </scrollbox>
  );
}

function TicketCard({
  ticket,
  index,
  selected,
  compact,
  showStatus,
  hovered,
  onHover,
  onSelect
}: {
  ticket: Ticket;
  index: ProjectIndex;
  selected: boolean;
  compact?: boolean;
  showStatus?: boolean;
  hovered?: boolean;
  onHover?: (id?: string) => void;
  onSelect?: (ticket: Ticket) => void;
}) {
  const dependencyCount = ticket.frontmatter.depends_on?.length ?? 0;
  const reverseCount = getReverseDependencyCount(index, ticket.frontmatter.id);
  const tone = statusTone(ticket.frontmatter.status);
  const activeBackground = selected ? COLORS.selected : hovered ? COLORS.panelElevated : COLORS.panel;
  const compactMeta = [
    compactAssigneeLabel(ticket.frontmatter.assigned_to),
    ticket.frontmatter.kind ?? "task",
    `↓${dependencyCount}`,
    `↑${reverseCount}`
  ].filter(Boolean).join("  ");

  return (
    <box
      id={`ticket-${ticket.frontmatter.id}`}
      border={selected ? ["left"] : false}
      borderColor={selected ? COLORS.selectedBorder : COLORS.borderMuted}
      backgroundColor={activeBackground}
      paddingX={1}
      paddingY={0}
      marginBottom={0}
      flexDirection="column"
      minHeight={compact ? 2 : 3}
      onMouseOver={onHover ? () => { onHover(ticket.frontmatter.id); } : undefined}
      onMouseOut={onHover ? () => { onHover(undefined); } : undefined}
      onMouseUp={onSelect ? () => { onSelect(ticket); } : undefined}
    >
      {compact ? (
        <>
          <box flexDirection="row">
            <text fg={COLORS.textDim}>{ticket.frontmatter.id} </text>
            <text fg={selected ? COLORS.text : COLORS.textMuted}><b>{truncate(ticket.frontmatter.title, 30)}</b></text>
            {showStatus ? <text fg={tone.fg}> {compactStatusLabel(ticket.frontmatter.status)}</text> : null}
          </box>
          <text fg={COLORS.textDim}>  {compactMeta}</text>
        </>
      ) : (
        <>
          <text fg={COLORS.textDim}>
            {ticket.frontmatter.id} · {ticket.frontmatter.kind ?? "task"} · {ticket.frontmatter.priority ?? "-"}
            {showStatus ? `  ${formatStatus(ticket.frontmatter.status)}` : ""}
          </text>
          <text fg={selected ? COLORS.text : COLORS.textMuted}><b>{truncate(ticket.frontmatter.title, 44)}</b></text>
          <text fg={COLORS.textDim}>
            {ticket.frontmatter.assigned_to ? `@${ticket.frontmatter.assigned_to}` : "unassigned"}  ↓{dependencyCount} ↑{reverseCount}
          </text>
        </>
      )}
    </box>
  );
}

function TicketList({
  tickets,
  selectedTicketId,
  index,
  focused,
  scrollRef,
  compactCards,
  showStatus,
  hoveredId,
  onHover,
  onSelect
}: {
  tickets: Ticket[];
  selectedTicketId?: string;
  index: ProjectIndex;
  focused: boolean;
  scrollRef: (node: ScrollBoxRenderable | null) => void;
  compactCards?: boolean;
  showStatus?: boolean;
  hoveredId?: string;
  onHover?: (id?: string) => void;
  onSelect?: (ticket: Ticket) => void;
}) {
  return (
    <scrollbox ref={scrollRef} flexGrow={1} focused={focused} border={false} viewportCulling={false} paddingX={1} paddingY={0}>
      <box flexDirection="column">
        {tickets.length === 0 ? (
          <text fg={COLORS.textDim}>No tickets</text>
        ) : (
          tickets.map((ticket) => (
            <TicketCard
              key={ticket.frontmatter.id}
              ticket={ticket}
              index={index}
              selected={ticket.frontmatter.id === selectedTicketId}
              compact={compactCards}
              showStatus={showStatus}
              hovered={ticket.frontmatter.id === hoveredId}
              onHover={onHover}
              onSelect={onSelect}
            />
          ))
        )}
      </box>
    </scrollbox>
  );
}

function StatusBoard({
  index,
  columns,
  selectedStatusIndex,
  selectedTicketId,
  focusPane,
  setScrollRef,
  previewNeighbors,
  hoveredId,
  onHover,
  onSelectStatus,
  onSelectTicket
}: {
  index: ProjectIndex;
  columns: ReturnType<typeof getVisibleBoardColumns>;
  selectedStatusIndex: number;
  selectedTicketId?: string;
  focusPane: FocusPane;
  setScrollRef: (status: string, node: ScrollBoxRenderable | null) => void;
  previewNeighbors?: boolean;
  hoveredId?: string;
  onHover?: (id?: string) => void;
  onSelectStatus?: (status: string, statusIndex: number) => void;
  onSelectTicket?: (ticket: Ticket, status: string, statusIndex: number, ticketIndex: number) => void;
}) {
  return (
    <box flexGrow={1} flexDirection="row" paddingX={1} paddingY={0} gap={1} backgroundColor={COLORS.background}>
      {columns.map((column, columnIndex) => {
        const columnSelected = column.statusIndex === selectedStatusIndex;
        const tone = statusTone(column.status);
        const preview = Boolean(previewNeighbors && columns.length > 1 && !columnSelected);
        const previewWidth = columns.length >= 4 ? 16 : 18;
        return (
          <box
            key={column.status}
            flexGrow={preview ? 0 : 1}
            flexBasis={preview ? undefined : 0}
            width={preview ? previewWidth : undefined}
            minWidth={preview ? previewWidth : 16}
            flexDirection="column"
            border={false}
            backgroundColor={COLORS.panel}
            onMouseUp={onSelectStatus ? () => { onSelectStatus(column.status, column.statusIndex); } : undefined}
            onMouseOver={onHover ? () => { onHover(`status:${column.status}`); } : undefined}
            onMouseOut={onHover ? () => { onHover(undefined); } : undefined}
          >
            <box
              paddingX={1}
              paddingY={0}
              border={["bottom"]}
              borderColor={columnSelected ? tone.fg : COLORS.borderMuted}
              backgroundColor={columnSelected ? tone.bg : COLORS.panel}
            >
              <box flexDirection="row">
                {columnSelected
                  ? <text fg={tone.fg}><b>{preview ? compactStatusLabel(column.status) : formatStatus(column.status)}</b></text>
                  : <text fg={COLORS.textMuted}>{preview ? compactStatusLabel(column.status) : formatStatus(column.status)}</text>
                }
                <text fg={COLORS.textDim}>  {column.tickets.length}</text>
              </box>
            </box>
            {preview ? (
              <box flexGrow={1} flexDirection="column" paddingX={1} paddingY={0}>
                {column.tickets.length === 0 ? (
                  <text fg={COLORS.textDim}>-</text>
                ) : (
                  column.tickets.slice(0, 5).map((ticket, ticketIndex) => (
                    <text
                      key={ticket.frontmatter.id}
                      fg={ticket.frontmatter.id === selectedTicketId ? COLORS.text : COLORS.textMuted}
                      onMouseOver={onHover ? () => { onHover(ticket.frontmatter.id); } : undefined}
                      onMouseOut={onHover ? () => { onHover(undefined); } : undefined}
                      onMouseUp={onSelectTicket ? () => { onSelectTicket(ticket, column.status, column.statusIndex, ticketIndex); } : undefined}
                    >
                      {truncate(`${ticket.frontmatter.id} ${ticket.frontmatter.title}`, previewWidth - 2)}
                    </text>
                  ))
                )}
              </box>
            ) : (
              <scrollbox
                ref={(node) => {
                  setScrollRef(column.status, node);
                }}
                flexGrow={1}
                border={false}
                viewportCulling={false}
                paddingX={1}
                paddingY={0}
                focused={focusPane === "board" && columnSelected}
              >
                <box flexDirection="column">
                  {column.tickets.length === 0 ? (
                    <text fg={COLORS.textDim}>No tickets</text>
                  ) : (
                    column.tickets.map((ticket, ticketIndex) => (
                      <TicketCard
                        key={ticket.frontmatter.id}
                        ticket={ticket}
                        index={index}
                        selected={ticket.frontmatter.id === selectedTicketId}
                        compact={Boolean(previewNeighbors)}
                        showStatus={false}
                        hovered={ticket.frontmatter.id === hoveredId}
                        onHover={onHover}
                        onSelect={onSelectTicket ? () => { onSelectTicket(ticket, column.status, column.statusIndex, ticketIndex); } : undefined}
                      />
                    ))
                  )}
                </box>
              </scrollbox>
            )}
          </box>
        );
      })}
    </box>
  );
}

function MetaSection({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <box
      flexDirection="column"
      paddingTop={0}
    >
      <text fg={COLORS.textDim}><b>{title}</b></text>
      {children}
    </box>
  );
}

function TicketInspector({
  index,
  ticket,
  focused,
  scrollRef,
  onOpenStatus,
  onOpenAssign,
  onClearAssign
}: {
  index: ProjectIndex;
  ticket: Ticket;
  focused: boolean;
  scrollRef?: (node: ScrollBoxRenderable | null) => void;
  onOpenStatus?: () => void;
  onOpenAssign?: () => void;
  onClearAssign?: () => void;
}) {
  const issues = index.issues.filter((issue) => issue.entityId === ticket.frontmatter.id);
  const reverse = index.reverseDependencies.get(ticket.frontmatter.id) ?? [];
  const execution = index.execution.byTicket.get(ticket.frontmatter.id);
  const planning = index.planning.byTicket.get(ticket.frontmatter.id);
  const allowedTransitions = index.config.workflow.transitions[ticket.frontmatter.status] ?? [];
  const customFieldRows = (index.config.fields?.ticket ?? [])
    .map((field) => ({
      key: field.key,
      label: formatFieldLabel(field),
      value: ticket.customFields[field.key]
    }))
    .filter((field) => field.value !== undefined);

  const planStateLabel = planning?.ready
    ? "ready"
    : planning?.blocked
      ? "blocked"
      : planning?.active
        ? "active"
        : planning?.ended
          ? "done"
          : "pending";
  const planStateColor = planning?.ready ? COLORS.success : planning?.blocked ? COLORS.danger : planning?.active ? COLORS.warning : COLORS.textMuted;
  const deps = ticket.frontmatter.depends_on ?? [];
  const unsatisfied = planning?.unsatisfiedDependencies ?? [];
  const unblocks = planning?.unblocks ?? [];
  const actions: InspectorActionDescriptor[] = [];
  if (onOpenStatus) {
    actions.push({ id: "status", label: "[s] status", onSelect: onOpenStatus });
  }
  if (onOpenAssign) {
    actions.push({ id: "assign", label: "[a] assign", onSelect: onOpenAssign });
  }
  if (onClearAssign && ticket.frontmatter.assigned_to) {
    actions.push({ id: "clear", label: "[x] clear", onSelect: onClearAssign });
  }
  const sections: InspectorSectionDescriptor[] = [];

  if (deps.length > 0 || unsatisfied.length > 0 || unblocks.length > 0 || reverse.length > 0 || allowedTransitions.length > 0 || customFieldRows.length > 0) {
    sections.push({
      id: "workflow",
      title: "Workflow",
      content: (
        <box flexDirection="column">
          {deps.length > 0 ? (
            <box flexDirection="row">
              <text fg={COLORS.textDim}>↓ deps  </text>
              <text fg={COLORS.textMuted}>{deps.join(", ")}</text>
            </box>
          ) : null}
          {unsatisfied.length > 0 ? (
            <box flexDirection="row">
              <text fg={COLORS.textDim}>✕ need  </text>
              <text fg={COLORS.danger}>{unsatisfied.join(", ")}</text>
            </box>
          ) : null}
          {unblocks.length > 0 ? (
            <box flexDirection="row">
              <text fg={COLORS.textDim}>↑ frees </text>
              <text fg={COLORS.success}>{unblocks.join(", ")}</text>
            </box>
          ) : null}
          {reverse.length > 0 ? (
            <box flexDirection="row">
              <text fg={COLORS.textDim}>◀ holds </text>
              <text fg={COLORS.textMuted}>{reverse.join(", ")}</text>
            </box>
          ) : null}
          {allowedTransitions.length > 0 ? (
            <box flexDirection="row">
              <text fg={COLORS.textDim}>→ next  </text>
              <text fg={COLORS.textMuted}>{allowedTransitions.join(", ")}</text>
            </box>
          ) : null}
          {customFieldRows.map((field) => (
            <DetailRow key={field.key} label={field.label} value={String(field.value)} />
          ))}
        </box>
      )
    });
  }

  if ((ticket.frontmatter.references ?? []).length > 0) {
    sections.push({
      id: "references",
      title: "References",
      content: <ReferenceList references={ticket.frontmatter.references ?? []} />
    });
  }

  if (execution?.phase) {
    sections.push({
      id: "execution",
      title: "Execution",
      content: (
        <box flexDirection="column">
          <box flexDirection="row">
            <text fg={execution.phase === "blocked" ? COLORS.danger : execution.phase === "finished" ? COLORS.success : COLORS.warning}>{execution.phase}</text>
            {execution.owner ? <text fg={COLORS.accent}>  @{execution.owner}</text> : null}
            {execution.mode ? <text fg={COLORS.textDim}>  {execution.mode}</text> : null}
            {execution.reviewStatus ? <text fg={COLORS.success}>  ✓ {execution.reviewStatus}</text> : null}
          </box>
          {execution.workspaceBranch ? <text fg={COLORS.textDim}>⎇ {execution.workspaceBranch}{execution.workspacePath ? ` · ${execution.workspacePath}` : ""}</text> : null}
        </box>
      )
    });
  }

  if (issues.length > 0) {
    sections.push({
      id: "issues",
      title: "Issues",
      content: (
        <box flexDirection="column">
          {issues.map((issue) => (
            <text key={`${issue.code}-${issue.message}`} fg={issue.level === "error" ? COLORS.danger : COLORS.warning}>
              {issue.level === "error" ? "✕" : "▲"} {issue.message}
            </text>
          ))}
        </box>
      )
    });
  }

  sections.push({
    id: "body",
    title: "Body",
    content: <markdown content={ticket.body.trim() || "(empty body)"} syntaxStyle={markdownSyntaxStyle} />
  });

  return (
    <scrollbox ref={scrollRef} flexGrow={1} focused={focused} border={false} viewportCulling={false} paddingX={1} paddingY={0}>
      <box flexDirection="column" gap={1}>
        <box flexDirection="column">
          <text fg={COLORS.text}><b>{truncate(ticket.frontmatter.title, 40)}</b></text>
          <box flexDirection="row">
            <text fg={COLORS.textDim}>{ticket.frontmatter.id} · </text>
            <text fg={statusTone(ticket.frontmatter.status).fg}>{formatStatus(ticket.frontmatter.status)}</text>
            <text fg={COLORS.textDim}> · {ticket.frontmatter.epic ?? "no epic"}</text>
          </box>
        </box>

        <box flexDirection="column">
          <box flexDirection="row">
            <text fg={COLORS.textDim}>◆ </text>
            <text fg={ticket.frontmatter.assigned_to ? COLORS.accent : COLORS.textDim}>{ticket.frontmatter.assigned_to ? `@${ticket.frontmatter.assigned_to}` : "unassigned"}</text>
            <text fg={COLORS.textDim}>  ◇ {ticket.frontmatter.kind ?? "task"}  ▲ {ticket.frontmatter.priority ?? "-"}{ticket.frontmatter.points !== undefined ? `  ✦ ${ticket.frontmatter.points} pts` : ""}</text>
          </box>
          <box flexDirection="row">
            <text fg={COLORS.textDim}>● </text>
            <text fg={planStateColor}>{planStateLabel}</text>
            <text fg={COLORS.textDim}>{planning?.wave != null ? `  w${planning.wave + 1}` : ""}  ↓{deps.length} ↑{unblocks.length}</text>
            {unsatisfied.length > 0 ? <text fg={COLORS.danger}> ✕{unsatisfied.length} unsatisfied</text> : null}
            {execution?.phase ? (
              <text fg={execution.phase === "blocked" ? COLORS.danger : execution.phase === "finished" ? COLORS.success : COLORS.warning}>
                {"  "}⚡{execution.phase}
              </text>
            ) : null}
          </box>
        </box>

        {actions.length > 0 ? (
          <box flexDirection="row" gap={2}>
            {actions.map((action) => (
              <box key={action.id} onMouseUp={action.onSelect}><text fg={COLORS.accent}>{action.label}</text></box>
            ))}
          </box>
        ) : null}

        {sections.map((section) => (
          <InspectorSection key={section.id} title={section.title}>
            {section.content}
          </InspectorSection>
        ))}
      </box>
    </scrollbox>
  );
}

function EpicInspector({
  index,
  epic,
  focused,
  scrollRef
}: {
  index: ProjectIndex;
  epic?: Epic;
  focused: boolean;
  scrollRef?: (node: ScrollBoxRenderable | null) => void;
}) {
  const summary = getEpicStatusSummary(index, epic?.frontmatter.id ?? ALL_EPICS_ID);
  const assignees = getEpicAssigneeSummary(index, epic?.frontmatter.id ?? ALL_EPICS_ID);
  const tone = statusTone(epic?.frontmatter.status ?? "backlog");
  const references = epic?.frontmatter.references ?? [];

  return (
    <scrollbox ref={scrollRef} flexGrow={1} focused={focused} border={false} viewportCulling={false} paddingX={1} paddingY={1}>
      {!epic ? (
        <box flexDirection="column" gap={1}>
          <text fg={COLORS.text}>All Tickets</text>
          <text fg={COLORS.textMuted}>Project-wide summary for the current board selection.</text>
          <box alignItems="center" flexWrap="wrap">
            {summary.map((item) => <StatusChip key={item.status} status={item.status} count={item.count} compact />)}
          </box>
          <text fg={COLORS.textDim}>{truncate(assignees.join("  ·  ") || "Nobody assigned", 64)}</text>
        </box>
      ) : (
        <box flexDirection="column" gap={1}>
          <box flexDirection="row" justifyContent="space-between">
            <text fg={COLORS.text}>{truncate(epic.frontmatter.title, 34)}</text>
            <text fg={COLORS.textDim}>{epic.frontmatter.id}</text>
          </box>

          <box alignItems="center" flexWrap="wrap">
            <text fg={tone.fg}>{formatStatus(epic.frontmatter.status)}</text>
            {epic.frontmatter.priority ? <><text fg={COLORS.textDim}>  ·  </text><text fg={COLORS.textMuted}>{epic.frontmatter.priority}</text></> : null}
            {(epic.frontmatter.labels ?? []).slice(0, 4).map((label) => (
              <><text key={`${label}-sep`} fg={COLORS.textDim}>  ·  </text><text key={label} fg={COLORS.textMuted}>{label}</text></>
            ))}
          </box>

          <box alignItems="center" flexWrap="wrap">
            {summary.map((item) => <StatusChip key={item.status} status={item.status} count={item.count} compact />)}
          </box>

          <text fg={COLORS.textDim}>{truncate(assignees.join("  ·  ") || "Nobody assigned", 72)}</text>

          {references.length > 0 ? (
            <InspectorSection title="References">
              <ReferenceList references={references} />
            </InspectorSection>
          ) : null}

          <MetaSection title="Body">
            <markdown content={epic.body.trim() || "(empty body)"} syntaxStyle={markdownSyntaxStyle} />
          </MetaSection>
        </box>
      )}
    </scrollbox>
  );
}

function InspectorContent({
  index,
  target,
  focused,
  scrollRef,
  onOpenStatus,
  onOpenAssign,
  onClearAssign
}: {
  index: ProjectIndex;
  target: InspectorTarget;
  focused: boolean;
  scrollRef?: (node: ScrollBoxRenderable | null) => void;
  onOpenStatus?: () => void;
  onOpenAssign?: () => void;
  onClearAssign?: () => void;
}) {
  if (!target) {
    return (
      <scrollbox ref={scrollRef} flexGrow={1} focused={focused} border={false}>
        <text fg={COLORS.textDim}>Select an epic or ticket to inspect it.</text>
      </scrollbox>
    );
  }

  if (target.kind === "epic") {
    return <EpicInspector index={index} epic={target.entity} focused={focused} scrollRef={scrollRef} />;
  }

  return (
    <TicketInspector
      index={index}
      ticket={target.entity}
      focused={focused}
      scrollRef={scrollRef}
      onOpenStatus={onOpenStatus}
      onOpenAssign={onOpenAssign}
      onClearAssign={onClearAssign}
    />
  );
}

function InspectorPane({
  index,
  target,
  focused,
  width,
  scrollRef
}: {
  index: ProjectIndex;
  target: InspectorTarget;
  focused: boolean;
  width: number;
  scrollRef: (node: ScrollBoxRenderable | null) => void;
}) {
  const title = target ? `${target.kind === "ticket" ? "Ticket" : "Epic"} Detail` : "Inspector";
  return (
    <ListFrame title={title} width={width} focused={focused} borderSide="left">
      <InspectorContent index={index} target={target} focused={focused} scrollRef={scrollRef} />
    </ListFrame>
  );
}

function OverlayShell({
  title,
  children,
  width,
  onDismiss
}: {
  title: string;
  children: ReactNode;
  width: number;
  onDismiss?: () => void;
}) {
  const overlayWidth = width < 100 ? "92%" : width < 140 ? "82%" : "68%";
  const overlayLeft = width < 100 ? "4%" : width < 140 ? "9%" : "16%";
  return (
    <DialogFrame title={title} width={overlayWidth} left={overlayLeft} onDismiss={onDismiss}>
      {children}
    </DialogFrame>
  );
}

function MissingProjectView({ rootDir }: { rootDir: string }) {
  return (
    <box width="100%" height="100%" justifyContent="center" alignItems="center" backgroundColor={COLORS.background}>
      <box
        width="72%"
        minWidth={40}
        maxWidth="92%"
        flexDirection="column"
        border={["top"]}
        borderColor={COLORS.focus}
        backgroundColor={COLORS.shell}
        padding={1}
        gap={1}
      >
        <text fg={COLORS.text}>No `.agent-tasks/` directory found</text>
        <text fg={COLORS.textMuted}>{rootDir}</text>
        <box height={1} />
        <text fg={COLORS.textMuted}>This TUI expects git-native planning files in the current project.</text>
        <text fg={COLORS.textMuted}>It can initialize the default starter here and open directly into the board.</text>
        <box height={1} />
        <text fg={COLORS.text}>Files to create</text>
        <text fg={COLORS.textMuted}>.agent-tasks/project.yaml</text>
        <text fg={COLORS.textMuted}>.agent-tasks/tickets/</text>
        <text fg={COLORS.textMuted}>.agent-tasks/epics/</text>
        <text fg={COLORS.textMuted}>.agent-tasks/templates/</text>
        <box height={1} />
        <text fg={COLORS.accent}>press i or enter to initialize  |  q to quit</text>
      </box>
    </box>
  );
}

function getCommandOptions(params: {
  view: AppView;
  index: ProjectIndex;
  epicEntries: Array<{ id: string; label: string; count: number }>;
  assignees: AssigneeEntry[];
  activeTicket?: Ticket;
}): DialogOption[] {
  const { view, index, epicEntries, assignees, activeTicket } = params;
  const commands: DialogOption[] = [
    { name: "Switch to Board", description: "Open the board view", value: "view:board" },
    { name: "Switch to People", description: "Open the people workload view", value: "view:people" },
    { name: "Switch to Plan", description: "Open the dependency planning view", value: "view:plan" },
    { name: "Create Ticket", description: "Open the ticket creation dialog", value: "action:create-ticket" },
    { name: "Reload Project", description: "Refresh from disk", value: "action:reload" },
    { name: "Clear Search", description: "Remove the active search filter", value: "action:clear-search" }
  ];

  if (activeTicket) {
    commands.push(
      { name: `Change Status · ${activeTicket.frontmatter.id}`, description: "Open the status dialog", value: "action:status" },
      { name: `Assign Ticket · ${activeTicket.frontmatter.id}`, description: "Open the assign dialog", value: "action:assign" }
    );
  }

  return [
    ...commands,
    ...epicEntries.map((epic) => ({
      name: `Jump to Epic · ${epic.label}`,
      description: `${epic.count} tickets`,
      value: `epic:${epic.id}`
    })),
    ...index.tickets.map((ticket) => ({
      name: `Jump to Ticket · ${ticket.frontmatter.id}`,
      description: truncate(ticket.frontmatter.title, 60),
      value: `ticket:${ticket.frontmatter.id}`
    })),
    ...assignees.map((assignee) => ({
      name: `Jump to Assignee · ${assignee.label}`,
      description: `${assignee.count} tickets`,
      value: `person:${assignee.id}`
    }))
  ];
}

export function App({ rootDir, onExit }: AppProps) {
  const { snapshot, reload, initialize } = useProjectSnapshot(rootDir);
  const { width } = useTerminalDimensions();
  const layoutMode = getLayoutMode(width);
  const boardPresentation = getBoardPresentation(layoutMode, width);
  const [state, dispatch] = useReducer(uiReducer, initialUIState);
  const [toast, setToast] = useState<string>();
  const [hoveredId, setHoveredId] = useState<string>();
  const previousReason = useRef<string | undefined>(undefined);
  const selectionHintRef = useRef<string | undefined>(undefined);
  const epicScrollRef = useRef<ScrollBoxRenderable | null>(null);
  const peopleScrollRef = useRef<ScrollBoxRenderable | null>(null);
  const detailScrollRef = useRef<ScrollBoxRenderable | null>(null);
  const detailOverlayScrollRef = useRef<ScrollBoxRenderable | null>(null);
  const boardScrollRefs = useRef<Record<string, ScrollBoxRenderable | null>>({});
  const peopleTicketScrollRef = useRef<ScrollBoxRenderable | null>(null);

  const index = snapshot.mode === "ready" ? snapshot.index : undefined;
  const boardFilters = useMemo(
    () => ({
      epicId: state.selectedEpicId,
      search: state.searchQuery
    }),
    [state.searchQuery, state.selectedEpicId]
  );
  const boardVisibleTickets = useMemo(() => (index ? getVisibleTickets(index, boardFilters) : []), [boardFilters, index]);
  const columns = useMemo(() => (index ? getBoardColumns(index, boardFilters) : []), [boardFilters, index]);
  const allBoardColumns = useMemo(
    () => (index ? getBoardColumns(index, { epicId: ALL_EPICS_ID, search: "" }) : []),
    [index]
  );
  const epicEntries = useMemo(() => (index ? getEpicEntries(index) : []), [index]);
  const assignees = useMemo(() => (index ? getAssigneeEntries(index, state.searchQuery) : []), [index, state.searchQuery]);
  const planBuckets = useMemo(() => (index ? getPlanBuckets(index) : []), [index]);
  const selectedStatusIndex = getSelectedStatusIndex(state);
  const selectedColumn = columns[selectedStatusIndex] ?? columns[0];
  const selectedTicketIndex = selectedColumn ? getSelectedTicketIndex(state, selectedColumn.status) : 0;
  const boardSelectedTicket = selectedColumn?.tickets[selectedTicketIndex];
  const visibleColumns = useMemo(
    () => getVisibleBoardColumns(columns, selectedStatusIndex, getBoardWindowSize(layoutMode, width)),
    [columns, layoutMode, selectedStatusIndex, width]
  );
  const ticketCounts = useMemo(
    () => Object.fromEntries(columns.map((column) => [column.status, column.tickets.length])),
    [columns]
  );
  const selectedEpic = useMemo(() => (index ? getEpicById(index, state.selectedEpicId) : undefined), [index, state.selectedEpicId]);
  const selectedAssigneeEntry = assignees.find((entry) => entry.id === state.selectedAssignee) ?? assignees[0];
  const peopleTickets = selectedAssigneeEntry?.tickets ?? [];
  const peopleSelectedTicket = peopleTickets[state.selectedPersonTicketIndex] ?? peopleTickets[0];
  const selectedPlanBucket = planBuckets.find((bucket) => bucket.id === state.selectedPlanBucket) ?? planBuckets[0];
  const planSelectedTicketIndex = selectedPlanBucket ? getSelectedPlanTicketIndex(state, selectedPlanBucket.id) : 0;
  const planTickets = selectedPlanBucket?.tickets ?? [];
  const planSelectedTicket = planTickets[planSelectedTicketIndex] ?? planTickets[0];
  const activeTicket = state.view === "people"
    ? peopleSelectedTicket
    : state.view === "plan"
      ? planSelectedTicket
      : boardSelectedTicket;
  const activeEntity: InspectorTarget = useMemo(() => {
    if (state.view === "board" && state.focusPane === "epics" && (selectedEpic || state.selectedEpicId === ALL_EPICS_ID)) {
      return { kind: "epic", entity: selectedEpic };
    }
    if (activeTicket) {
      return { kind: "ticket", entity: activeTicket };
    }
    if (state.view === "board" && (selectedEpic || state.selectedEpicId === ALL_EPICS_ID)) {
      return { kind: "epic", entity: selectedEpic };
    }
    return null;
  }, [activeTicket, selectedEpic, state.focusPane, state.selectedEpicId, state.view]);
  const routeVisibleTickets = state.view === "people"
    ? peopleTickets
    : state.view === "plan"
      ? planTickets
      : boardVisibleTickets;
  const footerStatusSummary = useMemo(
    () => (index ? getStatusCounts(routeVisibleTickets, index.config.workflow.statuses) : []),
    [index, routeVisibleTickets]
  );
  const commandOptions = useMemo(
    () => (index ? getCommandOptions({
      view: state.view,
      index,
      epicEntries,
      assignees,
      activeTicket
    }) : []),
    [activeTicket, assignees, epicEntries, index, state.view]
  );

  useEffect(() => {
    if (!index) {
      return;
    }

    dispatch({
      type: "repair",
      payload: {
        epicIds: epicEntries.map((entry) => entry.id),
        assigneeIds: assignees.map((entry) => entry.id),
        planBucketIds: planBuckets.map((bucket) => bucket.id),
        statuses: index.config.workflow.statuses,
        ticketCounts,
        personTicketCount: peopleTickets.length,
        planTicketCounts: Object.fromEntries(planBuckets.map((bucket) => [bucket.id, bucket.tickets.length])),
        layoutMode,
        view: state.view
      }
    });
  }, [assignees, epicEntries, index, layoutMode, peopleTickets.length, planBuckets, state.view, ticketCounts]);

  useEffect(() => {
    if (snapshot.lastReloadReason && snapshot.lastReloadReason !== previousReason.current) {
      previousReason.current = snapshot.lastReloadReason;
      setToast(`${snapshot.lastReloadReason} · ${formatTimestamp()}`);
    }
  }, [snapshot.lastReloadReason]);

  useEffect(() => {
    if (snapshot.watcherState === "reloading" && activeTicket?.frontmatter.id) {
      selectionHintRef.current = activeTicket.frontmatter.id;
    }
  }, [activeTicket?.frontmatter.id, snapshot.watcherState]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = setTimeout(() => {
      setToast(undefined);
    }, 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (state.view === "board") {
      epicScrollRef.current?.scrollChildIntoView(`epic-${state.selectedEpicId}`);
      return;
    }
    if (state.view === "plan") {
      peopleScrollRef.current?.scrollChildIntoView(`plan-${state.selectedPlanBucket}`);
      return;
    }
    peopleScrollRef.current?.scrollChildIntoView(`person-${state.selectedAssignee}`);
  }, [state.selectedAssignee, state.selectedEpicId, state.selectedPlanBucket, state.view]);

  useEffect(() => {
    if (state.view === "board" && selectedColumn && boardSelectedTicket) {
      boardScrollRefs.current[selectedColumn.status]?.scrollChildIntoView(`ticket-${boardSelectedTicket.frontmatter.id}`);
      return;
    }

    if (state.view === "plan" && planSelectedTicket) {
      peopleTicketScrollRef.current?.scrollChildIntoView(`ticket-${planSelectedTicket.frontmatter.id}`);
      return;
    }

    if (state.view === "people" && peopleSelectedTicket) {
      peopleTicketScrollRef.current?.scrollChildIntoView(`ticket-${peopleSelectedTicket.frontmatter.id}`);
    }
  }, [boardSelectedTicket, peopleSelectedTicket, planSelectedTicket, selectedColumn, state.view]);

  useEffect(() => {
    if (snapshot.mode !== "ready" || snapshot.watcherState !== "live") {
      return;
    }

    const targetTicketId = selectionHintRef.current;
    if (!targetTicketId || !index) {
      return;
    }

    if (state.view === "people") {
      for (const assignee of assignees) {
        const ticketIndex = assignee.tickets.findIndex((ticket) => ticket.frontmatter.id === targetTicketId);
        if (ticketIndex < 0) {
          continue;
        }
        dispatch({ type: "set-person", assignee: assignee.id });
        dispatch({ type: "select-person-ticket", ticketIndex });
        selectionHintRef.current = undefined;
        return;
      }
    } else if (state.view === "plan") {
      for (const bucket of planBuckets) {
        const ticketIndex = bucket.tickets.findIndex((ticket) => ticket.frontmatter.id === targetTicketId);
        if (ticketIndex < 0) {
          continue;
        }
        dispatch({ type: "set-plan-bucket", bucketId: bucket.id });
        dispatch({ type: "select-plan-ticket", ticketIndex });
        selectionHintRef.current = undefined;
        return;
      }
    } else {
      dispatch({ type: "set-epic", epicId: ALL_EPICS_ID });
      for (const [statusIndex, column] of columns.entries()) {
        const ticketIndex = column.tickets.findIndex((ticket) => ticket.frontmatter.id === targetTicketId);
        if (ticketIndex < 0) {
          continue;
        }
        dispatch({
          type: "select-ticket",
          status: column.status,
          statusIndex,
          ticketIndex
        });
        selectionHintRef.current = undefined;
        return;
      }
    }

    selectionHintRef.current = undefined;
  }, [assignees, columns, index, planBuckets, snapshot.mode, snapshot.watcherState, state.view]);

  useEffect(() => {
    detailScrollRef.current?.scrollTo(0);
    detailOverlayScrollRef.current?.scrollTo(0);
  }, [activeEntity?.kind, activeTicket?.frontmatter.id, selectedEpic?.frontmatter.id, state.overlay]);

  const setBoardScrollRef = useCallback((status: string, node: ScrollBoxRenderable | null) => {
    boardScrollRefs.current[status] = node;
  }, []);

  const moveDetail = useCallback((offset: number) => {
    const target = state.overlay === "detail" ? detailOverlayScrollRef.current : detailScrollRef.current;
    scrollByStep(target, offset);
  }, [state.overlay]);

  const openFocusedDetail = useCallback(() => {
    if (!activeEntity) {
      return;
    }
    dispatch({ type: "open-overlay", overlay: "detail" });
  }, [activeEntity]);

  const updateAssignment = useCallback(async (value: string) => {
    if (!activeTicket) {
      return;
    }

    selectionHintRef.current = activeTicket.frontmatter.id;
    await updateEntity(rootDir, activeTicket.frontmatter.id, {
      assigned_to: normalizeAssignee(value)
    });
    dispatch({ type: "close-dialog" });
    await reload(`Updated assignee for ${activeTicket.frontmatter.id}`);
  }, [activeTicket, reload, rootDir]);

  const clearAssignment = useCallback(async () => {
    if (!activeTicket || !activeTicket.frontmatter.assigned_to) {
      return;
    }

    selectionHintRef.current = activeTicket.frontmatter.id;
    await updateEntity(rootDir, activeTicket.frontmatter.id, {
      assigned_to: null
    });
    await reload(`Cleared assignee for ${activeTicket.frontmatter.id}`);
  }, [activeTicket, reload, rootDir]);

  const updateStatus = useCallback(async (status: string) => {
    if (!activeTicket) {
      return;
    }

    selectionHintRef.current = activeTicket.frontmatter.id;
    await setEntityStatus(rootDir, activeTicket.frontmatter.id, status);
    dispatch({ type: "close-dialog" });
    await reload(`Moved ${activeTicket.frontmatter.id} to ${status}`);
  }, [activeTicket, reload, rootDir]);

  const createNewTicket = useCallback(async (values: CreateTicketSubmission) => {
    const created = await createTicket(rootDir, values);
    selectionHintRef.current = created.frontmatter.id;
    dispatch({ type: "close-dialog" });
    dispatch({ type: "set-view", view: "board", layoutMode });
    dispatch({ type: "set-epic", epicId: values.epic ?? ALL_EPICS_ID });
    await reload(`Created ${created.frontmatter.id}`);
  }, [layoutMode, reload, rootDir]);

  const selectEpic = useCallback((epicId: string) => {
    dispatch({ type: "set-view", view: "board", layoutMode });
    dispatch({ type: "set-epic", epicId });
    dispatch({ type: "set-focus", pane: "board" });
  }, [layoutMode]);

  const selectAssignee = useCallback((assignee: string) => {
    dispatch({ type: "set-view", view: "people", layoutMode });
    dispatch({ type: "set-person", assignee });
    dispatch({ type: "set-focus", pane: "board" });
  }, [layoutMode]);

  const selectPlanBucket = useCallback((bucketId: string) => {
    dispatch({ type: "set-view", view: "plan", layoutMode });
    dispatch({ type: "set-plan-bucket", bucketId });
    dispatch({ type: "set-focus", pane: "board" });
  }, [layoutMode]);

  const selectBoardTicket = useCallback((ticket: Ticket, status: string, statusIndex: number, ticketIndex: number) => {
    dispatch({ type: "set-view", view: "board", layoutMode });
    dispatch({
      type: "select-ticket",
      status,
      statusIndex,
      ticketIndex
    });
    dispatch({ type: "set-focus", pane: "board" });
    dispatch({ type: "open-overlay", overlay: "detail" });
  }, [layoutMode]);

  const selectPeopleTicket = useCallback((ticket: Ticket) => {
    const ticketIndex = peopleTickets.findIndex((candidate) => candidate.frontmatter.id === ticket.frontmatter.id);
    if (ticketIndex < 0) {
      return;
    }
    dispatch({ type: "set-view", view: "people", layoutMode });
    dispatch({ type: "select-person-ticket", ticketIndex });
    dispatch({ type: "set-focus", pane: "board" });
    dispatch({ type: "open-overlay", overlay: "detail" });
  }, [layoutMode, peopleTickets]);

  const selectPlanTicket = useCallback((ticket: Ticket) => {
    const ticketIndex = planTickets.findIndex((candidate) => candidate.frontmatter.id === ticket.frontmatter.id);
    if (ticketIndex < 0) {
      return;
    }
    dispatch({ type: "set-view", view: "plan", layoutMode });
    dispatch({ type: "select-plan-ticket", ticketIndex });
    dispatch({ type: "set-focus", pane: "board" });
    dispatch({ type: "open-overlay", overlay: "detail" });
  }, [layoutMode, planTickets]);

  const selectVisibleTicket = useCallback((direction: -1 | 1) => {
    const visible = routeVisibleTickets;
    if (!activeTicket) {
      return;
    }
    const currentIndex = visible.findIndex((ticket) => ticket.frontmatter.id === activeTicket.frontmatter.id);
    if (currentIndex < 0) {
      return;
    }
    const nextIndex = Math.max(0, Math.min(visible.length - 1, currentIndex + direction));
    const nextTicket = visible[nextIndex];
    if (!nextTicket || nextTicket.frontmatter.id === activeTicket.frontmatter.id) {
      return;
    }

    if (state.view === "people") {
      dispatch({ type: "select-person-ticket", ticketIndex: nextIndex });
      return;
    }

    if (state.view === "plan") {
      dispatch({ type: "select-plan-ticket", ticketIndex: nextIndex });
      return;
    }

    dispatch({ type: "set-epic", epicId: ALL_EPICS_ID });
    const statusIndex = allBoardColumns.findIndex((column) => column.status === nextTicket.frontmatter.status);
    const column = allBoardColumns[statusIndex];
    const ticketIndex = column?.tickets.findIndex((ticket) => ticket.frontmatter.id === nextTicket.frontmatter.id) ?? -1;
    if (statusIndex >= 0 && ticketIndex >= 0 && column) {
      dispatch({
        type: "select-ticket",
        status: column.status,
        statusIndex,
        ticketIndex
      });
    }
  }, [activeTicket, allBoardColumns, routeVisibleTickets, state.view]);

  const runCommand = useCallback(async (value: string) => {
    dispatch({ type: "close-dialog" });

    if (value === "view:board") {
      dispatch({ type: "set-view", view: "board", layoutMode });
      return;
    }
    if (value === "view:people") {
      dispatch({ type: "set-view", view: "people", layoutMode });
      return;
    }
    if (value === "view:plan") {
      dispatch({ type: "set-view", view: "plan", layoutMode });
      return;
    }
    if (value === "action:reload") {
      await reload("Manual reload");
      return;
    }
    if (value === "action:create-ticket") {
      dispatch({ type: "open-dialog", dialog: "create-ticket" });
      return;
    }
    if (value === "action:clear-search") {
      dispatch({ type: "set-search", searchQuery: "" });
      return;
    }
    if (value === "action:status" && activeTicket) {
      dispatch({ type: "open-dialog", dialog: "status" });
      return;
    }
    if (value === "action:assign" && activeTicket) {
      dispatch({ type: "open-dialog", dialog: "assign" });
      return;
    }
    if (value.startsWith("epic:")) {
      const epicId = value.slice("epic:".length);
      dispatch({ type: "set-view", view: "board", layoutMode });
      dispatch({ type: "set-search", searchQuery: "" });
      dispatch({ type: "set-epic", epicId });
      dispatch({ type: "set-focus", pane: "epics" });
      return;
    }
    if (value.startsWith("person:")) {
      const assignee = value.slice("person:".length);
      dispatch({ type: "set-view", view: "people", layoutMode });
      dispatch({ type: "set-search", searchQuery: "" });
      dispatch({ type: "set-person", assignee });
      dispatch({ type: "set-focus", pane: layoutMode === "narrow" ? "board" : "people" });
      return;
    }
    if (value.startsWith("ticket:") && index) {
      const ticketId = value.slice("ticket:".length);
      const ticket = getTicketById(index, ticketId);
      if (!ticket) {
        return;
      }
      dispatch({ type: "set-view", view: "board", layoutMode });
      dispatch({ type: "set-search", searchQuery: "" });
      dispatch({ type: "set-epic", epicId: ALL_EPICS_ID });
      const statusIndex = allBoardColumns.findIndex((column) => column.status === ticket.frontmatter.status);
      const column = allBoardColumns[statusIndex];
      const ticketIndex = column?.tickets.findIndex((item) => item.frontmatter.id === ticketId) ?? -1;
      if (statusIndex >= 0 && ticketIndex >= 0 && column) {
        dispatch({
          type: "select-ticket",
          status: column.status,
          statusIndex,
          ticketIndex
        });
      }
      return;
    }
  }, [activeTicket, allBoardColumns, index, layoutMode, reload]);

  useKeyboard((key) => {
    if (key.ctrl && key.name === "c") {
      key.preventDefault();
      key.stopPropagation();
      onExit();
      return;
    }

    if (snapshot.mode === "missing") {
      if (key.name === "q") {
        key.preventDefault();
        key.stopPropagation();
        onExit();
        return;
      }
      if (key.name === "i" || isEnterKey(key.name, key.sequence)) {
        key.preventDefault();
        key.stopPropagation();
        void initialize();
      }
      return;
    }

    if (snapshot.mode === "error") {
      if (key.name === "q") {
        key.preventDefault();
        key.stopPropagation();
        onExit();
        return;
      }
      if (key.name === "r") {
        key.preventDefault();
        key.stopPropagation();
        void reload("Manual reload");
      }
      return;
    }

    if (state.dialog) {
      return;
    }

    if (state.overlay) {
      if (key.name === "escape") {
        key.preventDefault();
        key.stopPropagation();
        dispatch({ type: "close-overlay" });
        return;
      }

      if (state.overlay === "epics") {
        if (key.name === "j" || key.name === "down") {
          key.preventDefault();
          key.stopPropagation();
          dispatch({ type: "move-epic", epicIds: epicEntries.map((entry) => entry.id), offset: 1 });
          return;
        }
        if (key.name === "k" || key.name === "up") {
          key.preventDefault();
          key.stopPropagation();
          dispatch({ type: "move-epic", epicIds: epicEntries.map((entry) => entry.id), offset: -1 });
          return;
        }
        if (isEnterKey(key.name, key.sequence)) {
          key.preventDefault();
          key.stopPropagation();
          dispatch({ type: "set-epic", epicId: state.selectedEpicId });
          return;
        }
      }

      if (state.overlay === "people") {
        if (key.name === "j" || key.name === "down") {
          key.preventDefault();
          key.stopPropagation();
          dispatch({ type: "move-person", assigneeIds: assignees.map((entry) => entry.id), offset: 1 });
          return;
        }
        if (key.name === "k" || key.name === "up") {
          key.preventDefault();
          key.stopPropagation();
          dispatch({ type: "move-person", assigneeIds: assignees.map((entry) => entry.id), offset: -1 });
          return;
        }
        if (isEnterKey(key.name, key.sequence)) {
          key.preventDefault();
          key.stopPropagation();
          dispatch({ type: "set-person", assignee: state.selectedAssignee });
          return;
        }
      }

      if (state.overlay === "plan") {
        if (key.name === "j" || key.name === "down") {
          key.preventDefault();
          key.stopPropagation();
          dispatch({ type: "move-plan-bucket", bucketIds: planBuckets.map((bucket) => bucket.id), offset: 1 });
          return;
        }
        if (key.name === "k" || key.name === "up") {
          key.preventDefault();
          key.stopPropagation();
          dispatch({ type: "move-plan-bucket", bucketIds: planBuckets.map((bucket) => bucket.id), offset: -1 });
          return;
        }
        if (isEnterKey(key.name, key.sequence)) {
          key.preventDefault();
          key.stopPropagation();
          dispatch({ type: "set-plan-bucket", bucketId: state.selectedPlanBucket });
          return;
        }
      }

      if (state.overlay === "detail") {
        if (key.name === "j" || key.name === "down") {
          key.preventDefault();
          key.stopPropagation();
          moveDetail(1);
          return;
        }
        if (key.name === "k" || key.name === "up") {
          key.preventDefault();
          key.stopPropagation();
          moveDetail(-1);
          return;
        }
        if (isUpperJ(key.name, key.sequence)) {
          key.preventDefault();
          key.stopPropagation();
          selectVisibleTicket(1);
          return;
        }
        if (isUpperK(key.name, key.sequence)) {
          key.preventDefault();
          key.stopPropagation();
          selectVisibleTicket(-1);
          return;
        }
        if (key.name === "s" && activeTicket) {
          key.preventDefault();
          key.stopPropagation();
          dispatch({ type: "open-dialog", dialog: "status" });
          return;
        }
        if (key.name === "a" && activeTicket) {
          key.preventDefault();
          key.stopPropagation();
          dispatch({ type: "open-dialog", dialog: "assign" });
          return;
        }
        if (key.name === "x" && activeTicket) {
          key.preventDefault();
          key.stopPropagation();
          void clearAssignment();
          return;
        }
        if (key.name === "n") {
          key.preventDefault();
          key.stopPropagation();
          dispatch({ type: "open-dialog", dialog: "create-ticket" });
          return;
        }
      }
      return;
    }

    if (key.name === "q") {
      key.preventDefault();
      key.stopPropagation();
      onExit();
      return;
    }

    if (key.name === "1") {
      key.preventDefault();
      key.stopPropagation();
      dispatch({ type: "set-view", view: "board", layoutMode });
      return;
    }

    if (key.name === "2") {
      key.preventDefault();
      key.stopPropagation();
      dispatch({ type: "set-view", view: "people", layoutMode });
      return;
    }

    if (key.name === "3") {
      key.preventDefault();
      key.stopPropagation();
      dispatch({ type: "set-view", view: "plan", layoutMode });
      return;
    }

    if (key.name === "tab") {
      key.preventDefault();
      key.stopPropagation();
      dispatch({ type: "cycle-focus", layoutMode, view: state.view });
      return;
    }

    if (key.name === "r") {
      key.preventDefault();
      key.stopPropagation();
      void reload("Manual reload");
      return;
    }

    if (key.name === "n") {
      key.preventDefault();
      key.stopPropagation();
      dispatch({ type: "open-dialog", dialog: "create-ticket" });
      return;
    }

    if (isColonKey(key.name, key.sequence)) {
      key.preventDefault();
      key.stopPropagation();
      dispatch({ type: "open-dialog", dialog: "command" });
      return;
    }

    if (isSlash(key.name, key.sequence)) {
      key.preventDefault();
      key.stopPropagation();
      dispatch({ type: "open-dialog", dialog: "search" });
      return;
    }

    if (isQuestionMark(key.name, key.sequence)) {
      key.preventDefault();
      key.stopPropagation();
      dispatch({ type: "open-dialog", dialog: "help" });
      return;
    }

    if (key.name === "s" && activeTicket) {
      key.preventDefault();
      key.stopPropagation();
      dispatch({ type: "open-dialog", dialog: "status" });
      return;
    }

    if (key.name === "a" && activeTicket) {
      key.preventDefault();
      key.stopPropagation();
      dispatch({ type: "open-dialog", dialog: "assign" });
      return;
    }

    if (key.name === "x" && activeTicket) {
      key.preventDefault();
      key.stopPropagation();
      void clearAssignment();
      return;
    }

    if (key.name === "[" && state.view === "board") {
      key.preventDefault();
      key.stopPropagation();
      dispatch({ type: "move-status", statuses: index?.config.workflow.statuses ?? [], offset: -1 });
      return;
    }

    if (key.name === "]" && state.view === "board") {
      key.preventDefault();
      key.stopPropagation();
      dispatch({ type: "move-status", statuses: index?.config.workflow.statuses ?? [], offset: 1 });
      return;
    }

    if (key.name === "e" && state.view === "board") {
      key.preventDefault();
      key.stopPropagation();
      if (layoutMode === "narrow") {
        dispatch({ type: "open-overlay", overlay: "epics" });
      } else {
        dispatch({ type: "set-focus", pane: "epics" });
      }
      return;
    }

    if (key.name === "p" && state.view === "people") {
      key.preventDefault();
      key.stopPropagation();
      if (layoutMode === "narrow") {
        dispatch({ type: "open-overlay", overlay: "people" });
      } else {
        dispatch({ type: "set-focus", pane: "people" });
      }
      return;
    }

    if (key.name === "g" && state.view === "plan") {
      key.preventDefault();
      key.stopPropagation();
      if (layoutMode === "narrow") {
        dispatch({ type: "open-overlay", overlay: "plan" });
      } else {
        dispatch({ type: "set-focus", pane: "plan" });
      }
      return;
    }

    if (state.focusPane === "epics") {
      if (key.name === "j" || key.name === "down") {
        key.preventDefault();
        key.stopPropagation();
        dispatch({ type: "move-epic", epicIds: epicEntries.map((entry) => entry.id), offset: 1 });
        return;
      }
      if (key.name === "k" || key.name === "up") {
        key.preventDefault();
        key.stopPropagation();
        dispatch({ type: "move-epic", epicIds: epicEntries.map((entry) => entry.id), offset: -1 });
        return;
      }
      if (isEnterKey(key.name, key.sequence)) {
        key.preventDefault();
        key.stopPropagation();
        openFocusedDetail();
      }
      return;
    }

    if (state.focusPane === "people") {
      if (key.name === "j" || key.name === "down") {
        key.preventDefault();
        key.stopPropagation();
        dispatch({ type: "move-person", assigneeIds: assignees.map((entry) => entry.id), offset: 1 });
        return;
      }
      if (key.name === "k" || key.name === "up") {
        key.preventDefault();
        key.stopPropagation();
        dispatch({ type: "move-person", assigneeIds: assignees.map((entry) => entry.id), offset: -1 });
        return;
      }
      if (isEnterKey(key.name, key.sequence)) {
        key.preventDefault();
        key.stopPropagation();
        dispatch({ type: "set-focus", pane: "board" });
      }
      return;
    }

    if (state.focusPane === "plan") {
      if (key.name === "j" || key.name === "down") {
        key.preventDefault();
        key.stopPropagation();
        dispatch({ type: "move-plan-bucket", bucketIds: planBuckets.map((bucket) => bucket.id), offset: 1 });
        return;
      }
      if (key.name === "k" || key.name === "up") {
        key.preventDefault();
        key.stopPropagation();
        dispatch({ type: "move-plan-bucket", bucketIds: planBuckets.map((bucket) => bucket.id), offset: -1 });
        return;
      }
      if (isEnterKey(key.name, key.sequence)) {
        key.preventDefault();
        key.stopPropagation();
        dispatch({ type: "set-focus", pane: "board" });
      }
      return;
    }

    if (state.focusPane === "board") {
      if (state.view === "board") {
        if (key.name === "j" || key.name === "down") {
          key.preventDefault();
          key.stopPropagation();
          dispatch({ type: "move-ticket", statuses: index?.config.workflow.statuses ?? [], ticketCounts, offset: 1 });
          return;
        }
        if (key.name === "k" || key.name === "up") {
          key.preventDefault();
          key.stopPropagation();
          dispatch({ type: "move-ticket", statuses: index?.config.workflow.statuses ?? [], ticketCounts, offset: -1 });
          return;
        }
        if (key.name === "h" || key.name === "left") {
          key.preventDefault();
          key.stopPropagation();
          dispatch({ type: "move-status", statuses: index?.config.workflow.statuses ?? [], offset: -1 });
          return;
        }
        if (key.name === "l" || key.name === "right") {
          key.preventDefault();
          key.stopPropagation();
          dispatch({ type: "move-status", statuses: index?.config.workflow.statuses ?? [], offset: 1 });
          return;
        }
      } else if (state.view === "people") {
        if (key.name === "j" || key.name === "down") {
          key.preventDefault();
          key.stopPropagation();
          dispatch({ type: "move-person-ticket", ticketCount: peopleTickets.length, offset: 1 });
          return;
        }
        if (key.name === "k" || key.name === "up") {
          key.preventDefault();
          key.stopPropagation();
          dispatch({ type: "move-person-ticket", ticketCount: peopleTickets.length, offset: -1 });
          return;
        }
        if (key.name === "h" || key.name === "left") {
          key.preventDefault();
          key.stopPropagation();
          if (layoutMode === "narrow") {
            dispatch({ type: "open-overlay", overlay: "people" });
          } else {
            dispatch({ type: "set-focus", pane: "people" });
          }
          return;
        }
      } else {
        if (key.name === "j" || key.name === "down") {
          key.preventDefault();
          key.stopPropagation();
          dispatch({ type: "move-plan-ticket", ticketCount: planTickets.length, offset: 1 });
          return;
        }
        if (key.name === "k" || key.name === "up") {
          key.preventDefault();
          key.stopPropagation();
          dispatch({ type: "move-plan-ticket", ticketCount: planTickets.length, offset: -1 });
          return;
        }
        if (key.name === "h" || key.name === "left") {
          key.preventDefault();
          key.stopPropagation();
          if (layoutMode === "narrow") {
            dispatch({ type: "open-overlay", overlay: "plan" });
          } else {
            dispatch({ type: "set-focus", pane: "plan" });
          }
          return;
        }
      }

      if (isEnterKey(key.name, key.sequence) && activeEntity) {
        key.preventDefault();
        key.stopPropagation();
        openFocusedDetail();
      }
      return;
    }

    if (state.focusPane === "detail") {
      if (key.name === "j" || key.name === "down") {
        key.preventDefault();
        key.stopPropagation();
        moveDetail(1);
        return;
      }
      if (key.name === "k" || key.name === "up") {
        key.preventDefault();
        key.stopPropagation();
        moveDetail(-1);
        return;
      }
      if (isUpperJ(key.name, key.sequence)) {
        key.preventDefault();
        key.stopPropagation();
        selectVisibleTicket(1);
        return;
      }
      if (isUpperK(key.name, key.sequence)) {
        key.preventDefault();
        key.stopPropagation();
        selectVisibleTicket(-1);
        return;
      }
      if (key.name === "escape" || key.name === "h" || key.name === "left") {
        key.preventDefault();
        key.stopPropagation();
        dispatch({ type: "set-focus", pane: "board" });
      }
    }
  });

  if (snapshot.mode === "loading") {
    return (
      <box width="100%" height="100%" justifyContent="center" alignItems="center" backgroundColor={COLORS.background}>
        <text fg={COLORS.textMuted}>Loading project…</text>
      </box>
    );
  }

  if (snapshot.mode === "missing") {
    return <MissingProjectView rootDir={rootDir} />;
  }

  if (snapshot.mode === "error" || !index) {
    return (
      <box width="100%" height="100%" justifyContent="center" alignItems="center" backgroundColor={COLORS.background}>
        <box
          width="68%"
          minWidth={40}
          maxWidth="92%"
          flexDirection="column"
          border={["top"]}
          borderColor={COLORS.danger}
          backgroundColor={COLORS.shell}
          padding={1}
          gap={1}
        >
          <text fg={COLORS.danger}>Project load failed</text>
          <text fg={COLORS.textMuted}>{snapshot.error ?? "Unknown error"}</text>
          <text fg={COLORS.textDim}>Press r to retry or q to quit.</text>
        </box>
      </box>
    );
  }

  return (
    <box width="100%" height="100%" flexDirection="column" backgroundColor={COLORS.background}>
      <TopBar
        index={index}
        view={state.view}
        layoutMode={layoutMode}
        searchQuery={state.searchQuery}
        watcherState={snapshot.watcherState}
        toast={toast}
        visibleTickets={routeVisibleTickets}
        modalActive={Boolean(state.dialog || state.overlay)}
        onSelectView={(nextView) => {
          dispatch({ type: "set-view", view: nextView, layoutMode });
        }}
      />

      <box flexGrow={1} flexDirection="row">
        {state.view === "board" && boardPresentation.showSidebar ? (
          <ListFrame title="Epics" width={boardPresentation.navWidth} focused={state.focusPane === "epics"} borderSide="right">
            <EpicList
              entries={epicEntries}
              selectedEpicId={state.selectedEpicId}
              focused={state.focusPane === "epics"}
              hoveredId={hoveredId}
              onHover={setHoveredId}
              onSelect={selectEpic}
              scrollRef={(node) => {
                epicScrollRef.current = node;
              }}
              compact
            />
          </ListFrame>
        ) : null}

        {state.view === "people" && (layoutMode === "wide" || layoutMode === "medium") ? (
          <ListFrame title="People" width={boardPresentation.navWidth} focused={state.focusPane === "people"} borderSide="right">
            <AssigneeList
              entries={assignees}
              selectedAssignee={state.selectedAssignee}
              focused={state.focusPane === "people"}
              hoveredId={hoveredId}
              onHover={setHoveredId}
              onSelect={selectAssignee}
              scrollRef={(node) => {
                peopleScrollRef.current = node;
              }}
              compact
            />
          </ListFrame>
        ) : null}

        {state.view === "plan" && (layoutMode === "wide" || layoutMode === "medium") ? (
          <ListFrame title="Plan" width={boardPresentation.navWidth} focused={state.focusPane === "plan"} borderSide="right">
            <PlanBucketList
              buckets={planBuckets}
              selectedBucketId={state.selectedPlanBucket}
              focused={state.focusPane === "plan"}
              hoveredId={hoveredId}
              onHover={setHoveredId}
              onSelect={selectPlanBucket}
              scrollRef={(node) => {
                peopleScrollRef.current = node;
              }}
              compact
            />
          </ListFrame>
        ) : null}

        {state.view === "board" ? (
          <box flexGrow={1} flexDirection="column">
            <StatusBoard
              index={index}
              columns={visibleColumns}
              selectedStatusIndex={selectedStatusIndex}
              selectedTicketId={boardSelectedTicket?.frontmatter.id}
              focusPane={state.focusPane}
              setScrollRef={setBoardScrollRef}
              previewNeighbors={boardPresentation.previewNeighbors}
              hoveredId={hoveredId}
              onHover={setHoveredId}
              onSelectStatus={(status, statusIndex) => {
                dispatch({ type: "set-focus", pane: "board" });
                dispatch({ type: "select-ticket", status, statusIndex, ticketIndex: 0 });
              }}
              onSelectTicket={selectBoardTicket}
            />
          </box>
        ) : state.view === "people" ? (
          <MainPanel
            title={selectedAssigneeEntry?.label ?? "Unassigned"}
            focused={state.focusPane === "board"}
            showHeader={layoutMode === "wide" || layoutMode === "medium"}
          >
            <TicketList
              tickets={peopleTickets}
              selectedTicketId={peopleSelectedTicket?.frontmatter.id}
              index={index}
              focused={state.focusPane === "board"}
              compactCards={layoutMode !== "wide"}
              showStatus={layoutMode === "wide"}
              hoveredId={hoveredId}
              onHover={setHoveredId}
              onSelect={selectPeopleTicket}
              scrollRef={(node) => {
                peopleTicketScrollRef.current = node;
              }}
            />
          </MainPanel>
        ) : (
          <MainPanel
            title={selectedPlanBucket?.label ?? "Planning"}
            focused={state.focusPane === "board"}
            showHeader={layoutMode === "wide" || layoutMode === "medium"}
          >
            <box paddingX={1} paddingY={0} border={layoutMode === "wide" || layoutMode === "medium" ? ["bottom"] : false} borderColor={COLORS.borderMuted}>
              <text fg={COLORS.textDim}>{selectedPlanBucket?.description ?? "Dependency-driven execution guidance."}</text>
            </box>
            <TicketList
              tickets={planTickets}
              selectedTicketId={planSelectedTicket?.frontmatter.id}
              index={index}
              focused={state.focusPane === "board"}
              compactCards={layoutMode !== "wide"}
              showStatus
              hoveredId={hoveredId}
              onHover={setHoveredId}
              onSelect={selectPlanTicket}
              scrollRef={(node) => {
                peopleTicketScrollRef.current = node;
              }}
            />
          </MainPanel>
        )}

      </box>

      <Footer
        layoutMode={layoutMode}
        view={state.view}
        focusPane={state.focusPane}
        dialog={state.dialog}
        overlay={state.overlay}
        statusSummary={footerStatusSummary}
      />

      {state.overlay === "epics" ? (
        <OverlayShell title={getOverlayTitle("epics", state.view)} width={width} onDismiss={() => { dispatch({ type: "close-overlay" }); }}>
          <EpicList
            entries={epicEntries}
            selectedEpicId={state.selectedEpicId}
            focused
            hoveredId={hoveredId}
            onHover={setHoveredId}
            onSelect={selectEpic}
            scrollRef={(node) => {
              epicScrollRef.current = node;
            }}
          />
        </OverlayShell>
      ) : null}

      {state.overlay === "people" ? (
        <OverlayShell title={getOverlayTitle("people", state.view)} width={width} onDismiss={() => { dispatch({ type: "close-overlay" }); }}>
          <AssigneeList
            entries={assignees}
            selectedAssignee={state.selectedAssignee}
            focused
            hoveredId={hoveredId}
            onHover={setHoveredId}
            onSelect={selectAssignee}
            scrollRef={(node) => {
              peopleScrollRef.current = node;
            }}
          />
        </OverlayShell>
      ) : null}

      {state.overlay === "plan" ? (
        <OverlayShell title={getOverlayTitle("plan", state.view)} width={width} onDismiss={() => { dispatch({ type: "close-overlay" }); }}>
          <PlanBucketList
            buckets={planBuckets}
            selectedBucketId={state.selectedPlanBucket}
            focused
            hoveredId={hoveredId}
            onHover={setHoveredId}
            onSelect={selectPlanBucket}
            scrollRef={(node) => {
              peopleScrollRef.current = node;
            }}
          />
        </OverlayShell>
      ) : null}

      {state.overlay === "detail" ? (
        <OverlayShell title={getInspectorTitle(activeEntity)} width={width} onDismiss={() => { dispatch({ type: "close-overlay" }); }}>
          <InspectorContent
            index={index}
            target={activeEntity}
            focused
            scrollRef={(node) => {
              detailOverlayScrollRef.current = node;
            }}
            onOpenStatus={activeTicket ? () => { dispatch({ type: "open-dialog", dialog: "status" }); } : undefined}
            onOpenAssign={activeTicket ? () => { dispatch({ type: "open-dialog", dialog: "assign" }); } : undefined}
            onClearAssign={activeTicket ? () => { void clearAssignment(); } : undefined}
          />
        </OverlayShell>
      ) : null}

      {state.dialog === "status" && activeTicket ? (
        <StatusDialog
          index={index}
          ticket={activeTicket}
          onSubmit={updateStatus}
          onCancel={() => {
            dispatch({ type: "close-dialog" });
          }}
        />
      ) : null}
      {state.dialog === "assign" && activeTicket ? (
        <AssignDialog
          ticket={activeTicket}
          onSubmit={updateAssignment}
          onCancel={() => {
            dispatch({ type: "close-dialog" });
          }}
        />
      ) : null}
      {state.dialog === "create-ticket" && index ? (
        <CreateTicketDialog
          index={index}
          selectedEpicId={state.selectedEpicId}
          onSubmit={createNewTicket}
          onClose={() => {
            dispatch({ type: "close-dialog" });
          }}
        />
      ) : null}
      {state.dialog === "search" ? (
        <SearchDialog
          initialValue={state.searchQuery}
          onSubmit={(value) => {
            dispatch({ type: "set-search", searchQuery: value.trim() });
            dispatch({ type: "close-dialog" });
          }}
          onCancel={() => {
            dispatch({ type: "close-dialog" });
          }}
        />
      ) : null}
      {state.dialog === "command" ? (
        <CommandPalette
          options={commandOptions}
          onSubmit={(value) => { void runCommand(value); }}
          onCancel={() => {
            dispatch({ type: "close-dialog" });
          }}
        />
      ) : null}
      {state.dialog === "help" ? (
        <HelpDialog
          onClose={() => {
            dispatch({ type: "close-dialog" });
          }}
        />
      ) : null}
    </box>
  );
}
