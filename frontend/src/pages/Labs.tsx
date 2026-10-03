import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpRight, Beaker, Plus, Search, Sparkles, Trophy } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { CURATED_BASKETS } from "@/lib/baskets-data";
import { Button } from "@/components/arc/button";
import "./cesto.css";

type LabIdea = {
  id: string;
  title: string;
  description: string;
  author: string;
  votes: number;
  date: string;
  image: string;
  tags: string[];
};

const INITIAL_IDEAS: LabIdea[] = [
  {
    id: "conviction",
    title: "High Conviction Tech & Industrial Alpha",
    description: "A high growth basket focused on industrial AI leaders and the infrastructure powering the next generation of intelligence.",
    author: "SolanaFan",
    votes: 128,
    date: "2h ago",
    image: "/baskets/solana-infrastructure.jpg",
    tags: ["Technology", "Growth"],
  },
  {
    id: "ai",
    title: "Ansem’s Top 10 Owner Portfolio",
    description: "A curated basket based on the most followed Solana investor’s public portfolio and high conviction positions.",
    author: "matthew",
    votes: 96,
    date: "5h ago",
    image: "/baskets/solana-alt-szn.jpg",
    tags: ["Solana", "Community"],
  },
  {
    id: "china",
    title: "China Humanistic Robotics Core",
    description: "The next wave of automation: humanoid robotics, semiconductors, and the companies putting machines to work.",
    author: "LuckyB",
    votes: 84,
    date: "Yesterday",
    image: "/baskets/solana-purple.jpg",
    tags: ["Robotics", "AI"],
  },
  {
    id: "green",
    title: "Agentic Compute Stack",
    description: "A focused portfolio for the decentralized compute, model, and agent infrastructure powering autonomous software.",
    author: "GFLABS",
    votes: 72,
    date: "Yesterday",
    image: "/baskets/depin-infrastructure.jpg",
    tags: ["AI", "Compute"],
  },
  {
    id: "mars",
    title: "Mars Frontier Innovation Core",
    description: "The frontier is closer than it looks. Explore the companies building new ways to move, compute, and live.",
    author: "SolanaFan",
    votes: 61,
    date: "2 days ago",
    image: "/baskets/solana-orb.png",
    tags: ["Innovation"],
  },
  {
    id: "india",
    title: "Indian-Origin CEO Basket",
    description: "A collection of global technology leaders shaped by founders with roots in India.",
    author: "matthew",
    votes: 58,
    date: "2 days ago",
    image: "/baskets/solana-sigma.jpg",
    tags: ["Technology", "Founders"],
  },
  {
    id: "peptides",
    title: "Peptides Core",
    description: "A long-term look at the companies reshaping metabolic health and the science of healthy aging.",
    author: "GFLABS",
    votes: 43,
    date: "3 days ago",
    image: "/baskets/culture-memes.jpg",
    tags: ["Healthcare"],
  },
  {
    id: "peace",
    title: "Donald Trump Nobel for Peace",
    description: "A thematic basket tracking the global markets and sectors that may shift with geopolitical change.",
    author: "SolanaFan",
    votes: 39,
    date: "3 days ago",
    image: "/baskets/defi-bluechips.jpg",
    tags: ["Macro"],
  },
  {
    id: "hydra",
    title: "Hydra Mind",
    description: "A broad thesis around neural interfaces, next-generation hardware, and human-computer interaction.",
    author: "matthew",
    votes: 34,
    date: "4 days ago",
    image: "/baskets/solana-spartan.jpg",
    tags: ["Technology"],
  },
  {
    id: "portfolio",
    title: "Four Solid Portfolio",
    description: "A simple, balanced starting point for investors who want diversified exposure without the noise.",
    author: "LuckyB",
    votes: 28,
    date: "4 days ago",
    image: "",
    tags: ["Balanced"],
  },
  {
    id: "stripe",
    title: "Stripe-Time The Future",
    description: "Payments infrastructure and the networks reshaping how money moves around the world.",
    author: "SolanaFan",
    votes: 22,
    date: "5 days ago",
    image: "",
    tags: ["Fintech"],
  },
  {
    id: "climate",
    title: "The Climate War Collateral",
    description: "A considered take on energy transition, industrial resilience, and the climate economy.",
    author: "matthew",
    votes: 19,
    date: "1 week ago",
    image: "",
    tags: ["Climate"],
  },
];

