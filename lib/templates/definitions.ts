import type { WorkflowTemplate } from "@/lib/templates/types";

export const TEMPLATES: WorkflowTemplate[] = [
  {
    id: "blog-post-pipeline",
    name: "Blog Post Pipeline",
    description:
      "Research a topic on the web, draft a full blog post, and polish it for publishing — all in one run.",
    category: "Content Creation",
    complexity: "Advanced",
    graph: {
      nodes: [
        {
          id: "blog-post-pipeline-input1",
          type: "inputNode",
          position: { x: 100, y: 200 },
          data: {
            label: "Topic",
            key: "topic",
            defaultValue: "How AI copilots are changing the way small teams ship software",
            placeholder: "e.g. The future of AI in healthcare"
          }
        },
        {
          id: "blog-post-pipeline-lookup",
          type: "lookupNode",
          position: { x: 420, y: 200 },
          data: {
            label: "Research Lookup",
            query: "{{topic}} latest insights 2025",
            maxResults: 5
          }
        },
        {
          id: "blog-post-pipeline-ai1",
          type: "aiNode",
          position: { x: 740, y: 200 },
          data: {
            label: "Draft Generator",
            action: "Generate",
            prompt:
              "Using the research results from the previous Lookup step, write a comprehensive 800-word blog post draft about {{topic}}. Include an engaging introduction, 3 main sections, and a conclusion.",
            outputMode: "text"
          }
        },
        {
          id: "blog-post-pipeline-ai2",
          type: "aiNode",
          position: { x: 1060, y: 200 },
          data: {
            label: "Content Rewriter",
            action: "Rewrite",
            prompt:
              "Rewrite the blog post draft from the previous step to be more engaging and SEO-friendly. Preserve all key information and structure.\n\nOutput only the final blog post text — no preamble or commentary.",
            outputMode: "text"
          }
        },
        {
          id: "blog-post-pipeline-action",
          type: "actionNode",
          position: { x: 1380, y: 200 },
          data: { label: "Save Blog Post", action: "Save Output" }
        }
      ],
      edges: [
        {
          id: "blog-post-pipeline-input1-lookup",
          source: "blog-post-pipeline-input1",
          target: "blog-post-pipeline-lookup"
        },
        {
          id: "blog-post-pipeline-lookup-ai1",
          source: "blog-post-pipeline-lookup",
          target: "blog-post-pipeline-ai1"
        },
        {
          id: "blog-post-pipeline-ai1-ai2",
          source: "blog-post-pipeline-ai1",
          target: "blog-post-pipeline-ai2"
        },
        {
          id: "blog-post-pipeline-ai2-action",
          source: "blog-post-pipeline-ai2",
          target: "blog-post-pipeline-action"
        }
      ]
    }
  },
  {
    id: "linkedin-post-generator",
    name: "LinkedIn Post Generator",
    description:
      "Turn any topic or idea into a scroll-stopping LinkedIn post with a strong hook and engagement-driving close.",
    category: "Content Creation",
    complexity: "Simple",
    graph: {
      nodes: [
        {
          id: "linkedin-post-generator-input1",
          type: "inputNode",
          position: { x: 100, y: 200 },
          data: {
            label: "Topic or Idea",
            key: "topic",
            defaultValue: "Lessons from my first year as a solo founder — what I'd do differently",
            placeholder: "e.g. Lessons from my first year as a founder"
          }
        },
        {
          id: "linkedin-post-generator-ai1",
          type: "aiNode",
          position: { x: 420, y: 200 },
          data: {
            label: "LinkedIn Post Writer",
            action: "Generate",
            prompt:
              "Write a compelling LinkedIn post about: {{topic}}\n\nRequirements:\n- Hook in the first line\n- 3-5 short paragraphs\n- End with a question to drive engagement\n- Use line breaks for readability\n- No hashtags unless naturally relevant\n\nOutput only the finished LinkedIn post text, ready to paste — no preamble, headings, or commentary.",
            outputMode: "text"
          }
        },
        {
          id: "linkedin-post-generator-action",
          type: "actionNode",
          position: { x: 740, y: 200 },
          data: { label: "Save Post", action: "Save Output" }
        }
      ],
      edges: [
        {
          id: "linkedin-post-generator-input1-ai1",
          source: "linkedin-post-generator-input1",
          target: "linkedin-post-generator-ai1"
        },
        {
          id: "linkedin-post-generator-ai1-action",
          source: "linkedin-post-generator-ai1",
          target: "linkedin-post-generator-action"
        }
      ]
    }
  },
  {
    id: "content-repurposer",
    name: "Content Repurposer",
    description:
      "Paste a blog post or article and get a Twitter thread, LinkedIn post, and newsletter section back.",
    category: "Content Creation",
    complexity: "Intermediate",
    graph: {
      nodes: [
        {
          id: "content-repurposer-input1",
          type: "inputNode",
          position: { x: 100, y: 200 },
          data: {
            label: "Original Content",
            key: "originalContent",
            defaultValue:
              "Why Async Communication Is the Real Superpower of Remote Teams\n\nWhen our team went fully remote three years ago, we assumed the hardest part would be missing whiteboard sessions. We were wrong. The hardest part was unlearning the meeting reflex — the habit of booking a call for every decision.\n\nThe turning point came when we adopted a simple rule: every discussion starts as a written document. Proposals, bug reports, even disagreements get written down first. Meetings only happen when a thread has gone back and forth three times without resolution.\n\nThe results surprised us. Decisions got faster, not slower, because the context lived in one place instead of in someone's memory of a call. New hires ramped up in half the time by reading the decision log. And our two engineers in different time zones stopped feeling like second-class citizens — they could weigh in on anything within their own working hours.\n\nAsync isn't free. Writing well takes effort, and some conversations genuinely need a face. But if your remote team feels slow, the fix probably isn't more meetings — it's better writing.",
            placeholder: "Paste your blog post or article..."
          }
        },
        {
          id: "content-repurposer-ai1",
          type: "aiNode",
          position: { x: 420, y: 200 },
          data: {
            label: "Content Condenser",
            action: "Rewrite",
            prompt:
              "Condense the following content into its core ideas and key takeaways, keeping the original voice:\n\n{{originalContent}}",
            outputMode: "text"
          }
        },
        {
          id: "content-repurposer-ai2",
          type: "aiNode",
          position: { x: 740, y: 200 },
          data: {
            label: "Multi-Format Generator",
            action: "Generate",
            prompt:
              "Using the condensed content from the previous step, generate three repurposed formats:\n1. Twitter/X thread (5-7 tweets)\n2. LinkedIn post (3-4 paragraphs)\n3. Email newsletter section (150 words)\n\nOutput only the three formats, each under a simple header — no preamble or commentary.",
            outputMode: "text"
          }
        },
        {
          id: "content-repurposer-action",
          type: "actionNode",
          position: { x: 1060, y: 200 },
          data: { label: "Save Repurposed Content", action: "Save Output" }
        }
      ],
      edges: [
        {
          id: "content-repurposer-input1-ai1",
          source: "content-repurposer-input1",
          target: "content-repurposer-ai1"
        },
        {
          id: "content-repurposer-ai1-ai2",
          source: "content-repurposer-ai1",
          target: "content-repurposer-ai2"
        },
        {
          id: "content-repurposer-ai2-action",
          source: "content-repurposer-ai2",
          target: "content-repurposer-action"
        }
      ]
    }
  },
  {
    id: "daily-social-post-generator",
    name: "Daily Social Post Generator",
    description:
      "Search today's trending topics for your niche and generate a timely social post. Recommended: schedule daily at 8 AM.",
    category: "Content Creation",
    complexity: "Intermediate",
    graph: {
      nodes: [
        {
          id: "daily-social-post-generator-input1",
          type: "inputNode",
          position: { x: 100, y: 200 },
          data: {
            label: "Brand or Niche",
            key: "brand",
            defaultValue: "B2B SaaS startup building AI-powered developer tools",
            placeholder: "e.g. B2B SaaS startup focused on developer tools"
          }
        },
        {
          id: "daily-social-post-generator-lookup",
          type: "lookupNode",
          position: { x: 420, y: 200 },
          data: {
            label: "Trending Topics",
            query: "{{brand}} trending topics today social media",
            maxResults: 5
          }
        },
        {
          id: "daily-social-post-generator-ai1",
          type: "aiNode",
          position: { x: 740, y: 200 },
          data: {
            label: "Social Post Creator",
            action: "Generate",
            prompt:
              "You are a social media manager for: {{brand}}\n\nUsing the trending topics from the previous search step, create one engaging social media post suitable for LinkedIn and Twitter. Make it timely and include a clear call-to-action.\n\nOutput only the post text, ready to paste — no preamble or commentary.",
            outputMode: "text"
          }
        },
        {
          id: "daily-social-post-generator-action",
          type: "actionNode",
          position: { x: 1060, y: 200 },
          data: { label: "Save Post", action: "Save Output" }
        }
      ],
      edges: [
        {
          id: "daily-social-post-generator-input1-lookup",
          source: "daily-social-post-generator-input1",
          target: "daily-social-post-generator-lookup"
        },
        {
          id: "daily-social-post-generator-lookup-ai1",
          source: "daily-social-post-generator-lookup",
          target: "daily-social-post-generator-ai1"
        },
        {
          id: "daily-social-post-generator-ai1-action",
          source: "daily-social-post-generator-ai1",
          target: "daily-social-post-generator-action"
        }
      ]
    }
  },
  {
    id: "seo-keyword-brief",
    name: "SEO Keyword Brief",
    description:
      "Analyze what ranks for your target keyword and generate a complete SEO content brief with outline and semantic keywords.",
    category: "Content Creation",
    complexity: "Advanced",
    graph: {
      nodes: [
        {
          id: "seo-keyword-brief-input1",
          type: "inputNode",
          position: { x: 100, y: 120 },
          data: {
            label: "Target Keyword",
            key: "keyword",
            defaultValue: "best note taking apps",
            placeholder: "e.g. project management software"
          }
        },
        {
          id: "seo-keyword-brief-input2",
          type: "inputNode",
          position: { x: 100, y: 320 },
          data: {
            label: "Target Audience",
            key: "audience",
            defaultValue: "graduate students and academic researchers",
            placeholder: "e.g. small business owners"
          }
        },
        {
          id: "seo-keyword-brief-lookup",
          type: "lookupNode",
          position: { x: 420, y: 200 },
          data: {
            label: "SERP Research",
            query: "{{keyword}} top ranking content SEO analysis",
            maxResults: 8
          }
        },
        {
          id: "seo-keyword-brief-ai1",
          type: "aiNode",
          position: { x: 740, y: 200 },
          data: {
            label: "SEO Brief Generator",
            action: "Generate",
            prompt:
              "Using the SERP research results from the previous step, create a comprehensive SEO content brief for: {{keyword}}\nTarget audience: {{audience}}\n\nInclude: recommended title, meta description, content outline (H1/H2/H3s), key topics to cover, estimated word count, and semantic keywords to include.\n\nOutput only the brief itself — no preamble or commentary.",
            outputMode: "text"
          }
        },
        {
          id: "seo-keyword-brief-action",
          type: "actionNode",
          position: { x: 1060, y: 200 },
          data: { label: "Save SEO Brief", action: "Save Output" }
        }
      ],
      edges: [
        {
          id: "seo-keyword-brief-input1-lookup",
          source: "seo-keyword-brief-input1",
          target: "seo-keyword-brief-lookup"
        },
        {
          id: "seo-keyword-brief-input2-lookup",
          source: "seo-keyword-brief-input2",
          target: "seo-keyword-brief-lookup"
        },
        {
          id: "seo-keyword-brief-lookup-ai1",
          source: "seo-keyword-brief-lookup",
          target: "seo-keyword-brief-ai1"
        },
        {
          id: "seo-keyword-brief-ai1-action",
          source: "seo-keyword-brief-ai1",
          target: "seo-keyword-brief-action"
        }
      ]
    }
  },
  {
    id: "competitor-research-brief",
    name: "Competitor Research Brief",
    description:
      "Search the web for a competitor's features, pricing, and reviews, then synthesize a competitive intelligence brief.",
    category: "Research",
    complexity: "Intermediate",
    graph: {
      nodes: [
        {
          id: "competitor-research-brief-input1",
          type: "inputNode",
          position: { x: 100, y: 200 },
          data: {
            label: "Competitor Name",
            key: "competitor",
            defaultValue: "Notion",
            placeholder: "e.g. Notion"
          }
        },
        {
          id: "competitor-research-brief-lookup",
          type: "lookupNode",
          position: { x: 420, y: 200 },
          data: {
            label: "Competitor Lookup",
            query: "{{competitor}} product features pricing reviews 2025",
            maxResults: 8
          }
        },
        {
          id: "competitor-research-brief-ai1",
          type: "aiNode",
          position: { x: 740, y: 200 },
          data: {
            label: "Research Synthesizer",
            action: "Generate",
            prompt:
              "Using the search results from the previous step, create a competitive intelligence brief for {{competitor}}.\n\nInclude: product overview and positioning, key features and differentiators, pricing model, customer sentiment summary, strengths and weaknesses, and strategic implications.\n\nOutput only the brief itself — no preamble or commentary.",
            outputMode: "text"
          }
        },
        {
          id: "competitor-research-brief-action",
          type: "actionNode",
          position: { x: 1060, y: 200 },
          data: { label: "Save Research Brief", action: "Save Output" }
        }
      ],
      edges: [
        {
          id: "competitor-research-brief-input1-lookup",
          source: "competitor-research-brief-input1",
          target: "competitor-research-brief-lookup"
        },
        {
          id: "competitor-research-brief-lookup-ai1",
          source: "competitor-research-brief-lookup",
          target: "competitor-research-brief-ai1"
        },
        {
          id: "competitor-research-brief-ai1-action",
          source: "competitor-research-brief-ai1",
          target: "competitor-research-brief-action"
        }
      ]
    }
  },
  {
    id: "startup-idea-validator",
    name: "Startup Idea Validator",
    description:
      "Research the market for your idea, classify its viability, and get a full validation report with risks and next steps.",
    category: "Research",
    complexity: "Advanced",
    graph: {
      nodes: [
        {
          id: "startup-idea-validator-input1",
          type: "inputNode",
          position: { x: 100, y: 200 },
          data: {
            label: "Startup Idea",
            key: "idea",
            defaultValue: "An AI assistant that automatically drafts, sends, and chases invoices for freelancers",
            placeholder: "e.g. AI tool that auto-categorizes receipts for freelancers"
          }
        },
        {
          id: "startup-idea-validator-lookup",
          type: "lookupNode",
          position: { x: 420, y: 200 },
          data: {
            label: "Market Research",
            query: "{{idea}} market size competitors existing solutions",
            maxResults: 6
          }
        },
        {
          id: "startup-idea-validator-ai1",
          type: "aiNode",
          position: { x: 740, y: 200 },
          data: {
            label: "Viability Classifier",
            action: "Classify",
            prompt:
              "Using the market research results from the previous step, classify the viability of this startup idea: {{idea}}\n\nClassify as: High Potential / Moderate Potential / Low Potential",
            outputMode: "json"
          }
        },
        {
          id: "startup-idea-validator-ai2",
          type: "aiNode",
          position: { x: 1060, y: 200 },
          data: {
            label: "Validation Report",
            action: "Generate",
            prompt:
              "Using the viability assessment from the previous step, write a startup idea validation report for: {{idea}}\n\nCover: problem/solution fit, market opportunity, competitive landscape, biggest risks, and 3 suggested next steps.\n\nOutput only the report itself — no preamble or commentary.",
            outputMode: "text"
          }
        },
        {
          id: "startup-idea-validator-action",
          type: "actionNode",
          position: { x: 1380, y: 200 },
          data: { label: "Save Report", action: "Save Output" }
        }
      ],
      edges: [
        {
          id: "startup-idea-validator-input1-lookup",
          source: "startup-idea-validator-input1",
          target: "startup-idea-validator-lookup"
        },
        {
          id: "startup-idea-validator-lookup-ai1",
          source: "startup-idea-validator-lookup",
          target: "startup-idea-validator-ai1"
        },
        {
          id: "startup-idea-validator-ai1-ai2",
          source: "startup-idea-validator-ai1",
          target: "startup-idea-validator-ai2"
        },
        {
          id: "startup-idea-validator-ai2-action",
          source: "startup-idea-validator-ai2",
          target: "startup-idea-validator-action"
        }
      ]
    }
  },
  {
    id: "research-paper-summarizer",
    name: "Research Paper Summarizer",
    description:
      "Paste a paper or abstract and get an accessible summary plus five actionable key takeaways.",
    category: "Research",
    complexity: "Intermediate",
    graph: {
      nodes: [
        {
          id: "research-paper-summarizer-input1",
          type: "inputNode",
          position: { x: 100, y: 200 },
          data: {
            label: "Paper Text or Abstract",
            key: "paperText",
            defaultValue:
              "Title: Spaced Repetition and Long-Term Retention of Programming Concepts in Novice Learners\n\nAbstract: We investigate whether spaced repetition scheduling improves long-term retention of programming concepts compared with massed practice. In a 12-week study, 184 novice learners were randomly assigned to either a spaced condition (concept reviews at expanding intervals of 1, 3, 7, and 21 days) or a massed condition (equivalent total review time in consecutive sessions). Retention was measured with code-reading and code-writing assessments at 4 and 12 weeks. The spaced condition scored 23% higher on code-reading and 31% higher on code-writing at 12 weeks, with the largest gains on abstract concepts such as recursion and closures. Effects persisted after controlling for prior exposure and total study time. Self-reported difficulty was higher in the spaced condition during weeks 1-4, consistent with the notion of desirable difficulties. Limitations include a single institutional cohort and reliance on voluntary practice compliance verified by platform telemetry. We conclude that spaced scheduling is a low-cost intervention that substantially improves durable learning of programming fundamentals, and we release our scheduling implementation as open source.",
            placeholder: "Paste the full paper or abstract..."
          }
        },
        {
          id: "research-paper-summarizer-ai1",
          type: "aiNode",
          position: { x: 420, y: 200 },
          data: {
            label: "Paper Summarizer",
            action: "Summarize",
            prompt:
              "Summarize this research paper for a technical but non-specialist audience.\n\nInclude: research question, methodology (brief), key findings, limitations, and practical implications.\n\nPaper:\n{{paperText}}",
            outputMode: "text"
          }
        },
        {
          id: "research-paper-summarizer-ai2",
          type: "aiNode",
          position: { x: 740, y: 200 },
          data: {
            label: "Key Takeaways",
            action: "Generate",
            prompt:
              "From the paper summary in the previous step, extract 5 bullet-point key takeaways that a busy professional would find most actionable.\n\nOutput only the 5 bullet points — no preamble or commentary.",
            outputMode: "text"
          }
        },
        {
          id: "research-paper-summarizer-action",
          type: "actionNode",
          position: { x: 1060, y: 200 },
          data: { label: "Save Summary", action: "Save Output" }
        }
      ],
      edges: [
        {
          id: "research-paper-summarizer-input1-ai1",
          source: "research-paper-summarizer-input1",
          target: "research-paper-summarizer-ai1"
        },
        {
          id: "research-paper-summarizer-ai1-ai2",
          source: "research-paper-summarizer-ai1",
          target: "research-paper-summarizer-ai2"
        },
        {
          id: "research-paper-summarizer-ai2-action",
          source: "research-paper-summarizer-ai2",
          target: "research-paper-summarizer-action"
        }
      ]
    }
  },
  {
    id: "weekly-industry-news-digest",
    name: "Weekly Industry News Digest",
    description:
      "Search this week's news for any industry and get a digest with top stories and trends. Recommended: schedule weekly on Mondays.",
    category: "Research",
    complexity: "Intermediate",
    graph: {
      nodes: [
        {
          id: "weekly-industry-news-digest-input1",
          type: "inputNode",
          position: { x: 100, y: 200 },
          data: {
            label: "Industry or Topic",
            key: "industry",
            defaultValue: "generative AI",
            placeholder: "e.g. generative AI, fintech, climate tech"
          }
        },
        {
          id: "weekly-industry-news-digest-lookup",
          type: "lookupNode",
          position: { x: 420, y: 200 },
          data: {
            label: "News Lookup",
            query: "{{industry}} news this week key developments",
            maxResults: 8
          }
        },
        {
          id: "weekly-industry-news-digest-ai1",
          type: "aiNode",
          position: { x: 740, y: 200 },
          data: {
            label: "Digest Writer",
            action: "Summarize",
            prompt:
              "Using the news search results from the previous step, create a concise weekly industry digest for: {{industry}}\n\nFormat: 3-5 top stories (2-sentence summary each), one 'so what' paragraph on the week's overall theme, and 2 trends to watch.\n\nOutput only the digest itself — no preamble or commentary.",
            outputMode: "text"
          }
        },
        {
          id: "weekly-industry-news-digest-action",
          type: "actionNode",
          position: { x: 1060, y: 200 },
          data: { label: "Save Digest", action: "Save Output" }
        }
      ],
      edges: [
        {
          id: "weekly-industry-news-digest-input1-lookup",
          source: "weekly-industry-news-digest-input1",
          target: "weekly-industry-news-digest-lookup"
        },
        {
          id: "weekly-industry-news-digest-lookup-ai1",
          source: "weekly-industry-news-digest-lookup",
          target: "weekly-industry-news-digest-ai1"
        },
        {
          id: "weekly-industry-news-digest-ai1-action",
          source: "weekly-industry-news-digest-ai1",
          target: "weekly-industry-news-digest-action"
        }
      ]
    }
  },
  {
    id: "lead-research-brief",
    name: "Lead Research Brief",
    description:
      "Research a target company and contact, then generate an outreach-ready sales brief with talking points.",
    category: "Sales / Outbound",
    complexity: "Advanced",
    graph: {
      nodes: [
        {
          id: "lead-research-brief-input1",
          type: "inputNode",
          position: { x: 100, y: 120 },
          data: {
            label: "Company Name",
            key: "companyName",
            defaultValue: "Stripe",
            placeholder: "e.g. Stripe"
          }
        },
        {
          id: "lead-research-brief-input2",
          type: "inputNode",
          position: { x: 100, y: 320 },
          data: {
            label: "Contact Name and Role",
            key: "contactName",
            defaultValue: "Jane Smith, VP Engineering",
            placeholder: "e.g. Jane Smith, VP Engineering"
          }
        },
        {
          id: "lead-research-brief-lookup",
          type: "lookupNode",
          position: { x: 420, y: 200 },
          data: {
            label: "Company Research",
            query: "{{companyName}} company overview funding recent news products",
            maxResults: 6
          }
        },
        {
          id: "lead-research-brief-ai1",
          type: "aiNode",
          position: { x: 740, y: 200 },
          data: {
            label: "Lead Brief Generator",
            action: "Generate",
            prompt:
              "Using the company research from the previous step, create a sales research brief for reaching {{contactName}} at {{companyName}}.\n\nInclude: company overview (2-3 sentences), recent news or milestones, likely pain points, 3 suggested talking points, and the best outreach angle.\n\nOutput only the brief itself — no preamble or commentary.",
            outputMode: "text"
          }
        },
        {
          id: "lead-research-brief-action",
          type: "actionNode",
          position: { x: 1060, y: 200 },
          data: { label: "Save Lead Brief", action: "Save Output" }
        }
      ],
      edges: [
        {
          id: "lead-research-brief-input1-lookup",
          source: "lead-research-brief-input1",
          target: "lead-research-brief-lookup"
        },
        {
          id: "lead-research-brief-input2-lookup",
          source: "lead-research-brief-input2",
          target: "lead-research-brief-lookup"
        },
        {
          id: "lead-research-brief-lookup-ai1",
          source: "lead-research-brief-lookup",
          target: "lead-research-brief-ai1"
        },
        {
          id: "lead-research-brief-ai1-action",
          source: "lead-research-brief-ai1",
          target: "lead-research-brief-action"
        }
      ]
    }
  },
  {
    id: "cold-email-personalizer",
    name: "Cold Email Personalizer",
    description:
      "Research a prospect and generate a personalized cold email draft under 100 words with a compelling subject line.",
    category: "Sales / Outbound",
    complexity: "Advanced",
    graph: {
      nodes: [
        {
          id: "cold-email-personalizer-input1",
          type: "inputNode",
          position: { x: 100, y: 120 },
          data: {
            label: "Prospect Name and Role",
            key: "prospect",
            defaultValue: "Sarah Lee, Head of Marketing at Acme Analytics",
            placeholder: "e.g. Sarah Lee, Head of Marketing at Acme"
          }
        },
        {
          id: "cold-email-personalizer-input2",
          type: "inputNode",
          position: { x: 100, y: 320 },
          data: {
            label: "Your Offer or Product",
            key: "offer",
            defaultValue: "An AI writing assistant that helps marketing teams draft on-brand content in half the time",
            placeholder: "e.g. AI writing assistant for marketing teams"
          }
        },
        {
          id: "cold-email-personalizer-lookup",
          type: "lookupNode",
          position: { x: 420, y: 200 },
          data: {
            label: "Prospect Research",
            query: "{{prospect}} recent activity company news linkedin",
            maxResults: 5
          }
        },
        {
          id: "cold-email-personalizer-ai1",
          type: "aiNode",
          position: { x: 740, y: 200 },
          data: {
            label: "Email Writer",
            action: "Generate",
            prompt:
              "Using the prospect research from the previous step, write a personalized cold email to {{prospect}}.\n\nYour offer: {{offer}}\n\nFormat:\nSubject: [compelling subject line, under 8 words]\n\n[Email body under 100 words. Reference something specific about the prospect. One clear value proposition. Soft CTA — not 'schedule a demo'.]\n\nOutput only the subject line and email body, ready to paste — no preamble or commentary.",
            outputMode: "text"
          }
        },
        {
          id: "cold-email-personalizer-action",
          type: "actionNode",
          position: { x: 1060, y: 200 },
          data: { label: "Save Email Draft", action: "Save Output" }
        }
      ],
      edges: [
        {
          id: "cold-email-personalizer-input1-lookup",
          source: "cold-email-personalizer-input1",
          target: "cold-email-personalizer-lookup"
        },
        {
          id: "cold-email-personalizer-input2-lookup",
          source: "cold-email-personalizer-input2",
          target: "cold-email-personalizer-lookup"
        },
        {
          id: "cold-email-personalizer-lookup-ai1",
          source: "cold-email-personalizer-lookup",
          target: "cold-email-personalizer-ai1"
        },
        {
          id: "cold-email-personalizer-ai1-action",
          source: "cold-email-personalizer-ai1",
          target: "cold-email-personalizer-action"
        }
      ]
    }
  },
  {
    id: "resume-screener",
    name: "Resume Screener",
    description:
      "Score a resume against a job description, then automatically draft an advance email or a kind rejection based on fit.",
    category: "Recruiting",
    complexity: "Advanced",
    graph: {
      nodes: [
        {
          id: "resume-screener-input1",
          type: "inputNode",
          position: { x: 100, y: 120 },
          data: {
            label: "Job Description",
            key: "jobDescription",
            defaultValue:
              "Senior Frontend Engineer — Larkspur Labs (Remote)\n\nWe're looking for a senior frontend engineer to lead development of our analytics dashboard.\n\nRequirements:\n- 5+ years building production web applications\n- Expert-level React and TypeScript\n- Experience with data visualization (D3, Recharts, or similar)\n- Comfortable owning features end to end, from design review to deploy\n- Strong written communication for a remote-first team\n\nNice to have: Next.js, design-system experience, prior startup experience.",
            placeholder: "Paste the full job description..."
          }
        },
        {
          id: "resume-screener-input2",
          type: "inputNode",
          position: { x: 100, y: 320 },
          data: {
            label: "Resume Text",
            key: "resumeText",
            defaultValue:
              "Maya Chen — Senior Frontend Engineer\nmaya.chen@example.com · Remote (PST)\n\nExperience:\n\nNorthbeam Software — Senior Frontend Engineer (2022-present)\n- Led rebuild of the customer analytics dashboard in React + TypeScript, serving 40k daily users\n- Built a charting layer on Recharts with custom D3 interactions; cut render time 60%\n- Owned features end to end: specs, implementation, review, deploy, and on-call\n- Mentored two mid-level engineers; wrote the team's frontend architecture docs\n\nBrightpath (startup, acquired) — Frontend Engineer (2019-2022)\n- Second frontend hire; shipped the design system used across three products\n- Migrated the app from JavaScript to TypeScript with zero downtime\n\nSkills: React, TypeScript, Next.js, D3, Recharts, Tailwind, testing (Vitest, Playwright), remote async collaboration\n\nEducation: BS Computer Science, UC Davis",
            placeholder: "Paste the candidate's resume..."
          }
        },
        {
          id: "resume-screener-ai1",
          type: "aiNode",
          position: { x: 420, y: 200 },
          data: {
            label: "Resume Classifier",
            action: "Classify",
            prompt:
              "Evaluate this resume against the job description.\n\nJob:\n{{jobDescription}}\n\nResume:\n{{resumeText}}\n\nClassify the category as exactly one of: Strong Fit / Possible Fit / Not a Fit",
            outputMode: "json"
          }
        },
        {
          id: "resume-screener-router",
          type: "routerNode",
          position: { x: 740, y: 200 },
          data: {
            label: "Fit Router",
            prompt: "Is the candidate classified as a Strong Fit?",
            conditionField: "category",
            conditionValue: "Strong Fit"
          }
        },
        {
          id: "resume-screener-ai2",
          type: "aiNode",
          position: { x: 1060, y: 100 },
          data: {
            label: "Advance Message",
            action: "Generate",
            prompt:
              "Based on the candidate assessment from the previous step, write a warm professional email to advance this candidate to the next round.\n\nJob description:\n{{jobDescription}}\n\nOutput only the email text, ready to send — no preamble or commentary.",
            outputMode: "text"
          }
        },
        {
          id: "resume-screener-ai3",
          type: "aiNode",
          position: { x: 1060, y: 340 },
          data: {
            label: "Rejection Message",
            action: "Generate",
            prompt:
              "Based on the candidate assessment from the previous step, write a kind professional rejection email.\n\nJob description:\n{{jobDescription}}\n\nOutput only the email text, ready to send — no preamble or commentary.",
            outputMode: "text"
          }
        },
        {
          id: "resume-screener-action1",
          type: "actionNode",
          position: { x: 1380, y: 100 },
          data: { label: "Save Advance Email", action: "Save Output" }
        },
        {
          id: "resume-screener-action2",
          type: "actionNode",
          position: { x: 1380, y: 340 },
          data: { label: "Save Rejection Email", action: "Save Output" }
        }
      ],
      edges: [
        {
          id: "resume-screener-input1-ai1",
          source: "resume-screener-input1",
          target: "resume-screener-ai1"
        },
        {
          id: "resume-screener-input2-ai1",
          source: "resume-screener-input2",
          target: "resume-screener-ai1"
        },
        {
          id: "resume-screener-ai1-router",
          source: "resume-screener-ai1",
          target: "resume-screener-router"
        },
        {
          id: "resume-screener-router-ai2",
          source: "resume-screener-router",
          target: "resume-screener-ai2",
          sourceHandle: "true"
        },
        {
          id: "resume-screener-router-ai3",
          source: "resume-screener-router",
          target: "resume-screener-ai3",
          sourceHandle: "false"
        },
        {
          id: "resume-screener-ai2-action1",
          source: "resume-screener-ai2",
          target: "resume-screener-action1"
        },
        {
          id: "resume-screener-ai3-action2",
          source: "resume-screener-ai3",
          target: "resume-screener-action2"
        }
      ]
    }
  },
  {
    id: "client-discovery-summary",
    name: "Client Discovery Summary",
    description:
      "Turn raw discovery call notes into a structured, shareable client summary with pain points, goals, and next steps.",
    category: "Client Work",
    complexity: "Advanced",
    graph: {
      nodes: [
        {
          id: "client-discovery-summary-input1",
          type: "inputNode",
          position: { x: 100, y: 120 },
          data: {
            label: "Client Name and Company",
            key: "client",
            defaultValue: "John Doe, CEO at BuildRight Construction",
            placeholder: "e.g. John Doe, CEO at BuildRight"
          }
        },
        {
          id: "client-discovery-summary-input2",
          type: "inputNode",
          position: { x: 100, y: 320 },
          data: {
            label: "Discovery Call Notes",
            key: "callNotes",
            defaultValue:
              "Call w/ John, 45 min. BuildRight = mid-size commercial construction, ~120 employees, 3 offices.\n\nPain: project managers drowning in paperwork — change orders tracked in spreadsheets + email, things slip. Two missed change orders last quarter cost them ~$40k. Current tools: Excel, Outlook, an old on-prem project tool nobody likes.\n\nWants: single place to track change orders + approvals, mobile access for site supervisors, audit trail for disputes. Mentioned twice that adoption is his biggest fear — 'my supers won't use anything complicated.'\n\nBudget: said 'somewhere in the 30-50k range for year one' if it demonstrably saves PM time. Decision w/ him + COO (Maria). Wants to move before their busy season starts in September.\n\nNext: send proposal by Friday, include a 2-week pilot option with one project team. Intro call w/ Maria next week. Open question: integration with their accounting system (Sage) — need to check.",
            placeholder: "Paste your raw call notes..."
          }
        },
        {
          id: "client-discovery-summary-ai1",
          type: "aiNode",
          position: { x: 420, y: 200 },
          data: {
            label: "Detail Extractor",
            action: "Extract",
            prompt:
              "Extract key details from these discovery call notes for {{client}}:\n\n{{callNotes}}",
            outputMode: "json",
            outputFields: ["painPoints", "goals", "budget", "timeline", "nextSteps"]
          }
        },
        {
          id: "client-discovery-summary-ai2",
          type: "aiNode",
          position: { x: 740, y: 200 },
          data: {
            label: "Discovery Summary",
            action: "Generate",
            prompt:
              "Using the extracted details from the previous step, write a professional client discovery summary for {{client}}.\n\nRaw notes for reference:\n{{callNotes}}\n\nSections: Overview, Key Pain Points, Goals, Budget & Timeline, Agreed Next Steps, Open Questions.\n\nOutput only the summary document — no preamble or commentary.",
            outputMode: "text"
          }
        },
        {
          id: "client-discovery-summary-action",
          type: "actionNode",
          position: { x: 1060, y: 200 },
          data: { label: "Save Discovery Summary", action: "Save Output" }
        }
      ],
      edges: [
        {
          id: "client-discovery-summary-input1-ai1",
          source: "client-discovery-summary-input1",
          target: "client-discovery-summary-ai1"
        },
        {
          id: "client-discovery-summary-input2-ai1",
          source: "client-discovery-summary-input2",
          target: "client-discovery-summary-ai1"
        },
        {
          id: "client-discovery-summary-ai1-ai2",
          source: "client-discovery-summary-ai1",
          target: "client-discovery-summary-ai2"
        },
        {
          id: "client-discovery-summary-ai2-action",
          source: "client-discovery-summary-ai2",
          target: "client-discovery-summary-action"
        }
      ]
    }
  },
  {
    id: "product-feedback-analyzer",
    name: "Product Feedback Analyzer",
    description:
      "Analyze customer feedback for sentiment and issues in parallel, then generate a prioritized product report.",
    category: "Client Work",
    complexity: "Advanced",
    graph: {
      nodes: [
        {
          id: "product-feedback-analyzer-input1",
          type: "inputNode",
          position: { x: 100, y: 200 },
          data: {
            label: "Customer Feedback",
            key: "feedback",
            defaultValue:
              "Review (4/5): Love the core scheduling feature — saves me an hour a week. But the mobile app logs me out constantly, super annoying.\n\nSurvey response: The new dashboard is beautiful but I can't find the export button anymore. Why did you move it?\n\nSupport ticket #4821: Calendar sync with Google stopped working after the last update. Events created in the app don't show up in Google Calendar. This is blocking my whole team.\n\nReview (5/5): Best tool in its category. Would pay double. Please add a dark mode though, my eyes beg you.\n\nSurvey response: Pricing feels steep for solo users. A cheaper individual plan would make this a no-brainer.\n\nSupport ticket #4899: App crashes when I try to attach a file larger than 10MB to a task. No error message, just closes.\n\nReview (3/5): Good features but it's getting slow — the project list takes 5+ seconds to load now that we have ~200 projects.",
            placeholder: "Paste survey responses, reviews, or support tickets..."
          }
        },
        {
          id: "product-feedback-analyzer-ai1",
          type: "aiNode",
          position: { x: 420, y: 120 },
          data: {
            label: "Sentiment Classifier",
            action: "Classify",
            prompt:
              "Classify the overall sentiment of this product feedback as Positive, Mixed, or Negative, and identify the top 3 themes.\n\nFeedback:\n{{feedback}}",
            outputMode: "json"
          }
        },
        {
          id: "product-feedback-analyzer-ai2",
          type: "aiNode",
          position: { x: 420, y: 320 },
          data: {
            label: "Issue Extractor",
            action: "Extract",
            prompt:
              "Extract all specific product issues, feature requests, and bugs mentioned in this feedback:\n\n{{feedback}}",
            outputMode: "json",
            outputFields: ["issues", "featureRequests", "bugs"]
          }
        },
        {
          id: "product-feedback-analyzer-ai3",
          type: "aiNode",
          position: { x: 740, y: 200 },
          data: {
            label: "Product Report",
            action: "Generate",
            prompt:
              "Using the sentiment analysis and extracted issues from the previous steps, write an actionable product feedback report.\n\nRaw feedback for reference:\n{{feedback}}\n\nInclude: Executive Summary, Top Issues (prioritized), Feature Requests, Recommended Actions (3-5), and Metrics to Track.\n\nOutput only the report itself — no preamble or commentary.",
            outputMode: "text"
          }
        },
        {
          id: "product-feedback-analyzer-action",
          type: "actionNode",
          position: { x: 1060, y: 200 },
          data: { label: "Save Feedback Report", action: "Save Output" }
        }
      ],
      edges: [
        {
          id: "product-feedback-analyzer-input1-ai1",
          source: "product-feedback-analyzer-input1",
          target: "product-feedback-analyzer-ai1"
        },
        {
          id: "product-feedback-analyzer-input1-ai2",
          source: "product-feedback-analyzer-input1",
          target: "product-feedback-analyzer-ai2"
        },
        {
          id: "product-feedback-analyzer-ai1-ai3",
          source: "product-feedback-analyzer-ai1",
          target: "product-feedback-analyzer-ai3"
        },
        {
          id: "product-feedback-analyzer-ai2-ai3",
          source: "product-feedback-analyzer-ai2",
          target: "product-feedback-analyzer-ai3"
        },
        {
          id: "product-feedback-analyzer-ai3-action",
          source: "product-feedback-analyzer-ai3",
          target: "product-feedback-analyzer-action"
        }
      ]
    }
  },
  {
    id: "meeting-debrief",
    name: "Meeting Debrief",
    description:
      "Extract action items and decisions from meeting notes, then produce a clean debrief document ready to share.",
    category: "Productivity",
    complexity: "Intermediate",
    graph: {
      nodes: [
        {
          id: "meeting-debrief-input1",
          type: "inputNode",
          position: { x: 100, y: 200 },
          data: {
            label: "Meeting Notes or Transcript",
            key: "meetingNotes",
            defaultValue:
              "Product sync — Tuesday, 10:00-10:45. Attendees: Priya (PM), Tom (Eng lead), Alicia (Design).\n\nPriya: Q3 launch is at risk — the billing migration is taking longer than planned. Proposes cutting the usage-analytics widget from the launch scope.\nTom: Agrees. Billing migration needs two more weeks; the widget alone is another three. Says the team can ship billing + core dashboard by Aug 15 if the widget moves to Q4.\nAlicia: Fine with the cut but wants the empty state designed properly so the dashboard doesn't look unfinished. Will have mockups by Friday.\n\nDECISION: Usage-analytics widget moves to Q4. Launch scope = billing migration + core dashboard.\nDECISION: Launch date holds at Aug 15.\n\nTom to update the engineering plan and re-estimate by Thursday.\nAlicia to deliver empty-state mockups by Friday.\nPriya to draft the customer comms about the revised scope and share with the team next Monday.\nOpen question: do we grandfather existing customers on old billing plans or migrate everyone? Priya to check with finance.\n\nNext sync: same time next Tuesday.",
            placeholder: "Paste your meeting notes or transcript..."
          }
        },
        {
          id: "meeting-debrief-ai1",
          type: "aiNode",
          position: { x: 420, y: 200 },
          data: {
            label: "Action Item Extractor",
            action: "Extract",
            prompt:
              "Extract all action items, decisions, and owners from these meeting notes:\n\n{{meetingNotes}}",
            outputMode: "json",
            outputFields: ["actionItems", "decisions", "owners"]
          }
        },
        {
          id: "meeting-debrief-ai2",
          type: "aiNode",
          position: { x: 740, y: 200 },
          data: {
            label: "Debrief Writer",
            action: "Generate",
            prompt:
              "Using the extracted action items and decisions from the previous step, write a clean professional meeting debrief.\n\nRaw notes for reference:\n{{meetingNotes}}\n\nSections: Meeting Summary (3 sentences), Key Decisions, Action Items (with owners and deadlines if mentioned), Open Questions, Follow-up Date.\n\nOutput only the debrief document — no preamble or commentary.",
            outputMode: "text"
          }
        },
        {
          id: "meeting-debrief-action",
          type: "actionNode",
          position: { x: 1060, y: 200 },
          data: { label: "Save Debrief", action: "Save Output" }
        }
      ],
      edges: [
        {
          id: "meeting-debrief-input1-ai1",
          source: "meeting-debrief-input1",
          target: "meeting-debrief-ai1"
        },
        {
          id: "meeting-debrief-ai1-ai2",
          source: "meeting-debrief-ai1",
          target: "meeting-debrief-ai2"
        },
        {
          id: "meeting-debrief-ai2-action",
          source: "meeting-debrief-ai2",
          target: "meeting-debrief-action"
        }
      ]
    }
  }
];

export function getTemplateById(id: string): WorkflowTemplate | undefined {
  return TEMPLATES.find((template) => template.id === id);
}
