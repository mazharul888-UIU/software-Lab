const trimValue = (value) => String(value || "").trim();

const parseHttpsUrl = (value, hosts) => {
  const raw = trimValue(value);
  if (!raw) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const hostname = url.hostname.toLowerCase();
    if (!hosts.includes(hostname)) return null;
    return url;
  } catch {
    return null;
  }
};

const plainHandle = (value, pattern) => {
  const handle = trimValue(value).replace(/^@/, "");
  return pattern.test(handle) ? handle : null;
};

const safeDecode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
};

const firstPathPart = (url) => safeDecode(url.pathname.split("/").filter(Boolean)[0] || "");

export function socialProfileHref(key, value) {
  const raw = trimValue(value);
  if (!raw) return null;

  if (key === "facebook_url") {
    const directHandle = !raw.includes("/") && !raw.toLowerCase().includes("facebook.com")
      ? plainHandle(raw, /^[a-z0-9._-]{2,100}$/i)
      : null;
    if (directHandle) return `https://www.facebook.com/${directHandle}`;
    const url = parseHttpsUrl(raw, ["facebook.com", "www.facebook.com", "m.facebook.com"]);
    if (!url || (url.pathname === "/" && !url.searchParams.get("id"))) return null;
    return url.href;
  }

  if (key === "instagram_url") {
    const directHandle = !raw.includes("/") && !raw.toLowerCase().includes("instagram.com")
      ? plainHandle(raw, /^[a-z0-9._]{1,30}$/i)
      : null;
    const url = directHandle
      ? null
      : parseHttpsUrl(raw, ["instagram.com", "www.instagram.com"]);
    const handle = directHandle || (url ? firstPathPart(url) : "");
    if (!/^[a-z0-9._]{1,30}$/i.test(handle)) return null;
    return `https://www.instagram.com/${handle}/`;
  }

  if (key === "twitter_url") {
    const directHandle = !raw.includes("/") && !raw.toLowerCase().includes("x.com") && !raw.toLowerCase().includes("twitter.com")
      ? plainHandle(raw, /^[a-z0-9_]{1,15}$/i)
      : null;
    const url = directHandle
      ? null
      : parseHttpsUrl(raw, ["x.com", "www.x.com", "twitter.com", "www.twitter.com"]);
    const handle = directHandle || (url ? firstPathPart(url) : "");
    if (!/^[a-z0-9_]{1,15}$/i.test(handle)) return null;
    return `https://x.com/${handle}`;
  }

  if (key === "whatsapp") {
    let numberSource = raw;
    const url = parseHttpsUrl(raw, ["wa.me", "api.whatsapp.com"]);
    if (url) numberSource = url.hostname === "wa.me" ? firstPathPart(url) : url.searchParams.get("phone") || "";
    let digits = numberSource.replace(/\D/g, "");
    if (digits.startsWith("00")) digits = digits.slice(2);
    if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
    return `https://wa.me/${digits}`;
  }

  if (key === "telegram") {
    const url = parseHttpsUrl(raw, ["t.me", "www.t.me", "telegram.me", "www.telegram.me"]);
    const username = url ? firstPathPart(url) : raw.replace(/^@/, "");
    if (!/^[a-z][a-z0-9_]{4,31}$/i.test(username)) return null;
    return `https://t.me/${username}`;
  }

  return null;
}

export function socialProfileDisplay(key, value) {
  const raw = trimValue(value);
  const href = socialProfileHref(key, raw);
  if (!href) return "";
  if (key === "whatsapp") {
    const digits = new URL(href).pathname.replace(/\D/g, "");
    return raw.startsWith("+") ? raw : `+${digits}`;
  }
  if (key === "telegram") return `@${new URL(href).pathname.split("/").filter(Boolean)[0]}`;
  const url = new URL(href);
  const handle = url.pathname.split("/").filter(Boolean).pop();
  const decodedHandle = safeDecode(handle);
  return decodedHandle && decodedHandle !== "profile.php" ? `@${decodedHandle}` : url.hostname;
}

export function socialProfileApiValue(key, value) {
  const raw = trimValue(value);
  if (!raw) return "";
  const href = socialProfileHref(key, raw);
  if (!href) return raw;
  if (key === "whatsapp") return `+${new URL(href).pathname.replace(/\D/g, "")}`;
  if (key === "telegram") return new URL(href).pathname.split("/").filter(Boolean)[0] || "";
  return href;
}

export function socialProfileError(key, value) {
  if (!trimValue(value) || socialProfileHref(key, value)) return "";
  if (key === "whatsapp") return "Include the country code, for example +8801712345678.";
  if (key === "telegram") return "Enter a Telegram username or a valid t.me link.";
  if (key === "facebook_url") return "Enter a Facebook username or facebook.com profile link.";
  if (key === "instagram_url") return "Enter an Instagram username or instagram.com profile link.";
  return "Enter an X/Twitter username or x.com profile link.";
}
