# AITA

[![Quality](https://github.com/RetoSchneider/AITA/actions/workflows/quality.yml/badge.svg?branch=master)](https://github.com/RetoSchneider/AITA/actions/workflows/quality.yml)

AITA (AI Test Agent) is an agent that finds out why Playwright tests failed. For every failed or flaky test in a report, it reads the test, the page state at the moment of failure and the changes since the last green run. It then decides whether the failure is a **product defect**, an **outdated test**, a **flaky test** or an **environment issue**, and drafts a bug report for real defects.

Every verdict quotes the evidence it rests on, and each quote is checked against what the agent actually saw before the verdict is accepted. An evaluation suite measures the agent on 13 failures with a known cause, injected into a real application. In the latest run it named the correct cause in all 39 runs, at an average of $0.06 and 17 seconds per failure.

## How it works

```mermaid
flowchart LR
  report[Playwright JSON report] --> failures[Failed and flaky tests]
  failures --> model
  subgraph investigation[Investigation per failure]
    model[Claude] -- tool call --> tools[read_file · search_code · list_changes<br>diff_file · read_attachment · rerun_test]
    tools -- numbered observation --> model
    model -- submit_triage --> check{Every quote found in<br>the cited observation?}
    check -- no, feedback --> model
  end
  check -- yes --> output[Markdown summary and JSON]
```

The agent loop is written directly against the Claude Messages API ([triage-agent.ts](src/agent/triage-agent.ts)). Design decisions:

- **Read-only tools.** The agent reads files, searches the code, inspects the diff since the baseline, opens attachments such as the page snapshot or screenshot and, when allowed, reruns the test ([tools.ts](src/agent/tools.ts)). It cannot change code or tests, so it can never make a real defect disappear by "fixing" the test.
- **Checked evidence.** Every tool result is recorded as a numbered observation. A verdict must quote the observations it relies on. A quote that does not appear in the cited observation goes back to the model with a precise correction, and if it is still wrong after two corrections it is marked as unverified in the output ([verdict.ts](src/agent/verdict.ts), [observations.ts](src/agent/observations.ts)).
- **Repository content is data.** File contents, test output, attachments and commit messages are passed to the model as data, and the instructions forbid following instructions found in them ([instructions.ts](src/agent/instructions.ts)).
- **Bounded cost.** A tool budget, a turn limit, size limits on observations and prompt caching keep every triage predictable. Each result reports tool calls, tokens, cost and duration.
- **Honest uncertainty.** `inconclusive` is a valid verdict. The evaluation reports how often the agent commits to a cause and how often it is right when it does.
- **Strict schemas.** Tool inputs and the verdict are Zod schemas, sent to the API as strict JSON schemas and validated again when the model's answer arrives ([schema.ts](src/agent/schema.ts)).
- **Sandboxed access.** Paths are resolved against the repository or artifact directory and rejected if they leave it, and git runs without a shell ([paths.ts](src/workspace/paths.ts), [repository.ts](src/workspace/repository.ts)).

## Output

The Markdown summary is meant for a pull request comment or the GitHub job summary. It starts with an overview table of all failures and their causes. Each failure then gets the verdict and confidence, a short explanation, the quoted evidence, a bug report with steps to reproduce for product defects, and the recommended next step. A footer lists the model, tool calls, tokens, cost and time. `--json` writes the same result with the agent's investigation steps for further processing.

[This example](docs/example-triage.md) shows the real output for a declined payment that can no longer be retried. The agent connects the alert in the page snapshot to the commit that stopped resetting the checkout key, and to the server code that rejects the reused key.

## Evaluation

The evaluation measures the agent on failures whose cause is known. Each case breaks [SeatWise](https://github.com/RetoSchneider/SeatWise), a ticketing application with an extensive Playwright suite, at a pinned revision in exactly one way: in its code, in its tests or in its test environment.

| Case                                                                                  | Expected cause    | Fault                                                                                             |
| ------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| [Reused idempotency key](eval/cases/idempotency-key-ignores-payment-change)           | Product defect    | Checkout stops comparing the request hash, so a reused key replays a declined payment             |
| [Cancelled event published again](eval/cases/cancelled-event-can-be-republished)      | Product defect    | The guard against status changes after a cancellation is removed                                  |
| [Promotion limit exceeded](eval/cases/promotion-limit-exceeded-under-concurrency)     | Product defect    | Concurrent checkouts both pass the redemption limit                                               |
| [Suspended organizer keeps access](eval/cases/suspended-organizer-keeps-access)       | Product defect    | The organizer lookup ignores the profile status                                                   |
| [Declined payment cannot be retried](eval/cases/declined-payment-cannot-be-retried)   | Product defect    | The cart reuses its idempotency key after a declined payment                                      |
| [Payment button renamed](eval/cases/payment-button-renamed)                           | Outdated test     | The button label changes on purpose, the UI test still uses the old one                           |
| [Reservation rate limit raised](eval/cases/reservation-rate-limit-raised)             | Outdated test     | The limit rises from 12 to 30 per minute, the test still expects a `429` after 25                 |
| [Validation error code renamed](eval/cases/validation-error-code-renamed)             | Outdated test     | `VALIDATION_ERROR` becomes `INVALID_REQUEST` in code and docs, the test still expects the old one |
| [Random seats collide](eval/cases/random-seats-collide)                               | Flaky test        | The test picks two random seats out of two, so both reservations often ask for the same seat      |
| [Promotion checked after a fixed wait](eval/cases/promotion-checked-after-fixed-wait) | Flaky test        | The test waits a fixed 30 ms and checks once instead of waiting for the promotion                 |
| [Test database unavailable](eval/cases/database-unavailable)                          | Environment issue | PostgreSQL is stopped before the run                                                              |
| [Server port in use](eval/cases/server-port-in-use)                                   | Environment issue | Another process holds the port the application should start on                                    |
| [Browsers not installed](eval/cases/browsers-not-installed)                           | Environment issue | The browser directory is empty, as on a CI image that skipped the installation                    |

Some cases are deliberately hard to tell apart. The declined-payment defect and the renamed button break the same UI test. Most product defects come with plausible commit messages that make the change look intended. The colliding random seats produce an error message that reads like a race condition in the application.

Each case holds the fault as a git patch with its commit message, the Playwright report and attachments recorded against SeatWise's production build and PostgreSQL database, and, for test failures, the results of rerunning the test. For every run, the agent gets a fresh checkout of the pinned revision with the fault committed on top, so it sees the same code, history and artifacts as in a real CI run ([fixtures.ts](src/evaluation/fixtures.ts)).

### Results

The latest run used Claude Opus 5.5 at high effort, with three runs per case ([full scorecard](eval/results/2026-10-26-claude-opus-5-5-high.md)):

| Metric                     | Result                           |
| -------------------------- | -------------------------------- |
| Correct cause              | 39 of 39 runs                    |
| Answered, not inconclusive | 39 of 39 runs                    |
| Same cause in every run    | 13 of 13 cases                   |
| Evidence quotes verified   | 186 of 186                       |
| Tool calls per triage      | 4.9 on average                   |
| Time per triage            | 17 s on average                  |
| Cost                       | $2.23 in total, $0.06 per triage |

The scorecard also breaks the result down by cause, with a confusion matrix across all causes, and lists the verdicts of every case. The first run found one real problem: the model wrote search patterns in Perl syntax, which the search tool rejected at the time. The tool now accepts Perl-compatible expressions, and the run above uses that version.

```bash
pnpm evaluate --repeat 3
```

Scorecards and the full runs, including every investigation step, are written to `eval/results`. `pnpm record <case-id>` records a case again; it needs Docker and a local SeatWise checkout next to this repository.

## Usage

You need Node.js 22.14 or newer, pnpm 10.18.3 and an [Anthropic API key](https://console.anthropic.com/).

```bash
pnpm install --frozen-lockfile
export ANTHROPIC_API_KEY=your-key
pnpm triage --report ../my-app/test-results/results.json --repository ../my-app --baseline origin/main
```

| Option                  | Meaning                                                                   |
| ----------------------- | ------------------------------------------------------------------------- |
| `--report <file>`       | Playwright JSON report (required)                                         |
| `--repository <dir>`    | Repository under test (default: current directory)                        |
| `--artifacts <dir>`     | Directory that attachment paths are relative to (default: the repository) |
| `--baseline <revision>` | Revision where the tests last passed, used for commits and diffs          |
| `--output <file>`       | Write the Markdown summary to a file instead of standard output           |
| `--json <file>`         | Also write the full result as JSON                                        |
| `--rerun`               | Let the agent rerun failing tests                                         |
| `--max-failures <n>`    | Investigate at most n failures (default: 10)                              |
| `--model <id>`          | Claude model (default: `claude-opus-5-5`)                                 |
| `--effort <level>`      | `low`, `medium`, `high`, `xhigh` or `max` (default: `high`)               |
| `--max-tool-calls <n>`  | Tool calls per failure (default: 16)                                      |
| `--concurrency <n>`     | Failures investigated in parallel (default: 2)                            |

The project under test needs Playwright's JSON reporter, for example `["json", { outputFile: "test-results/results.json" }]` in `playwright.config.ts`. For diffs against the baseline, the checkout needs the full history.

### In GitHub Actions

```yaml
- uses: actions/checkout@v7
  with:
    fetch-depth: 0
# install, build and run the Playwright tests
- uses: actions/checkout@v7
  if: failure() && github.event_name == 'pull_request'
  with:
    repository: RetoSchneider/AITA
    path: .aita
- name: Triage failed tests
  if: failure() && github.event_name == 'pull_request'
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    GH_TOKEN: ${{ github.token }}
  run: |
    pnpm --dir .aita install --frozen-lockfile
    pnpm --dir .aita build
    node .aita/dist/main.js triage \
      --report test-results/results.json \
      --baseline origin/${{ github.base_ref }} \
      --output triage.md
    gh pr comment ${{ github.event.pull_request.number }} --body-file triage.md
```

When `GITHUB_STEP_SUMMARY` is set, the summary is also added to the job summary. Commenting needs `pull-requests: write` permission.

## Project structure

| Path                                             | Content                                                         |
| ------------------------------------------------ | --------------------------------------------------------------- |
| [src/agent](src/agent)                           | Agent loop, tools, instructions, verdict check, usage and cost  |
| [src/playwright](src/playwright)                 | Reading Playwright JSON reports and rerunning tests             |
| [src/workspace](src/workspace)                   | Sandboxed access to the repository, git history and attachments |
| [src/evaluation](src/evaluation)                 | Evaluation cases, checkouts with the injected fault, scoring    |
| [src/output](src/output)                         | Markdown summary                                                |
| [src/commands](src/commands)                     | `triage` and `evaluate` commands                                |
| [scripts/record-case.ts](scripts/record-case.ts) | Recording an evaluation case against SeatWise                   |
| [eval](eval)                                     | Pinned SeatWise revision, cases and scorecards                  |
| [docs](docs)                                     | Example output from the evaluation                              |

## Development

```bash
pnpm check
pnpm build
```

`pnpm check` runs Prettier, ESLint with the strict type-checked rules of typescript-eslint, the TypeScript compiler and the Vitest suite. The unit tests drive the agent loop with a scripted model, so they need neither an API key nor network access. CI runs the same checks on every push and pull request.

## License

[MIT](LICENSE)
