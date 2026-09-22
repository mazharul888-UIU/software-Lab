import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Flag,
  Heart,
  Link2,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  Send,
  Share2,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { apiRequest } from "../../lib/api";

const initials = (name) => String(name || "Student")
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0])
  .join("")
  .toUpperCase();

const jsonList = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const timeAgo = (value) => {
  const date = new Date(value);
  const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  if (!Number.isFinite(seconds)) return "recently";
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
};

export function CommunityPostCooldown({ nextPostAt, className = "" }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = Math.max(0, new Date(nextPostAt).getTime() - now);
  if (!nextPostAt || !Number.isFinite(remaining) || remaining <= 0) return <span className={className}>Ready to post</span>;
  const totalSeconds = Math.ceil(remaining / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return <span className={className}>Next post in {hours}:{minutes}:{seconds}</span>;
}

const authorTone = (role, id) => {
  if (role === "admin") return "bg-plum";
  return ["bg-cobalt", "bg-coral", "bg-jade", "bg-ink"][Number(id || 0) % 4];
};

function EmptyFeed({ onNewPost, canPost, disabledReason }) {
  return (
    <div className="panel px-6 py-16 text-center">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] bg-cobalt/10 text-cobalt"><Users size={27} /></span>
      <h2 className="mt-5 text-xl font-extrabold">Start the real conversation.</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">There are no community posts yet. Ask a career question, share a useful resource, or celebrate a learning win.</p>
      {canPost ? <button onClick={onNewPost} className="btn-accent mt-6"><Send size={15} /> Create the first post</button> : <p className="mx-auto mt-5 max-w-md rounded-xl bg-coral/10 px-3 py-2 text-xs font-bold text-coral">{disabledReason || "Posting is currently unavailable."}</p>}
    </div>
  );
}

