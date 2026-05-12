interface GithubRepo {
  name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
}

interface GithubUser {
  login: string;
  name: string | null;
  bio: string | null;
  public_repos: number;
  followers: number;
}

export async function fetchGithubProfile(username: string): Promise<string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "ai-skill-passport",
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  };

  // Fetch user profile
  // Profile call is a hard gate: no repo call if username itself is invalid/rate-limited.
  const userRes = await fetch(`https://api.github.com/users/${username}`, {
    headers,
    signal: AbortSignal.timeout(10000),
  });

  if (userRes.status === 404) {
    const err = new Error("GitHub user not found.") as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }
  if (userRes.status === 429 || userRes.status === 403) {
    const err = new Error("GitHub API rate limit reached. Please try again later.") as Error & { statusCode: number };
    err.statusCode = 503;
    throw err;
  }
  if (!userRes.ok) {
    const err = new Error(`GitHub API error: ${userRes.status}`) as Error & { statusCode: number };
    err.statusCode = 502;
    throw err;
  }

  const user = (await userRes.json()) as GithubUser;

  // Fetch repos (max 30, sorted by most recently updated)
  // Recency sort improves signal for active skills over stale historical repos.
  const reposRes = await fetch(
    `https://api.github.com/users/${username}/repos?per_page=30&sort=updated`,
    { headers, signal: AbortSignal.timeout(10000) }
  );

  if (!reposRes.ok) {
    const err = new Error("Failed to fetch GitHub repositories.") as Error & { statusCode: number };
    err.statusCode = 502;
    throw err;
  }

  const repos = (await reposRes.json()) as GithubRepo[];

  // Collect unique languages
  const languages = [...new Set(repos.map((r) => r.language).filter(Boolean))];

  // Build consolidated text summary for AI
  // We build a compact, deterministic plain-text representation to minimize prompt variance.
  const lines = [
    `GitHub username: ${user.login}`,
    user.name ? `Name: ${user.name}` : "",
    user.bio ? `Bio: ${user.bio}` : "",
    `Public repos: ${user.public_repos}, Followers: ${user.followers}`,
    `Languages used: ${languages.join(", ")}`,
    "",
    "Top repositories:",
    ...repos.slice(0, 30).map(
      (r) =>
        `- ${r.name}${r.language ? ` [${r.language}]` : ""}${r.description ? `: ${r.description}` : ""}${r.stargazers_count > 0 ? ` (${r.stargazers_count} stars)` : ""}`
    ),
  ];

  return lines.filter((l) => l !== "").join("\n");
}
