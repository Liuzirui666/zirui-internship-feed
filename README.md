# Internship feed

Public official job-posting data and a five-minute GitHub Actions collector. No CV, application history, contact notes, personal drafts or credentials are stored here.

Focus: LLM security, AI safety, agentic systems, reinforcement learning, fuzzing, program analysis and related ML research. Internships only; US and explicit PhD research eligibility rank first, related engineering internships lower.

Official-source adapters and reconciliation are adapted from [jrohsc/jrohsc.github.io/jobs-source](https://github.com/jrohsc/jrohsc.github.io/tree/master/jobs-source). The upstream adapters are fetched at collection time; the personalized matching model lives in site/radar/matching.mjs. Source failures preserve dated prior jobs. The five-minute schedule is a target; GitHub scheduling, rate limits and collection duration can delay publication.

The GitHub Pages website checks manifest.json every thirty seconds. The workflow can also be run manually from Actions. data.json and manifest.json are committed together.

The collector has two unattended paths: the five-minute GitHub cron and an automatic continuation queued by the preceding GitHub Actions run. Each continuation waits until the next five-minute collection time, then queues its successor before collecting, so a temporary source failure does not break the next attempt. The repository's built-in GITHUB_TOKEN is sufficient; no AI, local process, external scheduling account, or personal access token is required for job collection. One concurrency group permits at most one running and one pending collection, preventing multiple independent chains.

`refresh-control.json` controls the continuation: `enabled: false` stops it when the next run starts; restore `true` to restart through the configuration push or Run workflow. The interval is 300 seconds. GitHub queueing and collection duration can delay the actual publication time. Each run checks out current `main`, preserving the preceding run's posting history.


The website uses five tabs: All, Research, Engineering, Big companies, Small companies. Each is derived from the same eligible internship universe. Research and Engineering may overlap; their deduplicated union equals All. Big/Small are company subsets, not role types. The explicitly listed Big-company group contains traditional major tech companies and major AI labs; remaining startups and specialist teams are Small. Postings mentioning only bachelor/master study are excluded; PhD-required/preferred/accepted and unspecified study requirements remain, with the original evidence visible. Unspecified education is not a guarantee of eligibility.

Small-company internships additionally require an employer-published USD base-pay lower bound of $60/hour or $10,000/month. Unknown pay is excluded from the eligible universe. Equity and annual salaries are not converted into hourly pay. Eleven additional official boards are monitored by the same unattended collector. A board can legitimately have zero matching internships. Website overrides are installed from site/radar after unpacking the original static bundle; the collector imports the same matching model. These changes do not modify private application records.
