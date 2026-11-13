'use client';

import { useEffect, useRef, useState } from 'react';
import type { FacebookComment, FacebookPost } from '../lib/comments';

type Connection = {
  id: string;
  name: string;
  kind: 'page' | 'profile';
  remote_id: string;
};
type PageResult<T> = { items: T[]; nextCursor: string | null };
type Selection = { connectionId: string; postId: string } | null;
type EditAction = {
  kind: 'create' | 'reply' | 'edit' | 'delete';
  comment?: FacebookComment;
};

async function request<T>(
  path: string,
  method = 'GET',
  value?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    signal,
    credentials: 'same-origin',
    headers: value === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(result.error || 'Chưa tải được dữ liệu. Hãy thử lại.');
  return result as T;
}
const stamp = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ''
    : new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Asia/Ho_Chi_Minh',
      }).format(d);
};
function MessageIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
      <path d="M8 10h8M8 14h5" />
    </svg>
  );
}
function unique<T extends { id: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

export default function CommentsPanel({
  connections,
  initial,
  refreshVersion,
  onConnect,
  onChanged,
}: {
  connections: Connection[];
  initial: Selection;
  refreshVersion: number;
  onConnect: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const pages = connections.filter((c) => c.kind === 'page');
  const validInitial =
    initial && pages.some((p) => p.id === initial.connectionId)
      ? initial
      : null;
  const [connectionId, setConnectionId] = useState(
    validInitial?.connectionId || pages[0]?.id || '',
  );
  const [posts, setPosts] = useState<FacebookPost[]>([]);
  const [postId, setPostId] = useState(validInitial?.postId || '');
  const [postCursor, setPostCursor] = useState<string | null>(null);
  const [comments, setComments] = useState<FacebookComment[]>([]);
  const [commentCursor, setCommentCursor] = useState<string | null>(null);
  const [postsLoading, setPostsLoading] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [postsError, setPostsError] = useState('');
  const [commentsError, setCommentsError] = useState('');
  const [search, setSearch] = useState('');
  const [postSearch, setPostSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [revision, setRevision] = useState(0);
  const [postsRevision, setPostsRevision] = useState(0);
  const [threadVersion, setThreadVersion] = useState(0);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<EditAction | null>(null);
  const context = useRef('');
  useEffect(() => {
    context.current = `${connectionId}/${postId}`;
  }, [connectionId, postId]);
  const base = `connections/${encodeURIComponent(connectionId)}`;
  const selected = posts.find((p) => p.id === postId);

  useEffect(() => {
    if (!connectionId) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setPostsLoading(true);
      setPostsError('');
      setPosts([]);
      setPostCursor(null);
    });
    request<PageResult<FacebookPost>>(
      `${base}/facebook-posts`,
      'GET',
      undefined,
      controller.signal,
    )
      .then((result) => {
        setPosts(result.items);
        setPostCursor(result.nextCursor);
        setPostId((current) => current || result.items[0]?.id || '');
      })
      .catch((error) => {
        if (!controller.signal.aborted) setPostsError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPostsLoading(false);
      });
    return () => controller.abort();
  }, [base, connectionId, refreshVersion, postsRevision]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setComments([]);
      setCommentCursor(null);
      setCommentsError('');
      setNotice('');
      setEdit(null);
      setCommentsLoading(!!connectionId && !!postId);
    });
    if (!connectionId || !postId) return () => controller.abort();
    request<PageResult<FacebookComment>>(
      `${base}/comments?postId=${encodeURIComponent(postId)}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then((result) => {
        setComments(result.items);
        setCommentCursor(result.nextCursor);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setCommentsError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCommentsLoading(false);
      });
    return () => controller.abort();
  }, [base, connectionId, postId, refreshVersion, revision]);

  async function more(kind: 'posts' | 'comments') {
    const original = context.current;
    setMoreLoading(true);
    try {
      if (kind === 'posts' && postCursor) {
        const result = await request<PageResult<FacebookPost>>(
          `${base}/facebook-posts?after=${encodeURIComponent(postCursor)}`,
        );
        if (context.current !== original) return;
        setPosts((current) => unique([...current, ...result.items]));
        setPostCursor(result.nextCursor);
      } else if (kind === 'comments' && commentCursor) {
        const result = await request<PageResult<FacebookComment>>(
          `${base}/comments?postId=${encodeURIComponent(postId)}&after=${encodeURIComponent(commentCursor)}`,
        );
        if (context.current !== original) return;
        setComments((current) => unique([...current, ...result.items]));
        setCommentCursor(result.nextCursor);
      }
    } catch (error) {
      if (context.current === original) setNotice((error as Error).message);
    } finally {
      setMoreLoading(false);
    }
  }
  async function mutate(
    action: EditAction | { kind: 'hide'; comment: FacebookComment },
    message?: string,
  ) {
    const original = context.current;
    const comment = action.comment;
    let confirmed = '';
    setBusy(true);
    setNotice('');
    try {
      const path = `${base}/comments${comment ? `/${comment.id}` : ''}${action.kind === 'reply' ? '/replies' : ''}`;
      const result = await request<{ message: string }>(
        action.kind === 'delete'
          ? `${path}?postId=${encodeURIComponent(postId)}`
          : path,
        action.kind === 'delete'
          ? 'DELETE'
          : ['edit', 'hide'].includes(action.kind)
            ? 'PATCH'
            : 'POST',
        action.kind === 'delete'
          ? undefined
          : {
              postId,
              ...(action.kind === 'hide'
                ? { isHidden: !comment!.hidden }
                : { message }),
            },
      );
      if (context.current !== original) return;
      confirmed = result.message;
      setEdit(null);
      if (action.kind === 'hide')
        setComments((current) =>
          current.map((c) =>
            c.id === comment!.id ? { ...c, hidden: !c.hidden } : c,
          ),
        );
      // Refresh after every confirmed write so replies, counts and permissions stay current.
      const resultList = await request<PageResult<FacebookComment>>(
        `${base}/comments?postId=${encodeURIComponent(postId)}`,
      );
      if (context.current !== original) return;
      setComments(resultList.items);
      setCommentCursor(resultList.nextCursor);
      setThreadVersion((current) => current + 1);
      setNotice(result.message);
      void onChanged().catch(() => {});
    } catch (error) {
      if (context.current === original)
        setNotice(
          confirmed
            ? `${confirmed}. Chưa tải lại được danh sách. Hãy tải lại bình luận trước khi thao tác tiếp.`
            : (error as Error).message,
        );
    } finally {
      setBusy(false);
    }
  }
  const shown = comments.filter(
    (c) =>
      (filter === 'all' || (filter === 'hidden' ? c.hidden : !c.hidden)) &&
      `${c.author} ${c.message}`
        .toLocaleLowerCase('vi')
        .includes(search.toLocaleLowerCase('vi')),
  );

  if (!pages.length)
    return (
      <div className="comments-welcome panel">
        <span className="comment-hero-icon">
          <MessageIcon size={32} />
        </span>
        <h2>Mọi cuộc trò chuyện, một nơi quản lý</h2>
        <p>
          Kết nối Fanpage để đọc, trả lời và kiểm duyệt bình luận trên các bài
          viết của bạn.
        </p>
        <div className="comment-features">
          <span>↳ Trả lời với tư cách Fanpage</span>
          <span>◉ Ẩn và hiện lại bình luận</span>
          <span>⌕ Tìm kiếm trong bài viết</span>
        </div>
        <button className="button primary" onClick={onConnect}>
          Kết nối Fanpage <span aria-hidden="true">→</span>
        </button>
        <small>
          Bình luận trên Facebook cá nhân được quản lý trực tiếp trên Facebook.
        </small>
      </div>
    );

  return (
    <section className="comments-workspace" aria-label="Quản lý bình luận">
      <div className="comments-controls">
        <label className="page-select">
          <span>Fanpage đang quản lý</span>
          <select
            aria-label="Chọn Fanpage"
            value={connectionId}
            disabled={busy}
            onChange={(e) => {
              setConnectionId(e.target.value);
              setPostId('');
              setSearch('');
              setPostSearch('');
              setFilter('all');
            }}
          >
            {pages.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <p>Đọc và phản hồi bằng danh tính Fanpage của bạn.</p>
        <button className="button secondary" onClick={onConnect}>
          Cấp lại quyền Facebook
        </button>
      </div>
      <div className="comments-columns">
        <aside className="comment-posts">
          <div className="comment-pane-heading">
            <div>
              <span className="eyebrow">CHỌN CUỘC TRÒ CHUYỆN</span>
              <h2>Bài viết trên Fanpage</h2>
            </div>
            <span className="count-badge">{posts.length}</span>
          </div>
          <label className="search">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Tìm bài viết Facebook"
              placeholder="Tìm trong bài đã tải…"
              value={postSearch}
              onChange={(e) => setPostSearch(e.target.value)}
            />
          </label>
          {postsLoading && (
            <output className="comment-state">Đang tải bài viết…</output>
          )}
          {postsError && (
            <div className="comment-state" role="alert">
              <p>{postsError}</p>
              <button
                className="text-button"
                onClick={() => setPostsRevision((v) => v + 1)}
              >
                Thử tải lại bài viết
              </button>
            </div>
          )}
          <div className="comment-post-list">
            {postId && !selected && !postsLoading && (
              <button
                className="comment-post selected"
                disabled={busy}
                onClick={() => setPostId(postId)}
              >
                <strong>Bài viết đã chọn</strong>
                <small>{postId}</small>
              </button>
            )}
            {posts
              .filter((p) =>
                `${p.message} ${p.id}`
                  .toLocaleLowerCase('vi')
                  .includes(postSearch.toLocaleLowerCase('vi')),
              )
              .map((p) => (
                <button
                  className={`comment-post ${postId === p.id ? 'selected' : ''}`}
                  key={p.id}
                  aria-pressed={postId === p.id}
                  disabled={busy}
                  onClick={() => {
                    setPostId(p.id);
                    setFilter('all');
                    setSearch('');
                  }}
                >
                  <small>{stamp(p.createdTime) || 'Bài viết Facebook'}</small>
                  <strong>{p.message || 'Bài viết có ảnh hoặc video'}</strong>
                  <span>
                    Xem bình luận <span aria-hidden="true">→</span>
                  </span>
                </button>
              ))}
          </div>
          {!postsLoading && !postsError && !posts.length && (
            <p className="comment-state">
              Fanpage chưa có bài viết hiển thị qua API.
            </p>
          )}
          {postCursor && (
            <button
              className="button secondary small-button load-more"
              disabled={moreLoading || busy}
              onClick={() => void more('posts')}
            >
              {moreLoading ? 'Đang tải…' : 'Tải thêm bài viết'}
            </button>
          )}
        </aside>
        <div className="comment-inbox">
          {!postId ? (
            <div className="comment-state inbox-empty">
              <MessageIcon size={36} />
              <h3>Chọn một bài viết để bắt đầu</h3>
              <p>Bình luận và phản hồi sẽ xuất hiện tại đây.</p>
            </div>
          ) : (
            <>
              <div className="comment-inbox-heading">
                <div>
                  <span className="eyebrow">BÌNH LUẬN BÀI VIẾT</span>
                  <h2>{selected?.message || `Bài viết ${postId}`}</h2>
                  <a
                    className="text-button"
                    href={selected?.url || `https://www.facebook.com/${postId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Mở bài trên Facebook ↗
                  </a>
                </div>
                <button
                  className="button primary small-button"
                  disabled={busy || commentsLoading || !!commentsError}
                  onClick={() => setEdit({ kind: 'create' })}
                >
                  + Viết bình luận
                </button>
              </div>
              <div className="comment-toolbar">
                <div className="tabs" aria-label="Lọc bình luận">
                  {[
                    ['all', 'Tất cả'],
                    ['visible', 'Đang hiện'],
                    ['hidden', 'Đã ẩn'],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      className={filter === key ? 'selected' : ''}
                      aria-pressed={filter === key}
                      onClick={() => setFilter(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  className="text-button"
                  disabled={busy || commentsLoading}
                  onClick={() => setRevision((v) => v + 1)}
                >
                  ↻ Tải lại bình luận
                </button>
              </div>
              <label className="search comment-search">
                <span aria-hidden="true">⌕</span>
                <input
                  aria-label="Tìm bình luận"
                  placeholder="Tìm nội dung hoặc người bình luận…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <p className="comment-count">
                {shown.length} bình luận trong dữ liệu đã tải.
                {commentCursor &&
                  ' Chọn “Tải thêm” để xem các bình luận cũ hơn.'}
              </p>
              {notice && (
                <output className="comment-notice">
                  {notice}
                  <button
                    className="icon-button"
                    aria-label="Đóng thông báo bình luận"
                    onClick={() => setNotice('')}
                  >
                    ×
                  </button>
                </output>
              )}
              {commentsLoading ? (
                <output className="comment-state">
                  Đang tải bình luận từ Facebook…
                </output>
              ) : commentsError ? (
                <div className="comment-state comment-error" role="alert">
                  <h3>Chưa tải được bình luận</h3>
                  <p>{commentsError}</p>
                  <button
                    className="button secondary small-button"
                    onClick={() => setRevision((v) => v + 1)}
                  >
                    Thử lại
                  </button>
                </div>
              ) : (
                <>
                  {!shown.length && (
                    <div className="comment-state inbox-empty">
                      <MessageIcon size={32} />
                      <h3>
                        {comments.length
                          ? 'Không có bình luận phù hợp'
                          : 'Chưa có bình luận'}
                      </h3>
                      <p>
                        {comments.length
                          ? 'Thử đổi từ khóa hoặc bộ lọc.'
                          : 'Bình luận mới sẽ xuất hiện khi bạn tải lại.'}
                      </p>
                      {(search || filter !== 'all') && (
                        <button
                          className="text-button"
                          onClick={() => {
                            setSearch('');
                            setFilter('all');
                          }}
                        >
                          Xóa bộ lọc
                        </button>
                      )}
                    </div>
                  )}
                  <div className="comment-list">
                    {shown.map((c) => (
                      <CommentCard
                        key={`${c.id}-${revision}-${threadVersion}`}
                        comment={c}
                        base={base}
                        postId={postId}
                        busy={busy}
                        onAction={(action) => {
                          setNotice('');
                          setEdit(action);
                        }}
                        onHide={(comment) =>
                          void mutate({ kind: 'hide', comment })
                        }
                      />
                    ))}
                  </div>
                  {commentCursor && (
                    <button
                      className="button secondary load-more"
                      disabled={moreLoading || busy}
                      onClick={() => void more('comments')}
                    >
                      {moreLoading ? 'Đang tải…' : 'Tải thêm bình luận'}
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
      <p className="comment-permissions">
        Các thao tác được hiển thị theo quyền Facebook cấp. Để thêm quyền bình
        luận, mở Kiểm tra kết nối rồi chọn Bật quản lý bình luận. Nếu chưa có
        tùy chọn này, nhờ người cài đặt thiết lập thêm.
      </p>
      {edit && (
        <CommentEditor
          key={`${edit.kind}-${edit.comment?.id || 'new'}`}
          action={edit}
          busy={busy}
          error={notice}
          onClose={() => {
            if (!busy) setEdit(null);
          }}
          onSubmit={(message) => void mutate(edit, message)}
        />
      )}
    </section>
  );
}

function CommentCard({
  comment: c,
  base,
  postId,
  busy,
  onAction,
  onHide,
  nested = false,
}: {
  comment: FacebookComment;
  base: string;
  postId: string;
  busy: boolean;
  onAction: (action: EditAction) => void;
  onHide: (comment: FacebookComment) => void;
  nested?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState<FacebookComment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function load(more = false) {
    setOpen(true);
    setPending(true);
    setError('');
    try {
      const data = await request<PageResult<FacebookComment>>(
        `${base}/comments/${c.id}/replies?postId=${encodeURIComponent(postId)}${more && cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`,
      );
      if (mounted.current) {
        setReplies((previous) =>
          more ? unique([...previous, ...data.items]) : data.items,
        );
        setCursor(data.nextCursor);
      }
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setPending(false);
    }
  }
  return (
    <article
      className={`comment-card ${c.hidden ? 'is-hidden' : ''} ${nested ? 'nested' : ''}`}
      aria-label={`Bình luận của ${c.author}`}
    >
      <div className="comment-author">
        <span className="avatar small">
          {c.author.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <strong>{c.author}</strong>
          <time>{stamp(c.createdTime)}</time>
        </div>
        {c.canEdit && <span className="pill light">Fanpage</span>}
        {c.hidden && <span className="pill orange">Đã ẩn</span>}
      </div>
      <p className="comment-message">
        {c.message || '(Bình luận có nội dung đính kèm)'}
      </p>
      <div className="comment-actions">
        {c.canReply && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => onAction({ kind: 'reply', comment: c })}
          >
            Trả lời
          </button>
        )}
        {c.canEdit && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => onAction({ kind: 'edit', comment: c })}
          >
            Sửa
          </button>
        )}
        {c.canHide && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => onHide(c)}
          >
            {c.hidden ? 'Hiện lại' : 'Ẩn bình luận'}
          </button>
        )}
        {c.canDelete && (
          <button
            className="text-button danger-text"
            disabled={busy}
            onClick={() => onAction({ kind: 'delete', comment: c })}
          >
            Xóa
          </button>
        )}
        {c.url && (
          <a
            className="text-button"
            href={c.url}
            target="_blank"
            rel="noreferrer"
          >
            Facebook ↗
          </a>
        )}
        <small>{c.likeCount} lượt thích</small>
      </div>
      {!nested && c.replyCount > 0 && (
        <button
          className="text-button thread-toggle"
          disabled={pending || busy}
          onClick={() => (open ? setOpen(false) : void load())}
        >
          {open ? 'Thu gọn phản hồi' : `↳ Xem ${c.replyCount} phản hồi`}
        </button>
      )}
      {open && (
        <div className="comment-thread">
          {pending && <output>Đang tải phản hồi…</output>}
          {error && (
            <div role="alert">
              <p>{error}</p>
              <button className="text-button" onClick={() => void load()}>
                Thử lại
              </button>
            </div>
          )}
          {replies.map((reply) => (
            <CommentCard
              key={reply.id}
              comment={reply}
              base={base}
              postId={postId}
              busy={busy}
              onAction={onAction}
              onHide={onHide}
              nested
            />
          ))}
          {!pending && !error && !replies.length && (
            <p>Chưa có phản hồi hiển thị.</p>
          )}
          {cursor && (
            <button
              className="text-button"
              disabled={pending}
              onClick={() => void load(true)}
            >
              Tải thêm phản hồi
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function CommentEditor({
  action,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  action: EditAction;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (message: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState(
    action.kind === 'edit' ? action.comment?.message || '' : '',
  );
  const title = {
    create: 'Viết bình luận mới',
    reply: 'Trả lời bình luận',
    edit: 'Sửa bình luận',
    delete: 'Xóa bình luận',
  }[action.kind];
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = old;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="comment-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(message);
        }}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Đóng cửa sổ bình luận"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="comment-editor-body">
          {action.comment && (
            <blockquote>
              <strong>{action.comment.author}</strong>
              <p>{action.comment.message || '(Nội dung đính kèm)'}</p>
            </blockquote>
          )}
          {action.kind === 'delete' ? (
            <p>
              Bình luận và các phản hồi bên dưới sẽ bị xóa trên Facebook. Thao
              tác này không thể hoàn tác.
            </p>
          ) : (
            <label className="field">
              Nội dung bình luận
              <textarea
                autoFocus
                required
                maxLength={8000}
                rows={5}
                value={message}
                disabled={busy}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Viết với tư cách Fanpage…"
              />
              <span className="field-hint">
                {message.length.toLocaleString('vi-VN')}/8.000 ký tự
              </span>
            </label>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Hủy
          </button>
          <button
            className={`button ${action.kind === 'delete' ? 'danger' : 'primary'}`}
            disabled={busy || (action.kind !== 'delete' && !message.trim())}
          >
            {busy
              ? 'Đang xử lý…'
              : action.kind === 'delete'
                ? 'Xóa trên Facebook'
                : action.kind === 'edit'
                  ? 'Lưu thay đổi'
                  : 'Gửi bình luận'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
