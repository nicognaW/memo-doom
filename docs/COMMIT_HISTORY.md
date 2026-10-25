# Public repository history

This Git history starts with the accepted 0.1.5 application. Earlier work existed in a local SDK workspace, not as the public repository commits shown here. The source import is split by review responsibility at the time of repository preparation. Commit dates are the actual preparation dates; they do not reconstruct development dates for versions 0.1.1–0.1.5.

| Commit subject | Review scope |
| --- | --- |
| Import doomgeneric and Freedoom with their upstream notices | Engine snapshot, local upstream patch, game data, fflate and original license notices |
| Add the accepted phone controller and game engine | Existing game, phone HUD, controls and application regression tests |
| Make local builds portable and check public files in CI | External SDK lookup, relative compiler inputs, build/preview/package tools, lockfile and public-file checks |
| Record the decisions and corrections behind the accepted game | Glossary, retrospective ADRs, evidence-based iteration record and environment review |
| Add an agent guide for setup, development and installation | Project skill, branch references and short agent entry point |
| Explain the game and installation path for new readers | English and Chinese README, user/build/install guides, validation and local review notes |

The configured maintainer identity comes from the GitHub profile supplied by the user: [nicognaW](https://github.com/nicognaW), display name `nk`. The profile does not expose an email address. The repository uses the ID-based GitHub noreply form documented in [GitHub's email reference](https://docs.github.com/en/account-and-profile/reference/email-addresses-reference). This configuration applies only to this repository.

Codex prepared these imports and documents under the maintainer's direction. Decision notes identify retrospective reasoning separately from observed feedback. Matt Pocock did not participate in the project; the user requested a workflow based on the supplied interview, retrospective, domain-modeling and agent-writing skills. There are no invented interviews, reviewers, test runs or historical commits.

The bodies of the import commits describe the actual source boundary and validation scope. Local review documents use the requested PR format; they are drafts in this repository, not GitHub pull requests that were opened or merged.
