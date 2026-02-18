// ---------------------------
// CONFIG
// ---------------------------
const clientId = "PASTE_YOUR_CLIENT_ID_HERE";
const redirectUri = window.location.origin + window.location.pathname;

let accessToken = null;

// ---------------------------
// PKCE helpers
// ---------------------------
function generateRandomString(length) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest("SHA-256", data);
}

function base64encode(input) {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ---------------------------
// LOGIN BUTTON
// ---------------------------
document.getElementById("loginBtn").onclick = async () => {
  const codeVerifier = generateRandomString(64);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64encode(hashed);

  localStorage.setItem("code_verifier", codeVerifier);

  const scopes = [
    "user-read-private",
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
    "&code_challenge=" + codeChallenge;

  window.location.href = authUrl;
};

// ---------------------------
// EXCHANGE TOKEN
// ---------------------------
async function exchangeToken() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (!code) return;

  const verifier = localStorage.getItem("code_verifier");

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const data = await response.json();
  accessToken = data.access_token;

  document.getElementById("status").textContent = "Connected to Spotify ✅";

  // After login, initialize playlist dropdown
  await initPlaylists();
}

// ---------------------------
// FETCH PLAYLISTS
// ---------------------------
async function initPlaylists() {
  const select = document.getElementById("playlistSelect");
  const status = document.getElementById("playlistStatus");

  select.disabled = true;
  status.textContent = "Loading playlists...";

  let playlists = [];
  let url = "https://api.spotify.com/v1/me/playlists?limit=50";

  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await response.json();
    playlists.push(...data.items);
    url = data.next;
  }

  // Sort alphabetically
  playlists.sort((a, b) => a.name.localeCompare(b.name));

  // Populate dropdown
  select.innerHTML = '<option value="">Select a playlist</option>';
  playlists.forEach(p => {
    const option = document.createElement("option");
    option.value = p.id;
    option.textContent = `${p.na
