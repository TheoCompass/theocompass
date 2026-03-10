export interface Env {
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Set up CORS headers so your Next.js frontend can fetch this data
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Content-Type": "application/json",
    };

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // -----------------------------------------------------------------
      // ENDPOINT 1: Scattermap Coordinates
      // Replaces: denomination_mode_summary.csv
      // -----------------------------------------------------------------
      if (url.pathname === "/api/coordinates") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM denomination_compass_coordinates"
        ).all();
        
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }

      // -----------------------------------------------------------------
      // ENDPOINT 2: Question Catalogue
      // Replaces: data.js (Questions array)
      // -----------------------------------------------------------------
      if (url.pathname === "/api/questions") {
        // We fetch all questions ordered by their ID
        const { results } = await env.DB.prepare(
          "SELECT * FROM questions ORDER BY question_id ASC"
        ).all();
        
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }

      // -----------------------------------------------------------------
      // ENDPOINT 3: Pairwise Alignment Matrix
      // Replaces: pairwise_alignment.json
      // -----------------------------------------------------------------
      if (url.pathname === "/api/alignment") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM pairwise_alignments"
        ).all();
        
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }

      // -----------------------------------------------------------------
      // DEFAULT: Health Check
      // -----------------------------------------------------------------
      return new Response(
        JSON.stringify({ status: "TheoCompass API Active", version: "2.0" }),
        { headers: corsHeaders, status: 200 }
      );

    } catch (error: any) {
      return new Response(
        JSON.stringify({ error: "Database query failed", details: error.message }),
        { headers: corsHeaders, status: 500 }
      );
    }
  },
};
