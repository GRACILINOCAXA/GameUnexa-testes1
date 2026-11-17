export const buildCommentTree = comments => {
  const commentsById = new Map();
  const roots = [];

  const orderedComments = [...comments].sort((left, right) =>
    String(left.createdAt || '').localeCompare(String(right.createdAt || ''))
  );

  for (const comment of orderedComments) {
    if (!comment.id) continue;
    commentsById.set(comment.id, { ...comment, replies: [] });
  }

  for (const comment of commentsById.values()) {
    const parent = commentsById.get(comment.parentId);
    if (parent) {
      parent.replies.push(comment);
    } else {
      roots.push(comment);
    }
  }

  const flattened = [];
  const visit = (comment, depth) => {
    flattened.push({ ...comment, depth });
    comment.replies.forEach(reply => visit(reply, depth + 1));
  };

  roots.forEach(comment => visit(comment, 0));
  return flattened;
};
