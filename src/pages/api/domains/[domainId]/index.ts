import type { NextApiRequest, NextApiResponse } from "next"
import { db } from "~/lib/db"

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { domainId } = req.query as { domainId: string }

  if (req.method === "GET") {
    try {
      const domain = await db.domain.getWithPages(domainId)

      if (!domain) {
        return res.status(404).json({ error: "Domain not found" })
      }

      return res.status(200).json(domain)
    } catch (error) {
      console.error(`Failed to fetch domain ${domainId}:`, error)
      return res.status(500).json({ error: "Failed to fetch domain" })
    }
  } else {
    return res.status(405).json({ error: "Method not allowed" })
  }
}
