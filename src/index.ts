export interface Env {
  DB: D1Database;
  AUTHORIZATION_KEY: string;
}

interface PlayerData {
  data: Record<string, unknown>;
}

async function AddUser(env: Env, userId: string, gameName: string, data: PlayerData): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO "${gameName}" (userId, data) 
     VALUES (?, ?) 
     ON CONFLICT(userId) 
     DO UPDATE SET data = excluded.data`
  ).bind(userId, JSON.stringify(data)).run();
}

async function HandlePostRequest(request: Request, env: Env, userId: string, gameName: string): Promise<Response> {
  try {
    const data = JSON.parse(await request.text());
    if (typeof data !== "object") return new Response(JSON.stringify({ message: "Invalid body format" }), { status: 400 });

    await AddUser(env, userId, gameName, data);
    return new Response(JSON.stringify({ message: "Data saved" }), { status: 200 });
  } catch (error) {
    console.error("Error saving data:", error);
    return new Response(JSON.stringify({ message: "Invalid JSON or internal error" }), { status: 400 });
  }
}

async function GetUser(env: Env, userId: string, gameName: string): Promise<PlayerData | null> {
  try {
    const result = await env.DB.prepare(
      `SELECT data FROM "${gameName}" WHERE userId = ?`
    ).bind(userId).first<{ data: string }>();

    return result?.data ? JSON.parse(result.data) : null;
  } catch (error) {
    console.error("Error retrieving user data:", error);
    return null;
  }
}

async function HandleGetRequest(env: Env, userId: string, gameName: string): Promise<Response> {
  try {
    const userData = await GetUser(env, userId, gameName);
    if (!userData) return new Response(JSON.stringify({ message: "User not found" }), { status: 404 });

    return new Response(JSON.stringify(userData), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error fetching data:", error);
    return new Response(JSON.stringify({ message: "Error fetching data" }), { status: 500 });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname, searchParams } = new URL(request.url);

    const providedKey = request.headers.get("Authorization")
    if (providedKey !== env.AUTHORIZATION_KEY) return new Response(JSON.stringify({ message: "Authorization" }), { status: 400 });

    const gameName = searchParams.get("gameName");
    if (!gameName || typeof gameName !== "string") return new Response(JSON.stringify({ message: "Missing game name" }), { status: 400 });

    const userId = searchParams.get("userId");
    if (!userId || typeof userId !== "string") return new Response(JSON.stringify({ message: "Missing user id" }), { status: 400 });

    await env.DB.exec(`CREATE TABLE IF NOT EXISTS "${gameName}" (userId TEXT PRIMARY KEY, data TEXT);`);

    switch (request.method) {
      case "POST":
        if (pathname === "/add") {
          return HandlePostRequest(request, env, userId, gameName);
        }
        break;

      case "GET":
        if (pathname === "/get") {
          return HandleGetRequest(env, userId, gameName);
        }
        break;
    }

    return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
  },
} satisfies ExportedHandler<Env>;