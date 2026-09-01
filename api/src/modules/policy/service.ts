export type PipelinePolicyNode = {
  isLocked: boolean;
  isCustom: boolean;
  suppressAiRestore: boolean;
  deletedAt: Date | null;
};

/** AI replan must respect lock / custom / soft-delete */
export class PolicyService {
  canAiMutate(node: PipelinePolicyNode): boolean {
    if (node.deletedAt) return false;
    if (node.suppressAiRestore) return false;
    if (node.isLocked) return false;
    if (node.isCustom) return false;
    return true;
  }
}
