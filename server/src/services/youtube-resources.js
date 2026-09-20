const { createHash } = require("node:crypto");
const { query } = require("../config/db");
const { ensureYouTubeResourceSchema } = require("./youtube-resource-schema");

const YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3";
const MAX_RESULTS = 20;
const CACHE_HOURS = 6;

const cleanText = (value, maxLength = 500) => String(value || "").trim().slice(0, maxLength);
const getYouTubeApiKey = () => cleanText(process.env.YOUTUBE_API_KEY, 300);
const watchUrl = (videoId) => `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function normaliseSkill(value) {
  return cleanText(value, 160).replace(/\s+/g, " ").toLowerCase();
}

function videoIdFromInput(value) {
  const raw = cleanText(value, 800);
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (host === "youtu.be" || host.endsWith(".youtu.be")) {
      const id = url.pathname.split("/").filter(Boolean)[0] || "";
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
    }
    if (!(host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtube-nocookie.com" || host.endsWith(".youtube-nocookie.com"))) return "";
    const id = url.searchParams.get("v") || url.pathname.split("/").filter(Boolean).find((part, index, parts) => ["shorts", "embed", "live"].includes(parts[index - 1])) || "";
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
  } catch {
    return "";
  }
}

function normaliseVideo(item) {
  const videoId = cleanText(item?.youtubeVideoId || item?.id?.videoId || item?.id || item?.youtube_video_id, 32);
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
  const snippet = item?.snippet || {};
  return {
    youtubeVideoId: videoId,
    title: cleanText(snippet.title || item?.title, 255) || "Untitled YouTube video",
    description: cleanText(snippet.description || item?.description, 10000) || null,
    channelTitle: cleanText(snippet.channelTitle || item?.channelTitle || item?.channel_title, 255) || null,
    thumbnailUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || item?.thumbnailUrl || item?.thumbnail_url || null,
    watchUrl: cleanText(item?.watchUrl || item?.watch_url, 600) || watchUrl(videoId),
    durationIso: cleanText(item?.contentDetails?.duration || item?.durationIso || item?.duration_iso, 40) || null,
  };
}

function youtubeError(response, body) {
  const error = new Error(
    response.status === 403
      ? "YouTube request was denied. Check the API key, YouTube Data API v3 and quota."
      : response.status === 429
        ? "YouTube is temporarily rate-limiting requests. Please try again shortly."
        : "YouTube videos could not be loaded right now.",
  );
  error.statusCode = response.status >= 500 ? 502 : response.status;
  error.code = body?.error?.errors?.[0]?.reason || body?.error?.status || "youtube_request_failed";
  return error;
}

async function callYouTube(path, parameters) {
  const key = getYouTubeApiKey();
  if (!key) {
    const error = new Error("YouTube learning resources are not configured yet");
    error.statusCode = 503;
    error.code = "youtube_not_configured";
    throw error;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const params = new URLSearchParams({ ...parameters, key });
    const response = await fetch(`${YOUTUBE_API_URL}${path}?${params.toString()}`, { signal: controller.signal, headers: { Accept: "application/json" } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw youtubeError(response, body);
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

async function getYouTubeVideo(videoId) {
  const id = videoIdFromInput(videoId);
  if (!id) {
    const error = new Error("Enter a valid YouTube video URL or video ID");
    error.statusCode = 400;
    throw error;
  }
  const body = await callYouTube("/videos", { part: "snippet,contentDetails", id });
  return normaliseVideo(body.items?.[0]);
}

async function searchYouTubeVideos(searchTerm, maxResults = MAX_RESULTS) {
  const directVideoId = videoIdFromInput(searchTerm);
  if (directVideoId) {
    const video = await getYouTubeVideo(directVideoId);
    return video ? [video] : [];
  }
  const skill = cleanText(searchTerm, 160);
  if (skill.length < 2) return [];
  const body = await callYouTube("/search", {
    part: "snippet",
    type: "video",
    maxResults: String(Math.min(MAX_RESULTS, Math.max(1, Number(maxResults) || MAX_RESULTS))),
    q: `${skill} tutorial`,
    relevanceLanguage: "en",
    videoEmbeddable: "true",
  });
  return (Array.isArray(body.items) ? body.items : []).map(normaliseVideo).filter(Boolean);
}

async function upsertVideo(video, { source = "youtube", status = "published", createdBy = null, tags = [] } = {}) {
  await ensureYouTubeResourceSchema();
  const normalised = normaliseVideo(video);
  if (!normalised) throw new Error("YouTube did not return a usable video");
  const cleanTags = Array.from(new Set((Array.isArray(tags) ? tags : []).map((tag) => cleanText(tag, 80)).filter(Boolean))).slice(0, 12);
  await query(
    `INSERT INTO youtube_video_resources
      (youtube_video_id, title, description, channel_title, thumbnail_url, watch_url, duration_iso, tags, source, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title=VALUES(title), description=VALUES(description), channel_title=VALUES(channel_title),
       thumbnail_url=VALUES(thumbnail_url), watch_url=VALUES(watch_url), duration_iso=VALUES(duration_iso),
       tags=IF(VALUES(source)='admin', VALUES(tags), tags),
       source=IF(VALUES(source)='admin', VALUES(source), source),
       status=IF(VALUES(source)='admin', VALUES(status), status),
       created_by=IF(VALUES(source)='admin', VALUES(created_by), created_by),
       updated_at=NOW()`,
    [normalised.youtubeVideoId, normalised.title, normalised.description, normalised.channelTitle, normalised.thumbnailUrl, normalised.watchUrl, normalised.durationIso, JSON.stringify(cleanTags), source, status, createdBy],
  );
  const [saved] = await query("SELECT * FROM youtube_video_resources WHERE youtube_video_id=? LIMIT 1", [normalised.youtubeVideoId]);
  return saved;
}

async function findVideosByYouTubeIds(ids) {
  const uniqueIds = Array.from(new Set((Array.isArray(ids) ? ids : []).filter((id) => /^[A-Za-z0-9_-]{11}$/.test(id))));
  if (!uniqueIds.length) return [];
  const rows = await query(`SELECT * FROM youtube_video_resources WHERE status='published' AND youtube_video_id IN (${uniqueIds.map(() => "?").join(",")})`, uniqueIds);
  const positions = new Map(uniqueIds.map((id, index) => [id, index]));
  return rows.sort((left, right) => (positions.get(left.youtube_video_id) ?? 999) - (positions.get(right.youtube_video_id) ?? 999));
}

function resourceMatchesSkill(resource, skill) {
  const querySkill = normaliseSkill(skill);
  const tags = parseJson(resource.tags, []);
  const values = [resource.title, resource.description, ...(Array.isArray(tags) ? tags : [])].map((value) => normaliseSkill(value)).filter(Boolean);
  if (values.some((value) => value.includes(querySkill))) return true;
  const words = querySkill.split(" ").filter((word) => word.length > 1);
  return words.length > 0 && values.join(" ").includes(words.join(" "));
}

function asStudentResource(resource, { assignedByAdmin = false } = {}) {
  return {
    ...resource,
    tags: parseJson(resource.tags, []),
    assignedByAdmin,
    recommendationReason: assignedByAdmin
      ? resource.recommendation_reason || "Suggested by your CareerCube administrator for this skill."
      : "Top YouTube result for the skill you searched.",
  };
}

function resourceSearchErrorMessage(error) {
  if (error?.code === "accessNotConfigured") return "YouTube Data API v3 must be enabled before video search can run.";
  if (error?.code === "keyInvalid" || /api key not valid/i.test(error?.message || "")) return "The YouTube connection needs to be renewed by an administrator.";
  if (error?.code === "quotaExceeded" || error?.code === "dailyLimitExceeded") return "CareerCube has reached its temporary YouTube search limit. Please try again later.";
  return cleanText(error?.message, 300) || "YouTube videos could not be loaded right now.";
}

async function getAutomaticSkillVideos(skill) {
  const cleanSkill = cleanText(skill, 160);
  if (!getYouTubeApiKey()) return { items: [], configured: false, status: "not_configured" };
  const cacheKey = createHash("sha256").update(normaliseSkill(cleanSkill)).digest("hex");
  const [cache] = await query("SELECT video_ids FROM youtube_video_search_cache WHERE cache_key=? AND expires_at>NOW() LIMIT 1", [cacheKey]);
  if (cache) {
    const cached = await findVideosByYouTubeIds(parseJson(cache.video_ids, []));
    if (cached.length) return { items: cached, configured: true, status: "cached" };
    await query("DELETE FROM youtube_video_search_cache WHERE cache_key=?", [cacheKey]);
  }
  try {
    const discovered = await searchYouTubeVideos(cleanSkill, MAX_RESULTS);
    const tags = [cleanSkill];
    for (const video of discovered) await upsertVideo(video, { source: "youtube", tags });
    const videoIds = discovered.map((video) => video.youtubeVideoId);
    if (!videoIds.length) return { items: [], configured: true, status: "no_results" };
    await query(
      `INSERT INTO youtube_video_search_cache (cache_key, skill_query, video_ids, expires_at)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ${CACHE_HOURS} HOUR))
       ON DUPLICATE KEY UPDATE skill_query=VALUES(skill_query), video_ids=VALUES(video_ids), expires_at=VALUES(expires_at), updated_at=NOW()`,
      [cacheKey, cleanSkill, JSON.stringify(videoIds)],
    );
    return { items: await findVideosByYouTubeIds(videoIds), configured: true, status: "ready" };
  } catch (error) {
    console.warn("[youtube-resources] Skill video search failed", { code: error.code || "unavailable", statusCode: error.statusCode || 500 });
    return { items: [], configured: true, status: error.code || "unavailable", errorMessage: resourceSearchErrorMessage(error) };
  }
}

async function getStudentSkillResources({ userId, skill }) {
  const requestedSkill = cleanText(skill, 160);
  if (requestedSkill.length < 2) {
    const error = new Error("Write the skill you want to learn first");
    error.statusCode = 400;
    throw error;
  }
  await ensureYouTubeResourceSchema();
  const [assigned, automatic] = await Promise.all([
    query(
      `SELECT r.*, a.id assignment_id, a.recommendation_reason, a.assigned_at, u.name assigned_by_name
       FROM youtube_video_resource_assignments a
       JOIN youtube_video_resources r ON r.id=a.resource_id AND r.status='published'
       LEFT JOIN users u ON u.id=a.assigned_by
       WHERE a.student_id=?
       ORDER BY a.assigned_at DESC`,
      [userId],
    ),
    getAutomaticSkillVideos(requestedSkill),
  ]);
  const adminItems = assigned.filter((resource) => resourceMatchesSkill(resource, requestedSkill)).map((resource) => asStudentResource(resource, { assignedByAdmin: true }));
  const adminVideoIds = new Set(adminItems.map((item) => item.youtube_video_id));
  const automaticItems = automatic.items.filter((resource) => !adminVideoIds.has(resource.youtube_video_id)).map((resource) => asStudentResource(resource));
  return {
    skill: requestedSkill,
    items: [...adminItems, ...automaticItems].slice(0, MAX_RESULTS),
    source: {
      configured: automatic.configured,
      status: automatic.status,
      errorMessage: automatic.errorMessage || null,
      adminCount: adminItems.length,
      automaticCount: automaticItems.length,
      limit: MAX_RESULTS,
    },
  };
}

async function getAdminYouTubeResources() {
  await ensureYouTubeResourceSchema();
  const resources = await query(
    `SELECT r.*, COUNT(a.id) assignment_count
     FROM youtube_video_resources r
     LEFT JOIN youtube_video_resource_assignments a ON a.resource_id=r.id
     GROUP BY r.id
     ORDER BY r.updated_at DESC`,
  );
  return {
    configured: Boolean(getYouTubeApiKey()),
    resources: resources.map((resource) => ({ ...resource, tags: parseJson(resource.tags, []), assignment_count: Number(resource.assignment_count || 0) })),
  };
}

async function saveAdminYouTubeResource({ resourceInput, studentIds, assignToAll, reason, tags, status, adminId }) {
  const details = await getYouTubeVideo(resourceInput);
  if (!details) {
    const error = new Error("YouTube video was not found or is not public");
    error.statusCode = 404;
    throw error;
  }
  const resource = await upsertVideo(details, { source: "admin", status: status === "draft" ? "draft" : "published", createdBy: adminId, tags });
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
      `INSERT INTO youtube_video_resource_assignments (resource_id, student_id, assigned_by, recommendation_reason)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE assigned_by=VALUES(assigned_by), recommendation_reason=VALUES(recommendation_reason), updated_at=NOW()`,
      [resource.id, studentId, adminId, cleanText(reason, 600) || "Suggested by your CareerCube administrator."],
    );
  }
  return { resource, assignedCount: targetIds.length };
}

module.exports = {
  getAdminYouTubeResources,
  getStudentSkillResources,
  saveAdminYouTubeResource,
  searchYouTubeVideos,
};
