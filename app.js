// ---------------------------
// CONFIG
// ---------------------------
const clientId = "fe93600360614cf7b243cf847d35077e";
const redirectUri = window.location.origin + window.location.pathname;

let accessToken = null;
let player = null;
let deviceId = null;

// ---------------------------
// SPOTIFY SDK CALLBACK (MUST EXIST IMMEDIATELY)
// ---------------------------
window.onSpotifyWebPlaybackSDKReady = () => {
  const waitForToken = setInterval(() => {
    if (!accessToken) return;

    clearInterval(waitForToken);

    player = new Spotify.Player({
      name: "Music Quiz Player",
      getOAuthToken: cb => cb(accessToken),
      volume: 0.8
    });

    player.addListener("ready", ({ device_id }) => {
      deviceId = device_id;
      document.getElementById("playerControls").style.display = "block";
      console.log("Spotify Player ready:", deviceId);
    });

    player.addListener("authentication_error", e => {
      console.error("Auth error", e);
    });

    player.addListener("account_error", e => {
      console.error("Account error", e);
    });

    player.addListener("initialization_error", e => {
      console.error("Init error", e);
    });

    player.connect();
  }, 300);
};

// ---------------------------
// PKCE HELPERS
// ---------------------------
function generateRandomString(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  return crypto.subtle.digest("SHA-256", encoder.encode(plain));
}

function base64encode(input) {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ---------------------------
// LOGIN
// ---------------------------
document.getElementById("loginBtn").onclick = async () => {
  localStorage.removeItem("code_verifier");

  const verifier = generateRandomString(64);
  const challenge = base64encode(await sha256(verifier));
  localStorage.setItem("code_verifier", verifier);

  const scopes = [
    "streaming",
    "user-read-private",
    "user-read-email",
    "user-read-playback-state",
    "user-modify-playback-state",
    "playlist-read-private",
    "playlist-read-collaborative"
  ];

  const authUrl =
    "https://accounts.spotify.com/authorize" +
    "?client_id=" + clientId +
    "&response_type=code" +
    "&redirect_uri=" + encodeURIComponent(redirectUri) +
    "&scope=" + encodeURIComponent(scopes.join(" ")) +
    "&code_challenge_method=S256" +
    "&code_challenge=" + challenge;

  window.location.href = authUrl;
};

// ---------------------------
// TOKEN EXCHANGE
// ---------------------------
async function exchangeToken() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (!code) return;

  const verifier = localStorage.getItem("code_verifier");
  if (!verifier) return;

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const data = await res.json();
  if (data.error) {
    console.error("Token error", data);
    return;
  }

  accessToken = data.access_token;

  // Clean URL (important!)
  window.history.replaceState({}, document.title, redirectUri);

  document.getElementById("status").textContent = "Connected to Spotify ✅";
}

// ---------------------------
// USER PROFILE
// ---------------------------
async function fetchUserProfile() {
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return res.json();
}

// ---------------------------
// PLAYBACK
// ---------------------------
async function playTrack(uri) {
  if (!deviceId || !accessToken) return;

  await fetch(
    `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ uris: [uri] })
    }
  );
}

// ---------------------------
// QUIZ STATE
// ---------------------------
let currentPlaylistTracks = [];
let currentTrackIndex = 0;
let score = 0;

// ---------------------------
// INIT (SINGLE ENTRY POINT)
// ---------------------------
async function initApp() {
  await exchangeToken();
  if (!accessToken) return;

  const user = await fetchUserProfile();

  if (user.product !== "premium") {
    document.getElementById("status").textContent =
      "Spotify Premium required ❌";
    return;
  }

  document.getElementById("status").textContent =
    "Premium account connected 🎧";
}

initApp();
