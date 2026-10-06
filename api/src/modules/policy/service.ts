export type PipelinePolicyNode = {
  id?: string;
  path?: string;
  type?: string;
  kind?: string;
  parentId?: string | null;
  origin?: "ai" | "user" | "api" | string;
  isLocked: boolean;
  isCustom: boolean;
  suppressAiRestore: boolean;
  deletedAt: Date | null;
};

export type PolicyReplacementPlan<T extends PipelinePolicyNode> = {
  replaceable: T[];
  preserved: T[];
};

/** AI replan must respect lock / custom / soft-delete */
export class PolicyService {
  canAiMutate(node: PipelinePolicyNode): boolean {
    if (node.deletedAt) return false;
    if (node.suppressAiRestore) return false;
    if (node.isLocked) return false;
    if (node.isCustom) return false;
    if (node.kind === "journey" || node.type === "JOURNEY") return false;
    if (node.origin && node.origin !== "ai") return false;
    return true;
  }

  /**
   * Nodes the AI may soft-delete vs keep. A protected child also keeps its
   * ancestors so a locked hotel is not orphaned when the city is replanned.
   */
  planReplacement<T extends PipelinePolicyNode>(nodes: T[]): PolicyReplacementPlan<T> {
    const byId = new Map<string, T>();
    for (const node of nodes) {
      if (node.id) byId.set(node.id, node);
    }

    const preservedIds = new Set<string>();
    for (const node of nodes) {
      if (!node.id) continue;
      if (node.parentId === null || node.type === "JOURNEY") continue;
      if (this.canAiMutate(node)) continue;
      let current: T | undefined = node;
      while (current?.id) {
        if (current.kind === "journey" || current.type === "JOURNEY") break;
        preservedIds.add(current.id);
        if (!current.parentId) break;
        current = byId.get(current.parentId);
      }
    }

    return {
      replaceable: nodes.filter((node) => node.id != null && preservedIds.has(node.id) === false && this.canAiMutate(node)),
      preserved: nodes.filter((node) => node.id != null && preservedIds.has(node.id)),
    };
  }

  filterDrafts<T extends { path: string }>(drafts: T[], preserved: Array<{ path?: string }>): T[] {
    const preservedPaths = new Set(
      preserved.map((node) => node.path).filter((path): path is string => Boolean(path)),
    );
    if (preservedPaths.size === 0) return drafts;
    return drafts.filter((draft) => !this.isPathProtected(draft.path, preservedPaths));
  }

  isPathProtected(path: string, preservedPaths: Set<string>): boolean {
    if (preservedPaths.has(path)) return true;
    const parts = path.split("/").filter(Boolean);
    for (let i = parts.length - 1; i > 0; i -= 1) {
      const ancestor = parts.slice(0, i).join("/");
      if (ancestor === "trip" || ancestor === "journey") continue;
      if (preservedPaths.has(ancestor)) return true;
    }
    return false;
  }
}
