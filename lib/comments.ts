import { graph } from './facebook';

export type FacebookPost = {
  id: string;
  message: string;
  createdTime: string;
  url: string;
};
export type FacebookComment = {
  id: string;
  message: string;
  author: string;
  authorId: string;
  createdTime: string;
  hidden: boolean;
  canHide: boolean;
  canDelete: boolean;
  canReply: boolean;
  canEdit: boolean;
  replyCount: number;
  likeCount: number;
  url: string;
};
type RawComment = {
  id: string;
  message?: string;
  from?: { id?: string; name?: string };
  created_time?: string;
  is_hidden?: boolean;
  can_hide?: boolean;
  can_remove?: boolean;
  can_comment?: boolean;
  comment_count?: number;
  like_count?: number;
  permalink_url?: string;
  object?: { id?: string };
};
export const commentFields =
  'id,message,from,created_time,is_hidden,can_hide,can_remove,can_comment,comment_count,like_count,permalink_url';

export function safeFacebookLink(value: unknown, fallback = '') {
  try {
    const url = new URL(String(value));
    if (
      url.protocol === 'https:' &&
      /(^|\.)facebook\.com$/.test(url.hostname) &&
      !url.username &&
      !url.password
    )
      return url.href;
  } catch {
    /* Missing permalinks are normal for some comments. */
  }
  return fallback;
}
export function commentView(c: RawComment, pageId: string): FacebookComment {
  return {
    id: c.id,
    message: c.message || '',
    author: c.from?.name || 'Người dùng Facebook',
    authorId: c.from?.id || '',
    createdTime: c.created_time || '',
    hidden: c.is_hidden === true,
    canHide: c.can_hide === true,
    canDelete: c.can_remove === true,
    canReply: c.can_comment === true,
    canEdit: c.from?.id === pageId,
    replyCount: Math.max(0, Number(c.comment_count) || 0),
    likeCount: Math.max(0, Number(c.like_count) || 0),
    url: safeFacebookLink(c.permalink_url),
  };
}

export async function listComments(
  nodeId: string,
  token: string,
  pageId: string,
  after: string,
  version?: string,
) {
  const query = new URLSearchParams({
    fields: commentFields,
    filter: 'toplevel',
    order: 'reverse_chronological',
    limit: '30',
  });
  if (after) query.set('after', after);
  const response = (await graph(`${nodeId}/comments?${query}`, token, {
    version,
    resource: 'comment',
  })) as {
    data?: RawComment[];
    paging?: { next?: string; cursors?: { after?: string } };
    error?: unknown;
  };
  if (!Array.isArray(response.data))
    throw new Error('Invalid Facebook comments response');
  return {
    items: response.data
      .filter((c) => /^\d+(?:_\d+)?$/.test(c.id))
      .map((c) => commentView(c, pageId)),
    // Never return Facebook's next URL: it may contain a token.
    nextCursor: response.paging?.next
      ? response.paging.cursors?.after || null
      : null,
  };
}
