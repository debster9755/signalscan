import { loadPortfolio, type Opportunity } from '@/lib/portfolio';

// The page reads a database when one is available, so it must not be captured
// at build time.
export const dynamic = 'force-dynamic';

function days(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  return `${(minutes / 60 / 24).toFixed(1)}d`;
}

function money(value: number | null, currency: string): string {
  if (value === null) return '—';
  return `${currency} ${value.toLocaleString('en-IN')}`;
}

function Band({ band }: { band: Opportunity['priorityBand'] }) {
  return <span className={`band band-${band}`}>{band}</span>;
}

export default async function Page() {
  const p = await loadPortfolio();
  const winner = p.opportunities[0];
  const blocked = p.opportunities.find((o) => o.priorityBand === 'blocked');
  const topScore = Math.max(...p.opportunities.map((o) => o.priorityScore), 1);

  return (
    <main>
      <p className="kicker">Northstar Cloud — synthetic client</p>
      <h1>AI Marketing Opportunity Scan</h1>
      <p className="tagline">
        Five to eight candidates, scored deterministically on the server and ranked into four
        priority bands. A hard stop blocks a candidate regardless of its score.
      </p>
      <p className="badge">
        Data source: <strong>{p.source === 'database' ? 'Postgres' : 'in-memory fixture'}</strong> —{' '}
        {p.sourceDetail}
      </p>

      <section>
        <p className="kicker">§8 — Campaign flow</p>
        <h2>Where the time actually goes</h2>
        <div className="stats">
          <div className="stat">
            <div className="value">{p.stageCount}</div>
            <div className="label">stages mapped</div>
          </div>
          <div className="stat">
            <div className="value">{days(p.friction.totalElapsedMinutes)}</div>
            <div className="label">total elapsed</div>
          </div>
          <div className="stat">
            <div className="value">{days(p.friction.totalWorkMinutes)}</div>
            <div className="label">hands-on work</div>
          </div>
          <div className="stat">
            <div className="value">
              {p.waitShare === null ? '—' : `${Math.round(p.waitShare * 100)}%`}
            </div>
            <div className="label">spent waiting</div>
          </div>
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Longest waits</th>
                <th className="num">Wait</th>
              </tr>
            </thead>
            <tbody>
              {p.friction.largestWaits.map((point) => (
                <tr key={point.stageId}>
                  <td>{point.stageName}</td>
                  <td className="num">{days(point.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">
          The gap between elapsed time and hands-on work is the finding. Automating the work does
          nothing for a cycle that is mostly queue.
        </p>
      </section>

      <section>
        <p className="kicker">§11 — Scoring engine</p>
        <h2>Scored portfolio</h2>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Opportunity</th>
                <th>Owner</th>
                <th>KPI</th>
                <th className="num">Score</th>
                <th>Band</th>
              </tr>
            </thead>
            <tbody>
              {p.opportunities.map((o) => (
                <tr key={o.name}>
                  <td>{o.name}</td>
                  <td>{o.ownerRole ?? '—'}</td>
                  <td>{o.kpi ?? '—'}</td>
                  <td className="num">
                    {o.priorityScore.toFixed(2)}
                    <div className="bar">
                      <span style={{ width: `${(o.priorityScore / topScore) * 100}%` }} />
                    </div>
                  </td>
                  <td>
                    <Band band={o.priorityBand} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {blocked && (
          <p className="note">
            <strong>{blocked.name}</strong> scores {blocked.priorityScore.toFixed(2)} — higher than
            two backlog items — and is still blocked. A hard stop overrides the ranking entirely
            (§11.5). That is the behaviour, not a bug.
          </p>
        )}
      </section>

      {blocked && blocked.hardStops.length > 0 && (
        <section>
          <p className="kicker">§11.6 — Hard stops</p>
          <h2>Why “{blocked.name}” cannot proceed</h2>
          {blocked.hardStops.map((stop) => (
            <div className="stop" key={stop.code}>
              <code>{stop.code}</code>
              <p>{stop.reason}</p>
              <p className="resolution">Clears when: {stop.resolution}</p>
            </div>
          ))}
        </section>
      )}

      {winner && (
        <section>
          <p className="kicker">§11.1 — Recommendation</p>
          <h2>{winner.name}</h2>
          <p className="tagline">{winner.outcome}</p>
          <div className="stats">
            <div className="stat">
              <div className="value">{winner.rawScore}</div>
              <div className="label">raw score / 100</div>
            </div>
            <div className="stat">
              <div className="value">{winner.confidenceScore}</div>
              <div className="label">confidence</div>
            </div>
            <div className="stat">
              <div className="value">×{winner.confidenceMultiplier}</div>
              <div className="label">multiplier</div>
            </div>
            <div className="stat">
              <div className="value">{winner.priorityScore.toFixed(2)}</div>
              <div className="label">priority score</div>
            </div>
          </div>
          <p className="kicker">Human gates</p>
          <ul className="gates">
            {winner.humanGates.length > 0 ? (
              winner.humanGates.map((gate) => <li key={gate}>{gate}</li>)
            ) : (
              <li>None recorded</li>
            )}
          </ul>
          <p className="note">
            No model produced any number on this page. §20.2 forbids it, and the scoring package has
            no model dependency at all.
          </p>
        </section>
      )}

      <section>
        <p className="kicker">§12 — Business case</p>
        <h2>Base scenario</h2>
        <div className="stats">
          <div className="stat">
            <div className="value">{p.baseCase.annualHoursSaved ?? '—'}</div>
            <div className="label">hours released / year</div>
          </div>
          <div className="stat">
            <div className="value">{money(p.baseCase.annualGrossValue, p.currency)}</div>
            <div className="label">annual gross value</div>
          </div>
          <div className="stat">
            <div className="value">{money(p.baseCase.yearOneNetValue, p.currency)}</div>
            <div className="label">year-one net</div>
          </div>
          <div className="stat">
            <div className="value">
              {p.baseCase.paybackMonths === null ? '—' : `${p.baseCase.paybackMonths} mo`}
            </div>
            <div className="label">payback</div>
          </div>
        </div>
        <p className="kicker">A candidate with no cost data</p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Figure</th>
                <th className="num">Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Annual hours saved</td>
                <td className="num">{p.incompleteCase.annualHoursSaved ?? '—'}</td>
              </tr>
              <tr>
                <td>Annual gross value</td>
                <td className="num">{money(p.incompleteCase.annualGrossValue, p.currency)}</td>
              </tr>
              <tr>
                <td>Payback</td>
                <td className="num">
                  {p.incompleteCase.paybackMonths === null
                    ? 'not shown'
                    : `${p.incompleteCase.paybackMonths} mo`}
                </td>
              </tr>
              <tr>
                <td>Waiting on</td>
                <td className="num">{p.incompleteCase.missingInputs.join(', ')}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="note">
          Missing inputs stay missing. The business case returns null and records what it is waiting
          on — it never estimates, and it never shows a payback that does not exist (§12.1).
        </p>
      </section>

      <footer>
        Every figure above was computed by the domain packages on this machine. Run{' '}
        <code>pnpm demo</code> for the same output in a terminal, or <code>pnpm test</code> for the
        304 unit tests behind it. Authentication and evidence upload are not built yet — see the
        README.
      </footer>
    </main>
  );
}
