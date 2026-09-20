const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const previousKey = process.env.YOUTUBE_API_KEY;
const originalFetch = global.fetch;
process.env.YOUTUBE_API_KEY = "youtube-resource-search-smoke-key";

const calls = [];
global.fetch = async (requestUrl) => {
  const url = new URL(requestUrl);
  calls.push(url);
  if (url.pathname.endsWith("/search")) {
    return new Response(JSON.stringify({ items: [{
      id: { videoId: "dQw4w9WgXcQ" },
      snippet: {
        title: "React hooks tutorial",
        description: "Learn React hooks.",
        channelTitle: "CareerCube Test Channel",
        thumbnails: { high: { url: "https://img.youtube.com/mock.jpg" } },
      },
    }] }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.pathname.endsWith("/videos")) {
    return new Response(JSON.stringify({ items: [{
      id: "dQw4w9WgXcQ",
      snippet: { title: "React hooks tutorial", channelTitle: "CareerCube Test Channel" },
      contentDetails: { duration: "PT18M" },
    }] }), { status: 200, headers: { "content-type": "application/json" } });
  }
  throw new Error(`Unexpected YouTube path: ${url.pathname}`);
};

const { searchYouTubeVideos } = require("../server/src/services/youtube-resources");

(async () => {
  try {
    const searched = await searchYouTubeVideos("React hooks", 50);
    assert.equal(searched.length, 1);
    assert.equal(searched[0].youtubeVideoId, "dQw4w9WgXcQ");
    assert.equal(searched[0].watchUrl, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.equal(calls[0].searchParams.get("type"), "video");
    assert.equal(calls[0].searchParams.get("maxResults"), "20");

    const direct = await searchYouTubeVideos("https://www.youtube.com/watch?v=dQw4w9WgXcQ", 1);
    assert.equal(direct[0].durationIso, "PT18M");
    assert.match(calls[1].pathname, /\/videos$/);

    const service = readFileSync(join(__dirname, "..", "server", "src", "services", "youtube-resources.js"), "utf8");
    assert.match(service, /MAX_RESULTS = 20/);
    assert.match(service, /adminItems, \.\.\.automaticItems/);
    console.log("YouTube skill resource search smoke test passed.");
  } finally {
    global.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = previousKey;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
