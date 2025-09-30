/**
 * Mock data factory for generating realistic test data
 */

/**
 * Generate mock page content based on page type
 */
export function generateMockPageContent(
  url: string,
  pageType: "homepage" | "documentation" | "blog" | "product",
  domain: string,
): {
  markdown: string
  html: string
  title: string
  description: string
} {
  switch (pageType) {
    case "homepage":
      return generateHomepageContent(domain)
    case "documentation":
      return generateDocumentationContent(url, domain)
    case "blog":
      return generateBlogContent(url, domain)
    case "product":
      return generateProductContent(url, domain)
    default:
      return generateGenericContent(url, domain)
  }
}

/**
 * Generate homepage content
 */
function generateHomepageContent(domain: string): {
  markdown: string
  html: string
  title: string
  description: string
} {
  const title = `Welcome to ${domain}`
  const description = `Discover the power of ${domain} - Your trusted platform for innovation and growth`

  const markdown = `# ${title}

${description}

## Why Choose ${domain}?

We provide cutting-edge solutions that help businesses thrive in the digital age. Our platform combines powerful features with an intuitive interface, making it easy for teams of all sizes to achieve their goals.

### Key Features

- **Scalable Infrastructure**: Built to grow with your business
- **Advanced Analytics**: Gain insights with real-time data
- **Secure by Design**: Enterprise-grade security at every level
- **24/7 Support**: Our team is always here to help

## Getting Started is Easy

1. **Sign Up**: Create your free account in minutes
2. **Configure**: Set up your workspace with our guided setup
3. **Launch**: Start using our powerful features immediately

### Trusted by Industry Leaders

Over 10,000 companies worldwide trust ${domain} to power their operations. From startups to Fortune 500 companies, we help organizations of all sizes succeed.

## Ready to Transform Your Business?

[Get Started Free](https://${domain}/signup) | [Request a Demo](https://${domain}/demo) | [View Pricing](https://${domain}/pricing)

---

© ${new Date().getFullYear()} ${domain}. All rights reserved.`

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <meta name="description" content="${description}">
</head>
<body>
  <h1>${title}</h1>
  <p>${description}</p>
  <!-- Additional HTML content would be here -->
</body>
</html>`

  return { markdown, html, title, description }
}

/**
 * Generate documentation content
 */
function generateDocumentationContent(
  url: string,
  domain: string,
): {
  markdown: string
  html: string
  title: string
  description: string
} {
  const path = new URL(url).pathname
  const docName = path.split("/").pop() || "overview"
  const title = `${formatTitle(docName)} - ${domain} Documentation`
  const description = `Learn about ${docName} in the ${domain} documentation`

  const markdown = `# ${formatTitle(docName)}

${description}

## Overview

This section covers everything you need to know about ${docName}. Whether you're just getting started or looking for advanced features, you'll find comprehensive information here.

## Prerequisites

Before you begin, ensure you have:
- An active ${domain} account
- Basic understanding of the platform
- Required permissions for this feature

## Installation

\`\`\`bash
npm install @${domain}/sdk
# or
yarn add @${domain}/sdk
\`\`\`

## Basic Usage

Here's a simple example to get you started:

\`\`\`javascript
import { Client } from '@${domain}/sdk';

const client = new Client({
  apiKey: process.env.API_KEY,
  environment: 'production'
});

// Initialize the client
await client.initialize();

// Perform operations
const result = await client.${docName}({
  // Configuration options
});

console.log(result);
\`\`\`

## Configuration Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| apiKey | string | Yes | Your API key |
| environment | string | No | Target environment |
| timeout | number | No | Request timeout in ms |
| retries | number | No | Number of retry attempts |

## Advanced Features

### Custom Configurations

You can customize the behavior by providing additional options:

\`\`\`javascript
const config = {
  advanced: true,
  optimization: 'aggressive',
  caching: {
    enabled: true,
    ttl: 3600
  }
};
\`\`\`

### Error Handling

Always implement proper error handling:

\`\`\`javascript
try {
  const result = await client.operation();
} catch (error) {
  console.error('Operation failed:', error);
  // Handle error appropriately
}
\`\`\`

## Best Practices

1. **Always validate input data** before sending requests
2. **Implement retry logic** for transient failures
3. **Monitor performance** using our built-in metrics
4. **Keep your SDK updated** to the latest version

## Troubleshooting

### Common Issues

**Authentication Errors**
- Verify your API key is correct
- Check key permissions
- Ensure the key hasn't expired

**Rate Limiting**
- Implement exponential backoff
- Use batch operations when possible
- Consider upgrading your plan

## Related Resources

- [API Reference](https://${domain}/docs/api)
- [SDK Examples](https://${domain}/docs/examples)
- [Video Tutorials](https://${domain}/docs/videos)

---

Last updated: ${new Date().toLocaleDateString()}`

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <meta name="description" content="${description}">
</head>
<body>
  <article>
    <h1>${formatTitle(docName)}</h1>
    <!-- Converted markdown content would be here -->
  </article>
</body>
</html>`

  return { markdown, html, title, description }
}

/**
 * Generate blog content
 */
function generateBlogContent(
  url: string,
  domain: string,
): {
  markdown: string
  html: string
  title: string
  description: string
} {
  const blogTitles = [
    "Announcing Our Latest Features",
    "How We Improved Performance by 10x",
    "Best Practices for Modern Development",
    "The Future of Technology",
    "Lessons Learned Building at Scale",
  ]

  const title =
    blogTitles[Math.floor(Math.random() * blogTitles.length)] ?? "Blog Post"
  const description = `Read about ${title.toLowerCase()} on the ${domain} blog`
  const author = "Engineering Team"
  const date = new Date(
    Date.now() - Math.random() * 90 * 86400000,
  ).toLocaleDateString()

  const markdown = `# ${title}

*By ${author} • ${date} • 5 min read*

${description}

## Introduction

We're excited to share some important updates with our community. Over the past few months, our team has been working hard to deliver improvements that matter most to our users.

## The Journey

When we started this project, we had three main goals:

1. **Improve Performance**: Make everything faster
2. **Enhance User Experience**: Simplify complex workflows
3. **Increase Reliability**: Reduce errors and downtime

### Performance Improvements

We've completely rewritten our core engine to be more efficient:

\`\`\`
Before: 500ms average response time
After:  50ms average response time
Improvement: 10x faster!
\`\`\`

This was achieved through:
- Better caching strategies
- Optimized database queries
- Streamlined data processing

### User Experience Enhancements

Based on your feedback, we've redesigned key features:

- **Simplified Dashboard**: Now 40% fewer clicks to complete common tasks
- **Smart Defaults**: The system learns from your usage patterns
- **Better Mobile Support**: Fully responsive design across all devices

## Technical Deep Dive

For those interested in the technical details, here's how we achieved these improvements:

### Architecture Changes

We migrated from a monolithic architecture to a microservices approach:

\`\`\`yaml
services:
  api:
    replicas: 5
    resources:
      cpu: 2
      memory: 4Gi

  worker:
    replicas: 10
    resources:
      cpu: 1
      memory: 2Gi
\`\`\`

### Database Optimizations

- Added strategic indexes
- Implemented query result caching
- Moved to read replicas for analytics

## What's Next?

We're not stopping here. Our roadmap includes:

- **AI-Powered Features**: Coming Q2 2024
- **Enhanced Security**: New authentication options
- **Global Expansion**: More regions for lower latency

## Get Involved

We love hearing from our users! Here's how you can participate:

- [Join our Community Forum](https://${domain}/community)
- [Contribute on GitHub](https://github.com/${domain})
- [Share Feedback](https://${domain}/feedback)

## Conclusion

These improvements are just the beginning. We're committed to continuously improving ${domain} based on your needs and feedback. Thank you for being part of our journey!

---

**Tags:** #product-updates #performance #engineering #announcement`

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <meta name="description" content="${description}">
</head>
<body>
  <article>
    <h1>${title}</h1>
    <div class="meta">By ${author} • ${date}</div>
    <!-- Blog content would be here -->
  </article>
</body>
</html>`

  return { markdown, html, title, description }
}

/**
 * Generate product page content
 */
function generateProductContent(
  url: string,
  domain: string,
): {
  markdown: string
  html: string
  title: string
  description: string
} {
  const path = new URL(url).pathname
  const pageName = path.split("/").pop() || "features"
  const title = `${formatTitle(pageName)} - ${domain}`
  const description = `Explore ${pageName} at ${domain}`

  const markdown = `# ${formatTitle(pageName)}

${description}

## Overview

Discover how ${domain} can transform your business with our comprehensive ${pageName}.

## Key Benefits

- ✅ **Increased Productivity**: Save hours every week
- ✅ **Better Collaboration**: Work seamlessly with your team
- ✅ **Cost Effective**: Reduce operational expenses
- ✅ **Scalable Solution**: Grows with your business

## How It Works

1. **Connect**: Integrate with your existing tools
2. **Configure**: Customize to match your workflow
3. **Collaborate**: Work together in real-time
4. **Analyze**: Track performance and optimize

## Customer Success Stories

> "${domain} has transformed how we work. We've seen a 40% increase in productivity."
> — Sarah Johnson, CTO at TechCorp

> "The best investment we've made for our team. Highly recommended!"
> — Michael Chen, Founder at StartupXYZ

## Pricing Plans

| Plan | Price | Features |
|------|-------|----------|
| Starter | $29/mo | Essential features for small teams |
| Professional | $99/mo | Advanced features + priority support |
| Enterprise | Custom | Unlimited everything + dedicated support |

## Frequently Asked Questions

### Is there a free trial?
Yes! We offer a 14-day free trial with full access to all features.

### Can I change plans anytime?
Absolutely. Upgrade or downgrade your plan at any time.

### Do you offer discounts?
Yes, we offer discounts for annual billing and non-profits.

## Ready to Get Started?

[Start Free Trial](https://${domain}/trial) | [Schedule Demo](https://${domain}/demo) | [Contact Sales](https://${domain}/contact)

---

Questions? Contact us at support@${domain}`

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <meta name="description" content="${description}">
</head>
<body>
  <main>
    <h1>${formatTitle(pageName)}</h1>
    <!-- Product content would be here -->
  </main>
</body>
</html>`

  return { markdown, html, title, description }
}

/**
 * Generate generic content fallback
 */
function generateGenericContent(
  url: string,
  domain: string,
): {
  markdown: string
  html: string
  title: string
  description: string
} {
  const title = `Page - ${domain}`
  const description = `Content from ${domain}`

  const markdown = `# ${title}

${description}

This is a mock page generated for testing purposes.

## Content

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

---

© ${new Date().getFullYear()} ${domain}`

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
</head>
<body>
  <h1>${title}</h1>
  <p>${description}</p>
</body>
</html>`

  return { markdown, html, title, description }
}

/**
 * Helper function to format titles
 */
function formatTitle(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

/**
 * Generate a mock domain object for testing
 */
export function generateMockDomain(overrides?: Record<string, unknown>) {
  return {
    id: `domain_${Math.random().toString(36).slice(2)}`,
    domain: "example.com",
    check_interval_minutes: 1440,
    openrouter_model: "openai/gpt-4o-mini",
    firecrawl_llms_txt_url: null,
    prompt_profile_id: null,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }
}

/**
 * Generate a mock job object for testing
 */
export function generateMockJob(
  domainId: string,
  overrides?: Record<string, unknown>,
) {
  return {
    id: `job_${Math.random().toString(36).slice(2)}`,
    domain_id: domainId,
    type: "initial" as const,
    status: "processing" as const,
    firecrawl_job_id: `fc_${Math.random().toString(36).slice(2)}`,
    started_at: new Date(),
    finished_at: null,
    stats: {},
    ...overrides,
  }
}

/**
 * Generate a mock page version for testing
 */
export function generateMockPageVersion(
  pageId: string,
  jobId: string,
  overrides?: Record<string, unknown>,
) {
  const fingerprint = `fp_${Math.random().toString(36).slice(2)}`
  return {
    id: `version_${Math.random().toString(36).slice(2)}`,
    page_id: pageId,
    job_id: jobId,
    url: `https://example.com/page-${Math.random().toString(36).slice(2)}`,
    raw_md_blob_url: `https://storage.example.com/raw/${fingerprint}.md`,
    html_md_blob_url: `https://storage.example.com/html/${fingerprint}.html`,
    content_fingerprint: fingerprint,
    prev_fingerprint: null,
    similarity_score: null,
    changed_enough: true,
    reason: "Initial version",
    created_at: new Date(),
    ...overrides,
  }
}
