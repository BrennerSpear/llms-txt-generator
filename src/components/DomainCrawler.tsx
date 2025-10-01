import type React from "react"
import { useState } from "react"

interface CrawlConfig {
  checkIntervalMinutes: number
  openrouterModel: string
  maxPages: number
  promptProfileId?: string
}

export function DomainCrawler() {
  const [url, setUrl] = useState("")
  const [config, setConfig] = useState<CrawlConfig>({
    checkIntervalMinutes: 1440,
    openrouterModel: "openai/gpt-4o-mini",
    maxPages: 10,
    promptProfileId: undefined,
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
          promptProfileId: config.promptProfileId || undefined,
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
          promptProfileId: undefined,
        })
      }
    } catch (err) {
      setError("Network error. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-md">
      <h2 className="mb-6 font-bold text-2xl">Domain Crawler</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
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
            htmlFor="openrouterModel"
            className="mb-1 block font-medium text-gray-700 text-sm"
          >
            OpenRouter Model
          </label>
          <input
            type="text"
            id="openrouterModel"
            value={config.openrouterModel}
            onChange={(e) =>
              setConfig({ ...config, openrouterModel: e.target.value })
            }
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
            htmlFor="promptProfileId"
            className="mb-1 block font-medium text-gray-700 text-sm"
          >
            Prompt Profile ID (optional)
          </label>
          <input
            type="text"
            id="promptProfileId"
            value={config.promptProfileId || ""}
            onChange={(e) =>
              setConfig({
                ...config,
                promptProfileId: e.target.value || undefined,
              })
            }
            placeholder="Select a prompt profile"
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <p className="mt-1 text-gray-500 text-xs">
            Leave empty to use default prompt
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {success && (
          <div className="rounded-md border border-green-200 bg-green-50 p-3">
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
          className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {isLoading ? "Initiating Crawl..." : "Start Crawl"}
        </button>
      </form>
    </div>
  )
}
