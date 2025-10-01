import type { NextApiRequest, NextApiResponse } from "next"
import { db } from "~/lib/db"

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const { domainId } = req.query as { domainId: string }

  try {
    const artifacts = await db.artifact.getLatestArtifactsForDomain(domainId)
    return res.status(200).json(artifacts)
  } catch (error) {
    console.error(`Failed to fetch artifacts for domain ${domainId}:`, error)
    return res.status(500).json({ error: "Failed to fetch artifacts" })
  }
}