function CommunityMemberProfile({ post, viewer, onClose, onOpenConnections, notify }) {
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savingConnection, setSavingConnection] = useState(false);
  const dialogRef = useRef(null);
  const isStudent = post?.author_role === "student";
  const isOwnProfile = Number(post?.user_id) === Number(viewer?.id);

  useEffect(() => {
    let cancelled = false;
    if (!post) return undefined;
    if (!isStudent || isOwnProfile) {
      setStudent({ ...post, student_id: Number(post.user_id), connection_status: isOwnProfile ? "self" : null });
      setLoading(false);
      setError("");
      return undefined;
    }

    const loadProfile = async () => {
      setLoading(true);
      setError("");
      try {
        const matches = await apiRequest(`/network/students?q=${encodeURIComponent(post.user_id)}`);
        const matchedStudent = Array.isArray(matches)
          ? matches.find((item) => Number(item.student_id) === Number(post.user_id))
          : null;
        if (!matchedStudent) throw new Error("This student profile is no longer available.");
        if (!cancelled) setStudent(matchedStudent);
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadProfile();
    return () => { cancelled = true; };
  }, [isOwnProfile, isStudent, post]);

  useEffect(() => {
    dialogRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const sendConnectionRequest = async () => {
    if (!student?.student_id || savingConnection) return;
    setSavingConnection(true);
    try {
      const result = await apiRequest("/network/connections", {
        method: "POST",
        body: JSON.stringify({ studentId: student.student_id }),
      });
      notify(result.message);
      onOpenConnections(student);
    } catch (requestError) {
      notify(requestError.message);
    } finally {
      setSavingConnection(false);
    }
  };

  const status = student?.connection_status;
  return createPortal(
    <div className="modal-backdrop profile-modal-backdrop" onClick={onClose} role="presentation">
      <section ref={dialogRef} tabIndex={-1} className="modal-card profile-modal-card max-w-md" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="community-member-profile-title">
        <div className="flex items-start justify-between gap-4">
          <span className={`grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl text-sm font-extrabold text-white ${authorTone(post.author_role, post.user_id)}`}>
            {student?.avatar || student?.avatar_url ? <img src={student.avatar || student.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(post.author)}
          </span>
          <button onClick={onClose} className="btn-ghost min-h-9 px-2" aria-label="Close profile"><X size={18} /></button>
        </div>
        <div className="mt-4">
          <h2 id="community-member-profile-title" className="text-xl font-extrabold">{post.author}</h2>
          <p className="mt-1 text-sm text-muted">{post.author_role === "admin" ? "CareerCube administrator" : "CareerCube student"}</p>
        </div>

        {loading && <p className="mt-8 flex items-center gap-2 text-sm text-muted"><LoaderCircle size={16} className="animate-spin" /> Loading student profile...</p>}
        {error && <p className="mt-5 rounded-xl bg-coral/10 p-3 text-xs font-bold text-coral">{error}</p>}
        {!loading && !error && student && <>
          <div className="mt-5 grid gap-3 rounded-2xl bg-ink/[0.035] p-4 text-sm dark:bg-white/[0.04]">
            {isStudent && <p><b>Student ID:</b> <span className="text-muted">{student.student_id}</span></p>}
            <p><b>University:</b> <span className="text-muted">{student.university || "Not shared"}</span></p>
            <p><b>Degree:</b> <span className="text-muted">{student.degree || "Not shared"}</span></p>
          </div>
          {isStudent && !isOwnProfile && <div className="mt-6 flex justify-end gap-2">
            {status === "none" && <button disabled={savingConnection} onClick={sendConnectionRequest} className="btn-accent disabled:opacity-45">{savingConnection ? <LoaderCircle size={15} className="animate-spin" /> : <UserPlus size={15} />} Add</button>}
            {(status === "outgoing" || status === "incoming") && <button onClick={() => onOpenConnections(student)} className="btn-secondary">Open Connections &amp; Inbox</button>}
            {status === "connected" && <span className="tag !bg-jade/10 !text-jade">Connected</span>}
          </div>}
        </>}
      </section>
    </div>
  , document.body);
}

function PostCard({ post, viewer, onOpenProfile, onUpdate, onRemove, notify }) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const tags = jsonList(post.tags);
  const awaitingReview = post.status === "pending_review";

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeMenu = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const loadComments = async () => {
    setCommentsLoading(true);
    try {
      setComments(await apiRequest(`/community/posts/${post.id}/comments`));
    } catch (error) {
      notify(error.message);
    } finally {
      setCommentsLoading(false);
    }
  };

  const toggleComments = async () => {
    const nextOpen = !commentsOpen;
    setCommentsOpen(nextOpen);
    if (nextOpen) await loadComments();
  };

  const toggleLike = async () => {
    setBusyAction("like");
    try {
      const result = await apiRequest(`/community/posts/${post.id}/like`, { method: "POST" });
      onUpdate(post.id, { liked: result.liked, likes: Number(result.likes || 0) });
    } catch (error) {
      notify(error.message);
    } finally {
      setBusyAction("");
    }
  };

  const submitComment = async () => {
    const content = commentText.trim();
    if (!content) return;
    setCommentSaving(true);
    try {
      const created = await apiRequest(`/community/posts/${post.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setComments((current) => [...current, created]);
      setCommentText("");
      onUpdate(post.id, { comments: Number(post.comments || 0) + 1 });
    } catch (error) {
      notify(error.message);
    } finally {
      setCommentSaving(false);
    }
  };

  const removeComment = async (comment) => {
    if (!window.confirm("Remove this comment?")) return;
    try {
      await apiRequest(`/community/comments/${comment.id}`, { method: "DELETE" });
      setComments((current) => current.filter((item) => item.id !== comment.id));
      onUpdate(post.id, { comments: Math.max(0, Number(post.comments || 0) - 1) });
      notify("Comment removed.");
    } catch (error) {
      notify(error.message);
    }
  };

  const sharePost = async () => {
    setBusyAction("share");
    try {
      const result = await apiRequest(`/community/posts/${post.id}/share`, { method: "POST" });
      onUpdate(post.id, { share_count: Number(result.share_count || 0) });
      const url = `${window.location.origin}/student?post=${post.id}`;
      if (navigator.clipboard) await navigator.clipboard.writeText(url).catch(() => {});
      notify("Post link copied.");
    } catch (error) {
      notify(error.message);
    } finally {
      setBusyAction("");
    }
  };

  const reportPost = async (reason) => {
    setMenuOpen(false);
    if (!window.confirm(`Report this post as ${reason}? CareerCube administrators will review it.`)) return;
    try {
      await apiRequest(`/community/posts/${post.id}/report`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      notify("Report sent to administrators.");
    } catch (error) {
      notify(error.message);
    }
  };

  const deletePost = async () => {
    setMenuOpen(false);
    if (!window.confirm("Remove this post from the community?")) return;
    try {
      await apiRequest(`/community/posts/${post.id}`, { method: "DELETE" });
      onRemove(post.id);
      notify("Post removed.");
    } catch (error) {
      notify(error.message);
    }
  };

  return (
    <article id={`community-post-${post.id}`} className="panel p-5 sm:p-6">
      <header className="flex items-start gap-3">
        <button onClick={() => onOpenProfile(post)} className="flex min-w-0 flex-1 items-start gap-3 text-left" aria-label={`Open ${post.author}'s profile`}>
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xs font-extrabold text-white ${authorTone(post.author_role, post.user_id)}`}>{initials(post.author)}</span>
          <span className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-sm">{post.author}</b>
            {post.author_role === "admin" && <span className="tag !bg-plum/10 !text-plum"><ShieldCheck size={11} /> CareerCube admin</span>}
          </div>
          <small className="block truncate text-[11px] text-muted">{post.university || (post.author_role === "admin" ? "Platform team" : "CareerCube student")} · {timeAgo(post.created_at)}</small>
          </span>
        </button>
        <div ref={menuRef} className="relative">
          <button onClick={() => setMenuOpen((current) => !current)} className="btn-ghost min-h-8 px-2" aria-label="Post actions">•••</button>
          {menuOpen && (
            <div className="absolute right-0 top-10 z-20 w-44 rounded-2xl border border-ink/10 bg-[#FBF9F4] p-2 shadow-lift dark:bg-[#0A0A0A]">
              {Number(post.is_owner) === 1 ? (
                <button onClick={deletePost} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold text-coral hover:bg-coral/10"><Trash2 size={14} /> Remove post</button>
              ) : (
                <>
                  <button onClick={() => reportPost("spam")} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold hover:bg-ink/[0.05]"><Flag size={14} /> Report spam</button>
                  <button onClick={() => reportPost("fraud")} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold text-coral hover:bg-coral/10"><AlertTriangle size={14} /> Report fraud</button>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      <p className="mt-5 whitespace-pre-wrap break-words text-sm leading-7 text-ink/80 dark:text-white/75">{post.content}</p>
      {awaitingReview && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-500/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 shrink-0" size={15} />
          <span><b>Awaiting administrator review.</b> Only you and CareerCube administrators can see this post until it is approved.</span>
        </div>
      )}
      {!!post.link_url && (
        <a href={post.link_url} target="_blank" rel="noreferrer" className="mt-4 flex items-center gap-3 rounded-2xl border border-ink/10 bg-white/45 p-4 transition hover:-translate-y-0.5 hover:bg-white/70 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cobalt/10 text-cobalt"><Link2 size={18} /></span>
          <span className="min-w-0 flex-1"><b className="block text-xs">Shared resource</b><small className="block truncate text-muted">{post.link_url}</small></span>
          <ExternalLink size={15} className="text-muted" />
        </a>
      )}
      {!!tags.length && <div className="mt-4 flex flex-wrap gap-2">{tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>}

      <footer className="mt-5 flex flex-wrap items-center gap-2 border-t border-ink/[0.07] pt-4">
        {awaitingReview ? <span className="text-xs font-bold text-muted">Community actions will be available after approval.</span> : <>
        <button disabled={busyAction === "like"} onClick={toggleLike} className={`btn-ghost min-h-9 ${Number(post.liked) === 1 ? "!bg-coral/10 !text-coral" : ""}`}>
          <Heart size={15} fill={Number(post.liked) === 1 ? "currentColor" : "none"} /> {Number(post.likes || 0)}
        </button>
        <button onClick={toggleComments} className={`btn-ghost min-h-9 ${commentsOpen ? "!bg-cobalt/10 !text-cobalt" : ""}`}><MessageCircle size={15} /> {Number(post.comments || 0)}</button>
        <button disabled={busyAction === "share"} onClick={sharePost} className="btn-ghost ml-auto min-h-9"><Share2 size={15} /> {Number(post.share_count || 0) ? Number(post.share_count) : "Share"}</button>
        </>}
      </footer>

      {!awaitingReview && commentsOpen && (
        <section className="mt-4 rounded-2xl bg-ink/[0.025] p-3 dark:bg-white/[0.035]">
          <div className="flex gap-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cobalt text-[10px] font-extrabold text-white">{initials(viewer?.name)}</span>
            <input
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submitComment();
                }
              }}
              className="input min-h-9"
              placeholder="Write a real comment..."
              maxLength={1500}
            />
            <button disabled={!commentText.trim() || commentSaving} onClick={submitComment} className="btn-accent min-h-9 px-3 disabled:opacity-40">
              {commentSaving ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {commentsLoading && <p className="py-4 text-center text-xs text-muted"><LoaderCircle className="mr-2 inline animate-spin" size={14} /> Loading comments...</p>}
            {!commentsLoading && !comments.length && <p className="py-3 text-center text-xs text-muted">No comments yet. Start the discussion.</p>}
            {comments.map((comment) => (
              <div key={comment.id} className="flex items-start gap-2 rounded-xl bg-white/55 p-3 dark:bg-white/[0.04]">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[9px] font-extrabold text-white ${authorTone(comment.author_role, comment.user_id)}`}>{initials(comment.author)}</span>
                <div className="min-w-0 flex-1"><p className="text-xs"><b>{comment.author}</b>{comment.author_role === "admin" && <span className="ml-1 text-[9px] font-bold uppercase text-plum">Admin</span>}</p><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-muted">{comment.content}</p></div>
                {(Number(comment.is_owner) === 1 || viewer?.role === "admin") && <button onClick={() => removeComment(comment)} className="text-muted hover:text-coral" aria-label="Remove comment"><Trash2 size={13} /></button>}
              </div>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

export function CommunityPage({ posts, setPosts, loading, error, onRetry, notify, viewer, onNewPost, onOpenConnections, postingStatus }) {
  const [profilePost, setProfilePost] = useState(null);
  const [newPostsAbove, setNewPostsAbove] = useState(false);
  const postFeedRef = useRef(null);
  const knownPostIdsRef = useRef(null);
  const shouldPinToNewestRef = useRef(true);
  const stats = useMemo(() => posts.reduce((result, post) => ({
    likes: result.likes + Number(post.likes || 0),
    comments: result.comments + Number(post.comments || 0),
    shares: result.shares + Number(post.share_count || 0),
  }), { likes: 0, comments: 0, shares: 0 }), [posts]);

  const updatePost = (id, patch) => setPosts((current) => current.map((post) => Number(post.id) === Number(id) ? { ...post, ...patch } : post));

  const isNearFeedTop = () => (postFeedRef.current?.scrollTop || 0) < 80;

  const scrollToNewestPosts = (behavior = "smooth") => {
    shouldPinToNewestRef.current = true;
    postFeedRef.current?.scrollTo({ top: 0, behavior });
    setNewPostsAbove(false);
  };

  const handlePostFeedScroll = () => {
    const isNearTop = isNearFeedTop();
    shouldPinToNewestRef.current = isNearTop;
    if (isNearTop) setNewPostsAbove(false);
  };

  useEffect(() => {
    const currentIds = new Set(posts.map((post) => String(post.id)));
    const previousIds = knownPostIdsRef.current;
    knownPostIdsRef.current = currentIds;
    if (!previousIds) return;
    const hasNewPosts = posts.some((post) => !previousIds.has(String(post.id)));
    if (!hasNewPosts) return;
    if (shouldPinToNewestRef.current) {
      window.requestAnimationFrame(() => scrollToNewestPosts());
    } else {
      setNewPostsAbove(true);
    }
  }, [posts]);

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_330px]">
      <section className="flex h-[70vh] min-h-[520px] max-h-[720px] flex-col">
        <button disabled={!postingStatus.canPost} onClick={onNewPost} className="panel flex w-full items-center gap-3 p-4 text-left disabled:cursor-not-allowed disabled:opacity-75">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-plum text-xs font-extrabold text-white">{initials(viewer?.name)}</span>
          <span className="input flex min-h-10 items-center text-muted">{postingStatus.canPost ? "Share a question, insight or useful resource..." : postingStatus.disabled ? <span className="font-bold text-coral">{postingStatus.reason}</span> : <CommunityPostCooldown nextPostAt={postingStatus.nextPostAt} className="font-bold text-coral" />}</span>
          <span className={`btn-accent min-h-10 px-4 ${postingStatus.canPost ? "" : "opacity-40"}`}><Send size={15} /></span>
        </button>
        <div className="relative mt-4 min-h-0 flex-1">
          <div ref={postFeedRef} onScroll={handlePostFeedScroll} className="smooth-scroll-panel h-full space-y-4 overflow-y-auto pr-1">
            {loading && <div className="panel py-16 text-center text-sm text-muted"><LoaderCircle className="mx-auto mb-3 animate-spin text-cobalt" size={25} /> Loading the live community...</div>}
            {!loading && error && <div className="panel py-14 text-center"><AlertTriangle className="mx-auto text-coral" /><h2 className="mt-3 font-extrabold">Could not load the community</h2><p className="mt-1 text-xs text-muted">{error}</p><button onClick={onRetry} className="btn-secondary mt-5"><RefreshCw size={15} /> Try again</button></div>}
            {!loading && !error && !posts.length && <EmptyFeed onNewPost={onNewPost} canPost={postingStatus.canPost} disabledReason={postingStatus.reason} />}
            {!loading && !error && posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                viewer={viewer}
                notify={notify}
                onOpenProfile={setProfilePost}
                onUpdate={updatePost}
                onRemove={(id) => setPosts((current) => current.filter((item) => Number(item.id) !== Number(id)))}
              />
            ))}
          </div>
          {newPostsAbove && <button type="button" onClick={() => scrollToNewestPosts()} className="btn-accent absolute left-1/2 top-4 min-h-9 -translate-x-1/2 px-3 text-xs shadow-lift" aria-live="polite"><RefreshCw size={14} /> New posts</button>}
        </div>
      </section>
      <aside className="space-y-5">
        <div className="panel p-5">
          <div className="flex items-center justify-between"><h2 className="font-extrabold">Community pulse</h2><Users size={17} className="text-muted" /></div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[["Live posts", posts.length], ["Appreciations", stats.likes], ["Comments", stats.comments], ["Shares", stats.shares]].map(([label, value]) => (
              <div className="rounded-2xl bg-ink/[0.035] p-3 dark:bg-white/[0.04]" key={label}><b className="block text-lg">{value}</b><small className="text-[10px] font-bold text-muted">{label}</small></div>
            ))}
          </div>
        </div>
        <div className="overflow-hidden rounded-[28px] bg-cobalt p-6 text-white">
          <ShieldCheck size={22} />
          <h2 className="mt-5 text-xl font-extrabold">Community safety</h2>
          <p className="mt-2 text-sm leading-6 text-white/70">Never share passwords, OTPs, or send money for a job. Report suspicious posts for administrator review.</p>
          <div className="mt-5 flex items-center justify-between text-xs"><b>Real people. Safer conversations.</b><ArrowRight size={16} /></div>
        </div>
      </aside>
      {profilePost && <CommunityMemberProfile post={profilePost} viewer={viewer} onClose={() => setProfilePost(null)} onOpenConnections={onOpenConnections} notify={notify} />}
    </div>
  );
}

export function CommunityPostModal({ user, onClose, onSubmit }) {
  const [content, setContent] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [topics, setTopics] = useState("");
  const [saving, setSaving] = useState(false);

  const publish = async () => {
    setSaving(true);
    await onSubmit({
      content: content.trim(),
      linkUrl: linkUrl.trim(),
      tags: topics.split(",").map((item) => item.trim()).filter(Boolean),
    });
    setSaving(false);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card max-w-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex justify-between">
          <div><span className="eyebrow"><Users size={13} /> Career community</span><h2 className="mt-2 text-xl font-extrabold">Share with the community</h2></div>
          <button onClick={onClose} className="btn-ghost"><X size={18} /></button>
        </div>
        <div className="mt-6 flex gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-plum text-xs font-bold text-white">{initials(user?.name)}</span>
          <textarea autoFocus value={content} onChange={(event) => setContent(event.target.value)} className="input min-h-40 resize-none py-3" maxLength={5000} placeholder="What are you learning, building or wondering?" />
        </div>
        <div className="mt-4 grid gap-3">
          <label><span className="mb-1.5 flex items-center gap-1 text-xs font-bold"><Link2 size={13} /> Resource link <small className="font-normal text-muted">(optional)</small></span><input type="url" className="input" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://..." /></label>
          <label><span className="mb-1.5 block text-xs font-bold">Topics <small className="font-normal text-muted">(comma separated, maximum 5)</small></span><input className="input" value={topics} onChange={(event) => setTopics(event.target.value)} placeholder="Interview prep, JavaScript, Career advice" /></label>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-jade/10 p-3 text-xs text-jade"><CheckCircle2 size={16} className="shrink-0" /> Posts are checked for spam and fraud signals before publication.</div>
        <div className="mt-6 flex justify-end gap-3"><button onClick={onClose} className="btn-secondary">Cancel</button><button disabled={!content.trim() || saving} onClick={publish} className="btn-accent disabled:opacity-40">{saving ? "Publishing..." : "Publish post"} <Send size={15} /></button></div>
      </div>
    </div>
  );
}