const KEY = "cesto-labs-ideas-v1";

function loadIdeas(): LabIdea[] {
  try {
    const saved = localStorage.getItem(KEY);
    return saved ? [...JSON.parse(saved), ...INITIAL_IDEAS] : INITIAL_IDEAS;
  } catch {
    return INITIAL_IDEAS;
  }
}

export default function Labs() {
  const [ideas, setIdeas] = useState<LabIdea[]>(loadIdeas);
  const [voted, setVoted] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(`${KEY}-votes`) || "[]");
    } catch {
      return [];
    }
  });
  const [filter, setFilter] = useState("Trending");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [notice, setNotice] = useState("");

  const visible = useMemo(() => {
    let result = ideas.filter((idea) =>
      `${idea.title} ${idea.description} ${idea.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase())
    );
    if (filter === "Top") result = [...result].sort((a, b) => b.votes - a.votes);
    if (filter === "New") result = [...result].reverse();
    return result;
  }, [ideas, query, filter]);

  const vote = (idea: LabIdea) => {
    const already = voted.includes(idea.id);
    const nextVotes = already ? voted.filter((id) => id !== idea.id) : [...voted, idea.id];
    setVoted(nextVotes);
    localStorage.setItem(`${KEY}-votes`, JSON.stringify(nextVotes));
    setIdeas((previous) =>
      previous.map((item) => (item.id === idea.id ? { ...item, votes: item.votes + (already ? -1 : 1) } : item))
    );
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !description.trim()) return;
    const idea: LabIdea = {
      id: `idea-${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      author: "You",
      votes: 1,
      date: "Just now",
      image: "",
      tags: ["Community"],
    };
    const created = JSON.parse(localStorage.getItem(KEY) || "[]");
    localStorage.setItem(KEY, JSON.stringify([idea, ...created]));
    setIdeas((current) => [idea, ...current]);
    setVoted((current) => [...current, idea.id]);
    setTitle("");
    setDescription("");
    setDialog(false);
    setFilter("New");
    setNotice("Your basket idea is live in Labs.");
    window.setTimeout(() => setNotice(""), 3500);
  };

  return (
    <PageShell>
      <div className="cesto-page labs-page">
        {/* Header */}
        <div className="labs-heading">
          <div>
            <div className="labs-eyebrow">
              <Beaker size={18} />
              <span>Labs</span>
              <span className="beta-pill">BETA</span>
            </div>
            <p>Community-driven basket ideas. Share your alpha, upvote the best baskets, and build community around it.</p>
          </div>
          <Button variant="primary" size="md" onClick={() => setDialog(true)} className="font-bold">
            <Plus size={16} />
            <span>Create Basket</span>
          </Button>
        </div>

        {/* Layout */}
        <div className="labs-layout">
          <main className="labs-main">
            {/* Banner */}
            <section className="labs-banner">
              <div>
                <span className="banner-kicker">
                  <Sparkles size={14} /> COMMUNITY RESEARCH
                </span>
                <h2>Got a basket idea?</h2>
                <p>Share a thesis. Find your people. Build something worth investing in.</p>
                <Button variant="primary" size="sm" onClick={() => setDialog(true)} className="font-bold">
                  <Plus size={14} />
                  <span>Create Basket</span>
                </Button>
              </div>
            </section>

            {notice && <div className="labs-notice">✓ {notice}</div>}

            {/* Toolbar */}
            <div className="feed-toolbar">
              <div className="feed-tabs">
                {["Trending", "Top", "New"].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setFilter(tab)}
                    className={filter === tab ? "feed-tab active" : "feed-tab"}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <label className="labs-search">
                <Search size={14} />
                <input
                  placeholder="Search ideas"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </div>

            {/* Feed */}
            <div className="labs-feed">
              {visible.map((idea) => (
                <article className="idea-card" key={idea.id}>
                  <div className="idea-image">
                    {idea.image ? (
                      <img src={idea.image} alt={idea.title} />
                    ) : (
                      <div className="idea-image-empty">
                        <Beaker size={20} />
                      </div>
                    )}
                  </div>
                  <div className="idea-copy">
                    <div className="idea-meta">
                      {idea.tags.map((tag) => (
                        <span key={tag} className="idea-tag">
                          {tag}
                        </span>
                      ))}
                      <span>·</span>
                      <span>{idea.date}</span>
                    </div>
                    <div className="idea-title">{idea.title}</div>
                    <p>{idea.description}</p>
                    <div className="idea-footer">
                      <span className="idea-author">
                        <span className="author-dot">{idea.author.slice(0, 1).toUpperCase()}</span>
                        {idea.author}
                      </span>
                      <span className="idea-actions">
                        <button
                          type="button"
                          aria-label="Upvote idea"
                          aria-pressed={voted.includes(idea.id)}
                          className={voted.includes(idea.id) ? "vote-button voted" : "vote-button"}
                          onClick={() => vote(idea)}
                        >
                          <ArrowUp size={13} />
                          <span>{idea.votes}</span>
                        </button>
                        <button
                          type="button"
                          aria-label="Remove upvote"
                          className="vote-button"
                          onClick={() => voted.includes(idea.id) && vote(idea)}
                        >
                          <ArrowDown size={13} />
                        </button>
                      </span>
                    </div>
                  </div>
                </article>
              ))}

              {visible.length === 0 && (
                <div className="labs-empty">No ideas match “{query}”. Try another search.</div>
              )}
            </div>
          </main>

          {/* Sidebar */}
          <aside className="labs-sidebar">
            <div className="side-panel">
              <h3>
                <Trophy size={14} /> Top Contributors
              </h3>
              {[
                ["🟣", "SolanaFan", "+128"],
                ["🟢", "matthew", "+96"],
                ["🟣", "LuckyB", "+84"],
                ["🟣", "GFLABS", "+72"],
                ["🔵", "kalinas", "+56"],
              ].map(([icon, name, score]) => (
                <div className="contributor" key={name}>
                  <span className="contributor-icon">{icon}</span>
                  <span>{name}</span>
                  <strong>{score}</strong>
                </div>
              ))}
              <button type="button" className="side-link" onClick={() => setFilter("Top")}>
                View all rankings <ArrowUpRight size={12} />
              </button>
            </div>

            <div className="side-panel">
              <h3>
                <Sparkles size={14} /> Top Baskets
              </h3>
              {CURATED_BASKETS.slice(0, 5).map((basket, index) => (
                <Link className="top-basket" key={basket.id} to={`/markets/${basket.id}`}>
                  <span className="rank-number">0{index + 1}</span>
                  <span className="top-basket-name">{basket.name}</span>
                  <span className="top-basket-return">+{basket.returns7d.toFixed(1)}%</span>
                </Link>
              ))}
            </div>

            <div className="side-tip">
              <span>✦</span>
              <div>
                <b>Good ideas start with a thesis.</b>
                <p>Tell the community what your basket holds and why it matters.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Create Basket Dialog */}
      {dialog && (
        <div
          className="labs-overlay"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && setDialog(false)}
        >
          <form className="labs-dialog" onSubmit={submit}>
            <div className="dialog-top">
              <div>
                <span className="labs-eyebrow">
                  <Beaker size={16} /> Share an idea
                </span>
                <p>Give the community a clear investment thesis.</p>
              </div>
              <button
                type="button"
                className="dialog-close"
                aria-label="Close"
                onClick={() => setDialog(false)}
              >
                ×
              </button>
            </div>
            <label>
              Basket name
              <input
                autoFocus
                maxLength={70}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Decentralized AI Infrastructure"
                required
              />
            </label>
            <label>
              Thesis
              <textarea
                maxLength={360}
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What is the idea, and why now?"
                required
              />
            </label>
            <div className="dialog-actions">
              <Button type="button" variant="secondary" size="md" onClick={() => setDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="md" className="font-bold">
                <Plus size={15} />
                <span>Publish idea</span>
              </Button>
            </div>
          </form>
        </div>
      )}
    </PageShell>
  );
}
