const { createHash } = require("node:crypto");
const { query } = require("../config/db");
const { ensureYouTubePlaylistSchema } = require("./youtube-playlist-schema");

const YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3";
const CACHE_HOURS = 12;

const cleanText = (value, maxLength = 500) => String(value || "").trim().slice(0, maxLength);
const playlistUrl = (playlistId) => `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
const getYouTubeApiKey = () => cleanText(process.env.YOUTUBE_API_KEY, 300);

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function playlistIdFromInput(value) {
  const raw = cleanText(value, 600);
  if (!raw) return "";
  if (/^[A-Za-z0-9_-]{10,120}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (!/(^|\.)youtube\.com$|(^|\.)youtube-nocookie\.com$/i.test(url.hostname)) return "";
    const playlistId = url.searchParams.get("list") || "";
    return /^[A-Za-z0-9_-]{10,120}$/.test(playlistId) ? playlistId : "";
  } catch {
    return "";
  }
}

function normaliseSearchItem(item) {
  const playlistId = cleanText(item?.id?.playlistId || item?.id, 120);
  if (!playlistId) return null;
  const snippet = item?.snippet || {};
  return {
    youtubePlaylistId: playlistId,
    title: cleanText(snippet.title, 255) || "Untitled YouTube playlist",
    description: cleanText(snippet.description, 10000) || null,
    channelTitle: cleanText(snippet.channelTitle, 255) || null,
    thumbnailUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || null,
    playlistUrl: playlistUrl(playlistId),
    itemCount: Number.isFinite(Number(item?.contentDetails?.itemCount)) ? Number(item.contentDetails.itemCount) : null,
  };
}

async function callYouTube(path, params) {
  const key = getYouTubeApiKey();
  if (!key) {
    const error = new Error("YouTube playlists are not configured yet");
    error.statusCode = 503;
    error.code = "youtube_not_configured";
    throw error;
  }
  const queryString = new URLSearchParams({ ...params, key });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${YOUTUBE_API_URL}${path}?${queryString.toString()}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(
        response.status === 403
          ? "YouTube request was denied. Check the API key and quota."
          : response.status === 429
            ? "YouTube is temporarily rate-limiting requests. Please try again shortly."
            : "YouTube playlists could not be loaded right now.",
      );
      error.statusCode = response.status >= 500 ? 502 : response.status;
      error.code = body?.error?.errors?.[0]?.reason || body?.error?.status || "youtube_request_failed";
      throw error;
    }
    return body;
  } catch (error) {
    if (error.name === "AbortError") {
      const timeout = new Error("YouTube took too long to respond. Please try again.");
      timeout.statusCode = 504;
      timeout.code = "youtube_timeout";
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function searchYouTubePlaylists(searchTerm, maxResults = 6) {
  const directPlaylistId = playlistIdFromInput(searchTerm);
  if (directPlaylistId) {
    const item = await getYouTubePlaylist(directPlaylistId);
    return item ? [item] : [];
  }
  const term = cleanText(searchTerm, 200);
  if (term.length < 2) return [];
  const data = await callYouTube("/search", {
    part: "snippet",
    type: "playlist",
    maxResults: String(Math.min(10, Math.max(1, Number(maxResults) || 6))),
    q: term,
    relevanceLanguage: "en",
  });
  return (Array.isArray(data.items) ? data.items : []).map(normaliseSearchItem).filter(Boolean);
}

async function getYouTubePlaylist(playlistId) {
  const id = playlistIdFromInput(playlistId);
  if (!id) {
    const error = new Error("Enter a valid YouTube playlist URL or playlist ID");
    error.statusCode = 400;
    throw error;
  }
  const data = await callYouTube("/playlists", {
    part: "snippet,contentDetails",
    id,
  });
  return normaliseSearchItem(data.items?.[0]);
}

async function upsertPlaylist(playlist, { source = "youtube", status = "published", createdBy = null, tags = [] } = {}) {
  await ensureYouTubePlaylistSchema();
  const normalised = normaliseSearchItem(playlist);
  if (!normalised) throw new Error("YouTube did not return a usable playlist");
  const cleanTags = Array.from(new Set((Array.isArray(tags) ? tags : []).map((tag) => cleanText(tag, 80)).filter(Boolean))).slice(0, 12);
  await query(
    `INSERT INTO youtube_playlists
     (youtube_playlist_id, title, description, channel_title, thumbnail_url, playlist_url, item_count, tags, source, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title=VALUES(title), description=VALUES(description), channel_title=VALUES(channel_title),
       thumbnail_url=VALUES(thumbnail_url), playlist_url=VALUES(playlist_url), item_count=VALUES(item_count),
       tags=IF(VALUES(source)='admin', VALUES(tags), tags),
       source=IF(source='admin', source, VALUES(source)),
       status=IF(source='admin', status, VALUES(status)),
       created_by=IF(VALUES(source)='admin', VALUES(created_by), created_by),
       updated_at=NOW()`,
    [
      normalised.youtubePlaylistId, normalised.title, normalised.description, normalised.channelTitle,
      normalised.thumbnailUrl, normalised.playlistUrl, normalised.itemCount, JSON.stringify(cleanTags), source, status, createdBy,
    ],
  );
  const [saved] = await query("SELECT * FROM youtube_playlists WHERE youtube_playlist_id=? LIMIT 1", [normalised.youtubePlaylistId]);
  return saved;
}

async function getStudentProfileContext(userId) {
  const [profile] = await query(
    `SELECT p.target_role, p.degree, p.career_interests,
            COALESCE(GROUP_CONCAT(s.name ORDER BY us.score DESC, s.name SEPARATOR ','), '') skill_names
     FROM student_profiles p
     LEFT JOIN user_skills us ON us.user_id=p.user_id
     LEFT JOIN skills s ON s.id=us.skill_id
     WHERE p.user_id=?
     GROUP BY p.user_id, p.target_role, p.degree, p.career_interests`,
    [userId],
  );
  const interests = Array.isArray(parseJson(profile?.career_interests, []))
    ? parseJson(profile?.career_interests, []).map((item) => cleanText(item, 80)).filter(Boolean)
    : [];
  const skills = String(profile?.skill_names || "").split(",").map((item) => cleanText(item, 80)).filter(Boolean);
  return {
    targetRole: cleanText(profile?.target_role, 140),
    degree: cleanText(profile?.degree, 190),
    interests,
    skills,
  };
}

function buildRecommendationQuery(profile) {
  const parts = [profile.targetRole, ...profile.skills.slice(0, 2), ...profile.interests.slice(0, 1)]
    .map((item) => cleanText(item, 120))
    .filter(Boolean);
  if (!parts.length) return "";
  return `${parts.join(" ")} learning playlist`;
}

function profileCacheKey(profile) {
  const stableProfile = {
    targetRole: profile.targetRole.toLowerCase(),
    degree: profile.degree.toLowerCase(),
    interests: profile.interests.map((item) => item.toLowerCase()).sort(),
    skills: profile.skills.map((item) => item.toLowerCase()).sort(),
  };
  return createHash("sha256").update(JSON.stringify(stableProfile)).digest("hex");
}

async function findPlaylistsByYoutubeIds(ids) {
  const uniqueIds = Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean)));
  if (!uniqueIds.length) return [];
  const rows = await query(
    `SELECT * FROM youtube_playlists
     WHERE status='published' AND youtube_playlist_id IN (${uniqueIds.map(() => "?").join(",")})`,
    uniqueIds,
  );
  const order = new Map(uniqueIds.map((id, index) => [id, index]));
  return rows.sort((left, right) => (order.get(left.youtube_playlist_id) ?? 999) - (order.get(right.youtube_playlist_id) ?? 999));
}

async function getAutomaticRecommendations(userId) {
  const profile = await getStudentProfileContext(userId);
  const queryText = buildRecommendationQuery(profile);
  if (!queryText) return { items: [], profileReady: false, configured: Boolean(getYouTubeApiKey()), status: "profile_incomplete" };
  if (!getYouTubeApiKey()) return { items: [], profileReady: true, configured: false, status: "not_configured" };

  const cacheKey = profileCacheKey(profile);
  const [cache] = await query(
    "SELECT playlist_ids FROM youtube_playlist_search_cache WHERE cache_key=? AND expires_at>NOW() LIMIT 1",
    [cacheKey],
  );
  if (cache) {
    const items = await findPlaylistsByYoutubeIds(parseJson(cache.playlist_ids, []));
    return { items, profileReady: true, configured: true, status: "cached", queryText };
  }

  try {
    const discovered = await searchYouTubePlaylists(queryText, 6);
    for (const item of discovered) await upsertPlaylist(item, { source: "youtube", status: "published", tags: [...profile.skills.slice(0, 3), ...profile.interests.slice(0, 2)] });
    const playlistIds = discovered.map((item) => item.youtubePlaylistId);
    await query(
      `INSERT INTO youtube_playlist_search_cache (cache_key, query_text, playlist_ids, expires_at)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ${CACHE_HOURS} HOUR))
       ON DUPLICATE KEY UPDATE query_text=VALUES(query_text), playlist_ids=VALUES(playlist_ids), expires_at=VALUES(expires_at), updated_at=NOW()`,
      [cacheKey, queryText, JSON.stringify(playlistIds)],
    );
    return { items: await findPlaylistsByYoutubeIds(playlistIds), profileReady: true, configured: true, status: "ready", queryText };
  } catch (error) {
    return { items: [], profileReady: true, configured: true, status: error.code || "unavailable", queryText };
  }
}

async function getStudentPlaylistRecommendations(userId) {
  await ensureYouTubePlaylistSchema();
  const [assigned, automatic] = await Promise.all([
    query(
      `SELECT p.*, a.id assignment_id, a.assignment_source, a.recommendation_reason, a.state,
              a.assigned_at, a.saved_at, a.completed_at, u.name assigned_by_name
       FROM youtube_playlist_assignments a
       JOIN youtube_playlists p ON p.id=a.playlist_id AND p.status='published'
       LEFT JOIN users u ON u.id=a.assigned_by
       WHERE a.student_id=? AND a.assignment_source='admin'
       ORDER BY a.assigned_at DESC`,
      [userId],
    ),
    getAutomaticRecommendations(userId),
  ]);

  const automaticIds = automatic.items.map((item) => item.id);
  const savedStates = automaticIds.length
    ? await query(
      `SELECT playlist_id, id assignment_id, state, recommendation_reason, assigned_at, saved_at, completed_at
       FROM youtube_playlist_assignments
       WHERE student_id=? AND playlist_id IN (${automaticIds.map(() => "?").join(",")})`,
      [userId, ...automaticIds],
    )
    : [];
  const stateByPlaylist = new Map(savedStates.map((item) => [Number(item.playlist_id), item]));
  const adminIds = new Set(assigned.map((item) => Number(item.id)));
  const manualItems = assigned.map((item) => ({
    ...item,
    tags: parseJson(item.tags, []),
    assignedByAdmin: true,
    recommendationReason: item.recommendation_reason || "Suggested by your CareerCube administrator.",
  }));
  const automaticItems = automatic.items
    .filter((item) => !adminIds.has(Number(item.id)))
    .map((item) => {
      const state = stateByPlaylist.get(Number(item.id));
      return {
        ...item,
        tags: parseJson(item.tags, []),
        assignment_id: state?.assignment_id || null,
        assignment_source: "auto",
        state: state?.state || "suggested",
        assigned_at: state?.assigned_at || null,
        saved_at: state?.saved_at || null,
        completed_at: state?.completed_at || null,
        assignedByAdmin: false,
        recommendationReason: state?.recommendation_reason || `Matched to your saved skills and career interests${automatic.queryText ? `: ${automatic.queryText.replace(/ learning playlist$/i, "")}` : ""}.`,
      };
    });
  return {
    items: [...manualItems, ...automaticItems],
    source: {
      configured: automatic.configured,
      profileReady: automatic.profileReady,
      status: automatic.status,
      queryText: automatic.queryText || null,
      automaticCount: automaticItems.length,
      adminCount: manualItems.length,
    },
  };
}

async function setStudentPlaylistState({ userId, playlistId, state }) {
  await ensureYouTubePlaylistSchema();
  if (!new Set(["saved", "completed"]).has(state)) {
    const error = new Error("Choose a valid playlist action");
    error.statusCode = 400;
    throw error;
  }
  const [playlist] = await query("SELECT id, title FROM youtube_playlists WHERE id=? AND status='published' LIMIT 1", [playlistId]);
  if (!playlist) {
    const error = new Error("Playlist not found");
    error.statusCode = 404;
    throw error;
  }
  await query(
    `INSERT INTO youtube_playlist_assignments
     (playlist_id, student_id, assignment_source, recommendation_reason, state, saved_at, completed_at)
     VALUES (?, ?, 'auto', NULL, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       state=VALUES(state), saved_at=COALESCE(saved_at, VALUES(saved_at)),
       completed_at=CASE WHEN VALUES(state)='completed' THEN NOW() ELSE completed_at END,
       updated_at=NOW()`,
    [playlist.id, userId, state, state === "saved" || state === "completed" ? new Date() : null, state === "completed" ? new Date() : null],
  );
  return { title: playlist.title, state };
}

async function getAdminYouTubePlaylists() {
  await ensureYouTubePlaylistSchema();
  const rows = await query(
    `SELECT p.*, COUNT(a.id) assignment_count,
            SUM(CASE WHEN a.state='saved' THEN 1 ELSE 0 END) saved_count,
            SUM(CASE WHEN a.state='completed' THEN 1 ELSE 0 END) completed_count
     FROM youtube_playlists p
     LEFT JOIN youtube_playlist_assignments a ON a.playlist_id=p.id
     GROUP BY p.id
     ORDER BY p.updated_at DESC`,
  );
  return {
    configured: Boolean(getYouTubeApiKey()),
    playlists: rows.map((item) => ({ ...item, tags: parseJson(item.tags, []), assignment_count: Number(item.assignment_count || 0), saved_count: Number(item.saved_count || 0), completed_count: Number(item.completed_count || 0) })),
  };
}

async function saveAdminPlaylistAssignment({ playlistInput, studentIds, assignToAll, reason, tags, status, adminId }) {
  const details = await getYouTubePlaylist(playlistInput);
  if (!details) {
    const error = new Error("YouTube playlist was not found or is not public");
    error.statusCode = 404;
    throw error;
  }
  const playlist = await upsertPlaylist(details, {
    source: "admin",
    status: status === "draft" ? "draft" : "published",
    createdBy: adminId,
    tags,
  });
  const suppliedIds = Array.from(new Set((Array.isArray(studentIds) ? studentIds : []).map(Number).filter((id) => Number.isInteger(id) && id > 0)));
  let targetIds = suppliedIds;
  if (assignToAll) {
    const students = await query("SELECT id FROM users WHERE role='student' AND status='active'");
    targetIds = students.map((student) => Number(student.id));
  } else if (suppliedIds.length) {
    const placeholders = suppliedIds.map(() => "?").join(",");
    const students = await query(`SELECT id FROM users WHERE role='student' AND status='active' AND id IN (${placeholders})`, suppliedIds);
    targetIds = students.map((student) => Number(student.id));
  }
  for (const studentId of targetIds) {
    await query(
      `INSERT INTO youtube_playlist_assignments
       (playlist_id, student_id, assigned_by, assignment_source, recommendation_reason, state)
       VALUES (?, ?, ?, 'admin', ?, 'suggested')
       ON DUPLICATE KEY UPDATE
         assigned_by=VALUES(assigned_by), assignment_source='admin', recommendation_reason=VALUES(recommendation_reason),
         updated_at=NOW()`,
      [playlist.id, studentId, adminId, cleanText(reason, 600) || "Suggested by your CareerCube administrator."],
    );
  }
  return { playlist, assignedCount: targetIds.length };
}

module.exports = {
  getAdminYouTubePlaylists,
  getStudentPlaylistRecommendations,
  getYouTubeApiKey,
  getYouTubePlaylist,
  saveAdminPlaylistAssignment,
  searchYouTubePlaylists,
  setStudentPlaylistState,
};
