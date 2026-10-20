export const DAY = 86400000;
export const categories = {
  math: "Mathematical foundations",
  ml: "Machine learning",
  dl: "Deep learning",
  llm: "LLM · Modern AI",
  dsa: "Algorithms / DSA",
  mlcoding: "ML implementation",
  systems: "ML systems",
  research: "Research skills",
  domain: "Domain tracks",
};
export const typeNames = {
  conceptual: "Conceptual",
  derivation: "Derivation",
  probability: "Probability",
  reasoning: "Proof / reasoning",
  coding: "Algorithms coding",
  implementation: "ML implementation",
  debugging: "Debugging",
  research: "Research design",
  system: "System design",
  critique: "Paper critique",
  estimation: "Estimation",
  experiment: "Experimental reasoning",
};
export const defaultState = () => ({
  version: 1,
  settings: {
    companies: ["deepmind", "openai", "anthropic"],
    role: "rs",
    minutes: 45,
    interviewDate: "",
    weak: [],
    difficulty: 3,
  },
  reviews: {},
  mistakes: [],
  drafts: {},
  bookmarks: [],
  history: [],
  mock: null,
  plan: null,
});
export function schedule(previous, rating, now = Date.now()) {
  if (!["again", "hard", "good", "easy"].includes(rating))
    throw new Error("Invalid rating");
  const p = previous || {
    interval: 0,
    ease: 2.3,
    reviewCount: 0,
    mastery: 0,
    history: [],
  };
  const ease = Math.max(
    1.3,
    Math.min(
      3,
      (p.ease || 2.3) +
        { again: -0.2, hard: -0.15, good: 0, easy: 0.15 }[rating],
    ),
  );
  const interval =
    rating === "again"
      ? 10 / 1440
      : rating === "hard"
        ? Math.max(1, (p.interval || 0.5) * 1.2)
        : rating === "good"
          ? Math.max(2, (p.interval || 1) * ease)
          : Math.max(4, (p.interval || 1) * ease * 1.3);
  const mastery =
    rating === "again"
      ? Math.max(0, (p.mastery || 0) - 25)
      : Math.min(
          100,
          (p.mastery || 0) + { hard: 8, good: 20, easy: 30 }[rating],
        );
  return {
    ...p,
    ease,
    interval,
    lastReviewed: now,
    nextReview: now + interval * DAY,
    reviewCount: (p.reviewCount || 0) + 1,
    mastery,
    history: [...(p.history || []), { at: now, rating, interval }].slice(-100),
  };
}
export function effectiveMastery(r, now = Date.now()) {
  if (!r) return 0;
  return Math.round(
    r.mastery *
      Math.exp(
        -Math.max(0, now - r.nextReview) / DAY / Math.max(3, r.interval * 2),
      ),
  );
}
export function topicMastery(id, questions, reviews, now = Date.now()) {
  const qs = questions.filter((q) => q.topics.includes(id));
  return qs.length
    ? Math.round(
        qs.reduce((s, q) => s + effectiveMastery(reviews[q.id], now), 0) /
          qs.length,
      )
    : 0;
}
export function categoryMastery(cat, topics, questions, reviews) {
  const ids = topics.filter((t) => t.category === cat).map((t) => t.id);
  const qs = questions.filter((q) => q.topics.some((t) => ids.includes(t)));
  return qs.length
    ? Math.round(
        qs.reduce((s, q) => s + effectiveMastery(reviews[q.id]), 0) / qs.length,
      )
    : 0;
}
export function rankQuestions(
  questions,
  topics,
  profiles,
  state,
  options = {},
) {
  const now = options.now || Date.now(),
    settings = { ...state.settings, ...options };
  const tmap = Object.fromEntries(topics.map((t) => [t.id, t]));
  const targetProfiles = profiles.filter(
    (p) =>
      settings.companies.includes(p.companyId) && p.roleId === settings.role,
  );
  return questions
    .filter(
      (q) =>
        !options.focus ||
        options.focus === "all" ||
        q.topics.some((id) => tmap[id]?.category === options.focus),
    )
    .map((q) => {
      const r = state.reviews[q.id],
        category = tmap[q.topics[0]]?.category || "ml";
      const importance = targetProfiles.length
        ? targetProfiles.reduce(
            (s, p) =>
              s +
              (p.ratings.find((x) => x.dimensionId === category)?.importance ||
                3),
            0,
          ) / targetProfiles.length
        : 3;
      const due =
        r && r.nextReview <= now
          ? 10 + Math.min(5, (now - r.nextReview) / DAY)
          : 0;
      const weakness = q.topics.some((id) => settings.weak.includes(id))
        ? 5
        : 0;
      const recent = r ? Math.max(0, 1 - (now - r.lastReviewed) / DAY) * 8 : 0;
      const relevance = q.companies.some((id) =>
        settings.companies.includes(id),
      )
        ? 2
        : 0;
      const role = q.roles.includes(settings.role) ? 3 : -3;
      const difficulty =
        3 - Math.abs(q.difficulty - Number(settings.difficulty || 3));
      const coverage = r ? 0 : 2;
      const days = settings.interviewDate
        ? Math.max(
            0,
            (new Date(settings.interviewDate + "T12:00:00").getTime() - now) /
              DAY,
          )
        : 60;
      const deadline = days < 8 ? importance * 1.5 : 0;
      const score =
        due +
        weakness +
        role +
        relevance +
        importance +
        q.importance * 0.7 +
        (100 - effectiveMastery(r, now)) / 20 +
        difficulty +
        coverage -
        recent +
        deadline;
      return {
        q,
        score,
        category,
        reason: due
          ? "Review is due"
          : weakness
            ? "Selected weak area"
            : !r
              ? "Not assessed yet"
              : "Role priority and mastery",
      };
    })
    .sort((a, b) => b.score - a.score || a.q.id.localeCompare(b.q.id));
}
export function generatePlan(questions, topics, profiles, state, options = {}) {
  const budget = Number(options.minutes || state.settings.minutes),
    ranked = rankQuestions(questions, topics, profiles, state, options),
    selected = [],
    used = new Set();
  let remaining = budget,
    last = "";
  while (remaining >= 3) {
    const candidates = ranked
      .filter((x) => !used.has(x.q.id) && x.q.expectedTime <= remaining)
      .map((x) => ({
        ...x,
        adjusted:
          x.score -
          selected.filter((s) => s.category === x.category).length * 4 -
          (x.category === last ? 3 : 0),
      }))
      .sort((a, b) => b.adjusted - a.adjusted || a.q.id.localeCompare(b.q.id));
    const pick = candidates[0];
    if (!pick) break;
    selected.push({
      id: pick.q.id,
      minutes: pick.q.expectedTime,
      reason: pick.reason,
      category: pick.category,
    });
    remaining -= pick.q.expectedTime;
    used.add(pick.q.id);
    last = pick.category;
  }
  return {
    created: Date.now(),
    budget,
    remaining,
    items: selected,
    settings: { ...state.settings, ...options },
  };
}
export function validateImport(
  x,
  questionIds,
  topicIds,
  companyIds,
  roleIds = ["rs", "re", "mle", "as", "swe"],
) {
  if (
    !x ||
    x.version !== 1 ||
    !x.settings ||
    !Array.isArray(x.history) ||
    !Array.isArray(x.mistakes) ||
    !Array.isArray(x.bookmarks) ||
    typeof x.reviews !== "object" ||
    !x.reviews ||
    Array.isArray(x.reviews)
  )
    throw new Error("Unsupported backup format.");
  const s = x.settings;
  if (
    !roleIds.includes(s.role) ||
    !Array.isArray(s.companies) ||
    !s.companies.every((id) => companyIds.includes(id)) ||
    ![30, 45, 60, 90].includes(Number(s.minutes)) ||
    !Array.isArray(s.weak) ||
    !s.weak.every((id) => topicIds.includes(id)) ||
    !Number.isFinite(s.difficulty) ||
    s.difficulty < 1 ||
    s.difficulty > 5 ||
    typeof s.interviewDate !== "string" ||
    (s.interviewDate && !/^\d{4}-\d{2}-\d{2}$/.test(s.interviewDate))
  )
    throw new Error("Invalid settings data.");
  for (const [id, r] of Object.entries(x.reviews)) {
    if (
      !questionIds.includes(id) ||
      !r ||
      ![
        "mastery",
        "interval",
        "ease",
        "reviewCount",
        "lastReviewed",
        "nextReview",
      ].every((k) => Number.isFinite(r[k])) ||
      r.mastery < 0 ||
      r.mastery > 100 ||
      r.interval < 0 ||
      r.reviewCount < 0 ||
      !Array.isArray(r.history) ||
      r.history.some(
        (h) =>
          !h ||
          !Number.isFinite(h.at) ||
          !["again", "hard", "good", "easy"].includes(h.rating),
      )
    )
      throw new Error("Invalid review data.");
  }
  if (
    x.bookmarks.some((id) => !questionIds.includes(id)) ||
    x.mistakes.some(
      (m) =>
        !m ||
        typeof m.id !== "string" ||
        !questionIds.includes(m.questionId) ||
        !Number.isFinite(m.at) ||
        !["thought", "why", "principle", "signal"].every(
          (k) => typeof m[k] === "string",
        ),
    ) ||
    x.history.some(
      (h) =>
        !h ||
        !questionIds.includes(h.id) ||
        !Number.isFinite(h.at) ||
        !["again", "hard", "good", "easy"].includes(h.rating),
    )
  )
    throw new Error("Invalid study history.");
  const drafts =
    x.drafts && typeof x.drafts === "object" && !Array.isArray(x.drafts)
      ? Object.fromEntries(
          Object.entries(x.drafts).filter(
            ([k, v]) => questionIds.includes(k) && typeof v === "string",
          ),
        )
      : {};
  let mock = null,
    plan = null;
  if (x.mock) {
    const m = x.mock;
    const finite = (k) => Number.isFinite(m[k]);
    const object = (v) => v && typeof v === "object" && !Array.isArray(v);
    if (
      !Array.isArray(m.ids) ||
      !m.ids.length ||
      m.ids.some((id) => !questionIds.includes(id)) ||
      new Set(m.ids).size !== m.ids.length ||
      !companyIds.includes(m.company) ||
      !roleIds.includes(m.role) ||
      !["start", "end", "duration", "index"].every(finite) ||
      !Number.isInteger(m.index) ||
      m.index < 0 ||
      m.index >= m.ids.length ||
      m.duration < 1 ||
      m.duration > 180 ||
      m.end < m.start ||
      typeof m.completed !== "boolean" ||
      !object(m.answers) ||
      !object(m.ratings) ||
      !object(m.confidence) ||
      Object.entries(m.answers).some(
        ([id, v]) => !m.ids.includes(id) || typeof v !== "string",
      ) ||
      Object.entries(m.ratings).some(
        ([id, r]) =>
          !m.ids.includes(id) || !["again", "hard", "good", "easy"].includes(r),
      ) ||
      Object.entries(m.confidence).some(
        ([id, v]) =>
          !m.ids.includes(id) || !["", "1", "2", "3", "4"].includes(v),
      ) ||
      (m.completed && !Number.isFinite(m.completedAt))
    )
      throw new Error("Invalid mock interview data.");
    mock = m;
  }
  if (x.plan) {
    const p = x.plan;
    if (
      !Array.isArray(p.items) ||
      p.items.some(
        (i) =>
          !i ||
          !questionIds.includes(i.id) ||
          !Number.isFinite(i.minutes) ||
          i.minutes <= 0 ||
          typeof i.reason !== "string" ||
          !Object.hasOwn(categories, i.category),
      ) ||
      !Number.isFinite(p.created) ||
      !Number.isFinite(p.budget) ||
      !Number.isFinite(p.remaining) ||
      p.remaining < 0 ||
      p.items.reduce((a, i) => a + i.minutes, 0) > p.budget
    )
      throw new Error("Invalid practice plan.");
    plan = p;
  }
  return {
    ...defaultState(),
    settings: s,
    reviews: x.reviews,
    mistakes: x.mistakes,
    history: x.history,
    bookmarks: x.bookmarks,
    drafts,
    mock,
    plan,
  };
}
export function isoDay(at = Date.now()) {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
