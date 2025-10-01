import type { NextApiRequest, NextApiResponse } from "next"
import { db } from "~/lib/db"

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    const domains = await db.domain.getAllWithStats()
    return res.status(200).json(domains)
  } catch (error) {
    console.error("Failed to fetch domains:", error)
    return res.status(500).json({ error: "Failed to fetch domains" })
  }
}
