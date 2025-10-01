import type React from "react"
import { useState } from "react"

interface CrawlConfig {
  checkIntervalMinutes: number
  openrouterModel: string
  maxPages: number
}

export function DomainCrawler() {
  const [url, setUrl] = useState("")
  const [config, setConfig] = useState<CrawlConfig>({
    checkIntervalMinutes: 1440,
    openrouterModel: "openai/gpt-4o-mini",
    maxPages: 10,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ jobId?: string } | null>(null)

  const normalizeDomain = (inputUrl: string): string => {
    let normalized = inputUrl.trim().toLowerCase()
    if (
      !normalized.startsWith("http://") &&
      !normalized.startsWith("https://")
    ) {
      normalized = `https://${normalized}`
    }
    try {
      const urlObj = new URL(normalized)
      return urlObj.hostname
    } catch {
      return normalized
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!url.trim()) {
      setError("Please enter a URL")
      return
    }

    setIsLoading(true)

    try {
      const normalizedDomain = normalizeDomain(url)

      const response = await fetch("/api/domains/crawl", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: url.trim(),
          checkIntervalMinutes: config.checkIntervalMinutes,
          openrouterModel: config.openrouterModel,
          maxPages: config.maxPages,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 409) {
          setError("A crawl job is already active for this domain")
        } else {
          console.error("API error response:", data)
          setError(data.error || data.message || "Failed to initiate crawl")
        }
      } else {
        setSuccess({ jobId: data.jobId })
        setUrl("")
        setConfig({
          checkIntervalMinutes: 1440,
          openrouterModel: "openai/gpt-4o-mini",
          maxPages: 10,
        })
      }
    } catch (err) {
      setError("Network error. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <label
            htmlFor="url"
            className="mb-1 block font-medium text-gray-700 text-sm"
          >
            URL
          </label>
          <input
            type="text"
            id="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="tryprofound.com"
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <p className="mt-1 text-gray-500 text-xs">
            Domain will be automatically normalized
          </p>
        </div>

        <div>
          <label
            htmlFor="checkInterval"
            className="mb-1 block font-medium text-gray-700 text-sm"
          >
            Check Interval (minutes)
          </label>
          <input
            type="number"
            id="checkInterval"
            value={config.checkIntervalMinutes}
            onChange={(e) =>
              setConfig({
                ...config,
                checkIntervalMinutes: Number.parseInt(e.target.value) || 1440,
              })
            }
            min={1}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
        </div>

        <div>
          <label
            htmlFor="maxPages"
            className="mb-1 block font-medium text-gray-700 text-sm"
          >
            Max Pages
          </label>
          <input
            type="number"
            id="maxPages"
            value={config.maxPages}
            onChange={(e) =>
              setConfig({
                ...config,
                maxPages: Number.parseInt(e.target.value) || 10,
              })
            }
            min={1}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
        </div>

        <div>
          <label
            htmlFor="openrouterModel"
            className="mb-1 block font-medium text-gray-700 text-sm"
          >
            OpenRouter Model
          </label>
          <input
            type="text"
            id="openrouterModel"
            value={config.openrouterModel}
            readOnly
            className="w-full cursor-not-allowed rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-gray-500"
            disabled={true}
          />
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-3">
          <p className="text-green-600 text-sm">
            Crawl initiated successfully!
            {success.jobId && (
              <>
                {" "}
                Job ID:{" "}
                <a
                  href={`/jobs/${success.jobId}`}
                  className="font-medium underline"
                >
                  {success.jobId}
                </a>
              </>
            )}
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="mt-4 rounded-md bg-blue-600 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
      >
        {isLoading ? "Adding Domain..." : "Add Domain"}
      </button>
    </form>
  )
}
