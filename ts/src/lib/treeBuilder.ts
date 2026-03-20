/**
 * Generic indent-based tree builder.
 *
 * Transforms a flat array of rows with indent levels into a recursive tree,
 * using the Monoid pattern (stack as a path from root to current node).
 *
 * Separation of concerns: this module owns only the tree-building algebra.
 * Column extraction is the responsibility of callers (extractSetsu / extractSetsumei).
 */

// ── Public API ──

export type TreeRow = Readonly<{
  indent: number;
  code: string | null;
  name: string;
  amount: number | null;
}>;

export type TreeNode = Readonly<{
  code: string | null;
  name: string;
  amount: number | null;
  children: ReadonlyArray<TreeNode>;
}>;

// ── Internal mutable working type ──
// Mutation is confined within buildTree; externally the function is pure.

type MutableTreeNode = Omit<TreeNode, "children"> & { children: MutableTreeNode[] };

type StackEntry = Readonly<{ node: MutableTreeNode; indent: number }>;

const freeze = (node: MutableTreeNode): TreeNode => ({
  ...node,
  children: node.children.map(freeze),
});

/**
 * Build a tree from flat rows with indent levels.
 *
 * Algebraic model: the stack is a Monoid path from root to current node.
 * filter(indent < current) = "pop while top.indent >= current" in O(n) space.
 * This is valid because the stack is always monotonically increasing in indent.
 */
export const buildTree = (rows: ReadonlyArray<TreeRow>): ReadonlyArray<TreeNode> => {
  const root: MutableTreeNode = { code: null, name: "root", amount: null, children: [] };

  // reduce is used for its accumulator-as-cursor side effect on root.children.
  // The accumulated stack is a read-only path into the mutable tree.
  rows.reduce<ReadonlyArray<StackEntry>>(
    (stack, line) => {
      const node: MutableTreeNode = { code: line.code, name: line.name, amount: line.amount, children: [] };
      // Trim stack: keep only ancestors (indent strictly less than current)
      const trimmed = stack.filter(e => e.indent < line.indent);
      trimmed[trimmed.length - 1]!.node.children.push(node);
      return [...trimmed, { node, indent: line.indent }];
    },
    [{ node: root, indent: -1 }],
  );

  return root.children.map(freeze);
};
