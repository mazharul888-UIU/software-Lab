const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const previousKey = process.env.YOUTUBE_API_KEY;
const originalFetch = global.fetch;
process.env.YOUTUBE_API_KEY = "playlist-smoke-test-key";

const calls = [];
global.fetch = async (requestUrl) => {
  const url = new URL(requestUrl);
  calls.push(url);
  if (url.pathname.endsWith("/search")) {
    return new Response(JSON.stringify({
      items: [{
        id: { playlistId: "PLmockCourse1234" },
        snippet: {
          title: "SQL for analysts",
          description: "A practical SQL course.",
          channelTitle: "CareerCube Test Channel",
          thumbnails: { high: { url: "https://img.youtube.com/mock.jpg" } },
        },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.pathname.endsWith("/playlists")) {
    return new Response(JSON.stringify({
      items: [{
        id: "PLmockCourse1234",
        snippet: { title: "SQL for analysts", channelTitle: "CareerCube Test Channel" },
        contentDetails: { itemCount: 18 },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  throw new Error(`Unexpected YouTube path: ${url.pathname}`);
};

const { searchYouTubePlaylists } = require("../server/src/services/youtube-playlists");

(async () => {
  try {
    const searched = await searchYouTubePlaylists("SQL data analyst learning playlist", 3);
    assert.equal(searched.length, 1);
    assert.equal(searched[0].youtubePlaylistId, "PLmockCourse1234");
    assert.equal(searched[0].playlistUrl, "https://www.youtube.com/playlist?list=PLmockCourse1234");
    assert.equal(calls[0].searchParams.get("type"), "playlist");
    assert.equal(calls[0].searchParams.get("key"), "playlist-smoke-test-key");

    const direct = await searchYouTubePlaylists("https://www.youtube.com/playlist?list=PLmockCourse1234", 1);
    assert.equal(direct[0].itemCount, 18);
    assert.match(calls[1].pathname, /\/playlists$/);
    const playlistService = readFileSync(join(__dirname, "..", "server", "src", "services", "youtube-playlists.js"), "utf8");
    assert.match(playlistService, /item\?\.youtubePlaylistId \|\| item\?\.id\?\.playlistId/);
    console.log("YouTube playlist search smoke test passed.");
  } finally {
    global.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = previousKey;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
